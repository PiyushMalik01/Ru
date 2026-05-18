import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

import { logActivity } from "./handlers/log-activity";
import { createTask } from "./handlers/create-task";
import { completeTask } from "./handlers/complete-task";
import { declareRoutine } from "./handlers/declare-routine";
import { completeRoutine } from "./handlers/complete-routine";
import { createReminder } from "./handlers/create-reminder";
import { queryAnalytics } from "./handlers/query-analytics";
import { modifyTask } from "./handlers/modify-task";
import { modifyRoutine } from "./handlers/modify-routine";
import { getRoutineHistory } from "./handlers/get-routine-history";
import { openWorkspace } from "./handlers/open-workspace";
import { closeWorkspace } from "./handlers/close-workspace";
import { createTracker } from "./handlers/create-tracker";
import { logTrackerEntry } from "./handlers/log-tracker-entry";
import { updateTracker } from "./handlers/update-tracker";

export interface ToolContext {
  supabase: SupabaseClient<Database>;
  userId: string;
  messageId: string | null;
}

export interface ToolOutcome {
  ok: boolean;
  message: string;
  cardKind?: "task" | "routine" | "activity" | "reminder" | "insight" | "tracker";
  card?: unknown;
}

type Handler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolOutcome>;

const HANDLERS: Record<string, Handler> = {
  log_activity: logActivity,
  create_task: createTask,
  complete_task: completeTask,
  declare_routine: declareRoutine,
  complete_routine: completeRoutine,
  create_reminder: createReminder,
  query_analytics: queryAnalytics,
  modify_task: modifyTask,
  modify_routine: modifyRoutine,
  get_routine_history: getRoutineHistory,
  open_workspace: openWorkspace,
  close_workspace: closeWorkspace,
  create_tracker: createTracker,
  log_tracker_entry: logTrackerEntry,
  update_tracker: updateTracker,
};

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolOutcome> {
  const handler = HANDLERS[name];
  if (!handler) return { ok: false, message: `unknown tool ${name}` };
  try {
    return await handler(args, ctx);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "tool failed" };
  }
}
