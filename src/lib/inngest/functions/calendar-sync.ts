import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/service";
import { syncFromGoogle, dispatchUpcomingNotifications } from "@/lib/google/calendar-sync";

/**
 * Every 30 minutes: for each user with `calendar_sync_enabled`, pull the next
 * 30 days of events into the local cache, then fire `calendar_event_soon`
 * notifications for anything starting in the 30–45 minute window. We wrap
 * each user in `step.run` so a single failure doesn't poison the whole sweep
 * and Inngest can retry per-user independently.
 */
export const calendarSync = inngest.createFunction(
  {
    id: "calendar-sync",
    concurrency: { limit: 10 },
    triggers: [{ cron: "*/30 * * * *" }],
  },
  async ({ step }) => {
    const users = await step.run("load-enabled-users", async () => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("google_integrations")
        .select("user_id")
        .eq("calendar_sync_enabled", true);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => r.user_id);
    });

    let synced = 0;
    let notified = 0;
    const errors: string[] = [];

    for (const userId of users) {
      try {
        const syncResult = await step.run(`sync-${userId}`, () => syncFromGoogle(userId));
        synced += syncResult.count;
        const notif = await step.run(`notify-${userId}`, () =>
          dispatchUpcomingNotifications(userId),
        );
        notified += notif.fired;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${userId}: ${msg}`);
      }
    }

    return { users: users.length, synced, notified, errors };
  },
);
