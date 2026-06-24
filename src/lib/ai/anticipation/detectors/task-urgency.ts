import type { Candidate, Detector, DetectorContext, PhrasingHint } from "../types";

// ---------------------------------------------------------------------------
// task-urgency detector
// ---------------------------------------------------------------------------
// Two flavors, both reading from the `tasks` table:
//
// • urgent   — task due in the next 2 days, quiet ≥48h, priority 'urgent'
// • neglected — task due in 3–7 days, quiet ≥72h, priority 'soft'
//
// Both flavors gate on "significance": the task must either belong to a
// workspace OR be flagged 'high'/'medium' priority. Low-priority unattached
// tasks are noise — Ru ignores them.
// ---------------------------------------------------------------------------

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const URGENT_QUIET_HOURS = 48;
const NEGLECTED_QUIET_HOURS = 72;
const URGENT_DAYS = 2;
const WINDOW_DAYS = 7;

const URGENT_BASE = 0.85;
const URGENT_CAP = 0.95;
const NEGLECTED_BASE = 0.65;
const NEGLECTED_CAP = 0.8;

type TaskRow = {
  id: string;
  title: string;
  due_at: string | null;
  status: string;
  priority: string;
  updated_at: string;
  workspace_id: string | null;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function isSignificant(task: TaskRow): boolean {
  if (task.workspace_id !== null && task.workspace_id !== undefined) return true;
  return task.priority === "high" || task.priority === "medium";
}

function urgentExamples(): string[] {
  return [
    "Heads up — '%TITLE%' is due in %DAYS% days and you haven't touched it in %HOURS% hours. Want to pick it up?",
    "'%TITLE%' is creeping up on its deadline. Should we make a plan?",
    "Quick nudge: %TITLE% is due soon and quiet — worth a look?",
  ];
}

function neglectedExamples(): string[] {
  return [
    "'%TITLE%' has been sitting quiet for a few days — still on the radar?",
    "Just noticed %TITLE% hasn't moved in a while. Want to revisit?",
    "Soft check-in on '%TITLE%' — anything blocking it?",
  ];
}

function buildCandidate(
  task: TaskRow,
  now: Date,
  flavor: "urgent" | "neglected",
  daysUntilDue: number,
  hoursQuiet: number,
): Candidate {
  const dueAt = task.due_at ? new Date(task.due_at) : null;

  let confidence: number;
  if (flavor === "urgent") {
    // Tighter due date = higher confidence.
    // Per spec: 0.85 + 0.05 * min(2, (48 - hoursUntilDue) / 24), capped at 0.95.
    const hoursUntilDue = Math.max(0, daysUntilDue * 24);
    const bonus = 0.05 * Math.min(2, Math.max(0, (48 - hoursUntilDue) / 24));
    confidence = clamp(URGENT_BASE + bonus, URGENT_BASE, URGENT_CAP);
  } else {
    // Longer quiet = higher confidence.
    const bonus = 0.05 * Math.min(2, hoursQuiet / 72);
    confidence = clamp(NEGLECTED_BASE + bonus, NEGLECTED_BASE, NEGLECTED_CAP);
  }

  const priority = flavor === "urgent" ? "urgent" : "soft";
  const tone: PhrasingHint["tone"] = flavor === "urgent" ? "urgent" : "gentle";

  const hint: PhrasingHint = {
    situation: `Task '${task.title}' due in ${daysUntilDue} days, no activity for ${hoursQuiet} hours; ${flavor}`,
    tone,
    data: {
      taskTitle: task.title,
      daysUntilDue,
      hoursQuiet,
      priority: task.priority,
    },
    examples: flavor === "urgent" ? urgentExamples() : neglectedExamples(),
  };

  return {
    type: "task_urgency",
    payload: {
      taskId: task.id,
      taskTitle: task.title,
      flavor,
      daysUntilDue,
      hoursQuiet,
      taskPriority: task.priority,
      workspaceId: task.workspace_id,
    },
    dedupKey: `task:${task.id}:${flavor}`,
    confidence,
    priority,
    showAt: now,
    expiresAt: dueAt ?? new Date(now.getTime() + MS_PER_DAY),
    phrasingHint: hint,
  };
}

async function runTaskUrgency(ctx: DetectorContext): Promise<Candidate[]> {
  try {
    const now = ctx.now;
    const windowEnd = new Date(now.getTime() + WINDOW_DAYS * MS_PER_DAY);

    const { data, error } = await ctx.supabase
      .from("tasks")
      .select("id, title, due_at, status, priority, updated_at, workspace_id")
      .eq("user_id", ctx.userId)
      .in("status", ["pending", "in_progress"])
      .is("archived_at", null)
      .not("due_at", "is", null)
      .gte("due_at", now.toISOString())
      .lte("due_at", windowEnd.toISOString());

    if (error || !data) return [];

    const out: Candidate[] = [];
    for (const raw of data as TaskRow[]) {
      if (!raw.due_at) continue;

      const dueAt = new Date(raw.due_at);
      const updatedAt = new Date(raw.updated_at);
      if (Number.isNaN(dueAt.getTime()) || Number.isNaN(updatedAt.getTime())) continue;

      const daysUntilDue = Math.floor((dueAt.getTime() - now.getTime()) / MS_PER_DAY);
      const hoursQuiet = Math.floor((now.getTime() - updatedAt.getTime()) / MS_PER_HOUR);

      // Sanity bounds — if outside the 0..7 day window after re-checking
      // locally (clocks may drift between DB and process), skip.
      if (daysUntilDue < 0 || daysUntilDue > WINDOW_DAYS) continue;

      if (!isSignificant(raw)) continue;

      let flavor: "urgent" | "neglected" | null = null;
      if (daysUntilDue <= URGENT_DAYS && hoursQuiet >= URGENT_QUIET_HOURS) {
        flavor = "urgent";
      } else if (daysUntilDue <= WINDOW_DAYS && hoursQuiet >= NEGLECTED_QUIET_HOURS) {
        flavor = "neglected";
      }
      if (!flavor) continue;

      out.push(buildCandidate(raw, now, flavor, daysUntilDue, hoursQuiet));
    }
    return out;
  } catch {
    return [];
  }
}

export const taskUrgencyDetector: Detector = {
  name: "task-urgency",
  run: runTaskUrgency,
};
