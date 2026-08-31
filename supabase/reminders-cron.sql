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
    url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_ANON_KEY'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Useful later:
--   select * from cron.job;                      -- list scheduled jobs
--   select cron.unschedule('condo-board-daily-reminders');  -- turn it off
