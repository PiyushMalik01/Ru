import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export interface ProfileSection {
  content: string;
  sources: string[];
  updated_at: string;
}

export type ProfileDoc = Partial<Record<
  "identity" | "preferences" | "current_themes" | "active_projects" | "ru_and_me",
  ProfileSection
>>;

export interface BehavioralModel {
  typical_activity_hour?: Record<string, number>;
  routine_completion_by_dow?: Record<string, number>;
  task_creation_to_completion_hours_p50?: number;
  tracker_cadence_days?: Record<string, number>;
  sentiment_trend_7d?: number;
  nudge_response_rate?: Record<string, number | null>;
  voice_share_24h?: number;
  updated_at?: string;
}

export interface MemoryProfile {
  profile_doc: ProfileDoc;
  behavioral_model: BehavioralModel;
  profile_version: number;
  memory_enabled: boolean;
}

export async function loadMemoryProfile(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<MemoryProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("profile_doc, behavioral_model, profile_version, memory_enabled")
    .eq("id", userId)
    .single();
  if (error || !data) return null;
  return {
    profile_doc: (data.profile_doc as ProfileDoc) ?? {},
    behavioral_model: (data.behavioral_model as BehavioralModel) ?? {},
    profile_version: data.profile_version ?? 0,
    memory_enabled: data.memory_enabled ?? true,
  };
}

export interface EntityCatalog {
  tasks:      Array<{ id: string; title: string }>;
  routines:   Array<{ id: string; title: string }>;
  trackers:   Array<{ id: string; name: string }>;
  workspaces: Array<{ id: string; title: string }>;
}

export async function loadEntityCatalog(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<EntityCatalog> {
  const [tasks, routines, trackers, workspaces] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title")
      .eq("user_id", userId)
      .in("status", ["pending", "in_progress"])
      .limit(50),
    supabase
      .from("routines")
      .select("id, title")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(30),
    supabase
      .from("trackers")
      .select("id, name")
      .eq("user_id", userId)
      .eq("archived", false)
      .limit(20),
    supabase
      .from("workspaces")
      .select("id, title")
      .eq("user_id", userId)
      .eq("archived", false)
      .limit(20),
  ]);
  return {
    tasks: tasks.data ?? [],
    routines: routines.data ?? [],
    trackers: trackers.data ?? [],
    workspaces: workspaces.data ?? [],
  };
}
