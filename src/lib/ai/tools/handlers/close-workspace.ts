import type { ToolContext, ToolOutcome } from "../executor";

export async function closeWorkspace(
  _args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolOutcome> {
  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", ctx.userId)
    .single();

  if (!profile?.current_workspace_id) {
    return { ok: true, message: "No workspace was open." };
  }

  const { error } = await ctx.supabase
    .from("profiles")
    .update({ current_workspace_id: null })
    .eq("id", ctx.userId);
  if (error) return { ok: false, message: error.message };

  return { ok: true, message: "Closed the workspace." };
}
