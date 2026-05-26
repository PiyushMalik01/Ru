// Orchestrates two-way calendar sync:
//   1. Pull from Google → cache in `calendar_events` for fast UI reads.
//   2. Push tasks → create/update events on Google when tasks have due_at.
//   3. Fire `calendar_event_soon` notifications 30–45 minutes before start.
//
// All functions take `userId` and use the service-role client; they're meant
// to run inside Inngest jobs and trusted API routes that have already
// authenticated the user.

import { createServiceClient } from "@/lib/supabase/service";
import { dispatch } from "@/lib/notifications";
import {
  createEvent,
  deleteEvent,
  listUpcomingEvents,
  updateEvent,
  type NormalizedCalendarEvent,
} from "./calendar";

const SYNC_WINDOW_DAYS = 30;

/** Resolve the start ISO from a Google event payload (timed or all-day). */
function startIso(e: NormalizedCalendarEvent): string | null {
  if (e.start.dateTime) return new Date(e.start.dateTime).toISOString();
  if (e.start.date) return new Date(`${e.start.date}T00:00:00Z`).toISOString();
  return null;
}

function endIso(e: NormalizedCalendarEvent): string | null {
  if (e.end.dateTime) return new Date(e.end.dateTime).toISOString();
  if (e.end.date) return new Date(`${e.end.date}T00:00:00Z`).toISOString();
  return null;
}

function isAllDay(e: NormalizedCalendarEvent): boolean {
  return Boolean(e.start.date && !e.start.dateTime);
}

export interface SyncResult {
  count: number;
  upserted: number;
  deleted: number;
}

/**
 * Pull events from primary calendar for [now, now + 30d) and reconcile the
 * `calendar_events` cache row-for-row. Anything that used to be cached but
 * is no longer in the Google window is deleted so cancellations propagate.
 */
export async function syncFromGoogle(userId: string): Promise<SyncResult> {
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const events = await listUpcomingEvents(userId, {
    calendarId: "primary",
    timeMin,
    timeMax,
    maxResults: 250,
  });

  const supabase = createServiceClient();

  // Build upsert rows; skip events with no resolvable start (shouldn't happen
  // for singleEvents=true but defensive).
  const rows = events
    .map((e) => {
      const start = startIso(e);
      if (!start) return null;
      return {
        user_id: userId,
        google_event_id: e.id,
        calendar_id: "primary",
        title: e.summary || "(no title)",
        description: e.description,
        location: e.location,
        start_at: start,
        end_at: endIso(e),
        all_day: isAllDay(e),
        html_link: e.htmlLink,
        status: e.status,
        fetched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  let upserted = 0;
  if (rows.length > 0) {
    const { error } = await supabase
      .from("calendar_events")
      .upsert(rows, { onConflict: "user_id,google_event_id" });
    if (error) throw new Error(`calendar_events upsert failed: ${error.message}`);
    upserted = rows.length;
  }

  // Reconcile deletions inside the sync window. Pull current cached rows in
  // the window, diff against fetched ids, delete the leftovers.
  const liveIds = new Set(rows.map((r) => r.google_event_id));
  const { data: cached, error: cachedErr } = await supabase
    .from("calendar_events")
    .select("id, google_event_id")
    .eq("user_id", userId)
    .eq("calendar_id", "primary")
    .gte("start_at", timeMin)
    .lt("start_at", timeMax);
  if (cachedErr) throw new Error(`calendar_events scan failed: ${cachedErr.message}`);

  const stale = (cached ?? []).filter((r) => !liveIds.has(r.google_event_id));
  let deleted = 0;
  if (stale.length > 0) {
    const { error: delErr } = await supabase
      .from("calendar_events")
      .delete()
      .in(
        "id",
        stale.map((r) => r.id),
      );
    if (delErr) throw new Error(`calendar_events delete failed: ${delErr.message}`);
    deleted = stale.length;
  }

  await supabase
    .from("google_integrations")
    .update({
      last_calendar_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return { count: rows.length, upserted, deleted };
}

export interface PushTaskResult {
  eventId: string;
  htmlLink: string | null;
}

/**
 * Mirror a task onto Google Calendar as a 1-hour block ending at its due_at.
 * If the task already has `calendar_event_id`, patch the existing event so
 * title/time changes propagate. Returns the event id either way.
 *
 * Throws if the task has no due_at — there's nothing to schedule.
 */
export async function pushTaskToCalendar(userId: string, taskId: string): Promise<PushTaskResult> {
  const supabase = createServiceClient();
  const { data: task, error } = await supabase
    .from("tasks")
    .select("id, title, description, due_at, calendar_event_id, user_id")
    .eq("id", taskId)
    .eq("user_id", userId)
    .single();
  if (error || !task) throw new Error(`task not found: ${taskId}`);
  if (!task.due_at) throw new Error("task has no due_at — cannot push to calendar");

  const dueAt = new Date(task.due_at);
  const start = new Date(dueAt.getTime() - 60 * 60 * 1000);
  const startIsoStr = start.toISOString();
  const endIsoStr = dueAt.toISOString();

  if (task.calendar_event_id) {
    const updated = await updateEvent(userId, task.calendar_event_id, {
      summary: task.title,
      description: task.description ?? undefined,
      start: { dateTime: startIsoStr },
      end: { dateTime: endIsoStr },
    });
    return { eventId: updated.id || task.calendar_event_id, htmlLink: updated.htmlLink };
  }

  const created = await createEvent(userId, {
    summary: task.title,
    description: task.description ?? undefined,
    start: { dateTime: startIsoStr },
    end: { dateTime: endIsoStr },
  });

  await supabase
    .from("tasks")
    .update({ calendar_event_id: created.id, updated_at: new Date().toISOString() })
    .eq("id", task.id);

  return { eventId: created.id, htmlLink: created.htmlLink };
}

/**
 * Remove a task's mirrored Google Calendar event. Tolerant of a missing
 * event on Google's side (e.g. user deleted it manually) — we still clear
 * the column.
 */
export async function removeTaskFromCalendar(userId: string, taskId: string): Promise<void> {
  const supabase = createServiceClient();
  const { data: task, error } = await supabase
    .from("tasks")
    .select("id, calendar_event_id, user_id")
    .eq("id", taskId)
    .eq("user_id", userId)
    .single();
  if (error || !task) return;
  if (!task.calendar_event_id) return;

  try {
    await deleteEvent(userId, task.calendar_event_id);
  } catch (e) {
    // 404/410 → already gone on Google's side; treat as success.
    const status = (e as { status?: number }).status;
    if (status !== 404 && status !== 410) throw e;
  }

  await supabase
    .from("tasks")
    .update({ calendar_event_id: null, updated_at: new Date().toISOString() })
    .eq("id", task.id);
}

/**
 * Look at cached events starting in 30–45 minutes and fire one
 * `calendar_event_soon` notification per event. The dedup tag prevents the
 * 30-minute cron from firing the same event twice on adjacent ticks.
 */
export async function dispatchUpcomingNotifications(userId: string): Promise<{ fired: number }> {
  const supabase = createServiceClient();
  const now = Date.now();
  const windowStart = new Date(now + 30 * 60 * 1000).toISOString();
  const windowEnd = new Date(now + 45 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("calendar_events")
    .select("id, google_event_id, title, start_at, html_link, location")
    .eq("user_id", userId)
    .gte("start_at", windowStart)
    .lt("start_at", windowEnd)
    .order("start_at", { ascending: true });
  if (error) throw new Error(`upcoming scan failed: ${error.message}`);

  let fired = 0;
  for (const ev of data ?? []) {
    const startsAt = new Date(ev.start_at);
    const mins = Math.round((startsAt.getTime() - Date.now()) / 60000);
    const body = ev.location
      ? `Starts in ${mins} min — ${ev.location}`
      : `Starts in ${mins} min`;
    await dispatch({
      userId,
      kind: "calendar_event_soon",
      title: ev.title,
      body,
      url: ev.html_link ?? undefined,
      entityKind: "calendar_event",
      entityId: ev.id,
      dedupTag: `calendar:${ev.google_event_id}`,
    });
    fired++;
  }
  return { fired };
}
