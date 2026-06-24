export { inngest } from "./client";
import { reminderDispatcher } from "./functions/reminder-dispatcher";
import { missedDeadlines } from "./functions/missed-deadlines";
import { streakCalculator } from "./functions/streak-nudge";
import { memoryConsolidate } from "./functions/memory-consolidate";
import { anticipationSweep } from "./functions/anticipation";
import { calendarSync } from "./functions/calendar-sync";
import { taskDueSoon } from "./functions/task-due-soon";
import { dailyDigest } from "./functions/daily-digest";
import { gmailSync } from "./functions/gmail-sync";
import { archiveStale } from "./functions/archive-stale";
import {
  pushReminderFire,
  pushStreakMilestone,
  pushRoutineDetected,
  pushTaskMissed,
  pushSuggestionUrgent,
} from "./functions/push-handler";

export const functions = [
  reminderDispatcher,
  missedDeadlines,
  streakCalculator,
  memoryConsolidate,
  anticipationSweep,
  calendarSync,
  taskDueSoon,
  dailyDigest,
  gmailSync,
  archiveStale,
  pushReminderFire,
  pushStreakMilestone,
  pushRoutineDetected,
  pushTaskMissed,
  pushSuggestionUrgent,
];
