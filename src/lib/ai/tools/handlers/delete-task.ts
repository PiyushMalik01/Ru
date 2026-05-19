import type { ToolContext, ToolOutcome } from "../executor";
import { matchTask } from "../fuzzy";

export async function deleteTask(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  let taskId = args.task_id ? String(args.task_id) : null;
  let title: string | null = null;

  if (!taskId && args.task_description) {
    // matchTask only matches PENDING tasks. Fall back to a broader lookup if
    // the user is asking to delete an already-completed/missed one.
    const match = await matchTask(ctx.supabase, ctx.userId, String(args.task_description));
    if (match) {
      taskId = match.id;
      title = match.title;
    } else {
      const { data } = await ctx.supabase
        .from("tasks")
        .select("id, title")
        .eq("user_id", ctx.userId)
        .ilike("title", `%${args.task_description}%`)
        .order("created_at", { ascending: false })
        .limit(1);
      if (data?.[0]) {
        taskId = data[0].id;
        title = data[0].title;
      }
    }
  }
  if (!taskId) return { ok: false, message: "task_id or task_description required" };

  const { error } = await ctx.supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .eq("user_id", ctx.userId);
  if (error) return { ok: false, message: error.message };

  return { ok: true, message: `Deleted task: ${title ?? taskId}` };
}
