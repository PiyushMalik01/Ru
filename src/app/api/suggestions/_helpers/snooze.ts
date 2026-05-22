/**
 * Resolve a snooze keyword or ISO timestamp into a concrete UTC `Date`.
 *
 * Accepted inputs:
 *  - "1h"            → now + 1 hour
 *  - "3h"            → now + 3 hours
 *  - "tomorrow"      → 24h advance of `now`'s local wall-clock hour:minute in `tz`
 *  - "next_morning"  → tomorrow at 09:00 local time in `tz`
 *  - ISO 8601 string → parsed directly
 *
 * Timezone math is done with `Intl.DateTimeFormat` and a small fixed-point
 * iteration so DST transitions land on the expected local clock time without
 * pulling in a TZ library.
 */
export type SnoozeKeyword = "1h" | "3h" | "tomorrow" | "next_morning";

export const SNOOZE_KEYWORDS: ReadonlyArray<SnoozeKeyword> = [
  "1h",
  "3h",
  "tomorrow",
  "next_morning",
];

function getLocalParts(
  date: Date,
  timezone: string,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  let hourStr = get("hour");
  // Intl returns "24" for midnight under hour12:false; normalize.
  if (hourStr === "24") hourStr = "00";
  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    hour: parseInt(hourStr, 10),
    minute: parseInt(get("minute"), 10),
  };
}

/**
 * Build a `Date` (UTC) whose wall-clock representation in `timezone` is the
 * given local Y/M/D/H/M. Iterates once to correct for the TZ offset and again
 * for DST edge cases.
 */
function utcForLocal(
  y: number,
  m: number,
  d: number,
  h: number,
  min: number,
  timezone: string,
): Date {
  // First guess: treat the local components as if they were UTC.
  let candidate = new Date(Date.UTC(y, m - 1, d, h, min, 0));
  for (let i = 0; i < 2; i++) {
    const lp = getLocalParts(candidate, timezone);
    // What wall-time does `candidate` display as in `timezone`? Compare to
    // our target and nudge by the delta in milliseconds.
    const observedUtcAsLocal = Date.UTC(
      lp.year,
      lp.month - 1,
      lp.day,
      lp.hour,
      lp.minute,
      0,
    );
    const targetUtcAsLocal = Date.UTC(y, m - 1, d, h, min, 0);
    const delta = targetUtcAsLocal - observedUtcAsLocal;
    if (delta === 0) break;
    candidate = new Date(candidate.getTime() + delta);
  }
  return candidate;
}

/**
 * Add one day to a Y/M/D local calendar date, handling month/year rollover.
 * Returns the new Y/M/D (purely calendar math — no timezone involvement).
 */
function nextLocalDay(
  year: number,
  month: number,
  day: number,
): { year: number; month: number; day: number } {
  // Use a UTC Date purely as an arithmetic vehicle for the rollover. We treat
  // the components as a calendar date — no time-of-day, no TZ semantics here.
  const utc = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

export function isSnoozeKeyword(s: string): s is SnoozeKeyword {
  return (SNOOZE_KEYWORDS as ReadonlyArray<string>).includes(s);
}

/**
 * Compute the snooze-until Date.
 *
 * @param input    Either a recognised keyword or an ISO 8601 timestamp.
 * @param tz       IANA timezone (e.g. "America/Los_Angeles"). Falls back to UTC.
 * @param now      Reference "now" — injectable for tests.
 * @returns        `{ until, keyword }` — `keyword` is the recognised keyword,
 *                 or `null` if the input was an ISO string.
 * @throws         When the input is neither a known keyword nor a valid ISO date.
 */
export function resolveSnoozeUntil(
  input: string,
  tz: string,
  now: Date,
): { until: Date; keyword: SnoozeKeyword | null } {
  const timezone = tz && tz.length > 0 ? tz : "UTC";

  if (isSnoozeKeyword(input)) {
    if (input === "1h") {
      return { until: new Date(now.getTime() + 60 * 60_000), keyword: input };
    }
    if (input === "3h") {
      return { until: new Date(now.getTime() + 3 * 60 * 60_000), keyword: input };
    }
    if (input === "tomorrow") {
      // Tomorrow at the SAME local wall-clock hour:minute the user has now.
      const lp = getLocalParts(now, timezone);
      const t = nextLocalDay(lp.year, lp.month, lp.day);
      const until = utcForLocal(t.year, t.month, t.day, lp.hour, lp.minute, timezone);
      return { until, keyword: input };
    }
    // next_morning → tomorrow 09:00 local.
    const lp = getLocalParts(now, timezone);
    const t = nextLocalDay(lp.year, lp.month, lp.day);
    const until = utcForLocal(t.year, t.month, t.day, 9, 0, timezone);
    return { until, keyword: input };
  }

  // Otherwise: parse as ISO.
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`invalid snooze 'until': ${input}`);
  }
  return { until: parsed, keyword: null };
}
