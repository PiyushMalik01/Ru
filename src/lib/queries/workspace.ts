// Server-side queries for the workspace panel and its actions.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { buildNow } from "@/lib/time";

type Supabase = SupabaseClient<Database>;

export interface WorkspaceSummary {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  created_at: string;
  /** Last time the workspace row itself was touched. */
  updated_at?: string;
  itemCount: number;
  /** Settled items (completed tasks + activities). Populated by listWorkspaces. */
  doneCount?: number;
  /** Most recent activity within the plan — used for "last touched" display. */
  lastActivityIso?: string | null;
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
    .select("id, title, description, kind, created_at, updated_at")
    .eq("user_id", userId)
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (!workspaces) return [];

  const ids = workspaces.map((w) => w.id);
  if (ids.length === 0) return [];

  const { data: orderRows } = await supabase
    .from("workspace_item_order")
    .select("workspace_id, item_kind, item_id")
    .in("workspace_id", ids);

  const counts = new Map<string, number>();
  const taskIdsByWs = new Map<string, string[]>();
  const activityIdsByWs = new Map<string, string[]>();
  const allTaskIds: string[] = [];
  const allActivityIds: string[] = [];
  for (const row of orderRows ?? []) {
    counts.set(row.workspace_id, (counts.get(row.workspace_id) ?? 0) + 1);
    if (row.item_kind === "task") {
      if (!taskIdsByWs.has(row.workspace_id)) taskIdsByWs.set(row.workspace_id, []);
      taskIdsByWs.get(row.workspace_id)!.push(row.item_id);
      allTaskIds.push(row.item_id);
    } else if (row.item_kind === "activity") {
      if (!activityIdsByWs.has(row.workspace_id)) activityIdsByWs.set(row.workspace_id, []);
      activityIdsByWs.get(row.workspace_id)!.push(row.item_id);
      allActivityIds.push(row.item_id);
    }
  }

  // Resolve completion + recency in two parallel batches.
  const [tasksRes, activitiesRes] = await Promise.all([
    allTaskIds.length
      ? supabase
          .from("tasks")
          .select("id, status, completed_at, updated_at")
          .in("id", allTaskIds)
      : Promise.resolve({ data: [] as { id: string; status: string; completed_at: string | null; updated_at: string }[] }),
    allActivityIds.length
      ? supabase
          .from("activity_log")
          .select("id, timestamp")
          .in("id", allActivityIds)
      : Promise.resolve({ data: [] as { id: string; timestamp: string }[] }),
  ]);

  const taskById = new Map((tasksRes.data ?? []).map((t) => [t.id, t]));
  const activityById = new Map((activitiesRes.data ?? []).map((a) => [a.id, a]));

  return workspaces.map((w) => {
    const taskIds = taskIdsByWs.get(w.id) ?? [];
    const activityIds = activityIdsByWs.get(w.id) ?? [];

    let doneCount = 0;
    let lastTouched = new Date(w.updated_at).getTime();
    for (const tid of taskIds) {
      const t = taskById.get(tid);
      if (!t) continue;
      if (t.status === "completed") doneCount += 1;
      const ts = t.completed_at
        ? new Date(t.completed_at).getTime()
        : new Date(t.updated_at).getTime();
      if (ts > lastTouched) lastTouched = ts;
    }
    for (const aid of activityIds) {
      const a = activityById.get(aid);
      if (!a) continue;
      doneCount += 1; // activities are "settled"
      const ts = new Date(a.timestamp).getTime();
      if (ts > lastTouched) lastTouched = ts;
    }

    return {
      id: w.id,
      title: w.title,
      description: w.description,
      kind: w.kind,
      created_at: w.created_at,
      updated_at: w.updated_at,
      itemCount: counts.get(w.id) ?? 0,
      doneCount,
      lastActivityIso: new Date(lastTouched).toISOString(),
    };
  });
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
      ? supabase
          .from("tasks")
          .select("id, title, status, priority, due_at")
          .in("id", taskIds)
          .is("archived_at", null)
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
          .is("archived_at", null)
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
  // Read timezone first so "today" is the user's day, not the server's.
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .single();
  const nowCtx = buildNow(profile?.timezone ?? "UTC");
  const todayKey = nowCtx.todayKey;
  // Past tasks still due "today or earlier" pull in, but we cap how far back
  // to avoid surfacing months-old pending work. 30 days back matches the
  // staleness policy's `taskStaleDays` — anything older is dormant.
  const floorIso = new Date(nowCtx.now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const endOfTodayIso = new Date(nowCtx.startOfTomorrowUtc.getTime() - 1).toISOString();

  const [tasksRes, routinesRes, logsRes, actsRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, priority, due_at")
      .eq("user_id", userId)
      .in("status", ["pending", "in_progress"])
      .is("archived_at", null)
      .or(`due_at.is.null,and(due_at.lte.${endOfTodayIso},due_at.gte.${floorIso})`)
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
