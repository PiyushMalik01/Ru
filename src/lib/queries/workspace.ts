// Server-side queries for the workspace panel and its actions.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export interface WorkspaceSummary {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  created_at: string;
  itemCount: number;
}

export interface WorkspaceTaskItem {
  kind: "task";
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "missed";
  priority: "low" | "medium" | "high";
  due_at: string | null;
  position: number;
}
export interface WorkspaceRoutineItem {
  kind: "routine";
  id: string;
  title: string;
  frequency: "daily" | "weekdays" | "weekly" | "custom";
  time_of_day: string | null;
  is_active: boolean;
  position: number;
}
export interface WorkspaceReminderItem {
  kind: "reminder";
  id: string;
  title: string;
  remind_at: string;
  is_recurring: boolean;
  status: "pending" | "sent" | "dismissed";
  position: number;
}
export interface WorkspaceActivityItem {
  kind: "activity";
  id: string;
  activity: string;
  category: string;
  timestamp: string;
  position: number;
}
export type WorkspaceItem =
  | WorkspaceTaskItem
  | WorkspaceRoutineItem
  | WorkspaceReminderItem
  | WorkspaceActivityItem;

export interface WorkspaceDetail {
  workspace: {
    id: string;
    title: string;
    description: string | null;
    kind: string;
    created_at: string;
    updated_at: string;
    archived: boolean;
  };
  items: WorkspaceItem[];
}

export async function listWorkspaces(
  supabase: Supabase,
  userId: string
): Promise<WorkspaceSummary[]> {
  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("id, title, description, kind, created_at")
    .eq("user_id", userId)
    .eq("archived", false)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!workspaces) return [];

  const ids = workspaces.map((w) => w.id);
  if (ids.length === 0) return [];

  const { data: orderRows } = await supabase
    .from("workspace_item_order")
    .select("workspace_id")
    .in("workspace_id", ids);

  const counts = new Map<string, number>();
  for (const row of orderRows ?? []) {
    counts.set(row.workspace_id, (counts.get(row.workspace_id) ?? 0) + 1);
  }

  return workspaces.map((w) => ({
    ...w,
    itemCount: counts.get(w.id) ?? 0,
  }));
}

export async function getCurrentWorkspaceId(
  supabase: Supabase,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("current_workspace_id")
    .eq("id", userId)
    .single();
  return data?.current_workspace_id ?? null;
}

export async function fetchWorkspaceDetail(
  supabase: Supabase,
  userId: string,
  workspaceId: string
): Promise<WorkspaceDetail | null> {
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .eq("user_id", userId)
    .single();
  if (!workspace) return null;

  const { data: orderRows } = await supabase
    .from("workspace_item_order")
    .select("item_kind, item_id, position")
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: true });
  if (!orderRows || orderRows.length === 0) {
    return { workspace, items: [] };
  }

  const taskIds = orderRows.filter((r) => r.item_kind === "task").map((r) => r.item_id);
  const routineIds = orderRows.filter((r) => r.item_kind === "routine").map((r) => r.item_id);
  const reminderIds = orderRows.filter((r) => r.item_kind === "reminder").map((r) => r.item_id);
  const activityIds = orderRows.filter((r) => r.item_kind === "activity").map((r) => r.item_id);

  const [tasksRes, routinesRes, remindersRes, activitiesRes] = await Promise.all([
    taskIds.length
      ? supabase.from("tasks").select("id, title, status, priority, due_at").in("id", taskIds)
      : Promise.resolve({ data: [] }),
    routineIds.length
      ? supabase
          .from("routines")
          .select("id, title, frequency, time_of_day, is_active")
          .in("id", routineIds)
      : Promise.resolve({ data: [] }),
    reminderIds.length
      ? supabase
          .from("reminders")
          .select("id, title, remind_at, is_recurring, status")
          .in("id", reminderIds)
      : Promise.resolve({ data: [] }),
    activityIds.length
      ? supabase
          .from("activity_log")
          .select("id, activity, category, timestamp")
          .in("id", activityIds)
      : Promise.resolve({ data: [] }),
  ]);

  const tasks = new Map((tasksRes.data ?? []).map((t) => [t.id, t]));
  const routines = new Map((routinesRes.data ?? []).map((r) => [r.id, r]));
  const reminders = new Map((remindersRes.data ?? []).map((r) => [r.id, r]));
  const activities = new Map((activitiesRes.data ?? []).map((a) => [a.id, a]));

  const items: WorkspaceItem[] = [];
  for (const row of orderRows) {
    if (row.item_kind === "task") {
      const t = tasks.get(row.item_id);
      if (t) items.push({ kind: "task", position: row.position, ...t });
    } else if (row.item_kind === "routine") {
      const r = routines.get(row.item_id);
      if (r) items.push({ kind: "routine", position: row.position, ...r });
    } else if (row.item_kind === "reminder") {
      const r = reminders.get(row.item_id);
      if (r) items.push({ kind: "reminder", position: row.position, ...r });
    } else if (row.item_kind === "activity") {
      const a = activities.get(row.item_id);
      if (a) items.push({ kind: "activity", position: row.position, ...a });
    }
  }

  return { workspace, items };
}

export interface TodayBundle {
  tasksDueToday: { id: string; title: string; status: string; priority: "low" | "medium" | "high"; due_at: string | null }[];
  activeRoutines: { id: string; title: string; time_of_day: string | null; todayCompleted: boolean }[];
  recentActivities: { id: string; activity: string; category: string; timestamp: string }[];
}

export async function fetchTodayBundle(
  supabase: Supabase,
  userId: string
): Promise<TodayBundle> {
  const today = new Date();
  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);
  const todayKey = today.toISOString().slice(0, 10);

  const [tasksRes, routinesRes, logsRes, actsRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, priority, due_at")
      .eq("user_id", userId)
      .in("status", ["pending", "in_progress"])
      .or(`due_at.is.null,due_at.lte.${endOfToday.toISOString()}`)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(20),
    supabase
      .from("routines")
      .select("id, title, time_of_day")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("time_of_day", { ascending: true, nullsFirst: false }),
    supabase
      .from("routine_logs")
      .select("routine_id, completed")
      .eq("user_id", userId)
      .eq("logged_date", todayKey),
    supabase
      .from("activity_log")
      .select("id, activity, category, timestamp")
      .eq("user_id", userId)
      .order("timestamp", { ascending: false })
      .limit(3),
  ]);

  const completedRoutines = new Set(
    (logsRes.data ?? []).filter((l) => l.completed).map((l) => l.routine_id)
  );

  return {
    tasksDueToday: tasksRes.data ?? [],
    activeRoutines: (routinesRes.data ?? []).map((r) => ({
      ...r,
      todayCompleted: completedRoutines.has(r.id),
    })),
    recentActivities: actsRes.data ?? [],
  };
}
