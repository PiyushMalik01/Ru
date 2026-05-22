import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { NormalizedMessage } from "../types";
import { createEmbedder } from "@/lib/ai/embedder";

export interface Episode {
  id: string;
  content: string;
  importance: number;
  entity_refs: Record<string, unknown>;
  created_at: string;
  similarity?: number;
  score?: number;
}

const SOFT_TIMEOUT_MS = 200;
const FETCH_TOP_K = 12;
const FINAL_CAP = 6;
const RECENCY_HALF_LIFE_DAYS = 30;

export async function retrieveEpisodes(opts: {
  supabase: SupabaseClient<Database>;
  userId: string;
  userMessage: string;
  recentTurns: NormalizedMessage[];
  signal?: AbortSignal;
}): Promise<Episode[]> {
  const queryText = buildQueryText(opts.userMessage, opts.recentTurns);

  let embedding: number[];
  try {
    const embedder = createEmbedder();
    const [vec] = await embedder.embed([queryText]);
    if (!vec) return [];
    embedding = vec;
  } catch (e) {
    console.error("retrieveEpisodes embedder failed", e);
    return [];
  }

  const rpcCall = opts.supabase.rpc("match_episodes" as never, {
    p_user_id: opts.userId,
    p_query_embedding: embedding as never,
    p_limit: FETCH_TOP_K,
  } as never);

  const result = await withTimeout(rpcCall, SOFT_TIMEOUT_MS, null);
  if (!result || (result as { error?: unknown }).error || !(result as { data?: unknown[] }).data) {
    return [];
  }
  const rows = (result as { data: Episode[] }).data;

  const ranked = rankEpisodes(rows);
  const top = ranked.slice(0, FINAL_CAP);

  // Update last_referenced_at fire-and-forget.
  if (top.length > 0) {
    const ids = top.map((e) => e.id);
    void opts.supabase
      .from("episodes")
      .update({ last_referenced_at: new Date().toISOString() })
      .in("id", ids);
  }

  return top;
}

function buildQueryText(userMessage: string, recent: NormalizedMessage[]): string {
  const tail = recent.slice(-3).map((m) => m.content).join("\n");
  return tail ? `${tail}\n${userMessage}` : userMessage;
}

function rankEpisodes(rows: Episode[]): Episode[] {
  const now = Date.now();
  return rows
    .map((e) => {
      const ageDays = (now - new Date(e.created_at).getTime()) / 86400000;
      const recencyScore = Math.exp(-Math.log(2) * ageDays / RECENCY_HALF_LIFE_DAYS);
      const similarity = e.similarity ?? 0;
      const score =
        0.55 * similarity +
        0.20 * (e.importance ?? 0) +
        0.15 * recencyScore +
        0.10 * 0; // entity boost applied in top-up stage, not here
      return { ...e, score };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

// Entity top-up — call AFTER enrichment, if there are entities we didn't recall.
// Cheap single-table query; not gated by the soft timeout.
export async function topUpEpisodesByEntity(opts: {
  supabase: SupabaseClient<Database>;
  userId: string;
  fastEpisodes: Episode[];
  entityIds: { tasks: string[]; routines: string[]; trackers: string[]; workspaces: string[] };
}): Promise<Episode[]> {
  const haveIds = new Set(opts.fastEpisodes.map((e) => e.id));
  const needsTopUp =
    opts.entityIds.tasks.length +
    opts.entityIds.routines.length +
    opts.entityIds.trackers.length +
    opts.entityIds.workspaces.length > 0;
  if (!needsTopUp) return opts.fastEpisodes;

  // Build an entity_refs OR query using GIN containment.
  const orClauses: string[] = [];
  for (const id of opts.entityIds.tasks)      orClauses.push(`entity_refs->>'tasks' ilike '%${id}%'`);
  for (const id of opts.entityIds.routines)   orClauses.push(`entity_refs->>'routines' ilike '%${id}%'`);
  for (const id of opts.entityIds.trackers)   orClauses.push(`entity_refs->>'trackers' ilike '%${id}%'`);
  for (const id of opts.entityIds.workspaces) orClauses.push(`entity_refs->>'workspaces' ilike '%${id}%'`);
  if (orClauses.length === 0) return opts.fastEpisodes;

  const { data } = await opts.supabase
    .from("episodes")
    .select("id, content, importance, entity_refs, created_at")
    .eq("user_id", opts.userId)
    .is("superseded_by", null)
    .is("archived_at", null)
    .or(orClauses.join(","))
    .order("created_at", { ascending: false })
    .limit(8);

  const extras = (data ?? [])
    .filter((e) => !haveIds.has(e.id))
    .map((e) => ({ ...e, similarity: 0, score: 0.6 } as Episode));

  // Boost extras for entity match.
  for (const e of extras) e.score = (e.score ?? 0) + 0.10;

  const merged = [...opts.fastEpisodes, ...extras]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, FINAL_CAP);
  return merged;
}
