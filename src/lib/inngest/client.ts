import { Inngest } from "inngest";

// Events the cron functions emit to fan out to downstream handlers.
export type RuEvents = {
  "reminder.fire": { data: { userId: string; reminderId: string; title: string } };
  "routine.detected": { data: { userId: string; routineId: string; title: string; confidence: number } };
  "streak.milestone": { data: { userId: string; routineId: string; title: string; streak: number } };
  "task.missed": { data: { userId: string; taskId: string; title: string } };
  // Anticipatory layer — emitted by the anticipation cron after inserting an
  // urgent-priority suggestion. The push handler sends a web-push and marks
  // `surfaced_push = true` so the row isn't re-pushed by the next sweep.
  "suggestion.urgent": { data: { userId: string; suggestionId: string; message: string; type: string } };
};

export const inngest = new Inngest({
  id: "ru",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
