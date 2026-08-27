-- Add "products arrived in store" tracking to bookings.
--
-- Run this once in the SQL editor of an existing project that was
-- provisioned before this column existed. It's idempotent — safe to run
-- more than once. New projects created from the current schema.sql already
-- have this column.

alter table bookings
  add column if not exists products_arrived boolean not null default false;
