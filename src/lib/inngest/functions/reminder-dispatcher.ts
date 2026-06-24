import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/service";
import { nextRecurrence } from "@/lib/notifications/recurrence";

// Every 5 minutes: find pending reminders that are due, fan out events.
// One-shot reminders get marked `sent`. Recurring reminders get their
// `remind_at` advanced to the next occurrence and stay `pending` so the next
// cron tick picks them up at the right time.
export const reminderDispatcher = inngest.createFunction(
  { id: "reminder-dispatcher", triggers: [{ cron: "*/5 * * * *" }] },
  async ({ step }) => {
    const due = await step.run("find-due-reminders", async () => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("reminders")
        .select("id, user_id, title, remind_at, is_recurring, recurrence_rule")
        .lte("remind_at", new Date().toISOString())
        .eq("status", "pending")
        .is("archived_at", null)
        .limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    });

    if (due.length === 0) return { dispatched: 0 };

    await step.sendEvent(
      "fire-reminders",
      due.map((r) => ({
        name: "reminder.fire" as const,
        data: { userId: r.user_id, reminderId: r.id, title: r.title },
      }))
    );

    await step.run("settle-reminders", async () => {
      const supabase = createServiceClient();

      // Split into one-shot and recurring. Recurring ones with a parseable
      // rule get their next occurrence scheduled. Anything else (no rule, or
      // a rule we can't parse) falls through to one-shot — safer than silently
      // dropping a missed-occurrence on a broken rule.
      const oneShotIds: string[] = [];
      type Reschedule = { id: string; remind_at: string };
      const reschedule: Reschedule[] = [];

      for (const r of due) {
        if (r.is_recurring && r.recurrence_rule) {
          const next = nextRecurrence(new Date(r.remind_at), r.recurrence_rule);
          if (next) {
            reschedule.push({ id: r.id, remind_at: next.toISOString() });
            continue;
          }
        }
        oneShotIds.push(r.id);
      }

      if (oneShotIds.length > 0) {
        const { error } = await supabase
          .from("reminders")
          .update({ status: "sent" })
          .in("id", oneShotIds);
        if (error) throw new Error(`mark-sent: ${error.message}`);
      }

      // Update each recurring one individually — different remind_at per row
      // so we can't batch. Real reminder volume is tiny per tick.
      for (const r of reschedule) {
        const { error } = await supabase
          .from("reminders")
          .update({ remind_at: r.remind_at })
          .eq("id", r.id);
        if (error) throw new Error(`reschedule ${r.id}: ${error.message}`);
      }
    });

    return { dispatched: due.length };
  }
);
