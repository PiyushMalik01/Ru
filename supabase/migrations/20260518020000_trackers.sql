-- Trackers: user-defined quantitative logs (running, workouts, mood, weight, etc.)
-- Each tracker carries a `fields` JSONB array describing its columns; entries
-- store one JSONB blob keyed by the field's `key`. This lets the user add /
-- remove / rename columns without schema migrations and without breaking
-- historical entries.
--
-- Visual identity (color) is derived deterministically from the tracker id on
-- the client — no manual color picker. The display palette comes from the
-- existing entity tokens (cobalt/lime/coral/magenta/ochre/teal/etc.).

create table trackers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  name text not null,
  description text,
  -- fields = [{ key, label, type: 'number'|'text'|'duration', unit }]
  fields jsonb not null default '[]'::jsonb,
  -- display_config = { chart_type: 'line'|'bar'|'area', primary_field: <key> }
  display_config jsonb not null default '{}'::jsonb,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_trackers_user_active on trackers (user_id, archived, updated_at desc);
create unique index uq_trackers_user_name on trackers (user_id, lower(name)) where archived = false;

create table tracker_entries (
  id uuid primary key default gen_random_uuid(),
  tracker_id uuid not null references trackers on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  -- values = { distance: 5.2, time: 28, ... } — keyed by tracker.fields[].key
  values jsonb not null default '{}'::jsonb,
  notes text,
  entered_at timestamptz not null default now(),
  source_message_id uuid references messages,
  created_at timestamptz not null default now()
);
create index idx_tracker_entries_tracker_date on tracker_entries (tracker_id, entered_at desc);
create index idx_tracker_entries_user_date on tracker_entries (user_id, entered_at desc);

-- Bump trackers.updated_at when entries change so the index reflects activity.
create or replace function touch_tracker_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.trackers
     set updated_at = now()
   where id = coalesce(new.tracker_id, old.tracker_id);
  return coalesce(new, old);
end;
$$;

create trigger trg_tracker_entries_touch
  after insert or update or delete on tracker_entries
  for each row execute function touch_tracker_updated_at();

-- RLS
alter table trackers enable row level security;
alter table tracker_entries enable row level security;

create policy "Users can manage own trackers"
  on trackers for all using (auth.uid() = user_id);

create policy "Users can manage own tracker_entries"
  on tracker_entries for all using (auth.uid() = user_id);
