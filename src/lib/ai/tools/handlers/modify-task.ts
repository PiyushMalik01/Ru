import type { ToolContext, ToolOutcome } from "../executor";
import { matchTask } from "../fuzzy";

export async function modifyTask(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  let taskId = args.task_id ? String(args.task_id) : null;
  if (!taskId && args.task_description) {
    const match = await matchTask(ctx.supabase, ctx.userId, String(args.task_description));
    if (!match) return { ok: false, message: `No matching task for "${args.task_description}"` };
    taskId = match.id;
  }
  if (!taskId) return { ok: false, message: "task_id or task_description required" };

  const updates = (args.updates as Record<string, unknown>) ?? {};
  if (Object.keys(updates).length === 0) return { ok: false, message: "no updates given" };

  const { data, error } = await ctx.supabase
    .from("tasks")
    .update(updates as never)
    .eq("id", taskId)
    .eq("user_id", ctx.userId)
    .select()
    .single();

  if (error || !data) return { ok: false, message: error?.message ?? "update failed" };

  return {
    ok: true,
    message: `Updated task: ${data.title}`,
    cardKind: "task",
    card: { id: data.id, title: data.title, priority: data.priority, status: data.status, due_at: data.due_at },
  };
}
