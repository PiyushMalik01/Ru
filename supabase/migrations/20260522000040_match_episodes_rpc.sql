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
