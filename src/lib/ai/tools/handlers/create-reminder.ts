import type { ToolContext, ToolOutcome } from "../executor";
import { matchTask, matchRoutine } from "../fuzzy";
import { getCurrentWorkspaceId, appendToWorkspaceOrder } from "../workspace-helpers";

export async function createReminder(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const title = String(args.title ?? "");
  const remind_at = String(args.remind_at ?? "");
  if (!title || !remind_at) return { ok: false, message: "title and remind_at required" };

  let linked_task_id: string | null = null;
  let linked_routine_id: string | null = null;
  if (args.linked_task_description) {
    const m = await matchTask(ctx.supabase, ctx.userId, String(args.linked_task_description));
    linked_task_id = m?.id ?? null;
  }
  if (args.linked_routine_description) {
    const m = await matchRoutine(ctx.supabase, ctx.userId, String(args.linked_routine_description));
    linked_routine_id = m?.id ?? null;
  }

  const workspaceId = await getCurrentWorkspaceId(ctx.supabase, ctx.userId);

  const { data, error } = await ctx.supabase.from("reminders").insert({
    user_id: ctx.userId,
    title,
    remind_at,
    is_recurring: Boolean(args.is_recurring),
    recurrence_rule: args.recurrence_rule ? String(args.recurrence_rule) : null,
    linked_task_id,
    linked_routine_id,
    workspace_id: workspaceId,
  }).select().single();

  if (error || !data) return { ok: false, message: error?.message ?? "insert failed" };

  if (workspaceId) {
    await appendToWorkspaceOrder(ctx.supabase, workspaceId, "reminder", data.id);
  }

  return {
    ok: true,
    message: `Reminder set for ${new Date(remind_at).toLocaleString()}`,
    cardKind: "reminder",
    card: { id: data.id, title, remind_at, is_recurring: data.is_recurring, workspaceId },
  };
}
