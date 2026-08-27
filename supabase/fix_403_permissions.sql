-- Fix: 403 on people/products/teams/bookings reads after a successful sign-in.
--
-- Run this once in the SQL editor of an existing project that was
-- provisioned from an earlier copy of schema.sql. It's idempotent — safe
-- to run more than once.
--
-- Root cause: the original RLS policies tested `auth.role() = 'authenticated'`
-- inside USING/WITH CHECK. That depends on parsing the JWT-claims GUC
-- PostgREST sets per request, and can evaluate false even for a genuinely
-- signed-in session — Supabase's current guidance is to scope policies to
-- the `authenticated` Postgres role directly instead. A plain SELECT
-- returning an actual 403 (rather than an empty array) also points at a
-- missing base table grant: Postgres reports that as 42501
-- permission-denied, which PostgREST maps straight to HTTP 403, before RLS
-- row-filtering even runs. This script fixes both.

grant usage on schema public to authenticated;
grant select, insert, update, delete on people, teams, products, bookings to authenticated;

drop policy if exists "authenticated full access" on people;
drop policy if exists "authenticated full access" on teams;
drop policy if exists "authenticated full access" on products;
drop policy if exists "authenticated full access" on bookings;

create policy "authenticated full access" on people
  for all to authenticated using (true) with check (true);

create policy "authenticated full access" on teams
  for all to authenticated using (true) with check (true);

create policy "authenticated full access" on products
  for all to authenticated using (true) with check (true);

create policy "authenticated full access" on bookings
  for all to authenticated using (true) with check (true);
