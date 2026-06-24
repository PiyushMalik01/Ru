import { createServiceClient } from "@/lib/supabase/service";
import { getPrefs, inQuietHours } from "./prefs";
import { deliverInApp } from "./channels/inapp";
import { deliverPush } from "./channels/push";
import { deliverEmail } from "./channels/email";
import { phraseNotification } from "./phraser";
import type { DispatchInput, NotificationChannel } from "./types";

/**
 * The single entry point for all platform notifications. Reads the user's
 * channel prefs, applies quiet-hours filtering, fans out to enabled channels,
 * and records what fired into the `notifications` row so the inbox reflects
 * truth.
 *
 * Dedup: pass `dedupTag` to skip if a notification with that tag was created
 * in the last hour. Used to stop duplicate "task overdue" pings on cron loops.
 */
export async function dispatch(input: DispatchInput): Promise<{ notificationId: string | null; channels: NotificationChannel[] }> {
  // Dedup window
  if (input.dedupTag) {
    const supabase = createServiceClient();
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: dup } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", input.userId)
      .eq("kind", input.kind)
      .eq("entity_id", input.entityId ?? "00000000-0000-0000-0000-000000000000")
      .gte("created_at", cutoff)
      .limit(1)
      .maybeSingle();
    if (dup) return { notificationId: dup.id, channels: [] };
  }

  const prefs = await getPrefs(input.userId);
  if (!prefs) return { notificationId: null, channels: [] };

  const quiet = !input.bypassQuietHours && inQuietHours(prefs);

  // Decide which channels to fire. forceChannels overrides prefs entirely
  // but still respects quiet hours unless bypassQuietHours is set.
  const targets = new Set<NotificationChannel>();
  const forced = input.forceChannels;
  if (forced) {
    forced.forEach((c) => targets.add(c));
  } else {
    if (prefs.inappEnabled) targets.add("in_app");
    if (prefs.pushEnabled && !quiet) targets.add("push");
    if (prefs.emailEnabled && !quiet && shouldEmail(input.kind)) targets.add("email");
  }

  // Phrase the body in Ru's voice ONCE, before any channel sends. All
  // channels (push, email, in-app) use the same phrased body so the user
  // sees consistent copy whether they read it in the inbox or in their
  // inbox-folder. We skip the LLM call entirely for `daily_digest` because
  // the digest cron composes its own structured body.
  let phrasedInput = input;
  if (input.kind !== "daily_digest" && targets.size > 0) {
    const body = await phraseNotification({
      kind: input.kind,
      title: input.title,
      fallbackBody: input.body ?? null,
      data: { entityKind: input.entityKind, entityId: input.entityId },
    });
    phrasedInput = { ...input, body };
  }

  const fired: NotificationChannel[] = [];

  // Fire push & email in parallel; do in-app last so we record truth.
  const tasks: Promise<unknown>[] = [];
  if (targets.has("push")) {
    tasks.push(deliverPush(phrasedInput).then((ok) => { if (ok) fired.push("push"); }));
  }
  if (targets.has("email") && prefs.emailAddress) {
    tasks.push(deliverEmail(phrasedInput, prefs.emailAddress).then((ok) => { if (ok) fired.push("email"); }));
  }
  await Promise.all(tasks);

  let notificationId: string | null = null;
  if (targets.has("in_app")) {
    notificationId = await deliverInApp(phrasedInput, [...fired, "in_app"]);
    fired.push("in_app");
  }

  return { notificationId, channels: fired };
}

/**
 * Conservative email filter — some kinds are too high-frequency for email
 * by default (e.g. urgent suggestions can fire a few times a day). User can
 * still toggle email off entirely in prefs.
 */
function shouldEmail(kind: DispatchInput["kind"]): boolean {
  switch (kind) {
    case "reminder_due":
    case "task_overdue":
    case "daily_digest":
    case "gmail_extracted":
    case "calendar_event_soon":
    case "plan_deadline":
      return true;
    case "task_due_soon":
    case "routine_missed":
    case "streak_milestone":
    case "suggestion_urgent":
    case "system":
      return false;
    default:
      return false;
  }
}
