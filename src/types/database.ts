// Loosened from the generator's strict recursive union — call sites pass
// `Record<string, unknown>` everywhere and the runtime accepts it just fine.
// Postgres JSONB doesn't care about shape; this keeps the TS surface ergonomic.
export type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          activity: string
          category: string
          created_at: string
          duration_minutes: number | null
          id: string
          metadata: Json
          sentiment: number | null
          source_message_id: string | null
          timestamp: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          activity: string
          category?: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          metadata?: Json
          sentiment?: number | null
          source_message_id?: string | null
          timestamp?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          activity?: string
          category?: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          metadata?: Json
          sentiment?: number | null
          source_message_id?: string | null
          timestamp?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      daily_summaries: {
        Row: {
          active_streaks: Json
          activities_logged: number
          avg_sentiment: number | null
          created_at: string
          date: string
          id: string
          insights: Json | null
          message_summary: string | null
          routines_completed: number
          routines_total: number
          tasks_completed: number
          tasks_created: number
          user_id: string
        }
        Insert: {
          active_streaks?: Json
          activities_logged?: number
          avg_sentiment?: number | null
          created_at?: string
          date: string
          id?: string
          insights?: Json | null
          message_summary?: string | null
          routines_completed?: number
          routines_total?: number
          tasks_completed?: number
          tasks_created?: number
          user_id: string
        }
        Update: {
          active_streaks?: Json
          activities_logged?: number
          avg_sentiment?: number | null
          created_at?: string
          date?: string
          id?: string
          insights?: Json | null
          message_summary?: string | null
          routines_completed?: number
          routines_total?: number
          tasks_completed?: number
          tasks_created?: number
          user_id?: string
        }
        Relationships: []
      }
      chats: {
        Row: {
          id: string
          user_id: string
          title: string
          archived: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title?: string
          archived?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          archived?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          created_at: string
          id: string
          chat_id: string | null
          input_method: "text" | "voice"
          intent: "log" | "plan" | "query" | "remind" | "reflect" | "modify" | "declare" | null
          metadata: Record<string, unknown>
          role: "user" | "assistant"
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          chat_id?: string | null
          input_method?: "text" | "voice"
          intent?: "log" | "plan" | "query" | "remind" | "reflect" | "modify" | "declare" | null
          metadata?: Record<string, unknown>
          role: "user" | "assistant"
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          chat_id?: string | null
          input_method?: "text" | "voice"
          intent?: "log" | "plan" | "query" | "remind" | "reflect" | "modify" | "declare" | null
          metadata?: Record<string, unknown>
          role?: "user" | "assistant"
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ai_credentials: Json | null
          ai_provider: "chatgpt_oauth" | "openai" | "anthropic" | "gemini" | null
          created_at: string
          current_chat_id: string | null
          current_workspace_id: string | null
          display_name: string
          id: string
          onboarding_completed: boolean
          preferences: Json
          push_subscription: Json | null
          timezone: string
          updated_at: string
        }
        Insert: {
          ai_credentials?: Json | null
          ai_provider?: "chatgpt_oauth" | "openai" | "anthropic" | "gemini" | null
          created_at?: string
          current_chat_id?: string | null
          current_workspace_id?: string | null
          display_name?: string
          id: string
          onboarding_completed?: boolean
          preferences?: Json
          push_subscription?: Json | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          ai_credentials?: Json | null
          ai_provider?: "chatgpt_oauth" | "openai" | "anthropic" | "gemini" | null
          created_at?: string
          current_chat_id?: string | null
          current_workspace_id?: string | null
          display_name?: string
          id?: string
          onboarding_completed?: boolean
          preferences?: Json
          push_subscription?: Json | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          created_at: string
          id: string
          is_recurring: boolean
          linked_routine_id: string | null
          linked_task_id: string | null
          recurrence_rule: string | null
          remind_at: string
          status: "pending" | "sent" | "dismissed"
          title: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_recurring?: boolean
          linked_routine_id?: string | null
          linked_task_id?: string | null
          recurrence_rule?: string | null
          remind_at: string
          status?: "pending" | "sent" | "dismissed"
          title: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_recurring?: boolean
          linked_routine_id?: string | null
          linked_task_id?: string | null
          recurrence_rule?: string | null
          remind_at?: string
          status?: "pending" | "sent" | "dismissed"
          title?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      routine_logs: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          id: string
          logged_date: string
          metadata: Json
          notes: string | null
          routine_id: string
          source_message_id: string | null
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          logged_date: string
          metadata?: Json
          notes?: string | null
          routine_id: string
          source_message_id?: string | null
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          logged_date?: string
          metadata?: Json
          notes?: string | null
          routine_id?: string
          source_message_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      routines: {
        Row: {
          created_at: string
          custom_days: number[] | null
          description: string | null
          detection_confidence: number
          frequency: "daily" | "weekdays" | "weekly" | "custom"
          id: string
          is_active: boolean
          nudge_level: "silent" | "gentle" | "active"
          origin: "auto_detected" | "user_declared"
          time_of_day: string | null
          title: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          custom_days?: number[] | null
          description?: string | null
          detection_confidence?: number
          frequency?: "daily" | "weekdays" | "weekly" | "custom"
          id?: string
          is_active?: boolean
          nudge_level?: "silent" | "gentle" | "active"
          origin?: "auto_detected" | "user_declared"
          time_of_day?: string | null
          title: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          custom_days?: number[] | null
          description?: string | null
          detection_confidence?: number
          frequency?: "daily" | "weekdays" | "weekly" | "custom"
          id?: string
          is_active?: boolean
          nudge_level?: "silent" | "gentle" | "active"
          origin?: "auto_detected" | "user_declared"
          time_of_day?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          priority: "low" | "medium" | "high"
          source_message_id: string | null
          status: "pending" | "in_progress" | "completed" | "missed"
          tags: string[]
          title: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          priority?: "low" | "medium" | "high"
          source_message_id?: string | null
          status?: "pending" | "in_progress" | "completed" | "missed"
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          priority?: "low" | "medium" | "high"
          source_message_id?: string | null
          status?: "pending" | "in_progress" | "completed" | "missed"
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      waitlist: {
        Row: { created_at: string; email: string; id: string }
        Insert: { created_at?: string; email: string; id?: string }
        Update: { created_at?: string; email?: string; id?: string }
        Relationships: []
      }
      workspace_item_order: {
        Row: {
          item_id: string
          item_kind: string
          position: number
          workspace_id: string
        }
        Insert: {
          item_id: string
          item_kind: string
          position: number
          workspace_id: string
        }
        Update: {
          item_id?: string
          item_kind?: string
          position?: number
          workspace_id?: string
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          archived: boolean
          created_at: string
          description: string | null
          id: string
          kind: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      match_active_routine: {
        Args: { p_query: string; p_threshold?: number; p_user_id: string }
        Returns: { id: string; score: number; title: string }[]
      }
      match_pending_task: {
        Args: { p_query: string; p_threshold?: number; p_user_id: string }
        Returns: { id: string; score: number; title: string }[]
      }
    }
  }
}
