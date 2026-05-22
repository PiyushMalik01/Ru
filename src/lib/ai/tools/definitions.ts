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
  {
    name: "create_tracker",
    description:
      "Create a quantitative tracker the user wants to log over time (running, workouts, weight, mood, calories, sleep, etc.). Use this when the user asks you to TRACK something with specific parameters — don't just promise to log it. The tracker defines a small schema of fields; entries are logged separately with log_tracker_entry.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short tracker name, e.g. 'Running' or 'Workout'." },
        description: { type: "string", description: "Optional one-line context." },
        fields: {
          type: "array",
          description: "Schema of columns the user will log. Provide 1-6 fields.",
          items: {
            type: "object",
            properties: {
              key: { type: "string", description: "Snake_case identifier, e.g. 'distance_km'." },
              label: { type: "string", description: "Human label, e.g. 'Distance'." },
              type: { type: "string", enum: ["number", "text", "duration"] },
              unit: { type: "string", description: "Optional unit suffix (km, kg, min, etc.)." },
            },
            required: ["label", "type"],
          },
        },
      },
      required: ["name", "fields"],
    },
  },
  {
    name: "log_tracker_entry",
    description:
      "Log one entry against an existing tracker. Pass the tracker by name (fuzzy match) or id, and a values object keyed by the tracker's field keys/labels.",
    parameters: {
      type: "object",
      properties: {
        tracker: { type: "string", description: "Tracker name or id." },
        values: {
          type: "object",
          description: "Field values, e.g. { distance_km: 5.2, time_min: 28 }.",
          additionalProperties: true,
        },
        entered_at: { type: "string", description: "ISO 8601. Defaults to now." },
        notes: { type: "string" },
      },
      required: ["tracker", "values"],
    },
  },
  {
    name: "update_tracker",
    description:
      "Mutate a tracker's structure. Use when the user asks to add/remove/rename a column, rename the tracker, change the chart type, or archive it.",
    parameters: {
      type: "object",
      properties: {
        tracker: { type: "string", description: "Tracker name or id." },
        action: {
          type: "string",
          enum: [
            "add_field",
            "remove_field",
            "rename_field",
            "rename_tracker",
            "set_chart_type",
            "archive",
          ],
        },
        field: {
          type: "object",
          description: "Only for add_field.",
          properties: {
            key: { type: "string" },
            label: { type: "string" },
            type: { type: "string", enum: ["number", "text", "duration"] },
            unit: { type: "string" },
          },
        },
        field_key: { type: "string", description: "For remove_field / rename_field." },
        new_label: { type: "string", description: "For rename_field." },
        new_name: { type: "string", description: "For rename_tracker." },
        chart_type: { type: "string", enum: ["line", "bar", "area"], description: "For set_chart_type." },
      },
      required: ["tracker", "action"],
    },
  },
  {
    name: "delete_tracker_entry",
    description:
      "Remove an entry from a tracker. Default is the most recent entry. Use when the user says 'scratch that last run', 'undo my last log', etc.",
    parameters: {
      type: "object",
      properties: {
        tracker: { type: "string", description: "Tracker name or id." },
        entry_id: { type: "string", description: "Specific entry UUID. Omit to delete the latest entry." },
      },
    },
  },
  {
    name: "complete_reminder",
    description: "Dismiss a reminder — the user has handled it or doesn't need the nudge anymore.",
    parameters: {
      type: "object",
      properties: {
        reminder: { type: "string", description: "Reminder title (fuzzy) or id." },
      },
      required: ["reminder"],
    },
  },
  {
    name: "snooze_reminder",
    description:
      "Push a reminder forward in time. Pass either snooze_minutes (relative) OR new_remind_at (absolute ISO 8601).",
    parameters: {
      type: "object",
      properties: {
        reminder: { type: "string", description: "Reminder title (fuzzy) or id." },
        snooze_minutes: { type: "number", description: "Minutes to add. Use 15/30/60/etc." },
        new_remind_at: { type: "string", description: "Absolute new fire time (ISO 8601)." },
      },
      required: ["reminder"],
    },
  },
  {
    name: "modify_reminder",
    description: "Change a reminder's title, fire time, or recurrence. Pass updates as a partial object.",
    parameters: {
      type: "object",
      properties: {
        reminder: { type: "string", description: "Reminder title (fuzzy) or id." },
        updates: {
          type: "object",
          properties: {
            title: { type: "string" },
            remind_at: { type: "string", description: "ISO 8601" },
            is_recurring: { type: "boolean" },
            recurrence_rule: { type: "string" },
          },
        },
      },
      required: ["reminder", "updates"],
    },
  },
  {
    name: "delete_reminder",
    description: "Permanently delete a reminder. Use when the user explicitly says 'delete' or 'remove'.",
    parameters: {
      type: "object",
      properties: {
        reminder: { type: "string", description: "Reminder title (fuzzy) or id." },
      },
      required: ["reminder"],
    },
  },
  {
    name: "delete_task",
    description: "Permanently delete a task. Use ONLY when the user says delete/remove — not for completing.",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        task_description: { type: "string", description: "Natural description for fuzzy match." },
      },
    },
  },
  {
    name: "delete_routine",
    description:
      "Permanently delete a routine. Use sparingly — for 'stop nudging me about this for now', modify_routine to set is_active=false instead.",
    parameters: {
      type: "object",
      properties: {
        routine_id: { type: "string" },
        routine_description: { type: "string", description: "Natural description for fuzzy match." },
      },
    },
  },
  {
    name: "skip_routine_today",
    description:
      "Mark a routine as skipped for today without breaking the streak record. Use when the user says 'taking a rest day from X' or 'skip my morning run today'.",
    parameters: {
      type: "object",
      properties: {
        routine_id: { type: "string" },
        routine_description: { type: "string" },
        reason: { type: "string", description: "Optional note ('rest day', 'sick', etc.)" },
      },
    },
  },
  {
    name: "modify_activity",
    description: "Edit a recently logged activity — fix the title, category, duration, or timestamp.",
    parameters: {
      type: "object",
      properties: {
        activity: { type: "string", description: "Activity title (fuzzy) or id." },
        updates: {
          type: "object",
          properties: {
            activity: { type: "string" },
            category: { type: "string" },
            duration_minutes: { type: "number" },
            timestamp: { type: "string", description: "ISO 8601" },
            metadata: { type: "object", additionalProperties: true },
          },
        },
      },
      required: ["activity", "updates"],
    },
  },
  {
    name: "delete_activity",
    description: "Remove a mis-logged activity. Use when the user says 'scratch that' or 'I didn't actually do X'.",
    parameters: {
      type: "object",
      properties: {
        activity: { type: "string", description: "Activity title (fuzzy) or id." },
      },
      required: ["activity"],
    },
  },
  {
    name: "rename_workspace",
    description: "Rename a plan/workspace. Use when the user says 'call this X' or 'rename my launch plan to Y'.",
    parameters: {
      type: "object",
      properties: {
        workspace: { type: "string", description: "Plan title (fuzzy) or id." },
        new_title: { type: "string" },
      },
      required: ["workspace", "new_title"],
    },
  },
  {
    name: "archive_workspace",
    description: "Archive a plan so it stops showing on /plans. Items stay; the plan is just hidden.",
    parameters: {
      type: "object",
      properties: {
        workspace: { type: "string", description: "Plan title (fuzzy) or id." },
      },
      required: ["workspace"],
    },
  },
  {
    name: "update_profile",
    description:
      "Change the user's profile via voice/chat — display name, timezone, or preferences. Whitelisted fields only.",
    parameters: {
      type: "object",
      properties: {
        updates: {
          type: "object",
          properties: {
            display_name: { type: "string" },
            timezone: { type: "string", description: "IANA timezone, e.g. America/Los_Angeles." },
            preferences: { type: "object", additionalProperties: true },
          },
        },
      },
      required: ["updates"],
    },
  },
  {
    name: "rename_chat",
    description:
      "Rename a chat thread. Pass 'current' (or omit) to rename this chat, or a search hint to find another.",
    parameters: {
      type: "object",
      properties: {
        chat: { type: "string", description: "'current', a chat title (fuzzy), or id. Defaults to current." },
        new_title: { type: "string" },
      },
      required: ["new_title"],
    },
  },
  {
    name: "archive_chat",
    description:
      "Archive a chat thread so it stops showing in the sidebar. Pass 'current' to archive this chat.",
    parameters: {
      type: "object",
      properties: {
        chat: { type: "string", description: "'current', a chat title (fuzzy), or id. Defaults to current." },
      },
    },
  },
  {
    name: "note_episode",
    description:
      "Record something memory-worthy that just happened in this turn: a preference reveal, a decision, a life event, a correction, a strong opinion, a stated plan. Write a brief 1-3 sentence summary in third person about the user. Skip trivial chat (thanks, ok, idk) and things already captured by structured tools (creating a task is not an episode — the task itself is the record). Do not narrate this in your reply.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "1-3 sentences, third person, e.g. 'Piyush mentioned moving to Tokyo last week.'" },
        entity_refs: {
          type: "object",
          description: "Optional links to entities this episode is about.",
          properties: {
            task_descriptions:    { type: "array", items: { type: "string" } },
            routine_descriptions: { type: "array", items: { type: "string" } },
            tracker_names:        { type: "array", items: { type: "string" } },
            workspace_titles:     { type: "array", items: { type: "string" } },
          },
        },
        importance: { type: "number", minimum: 0, maximum: 1, description: "Default 0.5. Use >=0.7 for life events, strong preferences, corrections. <=0.3 for minor observations." },
      },
      required: ["summary"],
    },
  },
  {
    name: "forget",
    description:
      "Mark a fact, episode, or profile statement as superseded. Use when the user explicitly retracts ('that's not true anymore', 'I don't do that') or contradicts something Ru previously remembered.",
    parameters: {
      type: "object",
      properties: {
        target_description: { type: "string", description: "What to forget, e.g. 'that I'm cutting carbs' or 'my old Seattle address'." },
        reason: { type: "string", description: "Optional one-line reason — used in the audit log." },
      },
      required: ["target_description"],
    },
  },
];

export const TOOL_NAMES = TOOL_DEFINITIONS.map((t) => t.name);
