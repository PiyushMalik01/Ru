"use server";

/**
 * Server actions invoked from inline buttons on chat cards.
 *
 * Each action mirrors a tool handler in lib/ai/tools/handlers but is shaped
 * for direct client invocation (no LLM in the loop). Returns a small
 * { ok, error?, state? } envelope the card can use to render the new
 * state inline without a full re-fetch.
 */

import { createClient } from "@/lib/supabase/server";

interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  state?: T;
}

async function authedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

// ============ TASKS ============

export async function completeTaskInline(taskId: string): Promise<ActionResult<{ status: "completed" }>> {
  const auth = await authedClient();
  if (!auth) return { ok: false, error: "unauthorized" };
  const { error } = await auth.supabase
    .from("tasks")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("user_id", auth.userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, state: { status: "completed" } };
}

export async function reopenTaskInline(taskId: string): Promise<ActionResult<{ status: "pending" }>> {
  const auth = await authedClient();
  if (!auth) return { ok: false, error: "unauthorized" };
  const { error } = await auth.supabase
    .from("tasks")
    .update({ status: "pending", completed_at: null })
    .eq("id", taskId)
    .eq("user_id", auth.userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, state: { status: "pending" } };
}

// ============ ROUTINES ============

export async function completeRoutineInline(
  routineId: string,
): Promise<ActionResult<{ logged: "done" }>> {
  const auth = await authedClient();
  if (!auth) return { ok: false, error: "unauthorized" };
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await auth.supabase.from("routine_logs").upsert(
    {
      routine_id: routineId,
      user_id: auth.userId,
      logged_date: today,
      completed: true,
      completed_at: new Date().toISOString(),
    },
    { onConflict: "routine_id,logged_date" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, state: { logged: "done" } };
}

export async function skipRoutineInline(
  routineId: string,
): Promise<ActionResult<{ logged: "skipped" }>> {
  const auth = await authedClient();
  if (!auth) return { ok: false, error: "unauthorized" };
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await auth.supabase.from("routine_logs").upsert(
    {
      routine_id: routineId,
      user_id: auth.userId,
      logged_date: today,
      completed: false,
      notes: "Skipped",
    },
    { onConflict: "routine_id,logged_date" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, state: { logged: "skipped" } };
}

// ============ REMINDERS ============

export async function dismissReminderInline(
  reminderId: string,
): Promise<ActionResult<{ status: "dismissed" }>> {
  const auth = await authedClient();
  if (!auth) return { ok: false, error: "unauthorized" };
  const { error } = await auth.supabase
    .from("reminders")
    .update({ status: "dismissed" })
    .eq("id", reminderId)
    .eq("user_id", auth.userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, state: { status: "dismissed" } };
}

export async function snoozeReminderInline(
  reminderId: string,
  minutes: number,
): Promise<ActionResult<{ remind_at: string }>> {
  const auth = await authedClient();
  if (!auth) return { ok: false, error: "unauthorized" };

  const { data: current } = await auth.supabase
    .from("reminders")
    .select("remind_at")
    .eq("id", reminderId)
    .eq("user_id", auth.userId)
    .single();
  if (!current) return { ok: false, error: "reminder not found" };

  const from = new Date(current.remind_at);
  const base = from.getTime() > Date.now() ? from : new Date();
  const nextIso = new Date(base.getTime() + minutes * 60_000).toISOString();

  const { error } = await auth.supabase
    .from("reminders")
    .update({ remind_at: nextIso, status: "pending" })
    .eq("id", reminderId)
    .eq("user_id", auth.userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, state: { remind_at: nextIso } };
}

// ============ ACTIVITIES ============

export async function deleteActivityInline(
  activityId: string,
): Promise<ActionResult<{ deleted: true }>> {
  const auth = await authedClient();
  if (!auth) return { ok: false, error: "unauthorized" };
  const { error } = await auth.supabase
    .from("activity_log")
    .delete()
    .eq("id", activityId)
    .eq("user_id", auth.userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, state: { deleted: true } };
}

// ============ TRACKER ENTRIES ============

export async function deleteTrackerEntryInline(
  entryId: string,
): Promise<ActionResult<{ deleted: true }>> {
  const auth = await authedClient();
  if (!auth) return { ok: false, error: "unauthorized" };
  const { error } = await auth.supabase
    .from("tracker_entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", auth.userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, state: { deleted: true } };
}
