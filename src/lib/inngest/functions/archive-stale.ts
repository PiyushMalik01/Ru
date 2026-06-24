import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/service";
import { DEFAULT_POLICY } from "@/lib/time";

// Daily 3am UTC — soft-archive items that have aged out of the live UI:
//   • completed tasks       → completed > 14d ago
//   • missed tasks          → due_at > 30d ago
//   • pending/in_progress   → due_at > 90d ago (effectively forgotten)
//   • sent reminders        → remind_at > 14d ago
//   • dismissed reminders   → remind_at > 7d ago
//
// "Archive" here is a soft delete: archived_at is set, every default query
// filters those out, but the row stays for memory/audit purposes. A separate
// purge cron (not built yet) can hard-delete archived rows after 1 year.

export const archiveStale = inngest.createFunction(
  { id: "archive-stale", triggers: [{ cron: "0 3 * * *" }] },
  async ({ step }) => {
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    const policy = DEFAULT_POLICY;
    const stamp = now.toISOString();

    const completedCutoff = new Date(now.getTime() - policy.completedTaskArchiveDays * day).toISOString();
    const missedCutoff = new Date(now.getTime() - policy.missedTaskArchiveDays * day).toISOString();
    const ancientCutoff = new Date(now.getTime() - policy.taskAncientDays * day).toISOString();
    const sentCutoff = new Date(now.getTime() - policy.sentReminderArchiveDays * day).toISOString();
    const dismissedCutoff = new Date(now.getTime() - policy.dismissedReminderArchiveDays * day).toISOString();

    const tasksArchived = await step.run("archive-tasks", async () => {
      const supabase = createServiceClient();
      let total = 0;

      // Completed tasks that have been done long enough to fade.
      const { data: c, error: cErr } = await supabase
        .from("tasks")
        .update({ archived_at: stamp })
        .is("archived_at", null)
        .eq("status", "completed")
        .lt("completed_at", completedCutoff)
        .select("id");
      if (cErr) throw new Error(`completed: ${cErr.message}`);
      total += c?.length ?? 0;

      // Missed tasks that have aged past the recovery window.
      const { data: m, error: mErr } = await supabase
        .from("tasks")
        .update({ archived_at: stamp })
        .is("archived_at", null)
        .eq("status", "missed")
        .lt("due_at", missedCutoff)
        .select("id");
      if (mErr) throw new Error(`missed: ${mErr.message}`);
      total += m?.length ?? 0;

      // Pending/in_progress that are so far past due they're effectively gone.
      // We don't flip status — `missed-deadlines` already did — but if for some
      // reason it didn't (cron skipped, manual data), this catches them.
      const { data: a, error: aErr } = await supabase
        .from("tasks")
        .update({ archived_at: stamp })
        .is("archived_at", null)
        .in("status", ["pending", "in_progress"])
        .not("due_at", "is", null)
        .lt("due_at", ancientCutoff)
        .select("id");
      if (aErr) throw new Error(`ancient: ${aErr.message}`);
      total += a?.length ?? 0;

      return total;
    });

    const remindersArchived = await step.run("archive-reminders", async () => {
      const supabase = createServiceClient();
      let total = 0;

      const { data: s, error: sErr } = await supabase
        .from("reminders")
        .update({ archived_at: stamp })
        .is("archived_at", null)
        .eq("status", "sent")
        .lt("remind_at", sentCutoff)
        .select("id");
      if (sErr) throw new Error(`sent: ${sErr.message}`);
      total += s?.length ?? 0;

      const { data: d, error: dErr } = await supabase
        .from("reminders")
        .update({ archived_at: stamp })
        .is("archived_at", null)
        .eq("status", "dismissed")
        .lt("remind_at", dismissedCutoff)
        .select("id");
      if (dErr) throw new Error(`dismissed: ${dErr.message}`);
      total += d?.length ?? 0;

      return total;
    });

    return { tasksArchived, remindersArchived };
  }
);
