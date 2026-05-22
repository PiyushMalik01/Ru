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
