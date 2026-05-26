-- ---------------------------------------------------------------------------
-- Notifications + Google integrations (Gmail + Calendar)
-- ---------------------------------------------------------------------------
-- A single migration that adds:
--   1. notifications        — the in-app inbox row store
--   2. profiles.* columns   — notification preferences (channels, quiet hours,
--                              daily digest, override notification email)
--   3. google_integrations  — encrypted OAuth tokens + per-feature toggles
--   4. extracted_items      — gmail-derived suggestions awaiting user review
--   5. calendar_events      — denormalized cache of upcoming events (read path
--                              is cheap; sync writes here on cron)
--   6. notification_kind, channel enums
-- ---------------------------------------------------------------------------

-- 0. Enums --------------------------------------------------------------------

create type notification_kind as enum (
  'reminder_due',
  'task_due_soon',
  'task_overdue',
  'routine_missed',
  'streak_milestone',
  'plan_deadline',
  'daily_digest',
  'suggestion_urgent',
  'gmail_extracted',
  'calendar_event_soon',
  'system'
);

create type notification_channel as enum ('in_app', 'push', 'email');

create type extraction_kind as enum (
  'task',
  'reminder',
  'event',
  'activity',
  'note'
);

create type extraction_status as enum (
  'pending',     -- waiting for user review
  'accepted',    -- user accepted; downstream row created
  'rejected',    -- user dismissed
  'auto'         -- auto-accepted (high confidence + setting on)
);

-- 1. notifications ------------------------------------------------------------
-- Inbox row. One row per notification regardless of how many channels fired.
-- The `channels` jsonb records which channels actually delivered (in_app is
-- always true since the row IS the in-app delivery).

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  kind notification_kind not null,
  title text not null,
  body text,
  url text,                                    -- where clicking takes you
  entity_kind text,                            -- 'task' | 'reminder' | 'routine' | 'plan' | 'extracted'
  entity_id uuid,
  channels jsonb not null default '{"in_app": true}',
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_user_created
  on notifications (user_id, created_at desc);

create index idx_notifications_user_unread
  on notifications (user_id, created_at desc)
  where read_at is null and archived_at is null;

alter table notifications enable row level security;
create policy notifications_owner on notifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. Profile columns for notification preferences ----------------------------

alter table profiles
  add column if not exists notify_email_enabled boolean not null default true,
  add column if not exists notify_push_enabled boolean not null default true,
  add column if not exists notify_inapp_enabled boolean not null default true,
  -- Quiet hours: integer hours 0..23 in user's local tz. NULLs mean "no quiet
  -- hours". If both set and start > end, treats range as overnight.
  add column if not exists notify_quiet_start smallint check (notify_quiet_start between 0 and 23),
  add column if not exists notify_quiet_end smallint check (notify_quiet_end between 0 and 23),
  -- Daily digest: morning briefing email at this local hour (0..23).
  add column if not exists notify_digest_enabled boolean not null default false,
  add column if not exists notify_digest_hour smallint not null default 8 check (notify_digest_hour between 0 and 23),
  -- Override email for notifications (default: use auth email).
  add column if not exists notify_email_address text;

-- 3. google_integrations ------------------------------------------------------
-- One row per user. Tokens are encrypted via lib/crypto AES-GCM. The two
-- feature flags drive whether the inngest crons sync that surface.

create table google_integrations (
  user_id uuid primary key references profiles on delete cascade,
  email text,                                  -- the google account email
  scopes text[] not null default '{}',
  access_token_enc text not null,
  refresh_token_enc text,
  expires_at timestamptz,
  -- per-feature toggles
  gmail_extraction_enabled boolean not null default true,
  calendar_sync_enabled boolean not null default true,
  -- Gmail incremental sync cursor (history.list startHistoryId)
  gmail_history_id text,
  last_gmail_sync_at timestamptz,
  last_calendar_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table google_integrations enable row level security;
-- Users can read their own row to check connection status, but writes go
-- through the service role (since they involve decrypted tokens).
create policy google_integrations_self_read on google_integrations
  for select using (auth.uid() = user_id);
create policy google_integrations_self_delete on google_integrations
  for delete using (auth.uid() = user_id);

-- 4. extracted_items ----------------------------------------------------------
-- Gmail (and later: other sources) extractor stages suggestions here. User
-- reviews in /inbox/extracted and accepts → we create the downstream task /
-- reminder / event row, or rejects → row is kept as a no-go example.

create table extracted_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  source text not null,                        -- 'gmail' for now
  source_ref text,                             -- gmail message id
  suggested_kind extraction_kind not null,
  suggested_payload jsonb not null,            -- { title, due_at, body, ... }
  confidence real not null default 0.7 check (confidence >= 0 and confidence <= 1),
  preview_from text,                           -- "Sarah <s@example.com>"
  preview_subject text,
  preview_snippet text,
  status extraction_status not null default 'pending',
  created_entity_kind text,                    -- once accepted: 'task' | 'reminder' | ...
  created_entity_id uuid,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  -- Dedup: same gmail message shouldn't produce duplicate items
  unique (user_id, source, source_ref, suggested_kind)
);

create index idx_extracted_user_pending
  on extracted_items (user_id, created_at desc)
  where status = 'pending';

alter table extracted_items enable row level security;
create policy extracted_items_owner on extracted_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 5. calendar_events ----------------------------------------------------------
-- Denormalized cache. The calendar sync cron upserts here; the Today/Sheet
-- timeline reads from here (so the surface is fast and works offline-from-google).

create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  google_event_id text not null,
  calendar_id text not null default 'primary',
  title text not null,
  description text,
  location text,
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default false,
  status text,                                 -- 'confirmed' | 'tentative' | 'cancelled'
  html_link text,
  -- If this event was created by Ru (mirrored from a task) we store the task
  -- id here so we can keep them in sync and avoid round-trip duplication.
  source_task_id uuid references tasks on delete set null,
  updated_at timestamptz not null default now(),
  fetched_at timestamptz not null default now(),
  unique (user_id, google_event_id)
);

create index idx_calendar_events_user_start
  on calendar_events (user_id, start_at);

alter table calendar_events enable row level security;
create policy calendar_events_owner on calendar_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 6. tasks.calendar_event_id for two-way sync --------------------------------
-- When a task with a due_at is pushed to Google Calendar, we record the id
-- so subsequent edits update rather than duplicate.

alter table tasks
  add column if not exists calendar_event_id text;
