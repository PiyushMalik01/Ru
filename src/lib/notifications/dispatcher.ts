import { createServiceClient } from "@/lib/supabase/service";
import { getPrefs, inQuietHours, nextQuietEnd } from "./prefs";
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

  // Three sets of channels:
  //   targets — what would have fired if we weren't in quiet hours
  //   liveTargets — what actually fires NOW (in_app + push/email when not quiet)
  //   deferredTargets — what defers to the end of quiet hours (push/email)
  // forceChannels overrides prefs entirely but still respects quiet hours.
  const targets = new Set<NotificationChannel>();
  const forced = input.forceChannels;
  if (forced) {
    forced.forEach((c) => targets.add(c));
  } else {
    if (prefs.inappEnabled) targets.add("in_app");
    if (prefs.pushEnabled) targets.add("push");
    if (prefs.emailEnabled && shouldEmail(input.kind)) targets.add("email");
  }

  const liveTargets = new Set<NotificationChannel>();
  const deferredTargets = new Set<NotificationChannel>();
  for (const c of targets) {
    // in_app always fires live — it's silent, just shows up in the inbox.
    if (c === "in_app") {
      liveTargets.add(c);
      continue;
    }
    // push/email defer if quiet, fire if not.
    if (quiet) {
      deferredTargets.add(c);
    } else {
      liveTargets.add(c);
    }
  }

  // Phrase the body in Ru's voice ONCE, before any channel sends. All
  // channels (push, email, in-app) use the same phrased body so the user
  // sees consistent copy whether they read it in the inbox or get it
  // pushed later. We skip the LLM call for `daily_digest` because the
  // digest cron composes its own structured body.
  let phrasedInput = input;
  if (input.kind !== "daily_digest" && (liveTargets.size > 0 || deferredTargets.size > 0)) {
    const body = await phraseNotification({
      kind: input.kind,
      title: input.title,
      fallbackBody: input.body ?? null,
      data: { entityKind: input.entityKind, entityId: input.entityId },
    });
    phrasedInput = { ...input, body };
  }

  const fired: NotificationChannel[] = [];

  // Fire live push & email in parallel; in-app insert is last so it can
  // record the channels that fired AND the channels that are deferred.
  const tasks: Promise<unknown>[] = [];
  if (liveTargets.has("push")) {
    tasks.push(deliverPush(phrasedInput).then((ok) => { if (ok) fired.push("push"); }));
  }
  if (liveTargets.has("email") && prefs.emailAddress) {
    tasks.push(deliverEmail(phrasedInput, prefs.emailAddress).then((ok) => { if (ok) fired.push("email"); }));
  }
  await Promise.all(tasks);

  let notificationId: string | null = null;
  if (liveTargets.has("in_app")) {
    const deferredUntil = deferredTargets.size > 0 ? nextQuietEnd(prefs) : null;
    const deferredChannels = deferredTargets.size > 0
      ? Object.fromEntries([...deferredTargets].map((c) => [c, true]))
      : null;
    notificationId = await deliverInApp(phrasedInput, {
      channelsFired: [...fired, "in_app"],
      deferredUntil,
      deferredChannels,
    });
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
