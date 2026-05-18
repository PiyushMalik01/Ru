import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * The active workspace for this user, if any. Tool handlers call this so
 * newly created entities (tasks, routines, reminders, activity rows) get
 * automatically attached to the workspace Ru is currently building inside.
 */
export async function getCurrentWorkspaceId(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", userId)
    .single();
  return data?.current_workspace_id ?? null;
}

/**
 * Append an item to the end of a workspace's ordering. Cheap: one max() query
 * plus one insert. If the row already exists (shouldn't, but be safe), the
 * onConflict path preserves the existing position.
 */
export async function appendToWorkspaceOrder(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  itemKind: "task" | "routine" | "reminder" | "activity",
  itemId: string
): Promise<void> {
  const { data: maxRow } = await supabase
    .from("workspace_item_order")
    .select("position")
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = (maxRow?.position ?? -1) + 1;

  await supabase.from("workspace_item_order").upsert(
    {
      workspace_id: workspaceId,
      item_kind: itemKind,
      item_id: itemId,
      position: nextPosition,
    },
    { onConflict: "workspace_id,item_kind,item_id", ignoreDuplicates: true }
  );
}
