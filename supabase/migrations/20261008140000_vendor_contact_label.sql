-- 372 12th board tracker. An optional label on a vendor contact, such as
-- Billing or Account executive.

alter table vendor_contacts add column if not exists label text;
