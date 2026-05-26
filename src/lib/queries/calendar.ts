// Calendar-view queries — pulls every time-anchored entity for a date range
// and shapes them into a uniform `CalendarItem` so the UI can render them
// without per-type branches in templates.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export interface CachedCalendarEvent {
  id: string;
  googleEventId: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  htmlLink: string | null;
  status: string | null;
}

/**
 * Read cached Google Calendar events for the [from, to] window. Backed by
 * the `calendar_events` table populated by the calendar-sync cron, so the
 * /today and /sheet timelines never have to wait on a live Google round
 * trip.
 */
export async function listUpcomingCachedEvents(
  supabase: Supabase,
  userId: string,
  { from, to }: { from: Date; to: Date },
): Promise<CachedCalendarEvent[]> {
  const { data, error } = await supabase
    .from("calendar_events")
    .select(
      "id, google_event_id, title, description, location, start_at, end_at, all_day, html_link, status",
    )
    .eq("user_id", userId)
    .gte("start_at", from.toISOString())
    .lte("start_at", to.toISOString())
    .order("start_at", { ascending: true });
  if (error) throw new Error(`listUpcomingCachedEvents: ${error.message}`);

  return (data ?? []).map((r) => ({
    id: r.id,
    googleEventId: r.google_event_id,
    title: r.title,
    description: r.description,
    location: r.location,
    startAt: r.start_at,
    endAt: r.end_at,
    allDay: r.all_day,
    htmlLink: r.html_link,
    status: r.status,
  }));
}

export type CalendarItemKind = "task" | "routine" | "reminder" | "activity";

export interface CalendarItem {
  kind: CalendarItemKind;
  id: string;
  title: string;
  /** Anchor time as ISO string. Used to bucket into a day + hour slot. */
  whenIso: string;
  /** Optional duration in minutes — used to draw the block height. */
  durationMinutes?: number;
  /** Provided for routines only — lets the UI render the recurring rail. */
  frequency?: "daily" | "weekdays" | "weekly" | "custom";
  customDays?: number[] | null;
  timeOfDay?: string | null;
  status?: string;
  priority?: "low" | "medium" | "high";
  category?: string;
}

/**
 * Compose calendar items for [from, to). Routines are expanded into one
 * concrete item per matching day at their `time_of_day`. Tasks, reminders,
 * and activities surface at their explicit timestamps when they fall in range.
 */
export async function fetchCalendarItems(
  supabase: Supabase,
  userId: string,
  from: Date,
  to: Date
): Promise<CalendarItem[]> {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const [tasksRes, routinesRes, remindersRes, activitiesRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, priority, due_at")
      .eq("user_id", userId)
      .not("due_at", "is", null)
      .gte("due_at", fromIso)
      .lt("due_at", toIso)
      .order("due_at", { ascending: true }),
    supabase
      .from("routines")
      .select("id, title, frequency, time_of_day, custom_days")
      .eq("user_id", userId)
      .eq("is_active", true)
      .not("time_of_day", "is", null),
    supabase
      .from("reminders")
      .select("id, title, remind_at, is_recurring")
      .eq("user_id", userId)
      .gte("remind_at", fromIso)
      .lt("remind_at", toIso)
      .order("remind_at", { ascending: true }),
    supabase
      .from("activity_log")
      .select("id, activity, category, timestamp, duration_minutes")
      .eq("user_id", userId)
      .gte("timestamp", fromIso)
      .lt("timestamp", toIso)
      .order("timestamp", { ascending: true }),
  ]);

  const items: CalendarItem[] = [];

  for (const t of tasksRes.data ?? []) {
    if (!t.due_at) continue;
    items.push({
      kind: "task",
      id: t.id,
      title: t.title,
      whenIso: t.due_at,
      status: t.status,
      priority: t.priority,
    });
  }

  for (const r of remindersRes.data ?? []) {
    items.push({
      kind: "reminder",
      id: r.id,
      title: r.title,
      whenIso: r.remind_at,
    });
  }

  for (const a of activitiesRes.data ?? []) {
    items.push({
      kind: "activity",
      id: a.id,
      title: a.activity,
      whenIso: a.timestamp,
      durationMinutes: a.duration_minutes ?? undefined,
      category: a.category,
    });
  }

  // Expand routines: walk each day in [from, to), if the routine matches that
  // day per its frequency rule, emit an item anchored at its time_of_day.
  for (const r of routinesRes.data ?? []) {
    const [hStr, mStr] = (r.time_of_day ?? "").split(":");
    const hour = parseInt(hStr ?? "", 10);
    const minute = parseInt(mStr ?? "0", 10) || 0;
    if (Number.isNaN(hour)) continue;

    const cursor = new Date(from);
    cursor.setHours(0, 0, 0, 0);
    const stop = new Date(to);
    while (cursor < stop) {
      const dow = cursor.getDay(); // 0 = Sun .. 6 = Sat
      const isWeekday = dow >= 1 && dow <= 5;
      const matches =
        r.frequency === "daily" ||
        (r.frequency === "weekdays" && isWeekday) ||
        (r.frequency === "weekly" && dow === new Date(from).getDay()) ||
        (r.frequency === "custom" && (r.custom_days ?? []).includes(dow));
      if (matches) {
        const at = new Date(cursor);
        at.setHours(hour, minute, 0, 0);
        items.push({
          kind: "routine",
          id: `${r.id}-${at.toISOString().slice(0, 10)}`,
          title: r.title,
          whenIso: at.toISOString(),
          frequency: r.frequency,
          customDays: r.custom_days,
          timeOfDay: r.time_of_day,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return items;
}
