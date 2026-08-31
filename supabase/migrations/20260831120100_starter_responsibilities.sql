-- Condo Board — starter responsibilities.
--
-- Common condo-board duties so the tracker isn't empty on day one. Edit or
-- delete any of them in the app afterwards.
--
-- Guarded: this only inserts when the table is empty, so re-running
-- migrations (or a `supabase db reset`) never duplicates rows, and rows you
-- delete in the app stay deleted.

do $mig$
declare
  y        int  := extract(year from current_date)::int;
  d_budget date := make_date(y, 11, 15);
  d_tax    date := make_date(y, 3, 15);
begin
  if exists (select 1 from responsibilities) then
    raise notice 'responsibilities table is not empty — skipping starter data';
    return;
  end if;

  -- Roll fixed-date items forward if this year's date has already passed.
  if d_budget < current_date then d_budget := make_date(y + 1, 11, 15); end if;
  if d_tax    < current_date then d_tax    := make_date(y + 1, 3, 15);  end if;

  insert into responsibilities (title, description, category, priority, due_date, recurrence) values
    ('Renew building insurance policy',
     'Ask the broker for updated quotes at least 45 days before the policy lapses.',
     'Insurance', 'high', (current_date + interval '2 months')::date, 'annual'),
    ('Annual elevator inspection',
     'State-mandated inspection — the elevator company usually coordinates with the city.',
     'Inspections', 'high', (current_date + interval '3 months')::date, 'annual'),
    ('Fire alarm & sprinkler inspection',
     'Annual test of alarms, sprinklers, and extinguishers. Keep the certificate on file.',
     'Inspections', 'high', (current_date + interval '4 months')::date, 'annual'),
    ('Boiler / HVAC inspection & service',
     'Service before heating season starts.',
     'Inspections', 'normal', (current_date + interval '1 month')::date, 'annual'),
    ('Monthly financial review',
     'Reconcile the operating account, review unpaid dues, and flag anything unusual.',
     'Financial', 'normal',
     (date_trunc('month', current_date) + interval '1 month' + interval '14 days')::date, 'monthly'),
    ('Board meeting & minutes',
     'Send the agenda a week ahead; record and circulate minutes afterward.',
     'Meetings', 'normal',
     (date_trunc('month', current_date) + interval '1 month' + interval '6 days')::date, 'monthly'),
    ('Draft next year''s budget',
     'Collect vendor contract amounts and utility trends; review with the board before year-end.',
     'Financial', 'high', d_budget, 'annual'),
    ('Annual owners'' meeting',
     'Book the space and send the official notice the required number of days ahead (check the bylaws).',
     'Meetings', 'high', (current_date + interval '6 months')::date, 'annual'),
    ('File the association''s tax return',
     'Get the financials to the accountant well before the deadline.',
     'Legal & Compliance', 'high', d_tax, 'annual'),
    ('Reserve fund review',
     'Review the reserve study and confirm contributions are on track.',
     'Financial', 'normal', (current_date + interval '5 months')::date, 'annual'),
    ('Gutter & drain cleaning',
     'Spring and fall.',
     'Maintenance', 'low', (current_date + interval '2 months')::date, 'semiannual'),
    ('Dryer vent & common-area duct cleaning',
     'Reduces fire risk; many insurers ask about it.',
     'Maintenance', 'low', (current_date + interval '7 months')::date, 'annual'),
    ('Review vendor contracts up for renewal',
     'Landscaping, snow removal, cleaning — confirm pricing before auto-renewal dates.',
     'Vendors & Contracts', 'normal', (current_date + interval '3 months')::date, 'annual'),
    ('Test emergency lighting & exit signs',
     'Walk the building and test; log the date.',
     'Maintenance', 'normal', (current_date + interval '1 month')::date, 'quarterly');
end
$mig$;
