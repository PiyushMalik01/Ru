-- Mobile push tokens (APNs via FCM on iOS, FCM on Android).
--
-- One row per (user, platform). Re-installs and OS reboots that mint a
-- new device token transparently replace the prior row via the upsert
-- from the mobile client. The platform column doubles as a discriminator
-- for the fan-out sender (different FCM message shape per platform).

create table if not exists public.mobile_push_tokens (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  platform    text not null check (platform in ('ios', 'android')),
  token       text not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, platform)
);

create index if not exists mobile_push_tokens_token_idx
  on public.mobile_push_tokens(token);

alter table public.mobile_push_tokens enable row level security;

-- Users own their rows. The web's mobile-push send endpoint runs as the
-- service role and bypasses RLS anyway, so this is just the standard
-- defense-in-depth for client reads.
create policy "self read" on public.mobile_push_tokens
  for select using (auth.uid() = user_id);
create policy "self upsert" on public.mobile_push_tokens
  for insert with check (auth.uid() = user_id);
create policy "self update" on public.mobile_push_tokens
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "self delete" on public.mobile_push_tokens
  for delete using (auth.uid() = user_id);
