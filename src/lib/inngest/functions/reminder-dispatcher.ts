import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/service";

// Every 5 minutes: find pending reminders that are due, fan out events, mark sent.
export const reminderDispatcher = inngest.createFunction(
  { id: "reminder-dispatcher", triggers: [{ cron: "*/5 * * * *" }] },
  async ({ step }) => {
    const due = await step.run("find-due-reminders", async () => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("reminders")
        .select("id, user_id, title")
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

    await step.run("mark-sent", async () => {
      const supabase = createServiceClient();
      const ids = due.map((r) => r.id);
      const { error } = await supabase
        .from("reminders")
        .update({ status: "sent" })
        .in("id", ids);
      if (error) throw new Error(error.message);
    });

    return { dispatched: due.length };
  }
);
