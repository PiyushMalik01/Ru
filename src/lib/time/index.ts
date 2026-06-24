// Single source of truth for "now" across the platform. Everything that
// compares a stored timestamp to the present — UI lists, AI context, crons,
// detectors — routes through here so we apply the user's timezone consistently
// and decide staleness from one policy table instead of N inconsistent
// `new Date()` calls.
//
// Two principles:
//   1. "Today" is wall-clock in the user's timezone. The platform stores
//      everything as UTC ISO 8601, but day boundaries (start-of-today, etc.)
//      are computed in the user's zone so a 11pm-Tokyo task isn't accidentally
//      tomorrow's task for a UTC server.
//   2. Staleness is a per-entity policy. Tasks linger longer than reminders.
//      The policy table here is the only place those numbers live.

export type AgeBucket =
  | "future"      // start_at / due_at is later than now
  | "today"       // due/scheduled inside the user's current day
  | "this_week"   // within the past 7 days
  | "recent"      // 8–29 days
  | "stale"       // 30–89 days
  | "ancient";    // 90+ days

export interface NowContext {
  /** Wall-clock now in the user's timezone, as a Date for arithmetic. */
  now: Date;
  /** IANA timezone string (e.g., "America/Los_Angeles"). Falls back to "UTC". */
  timezone: string;
  /** YYYY-MM-DD for the user's current day. */
  todayKey: string;
  /** Start of today in user TZ, as a UTC instant. */
  startOfTodayUtc: Date;
  /** Start of tomorrow in user TZ, as a UTC instant. */
  startOfTomorrowUtc: Date;
}

/** Build the now-context for a user. Pass the profile timezone string. */
export function buildNow(timezone: string | null | undefined, at: Date = new Date()): NowContext {
  const tz = timezone && timezone.trim() ? timezone : "UTC";
  const todayKey = formatDateKey(at, tz);
  const startOfTodayUtc = startOfDayInTz(at, tz);
  const startOfTomorrowUtc = new Date(startOfTodayUtc.getTime() + 24 * 60 * 60 * 1000);
  return { now: at, timezone: tz, todayKey, startOfTodayUtc, startOfTomorrowUtc };
}

/** YYYY-MM-DD for a given instant in a given IANA tz. Uses Intl, no luxon dep. */
export function formatDateKey(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}-${m}-${day}`;
}

/** Start of the user's current day, returned as a UTC instant. */
export function startOfDayInTz(d: Date, tz: string): Date {
  // Compute the user's wall-clock components, then construct an ISO that
  // represents midnight in that wall-clock and convert back to UTC by reading
  // it as if it were UTC then subtracting the offset.
  const dateKey = formatDateKey(d, tz);
  // Probe: midnight UTC of that date, then find what wall-clock the user sees
  // and subtract the gap.
  const utcMidnight = new Date(`${dateKey}T00:00:00Z`);
  const tzOffsetMin = tzOffsetMinutes(utcMidnight, tz);
  return new Date(utcMidnight.getTime() - tzOffsetMin * 60 * 1000);
}

/** Minutes east of UTC for a given instant in a given tz. */
function tzOffsetMinutes(d: Date, tz: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
  });
  const parts = fmt.formatToParts(d);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  // "GMT", "GMT+5:30", "GMT-8" → minutes
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === "+" ? 1 : -1;
  const hours = parseInt(match[2], 10);
  const minutes = match[3] ? parseInt(match[3], 10) : 0;
  return sign * (hours * 60 + minutes);
}

// ── Staleness policy ──────────────────────────────────────────────────────
// One table for the whole platform. Tweak here, every consumer feels it.

export interface StalenessPolicy {
  /** Past-due tasks become stale after this many days. */
  taskStaleDays: number;
  /** Past-due tasks become ancient (auto-archive) after this many days. */
  taskAncientDays: number;
  /** Completed tasks auto-archive after this many days. */
  completedTaskArchiveDays: number;
  /** Sent reminders auto-archive after this many days. */
  sentReminderArchiveDays: number;
  /** Dismissed reminders auto-archive after this many days. */
  dismissedReminderArchiveDays: number;
  /** Missed tasks auto-archive after this many days past due. */
  missedTaskArchiveDays: number;
}

export const DEFAULT_POLICY: StalenessPolicy = {
  taskStaleDays: 30,
  taskAncientDays: 90,
  completedTaskArchiveDays: 14,
  sentReminderArchiveDays: 14,
  dismissedReminderArchiveDays: 7,
  missedTaskArchiveDays: 30,
};

// ── Age bucketing ─────────────────────────────────────────────────────────

export function bucketAge(timestampIso: string | null, ctx: NowContext): AgeBucket | null {
  if (!timestampIso) return null;
  const t = new Date(timestampIso).getTime();
  if (Number.isNaN(t)) return null;
  const nowMs = ctx.now.getTime();
  const diffDays = (nowMs - t) / (24 * 60 * 60 * 1000);
  if (diffDays < 0) return "future";
  if (t >= ctx.startOfTodayUtc.getTime() && t < ctx.startOfTomorrowUtc.getTime()) return "today";
  if (diffDays < 7) return "this_week";
  if (diffDays < 30) return "recent";
  if (diffDays < 90) return "stale";
  return "ancient";
}

/** Human-readable age delta for the AI prompt. */
export function describeAge(timestampIso: string | null, ctx: NowContext): string {
  if (!timestampIso) return "no date";
  const t = new Date(timestampIso).getTime();
  if (Number.isNaN(t)) return "invalid date";
  const diffMs = ctx.now.getTime() - t;
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);
  const day = 24 * 60 * 60 * 1000;
  const days = Math.floor(abs / day);

  if (days === 0) {
    const hours = Math.floor(abs / (60 * 60 * 1000));
    if (hours === 0) return future ? "in <1h" : "<1h ago";
    return future ? `in ${hours}h` : `${hours}h ago`;
  }
  if (days < 30) return future ? `in ${days}d` : `${days}d ago`;
  if (days < 365) {
    const months = Math.round(days / 30);
    return future ? `in ${months}mo` : `${months}mo ago`;
  }
  const years = (days / 365).toFixed(1);
  return future ? `in ${years}y` : `${years}y ago`;
}

// ── Task / reminder staleness predicates ──────────────────────────────────

export function isTaskAncient(
  task: { due_at: string | null; status: string; completed_at: string | null },
  ctx: NowContext,
  policy: StalenessPolicy = DEFAULT_POLICY,
): boolean {
  if (task.status === "completed") {
    if (!task.completed_at) return false;
    const ageDays = (ctx.now.getTime() - new Date(task.completed_at).getTime()) / (24 * 60 * 60 * 1000);
    return ageDays > policy.completedTaskArchiveDays;
  }
  if (task.status === "missed") {
    if (!task.due_at) return false;
    const ageDays = (ctx.now.getTime() - new Date(task.due_at).getTime()) / (24 * 60 * 60 * 1000);
    return ageDays > policy.missedTaskArchiveDays;
  }
  // pending / in_progress
  if (!task.due_at) return false;
  const ageDays = (ctx.now.getTime() - new Date(task.due_at).getTime()) / (24 * 60 * 60 * 1000);
  return ageDays > policy.taskAncientDays;
}

export function isReminderAncient(
  reminder: { remind_at: string; status: string },
  ctx: NowContext,
  policy: StalenessPolicy = DEFAULT_POLICY,
): boolean {
  const ageDays = (ctx.now.getTime() - new Date(reminder.remind_at).getTime()) / (24 * 60 * 60 * 1000);
  if (reminder.status === "sent") return ageDays > policy.sentReminderArchiveDays;
  if (reminder.status === "dismissed") return ageDays > policy.dismissedReminderArchiveDays;
  // pending — only ancient if WAY past the remind_at (effectively forgotten)
  return ageDays > policy.taskAncientDays;
}
