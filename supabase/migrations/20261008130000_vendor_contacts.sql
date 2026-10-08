-- 372 12th board tracker. Vendor contacts.
--
-- A vendor can have several contacts, each with a name, an email and an
-- optional phone, and one of them marked primary. This replaces the single
-- contact_name, email and phone columns on vendors.

create table if not exists vendor_contacts (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid not null references vendors(id) on delete cascade,
  name        text not null,
  email       text,
  phone       text,
  is_primary  boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_vendor_contacts_vendor on vendor_contacts (vendor_id, position);

alter table vendor_contacts enable row level security;
drop policy if exists "open access" on vendor_contacts;
create policy "open access" on vendor_contacts
  for all to anon, authenticated using (true) with check (true);

-- Carry each vendor's existing contact across as its primary contact. Where
-- no person was named, the vendor's own name stands in. Vendors that
-- already have a contact are left alone, so a replay adds nothing.
insert into vendor_contacts (vendor_id, name, email, phone, is_primary, position)
select v.id, coalesce(nullif(trim(v.contact_name), ''), v.name), v.email, v.phone, true, 0
from vendors v
where (nullif(trim(v.contact_name), '') is not null or v.email is not null or v.phone is not null)
  and not exists (select 1 from vendor_contacts c where c.vendor_id = v.id);

comment on column vendors.contact_name is 'No longer used. Contacts live in vendor_contacts.';
comment on column vendors.email is 'No longer used. Contacts live in vendor_contacts.';
comment on column vendors.phone is 'No longer used. Contacts live in vendor_contacts.';
