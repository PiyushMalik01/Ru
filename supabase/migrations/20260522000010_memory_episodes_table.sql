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
