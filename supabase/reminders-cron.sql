-- 372 12th board tracker. Schedule the reminder emails.
--
-- Run this in the Supabase SQL Editor after deploying the send-reminders
-- Edge Function (see README.md, "Emails"). Not a migration, because it holds
-- the project ref and the anon key.
--
-- The job runs every hour. The function works out the hour in New York and
-- decides what, if anything, goes out: the monthly summary and due notices
-- at 9AM, and each schedule's reminders at the hour set on that schedule.
-- Running it hourly is what keeps 7AM at 7AM through daylight saving time.
--
-- Running this file again replaces the old daily job.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobname) from cron.job
 where jobname in ('condo-board-daily-reminders', 'condo-board-hourly-reminders');

select cron.schedule(
  'condo-board-hourly-reminders',
  '0 * * * *',
  $$
  select net.http_post(
    url     := 'https://wnmvehzatnclhogihlnx.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndubXZlaHphdG5jbGhvZ2lobG54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxNDQ3ODMsImV4cCI6MjEwMzcyMDc4M30.H_sdBIfaOiF5V0IdCl_e_nB2i1rH_TTHBAXIsil54As'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Useful later:
--   select * from cron.job;                      -- list scheduled jobs
--   select cron.unschedule('condo-board-hourly-reminders');  -- turn it off
