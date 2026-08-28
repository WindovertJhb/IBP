-- Adds read-only vs editing users to an existing project.
--
-- Run this once in the SQL editor. Idempotent — safe to run more than
-- once. New projects created from the current schema.sql already have
-- this.
--
-- Every existing login user is backfilled as 'editor' (preserving what
-- they can already do today). Any NEW user created after this runs
-- defaults to 'viewer' — the safer default. To make someone an editor:
--
--   update profiles set role = 'editor'
--   where id = (select id from auth.users where email = 'person@example.com');

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now()
);

-- Backfill: everyone who can already sign in today keeps full access.
insert into profiles (id, role)
select id, 'editor' from auth.users
on conflict (id) do nothing;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role) values (new.id, 'viewer');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create or replace function is_editor()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'editor'
  );
$$;

alter table profiles enable row level security;
grant usage on schema public to authenticated;
grant select on profiles to authenticated;

drop policy if exists "authenticated read profiles" on profiles;
create policy "authenticated read profiles" on profiles
  for select to authenticated using (true);

-- Replace the old "full access to any signed-in user" policy on each
-- table with read-for-everyone, write-for-editors-only.

drop policy if exists "authenticated full access" on people;
create policy "authenticated read people" on people
  for select to authenticated using (true);
create policy "editors write people" on people
  for insert to authenticated with check (is_editor());
create policy "editors update people" on people
  for update to authenticated using (is_editor()) with check (is_editor());
create policy "editors delete people" on people
  for delete to authenticated using (is_editor());

drop policy if exists "authenticated full access" on teams;
create policy "authenticated read teams" on teams
  for select to authenticated using (true);
create policy "editors write teams" on teams
  for insert to authenticated with check (is_editor());
create policy "editors update teams" on teams
  for update to authenticated using (is_editor()) with check (is_editor());
create policy "editors delete teams" on teams
  for delete to authenticated using (is_editor());

drop policy if exists "authenticated full access" on statuses;
create policy "authenticated read statuses" on statuses
  for select to authenticated using (true);
create policy "editors write statuses" on statuses
  for insert to authenticated with check (is_editor());
create policy "editors update statuses" on statuses
  for update to authenticated using (is_editor()) with check (is_editor());
create policy "editors delete statuses" on statuses
  for delete to authenticated using (is_editor());

drop policy if exists "authenticated full access" on bookings;
create policy "authenticated read bookings" on bookings
  for select to authenticated using (true);
create policy "editors write bookings" on bookings
  for insert to authenticated with check (is_editor());
create policy "editors update bookings" on bookings
  for update to authenticated using (is_editor()) with check (is_editor());
create policy "editors delete bookings" on bookings
  for delete to authenticated using (is_editor());
