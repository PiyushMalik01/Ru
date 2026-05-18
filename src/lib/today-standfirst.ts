// Composes the editorial standfirst sentence for the Today page.
// Treat this like a column lede in a daily paper: one true sentence about
// the day, varying with the data so it never feels canned.

import type { TodayBundle } from "@/lib/queries/workspace";

interface StandfirstInput {
  bundle: TodayBundle | null;
  /** Number of active plans (workspaces) the user owns. */
  planCount: number;
  /** Best routine streak right now, or 0. */
  bestStreak: number;
  /** First name of the user, if known. */
  firstName: string | null;
}

function pluralize(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function composeStandfirst(input: StandfirstInput): string {
  const { bundle, planCount, bestStreak, firstName } = input;

  if (!bundle) {
    return firstName
      ? `A blank page, ${firstName}. What do you want to use it for?`
      : "A clear day. What do you want to use it for?";
  }

  const openTasks = bundle.tasksDueToday.filter((t) => t.status !== "completed").length;
  const routinesTotal = bundle.activeRoutines.length;
  const routinesDone = bundle.activeRoutines.filter((r) => r.todayCompleted).length;
  const routinesLeft = routinesTotal - routinesDone;
  const allRoutinesDone = routinesTotal > 0 && routinesLeft === 0;

  // 1. Truly empty day.
  if (openTasks === 0 && routinesTotal === 0 && planCount === 0) {
    return firstName
      ? `A clear day, ${firstName}. What do you want to use it for?`
      : "A clear day. What do you want to use it for?";
  }

  // 2. All caught up.
  if (openTasks === 0 && allRoutinesDone) {
    if (bestStreak >= 7) {
      return `Everything signed off, and the streak is at ${bestStreak} days. Quiet ground.`;
    }
    return "Everything signed off. Quiet ground until tomorrow.";
  }

  // 3. Morning, routines still pending, tasks light.
  if (routinesLeft > 0 && openTasks <= 1) {
    return `${pluralize(routinesLeft, "routine left", "routines left")} this morning, ` +
      `${openTasks === 0 ? "no tasks queued" : "one task on deck"}. Start small.`;
  }

  // 4. Crowded day.
  if (openTasks >= 4) {
    if (allRoutinesDone) {
      return `${pluralize(openTasks, "task", "tasks")} left, but you nailed the morning. Steady.`;
    }
    return `${pluralize(openTasks, "task", "tasks")} today` +
      (routinesLeft > 0 ? `, ${pluralize(routinesLeft, "routine", "routines")} still to mark` : "") +
      (bestStreak >= 3 ? `, ${bestStreak}-day streak holding.` : ".");
  }

  // 5. Default — handful of tasks, plans active, streak going.
  const parts: string[] = [];
  if (openTasks > 0) parts.push(`${pluralize(openTasks, "task", "tasks")} today`);
  if (planCount > 0) parts.push(`${pluralize(planCount, "plan", "plans")} in motion`);
  if (bestStreak >= 3) parts.push(`run streak at ${bestStreak} days`);

  if (parts.length === 0) {
    return "Nothing pressing. A good day to start something.";
  }

  // Join with editorial commas — last item gets no "and".
  return parts.join(", ") + ".";
}

/** First name from a profile display name, if any. */
export function firstNameFrom(display: string | null | undefined): string | null {
  if (!display) return null;
  const trimmed = display.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
}
