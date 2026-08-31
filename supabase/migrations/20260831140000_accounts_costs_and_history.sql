-- 372 12th board tracker. Accounts, costs, and project history.
--
-- Adds what a real board needs beyond a to-do list:
--   * building accounts and city portals (DEP, ConEd, DOB, FDNY, HPD)
--   * what a project costs and when it was last done
--   * vendor contract costs, and whether a vendor is contracted or only
--     recommended
--   * multi-year recurrence, because the FDNY sprinkler test runs on a
--     five-year cycle and the property insurance on a three-year term

-- Board members
alter table board_members add column if not exists apartment text;

-- Responsibilities
alter table responsibilities add column if not exists estimated_cost numeric(12,2);
alter table responsibilities add column if not exists last_completed_on date;

comment on column responsibilities.last_completed_on is
  'When this was last done, including history from before this tracker existed.';

alter table responsibilities drop constraint if exists responsibilities_recurrence_check;
alter table responsibilities add constraint responsibilities_recurrence_check
  check (recurrence in ('none','monthly','quarterly','semiannual','annual',
                        'biennial','three_year','five_year'));

-- Vendors
alter table vendors add column if not exists status text not null default 'contracted';
alter table vendors drop constraint if exists vendors_status_check;
alter table vendors add constraint vendors_status_check
  check (status in ('contracted','recommended','past'));

alter table vendors add column if not exists cost numeric(12,2);
alter table vendors add column if not exists cost_period text;

comment on column vendors.status is
  'contracted means currently engaged, recommended means suggested but not hired, past means no longer used.';
comment on column vendors.cost_period is
  'Free text such as monthly, annual, 3-year, or per visit.';

-- Accounts.
-- Utility accounts, city portals, and logins. There is deliberately no
-- password column. Anyone who has the site URL can read this database, so
-- passwords belong in the board password manager instead.
create table if not exists accounts (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  category        text,          -- Utilities, City portal, Financial, Building systems
  account_number  text,
  portal_url      text,
  username        text,
  notes           text,
  created_at      timestamptz not null default now()
);

comment on table accounts is
  'Building accounts and city portals. Usernames and account numbers belong here. Passwords belong in the board password manager.';

alter table links add column if not exists account_id uuid references accounts(id) on delete cascade;
create index if not exists idx_links_account on links (account_id);

alter table accounts enable row level security;
drop policy if exists "open access" on accounts;
create policy "open access" on accounts
  for all to anon, authenticated using (true) with check (true);
