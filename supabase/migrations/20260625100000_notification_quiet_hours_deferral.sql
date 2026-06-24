-- Quiet-hours catch-up: notifications that fire during the user's quiet
-- window get inserted in-app immediately (silent, visible only if they
-- check the inbox), but push/email are deferred until the window ends.
-- A flush cron walks `deferred_until <= now()` and fires the originally
-- requested channels recorded in `deferred_channels`.

alter table notifications
  add column if not exists deferred_until timestamptz,
  add column if not exists deferred_channels jsonb;

create index if not exists idx_notifications_deferred
  on notifications (deferred_until)
  where deferred_until is not null;
