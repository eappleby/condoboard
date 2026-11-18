-- 372 12th board tracker. Emails to whoever holds a responsibility.
--
-- A responsibility only sends notices when send_reminders is true, which is
-- off by default because many items need nothing done. Notices go 7 days
-- before the due date, on it, and weekly while it is overdue. The link in
-- each notice carries mute_token and turns send_reminders off.
--
-- notifications_sent records every notice and schedule reminder, so a
-- retried hour never sends the same email twice. Only the email function
-- reads it, so it has no policy for anon.

alter table responsibilities add column if not exists send_reminders boolean not null default false;
alter table responsibilities add column if not exists mute_token uuid not null default gen_random_uuid();
create unique index if not exists idx_responsibilities_mute_token on responsibilities (mute_token);

alter table reminder_settings add column if not exists due_notices_enabled boolean not null default false;
alter table reminder_settings add column if not exists schedule_reminders_enabled boolean not null default false;

create table if not exists notifications_sent (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('due', 'schedule')),
  ref_id      uuid not null,
  recipient   text not null,
  sent_on     date not null,
  created_at  timestamptz not null default now(),
  unique (kind, ref_id, recipient, sent_on)
);
alter table notifications_sent enable row level security;
