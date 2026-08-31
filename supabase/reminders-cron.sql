-- Condo Board — schedule the daily reminder emails.
--
-- Run this in the Supabase SQL Editor AFTER deploying the send-reminders
-- Edge Function (see README.md, "Reminder emails").
--
-- Replace the two placeholders first:
--   YOUR_PROJECT_REF — the part before .supabase.co in your project URL
--   YOUR_ANON_KEY    — the same anon key you put in config.js
--
-- The schedule below is 13:00 UTC = 9:00 AM Eastern (8 AM during standard
-- time). Adjust the cron expression if you want a different hour.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'condo-board-daily-reminders',
  '0 13 * * *',
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
--   select cron.unschedule('condo-board-daily-reminders');  -- turn it off
