import type { ToolContext, ToolOutcome } from "../executor";
import { matchTask } from "../fuzzy";

export async function completeTask(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  let taskId = args.task_id ? String(args.task_id) : null;
  let title: string | null = null;

  if (!taskId && args.task_description) {
    const match = await matchTask(ctx.supabase, ctx.userId, String(args.task_description));
    if (!match) return { ok: false, message: `No matching task for "${args.task_description}". Ask the user to clarify.` };
    taskId = match.id;
    title = match.title;
  }
  if (!taskId) return { ok: false, message: "task_id or task_description required" };

  const { data, error } = await ctx.supabase
    .from("tasks")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("user_id", ctx.userId)
    .select()
    .single();

  if (error || !data) return { ok: false, message: error?.message ?? "update failed" };

  return {
    ok: true,
    message: `Completed: ${title ?? data.title}`,
    cardKind: "task",
    card: { id: data.id, title: data.title, priority: data.priority, status: "completed" },
  };
}
