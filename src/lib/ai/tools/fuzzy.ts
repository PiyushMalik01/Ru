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
