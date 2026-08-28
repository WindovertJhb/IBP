-- Windovert Installation Booking Program (IBP) — initial schema
--
-- Run this once in the SQL editor of a fresh Windovert-owned Supabase project
-- (Dashboard → SQL Editor → New query → paste → Run).
--
-- This intentionally does not try to migrate data from the old BrianTool
-- Supabase project — see supabase/seed.sql for re-entering the current
-- short list of teams/salespeople by hand.

create extension if not exists pgcrypto;

-- ---------- people ----------
-- Salespeople only — every row the app creates has role 'sales'. The
-- role column and its other values are legacy from when this table also
-- covered fitters/admin/other (team membership and per-job crew
-- assignment, both since removed); left in place rather than narrowed to
-- a hard 'sales' constraint so old non-sales rows aren't rejected.

create table people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null default 'fitter' check (role in ('fitter', 'sales', 'admin', 'other')),
  phone text,
  created_at timestamptz not null default now()
);

-- ---------- teams ----------
-- Just a name. Bookings reference a team by id to place it on the
-- schedule's columns.

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- ---------- statuses ----------
-- User-managed booking lifecycle stages (e.g. "Pre-Programmed",
-- "Date Confirmed"), each with a colour shown on the schedule grid.
-- Fully editable from the Status tab — nothing is hardcoded in the app.

create table statuses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#0d6efd',
  created_at timestamptz not null default now()
);

-- ---------- bookings ----------

create table bookings (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  team_id uuid not null references teams(id) on delete cascade,
  start_time time not null,
  duration_hours numeric(4, 2) not null default 1.5,
  customer_name text,
  status_id uuid references statuses(id) on delete set null,
  notes text,
  address text,
  client_phone text,
  client_email text,
  order_numbers text,
  products_arrived boolean not null default false,
  salesperson_id uuid references people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bookings_date_idx on bookings (date);
create index bookings_team_id_idx on bookings (team_id);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger bookings_set_updated_at
  before update on bookings
  for each row
  execute function set_updated_at();

-- ---------- profiles / user roles ----------
-- One row per login user (created via Supabase Dashboard → Authentication
-- → Users — this app has no self-service signup). 'editor' can create,
-- edit, and delete; 'viewer' can only read. New users default to
-- 'viewer' — the safer default — flip someone to 'editor' with:
--   update profiles set role = 'editor'
--   where id = (select id from auth.users where email = 'person@example.com');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now()
);

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

-- ---------- Row Level Security ----------
-- The anon key is safe to publish (it's a publishable key), but only
-- because RLS is the real access control here. The app gates its UI with
-- Supabase Auth (email/password) — mirror that at the database level so a
-- copied anon key alone can't read or write anything. Every signed-in user
-- can read; only 'editor' profiles can write — see is_editor() above.

alter table profiles enable row level security;
alter table people enable row level security;
alter table teams enable row level security;
alter table statuses enable row level security;
alter table bookings enable row level security;

-- RLS policies only decide which rows a role can see once it's already
-- allowed to touch the table at all — that base permission is a separate
-- grant. Supabase's project defaults normally cover this for new tables,
-- but we grant explicitly rather than depend on that.
grant usage on schema public to authenticated;
grant select, insert, update, delete on people, teams, statuses, bookings to authenticated;
grant select on profiles to authenticated;

-- Scope policies to the `authenticated` Postgres role (`to authenticated`)
-- rather than comparing auth.role() inside USING/WITH CHECK. PostgREST
-- sets the execution role directly from the presented session JWT, so this
-- is the reliable form — see Supabase's RLS docs.

-- profiles: everyone signed in can read (needed so the UI can tell who's
-- an editor), but there's deliberately no insert/update/delete policy for
-- regular users — that's default-deny, so a viewer can't just grant
-- themselves editor. Only the trigger above (which runs as its owner, not
-- as the "authenticated" role) or a direct SQL-editor change can write it.
create policy "authenticated read profiles" on profiles
  for select to authenticated using (true);

create policy "authenticated read people" on people
  for select to authenticated using (true);
create policy "editors write people" on people
  for insert to authenticated with check (is_editor());
create policy "editors update people" on people
  for update to authenticated using (is_editor()) with check (is_editor());
create policy "editors delete people" on people
  for delete to authenticated using (is_editor());

create policy "authenticated read teams" on teams
  for select to authenticated using (true);
create policy "editors write teams" on teams
  for insert to authenticated with check (is_editor());
create policy "editors update teams" on teams
  for update to authenticated using (is_editor()) with check (is_editor());
create policy "editors delete teams" on teams
  for delete to authenticated using (is_editor());

create policy "authenticated read statuses" on statuses
  for select to authenticated using (true);
create policy "editors write statuses" on statuses
  for insert to authenticated with check (is_editor());
create policy "editors update statuses" on statuses
  for update to authenticated using (is_editor()) with check (is_editor());
create policy "editors delete statuses" on statuses
  for delete to authenticated using (is_editor());

create policy "authenticated read bookings" on bookings
  for select to authenticated using (true);
create policy "editors write bookings" on bookings
  for insert to authenticated with check (is_editor());
create policy "editors update bookings" on bookings
  for update to authenticated using (is_editor()) with check (is_editor());
create policy "editors delete bookings" on bookings
  for delete to authenticated using (is_editor());
