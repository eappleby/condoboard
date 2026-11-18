-- 372 12th board tracker. Residents, and richer schedule rows.
--
-- 1. People who live in the building but are not on the board. They are
--    board_members rows with on_board false, so one list of people serves
--    roles, schedules and emails. Only people on the board hold roles.
-- 2. A schedule row can name several people, each of whom gets the
--    reminder emails unless they have muted them.
-- 3. A schedule row covers one or more date ranges instead of a month pair.
--    When repeats_yearly is true the year is ignored, so a row can be
--    November 1 to 30 and March 1 to 31 every year.
-- 4. Each schedule says which weekdays and at what hour, New York time,
--    its reminder emails go out.
--
-- Safe to replay. Data steps only touch rows that have nothing yet.

-- ---------- residents ----------
alter table board_members add column if not exists on_board boolean not null default true;

-- ---------- schedule rows ----------
alter table schedule_slots add column if not exists description text;
alter table schedule_slots add column if not exists repeats_yearly boolean not null default true;

create table if not exists schedule_slot_ranges (
  id          uuid primary key default gen_random_uuid(),
  slot_id     uuid not null references schedule_slots(id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_slot_ranges_slot on schedule_slot_ranges (slot_id, position);

create table if not exists schedule_slot_people (
  id          uuid primary key default gen_random_uuid(),
  slot_id     uuid not null references schedule_slots(id) on delete cascade,
  member_id   uuid not null references board_members(id) on delete cascade,
  muted       boolean not null default false,
  -- The secret in the "stop these reminders" link of each email.
  mute_token  uuid not null default gen_random_uuid() unique,
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  unique (slot_id, member_id)
);
create index if not exists idx_slot_people_slot on schedule_slot_people (slot_id, position);

alter table schedule_slot_ranges enable row level security;
alter table schedule_slot_people enable row level security;

do $$
declare t text;
begin
  foreach t in array array['schedule_slot_ranges','schedule_slot_people'] loop
    execute format('drop policy if exists "open access" on %I', t);
    execute format(
      'create policy "open access" on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- The month pairs become yearly date ranges. 2024 is a leap year, so a range
-- ending in February ends on the 29th and covers it every year. A pair that
-- wraps past December ends in the next year.
insert into schedule_slot_ranges (slot_id, start_date, end_date, position)
select s.id,
       make_date(2024, s.month_start, 1),
       (make_date(case when s.month_end < s.month_start then 2025 else 2024 end, s.month_end, 1)
          + interval '1 month' - interval '1 day')::date,
       0
  from schedule_slots s
 where s.month_start is not null and s.month_end is not null
   and not exists (select 1 from schedule_slot_ranges r where r.slot_id = s.id);

-- Board members are put on the row for their own apartment.
insert into schedule_slot_people (slot_id, member_id, position)
select s.id, m.id,
       row_number() over (partition by s.id order by m.name) - 1
  from schedule_slots s
  join board_members m on btrim(m.apartment) = btrim(s.responsible)
 where coalesce(btrim(s.responsible), '') <> ''
   and not exists (select 1 from schedule_slot_people p where p.slot_id = s.id);

-- ---------- reminder days ----------
-- remind_days holds weekdays, 0 for Sunday through 6 for Saturday.
alter table schedules add column if not exists remind_days smallint[] not null default '{}';
alter table schedules add column if not exists remind_hour smallint not null default 7
  check (remind_hour between 0 and 23);

update schedules set remind_days = '{2,5}', remind_hour = 7
 where name = 'Trash and recycling' and remind_days = '{}';
