-- Add archived_at to tasks and reminders so the daily archive-stale cron can
-- soft-delete items that have aged out (completed long ago, dismissed, missed
-- and ancient). All default queries filter archived_at IS NULL so archived
-- items disappear from Today, Sheet, Plan, AI context, and detectors without
-- losing the data.

alter table tasks add column if not exists archived_at timestamptz;
alter table reminders add column if not exists archived_at timestamptz;

-- Partial indexes — most queries scope to non-archived rows, so make the
-- common path cheap.
create index if not exists idx_tasks_user_active
  on tasks (user_id, status, due_at)
  where archived_at is null;

create index if not exists idx_reminders_user_active
  on reminders (user_id, remind_at)
  where archived_at is null;

-- Index on archived_at lets the janitor cron find old archived rows for
-- eventual hard delete.
create index if not exists idx_tasks_archived_at
  on tasks (archived_at)
  where archived_at is not null;

create index if not exists idx_reminders_archived_at
  on reminders (archived_at)
  where archived_at is not null;
