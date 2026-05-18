import { Inngest } from "inngest";

// Events the cron functions emit to fan out to downstream handlers.
export type RuEvents = {
  "reminder.fire": { data: { userId: string; reminderId: string; title: string } };
  "routine.detected": { data: { userId: string; routineId: string; title: string; confidence: number } };
  "streak.milestone": { data: { userId: string; routineId: string; title: string; streak: number } };
  "task.missed": { data: { userId: string; taskId: string; title: string } };
};

export const inngest = new Inngest({
  id: "ru",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
