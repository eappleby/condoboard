-- 372 12th board tracker. Replace the generic starter data with the
-- building's real records.
--
-- Sources: the board's own notes covering the projects list, the roster,
-- vendor contracts, important dates, and account logins.
--
-- Two deliberate omissions:
--   * No passwords. Anyone who has the site URL can read this database, so
--     credentials stay in the board password manager.
--   * No camera stream host, port, or credentials, for the same reason.
--
-- Every insert is guarded, so re-running migrations never duplicates rows
-- and never resurrects something deleted in the app.

-- ---------------------------------------------------------------
-- 1. Remove the generic starter responsibilities
-- ---------------------------------------------------------------
delete from responsibilities where title in (
  'Renew building insurance policy',
  'Annual elevator inspection',
  'Fire alarm & sprinkler inspection',
  'Boiler / HVAC inspection & service',
  'Monthly financial review',
  'Board meeting & minutes',
  'Draft next year''s budget',
  'Annual owners'' meeting',
  'File the association''s tax return',
  'Reserve fund review',
  'Gutter & drain cleaning',
  'Dryer vent & common-area duct cleaning',
  'Review vendor contracts up for renewal',
  'Test emergency lighting & exit signs'
);

-- ---------------------------------------------------------------
-- 2. Board members
-- ---------------------------------------------------------------
insert into board_members (name, position, email, apartment)
select v.name, v.position, v.email, v.apartment
from (values
  ('Mitch Herrera',          'President',  'mitchlherrera@gmail.com', '3'),
  ('Amanda Lim',             'Treasurer',  'amandapjlim@gmail.com',   null),
  ('Beatriz Hollensteiner',  'Secretary',  'bbaholl@gmail.com',       '5'),
  ('Evan Appleby',           'Observer',   'evan.appleby@gmail.com',  '2'),
  ('Meredith O''Boye',       'Observer',   'oboyleme@gmail.com',      '4')
) as v(name, position, email, apartment)
where not exists (select 1 from board_members b where lower(b.email) = lower(v.email));

-- ---------------------------------------------------------------
-- 3. Vendors, both contracted and recommended
-- ---------------------------------------------------------------
insert into vendors (name, service, contact_name, email, phone, website, status, cost, cost_period, notes)
select v.name, v.service, v.contact_name, v.email, v.phone, v.website, v.status, v.cost, v.cost_period, v.notes
from (values
  ('Fairmont Insurance', 'Insurance broker, property and liability', 'Brad Sharon, account executive',
   'brads@fairmontins.com', null, null, 'contracted', 14078.70, '3-year',
   'Property and liability, three-year term from April 2025 to April 2028, paid quarterly at $1,267.46. Rep: lliang@fairmontins.com. Claims: evas@fairmontins.com. Prior contact: Josie Tsang, jtsang@fairmontins.com. Also brokers the D&O policy through Liberty.'),

  ('Liberty Insurance Company', 'Directors and Officers insurance', 'Placed through Fairmont Insurance',
   null, null, null, 'contracted', 1100.00, 'annual',
   'D&O coverage at roughly $1,100 a year, placed through Fairmont. The policy on file expires 1/28/2026, so confirm whether it was renewed.'),

  ('Prospect Cleaning Service, Inc', 'Janitorial and monthly trash', null,
   'info@prospectcleaningnyc.com', null, 'http://www.prospectcleaningnyc.com', 'contracted', 640.00, 'monthly',
   'Roughly $640 a month. Also reachable at imurray@prospectcleaningnyc.com. Customary $140 cash tip at the holidays.'),

  ('Harris Plumbing and Heating', 'Monthly fire inspection', null,
   null, null, 'https://www.harrisplumbingandheating.com', 'contracted', 840.00, 'annual',
   'Monthly fire inspection contract at $840 a year.'),

  ('Presti & Naegele', 'Accountant', 'Annemarie Aguanno',
   'aaguanno@pntax.com', '646-380-4976', 'https://www.pntax.com', 'contracted', null, null,
   '225 West 35th Street, 5th Floor, New York, NY 10001. Tel 212-736-0055 x4976, direct 646-380-4976, fax 347-436-9526. Send the prior year financial statement at the end of January.'),

  ('Alpha Piping & Heating', 'Plumbing', null,
   null, null, 'https://alphapiping.com', 'recommended', null, null,
   'Recommended, not yet engaged.'),

  ('Vigilante Plumbing', 'Plumbing', null,
   null, null, 'https://www.bestbrooklynplumber.com/', 'recommended', null, null,
   'Recommended, not yet engaged.'),

  ('Riviera Electric', 'Electrician', null,
   'info@rivieraelectriccorp.com', null, null, 'recommended', null, null,
   'Recommended, not yet engaged.')
) as v(name, service, contact_name, email, phone, website, status, cost, cost_period, notes)
where not exists (select 1 from vendors x where lower(x.name) = lower(v.name));

-- ---------------------------------------------------------------
-- 4. Accounts and city portals. No passwords, see the header note.
-- ---------------------------------------------------------------
insert into accounts (name, category, account_number, portal_url, username, notes)
select v.name, v.category, v.account_number, v.portal_url, v.username, v.notes
from (values
  ('NYC DEP, Water', 'Utilities', '3001019204001',
   'https://a826-umax.dep.nyc.gov/', '37212th@gmail.com', null),

  ('Con Edison, Electric', 'Utilities', '50315310008',
   'https://www.coned.com/en/login', '37212th@gmail.com', null),

  ('Bill.com', 'Financial', null,
   'https://app02.us.bill.com/neo/login', '37212th@gmail.com',
   'Invoices and payments. Evan is setting up his own account and removing the others.'),

  ('NYC Department of Finance', 'City portal', null,
   'https://www.nyc.gov/site/finance/index.page', '372_12_board@googlegroups.com',
   'Annual registration fee of $13 and building tax payment of $25. Update the board contact information at each annual registration.'),

  ('NYC Department of Finance, Property Tax', 'City portal', null,
   'https://nycdepartmentoffinance.powerappsportals.us/', '372_12_board',
   'Username 372_12_board, email 372_12_board@googlegroups.com.'),

  ('NYC Condo Abatement e-File', 'City portal', null,
   'https://a836-pts-efile.nyc.gov/SmartFile/Filing/FilingType/Info/NYC_COOP_CHANGE_FORM', null,
   'Condo abatement application renewal, due each February 1.'),

  ('FDNY Business', 'City portal', null,
   'https://www1.nyc.gov/account/login.htm?spName=fires.fdnycloud.org%3A443-SAML', '372_12_board@googlegroups.com',
   'Five-year sprinkler tests. The last test was 10/28/2024, covering system pressure and confirming there is water in the pipes. The vent cover in front of the basement sprinkler room has to come off for the test.'),

  ('DOB NOW', 'City portal', null,
   'https://a810-dobnow.nyc.gov/publish/Index.html', '372_12_board@googlegroups.com', null),

  ('HPD Portal', 'City portal', null,
   'https://hpdcrmportal.dynamics365portals.us/', '37212th',
   'Annual bed-bug certification filing, due February 1. Search for "12 STREET". Phone on file: 646-812-3425.'),

  ('OATH and BTS eServices', 'City portal', null,
   'https://a836-btseservices.nyc.gov/production/eservices/_/', 'Board37212th',
   'Violations. A security question is on file. Violation dated 12/4/2024, confirmation number 1-328-863-744.'),

  ('PROS, Property Registration Online', 'City portal', null,
   'https://a806-pros.nyc.gov/PROS/', '37212th@gmail.com',
   'Annual property registration. Opens in July and must be completed by September 1.'),

  ('Building Gmail', 'Communications', null,
   'https://mail.google.com', '37212th@gmail.com',
   'Shared building mailbox used for most utility and portal accounts.'),

  ('Board Google Group', 'Communications', null,
   'https://groups.google.com', '372_12_board@googlegroups.com',
   'Used for the city portals that need a board-wide address.'),

  ('Camera and doorbell system', 'Building systems', 'lnvccb74ca13',
   null, null,
   'LOREX, model LNZ32P12. Residents sign in with their apartment, apt1 through apt6. The stream host, port, and credentials are deliberately not stored here. They are in the board password manager.')
) as v(name, category, account_number, portal_url, username, notes)
where not exists (select 1 from accounts a where lower(a.name) = lower(v.name));

-- ---------------------------------------------------------------
-- 5. Responsibilities
--
-- Dates are recorded as given. Where only a year was known, January 1 of
-- that year is used. Where no date is known the due date is left empty and
-- the description says so, rather than inventing a deadline.
-- ---------------------------------------------------------------
insert into responsibilities
  (title, description, category, priority, status, due_date, last_completed_on,
   recurrence, estimated_cost, vendor_id)
select v.title, v.description, v.category, v.priority, 'open', v.due_date, v.last_done,
       v.recurrence, v.cost, ven.id
from (values
  -- Capital projects
  ('Exterior caulking',
   'The next due date was given as 2026 with no month, so it is set to year end. Confirm the intended timing.',
   'Maintenance', 'high', date '2026-12-31', date '2020-09-01', 'none', 5000.00, null),

  ('Exterior painting',
   'Listed as due. No date was recorded for the last time it was done.',
   'Maintenance', 'high', current_date, null, 'none', null, null),

  ('Railing painting',
   'Listed as due. No date was recorded for the last time it was done.',
   'Maintenance', 'high', current_date, null, 'none', 2500.00, null),

  ('Corridor painting',
   'Was due in 2021 and is well overdue.',
   'Maintenance', 'high', date '2021-01-01', date '2016-01-01', 'none', 4000.00, null),

  ('Garbage area waterproofing',
   'Was due in 2021 and is well overdue.',
   'Maintenance', 'high', date '2021-01-01', date '2018-01-01', 'none', 1000.00, null),

  ('FDNY five-year sprinkler test',
   'Pressure test of the sprinkler system and confirmation that there is water in the pipes. The vent cover in front of the basement sprinkler room must be removed for the test. The projects list showed this as due in 2024, but the FDNY Business account shows a test on 10/28/2024, so it is treated as done and next due in 2029. Please confirm.',
   'Inspections', 'normal', date '2029-10-28', date '2024-10-28', 'five_year', 1500.00, null),

  -- Compliance and filings
  ('Annual property registration and fee',
   'Filed through PROS. Registration opens in July and must be completed by September 1. The fee is $13. Update the board contact information while filing.',
   'Legal & Compliance', 'high', date '2026-09-01', null, 'annual', 13.00, null),

  ('HPD annual bed-bug filing',
   'Due February 1 each year. File through the HPD portal and search for "12 STREET".',
   'Legal & Compliance', 'high', date '2027-02-01', null, 'annual', null, null),

  ('Condo abatement application renewal',
   'Due February 1 each year, filed through the NYC condo abatement e-File portal.',
   'Legal & Compliance', 'high', date '2027-02-01', null, 'annual', null, null),

  -- Insurance
  ('D&O insurance renewal',
   'Directors and Officers coverage through Liberty, placed by Fairmont. The policy on file expires 1/28/2026, so confirm whether it was renewed and for what term.',
   'Insurance', 'high', date '2027-01-28', null, 'annual', 1100.00, 'Liberty Insurance Company'),

  ('Property and liability insurance renewal',
   'The current term runs from April 2025 to April 2028 at $14,078.70 in total.',
   'Insurance', 'normal', date '2028-04-30', date '2025-04-25', 'three_year', 14078.70, 'Fairmont Insurance'),

  ('Quarterly insurance payment',
   'Property and liability premium at $1,267.46 a quarter. The board notes read "May 25 to August 28", so confirm the payment schedule and set a due date.',
   'Financial', 'high', null, null, 'quarterly', 1267.46, 'Fairmont Insurance'),

  -- Financial and administrative
  ('Send financial statement to the accountant',
   'Send the prior year financial statement to Annemarie Aguanno at the end of January.',
   'Financial', 'normal', date '2027-01-31', null, 'annual', null, 'Presti & Naegele'),

  ('Planters area payment',
   'Annual maintenance item of $150. No date was recorded, so please set one.',
   'Financial', 'normal', null, null, 'annual', 150.00, null),

  ('Building tax payment',
   'Annual maintenance item of $25. No date was recorded, so please set one.',
   'Financial', 'normal', null, null, 'annual', 25.00, null),

  ('Janitorial holiday tip',
   'Customary $140 in cash to Prospect Cleaning during the holidays.',
   'Vendors & Contracts', 'low', date '2026-12-15', null, 'annual', 140.00, 'Prospect Cleaning Service, Inc'),

  ('Confirm monthly fire inspection',
   'Harris Plumbing performs a monthly fire inspection under an $840 a year contract. Confirm the visit schedule and set a recurring date.',
   'Inspections', 'normal', null, null, 'monthly', null, 'Harris Plumbing and Heating')
) as v(title, description, category, priority, due_date, last_done, recurrence, cost, vendor_name)
left join vendors ven on lower(ven.name) = lower(v.vendor_name)
where not exists (select 1 from responsibilities r where r.title = v.title);

-- ---------------------------------------------------------------
-- 6. Reference links
-- ---------------------------------------------------------------
insert into links (title, url, kind, responsibility_id)
select v.title, v.url, v.kind, r.id
from (values
  ('Condo abatement e-File',
   'https://a836-pts-efile.nyc.gov/SmartFile/Filing/FilingType/Info/NYC_COOP_CHANGE_FORM',
   'website', 'Condo abatement application renewal'),
  ('HPD bed-bug filing portal',
   'https://hpdcrmportal.dynamics365portals.us/SignIn?ReturnUrl=%2Fbedbugs%2FCertificationFiling%2F',
   'website', 'HPD annual bed-bug filing'),
  ('PROS property registration',
   'https://a806-pros.nyc.gov/PROS/',
   'website', 'Annual property registration and fee')
) as v(title, url, kind, resp_title)
join responsibilities r on r.title = v.resp_title
where not exists (select 1 from links l where l.responsibility_id = r.id and l.url = v.url);
