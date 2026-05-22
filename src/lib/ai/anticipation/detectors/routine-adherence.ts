import type { Candidate, Detector, DetectorContext, PhrasingHint } from "../types";

// ---------------------------------------------------------------------------
// Routine adherence detector
// ---------------------------------------------------------------------------
// Triggers when a routine's `time_of_day` is approaching in the user's local
// timezone AND today's instance has NOT been completed AND today is in fact
// a scheduled day for the routine.
//
// Skip conditions:
//   - no active routines
//   - routine has no time_of_day anchor
//   - today is not a scheduled day for this routine (frequency + custom_days)
//   - the wall-clock anchor is > 90 min in the future, or > 60 min in the past
//   - a routine_log exists for today with completed=true
//   - behavioral adherence on today's DOW is < 0.5 (no longer really a routine)
// ---------------------------------------------------------------------------

const LOOKAHEAD_MIN = 90;
const GRACE_PAST_MIN = 60;
const SHOW_LEAD_MIN = 30;
const MIN_CONFIDENCE = 0.55;
const MAX_CONFIDENCE = 0.95;
const DEFAULT_CONFIDENCE = 0.7;
const ADHERENCE_SKIP_FLOOR = 0.5;

type RoutineFrequency = "daily" | "weekdays" | "weekly" | "custom";

interface RoutineRow {
  id: string;
  title: string;
  frequency: RoutineFrequency;
  custom_days: number[] | null;
  time_of_day: string | null;
  nudge_level: string;
  is_active: boolean;
}

interface LogRow {
  routine_id: string;
  completed: boolean;
}

/**
 * Local calendar fields for `now` in `tz`. Hour/min/sec are kept as numbers
 * for arithmetic; year/month/day form the YYYY-MM-DD "today" key.
 *
 * `dow`: 0..6 where 0=Sunday (matches JS Date.getDay() and common conventions
 * for `custom_days` arrays).
 */
interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dow: number;
  todayKey: string;
}

function localParts(now: Date, tz: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(now);
  const lookup: Record<string, string> = {};
  for (const p of parts) lookup[p.type] = p.value;
  const year = parseInt(lookup.year ?? "1970", 10);
  const month = parseInt(lookup.month ?? "1", 10);
  const day = parseInt(lookup.day ?? "1", 10);
  // hour "24" can appear with hour12:false in some node versions — normalize.
  let hour = parseInt(lookup.hour ?? "0", 10);
  if (hour === 24) hour = 0;
  const minute = parseInt(lookup.minute ?? "0", 10);
  const second = parseInt(lookup.second ?? "0", 10);
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dow = weekdayMap[lookup.weekday ?? "Sun"] ?? 0;
  const todayKey = `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  return { year, month, day, hour, minute, second, dow, todayKey };
}

/**
 * Returns the UTC timestamp (ms) corresponding to (Y, M, D, H, M) wall-clock
 * time in `tz`. Uses Intl to invert the timezone offset for that moment.
 *
 * Algorithm: assume the wall time is UTC, then ask Intl how that UTC moment
 * appears in `tz`. The diff between the "appears as" and the target wall time
 * is the tz offset at that moment; subtract it to get the real UTC.
 *
 * One-pass is correct except across the DST transition hour; we re-run once
 * with the corrected guess to be safe.
 */
function wallTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string
): number {
  const targetMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const offset = (guessMs: number): number => {
    const parts = localParts(new Date(guessMs), tz);
    const asLocalMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
    return asLocalMs - guessMs; // tz offset in ms (positive east of UTC)
  };
  const off1 = offset(targetMs);
  const guess1 = targetMs - off1;
  const off2 = offset(guess1);
  return targetMs - off2;
}

function parseTimeOfDay(t: string): { hour: number; minute: number } | null {
  // Postgres time -> "HH:MM:SS" or "HH:MM"
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(t);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function isScheduledToday(
  frequency: RoutineFrequency,
  customDays: number[] | null,
  dow: number
): boolean {
  switch (frequency) {
    case "daily":
      return true;
    case "weekdays":
      return dow >= 1 && dow <= 5;
    case "weekly":
      // weekly with no day pin — let the custom_days field (if present)
      // determine the single anchor day. If absent, treat as scheduled
      // (the routine's "weekly" cadence isn't specific enough to skip).
      if (customDays && customDays.length > 0) return customDays.includes(dow);
      return true;
    case "custom":
      if (!customDays || customDays.length === 0) return false;
      return customDays.includes(dow);
    default:
      return false;
  }
}

function clampConfidence(x: number): number {
  if (!Number.isFinite(x)) return DEFAULT_CONFIDENCE;
  if (x < MIN_CONFIDENCE) return MIN_CONFIDENCE;
  if (x > MAX_CONFIDENCE) return MAX_CONFIDENCE;
  return x;
}

function adherenceFor(
  byDow: Record<string, number> | undefined,
  routineId: string,
  routineTitle: string,
  dow: number
): number | null {
  if (!byDow) return null;
  // The behavioral model may be keyed by id, title, or `id:dow` / `title:dow`.
  // Probe a handful of plausible keys; first numeric hit wins.
  const titleLower = routineTitle.toLowerCase();
  const probes = [
    `${routineId}:${dow}`,
    `${titleLower}:${dow}`,
    `${routineTitle}:${dow}`,
    routineId,
    titleLower,
    routineTitle,
  ];
  for (const key of probes) {
    const v = byDow[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function buildPhrasingHint(
  routineTitle: string,
  hhmm: string,
  adherence: number | null
): PhrasingHint {
  const data: Record<string, unknown> = {
    routineTitle,
    typicalTime: hhmm,
  };
  if (adherence !== null) data.adherenceRate = Number(adherence.toFixed(2));
  return {
    situation: `User's daily routine '${routineTitle}' is coming up at ${hhmm}; they haven't completed it today.`,
    tone: "gentle",
    data,
    examples: [
      `Your ${routineTitle} is coming up around ${hhmm} — want a heads-up?`,
      `Gentle nudge: ${routineTitle} usually happens around ${hhmm}.`,
      `${routineTitle}'s window is opening soon. No pressure if today's off.`,
    ],
  };
}

function formatHHMM(hour: number, minute: number): string {
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

export const routineAdherenceDetector: Detector = {
  name: "routine-adherence",
  async run(ctx: DetectorContext): Promise<Candidate[]> {
    try {
      const { supabase, userId, now, timezone, memoryProfile } = ctx;
      const tz = timezone || "UTC";
      const today = localParts(now, tz);
      const nowMs = now.getTime();

      // ----- 1. Load active routines for user -----
      const { data: routinesData, error: routinesErr } = await supabase
        .from("routines")
        .select("id, title, frequency, custom_days, time_of_day, nudge_level, is_active")
        .eq("user_id", userId)
        .eq("is_active", true);

      if (routinesErr) return [];
      const routines = (routinesData ?? []) as unknown as RoutineRow[];
      if (routines.length === 0) return [];

      // Pre-filter to today-scheduled routines with a usable time_of_day and
      // a wall-clock anchor in the [-60, +90] min window. This avoids querying
      // routine_logs for routines we'd skip anyway.
      type Eligible = {
        routine: RoutineRow;
        anchorUtcMs: number;
        hhmm: string;
      };
      const eligible: Eligible[] = [];

      for (const r of routines) {
        if (!r.time_of_day) continue;
        if (!isScheduledToday(r.frequency, r.custom_days, today.dow)) continue;
        const parsed = parseTimeOfDay(r.time_of_day);
        if (!parsed) continue;
        const anchorUtcMs = wallTimeToUtcMs(
          today.year,
          today.month,
          today.day,
          parsed.hour,
          parsed.minute,
          tz
        );
        const deltaMin = (anchorUtcMs - nowMs) / 60_000;
        if (deltaMin > LOOKAHEAD_MIN) continue;
        if (deltaMin < -GRACE_PAST_MIN) continue;
        eligible.push({
          routine: r,
          anchorUtcMs,
          hhmm: formatHHMM(parsed.hour, parsed.minute),
        });
      }

      if (eligible.length === 0) return [];

      // ----- 2. Filter out already-completed-today routines -----
      const ids = eligible.map((e) => e.routine.id);
      const { data: logsData, error: logsErr } = await supabase
        .from("routine_logs")
        .select("routine_id, completed")
        .eq("user_id", userId)
        .eq("logged_date", today.todayKey)
        .in("routine_id", ids);

      if (logsErr) return [];
      const completedIds = new Set<string>(
        ((logsData ?? []) as unknown as LogRow[])
          .filter((l) => l.completed === true)
          .map((l) => l.routine_id)
      );

      // ----- 3. Emit candidates -----
      const candidates: Candidate[] = [];
      const byDow = memoryProfile?.behavioral_model?.routine_completion_by_dow;

      for (const e of eligible) {
        if (completedIds.has(e.routine.id)) continue;

        const adherence = adherenceFor(byDow, e.routine.id, e.routine.title, today.dow);
        if (adherence !== null && adherence < ADHERENCE_SKIP_FLOOR) continue;

        const confidence =
          adherence !== null ? clampConfidence(adherence) : DEFAULT_CONFIDENCE;

        const showAt = new Date(e.anchorUtcMs - SHOW_LEAD_MIN * 60_000);
        const expiresAt = new Date(e.anchorUtcMs + GRACE_PAST_MIN * 60_000);

        candidates.push({
          type: "routine_adherence",
          payload: {
            routineId: e.routine.id,
            routineTitle: e.routine.title,
            typicalTime: e.hhmm,
            nudgeLevel: e.routine.nudge_level,
            adherenceRate: adherence,
            localDate: today.todayKey,
          },
          dedupKey: `routine:${e.routine.id}:${today.todayKey}`,
          confidence,
          priority: "soft",
          showAt,
          expiresAt,
          phrasingHint: buildPhrasingHint(e.routine.title, e.hhmm, adherence),
        });
      }

      return candidates;
    } catch {
      return [];
    }
  },
};
