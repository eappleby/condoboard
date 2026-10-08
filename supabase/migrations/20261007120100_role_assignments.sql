-- 372 12th board tracker. Roles and assignments agreed at the October 2026
-- board meeting.
--
-- Every statement is guarded, so a replay never duplicates a row and never
-- overrides an assignment that is already set.

-- ---------------------------------------------------------------
-- 1. Roles and who holds them
-- ---------------------------------------------------------------
insert into board_roles (name, member_id, position)
select v.name, m.id, v.position
from (values
  ('President',      'amandapjlim@gmail.com',   0),
  ('Vice President', 'oboyleme@gmail.com',      1),
  ('Treasurer',      'mitchlherrera@gmail.com', 2),
  ('Secretary',      'bbaholl@gmail.com',       3),
  ('IT',             'evan.appleby@gmail.com',  4)
) as v(name, email, position)
left join board_members m on lower(m.email) = lower(v.email)
where not exists (select 1 from board_roles r where lower(r.name) = lower(v.name));

-- Carry over anything that was assigned to a person directly.
update responsibilities r
   set role_id = (select br.id from board_roles br
                   where br.member_id = r.assignee_id
                   order by br.position limit 1)
 where r.role_id is null and r.assignee_id is not null;

-- ---------------------------------------------------------------
-- 2. New responsibilities named at the meeting. No dates were given, so the
--    due dates are left empty.
-- ---------------------------------------------------------------
insert into responsibilities (title, category, priority, status, recurrence, vendor_id)
select v.title, v.category, 'normal', 'open', v.recurrence, ven.id
from (values
  ('Annual tree pruning',       'Maintenance',         'annual', null),
  ('Hallway design',            'Maintenance',         'none',   null),
  ('Backyard ledge',            'Maintenance',         'none',   null),
  ('Cleaning',                  'Vendors & Contracts', 'none',   'Prospect Cleaning Service, Inc'),
  ('Internal communications',   'Other',               'none',   null),
  ('DoorBird',                  'Other',               'none',   null),
  ('Online management profile', 'Other',               'none',   null)
) as v(title, category, recurrence, vendor_name)
left join vendors ven on lower(ven.name) = lower(v.vendor_name)
where not exists (select 1 from responsibilities r where lower(r.title) = lower(v.title));

-- ---------------------------------------------------------------
-- 3. Assign responsibilities to roles
-- ---------------------------------------------------------------
update responsibilities r
   set role_id = br.id
from (values
  ('Gas piping Inspection',                      'Secretary'),
  ('FDNY five-year sprinkler test',              'Secretary'),
  ('Confirm monthly fire inspection',            'Secretary'),
  ('HPD annual bed-bug filing',                  'Secretary'),
  ('Send financial statement to the accountant', 'Treasurer'),
  ('Quarterly insurance payment',                'Treasurer'),
  ('D&O insurance renewal',                      'Treasurer'),
  ('Property and liability insurance renewal',   'Treasurer'),
  ('Annual property registration and fee',       'President'),
  ('Planters area payment',                      'President'),
  ('Annual tree pruning',                        'President'),
  ('Hallway design',                             'President'),
  ('Backyard ledge',                             'President'),
  ('Cleaning',                                   'President'),
  ('Condo abatement application renewal',        'Vice President'),
  ('Internal communications',                    'IT'),
  ('DoorBird',                                   'IT'),
  ('Online management profile',                  'IT')
) as v(title, role_name)
join board_roles br on lower(br.name) = lower(v.role_name)
where lower(r.title) = lower(v.title) and r.role_id is null;

-- ---------------------------------------------------------------
-- 4. Gas piping moves from a five-year to a four-year cycle
-- ---------------------------------------------------------------
update responsibilities
   set recurrence = 'four_year'
 where lower(title) = 'gas piping inspection' and recurrence = 'five_year';
