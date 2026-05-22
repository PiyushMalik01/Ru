export { inngest } from "./client";
import { reminderDispatcher } from "./functions/reminder-dispatcher";
import { missedDeadlines } from "./functions/missed-deadlines";
import { streakCalculator } from "./functions/streak-nudge";
import { memoryConsolidate } from "./functions/memory-consolidate";
import { anticipationSweep } from "./functions/anticipation";
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
  pushReminderFire,
  pushStreakMilestone,
  pushRoutineDetected,
  pushTaskMissed,
  pushSuggestionUrgent,
];
