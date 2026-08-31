-- Automatically deletes bookings older than 3 months, once a day, so the
-- database doesn't grow forever with completed jobs.
--
-- Run this once in the SQL editor. Idempotent — safe to run more than
-- once (re-running just re-registers the same schedule).
--
-- Uses pg_cron, a Postgres extension Supabase supports directly — the
-- job runs inside the database itself on its own schedule, no external
-- service or secret keys involved. It runs as the database owner, which
-- bypasses RLS entirely (as expected for a maintenance job) — it deletes
-- regardless of who, if anyone, is signed into the app at the time.
--
-- Only `bookings` rows are touched, and only ones whose `date` is more
-- than 3 months in the past. Nothing else in the schema is affected.

create extension if not exists pg_cron;

select cron.unschedule('delete-old-bookings')
where exists (select 1 from cron.job where jobname = 'delete-old-bookings');

select cron.schedule(
  'delete-old-bookings',
  '0 3 * * *', -- every day at 03:00 UTC
  $$ delete from bookings where date < (current_date - interval '3 months') $$
);

-- ---------- Useful queries for later ----------

-- See the scheduled job (should show one row named 'delete-old-bookings'):
--   select * from cron.job;

-- See its run history (each night's run, success/failure):
--   select * from cron.job_run_details order by start_time desc limit 20;

-- To change the cutoff (e.g. to 6 months) or the schedule, just edit the
-- interval/cron expression above and re-run this whole file — the
-- unschedule step above means it's safe to run again.

-- To stop the automatic cleanup entirely:
--   select cron.unschedule('delete-old-bookings');
