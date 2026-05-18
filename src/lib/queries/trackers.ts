// Server-side queries for trackers and their entries.
//
// Field schema is stored as JSONB on the row, so we treat it as opaque at the
// DB layer and narrow it at use sites. Same for entry `values`.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supabase = SupabaseClient<Database>;

export type TrackerFieldType = "number" | "text" | "duration";

export interface TrackerField {
  /** Stable key the entry blob is keyed by. lowercase + snake_case. */
  key: string;
  /** Human-facing label. */
  label: string;
  type: TrackerFieldType;
  /** Optional unit suffix (km, kg, min, …) */
  unit?: string;
}

export interface TrackerDisplayConfig {
  /** Chart type for the detail page. */
  chart_type?: "line" | "bar" | "area";
  /** Which field to plot. Defaults to the first numeric field. */
  primary_field?: string;
}

export interface Tracker {
  id: string;
  name: string;
  description: string | null;
  fields: TrackerField[];
  display_config: TrackerDisplayConfig;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface TrackerEntry {
  id: string;
  tracker_id: string;
  values: Record<string, number | string>;
  notes: string | null;
  entered_at: string;
}

function asFields(json: unknown): TrackerField[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null)
    .map((f) => ({
      key: String(f.key ?? ""),
      label: String(f.label ?? f.key ?? ""),
      type: (f.type as TrackerFieldType) ?? "number",
      unit: f.unit ? String(f.unit) : undefined,
    }))
    .filter((f) => f.key.length > 0);
}

function asDisplayConfig(json: unknown): TrackerDisplayConfig {
  if (typeof json !== "object" || json === null) return {};
  const o = json as Record<string, unknown>;
  return {
    chart_type: (o.chart_type as TrackerDisplayConfig["chart_type"]) ?? undefined,
    primary_field: o.primary_field ? String(o.primary_field) : undefined,
  };
}

function rowToTracker(row: Record<string, unknown>): Tracker {
  return {
    id: String(row.id),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    fields: asFields(row.fields),
    display_config: asDisplayConfig(row.display_config),
    archived: Boolean(row.archived),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listTrackers(
  supabase: Supabase,
  userId: string,
): Promise<Tracker[]> {
  const { data } = await supabase
    .from("trackers")
    .select("*")
    .eq("user_id", userId)
    .eq("archived", false)
    .order("updated_at", { ascending: false });
  return (data ?? []).map(rowToTracker);
}

export async function fetchTracker(
  supabase: Supabase,
  userId: string,
  id: string,
): Promise<Tracker | null> {
  const { data } = await supabase
    .from("trackers")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  return data ? rowToTracker(data) : null;
}

export async function fetchTrackerEntries(
  supabase: Supabase,
  userId: string,
  trackerId: string,
  opts: { limit?: number } = {},
): Promise<TrackerEntry[]> {
  const { data } = await supabase
    .from("tracker_entries")
    .select("id, tracker_id, values, notes, entered_at")
    .eq("user_id", userId)
    .eq("tracker_id", trackerId)
    .order("entered_at", { ascending: false })
    .limit(opts.limit ?? 200);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    tracker_id: String(r.tracker_id),
    values: (r.values as Record<string, number | string>) ?? {},
    notes: r.notes,
    entered_at: r.entered_at,
  }));
}

export interface TrackerStats {
  entryCount: number;
  lastEnteredAt: string | null;
  /** Days in a row with at least one entry, ending today. */
  streakDays: number;
  /** Avg of the primary numeric field across all entries, if numeric. */
  primaryAvg: number | null;
  /** Sum of the primary numeric field. */
  primarySum: number | null;
}

export function computeStats(tracker: Tracker, entries: TrackerEntry[]): TrackerStats {
  const entryCount = entries.length;
  const lastEnteredAt = entries[0]?.entered_at ?? null;

  // Streak: consecutive days back from today (UTC) with at least one entry.
  // Entries arrive newest-first.
  const days = new Set<string>();
  for (const e of entries) {
    days.add(e.entered_at.slice(0, 10));
  }
  let streakDays = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    if (days.has(iso)) streakDays += 1;
    else if (i > 0) break;
    // If today has no entry, streak is 0 unless previous days have any.
    if (i === 0 && !days.has(iso)) {
      // allow yesterday-anchored streaks too
      continue;
    }
  }

  // Pick a numeric primary field.
  const primaryKey =
    tracker.display_config.primary_field ??
    tracker.fields.find((f) => f.type === "number" || f.type === "duration")?.key ??
    null;

  let primaryAvg: number | null = null;
  let primarySum: number | null = null;
  if (primaryKey) {
    const nums: number[] = [];
    for (const e of entries) {
      const v = e.values?.[primaryKey];
      if (typeof v === "number" && Number.isFinite(v)) nums.push(v);
    }
    if (nums.length > 0) {
      primarySum = nums.reduce((a, b) => a + b, 0);
      primaryAvg = primarySum / nums.length;
    }
  }

  return { entryCount, lastEnteredAt, streakDays, primaryAvg, primarySum };
}

export function primaryField(tracker: Tracker): TrackerField | null {
  const k = tracker.display_config.primary_field;
  if (k) {
    const f = tracker.fields.find((x) => x.key === k);
    if (f) return f;
  }
  return tracker.fields.find((f) => f.type === "number" || f.type === "duration") ?? null;
}
