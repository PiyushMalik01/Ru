import { revalidatePath } from "next/cache";
import type { ToolContext, ToolOutcome } from "../executor";

/**
 * Look up a workspace (plan) by id or by fuzzy title contains. Restricted to
 * non-archived rows unless the caller explicitly asks for an archived one
 * via the `include_archived` arg (used by restore actions).
 */
async function findWorkspace(
  ctx: ToolContext,
  hint: string,
  opts: { includeArchived?: boolean } = {},
): Promise<{ id: string; title: string; archived: boolean } | null> {
  const h = hint.trim();
  if (!h) return null;

  if (/^[0-9a-f-]{36}$/i.test(h)) {
    const { data } = await ctx.supabase
      .from("workspaces")
      .select("id, title, archived")
      .eq("user_id", ctx.userId)
      .eq("id", h)
      .maybeSingle();
    if (data) return data;
  }

  const q = ctx.supabase
    .from("workspaces")
    .select("id, title, archived")
    .eq("user_id", ctx.userId)
    .ilike("title", `%${h}%`)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (!opts.includeArchived) q.eq("archived", false);
  const { data } = await q;
  return data?.[0] ?? null;
}

export async function renameWorkspace(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const hint = String(args.workspace ?? args.workspace_id ?? args.workspace_description ?? "");
  const newTitle = String(args.new_title ?? "").trim();
  if (!newTitle) return { ok: false, message: "new_title required" };

  const ws = await findWorkspace(ctx, hint);
  if (!ws) return { ok: false, message: `No matching plan for "${hint}".` };

  const { error } = await ctx.supabase
    .from("workspaces")
    .update({ title: newTitle, updated_at: new Date().toISOString() })
    .eq("id", ws.id)
    .eq("user_id", ctx.userId);
  if (error) return { ok: false, message: error.message };

  try {
    revalidatePath("/plans");
    revalidatePath(`/plans/${ws.id}`);
  } catch {}

  return { ok: true, message: `Renamed plan: "${ws.title}" → "${newTitle}"` };
}

export async function archiveWorkspace(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const hint = String(args.workspace ?? args.workspace_id ?? args.workspace_description ?? "");
  const ws = await findWorkspace(ctx, hint);
  if (!ws) return { ok: false, message: `No matching plan for "${hint}".` };

  const { error } = await ctx.supabase
    .from("workspaces")
    .update({ archived: true, updated_at: new Date().toISOString() })
    .eq("id", ws.id)
    .eq("user_id", ctx.userId);
  if (error) return { ok: false, message: error.message };

  try {
    revalidatePath("/plans");
  } catch {}

  return { ok: true, message: `Archived plan: ${ws.title}` };
}
