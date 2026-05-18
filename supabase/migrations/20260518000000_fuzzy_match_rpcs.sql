-- Fuzzy match against user's active routines
create or replace function public.match_active_routine(
  p_user_id uuid,
  p_query text,
  p_threshold float default 0.3
) returns table(id uuid, title text, score float)
language sql stable security definer as $$
  select r.id, r.title, similarity(r.title, p_query) as score
  from routines r
  where r.user_id = p_user_id
    and r.is_active = true
    and similarity(r.title, p_query) > p_threshold
  order by score desc
  limit 3;
$$;

revoke all on function public.match_active_routine(uuid, text, float) from public;
grant execute on function public.match_active_routine(uuid, text, float) to authenticated;

-- Fuzzy match against user's pending tasks
create or replace function public.match_pending_task(
  p_user_id uuid,
  p_query text,
  p_threshold float default 0.3
) returns table(id uuid, title text, score float)
language sql stable security definer as $$
  select t.id, t.title, similarity(t.title, p_query) as score
  from tasks t
  where t.user_id = p_user_id
    and t.status in ('pending', 'in_progress')
    and similarity(t.title, p_query) > p_threshold
  order by score desc
  limit 3;
$$;

revoke all on function public.match_pending_task(uuid, text, float) from public;
grant execute on function public.match_pending_task(uuid, text, float) to authenticated;
