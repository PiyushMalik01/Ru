// Server-side data fetchers for the /routines, /tasks, /insights dashboards.
// All queries scope by user_id and rely on RLS for isolation.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface RoutineWithToday {
  id: string;
  title: string;
  description: string | null;
  frequency: "daily" | "weekdays" | "weekly" | "custom";
  custom_days: number[] | null;
  time_of_day: string | null;
  nudge_level: "silent" | "gentle" | "active";
  origin: "user_declared" | "auto_detected";
  is_active: boolean;
  streak: number;
  todayCompleted: boolean;
  lastSevenDays: { date: string; completed: boolean }[];
}

export async function fetchRoutinesWithToday(
  supabase: Supabase,
  userId: string
): Promise<RoutineWithToday[]> {
  const today = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 6); // inclusive 7 day window

  const [routinesRes, logsRes] = await Promise.all([
    supabase
      .from("routines")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("time_of_day", { ascending: true, nullsFirst: false }),
    supabase
      .from("routine_logs")
      .select("routine_id, logged_date, completed")
      .eq("user_id", userId)
      .gte("logged_date", isoDate(sevenDaysAgo)),
  ]);

  const routines = routinesRes.data ?? [];
  const logs = logsRes.data ?? [];

  const todayKey = isoDate(today);
  const logsByRoutine = new Map<string, Map<string, boolean>>();
  for (const log of logs) {
    if (!logsByRoutine.has(log.routine_id)) logsByRoutine.set(log.routine_id, new Map());
    logsByRoutine.get(log.routine_id)!.set(log.logged_date, log.completed);
  }

  return routines.map((r) => {
    const completionMap = logsByRoutine.get(r.id) ?? new Map();

    // 7-day window for the strip
    const lastSevenDays: { date: string; completed: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const key = isoDate(d);
      lastSevenDays.push({ date: key, completed: completionMap.get(key) === true });
    }

    // Streak — consecutive days back from today (or yesterday if today not done yet)
    let streak = 0;
    const cursor = new Date(today);
    while (completionMap.get(isoDate(cursor)) === true) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    return {
      id: r.id,
      title: r.title,
      description: r.description,
      frequency: r.frequency,
      custom_days: r.custom_days,
      time_of_day: r.time_of_day,
      nudge_level: r.nudge_level,
      origin: r.origin,
      is_active: r.is_active,
      streak,
      todayCompleted: completionMap.get(todayKey) === true,
      lastSevenDays,
    };
  });
}

export type TaskStatus = "pending" | "in_progress" | "completed" | "missed";

// ── Task counts for the Sheet stats strip (Open / Due today / Completed this
//    week / Overdue). All four are computed off a single query window so we
//    avoid a stampede of round-trips.
export interface SheetTaskStats {
  open: number;       // pending + in_progress (any due date)
  dueToday: number;   // due_at falls inside today, not completed
  completedWeek: number; // completed_at within last 7 days (inclusive)
  overdue: number;    // due_at in the past, not completed
}

export async function fetchSheetTaskStats(
  supabase: Supabase,
  userId: string,
  nowMs: number = Date.now()
): Promise<SheetTaskStats> {
  const now = new Date(nowMs);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  // One small projection. We compute all four counts client-side from a single
  // window of rows (last 30 days + everything still open). For most users
  // that's a small set and a single round-trip is much simpler than four
  // count() queries.
  const sinceIso = new Date(Math.min(weekAgo.getTime(), startOfToday.getTime() - 30 * 86400_000)).toISOString();

  const { data } = await supabase
    .from("tasks")
    .select("status, due_at, completed_at")
    .eq("user_id", userId)
    .is("archived_at", null)
    .or(`completed_at.gte.${sinceIso},status.in.(pending,in_progress,missed)`);

  const rows = (data ?? []) as { status: TaskStatus; due_at: string | null; completed_at: string | null }[];

  let open = 0;
  let dueToday = 0;
  let completedWeek = 0;
  let overdue = 0;
  const nowIso = nowMs;
  const todayStartMs = startOfToday.getTime();
  const tomorrowStartMs = startOfTomorrow.getTime();
  const weekAgoMs = weekAgo.getTime();

  for (const t of rows) {
    const isCompleted = t.status === "completed";
    if (!isCompleted) {
      if (t.status === "pending" || t.status === "in_progress") open += 1;
      if (t.due_at) {
        const d = new Date(t.due_at).getTime();
        if (d >= todayStartMs && d < tomorrowStartMs) dueToday += 1;
        if (d < nowIso) overdue += 1;
      } else if (t.status === "missed") {
        // missed tasks without a due date still read as overdue
        overdue += 1;
      }
    } else if (t.completed_at) {
      const c = new Date(t.completed_at).getTime();
      if (c >= weekAgoMs) completedWeek += 1;
    }
  }

  return { open, dueToday, completedWeek, overdue };
}

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: "low" | "medium" | "high";
  due_at: string | null;
  completed_at: string | null;
  tags: string[];
  created_at: string;
}

export async function fetchTasks(
  supabase: Supabase,
  userId: string,
  opts: { statuses?: TaskStatus[]; limit?: number } = {}
): Promise<TaskRow[]> {
  const statuses = opts.statuses ?? ["pending", "in_progress", "completed", "missed"];
  let query = supabase
    .from("tasks")
    .select("id, title, description, status, priority, due_at, completed_at, tags, created_at")
    .eq("user_id", userId)
    .in("status", statuses)
    .is("archived_at", null);

  query = query
    .order("status", { ascending: true })
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (opts.limit) query = query.limit(opts.limit);
  const { data } = await query;
  return (data ?? []) as TaskRow[];
}

export interface InsightsBundle {
  routineStats: {
    id: string;
    title: string;
    streak: number;
    rate7: number;
    rate30: number;
    lastSevenDays: { date: string; completed: boolean }[];
  }[];
  taskRate: { total: number; completed: number; rate: number };
  activityByCategory: { category: string; count: number }[];
  weeklyHeatmap: { date: string; count: number }[];
  /** Range labels — ISO dates for the current period (inclusive). */
  range: { startIso: string; endIso: string; days: number };
  /** Month-over-month delta context: counts from the prior equal-length window. */
  prior: {
    tasksCreated: number;
    tasksCompleted: number;
    activitiesLogged: number;
  };
}

export async function fetchInsights(
  supabase: Supabase,
  userId: string,
  days = 30
): Promise<InsightsBundle> {
  const today = new Date();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days + 1);
  const cutoffKey = isoDate(cutoff);

  // Prior window: same length, immediately preceding `cutoff`.
  const priorStart = new Date(cutoff);
  priorStart.setDate(priorStart.getDate() - days);
  const priorEnd = new Date(cutoff);
  priorEnd.setDate(priorEnd.getDate() - 1);

  const [routinesRes, routineLogsRes, tasksRes, activityRes, priorTasksRes, priorActivityRes] =
    await Promise.all([
      supabase
        .from("routines")
        .select("id, title")
        .eq("user_id", userId)
        .eq("is_active", true),
      supabase
        .from("routine_logs")
        .select("routine_id, logged_date, completed")
        .eq("user_id", userId)
        .gte("logged_date", cutoffKey),
      supabase
        .from("tasks")
        .select("status, created_at, completed_at")
        .eq("user_id", userId)
        .gte("created_at", cutoff.toISOString()),
      supabase
        .from("activity_log")
        .select("category, timestamp")
        .eq("user_id", userId)
        .gte("timestamp", cutoff.toISOString()),
      supabase
        .from("tasks")
        .select("status, created_at, completed_at")
        .eq("user_id", userId)
        .gte("created_at", priorStart.toISOString())
        .lt("created_at", cutoff.toISOString()),
      supabase
        .from("activity_log")
        .select("id, timestamp")
        .eq("user_id", userId)
        .gte("timestamp", priorStart.toISOString())
        .lt("timestamp", cutoff.toISOString()),
    ]);

  const routines = routinesRes.data ?? [];
  const logs = routineLogsRes.data ?? [];
  const tasks = tasksRes.data ?? [];
  const activities = activityRes.data ?? [];
  const priorTasks = priorTasksRes.data ?? [];
  const priorActivities = priorActivityRes.data ?? [];

  // Routine stats: streak + 7/30-day completion rates + 7-day strip
  const routineStats = routines.map((r) => {
    const routineLogs = logs.filter((l) => l.routine_id === r.id);
    const dates = new Set(routineLogs.filter((l) => l.completed).map((l) => l.logged_date));

    let streak = 0;
    const cursor = new Date(today);
    while (dates.has(isoDate(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    const lastSevenDays: { date: string; completed: boolean }[] = [];
    let logsLast7 = 0;
    let completedLast7 = 0;
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = isoDate(d);
      const done = dates.has(key);
      lastSevenDays.push({ date: key, completed: done });
      logsLast7 += 1;
      if (done) completedLast7 += 1;
    }
    const rate7 = logsLast7 ? Math.round((completedLast7 / logsLast7) * 100) : 0;

    const completed30 = routineLogs.filter((l) => l.completed).length;
    const rate30 = Math.min(100, Math.round((completed30 / days) * 100));

    return { id: r.id, title: r.title, streak, rate7, rate30, lastSevenDays };
  });

  // Task rate
  const taskTotal = tasks.length;
  const taskDone = tasks.filter((t) => t.status === "completed").length;
  const taskRate = {
    total: taskTotal,
    completed: taskDone,
    rate: taskTotal ? Math.round((taskDone / taskTotal) * 100) : 0,
  };

  // Activity by category
  const catCounts = new Map<string, number>();
  for (const a of activities) {
    const key = a.category || "uncategorized";
    catCounts.set(key, (catCounts.get(key) ?? 0) + 1);
  }
  const activityByCategory = [...catCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  // Weekly heatmap — last `days` days, count per day
  const dayCounts = new Map<string, number>();
  for (const a of activities) {
    const key = isoDate(new Date(a.timestamp));
    dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
  }
  const weeklyHeatmap: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = isoDate(d);
    weeklyHeatmap.push({ date: key, count: dayCounts.get(key) ?? 0 });
  }

  // Prior-window aggregates for month-over-month deltas
  const priorTaskCompleted = priorTasks.filter((t) => t.status === "completed").length;
  const prior = {
    tasksCreated: priorTasks.length,
    tasksCompleted: priorTaskCompleted,
    activitiesLogged: priorActivities.length,
  };

  const range = {
    startIso: cutoffKey,
    endIso: isoDate(today),
    days,
  };

  return { routineStats, taskRate, activityByCategory, weeklyHeatmap, range, prior };
}
