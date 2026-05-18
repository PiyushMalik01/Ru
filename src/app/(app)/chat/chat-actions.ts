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

  await supabase
    .from("profiles")
    .update({ current_chat_id: data.id })
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
  return { ok: true };
}

export async function deleteChat(chatId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  // If this was the current chat, clear the pointer first
  const { data: profile } = await supabase
    .from("profiles")
    .select("current_chat_id")
    .eq("id", user.id)
    .single();
  if (profile?.current_chat_id === chatId) {
    await supabase.from("profiles").update({ current_chat_id: null }).eq("id", user.id);
  }

  // Cascade drops messages by FK on chat_id
  const { error } = await supabase
    .from("chats")
    .delete()
    .eq("id", chatId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/chat");
  return { ok: true };
}

export async function setCurrentChat(chatId: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("profiles").update({ current_chat_id: chatId }).eq("id", user.id);
}
