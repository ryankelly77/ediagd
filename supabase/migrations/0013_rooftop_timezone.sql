-- 0013_rooftop_timezone.sql
-- Daily reset is midnight in the ROOFTOP's timezone, so the whole store shares
-- one "today". Add a timezone to each rooftop (IANA name, e.g. 'America/Chicago').
alter table rooftop
  add column if not exists timezone text not null default 'America/Chicago';

-- Helper: the current calendar date in a rooftop's timezone.
create or replace function rooftop_today(_rooftop uuid)
returns date language sql stable as $$
  select (now() at time zone (select timezone from rooftop where id = _rooftop))::date
$$;
