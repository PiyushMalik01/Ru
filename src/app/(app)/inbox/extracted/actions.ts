"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ExtractedRow = Database["public"]["Tables"]["extracted_items"]["Row"];

interface ActionResult {
  ok: boolean;
  error?: string;
  createdId?: string;
  createdKind?: string;
}

/**
 * Accept a pending extracted_items row: create the downstream entity
 * (task / reminder / activity / event placeholder) and mark the row
 * accepted with the created entity reference.
 */
export async function acceptExtracted(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const { data: row, error: fetchErr } = await supabase
    .from("extracted_items")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (fetchErr || !row) return { ok: false, error: "not found" };
  if (row.status !== "pending") return { ok: false, error: "already decided" };

  const payload = (row.suggested_payload ?? {}) as Record<string, unknown>;
  const sourceNote = row.preview_subject
    ? `From Gmail: ${row.preview_subject}`
    : "From Gmail";

  let createdId: string | null = null;
  let createdKind: string | null = null;

  switch (row.suggested_kind) {
    case "task": {
      const title = typeof payload.title === "string" ? payload.title : null;
      if (!title) return await failAndKeep("missing title", row.id);
      const dueAt = typeof payload.due_at === "string" ? payload.due_at : null;
      const description = typeof payload.description === "string"
        ? `${payload.description}\n\n${sourceNote}`
        : sourceNote;
      const { data, error } = await supabase
        .from("tasks")
        .insert({ user_id: user.id, title, due_at: dueAt, description })
        .select("id")
        .single();
      if (error || !data) return { ok: false, error: error?.message ?? "insert failed" };
      createdId = data.id;
      createdKind = "task";
      break;
    }
    case "reminder": {
      const title = typeof payload.title === "string" ? payload.title : null;
      const remindAt = typeof payload.remind_at === "string" ? payload.remind_at : null;
      if (!title || !remindAt) return await failAndKeep("missing title/remind_at", row.id);
      const { data, error } = await supabase
        .from("reminders")
        .insert({ user_id: user.id, title, remind_at: remindAt })
        .select("id")
        .single();
      if (error || !data) return { ok: false, error: error?.message ?? "insert failed" };
      createdId = data.id;
      createdKind = "reminder";
      break;
    }
    case "activity": {
      const activity = typeof payload.activity === "string" ? payload.activity : null;
      const category = typeof payload.category === "string" ? payload.category : "general";
      if (!activity) return await failAndKeep("missing activity", row.id);
      const { data, error } = await supabase
        .from("activity_log")
        .insert({ user_id: user.id, activity, category })
        .select("id")
        .single();
      if (error || !data) return { ok: false, error: error?.message ?? "insert failed" };
      createdId = data.id;
      createdKind = "activity_log";
      break;
    }
    case "event": {
      const title = typeof payload.title === "string" ? payload.title : null;
      const startAt = typeof payload.start_at === "string" ? payload.start_at : null;
      const endAt = typeof payload.end_at === "string" ? payload.end_at : null;
      const location = typeof payload.location === "string" ? payload.location : null;
      if (!title || !startAt) return await failAndKeep("missing title/start_at", row.id);
      // Placeholder google_event_id — the calendar team handles real Google
      // event creation. We tag this row so they can pick it up later.
      const placeholderId = `ru-extracted-${row.id}`;
      const { data, error } = await supabase
        .from("calendar_events")
        .insert({
          user_id: user.id,
          title,
          start_at: startAt,
          end_at: endAt,
          location,
          google_event_id: placeholderId,
          calendar_id: "primary",
          description: `${sourceNote}\n\n(Pending Google Calendar push)`,
        })
        .select("id")
        .single();
      if (error || !data) return { ok: false, error: error?.message ?? "insert failed" };
      createdId = data.id;
      createdKind = "calendar_event";
      break;
    }
    case "note":
      // Notes have no downstream entity yet — just accept the row.
      createdId = null;
      createdKind = "note";
      break;
    default:
      return { ok: false, error: "unknown kind" };
  }

  const { error: updErr } = await supabase
    .from("extracted_items")
    .update({
      status: "accepted",
      decided_at: new Date().toISOString(),
      created_entity_id: createdId,
      created_entity_kind: createdKind,
    })
    .eq("id", row.id)
    .eq("user_id", user.id);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/inbox/extracted");
  return { ok: true, createdId: createdId ?? undefined, createdKind: createdKind ?? undefined };
}

/** Marks the row rejected; no downstream entity. */
export async function rejectExtracted(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const { error } = await supabase
    .from("extracted_items")
    .update({ status: "rejected", decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/inbox/extracted");
  return { ok: true };
}

/** Accept multiple rows in one go. Stops on first hard error. */
export async function acceptAll(ids: string[]): Promise<{ ok: boolean; accepted: number; errors: string[] }> {
  const errors: string[] = [];
  let accepted = 0;
  for (const id of ids) {
    const r = await acceptExtracted(id);
    if (r.ok) accepted += 1;
    else if (r.error) errors.push(`${id}: ${r.error}`);
  }
  revalidatePath("/inbox/extracted");
  return { ok: errors.length === 0, accepted, errors };
}

// Helper to satisfy TS without leaving rows in a half-state when a payload
// is malformed: we don't auto-reject (user may want to retry), we just
// return an error without mutating the row.
async function failAndKeep(reason: string, _rowId: ExtractedRow["id"]): Promise<ActionResult> {
  return { ok: false, error: reason };
}
