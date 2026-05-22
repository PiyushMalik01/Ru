// ---------------------------------------------------------------------------
// Anticipatory layer — types
// ---------------------------------------------------------------------------
// Shared types between detectors, ranker, phraser, and the suggestion API.
// Detectors emit `Candidate[]`. The orchestrator ranks + dedupes + suppresses,
// then the LLM phraser turns each surviving candidate into a `PhrasedCandidate`
// which becomes a row in the `suggestions` table.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { MemoryProfile } from "@/lib/queries/memory";

export type SuggestionType =
  | "routine_adherence"
  | "task_urgency"
  | "routine_candidate"
  | "promise_followup"
  | "cross_thread";

export type SuggestionPriority = "soft" | "urgent";

export type SuggestionStatus =
  | "pending"
  | "shown"
  | "acted"
  | "dismissed"
  | "snoozed"
  | "expired";

export type AnticipationLevel = "off" | "minimal" | "balanced" | "proactive";

/**
 * What a detector emits. The ranker is responsible for dedupe + suppression
 * + scheduling; the detector just identifies candidates and provides enough
 * structure for the phraser to write Ru's line.
 */
export interface Candidate {
  type: SuggestionType;
  /** Detector-specific structured fields persisted to suggestions.payload. */
  payload: Record<string, unknown>;
  /**
   * Stable dedup key — when the same situation re-detects within a window,
   * the ranker drops the duplicate. Format guidelines (per type):
   *   - routine_adherence: `routine:<id>:<YYYY-MM-DD>`
   *   - task_urgency:      `task:<id>:<urgent|neglected>`
   *   - routine_candidate: `candidate:<entity_subject>:<hour>`
   *   - promise_followup:  `promise:<id>`
   *   - cross_thread:      `cross:<workspaceId>:<otherChatId>`
   */
  dedupKey: string;
  /** 0..1 detector confidence in the candidate's validity. */
  confidence: number;
  priority: SuggestionPriority;
  /** Earliest moment to surface (e.g., 30 min before routine's typical_time). */
  showAt: Date;
  /** Optional expiry — defaults to showAt + 24h if absent. */
  expiresAt?: Date;
  /** Guidance for the LLM phraser. */
  phrasingHint: PhrasingHint;
}

export interface PhrasingHint {
  /** One-sentence factual description of the situation. */
  situation: string;
  /** Concrete data points the phraser may quote ("4 days quiet", "in 2 days"). */
  data: Record<string, unknown>;
  /** Tone the phraser should aim for. */
  tone: "gentle" | "urgent" | "celebratory" | "neutral" | "curious";
  /** Optional sample phrasings to anchor stylistic range. */
  examples?: string[];
}

/**
 * A candidate that survived ranking + suppression and has been LLM-phrased.
 * Ready for INSERT into the suggestions table.
 */
export interface PhrasedCandidate extends Candidate {
  message: string;
}

/**
 * Context passed to every detector. Detectors are stateless functions —
 * they read from `supabase` and return Candidate[]; the orchestrator owns
 * persistence.
 */
export interface DetectorContext {
  userId: string;
  supabase: SupabaseClient<Database>;
  /** "Now" for the detection sweep — frozen so the run is reproducible. */
  now: Date;
  /** User's timezone, e.g. "America/Los_Angeles". */
  timezone: string;
  /** M0 memory profile — detectors may consult behavioral_model. */
  memoryProfile: MemoryProfile | null;
  /** Aggressiveness level — detectors may emit weaker candidates if proactive. */
  anticipationLevel: AnticipationLevel;
}

export interface Detector {
  name: string;
  run(ctx: DetectorContext): Promise<Candidate[]>;
}

// ---------------------------------------------------------------------------
// Confidence thresholds — single source of truth
// ---------------------------------------------------------------------------
// Each anticipation level passes through candidates above the level's
// confidence floor. Detectors that produce per-priority candidates always
// pass urgent ones through (anything urgent + >=0.5 confidence is shown
// regardless of level, unless level === 'off').
// ---------------------------------------------------------------------------
export const LEVEL_CONFIDENCE_FLOOR: Record<AnticipationLevel, number> = {
  off: 2.0, // impossible — nothing passes
  minimal: 0.85,
  balanced: 0.65,
  proactive: 0.45,
};

/** Urgent candidates always shown above this floor, regardless of level. */
export const URGENT_FLOOR = 0.5;
