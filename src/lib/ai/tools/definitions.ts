import type { NormalizedTool } from "../types";

export const TOOL_DEFINITIONS: NormalizedTool[] = [
  {
    name: "log_activity",
    description: "Log something the user just did (workout, study, meal, work session, etc).",
    parameters: {
      type: "object",
      properties: {
        activity: { type: "string", description: "Short description, e.g. 'ran 5k'" },
        category: { type: "string", description: "fitness, study, work, personal, etc." },
        duration_minutes: { type: "number" },
        metadata: { type: "object", additionalProperties: true },
      },
      required: ["activity", "category"],
    },
  },
  {
    name: "create_task",
    description: "Create a task the user wants to do later.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        due_at: { type: "string", description: "ISO 8601 datetime" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["title", "priority"],
    },
  },
  {
    name: "complete_task",
    description: "Mark a task complete. Pass task_description for fuzzy matching.",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "UUID if known" },
        task_description: { type: "string", description: "Natural description to match" },
      },
    },
  },
  {
    name: "declare_routine",
    description: "Create a recurring routine the user has declared (e.g. 'I want to meditate daily at 7am').",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        frequency: { type: "string", enum: ["daily", "weekdays", "weekly", "custom"] },
        custom_days: { type: "array", items: { type: "integer", minimum: 0, maximum: 6 } },
        time_of_day: { type: "string", description: "HH:MM:SS" },
        nudge_level: { type: "string", enum: ["silent", "gentle", "active"] },
      },
      required: ["title", "frequency"],
    },
  },
  {
    name: "complete_routine",
    description: "Mark a routine done for today. Pass routine_description for fuzzy match.",
    parameters: {
      type: "object",
      properties: {
        routine_id: { type: "string" },
        routine_description: { type: "string" },
        notes: { type: "string" },
        metadata: { type: "object", additionalProperties: true },
      },
    },
  },
  {
    name: "create_reminder",
    description: "Schedule a reminder. remind_at must be ISO 8601.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        remind_at: { type: "string" },
        is_recurring: { type: "boolean" },
        recurrence_rule: { type: "string", description: "RRULE format" },
        linked_task_description: { type: "string" },
        linked_routine_description: { type: "string" },
      },
      required: ["title", "remind_at"],
    },
  },
  {
    name: "query_analytics",
    description: "Pull analytics — streaks, completion rates, recent activity counts.",
    parameters: {
      type: "object",
      properties: {
        metric: {
          type: "string",
          enum: ["routine_streak", "routine_completion_rate", "task_completion_rate", "activity_count"],
        },
        days_back: { type: "integer", minimum: 1, maximum: 90 },
        routine_description: { type: "string" },
        category: { type: "string" },
      },
      required: ["metric"],
    },
  },
  {
    name: "modify_task",
    description: "Update a task's title/priority/due_at/status.",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        task_description: { type: "string" },
        updates: {
          type: "object",
          properties: {
            title: { type: "string" },
            priority: { type: "string", enum: ["low", "medium", "high"] },
            due_at: { type: "string" },
            status: { type: "string", enum: ["pending", "in_progress", "completed", "missed"] },
          },
        },
      },
      required: ["updates"],
    },
  },
  {
    name: "modify_routine",
    description: "Update a routine's properties (time, frequency, nudge_level, is_active).",
    parameters: {
      type: "object",
      properties: {
        routine_id: { type: "string" },
        routine_description: { type: "string" },
        updates: {
          type: "object",
          properties: {
            title: { type: "string" },
            time_of_day: { type: "string" },
            frequency: { type: "string", enum: ["daily", "weekdays", "weekly", "custom"] },
            custom_days: { type: "array", items: { type: "integer" } },
            nudge_level: { type: "string", enum: ["silent", "gentle", "active"] },
            is_active: { type: "boolean" },
          },
        },
      },
      required: ["updates"],
    },
  },
  {
    name: "get_routine_history",
    description: "Get completion history for a routine over the last N days.",
    parameters: {
      type: "object",
      properties: {
        routine_id: { type: "string" },
        routine_description: { type: "string" },
        days_back: { type: "integer", minimum: 1, maximum: 365 },
      },
      required: ["days_back"],
    },
  },
  {
    name: "open_workspace",
    description:
      "Start a named build session. Call this when the user wants something substantial built (3+ items, a plan, a routine reset, a project). Pick a short descriptive title from their request — they can rename it later. Subsequent create_task / declare_routine / create_reminder / log_activity calls in this turn auto-attach to the workspace, and the user sees them assembling live on the right panel. Skip for one-off logs or quick replies.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short, specific title for this build session, e.g. 'OChem study plan' or 'Morning routine reset'.",
        },
        description: {
          type: "string",
          description: "Optional one-line context for the workspace.",
        },
        kind: {
          type: "string",
          enum: ["plan", "routine_build", "session"],
        },
      },
      required: ["title"],
    },
  },
  {
    name: "close_workspace",
    description:
      "Close the currently active workspace. Call when the user signals they're done building (e.g. 'looks good, save that'). After this, future tool calls won't be attached to a workspace until you open a new one.",
    parameters: { type: "object", properties: {} },
  },
];

export const TOOL_NAMES = TOOL_DEFINITIONS.map((t) => t.name);
