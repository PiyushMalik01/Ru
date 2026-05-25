import type { ToolContext, ToolOutcome } from "../executor";

export async function openWorkspace(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolOutcome> {
  const title = String(args.title ?? "").trim().slice(0, 120);
  const description = args.description ? String(args.description).trim().slice(0, 500) : null;
  const kind = String(args.kind ?? "plan");
  if (!title) return { ok: false, message: "title is required" };

  const { data: workspace, error } = await ctx.supabase
    .from("workspaces")
    .insert({
      user_id: ctx.userId,
      title,
      description,
      kind,
    })
    .select()
    .single();
  if (error || !workspace) return { ok: false, message: error?.message ?? "could not create workspace" };

  const { error: profileErr } = await ctx.supabase
    .from("profiles")
    .update({ current_workspace_id: workspace.id })
    .eq("id", ctx.userId);
  if (profileErr) return { ok: false, message: profileErr.message };

  // No chat card emitted — the workspace appears in the right panel
  // immediately on creation. A chat card duplicates that info and (until
  // we add a dedicated workspace card kind) misrenders through the
  // InsightCard fallback as a confusing "0 / title / THIS WEEK" block.
  return {
    ok: true,
    message: `Opened workspace: ${title}`,
  };
}
