import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/service";
import { dispatch } from "@/lib/notifications";

/**
 * Every 15 minutes: find tasks due in the next ~60 minutes that the user
 * hasn't yet been warned about. Dispatch a `task_due_soon` notification.
 * Dedup is handled by the dispatcher (1-hour window keyed on entity_id).
 */
export const taskDueSoon = inngest.createFunction(
  { id: "task-due-soon", triggers: [{ cron: "*/15 * * * *" }] },
  async ({ step }) => {
    const due = await step.run("find-due-soon", async () => {
      const supabase = createServiceClient();
      const now = Date.now();
      const { data, error } = await supabase
        .from("tasks")
        .select("id, user_id, title, due_at")
        .gte("due_at", new Date(now).toISOString())
        .lte("due_at", new Date(now + 60 * 60 * 1000).toISOString())
        .in("status", ["pending", "in_progress"])
        .limit(500);
      if (error) throw new Error(error.message);
      return data ?? [];
    });

    if (due.length === 0) return { dispatched: 0 };

    let count = 0;
    for (const t of due) {
      await step.run(`dispatch-${t.id}`, async () => {
        const result = await dispatch({
          userId: t.user_id,
          kind: "task_due_soon",
          title: t.title,
          body: "Due within the hour.",
          url: "/sheet",
          entityKind: "task",
          entityId: t.id,
          dedupTag: `task_due_soon:${t.id}`,
        });
        if (result.channels.length > 0) count++;
      });
    }

    return { dispatched: count };
  }
);
