# Memory & Personalization (M0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a hierarchical memory system for Ru — structured profile + episodic recall + nightly consolidation — so users feel known across chats and over time.

**Architecture:** Three-tier memory (profile JSONB in `profiles` table, episodes in pgvector-backed `episodes` table, raw messages untouched). Three new model-callable tools write memory. An intent-enrichment layer makes bad prompts work anyway. A two-stage retrieval (semantic + entity top-up) runs parallel to context assembly. A nightly Inngest function consolidates: rewrites profile sections, curates episodes, computes behavioral model from SQL, detects routines, applies decay. `/settings/memory` exposes everything as a three-tab editorial surface.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase Postgres + pgvector + RLS, Vitest, Inngest, OpenAI `text-embedding-3-small`, Claude Haiku 4.5 for cheap inference, Tailwind v4 + Framer Motion, DM Serif Display + DM Sans.

**Reference spec:** `docs/superpowers/specs/2026-05-22-memory-personalization-design.md`

---

## Phase boundaries

| Phase | What ships | Stop point worth reviewing? |
|---|---|---|
| 1 — Foundation | Migrations applied, embedder works, system prompt updated | Yes — schema is hard to change once in prod |
| 2 — Memory tools | `note_episode` / `update_profile` / `forget` callable from chat | Yes — internal dogfood possible after this |
| 3 — Hot-path | Profile + episodes injected on every turn; enrichment improves tool precision | Yes — first user-visible behavior change |
| 4 — Sleep-time | Memory quality starts compounding nightly | Yes — costs become real here |
| 5 — UI | `/settings/memory` audit + edit surface | Yes — last bundle before public rollout |
| 6 — Bootstrap & rollout | Existing users backfilled, kill-switch in place | Yes — final gate |

---

# Phase 1 — Foundation

Schema, embedder, system prompt. Everything later sits on this.

## Task 1.1: Migration — `profiles` table additions

**Files:**
- Create: `supabase/migrations/20260522000000_memory_profiles_columns.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Memory & personalization — profile additions
-- Adds the always-in-context user model + behavioral model + cache key.

alter table public.profiles
  add column if not exists profile_doc jsonb not null default '{}'::jsonb,
  add column if not exists behavioral_model jsonb not null default '{}'::jsonb,
  add column if not exists profile_version int not null default 0,
  add column if not exists memory_onboarded_at timestamptz,
  add column if not exists memory_enabled boolean not null default true;

comment on column public.profiles.profile_doc is
  'Structured user model: { identity, preferences, current_themes, active_projects, ru_and_me } each with { content, sources, updated_at }';
comment on column public.profiles.behavioral_model is
  'SQL-derived patterns: typical_activity_hour, routine_completion_by_dow, etc. Rebuilt nightly.';
comment on column public.profiles.profile_version is
  'Increments on any profile_doc write. Used for in-process cache invalidation and Anthropic prompt-cache keying.';
comment on column public.profiles.memory_enabled is
  'Kill-switch. When false, enrichment + retrieval + memory tools short-circuit and consolidation skips this user.';
```

- [ ] **Step 2: Apply via Supabase MCP**

Apply using `mcp__plugin_supabase_supabase__apply_migration` with name `memory_profiles_columns` and the SQL above.

- [ ] **Step 3: Verify columns exist**

Run `mcp__plugin_supabase_supabase__execute_sql` with:
```sql
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('profile_doc','behavioral_model','profile_version','memory_onboarded_at','memory_enabled');
```
Expected: 5 rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260522000000_memory_profiles_columns.sql
git commit -m "feat(memory): add profile_doc/behavioral_model/profile_version columns"
```

---

## Task 1.2: Migration — `episodes` table

**Files:**
- Create: `supabase/migrations/20260522000010_memory_episodes_table.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Episodic memory store. One row per "memory-worthy moment" the model captured.
-- Embedding is pgvector(1536) matching OpenAI text-embedding-3-small.

create extension if not exists vector;

create table if not exists public.episodes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  content         text not null,
  source_message_ids uuid[] not null default '{}',
  entity_refs     jsonb not null default '{}'::jsonb,
  importance      numeric(3,2) not null default 0.50 check (importance between 0 and 1),
  embedding       vector(1536),
  chat_id         uuid references public.chats(id) on delete set null,
  created_at      timestamptz not null default now(),
  last_referenced_at timestamptz not null default now(),
  superseded_by   uuid references public.episodes(id) on delete set null,
  superseded_reason text,
  archived_at     timestamptz
);

create index if not exists episodes_user_active_idx
  on public.episodes (user_id)
  where superseded_by is null and archived_at is null;

create index if not exists episodes_embedding_idx
  on public.episodes
  using hnsw (embedding vector_cosine_ops)
  where superseded_by is null and archived_at is null;

create index if not exists episodes_entity_gin
  on public.episodes
  using gin (entity_refs);

create index if not exists episodes_user_recent_idx
  on public.episodes (user_id, created_at desc)
  where superseded_by is null and archived_at is null;

alter table public.episodes enable row level security;

create policy "user owns their episodes"
  on public.episodes for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.episodes is
  'Episodic memory: model-written summaries of memory-worthy moments. Embeddings keyed via match_episodes RPC.';
```

- [ ] **Step 2: Apply via Supabase MCP**

Apply with name `memory_episodes_table`.

- [ ] **Step 3: Verify table + RLS**

Run via Supabase MCP:
```sql
select policyname, cmd from pg_policies where schemaname='public' and tablename='episodes';
select indexname from pg_indexes where schemaname='public' and tablename='episodes';
```
Expected: one policy `user owns their episodes`, four indexes.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260522000010_memory_episodes_table.sql
git commit -m "feat(memory): add episodes table with pgvector + entity GIN + RLS"
```

---

## Task 1.3: Migration — `memory_audit` table

**Files:**
- Create: `supabase/migrations/20260522000020_memory_audit_table.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Audit log — every change to memory (learned/forgot/merged/superseded/etc) lands here.
-- Drives the /settings/memory timeline tab + supports undo via `payload`.

create table if not exists public.memory_audit (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in (
                'learned', 'forgot', 'merged', 'superseded',
                'corrected', 'profile_rewrite', 'reversed'
              )),
  summary     text not null,
  payload     jsonb not null default '{}'::jsonb,
  episode_ids uuid[] not null default '{}',
  reversible  boolean not null default true,
  reversed_at timestamptz,
  reversed_by uuid references public.memory_audit(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists memory_audit_user_recent_idx
  on public.memory_audit (user_id, created_at desc);

alter table public.memory_audit enable row level security;

create policy "user owns their audit log"
  on public.memory_audit for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.memory_audit is
  'Every memory change Ru makes. Surfaced in /settings/memory timeline. payload carries before/after for undo.';
```

- [ ] **Step 2: Apply via Supabase MCP**

Apply with name `memory_audit_table`.

- [ ] **Step 3: Verify**

```sql
select policyname from pg_policies where schemaname='public' and tablename='memory_audit';
```
Expected: one policy.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260522000020_memory_audit_table.sql
git commit -m "feat(memory): add memory_audit table + RLS"
```

---

## Task 1.4: Migration — `memory_corrections` table

**Files:**
- Create: `supabase/migrations/20260522000030_memory_corrections_table.sql`

- [ ] **Step 1: Write the migration**

```sql
-- User-driven corrections. Written when the user edits a profile section in
-- /settings/memory. Sleep-time consolidation reads unapplied corrections as
-- a high-priority signal.

create table if not exists public.memory_corrections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  section     text,
  original    text not null,
  corrected   text not null,
  applied_in_consolidation_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists memory_corrections_unapplied_idx
  on public.memory_corrections (user_id)
  where applied_in_consolidation_at is null;

alter table public.memory_corrections enable row level security;

create policy "user owns their corrections"
  on public.memory_corrections for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.memory_corrections is
  'User edits to memory. Empty corrected = deletion. Fed back into next sleep-time pass.';
```

- [ ] **Step 2: Apply via Supabase MCP**

Apply with name `memory_corrections_table`.

- [ ] **Step 3: Verify**

```sql
select policyname from pg_policies where schemaname='public' and tablename='memory_corrections';
```
Expected: one policy.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260522000030_memory_corrections_table.sql
git commit -m "feat(memory): add memory_corrections table + RLS"
```

---

## Task 1.5: Migration — `match_episodes` RPC

**Files:**
- Create: `supabase/migrations/20260522000040_match_episodes_rpc.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Semantic episodic retrieval via cosine distance. SECURITY INVOKER + pinned
-- search_path matches the hardening we did on the other match_* RPCs.

create or replace function public.match_episodes(
  p_user_id uuid,
  p_query_embedding vector(1536),
  p_limit int default 12
) returns table (
  id uuid,
  content text,
  importance numeric,
  entity_refs jsonb,
  created_at timestamptz,
  similarity float
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select e.id, e.content, e.importance, e.entity_refs, e.created_at,
         1 - (e.embedding <=> p_query_embedding) as similarity
  from public.episodes e
  where e.user_id = p_user_id
    and e.superseded_by is null
    and e.archived_at is null
    and e.embedding is not null
  order by e.embedding <=> p_query_embedding
  limit greatest(1, least(p_limit, 50));
$$;

revoke execute on function public.match_episodes(uuid, vector(1536), int) from anon, public;
grant  execute on function public.match_episodes(uuid, vector(1536), int) to authenticated;
```

- [ ] **Step 2: Apply via Supabase MCP**

Apply with name `match_episodes_rpc`.

- [ ] **Step 3: Verify**

```sql
select proname, prosecdef, proconfig
from pg_proc
where proname = 'match_episodes' and pronamespace = 'public'::regnamespace;
```
Expected: one row, `prosecdef = false` (invoker), `proconfig` contains `search_path=public,pg_temp`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260522000040_match_episodes_rpc.sql
git commit -m "feat(memory): add match_episodes RPC with pinned search_path"
```

---

## Task 1.6: Regenerate Supabase TypeScript types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Regenerate types**

Run via Supabase MCP: `mcp__plugin_supabase_supabase__generate_typescript_types` and capture output.

- [ ] **Step 2: Write the new types file**

Write the generated output to `src/types/database.ts`.

- [ ] **Step 3: Type-check**

```bash
npm run build 2>&1 | head -50
```
Expected: no new type errors. (If existing errors, only verify no NEW ones.)

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "chore(types): regenerate database types after memory migrations"
```

---

## Task 1.7: Add embedder env var + .env example

**Files:**
- Modify: `.env.local.example`

- [ ] **Step 1: Append to `.env.local.example`**

Add to the existing file (don't replace):

```
# Embeddings provider for memory (M0). Server-side, platform-managed (not BYOK).
# Get a key at https://platform.openai.com/account/api-keys
OPENAI_EMBEDDING_API_KEY=
# Optional override; default is text-embedding-3-small (1536-d)
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

- [ ] **Step 2: Add to Vercel env**

Add `OPENAI_EMBEDDING_API_KEY` to Production + Preview via the Vercel MCP `update_project` or dashboard.

- [ ] **Step 3: Commit**

```bash
git add .env.local.example
git commit -m "chore(env): document OPENAI_EMBEDDING_API_KEY for memory pipeline"
```

---

## Task 1.8: Embedder module

**Files:**
- Create: `src/lib/ai/embedder.ts`
- Test: `src/tests/embedder.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/tests/embedder.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createEmbedder } from "@/lib/ai/embedder";

describe("embedder", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.OPENAI_EMBEDDING_API_KEY = "sk-test";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("embeds a batch and returns one vector per input", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { embedding: new Array(1536).fill(0.1), index: 0 },
          { embedding: new Array(1536).fill(0.2), index: 1 },
        ],
      }),
    } as never);

    const embedder = createEmbedder();
    const result = await embedder.embed(["hello", "world"]);

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(1536);
    expect(result[1][0]).toBeCloseTo(0.2);
  });

  it("throws when no API key is configured", async () => {
    delete process.env.OPENAI_EMBEDDING_API_KEY;
    const embedder = createEmbedder();
    await expect(embedder.embed(["x"])).rejects.toThrow(/OPENAI_EMBEDDING_API_KEY/);
  });

  it("returns an empty array for empty input without calling the API", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as never;
    const embedder = createEmbedder();
    const result = await embedder.embed([]);
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
```

The test imports `afterEach` from vitest — add to top: `import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";`.

- [ ] **Step 2: Run test, verify failure**

```bash
npx vitest run src/tests/embedder.test.ts
```
Expected: `Cannot find module @/lib/ai/embedder`.

- [ ] **Step 3: Implement the embedder**

```typescript
// src/lib/ai/embedder.ts
export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}

const DEFAULT_MODEL = "text-embedding-3-small";
const ENDPOINT = "https://api.openai.com/v1/embeddings";

export function createEmbedder(): Embedder {
  return {
    async embed(texts) {
      if (texts.length === 0) return [];
      const apiKey = process.env.OPENAI_EMBEDDING_API_KEY;
      if (!apiKey) throw new Error("OPENAI_EMBEDDING_API_KEY is not set");
      const model = process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_MODEL;

      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input: texts }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`embedder ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> };
      // Defensive: order by index — OpenAI usually returns sorted, but don't rely on it.
      const sorted = [...data.data].sort((a, b) => a.index - b.index);
      return sorted.map((d) => d.embedding);
    },
  };
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
npx vitest run src/tests/embedder.test.ts
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/embedder.ts src/tests/embedder.test.ts
git commit -m "feat(memory): add OpenAI embedder with batch + missing-key handling"
```

---

## Task 1.9: System prompt — memory section

**Files:**
- Modify: `src/lib/ai/engine/system-prompt.ts`

- [ ] **Step 1: Append memory section to `buildSystemPrompt`**

Insert before the final `Critical:` block (currently around the end of the returned string). Locate the line `Critical:` and add the following section directly above it:

```typescript
// In buildSystemPrompt's returned template literal, immediately before "Critical:"
`Memory:
- You have a memory of this user. Their profile is in a separate system block — refer to it as your understanding of them. Behavioral patterns are in another block — refer to them when you notice the user about to repeat one.
- Use note_episode for memory-worthy moments: preference reveals, life events, decisions, corrections, strong opinions, plans you agree to. Skip trivial chat and things already captured by other tools.
- Use update_profile when the user explicitly states a fact that belongs in a profile section (identity, preferences, current_themes, active_projects, ru_and_me).
- Use forget when the user retracts or contradicts something you previously knew.
- Never narrate memory writes in your reply. The memory layer is silent — talk to the user about what they care about, not what you just remembered.
- When recall fetches episodes, treat them as facts you know — don't preface with "I remember…" or "you mentioned…" unless the user explicitly asks what you remember.

`
```

(Note: the trailing blank line is intentional — it separates from the existing "Critical:" section.)

- [ ] **Step 2: Verify the prompt builds**

```bash
node -e "const {buildSystemPrompt} = require('./src/lib/ai/engine/system-prompt.ts'); console.log(buildSystemPrompt({displayName:'Test',timezone:'UTC',nowIso:new Date().toISOString()}))"
```

Won't work (TS file). Instead just type-check:
```bash
npm run build 2>&1 | grep -E "error TS" | head -5
```
Expected: no new TS errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/engine/system-prompt.ts
git commit -m "feat(memory): add Memory section to Ru's system prompt"
```

---

# Phase 2 — Memory write tools

The three new tools (`note_episode`, `update_profile`, `forget`) and their handlers. Internal dogfood becomes possible after this phase: tools are callable, they write rows, but recall/enrichment aren't wired yet (Phase 3).

## Task 2.1: Tool definitions

**Files:**
- Modify: `src/lib/ai/tools/definitions.ts`

- [ ] **Step 1: Append to `TOOL_DEFINITIONS` array**

Add these three entries at the end of the array (before the closing `];`):

```typescript
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
    name: "update_profile",
    description:
      "When the user states a fact about themselves that belongs in the profile (moved, changed name, new job, life situation change, strong preference declaration). Pass the section and the natural-language update. The consolidation job merges it into the section cleanly; an immediate light patch runs so the change is visible right away. Do not narrate this in your reply.",
    parameters: {
      type: "object",
      properties: {
        section: { type: "string", enum: ["identity", "preferences", "current_themes", "active_projects", "ru_and_me"] },
        update:  { type: "string", description: "Natural-language statement, e.g. 'Moved from Seattle to Tokyo in May 2026.'" },
      },
      required: ["section", "update"],
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
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "definitions.ts" | head -5
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/tools/definitions.ts
git commit -m "feat(memory): add note_episode/update_profile/forget tool definitions"
```

---

## Task 2.2: `matchEpisode` fuzzy helper

**Files:**
- Modify: `src/lib/ai/tools/fuzzy.ts`

- [ ] **Step 1: Append helper function**

Add to the existing file:

```typescript
// Match by content similarity (LIKE on lowercased content for v1 — pgvector
// for semantic match comes later when called from the consolidation pass).
export async function matchEpisodeByText(
  supabase: SupabaseClient<Database>,
  userId: string,
  query: string
): Promise<{ id: string; content: string } | null> {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const { data, error } = await supabase
    .from("episodes")
    .select("id, content")
    .eq("user_id", userId)
    .is("superseded_by", null)
    .is("archived_at", null)
    .ilike("content", `%${q}%`)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return { id: data[0].id, content: data[0].content };
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "fuzzy.ts" | head -5
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/tools/fuzzy.ts
git commit -m "feat(memory): matchEpisodeByText helper for forget tool"
```

---

## Task 2.3: `note_episode` handler

**Files:**
- Create: `src/lib/ai/tools/handlers/memory.ts`
- Test: `src/tests/memory-handler-note-episode.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/tests/memory-handler-note-episode.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { noteEpisode } from "@/lib/ai/tools/handlers/memory";

// Minimal supabase client mock — only what the handler touches.
function makeSupabase(opts: { insertResult?: { data: { id: string } | null; error: unknown } } = {}) {
  const inserted: unknown[] = [];
  const auditInserted: unknown[] = [];
  return {
    inserted,
    auditInserted,
    client: {
      from(table: string) {
        if (table === "episodes") {
          return {
            insert(row: unknown) {
              inserted.push(row);
              return {
                select() {
                  return {
                    single: async () => opts.insertResult ?? { data: { id: "ep-1" }, error: null },
                  };
                },
              };
            },
          };
        }
        if (table === "memory_audit") {
          return {
            insert: async (row: unknown) => {
              auditInserted.push(row);
              return { error: null };
            },
          };
        }
        throw new Error("unexpected table: " + table);
      },
    },
  };
}

vi.mock("@/lib/ai/embedder", () => ({
  createEmbedder: () => ({
    embed: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  }),
}));

describe("noteEpisode handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts an episode row with embedding + writes a learned audit entry", async () => {
    const { client, inserted, auditInserted } = makeSupabase();
    const result = await noteEpisode(
      {
        summary: "Piyush mentioned he is moving to Tokyo.",
        importance: 0.7,
      },
      { supabase: client as never, userId: "u-1", messageId: "msg-1" }
    );

    expect(result.ok).toBe(true);
    expect(inserted).toHaveLength(1);
    const ep = inserted[0] as Record<string, unknown>;
    expect(ep.user_id).toBe("u-1");
    expect(ep.content).toContain("Tokyo");
    expect(ep.importance).toBe(0.7);
    expect(ep.source_message_ids).toEqual(["msg-1"]);
    expect(ep.embedding).toEqual([0.1, 0.2, 0.3]);

    expect(auditInserted).toHaveLength(1);
    const audit = auditInserted[0] as Record<string, unknown>;
    expect(audit.kind).toBe("learned");
    expect(audit.episode_ids).toEqual(["ep-1"]);
  });

  it("returns ok:false on missing summary", async () => {
    const { client } = makeSupabase();
    const result = await noteEpisode({} as never, { supabase: client as never, userId: "u-1", messageId: null });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/summary/);
  });

  it("clamps importance to [0,1]", async () => {
    const { client, inserted } = makeSupabase();
    await noteEpisode(
      { summary: "x", importance: 5 },
      { supabase: client as never, userId: "u-1", messageId: "m-1" }
    );
    expect((inserted[0] as Record<string, unknown>).importance).toBe(1);

    inserted.length = 0;
    await noteEpisode(
      { summary: "x", importance: -1 },
      { supabase: client as never, userId: "u-1", messageId: "m-1" }
    );
    expect((inserted[0] as Record<string, unknown>).importance).toBe(0);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
npx vitest run src/tests/memory-handler-note-episode.test.ts
```
Expected: module not found.

- [ ] **Step 3: Implement the handler file**

```typescript
// src/lib/ai/tools/handlers/memory.ts
import type { ToolContext, ToolOutcome } from "../executor";
import { createEmbedder } from "@/lib/ai/embedder";
import { matchEpisodeByText } from "../fuzzy";

const SECTIONS = ["identity", "preferences", "current_themes", "active_projects", "ru_and_me"] as const;
type Section = (typeof SECTIONS)[number];

export async function noteEpisode(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolOutcome> {
  const summary = typeof args.summary === "string" ? args.summary.trim() : "";
  if (!summary) return { ok: false, message: "summary is required" };

  const rawImportance = typeof args.importance === "number" ? args.importance : 0.5;
  const importance = Math.max(0, Math.min(1, rawImportance));

  const entityRefs = (args.entity_refs as Record<string, unknown> | undefined) ?? {};

  let embedding: number[] | null = null;
  try {
    const embedder = createEmbedder();
    const [vec] = await embedder.embed([summary]);
    embedding = vec ?? null;
  } catch (e) {
    // Embedding failure is non-fatal — episode still gets written, just without
    // an embedding (consolidation can backfill later).
    console.error("note_episode embedding failed", e);
  }

  const sourceIds = ctx.messageId ? [ctx.messageId] : [];

  const { data, error } = await ctx.supabase
    .from("episodes")
    .insert({
      user_id: ctx.userId,
      content: summary,
      source_message_ids: sourceIds,
      entity_refs: entityRefs,
      importance,
      embedding,
    })
    .select()
    .single();

  if (error || !data) {
    return { ok: false, message: error?.message ?? "episode insert failed" };
  }

  await ctx.supabase.from("memory_audit").insert({
    user_id: ctx.userId,
    kind: "learned",
    summary,
    payload: { entity_refs: entityRefs, importance },
    episode_ids: [data.id],
    reversible: true,
  });

  return {
    ok: true,
    message: "noted",
    cardKind: "insight",
    card: { id: data.id, summary, importance },
  };
}

export async function updateProfile(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolOutcome> {
  const section = args.section as Section;
  const update = typeof args.update === "string" ? args.update.trim() : "";
  if (!SECTIONS.includes(section)) return { ok: false, message: "invalid section" };
  if (!update) return { ok: false, message: "update text required" };

  // Write a memory_corrections row (empty `original` = pure addition, the
  // consolidation pass merges into the section).
  const { error: corrErr } = await ctx.supabase.from("memory_corrections").insert({
    user_id: ctx.userId,
    section,
    original: "",
    corrected: update,
  });
  if (corrErr) return { ok: false, message: corrErr.message };

  // Bump version + light patch: append the line to the section's content with
  // a "pending consolidation" marker. The sleep-time job rewrites cleanly.
  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("profile_doc, profile_version")
    .eq("id", ctx.userId)
    .single();

  const doc = (profile?.profile_doc as Record<string, { content: string; sources: string[]; updated_at: string }> | null) ?? {};
  const existing = doc[section]?.content ?? "";
  const merged = existing ? `${existing}\n${update}` : update;
  const sources = doc[section]?.sources ?? [];
  if (ctx.messageId) sources.push(ctx.messageId);

  doc[section] = {
    content: merged,
    sources,
    updated_at: new Date().toISOString(),
  };

  await ctx.supabase
    .from("profiles")
    .update({
      profile_doc: doc,
      profile_version: (profile?.profile_version ?? 0) + 1,
    })
    .eq("id", ctx.userId);

  await ctx.supabase.from("memory_audit").insert({
    user_id: ctx.userId,
    kind: "profile_rewrite",
    summary: `Updated ${section}: ${update}`,
    payload: { section, update, mode: "tool_light_patch" },
    reversible: true,
  });

  return { ok: true, message: "profile updated" };
}

export async function forget(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolOutcome> {
  const target = typeof args.target_description === "string" ? args.target_description.trim() : "";
  const reason = typeof args.reason === "string" ? args.reason : "user retraction";
  if (!target) return { ok: false, message: "target_description is required" };

  const match = await matchEpisodeByText(ctx.supabase, ctx.userId, target);
  if (!match) {
    return { ok: false, message: "no memory matched that description" };
  }

  // Mark the matched episode superseded (no replacement — pure removal).
  await ctx.supabase
    .from("episodes")
    .update({ superseded_by: null, superseded_reason: reason, archived_at: new Date().toISOString() })
    .eq("id", match.id)
    .eq("user_id", ctx.userId);

  await ctx.supabase.from("memory_audit").insert({
    user_id: ctx.userId,
    kind: "forgot",
    summary: `Forgot: ${match.content}`,
    payload: { episode_id: match.id, reason, original_content: match.content },
    episode_ids: [match.id],
    reversible: true,
  });

  return { ok: true, message: "forgotten" };
}
```

- [ ] **Step 4: Run note_episode test, verify pass**

```bash
npx vitest run src/tests/memory-handler-note-episode.test.ts
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/tools/handlers/memory.ts src/tests/memory-handler-note-episode.test.ts
git commit -m "feat(memory): noteEpisode/updateProfile/forget handlers with note_episode tests"
```

---

## Task 2.4: `update_profile` handler test

**Files:**
- Test: `src/tests/memory-handler-update-profile.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/tests/memory-handler-update-profile.test.ts
import { describe, it, expect, vi } from "vitest";
import { updateProfile } from "@/lib/ai/tools/handlers/memory";

function makeSupabase(initialDoc: Record<string, unknown> = {}, initialVersion = 0) {
  const writes: { table: string; op: string; row?: unknown }[] = [];
  return {
    writes,
    client: {
      from(table: string) {
        if (table === "memory_corrections") {
          return {
            insert: async (row: unknown) => {
              writes.push({ table, op: "insert", row });
              return { error: null };
            },
          };
        }
        if (table === "profiles") {
          return {
            select() {
              return {
                eq() {
                  return {
                    single: async () => ({
                      data: { profile_doc: initialDoc, profile_version: initialVersion },
                      error: null,
                    }),
                  };
                },
              };
            },
            update(row: unknown) {
              writes.push({ table, op: "update", row });
              return { eq: async () => ({ error: null }) };
            },
          };
        }
        if (table === "memory_audit") {
          return {
            insert: async (row: unknown) => {
              writes.push({ table, op: "insert", row });
              return { error: null };
            },
          };
        }
        throw new Error("unexpected table: " + table);
      },
    },
  };
}

describe("updateProfile handler", () => {
  it("rejects unknown section", async () => {
    const { client } = makeSupabase();
    const result = await updateProfile(
      { section: "not_a_section", update: "x" },
      { supabase: client as never, userId: "u-1", messageId: "m-1" }
    );
    expect(result.ok).toBe(false);
  });

  it("appends to existing section + bumps version", async () => {
    const initial = {
      preferences: { content: "Prefers evening workouts.", sources: [], updated_at: "..." },
    };
    const { client, writes } = makeSupabase(initial, 3);

    const result = await updateProfile(
      { section: "preferences", update: "Hates 'active' nudges." },
      { supabase: client as never, userId: "u-1", messageId: "m-2" }
    );

    expect(result.ok).toBe(true);
    const profileUpdate = writes.find((w) => w.table === "profiles" && w.op === "update");
    expect(profileUpdate).toBeDefined();
    const updatePayload = profileUpdate!.row as Record<string, unknown>;
    expect(updatePayload.profile_version).toBe(4);
    const doc = updatePayload.profile_doc as Record<string, { content: string }>;
    expect(doc.preferences.content).toContain("Prefers evening workouts");
    expect(doc.preferences.content).toContain("Hates 'active' nudges");
  });

  it("creates a section if it didn't exist", async () => {
    const { client, writes } = makeSupabase({});
    await updateProfile(
      { section: "identity", update: "Lives in Tokyo." },
      { supabase: client as never, userId: "u-1", messageId: "m-3" }
    );
    const profileUpdate = writes.find((w) => w.table === "profiles" && w.op === "update");
    const doc = (profileUpdate!.row as Record<string, unknown>).profile_doc as Record<string, { content: string }>;
    expect(doc.identity.content).toBe("Lives in Tokyo.");
  });
});
```

- [ ] **Step 2: Run, verify pass**

```bash
npx vitest run src/tests/memory-handler-update-profile.test.ts
```
Expected: 3 passed.

- [ ] **Step 3: Commit**

```bash
git add src/tests/memory-handler-update-profile.test.ts
git commit -m "test(memory): updateProfile handler — section validation, append, version bump"
```

---

## Task 2.5: `forget` handler test

**Files:**
- Test: `src/tests/memory-handler-forget.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/tests/memory-handler-forget.test.ts
import { describe, it, expect, vi } from "vitest";
import { forget } from "@/lib/ai/tools/handlers/memory";

vi.mock("@/lib/ai/tools/fuzzy", () => ({
  matchEpisodeByText: vi.fn(),
}));

import { matchEpisodeByText } from "@/lib/ai/tools/fuzzy";

function makeSupabase() {
  const writes: { table: string; op: string; row?: unknown }[] = [];
  return {
    writes,
    client: {
      from(table: string) {
        if (table === "episodes") {
          return {
            update(row: unknown) {
              writes.push({ table, op: "update", row });
              return {
                eq() {
                  return { eq: async () => ({ error: null }) };
                },
              };
            },
          };
        }
        if (table === "memory_audit") {
          return {
            insert: async (row: unknown) => {
              writes.push({ table, op: "insert", row });
              return { error: null };
            },
          };
        }
        throw new Error("unexpected table: " + table);
      },
    },
  };
}

describe("forget handler", () => {
  it("returns ok:false when no episode matches", async () => {
    (matchEpisodeByText as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { client } = makeSupabase();
    const result = await forget(
      { target_description: "something" },
      { supabase: client as never, userId: "u-1", messageId: null }
    );
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/no memory matched/);
  });

  it("archives matched episode + writes audit row", async () => {
    (matchEpisodeByText as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "ep-9",
      content: "Piyush is cutting carbs.",
    });
    const { client, writes } = makeSupabase();
    const result = await forget(
      { target_description: "cutting carbs", reason: "not doing that anymore" },
      { supabase: client as never, userId: "u-1", messageId: null }
    );
    expect(result.ok).toBe(true);
    const episodeUpdate = writes.find((w) => w.table === "episodes" && w.op === "update");
    expect(episodeUpdate).toBeDefined();
    expect((episodeUpdate!.row as Record<string, unknown>).archived_at).toBeTruthy();
    const audit = writes.find((w) => w.table === "memory_audit");
    expect((audit!.row as Record<string, unknown>).kind).toBe("forgot");
  });

  it("rejects empty target_description", async () => {
    const { client } = makeSupabase();
    const result = await forget(
      { target_description: "   " },
      { supabase: client as never, userId: "u-1", messageId: null }
    );
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify pass**

```bash
npx vitest run src/tests/memory-handler-forget.test.ts
```
Expected: 3 passed.

- [ ] **Step 3: Commit**

```bash
git add src/tests/memory-handler-forget.test.ts
git commit -m "test(memory): forget handler — no-match, archive flow, empty input"
```

---

## Task 2.6: Wire memory handlers into the executor

**Files:**
- Modify: `src/lib/ai/tools/executor.ts`

- [ ] **Step 1: Add imports + handlers map entries**

In the imports section, add:

```typescript
import { noteEpisode, updateProfile, forget } from "./handlers/memory";
```

In the `HANDLERS` record, add at the end (before the closing `}`):

```typescript
  note_episode: noteEpisode,
  update_profile: updateProfile,
  forget: forget,
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "executor.ts" | head -5
```
Expected: no errors.

- [ ] **Step 3: Add an unknown-tool sanity test for memory tools**

Append to `src/tests/tools-executor.test.ts`:

```typescript
import { TOOL_DEFINITIONS } from "@/lib/ai/tools/definitions";

describe("memory tools wired", () => {
  it("includes note_episode, update_profile, forget in TOOL_DEFINITIONS", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain("note_episode");
    expect(names).toContain("update_profile");
    expect(names).toContain("forget");
  });
});
```

- [ ] **Step 4: Run, verify pass**

```bash
npx vitest run src/tests/tools-executor.test.ts
```
Expected: 2 passed (original + new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/tools/executor.ts src/tests/tools-executor.test.ts
git commit -m "feat(memory): wire memory tool handlers into executor"
```

---

# Phase 3 — Hot-path: enrichment & retrieval

Now we make memory show up in every chat. After this phase the system feels different.

## Task 3.1: Memory read helpers

**Files:**
- Create: `src/lib/queries/memory.ts`

- [ ] **Step 1: Implement the module**

```typescript
// src/lib/queries/memory.ts
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
      .is("archived_at", null)
      .limit(20),
    supabase
      .from("workspaces")
      .select("id, title")
      .eq("user_id", userId)
      .eq("is_archived", false)
      .limit(20),
  ]);
  return {
    tasks: tasks.data ?? [],
    routines: routines.data ?? [],
    trackers: trackers.data ?? [],
    workspaces: workspaces.data ?? [],
  };
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "queries/memory" | head -5
```
Expected: no errors. (If `trackers.archived_at` or `workspaces.is_archived` doesn't exist in the schema, replace with the equivalent — check `src/types/database.ts` for actual column names.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/memory.ts
git commit -m "feat(memory): loadMemoryProfile + loadEntityCatalog query helpers"
```

---

## Task 3.2: Enrichment module — types + skeleton

**Files:**
- Create: `src/lib/ai/engine/enrich.ts`

- [ ] **Step 1: Write the module with types + a feature-flagged skeleton**

```typescript
// src/lib/ai/engine/enrich.ts
import { z } from "zod";
import type { ProviderConfig, NormalizedMessage } from "../types";
import type { EntityCatalog } from "@/lib/queries/memory";

export interface TurnEnrichment {
  resolvedEntities: {
    tasks:      Array<{ id: string; title: string; mentioned_as: string }>;
    routines:   Array<{ id: string; title: string; mentioned_as: string }>;
    trackers:   Array<{ id: string; name: string;  mentioned_as: string }>;
    workspaces: Array<{ id: string; title: string; mentioned_as: string }>;
    dates:      Array<{ iso: string; mentioned_as: string }>;
  };
  intentHints: string[];
  memorySignals: Array<{
    kind: "preference_reveal" | "life_event" | "correction" | "strong_opinion" | "plan_statement";
    span: string;
  }>;
  sentiment: "positive" | "neutral" | "low" | "stressed" | null;
  voiceContext: { disfluencies: number; self_corrections: number } | null;
}

const EnrichmentSchema = z.object({
  resolvedEntities: z.object({
    tasks:      z.array(z.object({ id: z.string(), title: z.string(), mentioned_as: z.string() })),
    routines:   z.array(z.object({ id: z.string(), title: z.string(), mentioned_as: z.string() })),
    trackers:   z.array(z.object({ id: z.string(), name: z.string(),  mentioned_as: z.string() })),
    workspaces: z.array(z.object({ id: z.string(), title: z.string(), mentioned_as: z.string() })),
    dates:      z.array(z.object({ iso: z.string(), mentioned_as: z.string() })),
  }),
  intentHints: z.array(z.string()),
  memorySignals: z.array(z.object({
    kind: z.enum(["preference_reveal", "life_event", "correction", "strong_opinion", "plan_statement"]),
    span: z.string(),
  })),
  sentiment: z.enum(["positive", "neutral", "low", "stressed"]).nullable(),
  voiceContext: z.object({ disfluencies: z.number(), self_corrections: z.number() }).nullable(),
});

const EMPTY: TurnEnrichment = {
  resolvedEntities: { tasks: [], routines: [], trackers: [], workspaces: [], dates: [] },
  intentHints: [],
  memorySignals: [],
  sentiment: null,
  voiceContext: null,
};

const TIMEOUT_MS = 600;

export async function enrichTurn(opts: {
  userMessage: string;
  recentTurns: NormalizedMessage[];
  entityCatalog: EntityCatalog;
  voice: boolean;
  nowIso: string;
  timezone: string;
  config: ProviderConfig;
  signal?: AbortSignal;
}): Promise<TurnEnrichment | null> {
  // For ChatGPT OAuth users, skip the LLM call to avoid burning their quota.
  // Use pure-SQL/rule-based fallback (entity match only).
  if (opts.config.provider === "chatgpt_oauth") {
    return fallbackEnrichment(opts);
  }

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), TIMEOUT_MS);
  if (opts.signal) {
    opts.signal.addEventListener("abort", () => ac.abort());
  }

  try {
    const raw = await callEnrichmentModel(opts, ac.signal);
    const parsed = EnrichmentSchema.safeParse(raw);
    if (!parsed.success) {
      // Drop fields that don't validate, return partial best-effort.
      return mergeWithEmpty(raw);
    }
    return parsed.data;
  } catch {
    return fallbackEnrichment(opts);
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackEnrichment(opts: {
  userMessage: string;
  entityCatalog: EntityCatalog;
}): TurnEnrichment {
  // Pure rule-based: case-insensitive substring match against the entity catalog.
  const msg = opts.userMessage.toLowerCase();
  const matchedTasks = opts.entityCatalog.tasks
    .filter((t) => t.title && msg.includes(t.title.toLowerCase()))
    .map((t) => ({ id: t.id, title: t.title, mentioned_as: t.title }));
  const matchedRoutines = opts.entityCatalog.routines
    .filter((r) => r.title && msg.includes(r.title.toLowerCase()))
    .map((r) => ({ id: r.id, title: r.title, mentioned_as: r.title }));
  const matchedTrackers = opts.entityCatalog.trackers
    .filter((t) => t.name && msg.includes(t.name.toLowerCase()))
    .map((t) => ({ id: t.id, name: t.name, mentioned_as: t.name }));
  const matchedWorkspaces = opts.entityCatalog.workspaces
    .filter((w) => w.title && msg.includes(w.title.toLowerCase()))
    .map((w) => ({ id: w.id, title: w.title, mentioned_as: w.title }));

  return {
    ...EMPTY,
    resolvedEntities: {
      tasks: matchedTasks,
      routines: matchedRoutines,
      trackers: matchedTrackers,
      workspaces: matchedWorkspaces,
      dates: [],
    },
  };
}

function mergeWithEmpty(raw: unknown): TurnEnrichment {
  if (!raw || typeof raw !== "object") return EMPTY;
  const safe = raw as Partial<TurnEnrichment>;
  return {
    resolvedEntities: safe.resolvedEntities ?? EMPTY.resolvedEntities,
    intentHints: Array.isArray(safe.intentHints) ? safe.intentHints : [],
    memorySignals: Array.isArray(safe.memorySignals) ? safe.memorySignals : [],
    sentiment: safe.sentiment ?? null,
    voiceContext: safe.voiceContext ?? null,
  };
}

// Provider-specific cheap-sibling call. Returns raw JSON object to be schema-validated.
async function callEnrichmentModel(
  opts: {
    userMessage: string;
    recentTurns: NormalizedMessage[];
    entityCatalog: EntityCatalog;
    voice: boolean;
    nowIso: string;
    timezone: string;
    config: ProviderConfig;
  },
  signal: AbortSignal
): Promise<unknown> {
  const systemPrompt = buildEnrichmentSystemPrompt(opts);
  const userPrompt = buildEnrichmentUserPrompt(opts);

  if (opts.config.provider === "anthropic") {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: opts.config.apiKey });
    const msg = await client.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      },
      { signal: signal as never }
    );
    const text = msg.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    return safeParseJSON(text.text);
  }

  if (opts.config.provider === "openai") {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: opts.config.apiKey });
    const completion = await client.chat.completions.create(
      {
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      },
      { signal: signal as never }
    );
    const content = completion.choices[0]?.message.content;
    return content ? safeParseJSON(content) : null;
  }

  if (opts.config.provider === "gemini") {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genai = new GoogleGenerativeAI(opts.config.apiKey);
    const model = genai.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: systemPrompt,
      generationConfig: { responseMimeType: "application/json" },
    });
    const result = await model.generateContent(userPrompt);
    return safeParseJSON(result.response.text());
  }

  return null;
}

function safeParseJSON(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

function buildEnrichmentSystemPrompt(opts: { voice: boolean; nowIso: string; timezone: string }): string {
  return `You analyze a user turn for Ru, an AI life organizer. Output STRICT JSON matching this shape:

{
  "resolvedEntities": {
    "tasks":      [{ "id": "uuid", "title": "...", "mentioned_as": "..." }],
    "routines":   [{ "id": "uuid", "title": "...", "mentioned_as": "..." }],
    "trackers":   [{ "id": "uuid", "name": "...",  "mentioned_as": "..." }],
    "workspaces": [{ "id": "uuid", "title": "...", "mentioned_as": "..." }],
    "dates":      [{ "iso": "YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS+TZ", "mentioned_as": "tomorrow" }]
  },
  "intentHints": ["log_activity", "..."],
  "memorySignals": [{ "kind": "preference_reveal | life_event | correction | strong_opinion | plan_statement", "span": "..." }],
  "sentiment": "positive | neutral | low | stressed | null",
  "voiceContext": ${opts.voice ? '{ "disfluencies": 0, "self_corrections": 0 }' : "null"}
}

Rules:
- Only return ids for entities I list in the catalog. Never invent.
- "mentioned_as" is the exact substring of the user message that referred to the entity (pronouns OK: "that thing", "the run").
- Dates resolved in user's timezone ${opts.timezone}; now is ${opts.nowIso}.
- intentHints come from this set ONLY: log_activity, create_task, modify_task, complete_task, create_reminder, declare_routine, complete_routine, skip_routine_today, create_tracker, log_tracker_entry, query_analytics, update_profile, note_episode, forget, chit_chat.
- memorySignals: only emit one when there's a clear span; do not invent.
- ${opts.voice ? "Voice mode: count disfluencies (um, uh, like, you know) and self-corrections (e.g. 'I mean')." : "Text mode: voiceContext is null."}
- Output ONLY the JSON object. No prose.`;
}

function buildEnrichmentUserPrompt(opts: {
  userMessage: string;
  recentTurns: NormalizedMessage[];
  entityCatalog: EntityCatalog;
}): string {
  const recent = opts.recentTurns
    .slice(-10)
    .map((t) => `${t.role}: ${t.content}`)
    .join("\n");
  const catalog = JSON.stringify({
    tasks:      opts.entityCatalog.tasks,
    routines:   opts.entityCatalog.routines,
    trackers:   opts.entityCatalog.trackers,
    workspaces: opts.entityCatalog.workspaces,
  }, null, 0);
  return `Entity catalog:
${catalog}

Recent turns:
${recent || "(none)"}

User turn to analyze:
${opts.userMessage}`;
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "engine/enrich" | head -10
```
Expected: no errors. If `@google/generative-ai` isn't installed, install it:
```bash
npm install @google/generative-ai openai
```
(`openai` is needed for the cheap-sibling path; `@google/generative-ai` for Gemini Flash.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/engine/enrich.ts package.json package-lock.json
git commit -m "feat(memory): intent-enrichment layer with cheap-sibling routing + fallback"
```

---

## Task 3.3: Enrichment tests

**Files:**
- Test: `src/tests/enrich.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// src/tests/enrich.test.ts
import { describe, it, expect, vi } from "vitest";
import { enrichTurn } from "@/lib/ai/engine/enrich";

const baseCatalog = {
  tasks: [{ id: "t-1", title: "Buy groceries" }],
  routines: [{ id: "r-1", title: "Morning run" }],
  trackers: [{ id: "tr-1", name: "Running" }],
  workspaces: [{ id: "w-1", title: "OChem study plan" }],
};

describe("enrichTurn", () => {
  it("falls back to substring matching for chatgpt_oauth provider", async () => {
    const result = await enrichTurn({
      userMessage: "skip my morning run today",
      recentTurns: [],
      entityCatalog: baseCatalog,
      voice: false,
      nowIso: new Date().toISOString(),
      timezone: "UTC",
      config: { provider: "chatgpt_oauth", apiKey: "k", model: "m" },
    });
    expect(result).not.toBeNull();
    expect(result!.resolvedEntities.routines).toHaveLength(1);
    expect(result!.resolvedEntities.routines[0].title).toBe("Morning run");
  });

  it("returns fallback enrichment when the LLM call throws", async () => {
    // Force the dynamic import to throw by passing a provider with an invalid config —
    // anthropic with a bogus key will fail; we catch and fall back.
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class {
        messages = {
          create: () => { throw new Error("network"); },
        };
        constructor() {}
      },
    }));
    const result = await enrichTurn({
      userMessage: "buy groceries tomorrow",
      recentTurns: [],
      entityCatalog: baseCatalog,
      voice: false,
      nowIso: new Date().toISOString(),
      timezone: "UTC",
      config: { provider: "anthropic", apiKey: "k", model: "m" },
    });
    expect(result).not.toBeNull();
    // Fallback matched the task by substring.
    expect(result!.resolvedEntities.tasks[0]?.id).toBe("t-1");
    vi.doUnmock("@anthropic-ai/sdk");
  });

  it("matches case-insensitively in fallback", async () => {
    const result = await enrichTurn({
      userMessage: "MORNING RUN was tough today",
      recentTurns: [],
      entityCatalog: baseCatalog,
      voice: false,
      nowIso: new Date().toISOString(),
      timezone: "UTC",
      config: { provider: "chatgpt_oauth", apiKey: "k", model: "m" },
    });
    expect(result!.resolvedEntities.routines[0]?.id).toBe("r-1");
  });
});
```

- [ ] **Step 2: Run, verify pass**

```bash
npx vitest run src/tests/enrich.test.ts
```
Expected: 3 passed.

- [ ] **Step 3: Commit**

```bash
git add src/tests/enrich.test.ts
git commit -m "test(memory): enrichTurn fallback path + case-insensitive entity match"
```

---

## Task 3.4: Retrieval module

**Files:**
- Create: `src/lib/ai/engine/retrieve.ts`
- Test: `src/tests/retrieve.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/tests/retrieve.test.ts
import { describe, it, expect, vi } from "vitest";
import { retrieveEpisodes } from "@/lib/ai/engine/retrieve";

vi.mock("@/lib/ai/embedder", () => ({
  createEmbedder: () => ({
    embed: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  }),
}));

function makeSupabase(rpcRows: unknown[]) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: rpcRows, error: null }),
    from() {
      return {
        update() {
          return { in: async () => ({ error: null }) };
        },
      };
    },
  };
}

describe("retrieveEpisodes", () => {
  it("returns ranked episodes from the match_episodes RPC", async () => {
    const rows = [
      { id: "e1", content: "A", importance: 0.6, entity_refs: {}, created_at: new Date().toISOString(), similarity: 0.9 },
      { id: "e2", content: "B", importance: 0.3, entity_refs: {}, created_at: new Date(Date.now() - 30 * 86400000).toISOString(), similarity: 0.95 },
    ];
    const supabase = makeSupabase(rows);
    const result = await retrieveEpisodes({
      supabase: supabase as never,
      userId: "u",
      userMessage: "anything",
      recentTurns: [],
    });
    expect(result.length).toBeGreaterThan(0);
    // Higher importance + recency should beat slightly higher similarity.
    expect(result[0].id).toBe("e1");
  });

  it("returns empty array when RPC errors", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "fail" } }),
      from() { return { update() { return { in: async () => ({}) }; } }; },
    };
    const result = await retrieveEpisodes({
      supabase: supabase as never,
      userId: "u",
      userMessage: "x",
      recentTurns: [],
    });
    expect(result).toEqual([]);
  });

  it("caps results at 6", async () => {
    const rows = Array.from({ length: 12 }).map((_, i) => ({
      id: `e${i}`,
      content: `c${i}`,
      importance: 0.5,
      entity_refs: {},
      created_at: new Date().toISOString(),
      similarity: 0.9 - i * 0.01,
    }));
    const supabase = makeSupabase(rows);
    const result = await retrieveEpisodes({
      supabase: supabase as never,
      userId: "u",
      userMessage: "x",
      recentTurns: [],
    });
    expect(result.length).toBe(6);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
npx vitest run src/tests/retrieve.test.ts
```
Expected: module not found.

- [ ] **Step 3: Implement the module**

```typescript
// src/lib/ai/engine/retrieve.ts
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
```

- [ ] **Step 4: Run, verify pass**

```bash
npx vitest run src/tests/retrieve.test.ts
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/engine/retrieve.ts src/tests/retrieve.test.ts
git commit -m "feat(memory): two-stage retrieval — semantic top-k + entity top-up"
```

---

## Task 3.5: Memory blocks injection helper

**Files:**
- Create: `src/lib/ai/engine/memory-blocks.ts`

- [ ] **Step 1: Implement the module**

```typescript
// src/lib/ai/engine/memory-blocks.ts
import type { NormalizedMessage } from "../types";
import type { MemoryProfile, ProfileDoc, BehavioralModel } from "@/lib/queries/memory";
import type { TurnEnrichment } from "./enrich";
import type { Episode } from "./retrieve";

const SECTION_ORDER = ["identity", "preferences", "current_themes", "active_projects", "ru_and_me"] as const;

export function buildProfileBlock(doc: ProfileDoc): string | null {
  const parts: string[] = [];
  for (const key of SECTION_ORDER) {
    const section = doc[key];
    if (section && section.content?.trim()) {
      parts.push(`${humanLabel(key)}:\n${section.content.trim()}`);
    }
  }
  if (parts.length === 0) return null;
  return `What Ru knows about this user (their profile):\n\n${parts.join("\n\n")}`;
}

export function buildBehavioralBlock(model: BehavioralModel): string | null {
  const lines: string[] = [];
  if (model.typical_activity_hour) {
    const items = Object.entries(model.typical_activity_hour)
      .map(([cat, h]) => `${cat} at ~${h}:00`)
      .join(", ");
    if (items) lines.push(`Typical activity times: ${items}.`);
  }
  if (model.routine_completion_by_dow) {
    const lowDays = Object.entries(model.routine_completion_by_dow)
      .filter(([, v]) => v < 0.4)
      .map(([d]) => d);
    if (lowDays.length > 0) lines.push(`Tends to skip routines on: ${lowDays.join(", ")}.`);
  }
  if (typeof model.task_creation_to_completion_hours_p50 === "number") {
    lines.push(`Median task-to-completion: ${model.task_creation_to_completion_hours_p50}h.`);
  }
  if (model.nudge_response_rate) {
    const best = Object.entries(model.nudge_response_rate)
      .filter(([, v]) => typeof v === "number")
      .sort((a, b) => (b[1] as number) - (a[1] as number))[0];
    if (best) lines.push(`Responds best to '${best[0]}' nudges.`);
  }
  if (typeof model.sentiment_trend_7d === "number" && Math.abs(model.sentiment_trend_7d) > 0.05) {
    const dir = model.sentiment_trend_7d > 0 ? "trending up" : "trending down";
    lines.push(`Sentiment is ${dir} over the last week.`);
  }
  if (lines.length === 0) return null;
  return `Behavioral patterns Ru has noticed:\n${lines.join("\n")}`;
}

export function buildEpisodicBlock(episodes: Episode[]): string | null {
  if (episodes.length === 0) return null;
  const items = episodes.map((e) => {
    const dateStr = new Date(e.created_at).toISOString().slice(0, 10);
    return `- ${e.content.trim()}  (${dateStr})`;
  });
  return `Things Ru remembers that might matter right now:\n${items.join("\n")}`;
}

export function buildEnrichmentBlock(enrichment: TurnEnrichment | null): string | null {
  if (!enrichment) return null;
  const parts: string[] = [];
  const r = enrichment.resolvedEntities;
  const resolved: string[] = [];
  for (const t of r.tasks)      resolved.push(`task "${t.title}" (id ${t.id}) mentioned as "${t.mentioned_as}"`);
  for (const t of r.routines)   resolved.push(`routine "${t.title}" (id ${t.id}) mentioned as "${t.mentioned_as}"`);
  for (const t of r.trackers)   resolved.push(`tracker "${t.name}" (id ${t.id}) mentioned as "${t.mentioned_as}"`);
  for (const t of r.workspaces) resolved.push(`workspace "${t.title}" (id ${t.id}) mentioned as "${t.mentioned_as}"`);
  for (const d of r.dates)      resolved.push(`date ${d.iso} mentioned as "${d.mentioned_as}"`);
  if (resolved.length > 0) parts.push(`Resolved references in this turn:\n${resolved.map((s) => "- " + s).join("\n")}`);
  if (enrichment.intentHints.length > 0) parts.push(`Likely intents: ${enrichment.intentHints.join(", ")}.`);
  if (enrichment.memorySignals.length > 0) {
    const sigs = enrichment.memorySignals.map((s) => `${s.kind}: "${s.span}"`).join("; ");
    parts.push(`Memory-worthy signals detected: ${sigs}. Consider note_episode or update_profile if appropriate.`);
  }
  if (enrichment.sentiment) parts.push(`User tone: ${enrichment.sentiment}.`);
  if (parts.length === 0) return null;
  return `Turn enrichment (hints for this turn — confirm or override as needed):\n${parts.join("\n")}`;
}

export function injectMemoryBlocks(
  messages: NormalizedMessage[],
  blocks: { profile: MemoryProfile | null; episodes: Episode[]; enrichment: TurnEnrichment | null }
): NormalizedMessage[] {
  // Find the index right after the existing "Page context" or right after the state
  // block — pick the last consecutive system message at the head, insert before the
  // first non-system message.
  const out: NormalizedMessage[] = [];
  let inserted = false;

  const profileBlock = blocks.profile ? buildProfileBlock(blocks.profile.profile_doc) : null;
  const behavioralBlock = blocks.profile ? buildBehavioralBlock(blocks.profile.behavioral_model) : null;
  const episodicBlock = buildEpisodicBlock(blocks.episodes);
  const enrichmentBlock = buildEnrichmentBlock(blocks.enrichment);

  const newBlocks: NormalizedMessage[] = [];
  if (profileBlock)    newBlocks.push({ role: "system", content: profileBlock });
  if (behavioralBlock) newBlocks.push({ role: "system", content: behavioralBlock });
  if (episodicBlock)   newBlocks.push({ role: "system", content: episodicBlock });
  if (enrichmentBlock) newBlocks.push({ role: "system", content: enrichmentBlock });

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!inserted && m.role !== "system") {
      out.push(...newBlocks);
      inserted = true;
    }
    out.push(m);
  }
  if (!inserted) out.push(...newBlocks);
  return out;
}
```

- [ ] **Step 2: Quick smoke test**

```typescript
// src/tests/memory-blocks.test.ts
import { describe, it, expect } from "vitest";
import {
  buildProfileBlock,
  buildBehavioralBlock,
  buildEpisodicBlock,
  injectMemoryBlocks,
} from "@/lib/ai/engine/memory-blocks";

describe("memory-blocks", () => {
  it("returns null for empty profile", () => {
    expect(buildProfileBlock({})).toBeNull();
  });

  it("renders profile sections in fixed order", () => {
    const block = buildProfileBlock({
      preferences: { content: "evening workouts", sources: [], updated_at: "" },
      identity:    { content: "lives in tokyo", sources: [], updated_at: "" },
    });
    expect(block).not.toBeNull();
    // identity comes before preferences in SECTION_ORDER
    expect(block!.indexOf("Identity")).toBeLessThan(block!.indexOf("Preferences"));
  });

  it("buildEpisodicBlock returns null when no episodes", () => {
    expect(buildEpisodicBlock([])).toBeNull();
  });

  it("injectMemoryBlocks places blocks between system head and first user msg", () => {
    const messages = [
      { role: "system" as const, content: "system 1" },
      { role: "system" as const, content: "system 2" },
      { role: "user" as const,   content: "hi" },
    ];
    const out = injectMemoryBlocks(messages, {
      profile: { profile_doc: { identity: { content: "x", sources: [], updated_at: "" } }, behavioral_model: {}, profile_version: 0, memory_enabled: true },
      episodes: [],
      enrichment: null,
    });
    // 2 original system + 1 new system block + 1 user = 4
    expect(out).toHaveLength(4);
    expect(out[0].role).toBe("system");
    expect(out[1].role).toBe("system");
    expect(out[2].content).toContain("Identity");
    expect(out[3].role).toBe("user");
  });

  it("buildBehavioralBlock surfaces low-completion days", () => {
    const block = buildBehavioralBlock({
      routine_completion_by_dow: { mon: 0.8, tue: 0.2 },
    });
    expect(block).toContain("tue");
  });
});
```

- [ ] **Step 3: Run, verify pass**

```bash
npx vitest run src/tests/memory-blocks.test.ts
```
Expected: 5 passed.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/engine/memory-blocks.ts src/tests/memory-blocks.test.ts
git commit -m "feat(memory): memory-blocks renderers + injection helper"
```

---

## Task 3.6: Wire memory into `context.ts`

**Files:**
- Modify: `src/lib/ai/engine/context.ts`

- [ ] **Step 1: Update `assembleContext` to also pull memory profile**

Modify the parallel-query batch at the top of `assembleContext`:

```typescript
import { loadMemoryProfile } from "@/lib/queries/memory";
import type { MemoryProfile } from "@/lib/queries/memory";

// Inside assembleContext, add to the Promise.all batch:
const [profileRes, chatMessagesRes, summariesRes, routinesRes, tasksRes, memoryProfile] = await Promise.all([
  // ... existing 5 queries unchanged ...
  loadMemoryProfile(supabase, userId),
]);
```

Then export the memory profile so the route can use it:

```typescript
// Change the return type — instead of just NormalizedMessage[], return:
// { messages: NormalizedMessage[]; memoryProfile: MemoryProfile | null }
//
// At the bottom:
return { messages, memoryProfile };
```

Update existing return statement accordingly. The route currently destructures
`const [messages] = await Promise.all([assembleContext(...), ...])` — that
becomes `const [{ messages, memoryProfile }, ...] = ...` in Task 3.7.

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "context.ts|route.ts" | head -10
```
Expected: errors in route.ts (we haven't updated it yet — that's Task 3.7).

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/engine/context.ts
git commit -m "feat(memory): assembleContext returns memoryProfile alongside messages"
```

---

## Task 3.7: Wire enrichment + retrieval into the chat route

**Files:**
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Add imports**

At the top of the file, alongside existing imports:

```typescript
import { enrichTurn } from "@/lib/ai/engine/enrich";
import { retrieveEpisodes, topUpEpisodesByEntity } from "@/lib/ai/engine/retrieve";
import { injectMemoryBlocks } from "@/lib/ai/engine/memory-blocks";
import { loadEntityCatalog } from "@/lib/queries/memory";
```

- [ ] **Step 2: Replace the existing `await Promise.all([assembleContext..., assistantInsertP])` block**

Locate the block (around line 243-252 in the current file) and replace with:

```typescript
  // Read the user's timezone for enrichment date resolution. Extend the
  // existing profile query in the route (see the `.from("profiles").select(...)`
  // earlier in the file that already grabs `ai_provider, ai_credentials`) to
  // also select `timezone`, then capture it as `profileTimezone` from that
  // result. If the existing profile fetch happens BEFORE this point, this
  // step is to update that select clause and assign:
  //
  //   const profileTimezone = profile?.timezone ?? "UTC";
  //
  // If you cannot modify that existing fetch for any reason, do a small
  // extra fetch here:
  //
  //   const { data: tzRow } = await supabase
  //     .from("profiles").select("timezone").eq("id", user.id).single();
  //   const profileTimezone = tzRow?.timezone ?? "UTC";

  // Compute recent turns for enrichment (last 10 from this chat).
  const recentTurnsForEnrichment = await supabase
    .from("messages")
    .select("role, content")
    .eq("user_id", user.id)
    .eq("chat_id", chatId!)
    .order("created_at", { ascending: false })
    .limit(10)
    .then((r) => (r.data ?? []).reverse() as Array<{ role: "user" | "assistant"; content: string }>);

  // One catalog fetch shared with enrichment (enrichTurn needs it; nothing else does).
  const entityCatalogP = loadEntityCatalog(supabase, user.id);

  const [{ messages, memoryProfile }, enrichment, fastEpisodes] = await Promise.all([
    assembleContext({
      supabase,
      userId: user.id,
      chatId,
      newUserMessage: parsed.data.message,
      voice: parsed.data.voice ?? false,
    }),
    entityCatalogP.then((catalog) =>
      enrichTurn({
        userMessage: parsed.data.message,
        recentTurns: recentTurnsForEnrichment.map((m) => ({ role: m.role, content: m.content })),
        entityCatalog: catalog,
        voice: parsed.data.voice ?? false,
        nowIso: new Date().toISOString(),
        timezone: profileTimezone,
        config,
        signal: req.signal,
      })
    ),
    retrieveEpisodes({
      supabase,
      userId: user.id,
      userMessage: parsed.data.message,
      recentTurns: recentTurnsForEnrichment.map((m) => ({ role: m.role, content: m.content })),
      signal: req.signal,
    }),
    assistantInsertP,
  ]);

  // Entity top-up: if enrichment surfaced entity ids we didn't recall, fetch their episodes.
  let episodes = fastEpisodes;
  if (enrichment && memoryProfile?.memory_enabled !== false) {
    const entityIds = {
      tasks:      enrichment.resolvedEntities.tasks.map((t) => t.id),
      routines:   enrichment.resolvedEntities.routines.map((r) => r.id),
      trackers:   enrichment.resolvedEntities.trackers.map((t) => t.id),
      workspaces: enrichment.resolvedEntities.workspaces.map((w) => w.id),
    };
    episodes = await topUpEpisodesByEntity({
      supabase,
      userId: user.id,
      fastEpisodes,
      entityIds,
    });
  }

  // Inject memory blocks. If memory is disabled for this user, skip everything.
  const finalMessages = memoryProfile?.memory_enabled === false
    ? messages
    : injectMemoryBlocks(messages, { profile: memoryProfile, episodes, enrichment });
```

Then update the `runConversation` call to use `finalMessages` instead of `messages`:

```typescript
  for await (const event of runConversation({
    supabase,
    userId: user.id,
    assistantMessageId: assistantMsgId,
    config,
    initialMessages: finalMessages,  // was: messages
    signal: req.signal,
  })) {
```

- [ ] **Step 3: Build, verify type-clean**

```bash
npm run build 2>&1 | grep -E "error TS" | head -10
```
Expected: no errors.

- [ ] **Step 4: Manual smoke test**

```bash
npm run dev
```

In another terminal, send a chat to a logged-in account (via the UI at `localhost:3000/chat`). Verify:
- Turn completes (no 500 in server logs).
- New `episodes` row count is unchanged (we haven't asked Ru to remember anything yet).
- Server logs show no errors from `enrichTurn` or `retrieveEpisodes`.

If you see embedder errors about missing key, ensure `.env.local` has `OPENAI_EMBEDDING_API_KEY` set.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat(memory): wire enrichment + retrieval + memory blocks into /api/chat"
```

---

## Task 3.8: Profile cache + Anthropic prompt caching

**Files:**
- Modify: `src/lib/ai/providers/anthropic.ts`

- [ ] **Step 1: Mark stable system blocks as cacheable**

In `streamAnthropic`, locate where `system` is set in the `client.messages.stream` call. Modify to use the cache_control header on the stable system text:

```typescript
// Replace:
//   system: system || undefined,
// with:
system: system
  ? [
      {
        type: "text",
        text: system,
        cache_control: { type: "ephemeral" } as never,
      },
    ]
  : undefined,
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "anthropic.ts" | head -5
```
Expected: no errors. (The `as never` cast is to bypass the SDK type strictness; the cache_control is a documented Anthropic feature.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/providers/anthropic.ts
git commit -m "perf(memory): enable Anthropic prompt cache on the stable system block"
```

---

# Phase 4 — Sleep-time consolidation

Replaces `daily-summary.ts` + `routine-detection.ts` with one richer function. Quality compounds nightly from here.

## Task 4.1: Inngest function skeleton

**Files:**
- Create: `src/lib/inngest/functions/memory-consolidate.ts`

- [ ] **Step 1: Write the function shell with all five pass functions stubbed**

```typescript
// src/lib/inngest/functions/memory-consolidate.ts
import { inngest } from "../client";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Memory consolidation — replaces daily-summary + routine-detection.
 * Triggers:
 *   - cron sweep every hour: picks users whose local time is 3am
 *   - memory.consolidate.user_profile_touched: light patch for one section
 *   - memory.consolidate.requested: full or rebuild mode
 *
 * Five passes (in §7.6 of the spec):
 *   1. Profile section rewrite
 *   2. Episode curation (dedup, merge, importance)
 *   3. Behavioral model (pure SQL)
 *   4. Routine detection v2
 *   5. Decay / forgetting
 */
export const memoryConsolidate = inngest.createFunction(
  {
    id: "memory-consolidate",
    // Each event invocation runs for a single user; nightly sweep enqueues per-user events.
    concurrency: { limit: 10 },
  },
  [
    { event: "memory.consolidate.requested" },
    { event: "memory.consolidate.user_profile_touched" },
    { cron: "0 * * * *" }, // hourly tz sweep
  ],
  async ({ event, step }) => {
    // Sweep mode: enqueue per-user events for users whose local time is 3am.
    if (!event.data || (!("userId" in event.data) && !("mode" in event.data))) {
      const queued = await step.run("sweep-by-tz", () => sweepByTimezone());
      return { sweeped: queued };
    }

    const userId = (event.data as { userId?: string }).userId;
    const mode = ((event.data as { mode?: string }).mode ?? "full") as "full" | "rebuild" | "patch_profile";
    const section = (event.data as { section?: string }).section;

    if (!userId) return { error: "userId missing" };

    // Light patch: rewrite one section only, used when a tool wrote update_profile.
    if (mode === "patch_profile" && section) {
      await step.run(`patch-${section}`, () => passOneSection(userId, section));
      return { patched: section };
    }

    // Full or rebuild — five passes.
    await step.run("pass-3-behavioral", () => passThreeBehavioral(userId));
    await step.run("pass-2-curate",      () => passTwoCuration(userId, mode));
    await step.run("pass-1-profile",     () => passOneProfile(userId, mode));
    await step.run("pass-4-routines",    () => passFourRoutineDetection(userId));
    await step.run("pass-5-decay",       () => passFiveDecay(userId));

    return { userId, mode };
  }
);

// ---------- pass implementations (stubs filled in next tasks) ----------

async function sweepByTimezone(): Promise<number> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, timezone")
    .eq("memory_enabled", true);
  if (!data) return 0;
  const now = new Date();
  let queued = 0;
  for (const p of data) {
    const tz = p.timezone || "UTC";
    const hourLocal = localHour(now, tz);
    if (hourLocal === 3) {
      await inngest.send({
        name: "memory.consolidate.requested",
        data: { userId: p.id, mode: "full" },
      });
      queued += 1;
    }
  }
  return queued;
}

function localHour(now: Date, tz: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false });
    return parseInt(fmt.format(now), 10);
  } catch {
    return now.getUTCHours();
  }
}

async function passThreeBehavioral(_userId: string): Promise<void> {
  // Implemented in Task 4.2.
}

async function passTwoCuration(_userId: string, _mode: string): Promise<void> {
  // Implemented in Task 4.3.
}

async function passOneProfile(_userId: string, _mode: string): Promise<void> {
  // Implemented in Task 4.4.
}

async function passOneSection(_userId: string, _section: string): Promise<void> {
  // Implemented in Task 4.4.
}

async function passFourRoutineDetection(_userId: string): Promise<void> {
  // Implemented in Task 4.5.
}

async function passFiveDecay(_userId: string): Promise<void> {
  // Implemented in Task 4.6.
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "memory-consolidate" | head -5
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/inngest/functions/memory-consolidate.ts
git commit -m "feat(memory): memory-consolidate function skeleton — tz sweep + 5 pass stubs"
```

---

## Task 4.2: Pass 3 — behavioral model (pure SQL)

**Files:**
- Modify: `src/lib/inngest/functions/memory-consolidate.ts`

- [ ] **Step 1: Implement `passThreeBehavioral`**

Replace the `passThreeBehavioral` stub with:

```typescript
async function passThreeBehavioral(userId: string): Promise<void> {
  const supabase = createServiceClient();
  const sinceIso30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const sinceIso60 = new Date(Date.now() - 60 * 86400000).toISOString();
  const sinceIso90 = new Date(Date.now() - 90 * 86400000).toISOString();
  const sinceIso7  = new Date(Date.now() -  7 * 86400000).toISOString();
  const sinceIso24 = new Date(Date.now() -      86400000).toISOString();

  // typical_activity_hour per category
  const { data: activityHours } = await supabase
    .from("activity_log")
    .select("category, timestamp")
    .eq("user_id", userId)
    .gte("timestamp", sinceIso30);

  const byCategory: Record<string, number[]> = {};
  for (const a of activityHours ?? []) {
    const h = new Date(a.timestamp).getHours();
    if (!byCategory[a.category]) byCategory[a.category] = [];
    byCategory[a.category].push(h);
  }
  const typical_activity_hour: Record<string, number> = {};
  for (const [cat, hours] of Object.entries(byCategory)) {
    if (hours.length < 5) continue;
    const sorted = [...hours].sort((a, b) => a - b);
    typical_activity_hour[cat] = sorted[Math.floor(sorted.length / 2)];
  }

  // routine_completion_by_dow
  const { data: routineLogs } = await supabase
    .from("routine_logs")
    .select("logged_date, completed")
    .eq("user_id", userId)
    .gte("logged_date", sinceIso60.slice(0, 10));

  const dowKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const dowCounts: Record<string, { done: number; total: number }> = {};
  for (const k of dowKeys) dowCounts[k] = { done: 0, total: 0 };
  for (const r of routineLogs ?? []) {
    const dow = dowKeys[new Date(r.logged_date).getUTCDay()];
    dowCounts[dow].total += 1;
    if (r.completed) dowCounts[dow].done += 1;
  }
  const routine_completion_by_dow: Record<string, number> = {};
  for (const [k, v] of Object.entries(dowCounts)) {
    if (v.total >= 4) routine_completion_by_dow[k] = v.done / v.total;
  }

  // task_creation_to_completion_hours_p50
  const { data: completedTasks } = await supabase
    .from("tasks")
    .select("created_at, completed_at")
    .eq("user_id", userId)
    .gte("created_at", sinceIso90)
    .not("completed_at", "is", null);

  const lags = (completedTasks ?? [])
    .map((t) => (new Date(t.completed_at!).getTime() - new Date(t.created_at).getTime()) / 3600_000)
    .filter((h) => h >= 0)
    .sort((a, b) => a - b);
  const task_creation_to_completion_hours_p50 = lags.length > 0
    ? Math.round(lags[Math.floor(lags.length / 2)])
    : null;

  // sentiment_trend_7d — slope of avg sentiment by day over last 7 days.
  const { data: recentActs } = await supabase
    .from("activity_log")
    .select("timestamp, sentiment")
    .eq("user_id", userId)
    .gte("timestamp", sinceIso7);
  const byDay: Record<string, number[]> = {};
  for (const a of recentActs ?? []) {
    if (typeof a.sentiment !== "number") continue;
    const d = a.timestamp.slice(0, 10);
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(a.sentiment);
  }
  const dayAverages = Object.entries(byDay)
    .map(([d, vals]) => ({ d, avg: vals.reduce((s, x) => s + x, 0) / vals.length }))
    .sort((a, b) => a.d.localeCompare(b.d));
  let sentiment_trend_7d: number | null = null;
  if (dayAverages.length >= 3) {
    const n = dayAverages.length;
    const xs = dayAverages.map((_, i) => i);
    const ys = dayAverages.map((p) => p.avg);
    const meanX = xs.reduce((s, x) => s + x, 0) / n;
    const meanY = ys.reduce((s, y) => s + y, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - meanX) * (ys[i] - meanY);
      den += (xs[i] - meanX) ** 2;
    }
    sentiment_trend_7d = den > 0 ? num / den : 0;
  }

  // voice_share_24h
  const { data: recentMessages } = await supabase
    .from("messages")
    .select("input_method")
    .eq("user_id", userId)
    .eq("role", "user")
    .gte("created_at", sinceIso24);
  const totalMsg = recentMessages?.length ?? 0;
  const voiceMsg = (recentMessages ?? []).filter((m) => m.input_method === "voice").length;
  const voice_share_24h = totalMsg > 0 ? voiceMsg / totalMsg : null;

  const behavioral_model = {
    typical_activity_hour,
    routine_completion_by_dow,
    task_creation_to_completion_hours_p50,
    sentiment_trend_7d,
    voice_share_24h,
    updated_at: new Date().toISOString(),
  };

  await supabase.from("profiles").update({ behavioral_model }).eq("id", userId);
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "memory-consolidate" | head -5
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/inngest/functions/memory-consolidate.ts
git commit -m "feat(memory): pass 3 — pure-SQL behavioral model derivation"
```

---

## Task 4.3: Pass 2 — episode curation

**Files:**
- Modify: `src/lib/inngest/functions/memory-consolidate.ts`

- [ ] **Step 1: Implement `passTwoCuration`**

Replace the stub with:

```typescript
async function passTwoCuration(userId: string, _mode: string): Promise<void> {
  const supabase = createServiceClient();
  const since = new Date(Date.now() - 26 * 3600_000).toISOString(); // yesterday-ish

  const { data: newEps } = await supabase
    .from("episodes")
    .select("id, content, embedding, importance, entity_refs, source_message_ids")
    .eq("user_id", userId)
    .is("superseded_by", null)
    .is("archived_at", null)
    .gte("created_at", since);

  if (!newEps || newEps.length === 0) return;

  // Pairwise dedup within new — cosine similarity > 0.92 → merge.
  const merged = new Set<string>();
  for (let i = 0; i < newEps.length; i++) {
    if (merged.has(newEps[i].id)) continue;
    for (let j = i + 1; j < newEps.length; j++) {
      if (merged.has(newEps[j].id)) continue;
      const sim = cosineSim(newEps[i].embedding as number[] | null, newEps[j].embedding as number[] | null);
      if (sim > 0.92) {
        const keepIdx = (newEps[i].importance ?? 0) >= (newEps[j].importance ?? 0) ? i : j;
        const dropIdx = keepIdx === i ? j : i;
        const keep = newEps[keepIdx];
        const drop = newEps[dropIdx];
        const sourceUnion = Array.from(new Set([...(keep.source_message_ids ?? []), ...(drop.source_message_ids ?? [])]));
        await supabase
          .from("episodes")
          .update({ source_message_ids: sourceUnion })
          .eq("id", keep.id);
        await supabase
          .from("episodes")
          .update({ superseded_by: keep.id, superseded_reason: "dedup_merge" })
          .eq("id", drop.id);
        await supabase.from("memory_audit").insert({
          user_id: userId,
          kind: "merged",
          summary: `Merged duplicate episode into: "${keep.content.slice(0, 80)}"`,
          payload: { kept: keep.id, dropped: drop.id, similarity: sim, pre_drop_content: drop.content },
          episode_ids: [keep.id, drop.id],
          reversible: true,
        });
        merged.add(drop.id);
        if (dropIdx === i) break;
      }
    }
  }

  // Merge new episodes into existing similar ones (cosine > 0.88 AND shared entity).
  const { data: existing } = await supabase
    .from("episodes")
    .select("id, content, embedding, importance, entity_refs")
    .eq("user_id", userId)
    .is("superseded_by", null)
    .is("archived_at", null)
    .lt("created_at", since);

  for (const ne of newEps) {
    if (merged.has(ne.id)) continue;
    for (const ee of existing ?? []) {
      const sim = cosineSim(ne.embedding as number[] | null, ee.embedding as number[] | null);
      if (sim < 0.88) continue;
      const sharedEntity = jsonHasOverlap(ne.entity_refs, ee.entity_refs);
      if (!sharedEntity) continue;

      const newImp = Math.min(1, (ee.importance ?? 0) + Math.min(0.15, 1 - (ee.importance ?? 0)));
      const sourceUnion = Array.from(new Set([...(ee as { source_message_ids?: string[] }).source_message_ids ?? [], ...(ne.source_message_ids ?? [])]));
      await supabase
        .from("episodes")
        .update({ importance: newImp, source_message_ids: sourceUnion })
        .eq("id", ee.id);
      await supabase
        .from("episodes")
        .update({ superseded_by: ee.id, superseded_reason: "cross_day_merge" })
        .eq("id", ne.id);
      await supabase.from("memory_audit").insert({
        user_id: userId,
        kind: "merged",
        summary: `Merged into existing: "${ee.content.slice(0, 80)}"`,
        payload: { kept: ee.id, dropped: ne.id, similarity: sim, pre_drop_content: ne.content },
        episode_ids: [ee.id, ne.id],
        reversible: true,
      });
      merged.add(ne.id);
      break;
    }
  }
}

function cosineSim(a: number[] | null, b: number[] | null): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

function jsonHasOverlap(a: unknown, b: unknown): boolean {
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const oa = a as Record<string, unknown>;
  const ob = b as Record<string, unknown>;
  for (const key of Object.keys(oa)) {
    const va = oa[key], vb = ob[key];
    if (Array.isArray(va) && Array.isArray(vb)) {
      const set = new Set(va.map(String));
      if (vb.some((x) => set.has(String(x)))) return true;
    }
  }
  return false;
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "memory-consolidate" | head -5
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/inngest/functions/memory-consolidate.ts
git commit -m "feat(memory): pass 2 — episode dedup + cross-day merge with audit"
```

---

## Task 4.4: Pass 1 — profile section rewrite

**Files:**
- Modify: `src/lib/inngest/functions/memory-consolidate.ts`

- [ ] **Step 1: Implement `passOneProfile` and `passOneSection`**

Replace both stubs:

```typescript
const SECTION_TOKEN_BUDGET: Record<string, number> = {
  identity: 250,
  preferences: 350,
  current_themes: 300,
  active_projects: 300,
  ru_and_me: 300,
};

const SIGNAL_TO_SECTION: Record<string, string> = {
  life_event: "identity",
  preference_reveal: "preferences",
  strong_opinion: "preferences",
  plan_statement: "current_themes",
  // correction → handled separately (looks up section from memory_corrections row)
};

async function passOneProfile(userId: string, mode: string): Promise<void> {
  const supabase = createServiceClient();
  for (const section of Object.keys(SECTION_TOKEN_BUDGET)) {
    await rewriteSection(supabase, userId, section, mode);
  }
}

async function passOneSection(userId: string, section: string): Promise<void> {
  if (!SECTION_TOKEN_BUDGET[section]) return;
  const supabase = createServiceClient();
  await rewriteSection(supabase, userId, section, "patch");
}

async function rewriteSection(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  section: string,
  mode: string
): Promise<void> {
  // Load current section content
  const { data: profile } = await supabase
    .from("profiles")
    .select("profile_doc, profile_version, display_name, timezone")
    .eq("id", userId)
    .single();
  if (!profile) return;
  const doc = (profile.profile_doc as Record<string, { content: string; sources: string[] }>) ?? {};
  const currentContent = doc[section]?.content ?? "";

  // Episodes from yesterday whose memorySignals (we read them off payload — we
  // stored signals only on memory_audit's payload, but for v1 we use
  // entity_refs and importance as proxies and pull all recent high-importance
  // episodes; the model decides relevance).
  const since = mode === "rebuild"
    ? new Date(Date.now() - 180 * 86400000).toISOString()
    : new Date(Date.now() - 26 * 3600_000).toISOString();

  const { data: episodes } = await supabase
    .from("episodes")
    .select("id, content, importance, source_message_ids, created_at")
    .eq("user_id", userId)
    .is("superseded_by", null)
    .is("archived_at", null)
    .gte("created_at", since)
    .gte("importance", 0.6)
    .order("importance", { ascending: false })
    .limit(25);

  // Unapplied corrections for this section
  const { data: corrections } = await supabase
    .from("memory_corrections")
    .select("id, original, corrected")
    .eq("user_id", userId)
    .eq("section", section)
    .is("applied_in_consolidation_at", null);

  if ((episodes?.length ?? 0) === 0 && (corrections?.length ?? 0) === 0 && currentContent) {
    return; // nothing new to merge
  }

  // Call Haiku to produce the new section content.
  const newContent = await callSectionRewriter({
    section,
    budget: SECTION_TOKEN_BUDGET[section],
    currentContent,
    displayName: profile.display_name ?? null,
    timezone: profile.timezone ?? "UTC",
    episodes: episodes ?? [],
    corrections: corrections ?? [],
  });

  if (!newContent || newContent === currentContent) {
    // Mark corrections applied even if no change.
    if (corrections && corrections.length > 0) {
      await supabase
        .from("memory_corrections")
        .update({ applied_in_consolidation_at: new Date().toISOString() })
        .in("id", corrections.map((c) => c.id));
    }
    return;
  }

  const sources = Array.from(new Set([
    ...(doc[section]?.sources ?? []),
    ...((episodes ?? []).flatMap((e) => e.source_message_ids ?? [])),
  ]));

  doc[section] = {
    content: newContent,
    sources,
    updated_at: new Date().toISOString(),
  };

  await supabase
    .from("profiles")
    .update({
      profile_doc: doc,
      profile_version: (profile.profile_version ?? 0) + 1,
    })
    .eq("id", userId);

  if (corrections && corrections.length > 0) {
    await supabase
      .from("memory_corrections")
      .update({ applied_in_consolidation_at: new Date().toISOString() })
      .in("id", corrections.map((c) => c.id));
  }

  await supabase.from("memory_audit").insert({
    user_id: userId,
    kind: "profile_rewrite",
    summary: `Rewrote ${section}`,
    payload: { section, before: currentContent, after: newContent, episode_ids: (episodes ?? []).map((e) => e.id) },
    reversible: true,
  });
}

async function callSectionRewriter(input: {
  section: string;
  budget: number;
  currentContent: string;
  displayName: string | null;
  timezone: string;
  episodes: Array<{ id: string; content: string; importance: number }>;
  corrections: Array<{ original: string; corrected: string }>;
}): Promise<string | null> {
  // Use platform-level Anthropic key for consolidation (NOT BYOK — this is our cost).
  const apiKey = process.env.ANTHROPIC_CONSOLIDATION_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_CONSOLIDATION_KEY not set; skipping consolidation");
    return null;
  }
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });

  const epLines = input.episodes
    .map((e) => `- (${e.importance.toFixed(2)}) ${e.content}`)
    .join("\n");
  const corrLines = input.corrections
    .map((c) => c.corrected
      ? c.original
        ? `- replace "${c.original}" with "${c.corrected}"`
        : `- add: ${c.corrected}`
      : `- remove "${c.original}"`)
    .join("\n");

  const sys = `You are a memory consolidator for Ru, an AI life organizer. Output the rewritten content of ONE profile section. Constraints:
- Section: ${input.section}
- Target length: under ${input.budget} tokens, ideally 2-6 short factual sentences.
- Style: third person, neutral, no opinions, no first-person "I".
- Do not fabricate. Only include facts supported by the existing content, episodes, or corrections below.
- If episodes contradict prior content, prefer the episodes (the user just confirmed them).
- If corrections are given, honor them strictly.
- Output ONLY the new section content. No headers, no quotes, no commentary.`;
  const user = `Existing ${input.section}:
${input.currentContent || "(empty)"}

User: ${input.displayName ?? "(unknown)"}, ${input.timezone}

Recent high-importance episodes:
${epLines || "(none)"}

User corrections to apply:
${corrLines || "(none)"}

Rewrite the section.`;

  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: Math.ceil(input.budget * 1.3),
      system: sys,
      messages: [{ role: "user", content: user }],
    });
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    return text.text.trim();
  } catch (e) {
    console.error("section rewriter failed", e);
    return null;
  }
}
```

- [ ] **Step 2: Add `ANTHROPIC_CONSOLIDATION_KEY` to env example**

Append to `.env.local.example`:

```
# Platform-managed Anthropic key for memory consolidation (Haiku 4.5).
# Separate from any user BYOK — this is our cost, not theirs.
ANTHROPIC_CONSOLIDATION_KEY=
```

- [ ] **Step 3: Type-check**

```bash
npm run build 2>&1 | grep -E "memory-consolidate" | head -5
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/inngest/functions/memory-consolidate.ts .env.local.example
git commit -m "feat(memory): pass 1 — profile section rewrite with Haiku consolidation"
```

---

## Task 4.5: Pass 4 — routine detection v2

**Files:**
- Modify: `src/lib/inngest/functions/memory-consolidate.ts`

- [ ] **Step 1: Implement `passFourRoutineDetection`**

Replace stub:

```typescript
async function passFourRoutineDetection(userId: string): Promise<void> {
  const supabase = createServiceClient();
  const since = new Date(Date.now() - 14 * 86400000).toISOString();

  const { data: acts } = await supabase
    .from("activity_log")
    .select("activity, category, timestamp")
    .eq("user_id", userId)
    .gte("timestamp", since);
  if (!acts || acts.length === 0) return;

  const buckets = new Map<string, { activity: string; category: string; times: number[] }>();
  for (const a of acts) {
    const key = a.activity.toLowerCase().trim();
    if (!buckets.has(key)) buckets.set(key, { activity: a.activity, category: a.category, times: [] });
    buckets.get(key)!.times.push(new Date(a.timestamp).getTime());
  }

  for (const bucket of buckets.values()) {
    if (bucket.times.length < 4) continue;
    const hours = bucket.times.map((t) => new Date(t).getHours());
    const mean = hours.reduce((s, h) => s + h, 0) / hours.length;
    const variance = hours.reduce((s, h) => s + (h - mean) ** 2, 0) / hours.length;
    const stdev = Math.sqrt(variance);
    if (stdev >= 2) continue;

    // Check existing
    const { data: existing } = await supabase
      .from("routines")
      .select("id")
      .eq("user_id", userId)
      .ilike("title", bucket.activity)
      .maybeSingle();
    if (existing) continue;

    // Vote: does the model think this is a real routine?
    const vote = await routineDetectionVote({
      activity: bucket.activity,
      occurrences: bucket.times.length,
      hourMean: Math.round(mean),
      stdev,
    });
    if (!vote) continue;

    const timeOfDay = `${Math.round(mean).toString().padStart(2, "0")}:00:00`;
    const confidence = Math.min(1, bucket.times.length / 10);

    const { data: inserted } = await supabase
      .from("routines")
      .insert({
        user_id: userId,
        title: bucket.activity,
        frequency: "daily",
        time_of_day: timeOfDay,
        origin: "auto_detected",
        detection_confidence: confidence,
        nudge_level: "gentle",
        is_active: false, // user confirms in Today
      })
      .select()
      .single();

    if (inserted) {
      await inngest.send({
        name: "routine.detected",
        data: { userId, routineId: inserted.id, title: bucket.activity, confidence },
      });
    }
  }
}

async function routineDetectionVote(input: {
  activity: string;
  occurrences: number;
  hourMean: number;
  stdev: number;
}): Promise<boolean> {
  const apiKey = process.env.ANTHROPIC_CONSOLIDATION_KEY;
  if (!apiKey) return false; // conservative: don't promote without a vote
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });
  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 16,
      system: 'You vote yes or no on whether an activity pattern should be promoted to a tracked "routine". Reply ONLY "yes" or "no".',
      messages: [{
        role: "user",
        content: `Activity: "${input.activity}"\nOccurrences in last 14 days: ${input.occurrences}\nTypical hour: ${input.hourMean}\nHour stdev: ${input.stdev.toFixed(2)}\n\nShould this be auto-promoted to a routine the user can opt into?`,
      }],
    });
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return false;
    return /^yes/i.test(text.text.trim());
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "memory-consolidate" | head -5
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/inngest/functions/memory-consolidate.ts
git commit -m "feat(memory): pass 4 — routine detection v2 with model vote"
```

---

## Task 4.6: Pass 5 — decay & forgetting

**Files:**
- Modify: `src/lib/inngest/functions/memory-consolidate.ts`

- [ ] **Step 1: Implement `passFiveDecay`**

Replace stub:

```typescript
async function passFiveDecay(userId: string): Promise<void> {
  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();

  const { data: stale } = await supabase
    .from("episodes")
    .select("id")
    .eq("user_id", userId)
    .lt("importance", 0.3)
    .lt("last_referenced_at", cutoff)
    .is("superseded_by", null)
    .is("archived_at", null);

  if (stale && stale.length > 0) {
    const ids = stale.map((e) => e.id);
    await supabase
      .from("episodes")
      .update({ archived_at: new Date().toISOString() })
      .in("id", ids);
    await supabase.from("memory_audit").insert({
      user_id: userId,
      kind: "forgot",
      summary: `Archived ${ids.length} stale low-importance episode(s).`,
      payload: { episode_ids: ids, rule: "stale_low_importance_90d" },
      episode_ids: ids,
      reversible: false,
    });
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "memory-consolidate" | head -5
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/inngest/functions/memory-consolidate.ts
git commit -m "feat(memory): pass 5 — decay archives stale low-importance episodes"
```

---

## Task 4.7: Remove old jobs + wire memory-consolidate

**Files:**
- Modify: `src/lib/inngest/index.ts`
- Delete: `src/lib/inngest/functions/daily-summary.ts`
- Delete: `src/lib/inngest/functions/routine-detection.ts`

- [ ] **Step 1: Update `src/lib/inngest/index.ts`**

Replace contents:

```typescript
export { inngest } from "./client";
import { reminderDispatcher } from "./functions/reminder-dispatcher";
import { missedDeadlines } from "./functions/missed-deadlines";
import { streakCalculator } from "./functions/streak-nudge";
import { memoryConsolidate } from "./functions/memory-consolidate";
import {
  pushReminderFire,
  pushStreakMilestone,
  pushRoutineDetected,
  pushTaskMissed,
} from "./functions/push-handler";

export const functions = [
  reminderDispatcher,
  missedDeadlines,
  streakCalculator,
  memoryConsolidate,
  pushReminderFire,
  pushStreakMilestone,
  pushRoutineDetected,
  pushTaskMissed,
];
```

- [ ] **Step 2: Delete the two old function files**

```bash
rm src/lib/inngest/functions/daily-summary.ts
rm src/lib/inngest/functions/routine-detection.ts
```

- [ ] **Step 3: Type-check + smoke**

```bash
npm run build 2>&1 | grep -E "error TS" | head -10
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/inngest/index.ts src/lib/inngest/functions/
git commit -m "feat(memory): wire memory-consolidate; remove daily-summary + routine-detection"
```

---

## Task 4.8: Manual rebuild API route

**Files:**
- Create: `src/app/api/memory/rebuild/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/memory/rebuild/route.ts
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const mode = body?.mode === "rebuild" ? "rebuild" : "full";

  await inngest.send({
    name: "memory.consolidate.requested",
    data: { userId: user.id, mode },
  });

  return Response.json({ ok: true, mode });
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "memory/rebuild" | head -5
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/memory/rebuild/route.ts
git commit -m "feat(memory): POST /api/memory/rebuild to trigger manual consolidation"
```

---

# Phase 5 — UI: `/settings/memory`

Three tabs, inline edit, undo, provenance peek. Editorial style — cream paper, DM Serif + DM Sans, lime + forest accents, no purple/dark.

## Task 5.1: Server actions for memory edits

**Files:**
- Create: `src/app/(app)/settings/memory/actions.ts`

- [ ] **Step 1: Implement the actions**

```typescript
// src/app/(app)/settings/memory/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest";

export async function updateProfileSectionAction(input: {
  section: string;
  newContent: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const SECTIONS = ["identity", "preferences", "current_themes", "active_projects", "ru_and_me"];
  if (!SECTIONS.includes(input.section)) return { ok: false, error: "invalid section" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("profile_doc, profile_version")
    .eq("id", user.id)
    .single();
  if (!profile) return { ok: false, error: "profile not found" };

  const doc = (profile.profile_doc as Record<string, { content: string; sources: string[]; updated_at: string }>) ?? {};
  const before = doc[input.section]?.content ?? "";

  doc[input.section] = {
    content: input.newContent.trim(),
    sources: doc[input.section]?.sources ?? [],
    updated_at: new Date().toISOString(),
  };

  await supabase
    .from("profiles")
    .update({
      profile_doc: doc,
      profile_version: (profile.profile_version ?? 0) + 1,
    })
    .eq("id", user.id);

  await supabase.from("memory_corrections").insert({
    user_id: user.id,
    section: input.section,
    original: before,
    corrected: input.newContent.trim(),
  });

  await supabase.from("memory_audit").insert({
    user_id: user.id,
    kind: "corrected",
    summary: `You edited ${input.section}.`,
    payload: { section: input.section, before, after: input.newContent.trim() },
    reversible: true,
  });

  // Fire a light patch consolidation so the section gets cleanly merged.
  await inngest.send({
    name: "memory.consolidate.user_profile_touched",
    data: { userId: user.id, mode: "patch_profile", section: input.section },
  });

  revalidatePath("/settings/memory");
  return { ok: true };
}

export async function reverseAuditEntryAction(auditId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const { data: entry } = await supabase
    .from("memory_audit")
    .select("*")
    .eq("id", auditId)
    .eq("user_id", user.id)
    .single();

  if (!entry || !entry.reversible || entry.reversed_at) {
    return { ok: false, error: "not reversible" };
  }

  // Apply reversal based on kind.
  if (entry.kind === "learned" && entry.episode_ids && entry.episode_ids.length > 0) {
    await supabase
      .from("episodes")
      .update({ archived_at: new Date().toISOString() })
      .in("id", entry.episode_ids);
  } else if (entry.kind === "forgot" && entry.episode_ids && entry.episode_ids.length > 0) {
    await supabase
      .from("episodes")
      .update({ archived_at: null, superseded_by: null, superseded_reason: null })
      .in("id", entry.episode_ids);
  } else if (entry.kind === "merged" && entry.payload) {
    const payload = entry.payload as { kept?: string; dropped?: string; pre_drop_content?: string };
    if (payload.dropped) {
      await supabase
        .from("episodes")
        .update({ superseded_by: null, superseded_reason: null })
        .eq("id", payload.dropped);
    }
  } else if (entry.kind === "corrected" && entry.payload) {
    const payload = entry.payload as { section?: string; before?: string };
    if (payload.section && typeof payload.before === "string") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("profile_doc, profile_version")
        .eq("id", user.id)
        .single();
      if (profile) {
        const doc = (profile.profile_doc as Record<string, { content: string; sources: string[]; updated_at: string }>) ?? {};
        doc[payload.section] = {
          content: payload.before,
          sources: doc[payload.section]?.sources ?? [],
          updated_at: new Date().toISOString(),
        };
        await supabase
          .from("profiles")
          .update({ profile_doc: doc, profile_version: (profile.profile_version ?? 0) + 1 })
          .eq("id", user.id);
      }
    }
  }

  // Write the reversal audit entry.
  const { data: reversal } = await supabase
    .from("memory_audit")
    .insert({
      user_id: user.id,
      kind: "reversed",
      summary: `Reversed: ${entry.summary}`,
      payload: { reversed_entry_id: entry.id, original_kind: entry.kind },
      episode_ids: entry.episode_ids ?? [],
      reversible: false,
    })
    .select()
    .single();

  await supabase
    .from("memory_audit")
    .update({
      reversed_at: new Date().toISOString(),
      reversed_by: reversal?.id ?? null,
    })
    .eq("id", entry.id);

  revalidatePath("/settings/memory");
  return { ok: true };
}

export async function forgetEpisodeAction(episodeId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const { data: ep } = await supabase
    .from("episodes")
    .select("content")
    .eq("id", episodeId)
    .eq("user_id", user.id)
    .single();
  if (!ep) return { ok: false, error: "not found" };

  await supabase
    .from("episodes")
    .update({ archived_at: new Date().toISOString(), superseded_reason: "user_forget" })
    .eq("id", episodeId);
  await supabase.from("memory_audit").insert({
    user_id: user.id,
    kind: "forgot",
    summary: `You asked Ru to forget: "${ep.content.slice(0, 80)}"`,
    payload: { episode_id: episodeId, original_content: ep.content },
    episode_ids: [episodeId],
    reversible: true,
  });
  revalidatePath("/settings/memory");
  return { ok: true };
}

export async function rebuildMemoryAction(mode: "full" | "rebuild" = "full") {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };
  await inngest.send({
    name: "memory.consolidate.requested",
    data: { userId: user.id, mode },
  });
  return { ok: true };
}

export async function markOnboardedAction() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  await supabase
    .from("profiles")
    .update({ memory_onboarded_at: new Date().toISOString() })
    .eq("id", user.id);
  revalidatePath("/settings/memory");
  return { ok: true };
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "settings/memory/actions" | head -5
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/settings/memory/actions.ts
git commit -m "feat(memory-ui): server actions for profile edits + undo + forget + rebuild"
```

---

## Task 5.2: Memory page layout + tabs

**Files:**
- Create: `src/app/(app)/settings/memory/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// src/app/(app)/settings/memory/page.tsx
import { createClient } from "@/lib/supabase/server";
import { loadMemoryProfile } from "@/lib/queries/memory";
import { MemoryTabs } from "./memory-tabs";
import { OnboardingModal } from "./onboarding-modal";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await loadMemoryProfile(supabase, user.id);
  const { data: onboardingRow } = await supabase
    .from("profiles")
    .select("memory_onboarded_at")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen" style={{ background: "#f4ecf2", color: "#2d2a26", fontFamily: "var(--font-body), system-ui, sans-serif" }}>
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-10">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em]" style={{ color: "#8a847b" }}>
            / settings · memory
          </div>
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "44px",
              lineHeight: 1.05,
              color: "#0d1f15",
              letterSpacing: "-0.015em",
            }}
          >
            What Ru knows<span style={{ color: "#1a5632" }}>.</span>
          </h1>
          <p className="mt-2 text-[15px]" style={{ color: "#4a5547" }}>
            Edit anything that&apos;s off. Ru learns from your corrections.
          </p>
        </header>
        <MemoryTabs profile={profile} userId={user.id} />
      </div>
      {!onboardingRow?.memory_onboarded_at && <OnboardingModal />}
    </div>
  );
}
```

- [ ] **Step 2: Verify (will fail until tabs + modal are written)**

```bash
npm run build 2>&1 | grep -E "settings/memory" | head -10
```
Expected: errors about missing components — we write them next.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/settings/memory/page.tsx
git commit -m "feat(memory-ui): page shell — editorial header + tabs container"
```

---

## Task 5.3: Memory tabs container

**Files:**
- Create: `src/app/(app)/settings/memory/memory-tabs.tsx`

- [ ] **Step 1: Write the tabs container**

```tsx
// src/app/(app)/settings/memory/memory-tabs.tsx
"use client";

import { useState } from "react";
import { ProfileTab } from "./profile-tab";
import { TimelineTab } from "./timeline-tab";
import { EpisodicTab } from "./episodic-tab";
import type { MemoryProfile } from "@/lib/queries/memory";

type TabKey = "profile" | "timeline" | "episodic";

export function MemoryTabs({ profile, userId }: { profile: MemoryProfile | null; userId: string }) {
  const [tab, setTab] = useState<TabKey>("profile");

  return (
    <div>
      <nav className="mb-8 flex gap-6 border-b" style={{ borderColor: "#e8e4de" }}>
        {(["profile", "timeline", "episodic"] as const).map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="relative pb-3 text-[15px] transition-colors"
              style={{
                fontFamily: active ? "var(--font-serif)" : undefined,
                fontStyle: active ? "italic" : undefined,
                color: active ? "#0d1f15" : "#8a847b",
              }}
            >
              {t === "episodic" ? "episodic memory" : t}
              {active && (
                <span
                  aria-hidden
                  className="absolute -bottom-px left-0 right-0"
                  style={{ height: "2px", background: "#1a5632" }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {tab === "profile" && <ProfileTab profile={profile} />}
      {tab === "timeline" && <TimelineTab userId={userId} />}
      {tab === "episodic" && <EpisodicTab userId={userId} />}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(app\)/settings/memory/memory-tabs.tsx
git commit -m "feat(memory-ui): editorial tab nav with italic-serif active state"
```

---

## Task 5.4: Profile tab — read + inline edit

**Files:**
- Create: `src/app/(app)/settings/memory/profile-tab.tsx`

- [ ] **Step 1: Write the profile tab**

```tsx
// src/app/(app)/settings/memory/profile-tab.tsx
"use client";

import { useState, useTransition } from "react";
import type { MemoryProfile } from "@/lib/queries/memory";
import { updateProfileSectionAction, rebuildMemoryAction } from "./actions";

const SECTION_ORDER: Array<{ key: keyof MemoryProfile["profile_doc"]; label: string }> = [
  { key: "identity",         label: "Identity" },
  { key: "preferences",      label: "Preferences" },
  { key: "current_themes",   label: "Current themes" },
  { key: "active_projects",  label: "Active projects" },
  { key: "ru_and_me",        label: "Ru & me" },
];

export function ProfileTab({ profile }: { profile: MemoryProfile | null }) {
  const doc = profile?.profile_doc ?? {};
  return (
    <div className="space-y-10">
      {SECTION_ORDER.map(({ key, label }) => (
        <SectionEditor
          key={key as string}
          sectionKey={key as string}
          label={label}
          initialContent={doc[key]?.content ?? ""}
        />
      ))}
      <RebuildButton />
    </div>
  );
}

function SectionEditor({
  sectionKey,
  label,
  initialContent,
}: { sectionKey: string; label: string; initialContent: string }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(initialContent);
  const [draft, setDraft]     = useState(initialContent);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function save() {
    startTransition(async () => {
      const res = await updateProfileSectionAction({ section: sectionKey, newContent: draft });
      if (res.ok) {
        setContent(draft);
        setEditing(false);
        setSavedAt(Date.now());
      }
    });
  }

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "22px",
            color: "#0d1f15",
            letterSpacing: "-0.01em",
          }}
        >
          {label}
        </h2>
        {!editing && (
          <button
            className="text-[13px]"
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              color: "#1a5632",
            }}
            onClick={() => { setDraft(content); setEditing(true); }}
          >
            edit
          </button>
        )}
      </div>

      {!editing ? (
        <p
          className="whitespace-pre-wrap text-[15px] leading-relaxed"
          style={{ color: content ? "#2d2a26" : "#8a847b" }}
        >
          {content || "(Ru hasn't picked anything up here yet.)"}
        </p>
      ) : (
        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.max(3, draft.split("\n").length)}
            className="w-full rounded-xl border bg-transparent px-4 py-3 text-[15px] leading-relaxed focus:outline-none"
            style={{
              borderColor: "#1a5632",
              boxShadow: "0 0 0 4px rgba(26,86,50,0.10)",
              background: "#fbfaf7",
              color: "#2d2a26",
            }}
          />
          <div className="mt-3 flex gap-3">
            <button
              disabled={pending}
              onClick={save}
              className="rounded-full border-2 px-5 py-2 text-[14px]"
              style={{
                background: "#d9fb60",
                borderColor: "#1a5632",
                color: "#1a5632",
                fontFamily: "var(--font-serif)",
              }}
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              disabled={pending}
              onClick={() => { setDraft(content); setEditing(false); }}
              className="text-[13px]"
              style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "#6b6f66" }}
            >
              cancel
            </button>
          </div>
        </div>
      )}

      {savedAt && Date.now() - savedAt < 2000 && (
        <div className="mt-2 text-[12px]" style={{ color: "#1a5632" }}>saved</div>
      )}
    </section>
  );
}

function RebuildButton() {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  return (
    <div className="border-t pt-8" style={{ borderColor: "#e8e4de" }}>
      <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "18px", color: "#0d1f15" }}>
        Rebuild from scratch
      </h3>
      <p className="mt-2 text-[13.5px]" style={{ color: "#6b6f66" }}>
        Reads your last 180 days of chats and produces a fresh profile. Existing memory is preserved; this just rewrites the
        summary sections.
      </p>
      <button
        disabled={pending}
        onClick={() => startTransition(async () => {
          if (!confirm("Rebuild your memory profile from the last 180 days of chats?")) return;
          await rebuildMemoryAction("rebuild");
          setDone(true);
        })}
        className="mt-3 rounded-full border px-4 py-2 text-[13px]"
        style={{ borderColor: "#1a5632", color: "#1a5632", background: "#fff" }}
      >
        {done ? "Queued — ready by tomorrow" : pending ? "Queuing…" : "Rebuild"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "profile-tab" | head -5
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/settings/memory/profile-tab.tsx
git commit -m "feat(memory-ui): profile tab — inline section edit + rebuild button"
```

---

## Task 5.5: Timeline tab with undo

**Files:**
- Create: `src/app/(app)/settings/memory/timeline-tab.tsx`

- [ ] **Step 1: Write the timeline tab**

```tsx
// src/app/(app)/settings/memory/timeline-tab.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { reverseAuditEntryAction } from "./actions";

interface AuditRow {
  id: string;
  kind: string;
  summary: string;
  payload: Record<string, unknown> | null;
  reversible: boolean;
  reversed_at: string | null;
  created_at: string;
}

export function TimelineTab({ userId }: { userId: string }) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("memory_audit")
      .select("id, kind, summary, payload, reversible, reversed_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(150)
      .then(({ data }) => setRows((data ?? []) as AuditRow[]));
  }, [userId]);

  if (rows === null) return <p style={{ color: "#8a847b" }}>Loading…</p>;
  if (rows.length === 0) return <p style={{ color: "#8a847b" }}>Nothing has happened yet.</p>;

  const grouped = groupByDay(rows);

  return (
    <div className="space-y-8">
      {grouped.map(({ day, entries }) => (
        <div key={day}>
          <h3
            className="mb-3 text-[13px] uppercase tracking-[0.16em]"
            style={{ fontFamily: "var(--font-body)", color: "#8a847b" }}
          >
            {day}
          </h3>
          <ul className="space-y-3">
            {entries.map((e) => <TimelineRow key={e.id} entry={e} />)}
          </ul>
        </div>
      ))}
    </div>
  );
}

function TimelineRow({ entry }: { entry: AuditRow }) {
  const [pending, startTransition] = useTransition();
  const isReversed = !!entry.reversed_at;
  const verb = verbForKind(entry.kind);

  return (
    <li className="group relative pl-4" style={{ borderLeft: "1px solid #e8e4de" }}>
      <div className="flex items-baseline gap-2">
        <span
          className="text-[13px] uppercase tracking-[0.14em]"
          style={{ color: "#1a5632", fontFamily: "var(--font-body)" }}
        >
          {verb}
        </span>
        <span className="text-[15px]" style={{ color: isReversed ? "#8a847b" : "#2d2a26" }}>
          {entry.summary}
          {isReversed && <span className="ml-2 text-[12px]" style={{ color: "#8a847b" }}>(undone)</span>}
        </span>
        {entry.reversible && !isReversed && (
          <button
            disabled={pending}
            onClick={() => startTransition(async () => { await reverseAuditEntryAction(entry.id); })}
            className="ml-auto text-[12px] opacity-0 transition-opacity group-hover:opacity-100"
            style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "#1a5632" }}
          >
            {pending ? "undoing…" : "undo"}
          </button>
        )}
      </div>
    </li>
  );
}

function verbForKind(kind: string): string {
  switch (kind) {
    case "learned": return "learned";
    case "forgot": return "forgot";
    case "merged": return "merged";
    case "superseded": return "replaced";
    case "corrected": return "you edited";
    case "profile_rewrite": return "rewrote";
    case "reversed": return "undid";
    default: return kind;
  }
}

function groupByDay(rows: AuditRow[]) {
  const out: Array<{ day: string; entries: AuditRow[] }> = [];
  const todayISO = new Date().toISOString().slice(0, 10);
  const yesterdayISO = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  for (const r of rows) {
    const d = r.created_at.slice(0, 10);
    const label = d === todayISO ? "Today" : d === yesterdayISO ? "Yesterday" : new Date(r.created_at).toDateString();
    const bucket = out.find((b) => b.day === label);
    if (bucket) bucket.entries.push(r); else out.push({ day: label, entries: [r] });
  }
  return out;
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "timeline-tab" | head -5
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/settings/memory/timeline-tab.tsx
git commit -m "feat(memory-ui): timeline tab — day-grouped audit log with hover undo"
```

---

## Task 5.6: Episodic advanced tab

**Files:**
- Create: `src/app/(app)/settings/memory/episodic-tab.tsx`

- [ ] **Step 1: Write the episodic tab**

```tsx
// src/app/(app)/settings/memory/episodic-tab.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { forgetEpisodeAction } from "./actions";

interface Episode {
  id: string;
  content: string;
  importance: number;
  last_referenced_at: string;
  created_at: string;
}

export function EpisodicTab({ userId }: { userId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [minImportance, setMinImportance] = useState(0);

  useEffect(() => {
    if (!expanded) return;
    const supabase = createClient();
    supabase
      .from("episodes")
      .select("id, content, importance, last_referenced_at, created_at")
      .eq("user_id", userId)
      .is("superseded_by", null)
      .is("archived_at", null)
      .gte("importance", minImportance)
      .order("importance", { ascending: false })
      .order("last_referenced_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setEpisodes((data ?? []) as Episode[]));
  }, [expanded, userId, minImportance]);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="text-[14px]"
        style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "#1a5632" }}
      >
        ▸ Show advanced memory
      </button>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-4 text-[13px]" style={{ color: "#6b6f66" }}>
        <label>min importance:</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={minImportance}
          onChange={(e) => setMinImportance(parseFloat(e.target.value))}
        />
        <span>{minImportance.toFixed(1)}</span>
      </div>

      {episodes === null && <p style={{ color: "#8a847b" }}>Loading…</p>}
      {episodes && episodes.length === 0 && <p style={{ color: "#8a847b" }}>No episodes match.</p>}
      {episodes && episodes.length > 0 && (
        <ul className="space-y-3">
          {episodes.map((e) => <EpisodeRow key={e.id} episode={e} />)}
        </ul>
      )}
    </div>
  );
}

function EpisodeRow({ episode }: { episode: Episode }) {
  const [pending, startTransition] = useTransition();
  return (
    <li className="rounded-xl border p-3" style={{ borderColor: "#e8e4de", background: "#fbfaf7" }}>
      <div className="flex items-start gap-3">
        <ImportanceBar value={episode.importance} />
        <div className="flex-1">
          <p className="text-[15px]" style={{ color: "#2d2a26" }}>{episode.content}</p>
          <p className="mt-1 text-[12px]" style={{ color: "#8a847b" }}>
            created {new Date(episode.created_at).toLocaleDateString()} · last seen {new Date(episode.last_referenced_at).toLocaleDateString()}
          </p>
        </div>
        <button
          disabled={pending}
          onClick={() => startTransition(async () => {
            if (!confirm("Ask Ru to forget this episode?")) return;
            await forgetEpisodeAction(episode.id);
          })}
          className="text-[12px]"
          style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "#7d1a0d" }}
        >
          {pending ? "…" : "forget"}
        </button>
      </div>
    </li>
  );
}

function ImportanceBar({ value }: { value: number }) {
  return (
    <div className="mt-1 h-12 w-2 rounded-full" style={{ background: "#e8e4de", position: "relative" }}>
      <div
        className="absolute bottom-0 left-0 right-0 rounded-full"
        style={{ background: "#1a5632", height: `${Math.max(4, value * 100)}%` }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "episodic-tab" | head -5
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/settings/memory/episodic-tab.tsx
git commit -m "feat(memory-ui): episodic advanced tab — disclosure + importance filter + forget"
```

---

## Task 5.7: First-time onboarding modal

**Files:**
- Create: `src/app/(app)/settings/memory/onboarding-modal.tsx`

- [ ] **Step 1: Write the modal**

```tsx
// src/app/(app)/settings/memory/onboarding-modal.tsx
"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { markOnboardedAction } from "./actions";

export function OnboardingModal() {
  const [open, setOpen] = useState(true);
  const [pending, startTransition] = useTransition();

  function dismiss() {
    startTransition(async () => {
      await markOnboardedAction();
      setOpen(false);
    });
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(13,31,21,0.45)" }}
        >
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md rounded-[28px] border p-7"
            style={{ background: "#fff", borderColor: "#e8e4de" }}
          >
            <h2
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "30px",
                lineHeight: 1.1,
                color: "#0d1f15",
                letterSpacing: "-0.015em",
              }}
            >
              Here&apos;s what I&apos;ve picked <em style={{ color: "#1a5632", fontStyle: "italic" }}>up</em> about you so far.
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "#4a5547" }}>
              I learn from our conversations and update this whenever you tell me something new.
              Everything&apos;s editable — fix anything that&apos;s off and I&apos;ll learn from your correction.
            </p>
            <button
              disabled={pending}
              onClick={dismiss}
              className="mt-6 rounded-full border-2 px-5 py-2.5 text-[15px]"
              style={{ background: "#d9fb60", borderColor: "#1a5632", color: "#1a5632", fontFamily: "var(--font-serif)" }}
            >
              {pending ? "…" : "Got it."}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Type-check + verify full memory page builds**

```bash
npm run build 2>&1 | grep -E "settings/memory" | head -10
```
Expected: no errors.

- [ ] **Step 3: Manual smoke**

```bash
npm run dev
```

Navigate to `localhost:3000/settings/memory` while logged in. Verify:
- Modal appears on first visit, dismisses on "Got it."
- Profile tab shows section headings (content empty for a fresh user).
- Timeline tab shows "Nothing has happened yet."
- Episodic tab shows the disclosure link.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/settings/memory/onboarding-modal.tsx
git commit -m "feat(memory-ui): first-time onboarding modal — editorial, lime CTA"
```

---

## Task 5.8: Nav indicator chip

**Files:**
- Modify: existing top-nav component (locate via grep)

- [ ] **Step 1: Find the top nav**

```bash
ls src/components/app-shell/
```
Look for a top-nav-related file. Likely `top-nav.tsx` or similar.

```bash
grep -l "avatar\|profile" src/components/app-shell/*.tsx
```

- [ ] **Step 2: Add the chip next to the user avatar**

In the identified top-nav file, alongside the avatar button, add:

```tsx
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// ... inside the component:
const [factCount, setFactCount] = useState<number | null>(null);

useEffect(() => {
  const supabase = createClient();
  (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data: prof }, { count }] = await Promise.all([
      supabase.from("profiles").select("profile_doc").eq("id", user.id).single(),
      supabase
        .from("episodes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("superseded_by", null)
        .is("archived_at", null),
    ]);
    const doc = (prof?.profile_doc as Record<string, { content?: string }>) ?? {};
    let sentences = 0;
    for (const v of Object.values(doc)) {
      if (typeof v?.content === "string") {
        sentences += v.content.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
      }
    }
    setFactCount(sentences + (count ?? 0));
  })();
}, []);

// And in the JSX, next to the avatar:
{factCount !== null && factCount > 0 && (
  <Link
    href="/settings/memory"
    className="hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] md:inline-flex"
    style={{ borderColor: "#e8e4de", color: "#1a5632", background: "#fbfaf7" }}
    title="What Ru knows about you"
  >
    <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: "#1a5632" }} />
    {factCount} {factCount === 1 ? "fact" : "facts"}
  </Link>
)}
```

(Adapt the import and placement based on the actual file structure.)

- [ ] **Step 3: Verify in browser**

Reload, check the chip appears next to the avatar (will say "0 facts" or be hidden for fresh users — that's correct).

- [ ] **Step 4: Commit**

```bash
git add src/components/app-shell/
git commit -m "feat(memory-ui): nav indicator — {n} facts chip → /settings/memory"
```

---

# Phase 6 — Bootstrap & rollout

## Task 6.1: Bootstrap migration on first consolidation run

**Files:**
- Modify: `src/lib/inngest/functions/memory-consolidate.ts`

- [ ] **Step 1: Detect first-run + extend pass 1 window**

In `passOneProfile`, before the `for` loop, add a check:

```typescript
async function passOneProfile(userId: string, mode: string): Promise<void> {
  const supabase = createServiceClient();

  // Bootstrap detection: if profile_doc is empty AND mode != "rebuild", treat
  // this as the first consolidation — widen the window to 180 days so we
  // backfill from existing chat history.
  if (mode !== "rebuild") {
    const { data: prof } = await supabase
      .from("profiles")
      .select("profile_doc")
      .eq("id", userId)
      .single();
    const doc = (prof?.profile_doc as Record<string, unknown>) ?? {};
    if (Object.keys(doc).length === 0) {
      mode = "rebuild"; // promote to rebuild for the first run
    }
  }

  for (const section of Object.keys(SECTION_TOKEN_BUDGET)) {
    await rewriteSection(supabase, userId, section, mode);
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | grep -E "memory-consolidate" | head -5
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/inngest/functions/memory-consolidate.ts
git commit -m "feat(memory): first-run bootstrap auto-promotes to rebuild mode"
```

---

## Task 6.2: Rollout banner

**Files:**
- Modify: existing top-nav or app shell

- [ ] **Step 1: Find a good banner mounting point**

Probably the layout under `src/app/(app)/layout.tsx`.

- [ ] **Step 2: Add a one-time banner**

```tsx
// src/app/(app)/_memory-rollout-banner.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function MemoryRolloutBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("ru_memory_rollout_dismissed") === "1") return;
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("memory_onboarded_at")
        .eq("id", user.id)
        .single();
      if (!data?.memory_onboarded_at) setShow(true);
    })();
  }, []);

  if (!show) return null;
  return (
    <div
      className="border-b px-6 py-3 text-[13px]"
      style={{ background: "#fffaeb", borderColor: "#f0e7c8", color: "#2d2a26" }}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        <span style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", color: "#1a5632" }}>
          Ru just got a memory.
        </span>
        <Link href="/settings/memory" className="underline" style={{ color: "#1a5632" }}>
          See what she knows
        </Link>
        <button
          className="ml-auto text-[12px]"
          style={{ color: "#8a847b" }}
          onClick={() => { localStorage.setItem("ru_memory_rollout_dismissed", "1"); setShow(false); }}
        >
          dismiss
        </button>
      </div>
    </div>
  );
}
```

Mount in `src/app/(app)/layout.tsx`:

```tsx
import { MemoryRolloutBanner } from "./_memory-rollout-banner";

// In the JSX, right inside the layout's outermost div:
<MemoryRolloutBanner />
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/_memory-rollout-banner.tsx src/app/\(app\)/layout.tsx
git commit -m "feat(memory): one-time rollout banner pointing to /settings/memory"
```

---

## Task 6.3: Final verification + push

- [ ] **Step 1: Run all tests**

```bash
npm test
```
Expected: all green.

- [ ] **Step 2: Build production**

```bash
npm run build
```
Expected: builds cleanly.

- [ ] **Step 3: Manual end-to-end smoke**

```bash
npm run dev
```

1. Open `localhost:3000/chat`.
2. Send a turn: "I just moved to Tokyo last week and I'm not really a morning person."
3. Watch server logs — `note_episode` and/or `update_profile` should fire.
4. Open `/settings/memory` — see the onboarding modal, then the profile sections populated (might be empty until consolidation runs; episodes should appear in episodic tab).
5. Edit the preferences section, save, refresh — confirm change persists.
6. Check the timeline tab — see "you edited preferences" + "learned" entries.
7. Click undo on a learned entry — confirm it disappears from episodic tab.

- [ ] **Step 4: Run Supabase advisors**

Via Supabase MCP: `mcp__plugin_supabase_supabase__get_advisors` for both `security` and `performance`. Address any new findings.

- [ ] **Step 5: Final commit + push (manual — ask user first)**

```bash
git log --oneline -20
```
Review the M0 commit chain.

**Do not push automatically. Ask the user before pushing to remote.**

---

## Self-review checklist (run before handing off)

- [ ] Spec coverage: every section of `docs/superpowers/specs/2026-05-22-memory-personalization-design.md` maps to a task.
- [ ] No placeholders: search for "TBD", "TODO", "fill in".
- [ ] Type consistency: `MemoryProfile`, `Episode`, `TurnEnrichment` shapes match across files.
- [ ] Migration ordering: 6.1 must run before profile-doc-reading code (it does — Phase 1 task 1.1).
- [ ] RLS on every new table (verified in tasks 1.2-1.4).
- [ ] Kill switch (`memory_enabled`) honored in hot path (task 3.7) and consolidation (task 4.1).
- [ ] Old jobs deleted (task 4.7).
