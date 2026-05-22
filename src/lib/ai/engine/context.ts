import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { NormalizedMessage } from "../types";
import { loadMemoryProfile, type MemoryProfile } from "@/lib/queries/memory";
import { buildSystemPrompt } from "./system-prompt";
import {
  buildVoicePersonaBlock,
  buildVoiceContextBlock,
  type VoiceContext,
} from "./voice-persona";

export async function assembleContext(opts: {
  supabase: SupabaseClient<Database>;
  userId: string;
  chatId: string;
  newUserMessage: string;
  voice?: boolean;
  voiceContext?: VoiceContext | null;
  pageHint?: string | null;
}): Promise<{ messages: NormalizedMessage[]; memoryProfile: MemoryProfile | null }> {
  const { supabase, userId, chatId, newUserMessage, voice, voiceContext, pageHint } = opts;

  // Pull this chat's history (most recent 60 messages — enough for continuity
  // without blowing token budgets). User-level state is fetched separately.
  const [profileRes, chatMessagesRes, summariesRes, routinesRes, tasksRes, memoryProfile] = await Promise.all([
    supabase.from("profiles").select("display_name, timezone").eq("id", userId).single(),
    supabase
      .from("messages")
      .select("role, content")
      .eq("user_id", userId)
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .limit(60),
    supabase
      .from("daily_summaries")
      .select("date, message_summary")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(7),
    supabase
      .from("routines")
      .select("title, frequency, time_of_day, nudge_level")
      .eq("user_id", userId)
      .eq("is_active", true),
    supabase
      .from("tasks")
      .select("title, priority, due_at, status")
      .eq("user_id", userId)
      .in("status", ["pending", "in_progress"])
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(20),
    loadMemoryProfile(supabase, userId),
  ]);

  const profile = profileRes.data;
  // Drop the newly inserted empty assistant placeholder from history if present
  const chatMessages = (chatMessagesRes.data ?? []).filter((m) => m.content && m.content.length > 0);
  const summaries = summariesRes.data ?? [];
  const routines = routinesRes.data ?? [];
  const tasks = tasksRes.data ?? [];

  const stateBlock = [
    summaries.length
      ? `Recent days:\n${[...summaries].reverse().map((s) => `- ${s.date}: ${s.message_summary ?? "(no summary)"}`).join("\n")}`
      : "",
    routines.length
      ? `Active routines:\n${routines.map((r) => `- ${r.title} (${r.frequency}${r.time_of_day ? `, ${r.time_of_day}` : ""})`).join("\n")}`
      : "No active routines yet.",
    tasks.length
      ? `Open tasks:\n${tasks.map((t) => `- [${t.priority}] ${t.title}${t.due_at ? ` (due ${t.due_at})` : ""}`).join("\n")}`
      : "No open tasks.",
  ]
    .filter(Boolean)
    .join("\n\n");

  // The new message at the bottom — we don't include it in chatMessages because
  // the API route inserts it before calling this, but its content matches
  // newUserMessage so we add it explicitly to make the seam obvious to the model.
  const historyMinusLast = chatMessages.slice(0, -1);
  const lastInHistory = chatMessages[chatMessages.length - 1];
  const lastMatchesNew =
    lastInHistory && lastInHistory.role === "user" && lastInHistory.content === newUserMessage;
  const priorHistory = lastMatchesNew ? historyMinusLast : chatMessages;

  const messages: NormalizedMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt({
        displayName: profile?.display_name ?? null,
        timezone: profile?.timezone ?? "UTC",
        nowIso: new Date().toISOString(),
        voice: voice ?? false,
      }),
    },
    { role: "system", content: stateBlock },
  ];

  // Voice persona + voiceContext blocks. Spliced in right after the main
  // system prompt (index 1) so they take precedence over the stateBlock for
  // tone, then voiceContext (index 2) follows the persona.
  if (voice) {
    messages.splice(1, 0, { role: "system", content: buildVoicePersonaBlock() });
    const ctxBlock = buildVoiceContextBlock(voiceContext ?? null);
    if (ctxBlock) {
      messages.splice(2, 0, { role: "system", content: ctxBlock });
    }
  }

  // Page context — only included when the user is asking from a non-chat page.
  // Lets Ru's reply land where the user is already looking.
  if (pageHint && pageHint.trim()) {
    messages.push({
      role: "system",
      content: `Page context (where the user is asking from):\n${pageHint.trim()}`,
    });
  }

  messages.push(
    ...priorHistory.map((m) => ({ role: m.role, content: m.content }) as NormalizedMessage),
    { role: "user", content: newUserMessage }
  );

  return { messages, memoryProfile };
}
