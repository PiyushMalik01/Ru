export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          timezone: string;
          onboarding_completed: boolean;
          ai_provider: 'chatgpt_oauth' | 'openai' | 'anthropic' | 'gemini' | null;
          ai_credentials: Record<string, unknown> | null;
          push_subscription: Record<string, unknown> | null;
          preferences: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<{
          id: string;
          display_name: string;
          timezone: string;
          onboarding_completed: boolean;
          ai_provider: 'chatgpt_oauth' | 'openai' | 'anthropic' | 'gemini' | null;
          ai_credentials: Record<string, unknown> | null;
          push_subscription: Record<string, unknown> | null;
          preferences: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        }> & { id: string };
        Update: Partial<{
          id: string;
          display_name: string;
          timezone: string;
          onboarding_completed: boolean;
          ai_provider: 'chatgpt_oauth' | 'openai' | 'anthropic' | 'gemini' | null;
          ai_credentials: Record<string, unknown> | null;
          push_subscription: Record<string, unknown> | null;
          preferences: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        }>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          user_id: string;
          role: 'user' | 'assistant';
          content: string;
          intent: 'log' | 'plan' | 'query' | 'remind' | 'reflect' | 'modify' | 'declare' | null;
          metadata: Record<string, unknown>;
          input_method: 'text' | 'voice';
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role: 'user' | 'assistant';
          content: string;
          intent?: 'log' | 'plan' | 'query' | 'remind' | 'reflect' | 'modify' | 'declare' | null;
          metadata?: Record<string, unknown>;
          input_method: 'text' | 'voice';
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          user_id: string;
          role: 'user' | 'assistant';
          content: string;
          intent: 'log' | 'plan' | 'query' | 'remind' | 'reflect' | 'modify' | 'declare' | null;
          metadata: Record<string, unknown>;
          input_method: 'text' | 'voice';
          created_at: string;
        }>;
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          status: 'pending' | 'in_progress' | 'completed' | 'missed';
          priority: 'low' | 'medium' | 'high';
          due_at: string | null;
          completed_at: string | null;
          source_message_id: string | null;
          tags: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          status?: 'pending' | 'in_progress' | 'completed' | 'missed';
          priority: 'low' | 'medium' | 'high';
          due_at?: string | null;
          completed_at?: string | null;
          source_message_id?: string | null;
          tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          status: 'pending' | 'in_progress' | 'completed' | 'missed';
          priority: 'low' | 'medium' | 'high';
          due_at: string | null;
          completed_at: string | null;
          source_message_id: string | null;
          tags: string[];
          created_at: string;
          updated_at: string;
        }>;
        Relationships: [];
      };
      routines: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          frequency: 'daily' | 'weekdays' | 'weekly' | 'custom';
          custom_days: number[] | null;
          time_of_day: string | null;
          origin: 'auto_detected' | 'user_declared';
          detection_confidence: number;
          nudge_level: 'silent' | 'gentle' | 'active';
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          frequency?: 'daily' | 'weekdays' | 'weekly' | 'custom';
          custom_days?: number[] | null;
          time_of_day?: string | null;
          origin: 'auto_detected' | 'user_declared';
          detection_confidence?: number;
          nudge_level?: 'silent' | 'gentle' | 'active';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          frequency: 'daily' | 'weekdays' | 'weekly' | 'custom';
          custom_days: number[] | null;
          time_of_day: string | null;
          origin: 'auto_detected' | 'user_declared';
          detection_confidence: number;
          nudge_level: 'silent' | 'gentle' | 'active';
          is_active: boolean;
          created_at: string;
          updated_at: string;
        }>;
        Relationships: [];
      };
      routine_logs: {
        Row: {
          id: string;
          routine_id: string;
          user_id: string;
          logged_date: string;
          completed: boolean;
          completed_at: string | null;
          source_message_id: string | null;
          notes: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          routine_id: string;
          user_id: string;
          logged_date: string;
          completed?: boolean;
          completed_at?: string | null;
          source_message_id?: string | null;
          notes?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          routine_id: string;
          user_id: string;
          logged_date: string;
          completed: boolean;
          completed_at: string | null;
          source_message_id: string | null;
          notes: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
        }>;
        Relationships: [];
      };
      activity_log: {
        Row: {
          id: string;
          user_id: string;
          activity: string;
          category: string;
          timestamp: string;
          duration_minutes: number | null;
          sentiment: number | null;
          source_message_id: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          activity: string;
          category?: string;
          timestamp: string;
          duration_minutes?: number | null;
          sentiment?: number | null;
          source_message_id?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          user_id: string;
          activity: string;
          category: string;
          timestamp: string;
          duration_minutes: number | null;
          sentiment: number | null;
          source_message_id: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
        }>;
        Relationships: [];
      };
      reminders: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          remind_at: string;
          is_recurring: boolean;
          recurrence_rule: string | null;
          status: 'pending' | 'sent' | 'dismissed';
          linked_task_id: string | null;
          linked_routine_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          remind_at: string;
          is_recurring?: boolean;
          recurrence_rule?: string | null;
          status?: 'pending' | 'sent' | 'dismissed';
          linked_task_id?: string | null;
          linked_routine_id?: string | null;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          user_id: string;
          title: string;
          remind_at: string;
          is_recurring: boolean;
          recurrence_rule: string | null;
          status: 'pending' | 'sent' | 'dismissed';
          linked_task_id: string | null;
          linked_routine_id: string | null;
          created_at: string;
        }>;
        Relationships: [];
      };
      waitlist: {
        Row: {
          id: string;
          email: string;
          created_at: string;
        };
        Insert: {
          email: string;
          id?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      daily_summaries: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          tasks_completed: number;
          tasks_created: number;
          routines_completed: number;
          routines_total: number;
          activities_logged: number;
          avg_sentiment: number | null;
          active_streaks: Record<string, unknown>;
          insights: Record<string, unknown> | null;
          message_summary: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          tasks_completed?: number;
          tasks_created?: number;
          routines_completed?: number;
          routines_total?: number;
          activities_logged?: number;
          avg_sentiment?: number | null;
          active_streaks?: Record<string, unknown>;
          insights?: Record<string, unknown> | null;
          message_summary?: string | null;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          user_id: string;
          date: string;
          tasks_completed: number;
          tasks_created: number;
          routines_completed: number;
          routines_total: number;
          activities_logged: number;
          avg_sentiment: number | null;
          active_streaks: Record<string, unknown>;
          insights: Record<string, unknown> | null;
          message_summary: string | null;
          created_at: string;
        }>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
