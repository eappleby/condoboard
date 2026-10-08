-- 372 12th board tracker. Schedule rows hold a bare apartment number, since
-- "Apt" is implied. Safe to replay.

update schedule_slots
   set responsible = btrim(regexp_replace(responsible, '^\s*apt\.?\s*', '', 'i'))
 where responsible ~* '^\s*apt';
