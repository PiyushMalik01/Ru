"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function setActiveWorkspace(workspaceId: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };
  const { error } = await supabase
    .from("profiles")
    .update({ current_workspace_id: workspaceId })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/chat");
  return { ok: true };
}

export async function renameWorkspace(workspaceId: string, title: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };
  const trimmed = title.trim().slice(0, 120);
  if (!trimmed) return { ok: false, error: "title required" };
  const { error } = await supabase
    .from("workspaces")
    .update({ title: trimmed })
    .eq("id", workspaceId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/chat");
  return { ok: true };
}

export async function archiveWorkspace(workspaceId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  // If it was active, unset it
  const { data: profile } = await supabase
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", user.id)
    .single();
  if (profile?.current_workspace_id === workspaceId) {
    await supabase.from("profiles").update({ current_workspace_id: null }).eq("id", user.id);
  }

  const { error } = await supabase
    .from("workspaces")
    .update({ archived: true })
    .eq("id", workspaceId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/chat");
  return { ok: true };
}

export async function renameTaskInWorkspace(taskId: string, title: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };
  const trimmed = title.trim().slice(0, 200);
  if (!trimmed) return { ok: false, error: "title required" };
  const { error } = await supabase
    .from("tasks")
    .update({ title: trimmed })
    .eq("id", taskId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/chat");
  revalidatePath("/tasks");
  return { ok: true };
}

export async function rescheduleTask(taskId: string, dueAt: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };
  const { error } = await supabase
    .from("tasks")
    .update({ due_at: dueAt })
    .eq("id", taskId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/chat");
  revalidatePath("/tasks");
  return { ok: true };
}

export async function toggleTaskCompleteInWorkspace(taskId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };
  const { data: existing } = await supabase
    .from("tasks")
    .select("status")
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
  revalidatePath("/chat");
  revalidatePath("/tasks");
  return { ok: true };
}

export async function removeFromWorkspace(workspaceId: string, kind: string, itemId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };
  // Drop the ordering row — the entity itself stays in its main table.
  await supabase
    .from("workspace_item_order")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("item_kind", kind)
    .eq("item_id", itemId);
  // Clear the back-reference on the entity
  const tableMap: Record<string, "tasks" | "routines" | "reminders" | "activity_log"> = {
    task: "tasks",
    routine: "routines",
    reminder: "reminders",
    activity: "activity_log",
  };
  const table = tableMap[kind];
  if (table) {
    await supabase
      .from(table)
      .update({ workspace_id: null } as never)
      .eq("id", itemId)
      .eq("user_id", user.id);
  }
  revalidatePath("/chat");
  return { ok: true };
}

export async function reorderWorkspace(
  workspaceId: string,
  ordered: { kind: string; id: string }[]
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  // Verify ownership
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .eq("user_id", user.id)
    .single();
  if (!workspace) return { ok: false, error: "not found" };

  await Promise.all(
    ordered.map((item, idx) =>
      supabase
        .from("workspace_item_order")
        .update({ position: idx })
        .eq("workspace_id", workspaceId)
        .eq("item_kind", item.kind)
        .eq("item_id", item.id)
    )
  );

  revalidatePath("/chat");
  return { ok: true };
}
