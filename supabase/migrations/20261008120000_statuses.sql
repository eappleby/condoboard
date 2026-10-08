-- 372 12th board tracker. Statuses become Active, Complete and Canceled.
--
-- The stored values stay 'open' and 'done' so a site or email function from
-- before this migration keeps reading them correctly. 'in_progress' is
-- retired and 'canceled' is new. A repeating responsibility is always
-- active: completing it moves its due date on, so it is never left done.

-- ---------------------------------------------------------------
-- 1. Clean up after the older way of completing a repeating item, which
--    marked the row done and inserted a copy for the next cycle. Where that
--    copy exists, move the documents across to it and drop the done row.
-- ---------------------------------------------------------------
update links l
   set responsibility_id = (
         select a.id from responsibilities a
          where a.title = d.title and a.status <> 'done' and a.id <> d.id
          order by a.due_date nulls last limit 1)
  from responsibilities d
 where l.responsibility_id = d.id
   and d.status = 'done' and d.recurrence <> 'none'
   and exists (select 1 from responsibilities a
                where a.title = d.title and a.status <> 'done' and a.id <> d.id);

delete from responsibilities d
 where d.status = 'done' and d.recurrence <> 'none'
   and exists (select 1 from responsibilities a
                where a.title = d.title and a.status <> 'done' and a.id <> d.id);

-- Any repeating item still marked done has no copy, so it goes back to
-- active and keeps its date.
update responsibilities
   set status = 'open', completed_at = null
 where status = 'done' and recurrence <> 'none';

-- ---------------------------------------------------------------
-- 2. Retire in_progress and allow canceled
-- ---------------------------------------------------------------
update responsibilities set status = 'open' where status = 'in_progress';

alter table responsibilities drop constraint if exists responsibilities_status_check;
alter table responsibilities add constraint responsibilities_status_check
  check (status in ('open','done','canceled'));

comment on column responsibilities.status is
  'open is shown as Active, done as Complete, canceled as Canceled.';
