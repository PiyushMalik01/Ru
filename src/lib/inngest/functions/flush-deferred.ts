import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/service";
import { getPrefs } from "@/lib/notifications/prefs";
import { deliverPush } from "@/lib/notifications/channels/push";
import { deliverEmail } from "@/lib/notifications/channels/email";
import type { DispatchInput, NotificationChannel } from "@/lib/notifications/types";

// Every 5 minutes: flush notifications whose quiet-hours deferral has expired.
// Push / email get delivered with the body that was phrased and stored at
// dispatch time. The in-app row already exists, so we don't re-insert — we
// just merge the newly fired channels into the existing `channels` map and
// clear the deferral fields.
//
// Why 5 minutes: quiet-end is typically aligned to the top of an hour, so
// a tight loop here keeps lag bounded even on Inngest cold starts.
export const flushDeferred = inngest.createFunction(
  { id: "flush-deferred-notifications", triggers: [{ cron: "*/5 * * * *" }] },
  async ({ step }) => {
    const due = await step.run("find-deferred", async () => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("notifications")
        .select("id, user_id, kind, title, body, url, entity_kind, entity_id, channels, deferred_channels")
        .lte("deferred_until", new Date().toISOString())
        .not("deferred_until", "is", null)
        .is("archived_at", null)
        .limit(500);
      if (error) throw new Error(error.message);
      return data ?? [];
    });

    if (due.length === 0) return { flushed: 0 };

    let flushed = 0;
    for (const row of due) {
      await step.run(`flush-${row.id}`, async () => {
        const supabase = createServiceClient();
        const wanted = (row.deferred_channels ?? {}) as Partial<Record<NotificationChannel, boolean>>;
        const prefs = await getPrefs(row.user_id);
        if (!prefs) return;

        const dispatchInput: DispatchInput = {
          userId: row.user_id,
          kind: row.kind,
          title: row.title,
          body: row.body ?? undefined,
          url: row.url ?? undefined,
          entityKind: row.entity_kind ?? undefined,
          entityId: row.entity_id ?? undefined,
        };

        const fired: NotificationChannel[] = [];
        const tasks: Promise<unknown>[] = [];
        if (wanted.push) {
          tasks.push(deliverPush(dispatchInput).then((ok) => { if (ok) fired.push("push"); }));
        }
        if (wanted.email && prefs.emailAddress) {
          tasks.push(deliverEmail(dispatchInput, prefs.emailAddress).then((ok) => { if (ok) fired.push("email"); }));
        }
        await Promise.all(tasks);

        // Merge fired channels into the existing row's channels map and clear
        // deferral so it isn't picked up again. Stale-but-fresh races are
        // fine — if anything double-checks, the channels map is idempotent.
        const existing = (row.channels ?? {}) as Partial<Record<NotificationChannel, boolean>>;
        for (const c of fired) existing[c] = true;
        const { error } = await supabase
          .from("notifications")
          .update({
            channels: existing,
            deferred_until: null,
            deferred_channels: null,
          })
          .eq("id", row.id);
        if (error) {
          console.error(`[flush-deferred] update failed for ${row.id}`, error);
          return;
        }
        flushed++;
      });
    }

    return { flushed };
  },
);
