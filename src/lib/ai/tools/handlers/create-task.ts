import type { ToolContext, ToolOutcome } from "../executor";

export async function createTask(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const title = String(args.title ?? "");
  const description = args.description ? String(args.description) : null;
  const priority = (args.priority as "low" | "medium" | "high") ?? "medium";
  const due_at = args.due_at ? String(args.due_at) : null;
  const tags = Array.isArray(args.tags) ? (args.tags as string[]) : [];
  if (!title) return { ok: false, message: "title is required" };

  const { data, error } = await ctx.supabase.from("tasks").insert({
    user_id: ctx.userId,
    title,
    description,
    priority,
    due_at,
    tags,
    source_message_id: ctx.messageId,
  }).select().single();

  if (error || !data) return { ok: false, message: error?.message ?? "insert failed" };

  return {
    ok: true,
    message: `Task created: ${title}`,
    cardKind: "task",
    card: { id: data.id, title, priority, due_at, status: data.status },
  };
}
