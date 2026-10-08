-- 372 12th board tracker. A responsibility can be ongoing: always active,
-- with no due date, such as cleaning or internal communications.

alter table responsibilities drop constraint if exists responsibilities_recurrence_check;
alter table responsibilities add constraint responsibilities_recurrence_check
  check (recurrence in ('none','ongoing','monthly','quarterly','semiannual','annual',
                        'biennial','three_year','four_year','five_year'));
