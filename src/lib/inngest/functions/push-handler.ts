import { inngest } from "../client";
import { sendPushToUser } from "@/lib/push";
import { createServiceClient } from "@/lib/supabase/service";

export const pushReminderFire = inngest.createFunction(
  { id: "push-reminder-fire", triggers: [{ event: "reminder.fire" }] },
  async ({ event, step }) => {
    await step.run("send", () =>
      sendPushToUser(event.data.userId, {
        title: event.data.title,
        body: "Reminder from Ru",
        url: "/chat",
      })
    );
  }
);

export const pushStreakMilestone = inngest.createFunction(
  { id: "push-streak-milestone", triggers: [{ event: "streak.milestone" }] },
  async ({ event, step }) => {
    await step.run("send", () =>
      sendPushToUser(event.data.userId, {
        title: `${event.data.streak}-day streak`,
        body: `${event.data.title} — don't break it.`,
        url: "/routines",
      })
    );
  }
);

export const pushRoutineDetected = inngest.createFunction(
  { id: "push-routine-detected", triggers: [{ event: "routine.detected" }] },
  async ({ event, step }) => {
    await step.run("send", () =>
      sendPushToUser(event.data.userId, {
        title: "New routine detected",
        body: `Looks like "${event.data.title}" is becoming a habit.`,
        url: "/routines",
      })
    );
  }
);

export const pushTaskMissed = inngest.createFunction(
  { id: "push-task-missed", triggers: [{ event: "task.missed" }] },
  async ({ event, step }) => {
    await step.run("send", () =>
      sendPushToUser(event.data.userId, {
        title: "Task overdue",
        body: event.data.title,
        url: "/tasks",
      })
    );
  }
);

/**
 * Push for an urgent anticipation suggestion. Title is the humanized type;
 * body is Ru's phrased one-liner. After the push is queued, marks the
 * suggestion row with `surfaced_push = true` so the next cron sweep doesn't
 * re-push it. Best-effort: a failed UPDATE doesn't fail the push.
 */
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
    await step.run("send", () =>
      sendPushToUser(event.data.userId, {
        title: TYPE_TITLE[event.data.type] ?? "Ru noticed",
        body: event.data.message,
        url: "/today",
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
