import { inngest } from "../client";
import { sendPushToUser } from "@/lib/push";

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
