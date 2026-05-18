// Timeline-view query — plans rendered as horizontal bars across a date range.
// Each plan's span is derived from the earliest and latest dates among its
// items (tasks' due_at, routines' updated_at, reminders' remind_at). Items
// without any date contribute the plan's own created_at as a fallback.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export interface TimelinePlan {
  id: string;
  title: string;
  description: string | null;
  /** Bar start (ISO date). */
  startIso: string;
  /** Bar end (ISO date). May equal startIso for a 1-day plan. */
  endIso: string;
  itemCount: number;
  doneCount: number;
  /** Up to 5 visible item markers along the bar, mapped to entity colors. */
  markers: { dateIso: string; kind: "task" | "routine" | "reminder" | "activity" }[];
}

export async function fetchTimelinePlans(
  supabase: Supabase,
  userId: string
): Promise<TimelinePlan[]> {
  // Pull active plans + their items in one round.
  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("id, title, description, created_at")
    .eq("user_id", userId)
    .eq("archived", false)
    .order("created_at", { ascending: false })
    .limit(40);

  if (!workspaces || workspaces.length === 0) return [];
  const ids = workspaces.map((w) => w.id);

  const [tasksRes, remindersRes, routinesRes, activitiesRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("workspace_id, due_at, status, updated_at")
      .in("workspace_id", ids),
    supabase
      .from("reminders")
      .select("workspace_id, remind_at")
      .in("workspace_id", ids),
    supabase
      .from("routines")
      .select("workspace_id, updated_at")
      .in("workspace_id", ids),
    supabase
      .from("activity_log")
      .select("workspace_id, timestamp")
      .in("workspace_id", ids),
  ]);

  const out: TimelinePlan[] = [];

  for (const w of workspaces) {
    const tasks = (tasksRes.data ?? []).filter((t) => t.workspace_id === w.id);
    const reminders = (remindersRes.data ?? []).filter((r) => r.workspace_id === w.id);
    const routines = (routinesRes.data ?? []).filter((r) => r.workspace_id === w.id);
    const activities = (activitiesRes.data ?? []).filter((a) => a.workspace_id === w.id);

    const dates: { iso: string; kind: TimelinePlan["markers"][number]["kind"] }[] = [];
    for (const t of tasks) if (t.due_at) dates.push({ iso: t.due_at, kind: "task" });
    for (const r of reminders) dates.push({ iso: r.remind_at, kind: "reminder" });
    for (const r of routines) dates.push({ iso: r.updated_at, kind: "routine" });
    for (const a of activities) dates.push({ iso: a.timestamp, kind: "activity" });

    if (dates.length === 0) {
      // Plan has no time-anchored items; show as a same-day marker at the
      // plan's creation date.
      dates.push({ iso: w.created_at, kind: "task" });
    }

    dates.sort((a, b) => a.iso.localeCompare(b.iso));
    const startIso = dates[0].iso;
    const endIso = dates[dates.length - 1].iso;

    // Sample up to 5 markers along the bar.
    const step = Math.max(1, Math.floor(dates.length / 5));
    const markers = dates.filter((_, i) => i % step === 0).slice(0, 5).map((d) => ({
      dateIso: d.iso,
      kind: d.kind,
    }));

    const doneCount = tasks.filter((t) => t.status === "completed").length;
    const itemCount = tasks.length + reminders.length + routines.length + activities.length;

    out.push({
      id: w.id,
      title: w.title,
      description: w.description,
      startIso,
      endIso,
      itemCount,
      doneCount,
      markers,
    });
  }

  // Sort plans by start date for chronological reading.
  out.sort((a, b) => a.startIso.localeCompare(b.startIso));
  return out;
}
