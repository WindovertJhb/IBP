-- Adds the editable Status tab (replacing the old fixed Job Type list) and
-- the "products arrived in store" checkbox/badge to an existing project.
--
-- Run this once in the SQL editor. Idempotent — safe to run more than
-- once. New projects created from the current schema.sql already have
-- this. The old bookings.job_type column is left in place, unused —
-- nothing reads or writes it anymore, harmless to leave alone.

create table if not exists statuses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#0d6efd',
  created_at timestamptz not null default now()
);

alter table statuses enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on statuses to authenticated;

drop policy if exists "authenticated full access" on statuses;
create policy "authenticated full access" on statuses
  for all to authenticated using (true) with check (true);

alter table bookings add column if not exists status_id uuid references statuses(id) on delete set null;
alter table bookings add column if not exists products_arrived boolean not null default false;

-- Starter statuses per the brief — edit/add more anytime from the Status tab.
insert into statuses (name, color)
select 'Pre-Programmed', '#0d6efd'
where not exists (select 1 from statuses where name = 'Pre-Programmed');

insert into statuses (name, color)
select 'Date Confirmed', '#198754'
where not exists (select 1 from statuses where name = 'Date Confirmed');
