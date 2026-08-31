-- Condo Board — initial schema.
--
-- Tables for board members, vendors, responsibilities, and the links
-- (contracts, documents, portals) that hang off responsibilities or vendors.

create table if not exists board_members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  position    text,           -- President, Treasurer, Secretary…
  email       text,           -- reminder emails are sent here
  phone       text,
  created_at  timestamptz not null default now()
);

create table if not exists vendors (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  service       text,         -- e.g. "Elevator maintenance"
  contact_name  text,
  email         text,
  phone         text,
  website       text,
  notes         text,
  created_at    timestamptz not null default now()
);

create table if not exists responsibilities (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  description       text,
  category          text not null default 'Other',
  status            text not null default 'open'
                    check (status in ('open','in_progress','done')),
  priority          text not null default 'normal'
                    check (priority in ('low','normal','high')),
  due_date          date,
  recurrence        text not null default 'none'
                    check (recurrence in ('none','monthly','quarterly','semiannual','annual')),
  assignee_id       uuid references board_members(id) on delete set null,
  vendor_id         uuid references vendors(id) on delete set null,
  completed_at      timestamptz,
  last_reminded_at  timestamptz,   -- used by the reminder emailer
  created_at        timestamptz not null default now()
);

-- A link belongs to either a responsibility or a vendor.
create table if not exists links (
  id                 uuid primary key default gen_random_uuid(),
  title              text,
  url                text not null,
  kind               text not null default 'link'
                     check (kind in ('link','contract','document','website')),
  responsibility_id  uuid references responsibilities(id) on delete cascade,
  vendor_id          uuid references vendors(id) on delete cascade,
  created_at         timestamptz not null default now()
);

create index if not exists idx_resp_due on responsibilities (due_date) where status <> 'done';
create index if not exists idx_links_resp on links (responsibility_id);
create index if not exists idx_links_vendor on links (vendor_id);

-- ============ Row Level Security ============
-- The site has no per-person login: it is protected by one shared password
-- enforced in the browser, so every request reaches Postgres as the "anon"
-- role. These policies deliberately allow anon to read and write.
--
-- If sign-in is ever added, narrow these to "authenticated" only.

alter table board_members    enable row level security;
alter table vendors          enable row level security;
alter table responsibilities enable row level security;
alter table links            enable row level security;

do $$
declare t text;
begin
  foreach t in array array['board_members','vendors','responsibilities','links'] loop
    execute format('drop policy if exists "open access" on %I', t);
    execute format(
      'create policy "open access" on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;
