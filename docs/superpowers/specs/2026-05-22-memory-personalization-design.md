# Ru Memory & Personalization — Design Spec (M0)

**Status:** Design approved, awaiting user review before plan-writing.
**Owner:** Piyush
**Date:** 2026-05-22
**Codename:** M0 in `docs/pipeline-roadmap.md`

---

## 1. Why this exists

Today, every chat starts with the model knowing the user's name, timezone,
last 7 days of summaries (counts only — the prose `message_summary` is
unwritten), active routines, and open tasks. Anything the user said three
chats ago is invisible. Anything the user *implied* — preferences, life
events, habits, the way they like to be talked to — is invisible. Two
months of use feels exactly the same as day one.

The product premise is "talk to Ru, she handles your life." That premise
breaks the moment the user has to repeat themselves. M0 fixes this by
giving Ru a hierarchical memory that actually compounds — so by month
three, Ru is meaningfully better at being *this user's* Ru than any
freshly-pointed competitor could ever be.

The moat is not the architecture. The moat is the *accumulated
user-shaped state*. The architecture exists to grow that state
faithfully and use it without being annoying.

## 2. Goals

1. **Persistent understanding of the user** across chats, sessions, and
   months — without forcing the user to manage anything.
2. **Auditable + editable** — every fact has provenance, every memory
   change is logged, the user can correct or delete anything.
3. **Zero added latency on the hot path** — voice mode and text mode
   stay as snappy as today, ideally faster (enrichment unblocks tool
   precision wins).
4. **Robust against bad prompts** — works when the user mumbles, uses
   pronouns, abbreviates, or speaks while distracted.
5. **Cost-disciplined** — the memory system scales to thousands of
   active users at predictable, modest per-user cost.
6. **No regression on existing behavior** — every current feature
   (tasks, routines, trackers, workspaces, voice) keeps working
   exactly as today. M0 is additive.

## 3. Non-goals (explicitly deferred)

These are real but **out of scope for M0**:

- **Anticipatory nudges / Ru-speaks-first** — M1.
- **Streaming-aware TTS / voice that thinks out loud** — M2.
- **Multi-modal capture** (images, screenshots, voice memos) — M3.
- **Cross-thread workspace stitching** — M6 (M0 enables this via
  episodic recall, but the dedicated UI is later).
- **Speculative execution on partial transcripts** — M7.
- **Learned reranker** for episodic retrieval — deterministic for v1.
- **Multi-hop graph traversal** of entity links — single-hop only.
- **Group memory** (shared between two users) — not on roadmap.
- **Local-first / on-device memory** — speculative, not committed.

## 4. Decisions locked in brainstorm

| # | Decision | Choice |
|---|---|---|
| Q1 | Triggering model | **Hybrid** — implicit always-on for behavioral patterns (no user friction), model-driven explicit writes for stated facts (silent + audit page) |
| Q2 | Unit of memory | **Three tiers** — structured profile (always in context) + episodic memory (vector + entity, retrieved on demand) + raw messages (already exist, untouched) |
| Q3 | Write path | **Model-driven tools at write time** (`remember_fact`, `note_episode`, `update_profile`, `forget`) + **sleep-time consolidation** for derived behavior, dedup, decay |
| Q3a | Bad-prompt resilience | **Intent-enrichment layer** — runs in parallel with context assembly, augments (doesn't rewrite) the user turn with resolved entities, intent hints, memory signals, sentiment |
| Q4 | Sleep-time | **Five-pass nightly** per active user at user-local 3am — profile section rewrite, episode curation, behavioral SQL, routine detection v2, decay/forgetting. Light event-triggered patches. Manual full-rebuild button. |
| Q5 | Runtime retrieval | **Two-stage hybrid** — semantic top-k (parallel with enrichment) + entity top-up after enrichment, deterministic rerank, cap 6 episodes / ~900 token budget. Profile always in context, prompt-cached via Anthropic ephemeral cache. |
| Q6 | Audit & edit surface | **`/settings/memory` page** with three tabs (Profile / Timeline / Episodic Advanced), inline edit + provenance + undo, "what Ru knows" indicator in nav, first-time onboarding moment. **Bundled into M0** — trust gestures ship with the backend. |

## 5. Architecture overview

```
                     ┌─────────────────────────────────────┐
                     │       /settings/memory (UI)         │
                     │  Profile · Timeline · Episodic Adv  │
                     └────────────┬────────────────────────┘
                                  │ reads/writes
                                  ▼
  ┌──────────────────────────────────────────────────────────────┐
  │                    MEMORY STORE (Postgres)                   │
  │  profiles.profile_doc      ── structured user model          │
  │  profiles.behavioral_model ── derived patterns               │
  │  profiles.profile_version  ── cache key                      │
  │  episodes                  ── content + embedding + entities │
  │  memory_audit              ── learned/forgot/merged log      │
  │  memory_corrections        ── user edits (high-prio signal)  │
  └──────────────────────────────────────────────────────────────┘
        ▲                      ▲                    ▲
        │ writes               │ reads              │ refines
        │                      │                    │
  ┌─────┴──────┐         ┌─────┴──────┐      ┌──────┴───────┐
  │ Memory     │         │ Retrieval  │      │ Sleep-time   │
  │ Tools      │         │ Layer      │      │ Consolidate  │
  │ (model     │         │ (hot path) │      │ (Inngest)    │
  │  callable) │         │            │      │              │
  └─────┬──────┘         └─────┬──────┘      └──────┬───────┘
        │                      │                    │
        │                      │                    │ scheduled
        │                      │                    │ per-user 3am
        │                      │                    │
        └──────────────────────┴────────────────────┘
                               │
                  ┌────────────┴─────────────┐
                  │ POST /api/chat (hot path)│
                  │   ┌────────────────────┐ │
                  │   │ assembleContext    │ │ ── existing
                  │   │ enrichTurn         │ │ ── NEW
                  │   │ retrieveEpisodes   │ │ ── NEW
                  │   └────────────────────┘ │ all in parallel
                  │   runConversation        │ ── existing, extended w/ memory tools
                  └──────────────────────────┘
```

## 6. Data model

All new tables and columns. Migrations applied via Supabase MCP.

### 6.1. `profiles` table additions

```sql
alter table public.profiles
  add column profile_doc jsonb not null default '{}'::jsonb,
  add column behavioral_model jsonb not null default '{}'::jsonb,
  add column profile_version int not null default 0,
  add column memory_onboarded_at timestamptz;
```

- `profile_doc` shape:
  ```jsonc
  {
    "identity":       { "content": "...", "sources": ["msg_id", ...], "updated_at": "..." },
    "preferences":    { "content": "...", "sources": [...], "updated_at": "..." },
    "current_themes": { "content": "...", "sources": [...], "updated_at": "..." },
    "active_projects":{ "content": "...", "sources": [...], "updated_at": "..." },
    "ru_and_me":      { "content": "...", "sources": [...], "updated_at": "..." }
  }
  ```
- `behavioral_model` shape (SQL-derived, no LLM):
  ```jsonc
  {
    "typical_activity_hour": { "fitness": 19, "study": 14, ... },
    "routine_completion_by_dow": { "mon": 0.82, "tue": 0.31, ... },
    "task_creation_to_completion_hours_p50": 36,
    "tracker_cadence_days": { "Running": 2.5, "Sleep": 1.0 },
    "sentiment_trend_7d": -0.1,
    "nudge_response_rate": { "silent": null, "gentle": 0.71, "active": 0.42 },
    "voice_share_24h": 0.65,
    "updated_at": "2026-05-22T..."
  }
  ```
- `profile_version` increments on any `profile_doc` write. Used for
  in-process cache invalidation and as the Anthropic prompt-cache key.

### 6.2. `episodes` table (new)

```sql
create extension if not exists vector;

create table public.episodes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  content         text not null,            -- 1-3 sentences, model-written
  source_message_ids uuid[] not null default '{}',
  entity_refs     jsonb not null default '{}'::jsonb,  -- { tasks: [uuid], routines: [...], trackers: [...], workspaces: [...] }
  importance      numeric(3,2) not null default 0.50 check (importance between 0 and 1),
  embedding       vector(1536),             -- text-embedding-3-small
  chat_id         uuid references public.chats(id) on delete set null,
  created_at      timestamptz not null default now(),
  last_referenced_at timestamptz not null default now(),
  superseded_by   uuid references public.episodes(id) on delete set null,
  superseded_reason text,
  archived_at     timestamptz                -- soft-archive for decay
);

create index episodes_user_active_idx
  on public.episodes (user_id)
  where superseded_by is null and archived_at is null;

create index episodes_embedding_idx
  on public.episodes
  using hnsw (embedding vector_cosine_ops)
  where superseded_by is null and archived_at is null;

create index episodes_entity_gin
  on public.episodes
  using gin (entity_refs);

alter table public.episodes enable row level security;
create policy "user owns their episodes"
  on public.episodes for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

### 6.3. `memory_audit` table (new)

```sql
create table public.memory_audit (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in (
                'learned', 'forgot', 'merged', 'superseded',
                'corrected', 'profile_rewrite', 'reversed'
              )),
  summary     text not null,                  -- human-readable, shown in UI
  payload     jsonb not null default '{}'::jsonb,  -- structured before/after
  episode_ids uuid[] not null default '{}',
  reversible  boolean not null default true,
  reversed_at timestamptz,
  reversed_by uuid references public.memory_audit(id),
  created_at  timestamptz not null default now()
);

create index memory_audit_user_recent_idx
  on public.memory_audit (user_id, created_at desc);

alter table public.memory_audit enable row level security;
create policy "user owns their audit log"
  on public.memory_audit for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

### 6.4. `memory_corrections` table (new)

```sql
create table public.memory_corrections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  section     text,                          -- which profile section, if applicable
  original    text not null,
  corrected   text not null,                 -- empty string = deletion
  applied_in_consolidation_at timestamptz,   -- null until next sleep-time uses it
  created_at  timestamptz not null default now()
);

create index memory_corrections_unapplied_idx
  on public.memory_corrections (user_id)
  where applied_in_consolidation_at is null;

alter table public.memory_corrections enable row level security;
create policy "user owns their corrections"
  on public.memory_corrections for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

### 6.5. `match_episodes` RPC

```sql
create function public.match_episodes(
  p_user_id uuid,
  p_query_embedding vector(1536),
  p_limit int default 12
) returns table (id uuid, content text, importance numeric, similarity float)
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select e.id, e.content, e.importance,
         1 - (e.embedding <=> p_query_embedding) as similarity
  from public.episodes e
  where e.user_id = p_user_id
    and e.superseded_by is null
    and e.archived_at is null
    and e.embedding is not null
  order by e.embedding <=> p_query_embedding
  limit p_limit;
$$;
```

### 6.6. Indexes that should already exist (sanity)

- `messages (user_id, chat_id, created_at)` — used by enrichment for
  recent-turn pronoun resolution.
- `tasks (user_id, status)`, `routines (user_id, is_active)`,
  `workspaces (user_id, is_archived)` — used to build the entity
  catalog passed to enrichment.

## 7. Component design

### 7.1. Memory tools (model-facing)

Added to `src/lib/ai/tools/definitions.ts` and a new handler file
`src/lib/ai/tools/handlers/memory.ts`.

```ts
// Tool 1 — note an episode (the most-used memory tool)
{
  name: "note_episode",
  description:
    "Record something memory-worthy that just happened in this turn: a preference reveal, a decision, a life event, a correction, a strong opinion, a stated plan. Write a brief 1-3 sentence summary written in third person about the user. Skip for trivial chat (thanks, ok, idk) and for things already captured by structured tools (creating a task is not an episode — the task itself is the record).",
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
          workspace_titles:     { type: "array", items: { type: "string" } }
        }
      },
      importance: { type: "number", minimum: 0, maximum: 1, description: "Default 0.5. Use higher (>=0.7) for life events, strong preferences, corrections of prior beliefs. Lower (<=0.3) for small observations." }
    },
    required: ["summary"]
  }
}

// Tool 2 — update a profile section directly
{
  name: "update_profile",
  description:
    "When the user states a fact about themselves that belongs in the profile (moved, changed name, new job, life situation change, strong preference declaration). Pass the section and the natural-language update. The consolidation job will merge it cleanly into the section on the next sleep-time pass; an immediate light patch runs now so the change is visible right away.",
  parameters: {
    type: "object",
    properties: {
      section: { type: "string", enum: ["identity", "preferences", "current_themes", "active_projects", "ru_and_me"] },
      update:  { type: "string", description: "Natural-language statement, e.g. 'Moved from Seattle to Tokyo in May 2026.'" }
    },
    required: ["section", "update"]
  }
}

// Tool 3 — forget
{
  name: "forget",
  description:
    "Mark a fact, episode, or profile statement as superseded. Use when the user explicitly retracts ('that's not true anymore', 'I don't do that') or contradicts something Ru previously remembered. Pass a natural-language description; the matcher resolves it.",
  parameters: {
    type: "object",
    properties: {
      target_description: { type: "string", description: "What to forget, e.g. 'that I'm cutting carbs' or 'my old Seattle address'." },
      reason: { type: "string", description: "Optional one-line reason — used in the audit log." }
    },
    required: ["target_description"]
  }
}
```

#### Important: `remember_fact` is NOT a separate tool

We initially designed a `remember_fact` tool but it collapses into
`update_profile` for facts that belong in a section, and into
`note_episode` for everything else. Two tools cover the surface; three
would create overlap and tool-selection ambiguity.

#### Handler behavior

- `note_episode` → resolves `entity_refs` via existing fuzzy matchers,
  embeds the summary via embedder, inserts the row with the current
  assistant message id in `source_message_ids`. Writes a
  `memory_audit` row of kind `learned`. Returns a `cardKind: "insight"`
  card so the UI can optionally show a tiny "remembered" toast (see
  §7.7 on toast policy).
- `update_profile` → writes a `memory_corrections` row with the update,
  triggers an immediate light patch on that section (one model call,
  rewrites just that section), increments `profile_version`. Writes a
  `memory_audit` row of kind `profile_rewrite`.
- `forget` → fuzzy-matches the target (against episodes by content
  similarity, profile sections by trigram), marks `superseded_by` /
  edits the section, writes `memory_audit` of kind `forgot` (reversible).

### 7.2. Enrichment layer (`src/lib/ai/engine/enrich.ts`)

```ts
export interface TurnEnrichment {
  resolvedEntities: {
    tasks:      Array<{ id: string; title: string; mentioned_as: string }>;
    routines:   Array<{ id: string; title: string; mentioned_as: string }>;
    trackers:   Array<{ id: string; name: string;  mentioned_as: string }>;
    workspaces: Array<{ id: string; title: string; mentioned_as: string }>;
    dates:      Array<{ iso: string; mentioned_as: string }>;
  };
  intentHints: string[];      // e.g. ["log_activity", "possibly create_tracker"]
  memorySignals: Array<{
    kind: "preference_reveal" | "life_event" | "correction" | "strong_opinion" | "plan_statement";
    span: string;             // the substring that triggered the signal
  }>;
  sentiment: "positive" | "neutral" | "low" | "stressed" | null;
  voiceContext: { disfluencies: number; self_corrections: number } | null;
}

export async function enrichTurn(opts: {
  userMessage: string;
  recentTurns: NormalizedMessage[];     // last ~10
  entityCatalog: EntityCatalog;          // open tasks, active routines, trackers, workspaces
  voice: boolean;
  config: ProviderConfig;                // user's chat provider; we pick the cheap sibling
  signal?: AbortSignal;
}): Promise<TurnEnrichment | null>;
```

- **Model selection:** for each top-level provider, the cheap sibling:
  - Anthropic → `claude-haiku-4-5-20251001`
  - OpenAI → `gpt-4o-mini` (or whatever is current cheap)
  - Gemini → `gemini-2.5-flash`
  - ChatGPT OAuth → **fallback to pure-SQL enrichment** (entity match
    via `pg_trgm` only, no LLM). We do not burn user OAuth quota on
    enrichment.
- **Timeout:** 600ms hard cap (Promise.race with AbortController).
  Returns `null` on timeout. Hot path proceeds without it.
- **Output validation:** Zod-schema the JSON. Drop fields that don't
  validate. A bad enrichment never poisons the prompt.
- **Cost target:** $0.0001–$0.0003 per turn on Haiku. Negligible.

### 7.3. Retrieval layer (`src/lib/ai/engine/retrieve.ts`)

```ts
export async function retrieveEpisodes(opts: {
  supabase: SupabaseClient<Database>;
  userId: string;
  userMessage: string;
  recentTurns: NormalizedMessage[];      // last 3 for embedding context
  embedder: Embedder;                    // platform-managed
  signal?: AbortSignal;
}): Promise<Episode[]>;                  // empty array on failure
```

- Fast stage: embed `(recentTurns + userMessage)` → `match_episodes`
  top-12. 200ms soft cap.
- Entity top-up (called after enrichment lands): for each entity id in
  `resolvedEntities` not represented in fast results, single SQL by
  `entity_refs @>` to pull the top 2 most-recent episodes per entity.
- Rerank deterministic:
  ```
  score = 0.55 * cosine_similarity
        + 0.20 * importance
        + 0.15 * recency_score   (exp decay, 30-day half-life)
        + 0.10 * entity_boost    (1.0 if linked to an enrichment entity)
  ```
- Cap at top 6. Render each as:
  `"{summary}  (from {short date}{, workspace X if any})"`.
- Update `last_referenced_at` on returned episodes (fire-and-forget).
- Failure modes:
  - Embedder down → entity-pass-only fallback.
  - pgvector slow → return whatever the entity pass got, or `[]`.
  - No episodes yet → return `[]`, the prompt block is omitted.

### 7.4. Embedder (`src/lib/ai/embedder.ts`)

Single platform-wide embedding provider. **OpenAI
`text-embedding-3-small` (1536-d)** via a **server-side `OPENAI_API_KEY`
managed by the platform** — not BYOK. Reason: every user needs
embeddings regardless of their chat provider; we eat the cost
(~$0.02 per million tokens, ~$0.50/month for a heavy user). This is
the one piece of the AI pipeline that is not provider-pluggable, and
that's the right call for a v1.

The interface is abstracted so we can swap providers later without
touching callers.

```ts
export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;   // batched
}
```

### 7.5. Hot-path integration (`src/app/api/chat/route.ts`)

Diff against current shape:

```diff
- const [messages] = await Promise.all([
-   assembleContext({ supabase, userId: user.id, chatId, newUserMessage, voice }),
-   assistantInsertP,
- ]);
+ const [messages, enrichment, fastEpisodes] = await Promise.all([
+   assembleContext({ supabase, userId: user.id, chatId, newUserMessage, voice }),
+   enrichTurn({ userMessage, recentTurns, entityCatalog, voice, config, signal }),
+   retrieveEpisodes({ supabase, userId, userMessage, recentTurns, embedder, signal }),
+   assistantInsertP,
+ ]);
+
+ const episodes = enrichment
+   ? await topUpEpisodesByEntity({ supabase, userId, fastEpisodes, enrichment })
+   : fastEpisodes;
+
+ // Inject memory blocks into messages array (between state and history)
+ injectMemoryBlocks(messages, { profile, behavioralModel, episodes, enrichment });
```

`assembleContext` already pulls profile/behavioral_model (added to its
parallel-query batch); the route just wires the new outputs in. The
runConversation generator is untouched — memory tools come in via
TOOL_DEFINITIONS like any other tool.

### 7.6. Sleep-time consolidation (`src/lib/inngest/functions/memory-consolidate.ts`)

Replaces the current `daily-summary.ts` and absorbs `routine-detection`
(the dumb string match becomes pass 4 below). The existing functions
are deleted; `daily_summaries` table is kept (it's referenced by the
context block).

```ts
export const memoryConsolidate = inngest.createFunction(
  { id: "memory-consolidate" },
  [
    // Per-user-timezone scheduling: hourly cron checks who's at local 3am.
    { event: "memory.consolidate.requested" },              // immediate (manual rebuild button)
    { event: "memory.consolidate.user_profile_touched" },   // light patch (one-section)
    { cron: "0 * * * *" },                                  // hourly tz sweep
  ],
  async ({ event, step }) => {
    // ... five passes, see §7.6.1-7.6.5
  }
);
```

#### 7.6.1. Pass 1 — Profile section rewrite

For each section in `["identity", "preferences", "current_themes", "active_projects", "ru_and_me"]`:

- Pull the section's existing content from `profile_doc`.
- Pull yesterday's high-importance episodes (`importance >= 0.6`)
  whose primary `memorySignals.kind` maps to this section. The
  mapping is fixed:
  - `life_event` → identity
  - `preference_reveal` → preferences
  - `strong_opinion` → preferences
  - `plan_statement` → active_projects (if entity_refs include a
    workspace) else current_themes
  - `correction` → applied to whichever section the original fact
    lived in (looked up via `memory_corrections.section` or, if
    model-driven, the section the model passed)
  Episodes with no signal that maps cleanly are skipped at pass 1
  — they're still in episodic memory, they just don't feed profile
  rewrite.
- Pull unapplied `memory_corrections` for this section.
- If no new input AND no corrections, **skip** (don't rewrite).
- Otherwise: call the consolidation model (Haiku) with a
  section-specific prompt. Output is the new section content (under
  the section's token budget) + a list of `source_message_ids`.
- Diff against previous content. If unchanged, skip the write.
- On write: increment `profile_version`, write `memory_audit` row of
  kind `profile_rewrite` with before/after, mark applicable
  `memory_corrections.applied_in_consolidation_at`.

Section token budgets (sub-caps under the 1500-token total):
- identity: 250
- preferences: 350
- current_themes: 300
- active_projects: 300
- ru_and_me: 300

#### 7.6.2. Pass 2 — Episode curation

- **Deduplicate.** Within yesterday's new episodes, compute pairwise
  cosine similarity. Pairs > 0.92 → merge (combine `source_message_ids`,
  pick the higher-importance one's content). Write `memory_audit` of
  kind `merged`.
- **Merge across days.** For each new episode, find existing episodes
  with cosine > 0.88 AND shared entity refs. Merge into the existing
  one (boost its importance by `+min(0.15, 1 - existing.importance)`,
  append `source_message_ids`). Older episode marked superseded.
- **Importance reweighting.** Run a small model call once per user
  with up to 50 episode summaries → output an importance score
  per episode in 0–1. Update where the score moved by ≥ 0.15.

#### 7.6.3. Pass 3 — Behavioral model (pure SQL)

Computes the `behavioral_model` JSONB from existing structured data:

- `typical_activity_hour[category]` — median hour-of-day of
  `activity_log` per category, last 30 days, requires ≥5 samples.
- `routine_completion_by_dow[mon..sun]` — completion rate of
  `routine_logs` grouped by day-of-week, last 60 days.
- `task_creation_to_completion_hours_p50` — percentile_disc(0.5) on
  `extract(epoch from completed_at - created_at)`, last 90 days,
  completed tasks only.
- `tracker_cadence_days[name]` — average gap between consecutive
  entries per tracker, last 30 days, requires ≥3 entries.
- `sentiment_trend_7d` — slope of avg `activity_log.sentiment` over
  last 7 days.
- `nudge_response_rate[level]` — fraction of reminders with
  matching `nudge_level` that the user acted on within 2h.
- `voice_share_24h` — fraction of messages with `input_method='voice'`
  in last 24h.

All SQL. No model call. Writes the whole JSONB; no diff complexity.

#### 7.6.4. Pass 4 — Routine detection v2

Replaces the dumb string match. Inputs:
- Activity-log clusters (existing pg_trgm logic).
- `behavioral_model.typical_activity_hour` for time-of-day.
- Episodic memory entities (a recurring habit often shows up in
  episodes before showing up as a routine).

Candidate routine = cluster of ≥4 occurrences in 14 days AND time-of-day
stdev < 2h. For each candidate, call the consolidation model with the
cluster + the user's profile and ask: "Is this a real routine worth
promoting?" Model must vote yes for auto-creation.

Created routines start with `is_active=false` and a
`detection_confidence` score; the user confirms in Today.
`routine.detected` event still fires.

#### 7.6.5. Pass 5 — Decay / forgetting

In order:

1. **Apply unhandled `memory_corrections`** — for any correction not
   yet applied to a profile section (passed 1 missed it), apply the
   delta directly: if `corrected = ""`, remove the original; else
   replace. Mark applied.
2. **Stated forgets** — episodes whose `superseded_by` is set stay
   excluded from active queries (already enforced by index predicate).
   No action needed — just verify the index is being used.
3. **Stale low-importance** — `update episodes set archived_at = now()
   where importance < 0.3 and last_referenced_at < now() - interval
   '90 days' and superseded_by is null and archived_at is null`. Write
   one rollup `memory_audit` row of kind `forgot` per N archived.
4. **Contradiction resolution** — if pass 1 produced a profile rewrite
   that contradicts existing facts (detected by the model's output
   including a `superseded: [msg_id, ...]` field), mark those originating
   episodes superseded. Write `memory_audit` of kind `superseded`.

### 7.7. Memory tool toast policy

`note_episode` returns a card with `cardKind: "insight"`. **In chat,
the card is NOT rendered.** Memory writes are silent — surfacing them
in the chat stream is performative and breaks the conversational
register Ru cultivates.

The card *is* still recorded on the assistant message (in the
`messages.cards` jsonb), so the audit timeline can reconstruct
exactly what was remembered in each turn. The UI just chooses not to
paint it.

The single exception: `update_profile` may render a tiny inline
chip — "✓ updated my notes on you" — once per turn at most, since
the user has explicitly stated something that changed how Ru
understands them, and silently swallowing that feels evasive.

### 7.8. UI — `/settings/memory`

Route: `src/app/(app)/settings/memory/page.tsx`

Layout mirrors the editorial style elsewhere — cream paper, serif
display, lime accents, no purple/dark-by-default tropes.

#### Tab 1 — Profile

Renders `profile_doc` as five readable sections in DM Serif Display
headings + DM Sans body. Each section:

- Hover → marker-underline appears under hover-able phrases.
- Click → contenteditable mode for the entire section. Save = blur or
  ⌘↩. Saving writes a `memory_corrections` row + triggers the light
  patch consolidation event for that section + bumps `profile_version`.
- Per-fact "✕" affordance on hover (we tokenize the section into
  sentences for this — sentence-level delete granularity is the
  right resolution).
- Faint provenance link next to each sentence: `from 2026-04-12 chat`.
  Click → opens the originating message in a slide-over peek panel.

Bottom of tab:

- "Rebuild from scratch" button (with confirm modal). Dispatches
  `memory.consolidate.requested` with `mode: "rebuild"` — clears
  profile_doc, runs over all messages (capped at last 180 days),
  produces fresh sections.

#### Tab 2 — Memory Timeline

Renders `memory_audit` reverse-chronologically, day-grouped. Entry
shape:

```
Today
  Ru learned: you're not a morning person                    [undo]
    from "honestly I just can't do 6am, my brain doesn't work"
  Ru forgot: that you're cutting carbs                       [undo]
    superseded by: you're tracking macros now, not cutting carbs
```

- Hover → `[undo]` chip appears. Click → reverses the change. Writes
  a new `memory_audit` row of kind `reversed`, sets
  `reversed_at + reversed_by` on the original.
- Undo for `learned` → archives the episode.
- Undo for `forgot` → clears `superseded_by`.
- Undo for `merged` → splits the merge (we keep the pre-merge state
  in `payload`).
- Non-reversible entries (`profile_rewrite` with no pre-state stored,
  rollup forgets) don't show the chip.

Infinite scroll, paginated by 50.

#### Tab 3 — Episodic memory (advanced)

Behind a disclosure (`> Show advanced memory` chevron). Default
collapsed. Once expanded:

- Filter row: by date, by entity (typeahead), by importance threshold.
- Table-ish list of episodes: `content`, `importance` bar (0–1),
  `last_referenced_at`, entity chips, `[forget]` button.
- Per-episode "forget" → marks superseded, audit log entry, undoable.

Default sort: importance desc, then last_referenced_at desc.

#### Nav indicator

In the existing top-nav (right side, next to the user avatar), a small
chip showing `{n} facts` where n is the count of non-empty
profile-section sentences + total active episodes. Click →
`/settings/memory`. The intent: visibility is trust.

#### First-time onboarding moment

On first visit to `/settings/memory` (gated by
`profiles.memory_onboarded_at IS NULL`), a one-time soft modal:

> **Here's what I've picked up about you so far.**
>
> I learn from our conversations and update this whenever you tell me
> something new. Everything's editable — fix anything that's off and
> I'll learn from your correction.

Single CTA: "Got it." On dismiss, set `memory_onboarded_at = now()`.

### 7.9. System prompt integration

`buildSystemPrompt` (in `src/lib/ai/engine/system-prompt.ts`) gets a
new section appended:

```
Memory:
- You have a memory of this user. Their profile is in a separate
  system block — refer to it as your understanding of them. Behavioral
  patterns are in another block — refer to them when you notice the
  user about to repeat one.
- Use note_episode for memory-worthy moments: preference reveals,
  life events, decisions, corrections, strong opinions, plans you
  agree to. Skip trivial chat and things already captured by other
  tools.
- Use update_profile when the user explicitly states a fact that
  belongs in a profile section.
- Use forget when the user retracts or contradicts something you
  previously knew.
- Never narrate memory writes in your reply. The memory layer is
  silent — talk to the user about what they care about, not what
  you just remembered.
- When recall fetches episodes, treat them as facts you know — don't
  preface with "I remember…" or "you mentioned…" unless the user
  explicitly asks what you remember.
```

The `voice` mode formatting clause is unchanged.

## 8. Data flow

### 8.1. Hot path — every turn

```
T+0     POST /api/chat received
T+5ms   Auth + provider resolve
T+20ms  Fan out (all in parallel):
          assembleContext     [profile, behavioral, history, summaries, routines, tasks]
          enrichTurn          [Haiku call, 250ms p50, 600ms timeout]
          retrieveEpisodes    [embed + match, 200ms soft cap]
          assistantInsert     [supabase, ~80ms]
T+~300  All resolved (slowest wins)
T+305   entity top-up if enrichment surfaced unmatched entities  (50ms)
T+360   Inject memory blocks, hand off to runConversation
T+360+  First text token streams (existing pipeline)
```

Net added latency vs today: **~60ms p50** (the entity top-up). The
enrichment + episode retrieval run inside the existing
assembleContext budget — that's the unlock.

### 8.2. Memory write paths

```
A) Model-driven via tool call
   note_episode / update_profile / forget called mid-turn
     → handler validates + writes
     → memory_audit row
     → profile_version bump if applicable
     → for update_profile: enqueue memory.consolidate.user_profile_touched event

B) User-driven via UI
   inline edit on /settings/memory
     → memory_corrections row
     → optional immediate light patch via memory.consolidate.user_profile_touched
     → profile_version bump

C) Sleep-time
   memory-consolidate function runs at user-local 3am
     → five passes (§7.6)
     → all writes flow through the same handlers,
       audit log accumulates
```

## 9. Failure handling

| Failure | Behavior |
|---|---|
| Enrichment times out | Proceed without it. Log a metric. Tools that benefit from enrichment fall back to existing fuzzy match. |
| pgvector slow / unavailable | Skip episodic block this turn. Profile + behavioral model + history still go in. |
| Embedder API down | Entity-pass-only retrieval. No new embeddings written until recovery (episodes still write, embedding column is null — backfilled later). |
| Consolidation model fails | Skip that pass. Other passes still run. Pass-1 failure on a section just leaves that section unchanged that night. |
| `forget` matches nothing | Tool returns a soft error ("I don't have a memory matching that — want to be more specific?"). No write. |
| Conflicting concurrent edits | Last-writer-wins on `profile_doc.section.content`. We accept this; collisions are rare for single-user. `profile_version` lets us detect drift in caches. |
| Audit timeline reversal of a missing source | If undoing a `learned` episode that's already been merged into another, we split the merge first, then archive. Recursive reversal is fine since `memory_audit.payload` carries the pre-state. |

## 10. Cost & latency budgets

### Hot path (per turn)

- Enrichment: ~$0.0001–$0.0003 (Haiku, ~500-1500 input tokens).
- Embedding: ~$0.000002 (1k tokens at $0.02/M). Effectively free.
- Episodic retrieval: SQL only, no model cost.
- Memory tools (`note_episode` etc.): the cost is part of the
  main-model turn — they're regular tool calls. Embedding the
  episode summary on write adds ~$0.000001.

**Net hot-path cost addition:** under $0.0005 per turn. Negligible
relative to the main model call.

**Net hot-path latency:** ~60ms p50 (entity top-up). Effectively flat.

### Sleep-time (per active user, per night)

- Pass 1 (profile rewrite, ≤5 sections, Haiku): $0.005–$0.015
- Pass 2 (episode curation, dedup + importance): $0.003–$0.010
- Pass 3 (behavioral model, SQL): $0
- Pass 4 (routine detection v2, conditional model votes): $0–$0.005
- Pass 5 (decay): $0

**Per-user-per-night:** $0.01–$0.03 typical. Cap individual user
spend at $0.05/night (skip pass 1 if section count × budget exceeds).

**At 10K active users:** $100–$300/month.

### Storage

- Per active user: ~5MB profile/audit/corrections + ~50MB embeddings
  per year (assuming 50 episodes/month × 1536d × 4 bytes ≈ 0.3MB/month
  but with overhead ~4MB/month — call it 50MB/year per heavy user).
- 10K active users at 50MB each = 500GB. Supabase Pro tier handles
  this; we'll need to be more careful at 100K+ users (move embeddings
  to a dedicated vector DB).

## 11. Security & privacy

- **RLS enforced** on every new table. `user_id = auth.uid()` on all
  policies. Service-role-only writes go through `createServiceClient`
  in Inngest functions.
- **Embedder API key** is server-side only (`OPENAI_API_KEY` —
  separate env var from any BYOK). Never exposed to the client.
- **No PII leaves Supabase** except (a) text we send to the chat
  provider (the user's own provider, by their choice), (b) text we
  send to the embedder (one platform call), (c) text we send to the
  consolidation model (Haiku, our own key). We document all three
  in the privacy policy update that ships with M0.
- **User can wipe memory** entirely: `/settings/memory` → "Rebuild
  from scratch" with a "wipe and don't rebuild" option. Deletes
  episodes, clears profile_doc, leaves messages (the source of truth)
  alone.
- **Account deletion** cascade-deletes via existing
  `on delete cascade` on all new tables.

## 12. Migration from current state

### What gets removed

- `src/lib/inngest/functions/daily-summary.ts` (replaced by
  `memory-consolidate` pass 1+3).
- `src/lib/inngest/functions/routine-detection.ts` (replaced by
  pass 4).

The `daily_summaries` table stays — `assembleContext` still uses it
for the state block and we still want the count metrics for the
Today page.

### What gets added

- New migrations (§6).
- New modules: `src/lib/ai/embedder.ts`, `src/lib/ai/engine/enrich.ts`,
  `src/lib/ai/engine/retrieve.ts`, `src/lib/ai/tools/handlers/memory.ts`,
  `src/lib/inngest/functions/memory-consolidate.ts`.
- New routes: `src/app/(app)/settings/memory/page.tsx` and
  associated server actions / API routes for inline edit + undo.

### Existing user backfill

On first sleep-time run after deploy, every active user gets a
**bootstrap consolidation** that processes up to the last 180 days
of messages in one pass. Per user this might cost $0.10–$0.30 — a
one-time spend. We rate-limit to 50 bootstraps/hour so the Anthropic
account doesn't get flagged.

A soft modal in the UI says: "I'm reading our older chats to build a
profile — this will be ready by tomorrow." After the bootstrap
finishes, the user's `memory_onboarded_at` is left null so they get
the first-time-onboarding modal on next visit to `/settings/memory`.

## 13. Evaluation — how we know it's working

This is one of the items most likely to silently rot. We need real
measurement, not vibes.

### Per-user metrics (logged nightly)

- `profile_doc.identity.content.length` — should grow then plateau.
  If it stays at 0 for an active user after a week, enrichment
  + memory tools aren't firing.
- Episodes count, % active vs archived.
- `memory_audit` entries per day, broken down by `kind`. Healthy
  ratios: `learned` >> `forgot` early; converges over time.
- `memory_corrections` rate. **High correction rate = quality
  problem.** This is the metric to watch.
- `last_referenced_at` distribution on episodes — if we never recall
  anything we wrote, retrieval is broken.

### System-level metrics

- Hot-path p50/p95 latency (existing). Must not regress > 100ms p95.
- Enrichment timeout rate. Target < 2%.
- Empty-retrieval rate per turn (after the first 5 turns of a user's
  history). Target < 30% (most turns shouldn't recall, but a
  retrieval system that never recalls is broken).
- Memory tool call rate per turn (measured over 7-day rolling
  window). Target: `note_episode` on 10–20% of turns,
  `update_profile` on < 2%, `forget` on < 0.5%. Sustained zero =
  tools aren't firing → check enrichment + system-prompt instruction.
  Sustained > 30% = noise → the model is over-remembering.
- Consolidation pass success rate.

### Gold-set eval (deferred to M9 in roadmap)

A proper per-user gold set ("Ru should know X after Y conversations,
graded by another model") is M9. For M0 v1, we ship the
instrumentation and look at the numbers ourselves.

## 14. Rollout

1. **Internal dogfood** (week 1): myself + close testers. Watch
   metrics. Tune enrichment + consolidation prompts. Hard kill switch
   via a `memory_enabled` boolean on the profile.
2. **Soft launch** (week 2-3): default-on for new signups. Existing
   users see a "Ru just got a memory" banner with a one-click enable.
3. **Default-on for everyone** (week 4): banner removed,
   `memory_enabled` deprecated.

The kill switch lives on `profiles.memory_enabled` and short-circuits
the enrichment + retrieval + memory tools when false. The
consolidation job skips users where it's false. This gives us a
clean rollback if anything goes catastrophically wrong.

## 15. Open questions / explicit deferrals

- **Embedding model choice.** We default to OpenAI `text-embedding-3-
  small`. If we want to be provider-neutral (avoid an OpenAI key for
  Anthropic-only users in the future), we'd need to switch to Voyage
  or a Cohere embedder. For now, OpenAI is the right call.
- **How aggressive is the contradiction detector?** Pass 1 detects
  contradictions via the model's `superseded` output. If false-positive
  rate is high in dogfood, we add a confirmation step or raise the
  threshold.
- **What happens to existing `daily_summaries` after we stop writing
  the `message_summary` field?** We continue writing it from pass 1
  as a side effect — extract a short paragraph at the end of pass 1.
  Backfill old summaries opportunistically (next time the user is
  active, run pass 1 over their last 7 days). Acceptable lag.
- **Should the profile be visible in chat as a "/profile" reference?**
  Not in M0. Users see it on `/settings/memory`. Considered for M1.
- **Companion / Ru's mood model integration.** Ru's character has
  moods (`ru-companion-store`). The profile's `ru_and_me` section
  could feed the mood model (formality, humor level). Out of scope
  for M0 — flag for M8.

---

## Appendix A — file layout

```
src/
  app/
    (app)/settings/memory/
      page.tsx                          NEW   tabs container
      profile-tab.tsx                   NEW
      timeline-tab.tsx                  NEW
      episodic-tab.tsx                  NEW
      provenance-peek.tsx               NEW   slide-over for source messages
      actions.ts                        NEW   server actions for edits/undo
    api/
      chat/route.ts                     MODIFIED  wire enrichment + retrieval
      memory/rebuild/route.ts           NEW   POST → memory.consolidate.requested
  lib/
    ai/
      embedder.ts                       NEW
      engine/
        context.ts                      MODIFIED  pull profile + behavioral
        enrich.ts                       NEW
        retrieve.ts                     NEW
        system-prompt.ts                MODIFIED  memory section
        stream.ts                       UNCHANGED
      tools/
        definitions.ts                  MODIFIED  add note_episode, update_profile, forget
        executor.ts                     MODIFIED  wire new handlers
        handlers/memory.ts              NEW
        fuzzy.ts                        MODIFIED  add matchEpisode helper
    inngest/
      functions/
        memory-consolidate.ts           NEW
        daily-summary.ts                DELETED
        routine-detection.ts            DELETED
        (others unchanged)
  components/
    settings/memory/                    NEW
supabase/
  migrations/                           NEW migrations for §6
docs/
  pipeline-roadmap.md                   EXISTS — M0 marked active
  superpowers/specs/
    2026-05-22-memory-personalization-design.md   THIS DOC
```

## Appendix B — concrete examples

### B.1. A turn with enrichment

User says (voice): "yeah um I think I'm gonna skip the run today, I'm
pretty wiped from work"

Enrichment output:
```json
{
  "resolvedEntities": {
    "tasks": [],
    "routines": [{ "id": "abc-123", "title": "Morning run", "mentioned_as": "the run" }],
    "trackers": [],
    "workspaces": [],
    "dates": [{ "iso": "2026-05-22", "mentioned_as": "today" }]
  },
  "intentHints": ["skip_routine_today"],
  "memorySignals": [
    { "kind": "preference_reveal", "span": "I'm pretty wiped from work" }
  ],
  "sentiment": "low",
  "voiceContext": { "disfluencies": 2, "self_corrections": 0 }
}
```

The model now sees this *plus* the verbatim user message and can:
- Call `skip_routine_today(routine_id: "abc-123", reason: "wiped from work")` directly without a fuzzy-match round-trip.
- Call `note_episode(summary: "Piyush skipped the morning run, citing work fatigue. Sentiment low.", importance: 0.4, entity_refs: { routine_descriptions: ["Morning run"] })`.
- Match the tone in the reply (brief, warm — "yeah, takin' tonight off").

### B.2. A consolidation pass — preferences section rewrite

Yesterday's high-importance episodes affecting `preferences`:
- "Piyush mentioned he's not a morning person, struggles before 9am."
- "Piyush prefers 'gentle' nudges, said 'active' ones make him anxious."

Previous `preferences` content:
- "Prefers evening workouts. Uses voice mode at night, text during work hours."

Consolidation model output:
- "Not a morning person — struggles before 9am. Prefers evening workouts. Prefers 'gentle' nudges; 'active' ones cause anxiety. Uses voice mode at night, text during work hours."

`memory_audit` entries:
- `learned`: "you're not a morning person"
- `learned`: "you prefer gentle nudges; active ones make you anxious"
- `profile_rewrite`: payload contains before/after of the section.

### B.3. A user correction

User opens `/settings/memory`, edits the `preferences` section to
remove "Prefers evening workouts" because that's not true anymore.

- `memory_corrections` row written: `{ section: "preferences", original: "Prefers evening workouts", corrected: "" }`.
- Light patch event fires; section rewrite runs immediately.
- `memory_audit` of kind `corrected` written.
- Any episodes whose `entity_refs` linked to evening-workout claims
  get re-evaluated in tomorrow's pass 2 (importance lowered, may be
  superseded).

## Appendix C — interaction with existing systems

- **Tasks / routines / trackers / reminders:** unchanged. Memory
  is a sibling layer, not a parent. Tools that mutate these don't
  go through memory; they go through existing handlers.
- **Workspaces:** when a workspace is opened, its `id` and `title`
  enter the entity catalog passed to enrichment, so "in this plan"
  resolves correctly. Episodes can ref workspaces, but workspaces
  themselves remain managed by the workspace tools.
- **Voice (STT/TTS):** unchanged for M0. The `voice` flag still
  flows through enrichTurn → influences `voiceContext`. M2 will
  layer streaming-aware TTS on top.
- **Ru companion (mood, drift):** unchanged. M8 will hook the
  `ru_and_me` profile section into the mood model.
- **Today page / Sheet view / Plans page:** unchanged for M0. M1
  (anticipation) is what will read the behavioral model and surface
  proactive nudges on Today.
