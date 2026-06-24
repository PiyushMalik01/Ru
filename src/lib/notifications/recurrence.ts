// Minimal RRULE-style recurrence parser for reminders.
//
// We support the subset that real reminders actually need: daily / weekly /
// monthly / yearly with an optional INTERVAL, and weekly with BYDAY. Anything
// more exotic (BYMONTHDAY, COUNT, UNTIL, EXDATE) returns null — the reminder
// just stops recurring, which is a safe failure mode.
//
// Format examples:
//   FREQ=DAILY
//   FREQ=DAILY;INTERVAL=2
//   FREQ=WEEKLY;BYDAY=MO,WE,FR
//   FREQ=MONTHLY
//   FREQ=YEARLY

const WEEKDAY_MAP: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

interface ParsedRule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  byDay: number[] | null;
}

function parseRule(rule: string): ParsedRule | null {
  const parts = rule.split(";").map((p) => p.trim()).filter(Boolean);
  const map: Record<string, string> = {};
  for (const p of parts) {
    const [k, v] = p.split("=");
    if (k && v) map[k.toUpperCase()] = v.toUpperCase();
  }
  const freq = map.FREQ;
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") return null;
  const interval = map.INTERVAL ? Math.max(1, parseInt(map.INTERVAL, 10) || 1) : 1;
  let byDay: number[] | null = null;
  if (map.BYDAY) {
    byDay = map.BYDAY
      .split(",")
      .map((d) => WEEKDAY_MAP[d.trim()])
      .filter((n) => typeof n === "number");
    if (byDay.length === 0) byDay = null;
  }
  return { freq, interval, byDay };
}

/**
 * Given the last fire and a recurrence rule, compute the next fire time
 * strictly *after* `lastFire`. Returns null if the rule is unparseable.
 *
 * The reference date controls time-of-day: the next fire keeps the same
 * hour/minute as `lastFire`, just advanced by the rule's cadence.
 */
export function nextRecurrence(lastFire: Date, rule: string): Date | null {
  const parsed = parseRule(rule);
  if (!parsed) return null;

  const out = new Date(lastFire.getTime());

  switch (parsed.freq) {
    case "DAILY":
      out.setUTCDate(out.getUTCDate() + parsed.interval);
      return out;

    case "WEEKLY": {
      if (!parsed.byDay || parsed.byDay.length === 0) {
        // Simple weekly — next week, same day-of-week.
        out.setUTCDate(out.getUTCDate() + 7 * parsed.interval);
        return out;
      }
      // BYDAY: find the next day in the list (in week order), wrapping to
      // the following interval-week if we're past the last matching day.
      const sorted = [...parsed.byDay].sort((a, b) => a - b);
      const currentDow = out.getUTCDay();
      // Find the next listed weekday strictly after today.
      const nextDay = sorted.find((d) => d > currentDow);
      if (nextDay !== undefined) {
        out.setUTCDate(out.getUTCDate() + (nextDay - currentDow));
        return out;
      }
      // Wrap: jump to the first listed day in `interval` weeks.
      const wrapDay = sorted[0];
      const daysToWrap = 7 * parsed.interval - currentDow + wrapDay;
      out.setUTCDate(out.getUTCDate() + daysToWrap);
      return out;
    }

    case "MONTHLY":
      out.setUTCMonth(out.getUTCMonth() + parsed.interval);
      return out;

    case "YEARLY":
      out.setUTCFullYear(out.getUTCFullYear() + parsed.interval);
      return out;
  }
}
