-- Two changes.
--
-- 1. Documents keep their order, so the board can arrange them by hand.
-- 2. Rotating schedules, such as which apartment has the trash this month.

-- ---------- documents ----------
alter table links add column if not exists sort_order int not null default 0;

-- Give the existing rows a stable starting order.
with ordered as (
  select id, row_number() over (
           partition by coalesce(responsibility_id, vendor_id, account_id)
           order by created_at
         ) - 1 as n
    from links
)
update links l set sort_order = ordered.n
  from ordered where ordered.id = l.id and l.sort_order = 0;

-- ---------- schedules ----------
-- A rotating duty roster. Each schedule is a list of slots, and a slot says
-- who is responsible for a period. The months are optional. When they are
-- filled in, the site can highlight whose turn it is right now.
create table if not exists schedules (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  position     int not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists schedule_slots (
  id           uuid primary key default gen_random_uuid(),
  schedule_id  uuid not null references schedules(id) on delete cascade,
  label        text not null,          -- for example "January/February"
  responsible  text,                   -- for example "Apt 6"
  month_start  int check (month_start between 1 and 12),
  month_end    int check (month_end between 1 and 12),
  position     int not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists idx_slots_schedule on schedule_slots (schedule_id, position);

alter table schedules      enable row level security;
alter table schedule_slots enable row level security;

do $$
declare t text;
begin
  foreach t in array array['schedules','schedule_slots'] loop
    execute format('drop policy if exists "open access" on %I', t);
    execute format(
      'create policy "open access" on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- the building's trash rotation ----------
insert into schedules (name, description, position)
select 'Trash and recycling', 'Each apartment takes the bins for two months at a time.', 0
where not exists (select 1 from schedules where name = 'Trash and recycling');

insert into schedule_slots (schedule_id, label, responsible, month_start, month_end, position)
select s.id, v.label, v.responsible, v.month_start, v.month_end, v.position
from schedules s
cross join (values
  ('January/February',   'Apt 6',  1,  2, 0),
  ('March/April',        'Apt 3',  3,  4, 1),
  ('May/June',           'Apt 4',  5,  6, 2),
  ('July/August',        'Apt 1',  7,  8, 3),
  ('September/October',  'Apt 2',  9, 10, 4),
  ('November/December',  'Apt 5', 11, 12, 5)
) as v(label, responsible, month_start, month_end, position)
where s.name = 'Trash and recycling'
  and not exists (select 1 from schedule_slots x where x.schedule_id = s.id and x.label = v.label);
