"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function toggleRoutineToday(routineId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const today = new Date().toISOString().slice(0, 10);

  const { data: existing } = await supabase
    .from("routine_logs")
    .select("id, completed")
    .eq("routine_id", routineId)
    .eq("user_id", user.id)
    .eq("logged_date", today)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("routine_logs")
      .update({
        completed: !existing.completed,
        completed_at: !existing.completed ? new Date().toISOString() : null,
      })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("routine_logs").insert({
      routine_id: routineId,
      user_id: user.id,
      logged_date: today,
      completed: true,
      completed_at: new Date().toISOString(),
    });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/routines");
  revalidatePath("/insights");
  return { ok: true };
}

export async function setRoutineActive(routineId: string, active: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };
  const { error } = await supabase
    .from("routines")
    .update({ is_active: active })
    .eq("id", routineId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/routines");
  return { ok: true };
}
