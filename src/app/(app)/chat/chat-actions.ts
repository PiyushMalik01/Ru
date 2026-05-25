"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createChat(): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };

  const { data, error } = await supabase
    .from("chats")
    .insert({ user_id: user.id, title: "New chat" })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "could not create chat" };

  // Clear current_workspace_id too — a brand-new chat must NOT inherit
  // the previous chat's "current workspace" (otherwise tasks/routines/
  // reminders created in the new chat auto-attach to a totally unrelated
  // workspace via tool handlers that read current_workspace_id). The
  // chat will call open_workspace itself if it ever wants one.
  await supabase
    .from("profiles")
    .update({ current_chat_id: data.id, current_workspace_id: null })
    .eq("id", user.id);

  revalidatePath("/chat");
  return { id: data.id };
}

export async function startNewChat() {
  const result = await createChat();
  if (result.id) {
    redirect(`/chat/${result.id}`);
  }
}

export async function renameChat(chatId: string, title: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };
  const trimmed = title.trim().slice(0, 120);
  if (!trimmed) return { ok: false, error: "title required" };
  const { error } = await supabase
    .from("chats")
    .update({ title: trimmed })
    .eq("id", chatId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/chat");
  revalidatePath("/chat/[id]", "page");
  return { ok: true };
}

export async function deleteChat(chatId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  // Schema-side safety net (verified): messages.chat_id is ON DELETE CASCADE
  // and profiles.current_chat_id is ON DELETE SET NULL. The explicit clear
  // below is belt-and-suspenders so we don't depend on FK rules silently
  // changing in a future migration.
  const { data: profile } = await supabase
    .from("profiles")
    .select("current_chat_id")
    .eq("id", user.id)
    .single();
  if (profile?.current_chat_id === chatId) {
    await supabase.from("profiles").update({ current_chat_id: null }).eq("id", user.id);
  }

  const { error } = await supabase
    .from("chats")
    .delete()
    .eq("id", chatId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  // The sidebar lives on /chat/[id] (the dynamic segment), not on bare /chat.
  // Previously we only revalidated /chat — so the sidebar shown on a thread
  // page kept the deleted row visible until a hard reload, which read as
  // "delete is broken". revalidate both paths now.
  revalidatePath("/chat");
  revalidatePath("/chat/[id]", "page");
  return { ok: true };
}

export async function setCurrentChat(chatId: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("profiles").update({ current_chat_id: chatId }).eq("id", user.id);
}
