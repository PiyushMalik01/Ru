"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function toggleTaskComplete(taskId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const { data: existing } = await supabase
    .from("tasks")
    .select("id, status")
    .eq("id", taskId)
    .eq("user_id", user.id)
    .single();
  if (!existing) return { ok: false, error: "not found" };

  const nextStatus = existing.status === "completed" ? "pending" : "completed";
  const { error } = await supabase
    .from("tasks")
    .update({
      status: nextStatus,
      completed_at: nextStatus === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", taskId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/tasks");
  revalidatePath("/insights");
  return { ok: true };
}
