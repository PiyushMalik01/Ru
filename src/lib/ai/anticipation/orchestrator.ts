// ---------------------------------------------------------------------------
// Anticipation orchestrator
// ---------------------------------------------------------------------------
// Per-user pipeline: detectors → ranker → phraser → insert. Called by the
// Inngest cron in src/lib/inngest/functions/anticipation.ts for every active
// user every 30 minutes.
//
// Detectors are pulled from a registry so the cron file doesn't have to know
// the names. Each detector runs in isolation; one detector throwing doesn't
// take down the others.
// ---------------------------------------------------------------------------

import { createServiceClient } from "@/lib/supabase/service";
import { loadMemoryProfile } from "@/lib/queries/memory";
import { inngest } from "@/lib/inngest/client";
import { rankCandidates } from "./ranker";
import { phraseCandidates } from "./phraser";
import { detectors } from "./detectors";
import type {
  AnticipationLevel,
  Candidate,
  PhrasedCandidate,
  DetectorContext,
} from "./types";

export interface OrchestratorResult {
  userId: string;
  detected: number;
  ranked: number;
  inserted: number;
  errors: string[];
}

const DEFAULT_EXPIRY_HOURS = 24;

export async function runAnticipationForUser(
  userId: string,
  opts: { now?: Date } = {},
): Promise<OrchestratorResult> {
  const supabase = createServiceClient();
  const now = opts.now ?? new Date();
  const errors: string[] = [];

  // Load user profile state — timezone + anticipation_level.
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone, anticipation_level, memory_enabled")
    .eq("id", userId)
    .single();

  if (!profile) {
    return { userId, detected: 0, ranked: 0, inserted: 0, errors: ["profile not found"] };
  }

  const level = (profile.anticipation_level as AnticipationLevel) ?? "balanced";
  if (level === "off") {
    return { userId, detected: 0, ranked: 0, inserted: 0, errors: [] };
  }

  const memoryProfile = profile.memory_enabled === false
    ? null
    : await loadMemoryProfile(supabase, userId);

  const ctx: DetectorContext = {
    userId,
    supabase,
    now,
    timezone: profile.timezone ?? "UTC",
    memoryProfile,
    anticipationLevel: level,
  };

  // Run all detectors in parallel — isolated failure mode.
  const detectorResults = await Promise.allSettled(
    detectors.map((d) => d.run(ctx)),
  );

  const raw: Candidate[] = [];
  detectorResults.forEach((r, i) => {
    if (r.status === "fulfilled") {
      raw.push(...r.value);
    } else {
      const name = detectors[i]?.name ?? "unknown";
      errors.push(`${name}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    }
  });

  if (raw.length === 0) {
    return { userId, detected: 0, ranked: 0, inserted: 0, errors };
  }

  // Rank + dedupe + suppress.
  const ranked = await rankCandidates(raw, { userId, supabase, level, now });
  if (ranked.length === 0) {
    return { userId, detected: raw.length, ranked: 0, inserted: 0, errors };
  }

  // LLM-phrase each surviving candidate.
  const phrased = await phraseCandidates(ranked);

  // Insert. We use upsert with the dedup unique index so concurrent cron
  // runs (extremely unlikely but possible) don't double-insert.
  const rows = phrased.map((c) => candidateToRow(userId, c, now));
  const { data: inserted, error: insertError } = await supabase
    .from("suggestions")
    .upsert(rows, {
      onConflict: "user_id,type,dedup_key",
      ignoreDuplicates: true,
    })
    .select("id, type, priority, message");

  if (insertError) {
    errors.push(`insert: ${insertError.message}`);
  }

  // Emit push events for urgent suggestions. We DON'T await sendEvent;
  // push delivery is async via Inngest and a failure to enqueue shouldn't
  // fail the whole orchestrator run.
  const urgentRows = (inserted ?? []).filter((r) => r.priority === "urgent");
  if (urgentRows.length > 0) {
    try {
      await inngest.send(
        urgentRows.map((r) => ({
          name: "suggestion.urgent" as const,
          data: {
            userId,
            suggestionId: r.id,
            message: r.message,
            type: r.type,
          },
        })),
      );
    } catch (e) {
      errors.push(`push-enqueue: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    userId,
    detected: raw.length,
    ranked: ranked.length,
    inserted: inserted?.length ?? 0,
    errors,
  };
}

function candidateToRow(userId: string, c: PhrasedCandidate, now: Date) {
  const expiresAt = c.expiresAt
    ?? new Date(c.showAt.getTime() + DEFAULT_EXPIRY_HOURS * 60 * 60 * 1000);
  return {
    user_id: userId,
    type: c.type,
    payload: c.payload,
    message: c.message,
    confidence: c.confidence,
    priority: c.priority,
    status: "pending" as const,
    show_at: c.showAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    dedup_key: c.dedupKey,
    created_at: now.toISOString(),
  };
}

/**
 * Janitor: walk pending suggestions whose expires_at has passed and move
 * them to 'expired'. Called from the cron after the per-user runs.
 */
export async function expireStaleSuggestions(now: Date = new Date()): Promise<number> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("suggestions")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("expires_at", now.toISOString())
    .select("id");
  if (error) {
    console.error("expire janitor failed", error);
    return 0;
  }
  return data?.length ?? 0;
}
