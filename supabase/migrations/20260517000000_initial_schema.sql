-- Enable pg_trgm for fuzzy matching
create extension if not exists pg_trgm;

-- Custom enum types
create type ai_provider_type as enum ('chatgpt_oauth', 'openai', 'anthropic', 'gemini');
create type message_role as enum ('user', 'assistant');
create type message_intent as enum ('log', 'plan', 'query', 'remind', 'reflect', 'modify', 'declare');
create type input_method_type as enum ('text', 'voice');
create type task_status as enum ('pending', 'in_progress', 'completed', 'missed');
create type task_priority as enum ('low', 'medium', 'high');
create type routine_frequency as enum ('daily', 'weekdays', 'weekly', 'custom');
create type routine_origin as enum ('auto_detected', 'user_declared');
create type nudge_level as enum ('silent', 'gentle', 'active');
create type reminder_status as enum ('pending', 'sent', 'dismissed');

-- 1. profiles
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  timezone text not null default 'UTC',
  onboarding_completed boolean not null default false,
  ai_provider ai_provider_type,
  ai_credentials jsonb,
  push_subscription jsonb,
  preferences jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. messages
create table messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  role message_role not null,
  content text not null,
  intent message_intent,
  metadata jsonb not null default '{}',
  input_method input_method_type not null default 'text',
  created_at timestamptz not null default now()
);
create index idx_messages_user_created on messages (user_id, created_at desc);
create index idx_messages_user_date on messages (user_id, (created_at::date));

-- 3. tasks
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  title text not null,
  description text,
  status task_status not null default 'pending',
  priority task_priority not null default 'medium',
  due_at timestamptz,
  completed_at timestamptz,
  source_message_id uuid references messages,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_tasks_user_status on tasks (user_id, status);
create index idx_tasks_user_due on tasks (user_id, due_at) where due_at is not null;

-- 4. routines
create table routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  title text not null,
  description text,
  frequency routine_frequency not null default 'daily',
  custom_days int[],
  time_of_day time,
  origin routine_origin not null default 'user_declared',
  detection_confidence float not null default 1.0,
  nudge_level nudge_level not null default 'gentle',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_routines_user_active on routines (user_id) where is_active = true;
create index idx_routines_title_trgm on routines using gin (title gin_trgm_ops);

-- 5. routine_logs
create table routine_logs (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references routines on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  logged_date date not null,
  completed boolean not null default true,
  completed_at timestamptz,
  source_message_id uuid references messages,
  notes text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (routine_id, logged_date)
);
create index idx_routine_logs_user_date on routine_logs (user_id, logged_date desc);

-- 6. activity_log
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  activity text not null,
  category text not null default 'general',
  "timestamp" timestamptz not null default now(),
  duration_minutes int,
  sentiment float,
  source_message_id uuid references messages,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index idx_activity_log_user_ts on activity_log (user_id, "timestamp" desc);
create index idx_activity_log_user_date on activity_log (user_id, (("timestamp")::date));
create index idx_activity_log_activity_trgm on activity_log using gin (activity gin_trgm_ops);

-- 7. reminders
create table reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  title text not null,
  remind_at timestamptz not null,
  is_recurring boolean not null default false,
  recurrence_rule text,
  status reminder_status not null default 'pending',
  linked_task_id uuid references tasks,
  linked_routine_id uuid references routines,
  created_at timestamptz not null default now()
);
create index idx_reminders_pending on reminders (remind_at) where status = 'pending';
create index idx_reminders_user on reminders (user_id, status);

-- 8. daily_summaries
create table daily_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  date date not null,
  tasks_completed int not null default 0,
  tasks_created int not null default 0,
  routines_completed int not null default 0,
  routines_total int not null default 0,
  activities_logged int not null default 0,
  avg_sentiment float,
  active_streaks jsonb not null default '{}',
  insights jsonb,
  message_summary text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);
create index idx_daily_summaries_user_date on daily_summaries (user_id, date desc);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on profiles
  for each row execute function update_updated_at();
create trigger set_updated_at before update on tasks
  for each row execute function update_updated_at();
create trigger set_updated_at before update on routines
  for each row execute function update_updated_at();

-- Row Level Security
alter table profiles enable row level security;
alter table messages enable row level security;
alter table tasks enable row level security;
alter table routines enable row level security;
alter table routine_logs enable row level security;
alter table activity_log enable row level security;
alter table reminders enable row level security;
alter table daily_summaries enable row level security;

-- RLS policies
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Users can manage own messages" on messages for all using (auth.uid() = user_id);
create policy "Users can manage own tasks" on tasks for all using (auth.uid() = user_id);
create policy "Users can manage own routines" on routines for all using (auth.uid() = user_id);
create policy "Users can manage own routine_logs" on routine_logs for all using (auth.uid() = user_id);
create policy "Users can manage own activity_log" on activity_log for all using (auth.uid() = user_id);
create policy "Users can manage own reminders" on reminders for all using (auth.uid() = user_id);
create policy "Users can manage own daily_summaries" on daily_summaries for all using (auth.uid() = user_id);
