"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  coerceFields,
  coerceValues,
  normalizeKey,
  type RawField,
} from "@/lib/ai/tools/handlers/tracker-helpers";

async function authed() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

async function loadFields(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, trackerId: string) {
  const { data } = await supabase
    .from("trackers")
    .select("fields, name")
    .eq("id", trackerId)
    .eq("user_id", userId)
    .single();
  if (!data) throw new Error("tracker not found");
  return { fields: coerceFields(data.fields), name: data.name as string };
}

export async function logEntryAction(formData: FormData) {
  const { supabase, userId } = await authed();
  const trackerId = String(formData.get("trackerId") ?? "");
  if (!trackerId) throw new Error("trackerId required");

  const { fields } = await loadFields(supabase, userId, trackerId);

  const raw: Record<string, string> = {};
  for (const f of fields) {
    const v = formData.get(`field:${f.key}`);
    if (typeof v === "string" && v.trim() !== "") raw[f.key] = v.trim();
  }
  const notes = String(formData.get("notes") ?? "").trim();

  const { values } = coerceValues(fields, raw);
  if (Object.keys(values).length === 0) return;

  await supabase.from("tracker_entries").insert({
    user_id: userId,
    tracker_id: trackerId,
    values,
    notes: notes || null,
  });

  revalidatePath(`/trackers/${trackerId}`);
  revalidatePath("/routines");
}

export async function addFieldAction(formData: FormData) {
  const { supabase, userId } = await authed();
  const trackerId = String(formData.get("trackerId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const type = String(formData.get("type") ?? "number") as RawField["type"];
  const unit = String(formData.get("unit") ?? "").trim();
  if (!trackerId || !label) return;

  const { fields } = await loadFields(supabase, userId, trackerId);
  const key = normalizeKey(label);
  if (fields.some((f) => f.key === key)) return;

  const next = [
    ...fields,
    { key, label, type, unit: unit || undefined },
  ];
  await supabase
    .from("trackers")
    .update({ fields: next as unknown as Record<string, unknown>[], updated_at: new Date().toISOString() })
    .eq("id", trackerId)
    .eq("user_id", userId);
  revalidatePath(`/trackers/${trackerId}`);
}

export async function removeFieldAction(formData: FormData) {
  const { supabase, userId } = await authed();
  const trackerId = String(formData.get("trackerId") ?? "");
  const key = String(formData.get("key") ?? "");
  if (!trackerId || !key) return;

  const { fields } = await loadFields(supabase, userId, trackerId);
  const next = fields.filter((f) => f.key !== key);
  if (next.length === fields.length) return;

  await supabase
    .from("trackers")
    .update({ fields: next as unknown as Record<string, unknown>[], updated_at: new Date().toISOString() })
    .eq("id", trackerId)
    .eq("user_id", userId);
  revalidatePath(`/trackers/${trackerId}`);
}

export async function renameFieldAction(formData: FormData) {
  const { supabase, userId } = await authed();
  const trackerId = String(formData.get("trackerId") ?? "");
  const key = String(formData.get("key") ?? "");
  const newLabel = String(formData.get("newLabel") ?? "").trim();
  if (!trackerId || !key || !newLabel) return;

  const { fields } = await loadFields(supabase, userId, trackerId);
  const next = fields.map((f) => (f.key === key ? { ...f, label: newLabel } : f));
  await supabase
    .from("trackers")
    .update({ fields: next as unknown as Record<string, unknown>[], updated_at: new Date().toISOString() })
    .eq("id", trackerId)
    .eq("user_id", userId);
  revalidatePath(`/trackers/${trackerId}`);
}

export async function renameTrackerAction(formData: FormData) {
  const { supabase, userId } = await authed();
  const trackerId = String(formData.get("trackerId") ?? "");
  const newName = String(formData.get("newName") ?? "").trim();
  if (!trackerId || !newName) return;
  await supabase
    .from("trackers")
    .update({ name: newName, updated_at: new Date().toISOString() })
    .eq("id", trackerId)
    .eq("user_id", userId);
  revalidatePath(`/trackers/${trackerId}`);
  revalidatePath("/routines");
}

export async function setChartTypeAction(formData: FormData) {
  const { supabase, userId } = await authed();
  const trackerId = String(formData.get("trackerId") ?? "");
  const chartType = String(formData.get("chartType") ?? "line") as "line" | "bar" | "area";
  if (!trackerId || !["line", "bar", "area"].includes(chartType)) return;

  // Merge with existing display_config so we don't clobber primary_field.
  const { data } = await supabase
    .from("trackers")
    .select("display_config")
    .eq("id", trackerId)
    .eq("user_id", userId)
    .single();
  const existing = (data?.display_config as Record<string, unknown>) ?? {};

  await supabase
    .from("trackers")
    .update({
      display_config: { ...existing, chart_type: chartType },
      updated_at: new Date().toISOString(),
    })
    .eq("id", trackerId)
    .eq("user_id", userId);
  revalidatePath(`/trackers/${trackerId}`);
}

export async function archiveTrackerAction(formData: FormData) {
  const { supabase, userId } = await authed();
  const trackerId = String(formData.get("trackerId") ?? "");
  if (!trackerId) return;
  await supabase
    .from("trackers")
    .update({ archived: true, updated_at: new Date().toISOString() })
    .eq("id", trackerId)
    .eq("user_id", userId);
  revalidatePath("/routines");
  redirect("/routines");
}

export async function deleteEntryAction(formData: FormData) {
  const { supabase, userId } = await authed();
  const trackerId = String(formData.get("trackerId") ?? "");
  const entryId = String(formData.get("entryId") ?? "");
  if (!trackerId || !entryId) return;
  await supabase
    .from("tracker_entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", userId);
  revalidatePath(`/trackers/${trackerId}`);
}
