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
