-- The reminder email became a monthly summary, so the defaults follow.
--
-- days_ahead and cooldown_days no longer do anything. The email covers two
-- named calendar months rather than a rolling window, and a monthly summary
-- should repeat an item that is still open rather than suppress it. The
-- columns are left in place so nothing breaks, but the site no longer offers
-- them and the function ignores them.

alter table reminder_settings alter column frequency set default 'monthly';

comment on column reminder_settings.days_ahead is
  'Unused since the monthly summary. The email covers two named calendar months.';
comment on column reminder_settings.cooldown_days is
  'Unused since the monthly summary. Open items repeat every month by design.';

-- Move the settings row to monthly, but only if nobody has changed it yet.
update reminder_settings
   set frequency = 'monthly', updated_at = now()
 where id = 1
   and frequency = 'weekly'
   and last_sent_at is null;
