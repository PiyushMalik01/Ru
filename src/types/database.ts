// Loosened from the generator's strict recursive union — call sites pass
// `Record<string, unknown>` everywhere and the runtime accepts it just fine.
// Postgres JSONB doesn't care about shape; this keeps the TS surface ergonomic.
export type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
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
        Relationships: [
          {
            foreignKeyName: "activity_log_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      chats: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "daily_summaries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      episodes: {
        Row: {
          archived_at: string | null
          chat_id: string | null
          content: string
          created_at: string
          embedding: number[] | null
          entity_refs: Json
          id: string
          importance: number
          last_referenced_at: string
          source_message_ids: string[]
          superseded_by: string | null
          superseded_reason: string | null
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          chat_id?: string | null
          content: string
          created_at?: string
          embedding?: number[] | null
          entity_refs?: Json
          id?: string
          importance?: number
          last_referenced_at?: string
          source_message_ids?: string[]
          superseded_by?: string | null
          superseded_reason?: string | null
          user_id: string
        }
        Update: {
          archived_at?: string | null
          chat_id?: string | null
          content?: string
          created_at?: string
          embedding?: number[] | null
          entity_refs?: Json
          id?: string
          importance?: number
          last_referenced_at?: string
          source_message_ids?: string[]
          superseded_by?: string | null
          superseded_reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "episodes_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episodes_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_audit: {
        Row: {
          created_at: string
          episode_ids: string[]
          id: string
          kind: string
          payload: Json
          reversed_at: string | null
          reversed_by: string | null
          reversible: boolean
          summary: string
          user_id: string
        }
        Insert: {
          created_at?: string
          episode_ids?: string[]
          id?: string
          kind: string
          payload?: Json
          reversed_at?: string | null
          reversed_by?: string | null
          reversible?: boolean
          summary: string
          user_id: string
        }
        Update: {
          created_at?: string
          episode_ids?: string[]
          id?: string
          kind?: string
          payload?: Json
          reversed_at?: string | null
          reversed_by?: string | null
          reversible?: boolean
          summary?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memory_audit_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "memory_audit"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_corrections: {
        Row: {
          applied_in_consolidation_at: string | null
          corrected: string
          created_at: string
          id: string
          original: string
          section: string | null
          user_id: string
        }
        Insert: {
          applied_in_consolidation_at?: string | null
          corrected: string
          created_at?: string
          id?: string
          original: string
          section?: string | null
          user_id: string
        }
        Update: {
          applied_in_consolidation_at?: string | null
          corrected?: string
          created_at?: string
          id?: string
          original?: string
          section?: string | null
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          chat_id: string | null
          content: string
          created_at: string
          id: string
          input_method: Database["public"]["Enums"]["input_method_type"]
          intent: Database["public"]["Enums"]["message_intent"] | null
          metadata: Json
          role: Database["public"]["Enums"]["message_role"]
          truncated_at: string | null
          user_id: string
        }
        Insert: {
          chat_id?: string | null
          content: string
          created_at?: string
          id?: string
          input_method?: Database["public"]["Enums"]["input_method_type"]
          intent?: Database["public"]["Enums"]["message_intent"] | null
          metadata?: Json
          role: Database["public"]["Enums"]["message_role"]
          truncated_at?: string | null
          user_id: string
        }
        Update: {
          chat_id?: string | null
          content?: string
          created_at?: string
          id?: string
          input_method?: Database["public"]["Enums"]["input_method_type"]
          intent?: Database["public"]["Enums"]["message_intent"] | null
          metadata?: Json
          role?: Database["public"]["Enums"]["message_role"]
          truncated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ai_credentials: Json | null
          ai_provider: Database["public"]["Enums"]["ai_provider_type"] | null
          anticipation_level: Database["public"]["Enums"]["anticipation_level_type"]
          behavioral_model: Json
          created_at: string
          current_chat_id: string | null
          current_workspace_id: string | null
          display_name: string
          id: string
          memory_enabled: boolean
          memory_onboarded_at: string | null
          onboarding_completed: boolean
          preferences: Json
          profile_doc: Json
          profile_version: number
          push_subscription: Json | null
          timezone: string
          updated_at: string
        }
        Insert: {
          ai_credentials?: Json | null
          ai_provider?: Database["public"]["Enums"]["ai_provider_type"] | null
          anticipation_level?: Database["public"]["Enums"]["anticipation_level_type"]
          behavioral_model?: Json
          created_at?: string
          current_chat_id?: string | null
          current_workspace_id?: string | null
          display_name?: string
          id: string
          memory_enabled?: boolean
          memory_onboarded_at?: string | null
          onboarding_completed?: boolean
          preferences?: Json
          profile_doc?: Json
          profile_version?: number
          push_subscription?: Json | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          ai_credentials?: Json | null
          ai_provider?: Database["public"]["Enums"]["ai_provider_type"] | null
          anticipation_level?: Database["public"]["Enums"]["anticipation_level_type"]
          behavioral_model?: Json
          created_at?: string
          current_chat_id?: string | null
          current_workspace_id?: string | null
          display_name?: string
          id?: string
          memory_enabled?: boolean
          memory_onboarded_at?: string | null
          onboarding_completed?: boolean
          preferences?: Json
          profile_doc?: Json
          profile_version?: number
          push_subscription?: Json | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_chat_id_fkey"
            columns: ["current_chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_current_workspace_id_fkey"
            columns: ["current_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      promises: {
        Row: {
          created_at: string
          due_by: string | null
          id: string
          metadata: Json
          promised_at: string
          resolved: boolean
          resolved_at: string | null
          source_message_id: string | null
          subject: string
          user_id: string
        }
        Insert: {
          created_at?: string
          due_by?: string | null
          id?: string
          metadata?: Json
          promised_at: string
          resolved?: boolean
          resolved_at?: string | null
          source_message_id?: string | null
          subject: string
          user_id: string
        }
        Update: {
          created_at?: string
          due_by?: string | null
          id?: string
          metadata?: Json
          promised_at?: string
          resolved?: boolean
          resolved_at?: string | null
          source_message_id?: string | null
          subject?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promises_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promises_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          status: Database["public"]["Enums"]["reminder_status"]
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
          status?: Database["public"]["Enums"]["reminder_status"]
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
          status?: Database["public"]["Enums"]["reminder_status"]
          title?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reminders_linked_routine_id_fkey"
            columns: ["linked_routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_linked_task_id_fkey"
            columns: ["linked_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "routine_logs_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_logs_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      routines: {
        Row: {
          created_at: string
          custom_days: number[] | null
          description: string | null
          detection_confidence: number
          frequency: Database["public"]["Enums"]["routine_frequency"]
          id: string
          is_active: boolean
          nudge_level: Database["public"]["Enums"]["nudge_level"]
          origin: Database["public"]["Enums"]["routine_origin"]
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
          frequency?: Database["public"]["Enums"]["routine_frequency"]
          id?: string
          is_active?: boolean
          nudge_level?: Database["public"]["Enums"]["nudge_level"]
          origin?: Database["public"]["Enums"]["routine_origin"]
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
          frequency?: Database["public"]["Enums"]["routine_frequency"]
          id?: string
          is_active?: boolean
          nudge_level?: Database["public"]["Enums"]["nudge_level"]
          origin?: Database["public"]["Enums"]["routine_origin"]
          time_of_day?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routines_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      suggestion_actions: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json
          suggestion_id: string
          surface: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json
          suggestion_id: string
          surface?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json
          suggestion_id?: string
          surface?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suggestion_actions_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "suggestions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestion_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suggestions: {
        Row: {
          acted_at: string | null
          confidence: number
          created_at: string
          dedup_key: string
          dismissed_at: string | null
          expires_at: string | null
          id: string
          message: string
          payload: Json
          priority: Database["public"]["Enums"]["suggestion_priority"]
          show_at: string
          shown_at: string | null
          snooze_until: string | null
          status: Database["public"]["Enums"]["suggestion_status"]
          surfaced_briefing: boolean
          surfaced_push: boolean
          surfaced_toast: boolean
          type: Database["public"]["Enums"]["suggestion_type"]
          user_id: string
        }
        Insert: {
          acted_at?: string | null
          confidence: number
          created_at?: string
          dedup_key: string
          dismissed_at?: string | null
          expires_at?: string | null
          id?: string
          message: string
          payload: Json
          priority?: Database["public"]["Enums"]["suggestion_priority"]
          show_at: string
          shown_at?: string | null
          snooze_until?: string | null
          status?: Database["public"]["Enums"]["suggestion_status"]
          surfaced_briefing?: boolean
          surfaced_push?: boolean
          surfaced_toast?: boolean
          type: Database["public"]["Enums"]["suggestion_type"]
          user_id: string
        }
        Update: {
          acted_at?: string | null
          confidence?: number
          created_at?: string
          dedup_key?: string
          dismissed_at?: string | null
          expires_at?: string | null
          id?: string
          message?: string
          payload?: Json
          priority?: Database["public"]["Enums"]["suggestion_priority"]
          show_at?: string
          shown_at?: string | null
          snooze_until?: string | null
          status?: Database["public"]["Enums"]["suggestion_status"]
          surfaced_briefing?: boolean
          surfaced_push?: boolean
          surfaced_toast?: boolean
          type?: Database["public"]["Enums"]["suggestion_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suggestions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          source_message_id: string | null
          status: Database["public"]["Enums"]["task_status"]
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
          priority?: Database["public"]["Enums"]["task_priority"]
          source_message_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
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
          priority?: Database["public"]["Enums"]["task_priority"]
          source_message_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tracker_entries: {
        Row: {
          created_at: string
          entered_at: string
          id: string
          notes: string | null
          source_message_id: string | null
          tracker_id: string
          user_id: string
          values: Json
        }
        Insert: {
          created_at?: string
          entered_at?: string
          id?: string
          notes?: string | null
          source_message_id?: string | null
          tracker_id: string
          user_id: string
          values?: Json
        }
        Update: {
          created_at?: string
          entered_at?: string
          id?: string
          notes?: string | null
          source_message_id?: string | null
          tracker_id?: string
          user_id?: string
          values?: Json
        }
        Relationships: [
          {
            foreignKeyName: "tracker_entries_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracker_entries_tracker_id_fkey"
            columns: ["tracker_id"]
            isOneToOne: false
            referencedRelation: "trackers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracker_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trackers: {
        Row: {
          archived: boolean
          created_at: string
          description: string | null
          display_config: Json
          fields: Json
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          description?: string | null
          display_config?: Json
          fields?: Json
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          description?: string | null
          display_config?: Json
          fields?: Json
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trackers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
        }
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
        Relationships: [
          {
            foreignKeyName: "workspace_item_order_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "workspaces_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_active_routine: {
        Args: { p_query: string; p_threshold?: number; p_user_id: string }
        Returns: {
          id: string
          score: number
          title: string
        }[]
      }
      match_episodes: {
        Args: { p_limit?: number; p_query_embedding: string; p_user_id: string }
        Returns: {
          content: string
          created_at: string
          entity_refs: Json
          id: string
          importance: number
          similarity: number
        }[]
      }
      match_pending_task: {
        Args: { p_query: string; p_threshold?: number; p_user_id: string }
        Returns: {
          id: string
          score: number
          title: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      to_date_utc: { Args: { ts: string }; Returns: string }
    }
    Enums: {
      ai_provider_type: "chatgpt_oauth" | "openai" | "anthropic" | "gemini"
      anticipation_level_type: "off" | "minimal" | "balanced" | "proactive"
      input_method_type: "text" | "voice"
      message_intent:
        | "log"
        | "plan"
        | "query"
        | "remind"
        | "reflect"
        | "modify"
        | "declare"
      message_role: "user" | "assistant"
      nudge_level: "silent" | "gentle" | "active"
      reminder_status: "pending" | "sent" | "dismissed"
      routine_frequency: "daily" | "weekdays" | "weekly" | "custom"
      routine_origin: "auto_detected" | "user_declared"
      suggestion_priority: "soft" | "urgent"
      suggestion_status:
        | "pending"
        | "shown"
        | "acted"
        | "dismissed"
        | "snoozed"
        | "expired"
      suggestion_type:
        | "routine_adherence"
        | "task_urgency"
        | "routine_candidate"
        | "promise_followup"
        | "cross_thread"
      task_priority: "low" | "medium" | "high"
      task_status: "pending" | "in_progress" | "completed" | "missed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ai_provider_type: ["chatgpt_oauth", "openai", "anthropic", "gemini"],
      anticipation_level_type: ["off", "minimal", "balanced", "proactive"],
      input_method_type: ["text", "voice"],
      message_intent: [
        "log",
        "plan",
        "query",
        "remind",
        "reflect",
        "modify",
        "declare",
      ],
      message_role: ["user", "assistant"],
      nudge_level: ["silent", "gentle", "active"],
      reminder_status: ["pending", "sent", "dismissed"],
      routine_frequency: ["daily", "weekdays", "weekly", "custom"],
      routine_origin: ["auto_detected", "user_declared"],
      suggestion_priority: ["soft", "urgent"],
      suggestion_status: [
        "pending",
        "shown",
        "acted",
        "dismissed",
        "snoozed",
        "expired",
      ],
      suggestion_type: [
        "routine_adherence",
        "task_urgency",
        "routine_candidate",
        "promise_followup",
        "cross_thread",
      ],
      task_priority: ["low", "medium", "high"],
      task_status: ["pending", "in_progress", "completed", "missed"],
    },
  },
} as const
