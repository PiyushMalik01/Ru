// Server-side queries for the chat sidebar.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export interface ChatSummary {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
}

export async function listChats(supabase: Supabase, userId: string): Promise<ChatSummary[]> {
  const { data } = await supabase
    .from("chats")
    .select("id, title, updated_at, created_at")
    .eq("user_id", userId)
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

export async function fetchChat(
  supabase: Supabase,
  userId: string,
  chatId: string
): Promise<{ id: string; title: string } | null> {
  const { data } = await supabase
    .from("chats")
    .select("id, title")
    .eq("id", chatId)
    .eq("user_id", userId)
    .single();
  return data;
}

export async function fetchChatMessages(
  supabase: Supabase,
  userId: string,
  chatId: string
): Promise<{ id: string; role: "user" | "assistant"; content: string; created_at: string }[]> {
  const { data } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("user_id", userId)
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .limit(500);
  return data ?? [];
}

/**
 * Pick a chat to show when the user lands on /chat with no specific id.
 * Returns the most-recently-updated non-archived chat, or null if none exist.
 */
export async function pickLandingChat(
  supabase: Supabase,
  userId: string
): Promise<{ id: string; title: string } | null> {
  // Prefer the user's pinned current_chat_id if it's still valid.
  const { data: profile } = await supabase
    .from("profiles")
    .select("current_chat_id")
    .eq("id", userId)
    .single();
  if (profile?.current_chat_id) {
    const { data: pinned } = await supabase
      .from("chats")
      .select("id, title")
      .eq("id", profile.current_chat_id)
      .eq("user_id", userId)
      .eq("archived", false)
      .maybeSingle();
    if (pinned) return pinned;
  }

  const { data: latest } = await supabase
    .from("chats")
    .select("id, title")
    .eq("user_id", userId)
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return latest;
}
