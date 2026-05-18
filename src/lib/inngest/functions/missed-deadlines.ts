import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/service";

// Hourly: flip overdue pending tasks to "missed" and emit events.
export const missedDeadlines = inngest.createFunction(
  { id: "missed-deadlines", triggers: [{ cron: "0 * * * *" }] },
  async ({ step }) => {
    const overdue = await step.run("find-overdue", async () => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("tasks")
        .select("id, user_id, title")
        .lt("due_at", new Date().toISOString())
        .in("status", ["pending", "in_progress"])
        .limit(500);
      if (error) throw new Error(error.message);
      return data ?? [];
    });

    if (overdue.length === 0) return { missed: 0 };

    await step.run("mark-missed", async () => {
      const supabase = createServiceClient();
      const ids = overdue.map((t) => t.id);
      const { error } = await supabase
        .from("tasks")
        .update({ status: "missed" })
        .in("id", ids);
      if (error) throw new Error(error.message);
    });

    await step.sendEvent(
      "emit-missed",
      overdue.map((t) => ({
        name: "task.missed" as const,
        data: { userId: t.user_id, taskId: t.id, title: t.title },
      }))
    );

    return { missed: overdue.length };
  }
);
