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
