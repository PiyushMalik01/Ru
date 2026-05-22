export { inngest } from "./client";
import { reminderDispatcher } from "./functions/reminder-dispatcher";
import { missedDeadlines } from "./functions/missed-deadlines";
import { streakCalculator } from "./functions/streak-nudge";
import { memoryConsolidate } from "./functions/memory-consolidate";
import {
  pushReminderFire,
  pushStreakMilestone,
  pushRoutineDetected,
  pushTaskMissed,
} from "./functions/push-handler";

export const functions = [
  reminderDispatcher,
  missedDeadlines,
  streakCalculator,
  memoryConsolidate,
  pushReminderFire,
  pushStreakMilestone,
  pushRoutineDetected,
  pushTaskMissed,
];
