import type { Candidate, Detector, DetectorContext } from "../types";

// ---------------------------------------------------------------------------
// routine-candidates
// ---------------------------------------------------------------------------
// Finds repeating patterns in activity_log that could become routines.
//
// Trigger conditions (all must hold):
//   - normalized activity occurred >= 4 times in last 14 days
//   - those occurrences cluster around a single hour-of-day (+/-90 min)
//   - distinct days >= 4 (so 4 logs on 2 days doesn't qualify)
//   - no existing active routine fuzzy-matches the normalized activity
// ---------------------------------------------------------------------------

const LOOKBACK_DAYS = 14;
const MIN_OCCURRENCES = 4;
const MIN_DISTINCT_DAYS = 4;
const CLUSTER_HALF_WIDTH_HOURS = 1.5; // +/-90 min

// Lead phrases we strip when normalizing.
// Order matters: longest/most-specific patterns first.
const LEAD_STRIP = [
  /^i\s+(?:just\s+|already\s+)?/,
  /^(?:just\s+|already\s+)/,
  /^(?:did|do|done|doing)\s+(?:a|an|some|the|my)?\s*/,
  /^went\s+to\s+(?:a|an|the|my)?\s*/,
  /^had\s+(?:a|an|some|my)?\s*/,
  /^took\s+(?:a|an|the|my)?\s*/,
  /^made\s+(?:a|an|some|my)?\s*/,
  /^got\s+(?:a|an|some|my)?\s*/,
  /^finished\s+(?:a|an|the|my)?\s*/,
  /^started\s+(?:a|an|the|my)?\s*/,
  /^a\s+/,
  /^an\s+/,
  /^the\s+/,
  /^my\s+/,
  /^some\s+/,
];

function normalizeActivity(raw: string): string {
  let s = raw.toLowerCase().trim();
  // collapse whitespace, drop trailing punctuation
  s = s.replace(/[.!?,;:]+$/g, "").replace(/\s+/g, " ");
  // strip a single leading filler phrase, repeat once in case nested
  for (let i = 0; i < 2; i++) {
    for (const re of LEAD_STRIP) {
      const next = s.replace(re, "");
      if (next !== s) {
        s = next.trim();
        break;
      }
    }
  }
  return s;
}

interface ActivityRow {
  id: string;
  activity: string;
  category: string | null;
  timestamp: string; // ISO
}

interface OccurrenceInfo {
  id: string;
  ts: Date;
  hour: number; // local hour-of-day, fractional
  dow: number;  // 0-6 in local TZ
  localDate: string; // YYYY-MM-DD in local TZ (for distinct-day counting)
}

/**
 * Extract local-time components for a date in an IANA timezone.
 * Uses Intl.DateTimeFormat — no external deps.
 */
function getLocalParts(date: Date, timezone: string): {
  hour: number;
  minute: number;
  dow: number;
  ymd: string;
} {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  let hourStr = get("hour");
  // Intl sometimes returns "24" for midnight under hour12:false; normalize.
  if (hourStr === "24") hourStr = "00";
  const minute = parseInt(get("minute"), 10);
  const hour = parseInt(hourStr, 10);
  const weekday = get("weekday"); // "Mon", "Tue", ...
  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dow = dowMap[weekday] ?? 0;
  return {
    hour,
    minute,
    dow,
    ymd: `${year}-${month}-${day}`,
  };
}

/**
 * Find the densest +/-90min cluster among hour-values. Returns the indices
 * of occurrences in that cluster and the mean hour of the cluster.
 *
 * Hours are circular (00 wraps to 24); we handle the wrap by trying each
 * occurrence as the cluster center and counting neighbors with circular
 * distance <= half-width.
 */
function densestHourCluster(hours: number[]): {
  memberIndices: number[];
  meanHour: number;
} {
  if (hours.length === 0) return { memberIndices: [], meanHour: 0 };
  let bestMembers: number[] = [];
  for (let i = 0; i < hours.length; i++) {
    const center = hours[i];
    const members: number[] = [];
    for (let j = 0; j < hours.length; j++) {
      const d = Math.min(
        Math.abs(hours[j] - center),
        24 - Math.abs(hours[j] - center),
      );
      if (d <= CLUSTER_HALF_WIDTH_HOURS) members.push(j);
    }
    if (members.length > bestMembers.length) bestMembers = members;
  }
  // Compute circular mean of the cluster.
  // Use vector mean on the unit circle to be robust to wrap-around.
  let sumX = 0;
  let sumY = 0;
  for (const idx of bestMembers) {
    const theta = (hours[idx] / 24) * 2 * Math.PI;
    sumX += Math.cos(theta);
    sumY += Math.sin(theta);
  }
  let meanTheta = Math.atan2(sumY / bestMembers.length, sumX / bestMembers.length);
  if (meanTheta < 0) meanTheta += 2 * Math.PI;
  const meanHour = (meanTheta / (2 * Math.PI)) * 24;
  return { memberIndices: bestMembers, meanHour };
}

function formatHHMM(hourFloat: number): string {
  let h = Math.floor(hourFloat) % 24;
  let m = Math.round((hourFloat - Math.floor(hourFloat)) * 60);
  if (m === 60) {
    m = 0;
    h = (h + 1) % 24;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function inferCadence(dows: number[]): {
  guess: "weekdays" | "daily" | "custom";
  dowList?: number[];
} {
  const uniq = Array.from(new Set(dows));
  const isWeekday = (d: number) => d >= 1 && d <= 5;
  const allWeekday = uniq.every(isWeekday);
  if (allWeekday && uniq.length >= 3) return { guess: "weekdays" };
  if (uniq.length >= 6) return { guess: "daily" };
  return { guess: "custom", dowList: uniq.sort((a, b) => a - b) };
}

/** Compute next 09:00 local time as a UTC Date. */
function nextMorning9amLocal(now: Date, timezone: string): Date {
  const { hour, ymd } = getLocalParts(now, timezone);
  // If it's currently before 9am local, we still want *tomorrow* 9am
  // per the spec ("tomorrow morning at 9am"). Always add 1 day.
  // ymd is today's local date.
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  // Build a Date at 09:00 local for the day after today.
  // We do this by constructing a UTC date for the target local wall-time and
  // then correcting for the offset between that wall-time and UTC.
  const targetLocal = new Date(Date.UTC(y, m - 1, d + 1, 9, 0, 0));
  // Find what local time targetLocal currently represents in `timezone`,
  // then nudge by the delta. Iterate twice for DST safety.
  let candidate = targetLocal;
  for (let i = 0; i < 2; i++) {
    const lp = getLocalParts(candidate, timezone);
    const observedUtcMs = Date.UTC(
      parseInt(lp.ymd.slice(0, 4), 10),
      parseInt(lp.ymd.slice(5, 7), 10) - 1,
      parseInt(lp.ymd.slice(8, 10), 10),
      lp.hour,
      lp.minute,
    );
    const desiredUtcMs = Date.UTC(y, m - 1, d + 1, 9, 0);
    const delta = desiredUtcMs - observedUtcMs;
    if (delta === 0) break;
    candidate = new Date(candidate.getTime() + delta);
  }
  // Defensive: never showAt in the past.
  if (candidate.getTime() < now.getTime()) {
    candidate = new Date(now.getTime() + 60 * 60 * 1000);
  }
  // Suppress unused-var lint for `hour` (kept for readability in spec):
  void hour;
  return candidate;
}

export const routineCandidatesDetector: Detector = {
  name: "routine-candidates",
  async run(ctx: DetectorContext): Promise<Candidate[]> {
    try {
      const sinceIso = new Date(
        ctx.now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { data, error } = await ctx.supabase
        .from("activity_log")
        .select("id, activity, category, timestamp")
        .eq("user_id", ctx.userId)
        .gte("timestamp", sinceIso)
        .order("timestamp", { ascending: false })
        .limit(2000);

      if (error || !data) return [];
      const rows = data as ActivityRow[];
      if (rows.length === 0) return [];

      // Group by normalized activity.
      const groups = new Map<string, OccurrenceInfo[]>();
      for (const r of rows) {
        if (!r.activity || typeof r.activity !== "string") continue;
        const key = normalizeActivity(r.activity);
        if (!key || key.length < 2) continue;
        const ts = new Date(r.timestamp);
        if (Number.isNaN(ts.getTime())) continue;
        const { hour, minute, dow, ymd } = getLocalParts(ts, ctx.timezone);
        const info: OccurrenceInfo = {
          id: r.id,
          ts,
          hour: hour + minute / 60,
          dow,
          localDate: ymd,
        };
        const arr = groups.get(key);
        if (arr) arr.push(info);
        else groups.set(key, [info]);
      }

      const candidates: Candidate[] = [];

      for (const [pattern, occs] of groups) {
        if (occs.length < MIN_OCCURRENCES) continue;

        // Cluster by hour-of-day (+/-90 min).
        const hours = occs.map((o) => o.hour);
        const { memberIndices, meanHour } = densestHourCluster(hours);
        if (memberIndices.length < MIN_OCCURRENCES) continue;

        const clusterOccs = memberIndices.map((i) => occs[i]);
        const distinctDays = new Set(clusterOccs.map((o) => o.localDate)).size;
        if (distinctDays < MIN_DISTINCT_DAYS) continue;

        // Existing-routine check via fuzzy RPC.
        let alreadyExists = false;
        try {
          const { data: matchData, error: matchErr } = await ctx.supabase.rpc(
            "match_active_routine",
            {
              p_user_id: ctx.userId,
              p_query: pattern,
              p_threshold: 0.4,
            } as never,
          );
          if (!matchErr && Array.isArray(matchData) && matchData.length > 0) {
            alreadyExists = true;
          }
        } catch {
          // RPC failure shouldn't kill the detector — just skip dedup check.
        }
        if (alreadyExists) continue;

        // Cadence inference.
        const dows = clusterOccs.map((o) => o.dow);
        const cadence = inferCadence(dows);

        // Confidence assembly.
        let confidence = 0.6;
        if (clusterOccs.length >= 6) confidence += 0.1;
        if (distinctDays >= 7) confidence += 0.1;
        if (cadence.guess === "weekdays" && clusterOccs.every((o) => o.dow >= 1 && o.dow <= 5)) {
          confidence += 0.05;
        }
        if (confidence > 0.9) confidence = 0.9;

        const typicalTime = formatHHMM(meanHour);
        const roundedHour = Math.round(meanHour) % 24;
        const showAt = nextMorning9amLocal(ctx.now, ctx.timezone);

        const cadenceLabel =
          cadence.guess === "custom"
            ? `custom (${(cadence.dowList ?? []).join(",")})`
            : cadence.guess;

        const exampleByCadence: Record<string, string[]> = {
          weekdays: [
            `You've logged "${pattern}" most weekday mornings around ${typicalTime} — want me to make it a routine?`,
            `That's ${clusterOccs.length} ${pattern} sessions this fortnight, almost always weekday mornings. Routine?`,
            `"${pattern}" keeps showing up on weekdays near ${typicalTime}. Should I set a routine so it sticks?`,
          ],
          daily: [
            `You've logged "${pattern}" ${clusterOccs.length} times in two weeks, pretty close to ${typicalTime} each day. Make it a routine?`,
            `Daily-ish "${pattern}" around ${typicalTime} — want me to formalize it?`,
            `${clusterOccs.length} "${pattern}"s in 14 days, mostly around ${typicalTime}. Routine territory?`,
          ],
          custom: [
            `"${pattern}" has happened ${clusterOccs.length} times in two weeks, usually around ${typicalTime}. Want it as a routine?`,
            `I'm seeing a "${pattern}" pattern near ${typicalTime} — should I treat it as a routine?`,
            `That's ${clusterOccs.length} "${pattern}"s, mostly around ${typicalTime}. Make it official?`,
          ],
        };

        candidates.push({
          type: "routine_candidate",
          priority: "soft",
          confidence,
          showAt,
          dedupKey: `candidate:${pattern}:${roundedHour}`,
          payload: {
            pattern,
            occurrencesCount: clusterOccs.length,
            typicalHour: Number(meanHour.toFixed(2)),
            distinctDays,
            cadenceGuess: cadenceLabel,
            sampleActivityIds: clusterOccs.slice(0, 5).map((o) => o.id),
          },
          phrasingHint: {
            situation: `User has logged "${pattern}" ${clusterOccs.length} times in 14 days, typically around ${typicalTime}; no matching routine exists`,
            tone: "curious",
            data: {
              pattern,
              occurrencesCount: clusterOccs.length,
              typicalTime,
              cadenceGuess: cadenceLabel,
            },
            examples: exampleByCadence[cadence.guess],
          },
        });
      }

      return candidates;
    } catch {
      return [];
    }
  },
};
