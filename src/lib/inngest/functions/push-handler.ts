import { inngest } from "../client";
import { dispatch } from "@/lib/notifications";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Each event handler routes through the central notification dispatcher,
 * which writes to the in-app inbox, optionally fires web push, and
 * (where appropriate) sends email — all per the user's saved preferences.
 *
 * Push-only was the V1 behavior. The dispatcher subsumes it.
 */

export const pushReminderFire = inngest.createFunction(
  { id: "push-reminder-fire", triggers: [{ event: "reminder.fire" }] },
  async ({ event, step }) => {
    await step.run("dispatch", () =>
      dispatch({
        userId: event.data.userId,
        kind: "reminder_due",
        title: event.data.title,
        body: "Reminder from Ru",
        url: "/sheet",
        entityKind: "reminder",
        entityId: event.data.reminderId,
        dedupTag: `reminder_due:${event.data.reminderId}`,
      })
    );
  }
);

export const pushStreakMilestone = inngest.createFunction(
  { id: "push-streak-milestone", triggers: [{ event: "streak.milestone" }] },
  async ({ event, step }) => {
    await step.run("dispatch", () =>
      dispatch({
        userId: event.data.userId,
        kind: "streak_milestone",
        title: `${event.data.streak}-day streak`,
        body: `${event.data.title} — don't break it.`,
        url: "/routines",
        entityKind: "routine",
        entityId: event.data.routineId,
      })
    );
  }
);

export const pushRoutineDetected = inngest.createFunction(
  { id: "push-routine-detected", triggers: [{ event: "routine.detected" }] },
  async ({ event, step }) => {
    await step.run("dispatch", () =>
      dispatch({
        userId: event.data.userId,
        kind: "system",
        title: "New routine detected",
        body: `Looks like "${event.data.title}" is becoming a habit.`,
        url: "/routines",
        entityKind: "routine",
        entityId: event.data.routineId,
      })
    );
  }
);

export const pushTaskMissed = inngest.createFunction(
  { id: "push-task-missed", triggers: [{ event: "task.missed" }] },
  async ({ event, step }) => {
    await step.run("dispatch", () =>
      dispatch({
        userId: event.data.userId,
        kind: "task_overdue",
        title: event.data.title,
        body: "This task is overdue.",
        url: "/sheet",
        entityKind: "task",
        entityId: event.data.taskId,
        dedupTag: `task_overdue:${event.data.taskId}`,
      })
    );
  }
);

const TYPE_TITLE: Record<string, string> = {
  routine_adherence: "Routine reminder",
  task_urgency: "Task needs attention",
  routine_candidate: "Ru noticed a pattern",
  promise_followup: "Following up",
  cross_thread: "Pulling a thread",
};

export const pushSuggestionUrgent = inngest.createFunction(
  { id: "push-suggestion-urgent", triggers: [{ event: "suggestion.urgent" }] },
  async ({ event, step }) => {
    await step.run("dispatch", () =>
      dispatch({
        userId: event.data.userId,
        kind: "suggestion_urgent",
        title: TYPE_TITLE[event.data.type] ?? "Ru noticed",
        body: event.data.message,
        url: "/today",
        entityKind: "suggestion",
        entityId: event.data.suggestionId,
      })
    );
    await step.run("mark-surfaced", async () => {
      const supabase = createServiceClient();
      const { error } = await supabase
        .from("suggestions")
        .update({ surfaced_push: true })
        .eq("id", event.data.suggestionId);
      if (error) console.error("mark-surfaced failed", error);
    });
  }
);
