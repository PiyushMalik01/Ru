-- ---------------------------------------------------------------------------
-- Anticipatory layer ("Ru speaks first")
-- ---------------------------------------------------------------------------
-- A queue of proactive suggestions Ru wants to surface, plus a small log of
-- extracted promises (used by the promise-followup detector) and an actions
-- log for learning suppression patterns.
--
-- The 30-minute cron in src/lib/inngest/functions/anticipation.ts runs the
-- detectors → ranker → LLM phraser pipeline and inserts rows here. The Today
-- briefing reads pending rows; the pill toast subscribes via Supabase
-- realtime; push fires on insert for `priority = 'urgent'`.
-- ---------------------------------------------------------------------------

-- 0. Enums
create type suggestion_type as enum (
  'routine_adherence',
  'task_urgency',
  'routine_candidate',
  'promise_followup',
  'cross_thread'
);

create type suggestion_status as enum (
  'pending',     -- queued, not yet surfaced
  'shown',       -- surfaced in briefing or toast (one or more channels)
  'acted',       -- user took the suggested action
  'dismissed',   -- user explicitly dismissed
  'snoozed',     -- snoozed until snooze_until
  'expired'      -- show_at passed without surfacing — janitor moved here
);

create type suggestion_priority as enum ('soft', 'urgent');

-- Anticipation aggressiveness — drives ranker's pass-through threshold.
create type anticipation_level_type as enum (
  'off',         -- no suggestions at all
  'minimal',     -- only urgent + ≥0.85 confidence
  'balanced',    -- urgent + ≥0.65 confidence (default)
  'proactive'    -- urgent + ≥0.45 confidence + more types
);

-- 1. suggestions: the queue
create table suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  type suggestion_type not null,
  -- Detector-specific structured fields: { routineId, taskId, promiseId, ... }
  payload jsonb not null,
  -- LLM-phrased one-liner in Ru's voice. Always present (phraser is part of
  -- the pipeline). May be regenerated if user changes anticipation_level.
  message text not null,
  -- 0..1 confidence from the detector that this is worth surfacing.
  confidence real not null check (confidence >= 0 and confidence <= 1),
  priority suggestion_priority not null default 'soft',
  status suggestion_status not null default 'pending',

  -- Scheduling
  show_at timestamptz not null,    -- earliest time to surface
  expires_at timestamptz,           -- after this, janitor moves to 'expired'
  snooze_until timestamptz,         -- if snoozed, defer until

  -- Lifecycle
  created_at timestamptz not null default now(),
  shown_at timestamptz,
  acted_at timestamptz,
  dismissed_at timestamptz,

  -- Dedup: prevents the same routine from generating overlapping suggestions
  -- within the same window. Format: e.g. "routine:<routineId>:2026-05-22"
  -- or "task:<taskId>:urgent". Unique with type + user, while alive.
  dedup_key text not null,

  -- Which surfaces actually showed it (set when the surface marks it shown).
  surfaced_briefing boolean not null default false,
  surfaced_toast boolean not null default false,
  surfaced_push boolean not null default false
);

create unique index idx_suggestions_dedup_alive
  on suggestions (user_id, type, dedup_key)
  where status in ('pending', 'shown', 'snoozed');

create index idx_suggestions_user_pending
  on suggestions (user_id, show_at)
  where status = 'pending';

create index idx_suggestions_user_status_created
  on suggestions (user_id, status, created_at desc);

create index idx_suggestions_show_at_priority
  on suggestions (show_at, priority)
  where status = 'pending';

alter table suggestions enable row level security;
create policy suggestions_owner on suggestions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. promises: extracted by enrichment, consumed by promise-followup detector
create table promises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  -- Free-text description of what was promised: "call mom", "finish OChem
  -- reading", "draft the proposal". Kept short — full context lives in
  -- source_message_id.
  subject text not null,
  -- When the user made the promise.
  promised_at timestamptz not null,
  -- Their stated deadline. NULL when the user said something approximate
  -- like "this week" — the detector applies a default lookout window.
  due_by timestamptz,
  -- Resolution: did the user follow through? Heuristics that flip this to
  -- true: matching activity_log entry, matching completed task, explicit
  -- mention in chat ("I did X yesterday").
  resolved boolean not null default false,
  resolved_at timestamptz,
  source_message_id uuid references messages on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_promises_user_unresolved
  on promises (user_id, due_by)
  where resolved = false;

alter table promises enable row level security;
create policy promises_owner on promises
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. suggestion_actions: every event on a suggestion → suppression learning
create table suggestion_actions (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references suggestions on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  action text not null,           -- 'shown' | 'acted' | 'dismissed' | 'snoozed'
  surface text,                   -- 'briefing' | 'toast' | 'push'
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_suggestion_actions_user_created
  on suggestion_actions (user_id, created_at desc);

create index idx_suggestion_actions_type_action
  on suggestion_actions (user_id, action, created_at desc);

alter table suggestion_actions enable row level security;
create policy suggestion_actions_owner on suggestion_actions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4. profiles.anticipation_level
alter table profiles
  add column if not exists anticipation_level anticipation_level_type
  not null default 'balanced';
