-- 372 12th board tracker. Account passwords.
--
-- Passwords live in their own table with row level security on and no
-- policy at all, so the anon key can never read or write them, even before
-- supabase/lockdown.sql has run. The site reaches this table only through
-- the Cloudflare Pages proxy, which checks the Cloudflare Access login and
-- uses the service key. Never add a policy for anon here.

create table if not exists account_secrets (
  account_id  uuid primary key references accounts(id) on delete cascade,
  password    text,
  updated_at  timestamptz not null default now()
);
alter table account_secrets enable row level security;
revoke all on account_secrets from anon, authenticated;

comment on table account_secrets is
  'Account passwords. No anon access, ever. Reached only through the Access protected proxy.';
comment on table accounts is
  'Building accounts and city portals. Passwords are in account_secrets, never in this table.';
