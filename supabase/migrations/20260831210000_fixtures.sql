-- Fixtures. What the building uses and what to buy when something is
-- replaced: paint colours, light fittings, hardware, the intercom, appliances.

create table if not exists fixtures (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text not null default 'Other',   -- Paint, Lighting, Hardware, Intercom, Appliances
  brand       text,
  code        text,          -- colour number or model number, what you order by
  location    text,          -- where in the building it is used
  url         text,
  color_hex   text,          -- paint only, drawn as a swatch when present
  notes       text,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);

alter table links add column if not exists fixture_id uuid references fixtures(id) on delete cascade;
create index if not exists idx_links_fixture on links (fixture_id);

alter table fixtures enable row level security;
drop policy if exists "open access" on fixtures;
create policy "open access" on fixtures
  for all to anon, authenticated using (true) with check (true);

-- ---------------------------------------------------------------
-- What the building currently specifies
--
-- The paint swatches come from Benjamin Moore's own colour pages. Two notes.
-- Benjamin Moore now lists 2063-10 as "Winding Waterway" rather than
-- "Old Navy". The number is unchanged, so ordering by 2063-10 still gets the
-- right paint. PM-2 has no swatch here because the colour page did not
-- confirm one, and a wrong swatch is worse than none.
-- ---------------------------------------------------------------
insert into fixtures (name, category, brand, code, location, url, color_hex, notes, position)
select v.name, v.category, v.brand, v.code, v.location, v.url, v.color_hex, v.notes, v.position
from (values
  ('Sheep''s Wool', 'Paint', 'Benjamin Moore', '857', 'Walls',
   'https://www.benjaminmoore.com/en-us/color-overview/find-your-color/color/857/sheeps-wool?color=857',
   '#E0DFD7', null, 0),

  ('White', 'Paint', 'Benjamin Moore', 'PM-2', 'Baseboards',
   'https://www.benjaminmoore.com/en-us/color-overview/find-your-color/color/pm-2/white?color=PM-2',
   null, 'No swatch stored. The colour page did not confirm a value for PM-2.', 1),

  ('Old Navy', 'Paint', 'Benjamin Moore', '2063-10', 'Top of the stairs',
   'https://www.benjaminmoore.com/en-us/color-overview/find-your-color/color/2063-10/old-navy?color=2063-10',
   '#2E3549', 'Benjamin Moore now lists 2063-10 as "Winding Waterway". Same number, same paint.', 2),

  ('Beachcomber', 'Paint', 'Benjamin Moore', '993', 'Rail, bottom of the stairs, side of the stairs',
   'https://www.benjaminmoore.com/en-us/color-overview/find-your-color/color/993/beachcomber?color=993',
   '#857466', null, 3),

  ('Bell White Flush Mount Light', 'Lighting', 'CB2', null, 'Hallway',
   'https://www.cb2.com/bell-white-flush-mount-light/s171325',
   null, null, 4),

  ('DoorBird intercom', 'Intercom', 'DoorBird', null, 'Entrance',
   'https://www.doorbird.com/en/',
   null, 'Installation instructions are attached below.', 5),

  ('Anti-theft entrance gate lock handle plate', 'Hardware', null, null, 'Entrance gate',
   'https://www.aliexpress.us/item/3256803041988858.html',
   null, 'Recommended replacement, not yet fitted. Multi function stainless steel anti-theft entrance gate lock plate, anti-explosion, thickened and widened.', 6)
) as v(name, category, brand, code, location, url, color_hex, notes, position)
where not exists (select 1 from fixtures f where lower(f.name) = lower(v.name));

insert into links (title, url, kind, fixture_id, sort_order)
select 'DoorBird installation instructions',
       'https://docs.google.com/document/d/18H_kcd2RhzqNVfWMNjPGp_uXnPc0ExRoZ8uQu7nKZds/edit',
       'document', f.id, 0
from fixtures f
where f.name = 'DoorBird intercom'
  and not exists (select 1 from links l where l.fixture_id = f.id);
