-- Reminder settings, editable from the Settings tab on the site.
--
-- One row, always id = 1. The reminder function reads this row on every run
-- and does nothing at all unless reminders_enabled is true, so scheduling the
-- daily cron job is safe before the board is ready to receive anything.
--
-- The Resend API key is NOT stored here. It stays a Supabase secret, because
-- this table is readable by anyone who can reach the site.

create table if not exists reminder_settings (
  id                  int primary key default 1 check (id = 1),
  reminders_enabled   boolean not null default false,

  -- How often the reminder email goes out.
  frequency           text not null default 'weekly'
                      check (frequency in ('daily','weekdays','weekly','monthly')),
  -- Used when frequency is 'weekly'. 0 is Sunday through 6 is Saturday.
  send_weekday        int not null default 1 check (send_weekday between 0 and 6),
  -- Used when frequency is 'monthly'. Capped at 28 so every month has the day.
  send_day_of_month   int not null default 1 check (send_day_of_month between 1 and 28),

  -- How far ahead to look, and how long before an item may be mentioned again.
  days_ahead          int not null default 14 check (days_ahead between 1 and 365),
  cooldown_days       int not null default 3 check (cooldown_days between 0 and 90),

  -- 'digest' sends one grouped email to digest_email.
  -- 'per_person' emails each member their own items and needs a verified
  -- domain in Resend.
  delivery_mode       text not null default 'digest'
                      check (delivery_mode in ('digest','per_person')),
  digest_email        text,

  last_sent_at        timestamptz,
  updated_at          timestamptz not null default now()
);

comment on table reminder_settings is
  'Single row, id = 1. Controls the daily reminder function. Never store the Resend API key here.';

insert into reminder_settings (id) values (1) on conflict (id) do nothing;

alter table reminder_settings enable row level security;
drop policy if exists "open access" on reminder_settings;
create policy "open access" on reminder_settings
  for all to anon, authenticated using (true) with check (true);
