import { revalidatePath } from "next/cache";
import type { ToolContext, ToolOutcome } from "../executor";

/**
 * Find a chat by id, exact title, or fuzzy contains. "current" / "this chat"
 * resolves to the user's pinned current_chat_id from profile.
 */
async function findChat(
  ctx: ToolContext,
  hint: string,
): Promise<{ id: string; title: string } | null> {
  const h = hint.trim();
  if (!h) return null;

  if (h.toLowerCase() === "current" || h.toLowerCase() === "this" || h.toLowerCase() === "this chat") {
    const { data: prof } = await ctx.supabase
      .from("profiles")
      .select("current_chat_id")
      .eq("id", ctx.userId)
      .single();
    if (prof?.current_chat_id) {
      const { data } = await ctx.supabase
        .from("chats")
        .select("id, title")
        .eq("id", prof.current_chat_id)
        .eq("user_id", ctx.userId)
        .maybeSingle();
      if (data) return data;
    }
    return null;
  }

  if (/^[0-9a-f-]{36}$/i.test(h)) {
    const { data } = await ctx.supabase
      .from("chats")
      .select("id, title")
      .eq("user_id", ctx.userId)
      .eq("id", h)
      .maybeSingle();
    if (data) return data;
  }

  const { data } = await ctx.supabase
    .from("chats")
    .select("id, title")
    .eq("user_id", ctx.userId)
    .eq("archived", false)
    .ilike("title", `%${h}%`)
    .order("updated_at", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

export async function renameChat(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const hint = String(args.chat ?? args.chat_id ?? args.chat_description ?? "current");
  const newTitle = String(args.new_title ?? "").trim();
  if (!newTitle) return { ok: false, message: "new_title required" };

  const chat = await findChat(ctx, hint);
  if (!chat) return { ok: false, message: `No matching chat for "${hint}".` };

  const { error } = await ctx.supabase
    .from("chats")
    .update({ title: newTitle, updated_at: new Date().toISOString() })
    .eq("id", chat.id)
    .eq("user_id", ctx.userId);
  if (error) return { ok: false, message: error.message };

  try { revalidatePath("/chat"); revalidatePath(`/chat/${chat.id}`); } catch {}

  return { ok: true, message: `Renamed chat: "${chat.title}" → "${newTitle}"` };
}

export async function archiveChat(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const hint = String(args.chat ?? args.chat_id ?? args.chat_description ?? "current");
  const chat = await findChat(ctx, hint);
  if (!chat) return { ok: false, message: `No matching chat for "${hint}".` };

  const { error } = await ctx.supabase
    .from("chats")
    .update({ archived: true, updated_at: new Date().toISOString() })
    .eq("id", chat.id)
    .eq("user_id", ctx.userId);
  if (error) return { ok: false, message: error.message };

  try { revalidatePath("/chat"); } catch {}

  return { ok: true, message: `Archived chat: ${chat.title}` };
}
