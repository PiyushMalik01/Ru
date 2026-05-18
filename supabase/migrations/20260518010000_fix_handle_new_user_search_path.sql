-- Fix handle_new_user trigger: it inserted into unqualified `profiles`
-- which failed at signup because SECURITY DEFINER functions don't inherit
-- a search_path. Adding `set search_path = public` + schema-qualifying the
-- target so `auth.users` triggers can find the table.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''));
  return new;
end;
$$;
