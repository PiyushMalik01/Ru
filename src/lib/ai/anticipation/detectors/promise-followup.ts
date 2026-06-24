import type { Candidate, Detector, DetectorContext, PhrasingHint } from "../types";

// ---------------------------------------------------------------------------
// Promise follow-up detector
// ---------------------------------------------------------------------------
// Reads unresolved rows from the `promises` table and emits candidates for
// those that look overdue:
//   - due_by IS NULL:    overdue when (now - promised_at) >= DEFAULT_LOOKOUT_DAYS
//   - due_by IS NOT NULL: overdue when now > due_by
//
// Before emitting, we do a heuristic "did the user already deliver?" check
// against `activity_log` and `tasks`. If an entry with a title/activity
// matching the subject (2+ shared tokens of length >=4) has been recorded
// AFTER promised_at, we mark the promise resolved and skip emission.
//
// Phrasing: tone is "gentle" — don't make the user feel bad. Priority bumps
// to "urgent" once a promise is 3+ days past its overdue line.
// ---------------------------------------------------------------------------

const DEFAULT_LOOKOUT_DAYS = 3;
const URGENT_DAYS_OVERDUE = 3;
const BASE_CONFIDENCE = 0.7;
const PER_DAY_CONFIDENCE_BUMP = 0.05;
const MAX_CONFIDENCE = 0.9;
const MIN_TOKEN_LEN = 4;
const MIN_SHARED_TOKENS = 2;
const MS_PER_DAY = 86_400_000;

interface PromiseRow {
  id: string;
  subject: string;
  promised_at: string;
  due_by: string | null;
  resolved: boolean;
  resolved_at: string | null;
}

interface ActivityRow {
  activity: string | null;
  timestamp: string | null;
}

interface TaskRow {
  title: string | null;
  created_at: string | null;
  completed_at: string | null;
}

function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= MIN_TOKEN_LEN);
}

function sharedTokenCount(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let n = 0;
  for (const tok of new Set(a)) {
    if (setB.has(tok)) n++;
  }
  return n;
}

function daysBetween(laterMs: number, earlierMs: number): number {
  return Math.max(0, (laterMs - earlierMs) / MS_PER_DAY);
}

function clampConfidence(x: number): number {
  if (!Number.isFinite(x)) return BASE_CONFIDENCE;
  if (x > MAX_CONFIDENCE) return MAX_CONFIDENCE;
  if (x < BASE_CONFIDENCE) return BASE_CONFIDENCE;
  return x;
}

function buildPhrasingHint(
  subject: string,
  daysOverdue: number,
  dueByIso: string | null
): PhrasingHint {
  const data: Record<string, unknown> = {
    subject,
    daysOverdue,
  };
  if (dueByIso) data.dueBy = dueByIso;
  return {
    situation: `User promised ${daysOverdue} days ago to ${subject}; no matching activity or task found since`,
    tone: "gentle",
    data,
    examples: [
      `Quick check — did you ever get around to ${subject}? No pressure either way.`,
      `Circling back gently: you mentioned you'd ${subject}. Want to make space for it?`,
      `Just floating this back up: ${subject}. Still on your mind, or has the moment passed?`,
    ],
  };
}

export const promiseFollowupDetector: Detector = {
  name: "promise-followup",
  async run(ctx: DetectorContext): Promise<Candidate[]> {
    try {
      const { supabase, userId, now } = ctx;
      const nowMs = now.getTime();
      const nowIso = now.toISOString();

      // ----- 1. Pull unresolved promises -----
      const { data: promisesData, error: promisesErr } = await supabase
        .from("promises")
        .select("id, subject, promised_at, due_by, resolved, resolved_at")
        .eq("user_id", userId)
        .eq("resolved", false);

      if (promisesErr) return [];
      const promises = (promisesData ?? []) as unknown as PromiseRow[];
      if (promises.length === 0) return [];

      // ----- 2. Determine which are overdue -----
      type Overdue = { row: PromiseRow; daysOverdue: number; promisedMs: number };
      const overdue: Overdue[] = [];

      for (const p of promises) {
        const promisedMs = Date.parse(p.promised_at);
        if (!Number.isFinite(promisedMs)) continue;

        if (p.due_by) {
          const dueMs = Date.parse(p.due_by);
          if (!Number.isFinite(dueMs)) continue;
          if (nowMs <= dueMs) continue;
          const daysOverdue = Math.floor(daysBetween(nowMs, dueMs));
          overdue.push({ row: p, daysOverdue, promisedMs });
        } else {
          const ageDays = daysBetween(nowMs, promisedMs);
          if (ageDays < DEFAULT_LOOKOUT_DAYS) continue;
          const daysOverdue = Math.floor(ageDays - DEFAULT_LOOKOUT_DAYS);
          overdue.push({ row: p, daysOverdue, promisedMs });
        }
      }

      if (overdue.length === 0) return [];

      // ----- 3. Resolve-check against activity_log + tasks -----
      // Pull all activity/tasks since the EARLIEST overdue promised_at; we'll
      // per-promise filter in memory. This avoids one query per promise.
      const earliestPromisedMs = Math.min(...overdue.map((o) => o.promisedMs));
      const sinceIso = new Date(earliestPromisedMs).toISOString();

      const [activityRes, tasksRes] = await Promise.all([
        supabase
          .from("activity_log")
          .select("activity, timestamp")
          .eq("user_id", userId)
          .gte("timestamp", sinceIso),
        supabase
          .from("tasks")
          .select("title, created_at, completed_at")
          .eq("user_id", userId)
          .is("archived_at", null)
          .gte("created_at", sinceIso),
      ]);

      const activities = (activityRes.error
        ? []
        : ((activityRes.data ?? []) as unknown as ActivityRow[]));
      const tasks = (tasksRes.error
        ? []
        : ((tasksRes.data ?? []) as unknown as TaskRow[]));

      const candidates: Candidate[] = [];

      for (const o of overdue) {
        const subjectTokens = tokenize(o.row.subject);
        if (subjectTokens.length === 0) {
          // Nothing to match against — still emit but skip resolve check.
        }

        let matched = false;
        if (subjectTokens.length > 0) {
          for (const a of activities) {
            if (!a.activity || !a.timestamp) continue;
            const ts = Date.parse(a.timestamp);
            if (!Number.isFinite(ts) || ts < o.promisedMs) continue;
            if (sharedTokenCount(subjectTokens, tokenize(a.activity)) >= MIN_SHARED_TOKENS) {
              matched = true;
              break;
            }
          }
          if (!matched) {
            for (const t of tasks) {
              if (!t.title) continue;
              // Use the later of created_at / completed_at as the "evidence" time.
              const candidates_ts = [t.created_at, t.completed_at]
                .map((s) => (s ? Date.parse(s) : NaN))
                .filter((n) => Number.isFinite(n)) as number[];
              if (candidates_ts.length === 0) continue;
              const ts = Math.max(...candidates_ts);
              if (ts < o.promisedMs) continue;
              if (sharedTokenCount(subjectTokens, tokenize(t.title)) >= MIN_SHARED_TOKENS) {
                matched = true;
                break;
              }
            }
          }
        }

        if (matched) {
          // Mark resolved + skip. Best-effort: ignore the UPDATE error.
          await supabase
            .from("promises")
            .update({ resolved: true, resolved_at: nowIso })
            .eq("id", o.row.id)
            .eq("user_id", userId);
          continue;
        }

        const confidence = clampConfidence(
          BASE_CONFIDENCE + o.daysOverdue * PER_DAY_CONFIDENCE_BUMP
        );
        const priority = o.daysOverdue >= URGENT_DAYS_OVERDUE ? "urgent" : "soft";

        candidates.push({
          type: "promise_followup",
          payload: {
            promiseId: o.row.id,
            subject: o.row.subject,
            promisedAt: o.row.promised_at,
            dueBy: o.row.due_by ?? undefined,
            daysOverdue: o.daysOverdue,
          },
          dedupKey: `promise:${o.row.id}`,
          confidence,
          priority,
          showAt: now,
          phrasingHint: buildPhrasingHint(o.row.subject, o.daysOverdue, o.row.due_by),
        });
      }

      return candidates;
    } catch {
      return [];
    }
  },
};
