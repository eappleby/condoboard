-- 372 12th board tracker. Board roles, and a four-year recurrence.
--
-- A responsibility now belongs to a role such as Treasurer, and a role is
-- held by a board member. When the board changes, only the role's holder is
-- edited and the responsibilities stay where they are.

create table if not exists board_roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  member_id   uuid references board_members(id) on delete set null,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create unique index if not exists idx_board_roles_name on board_roles (lower(name));
create index if not exists idx_board_roles_member on board_roles (member_id);

alter table responsibilities
  add column if not exists role_id uuid references board_roles(id) on delete set null;
create index if not exists idx_resp_role on responsibilities (role_id);

comment on column responsibilities.assignee_id is
  'No longer used. Responsibilities are assigned through role_id.';
comment on column board_members.position is
  'No longer used. Roles live in board_roles.';

alter table board_roles enable row level security;
drop policy if exists "open access" on board_roles;
create policy "open access" on board_roles
  for all to anon, authenticated using (true) with check (true);

-- The gas piping inspection runs on a four-year cycle.
alter table responsibilities drop constraint if exists responsibilities_recurrence_check;
alter table responsibilities add constraint responsibilities_recurrence_check
  check (recurrence in ('none','monthly','quarterly','semiannual','annual',
                        'biennial','three_year','four_year','five_year'));
