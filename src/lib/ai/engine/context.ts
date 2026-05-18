import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { NormalizedMessage } from "../types";
import { buildSystemPrompt } from "./system-prompt";

export async function assembleContext(opts: {
  supabase: SupabaseClient<Database>;
  userId: string;
  newUserMessage: string;
}): Promise<NormalizedMessage[]> {
  const { supabase, userId, newUserMessage } = opts;
  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  const [profileRes, todayMessagesRes, summariesRes, routinesRes, tasksRes, todayLogsRes] = await Promise.all([
    supabase.from("profiles").select("display_name, timezone").eq("id", userId).single(),
    supabase.from("messages")
      .select("role, content")
      .eq("user_id", userId)
      .gte("created_at", startOfToday)
      .order("created_at", { ascending: true })
      .limit(200),
    supabase.from("daily_summaries")
      .select("date, message_summary")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(7),
    supabase.from("routines")
      .select("title, frequency, time_of_day, nudge_level")
      .eq("user_id", userId)
      .eq("is_active", true),
    supabase.from("tasks")
      .select("title, priority, due_at, status")
      .eq("user_id", userId)
      .in("status", ["pending", "in_progress"])
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(20),
    supabase.from("activity_log")
      .select("activity, category, timestamp")
      .eq("user_id", userId)
      .gte("timestamp", startOfToday)
      .order("timestamp", { ascending: true }),
  ]);

  const profile = profileRes.data;
  const todayMessages = (todayMessagesRes.data ?? []) as { role: "user" | "assistant"; content: string }[];
  const summaries = summariesRes.data ?? [];
  const routines = routinesRes.data ?? [];
  const tasks = tasksRes.data ?? [];
  const todayLogs = todayLogsRes.data ?? [];

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
    todayLogs.length
      ? `Today's logged activities:\n${todayLogs.map((a) => `- ${a.activity} (${a.category})`).join("\n")}`
      : "Nothing logged today yet.",
  ].filter(Boolean).join("\n\n");

  const messages: NormalizedMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt({
        displayName: profile?.display_name ?? null,
        timezone: profile?.timezone ?? "UTC",
        nowIso: new Date().toISOString(),
      }),
    },
    { role: "system", content: stateBlock },
    ...todayMessages.map((m) => ({ role: m.role, content: m.content }) as NormalizedMessage),
    { role: "user", content: newUserMessage },
  ];

  return messages;
}
