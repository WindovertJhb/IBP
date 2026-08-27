-- Windovert Installation Booking Program (IBP) — initial schema
--
-- Run this once in the SQL editor of a fresh Windovert-owned Supabase project
-- (Dashboard → SQL Editor → New query → paste → Run).
--
-- This intentionally does not try to migrate data from the old BrianTool
-- Supabase project — see supabase/seed.sql for re-entering the current
-- short list of teams/people/products by hand.

create extension if not exists pgcrypto;

-- ---------- people ----------
-- Installers/fitters, sales reps, admin staff. Team leads, booking crew,
-- and the booking salesperson all reference this one table.

create table people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null default 'fitter' check (role in ('fitter', 'sales', 'admin', 'other')),
  phone text,
  created_at timestamptz not null default now()
);

-- ---------- teams ----------

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  team_lead_id uuid references people(id) on delete set null,
  member_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------- products ----------

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sub_type text,
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
  job_type text not null default 'other' check (job_type in ('measure', 'install', 'service', 'other', 'transit')),
  notes text,
  address text,
  client_phone text,
  client_email text,
  order_numbers text,
  crew uuid[] not null default '{}',
  products jsonb not null default '[]',
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

-- ---------- Row Level Security ----------
-- The anon key is safe to publish (it's a publishable key), but only
-- because RLS is the real access control here. The app gates its UI with
-- Supabase Auth (email/password) — mirror that at the database level so a
-- copied anon key alone can't read or write anything.

alter table people enable row level security;
alter table teams enable row level security;
alter table products enable row level security;
alter table bookings enable row level security;

-- RLS policies only decide which rows a role can see once it's already
-- allowed to touch the table at all — that base permission is a separate
-- grant. Supabase's project defaults normally cover this for new tables,
-- but we grant explicitly rather than depend on that.
grant usage on schema public to authenticated;
grant select, insert, update, delete on people, teams, products, bookings to authenticated;

-- Scope policies to the `authenticated` Postgres role (`to authenticated`)
-- rather than comparing auth.role() inside USING/WITH CHECK. PostgREST
-- sets the execution role directly from the presented session JWT, so this
-- is the reliable form — see Supabase's RLS docs. `using (true)` is safe
-- here because the `to authenticated` scoping already excludes the `anon`
-- role entirely; anon requests simply match no policy and are denied.

create policy "authenticated full access" on people
  for all to authenticated using (true) with check (true);

create policy "authenticated full access" on teams
  for all to authenticated using (true) with check (true);

create policy "authenticated full access" on products
  for all to authenticated using (true) with check (true);

create policy "authenticated full access" on bookings
  for all to authenticated using (true) with check (true);
