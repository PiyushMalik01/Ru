import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export async function matchRoutine(
  supabase: SupabaseClient<Database>,
  userId: string,
  query: string
): Promise<{ id: string; title: string } | null> {
  const { data, error } = await supabase.rpc("match_active_routine", {
    p_user_id: userId,
    p_query: query,
  } as never);
  if (error || !data || (data as unknown[]).length === 0) return null;
  const row = (data as { id: string; title: string }[])[0];
  return { id: row.id, title: row.title };
}

export async function matchTask(
  supabase: SupabaseClient<Database>,
  userId: string,
  query: string
): Promise<{ id: string; title: string } | null> {
  const { data, error } = await supabase.rpc("match_pending_task", {
    p_user_id: userId,
    p_query: query,
  } as never);
  if (error || !data || (data as unknown[]).length === 0) return null;
  const row = (data as { id: string; title: string }[])[0];
  return { id: row.id, title: row.title };
}

// Match by content similarity (LIKE on lowercased content for v1 — pgvector
// for semantic match comes later when called from the consolidation pass).
export async function matchEpisodeByText(
  supabase: SupabaseClient<Database>,
  userId: string,
  query: string
): Promise<{ id: string; content: string } | null> {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const { data, error } = await supabase
    .from("episodes")
    .select("id, content")
    .eq("user_id", userId)
    .is("superseded_by", null)
    .is("archived_at", null)
    .ilike("content", `%${q}%`)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return { id: data[0].id, content: data[0].content };
}
