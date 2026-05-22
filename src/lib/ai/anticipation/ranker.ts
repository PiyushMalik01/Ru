// ---------------------------------------------------------------------------
// Anticipation ranker
// ---------------------------------------------------------------------------
// Takes raw candidates from all detectors and applies:
//   1. Aggressiveness gate — drop candidates below the user's level floor
//   2. Dedup — collapse (user, type, dedup_key) collisions against existing
//      pending/shown/snoozed rows in the DB
//   3. Suppression — if the user has dismissed similar suggestions 2+ times
//      in the last 7 days, drop this one (learned annoyance)
//   4. Sort — urgent first, then by confidence desc
// ---------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  type Candidate,
  type AnticipationLevel,
  LEVEL_CONFIDENCE_FLOOR,
  URGENT_FLOOR,
} from "./types";

export interface RankerOptions {
  userId: string;
  supabase: SupabaseClient<Database>;
  level: AnticipationLevel;
  /** "Now" reference for suppression lookback. */
  now: Date;
}

const SUPPRESSION_LOOKBACK_DAYS = 7;
const SUPPRESSION_DISMISS_THRESHOLD = 2;

export async function rankCandidates(
  raw: Candidate[],
  opts: RankerOptions,
): Promise<Candidate[]> {
  if (opts.level === "off" || raw.length === 0) return [];

  // Gate by aggressiveness level.
  const floor = LEVEL_CONFIDENCE_FLOOR[opts.level];
  const leveled = raw.filter((c) => {
    if (c.priority === "urgent") return c.confidence >= URGENT_FLOOR;
    return c.confidence >= floor;
  });
  if (leveled.length === 0) return [];

  // Dedup against existing rows. A candidate whose (type, dedup_key) already
  // has a live row (pending/shown/snoozed) is silently dropped.
  const sinceIso = new Date(
    opts.now.getTime() - SUPPRESSION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: existing } = await opts.supabase
    .from("suggestions")
    .select("type, dedup_key, status")
    .eq("user_id", opts.userId)
    .in("status", ["pending", "shown", "snoozed"])
    .gt("created_at", sinceIso);

  const liveSet = new Set(
    (existing ?? []).map((r) => `${r.type}|${r.dedup_key}`),
  );
  const deduped = leveled.filter(
    (c) => !liveSet.has(`${c.type}|${c.dedupKey}`),
  );
  if (deduped.length === 0) return [];

  // Suppression — if user dismissed ≥2 of the same TYPE in the lookback
  // window, drop new candidates of that type. The annoyance signal is at
  // the type level, not the individual suggestion, because a user who
  // dismisses two "routine_adherence" toasts probably doesn't want more.
  const { data: dismissals } = await opts.supabase
    .from("suggestion_actions")
    .select("suggestion_id, action, created_at, suggestions!inner(type)")
    .eq("user_id", opts.userId)
    .eq("action", "dismissed")
    .gt("created_at", sinceIso);

  const dismissCount = new Map<string, number>();
  for (const d of (dismissals ?? []) as Array<{ suggestions: { type: string } }>) {
    const t = d.suggestions?.type;
    if (!t) continue;
    dismissCount.set(t, (dismissCount.get(t) ?? 0) + 1);
  }

  const surviving = deduped.filter((c) => {
    const n = dismissCount.get(c.type) ?? 0;
    return n < SUPPRESSION_DISMISS_THRESHOLD;
  });

  // Sort: urgent first, then confidence desc, then earliest showAt.
  surviving.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "urgent" ? -1 : 1;
    if (a.confidence !== b.confidence) return b.confidence - a.confidence;
    return a.showAt.getTime() - b.showAt.getTime();
  });

  return surviving;
}
