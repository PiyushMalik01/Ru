-- Track when an assistant message was truncated by voice barge-in.
-- The DB content reflects only what was actually played to the user.
alter table public.messages
  add column if not exists truncated_at timestamptz;
