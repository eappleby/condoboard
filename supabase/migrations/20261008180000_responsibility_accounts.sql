-- 372 12th board tracker. A responsibility can point at the account or city
-- portal it is done through.

alter table responsibilities
  add column if not exists account_id uuid references accounts(id) on delete set null;
create index if not exists idx_resp_account on responsibilities (account_id);

-- Connect the filings whose portal is already on the Accounts tab. Only
-- rows with no account yet are touched, so a replay changes nothing.
update responsibilities r
   set account_id = a.id
from (values
  ('Annual property registration and fee', 'PROS, Property Registration Online'),
  ('HPD annual bed-bug filing',            'HPD Portal'),
  ('Condo abatement application renewal',  'NYC Condo Abatement e-File'),
  ('FDNY five-year sprinkler test',        'FDNY Business')
) as v(title, account_name)
join accounts a on lower(a.name) = lower(v.account_name)
where lower(r.title) = lower(v.title) and r.account_id is null;
