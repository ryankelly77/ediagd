-- ============================================================================
-- EDIAGD — 0047 Which stores are up, on matched worked days
--
-- The group screen ranks stores by size, which tells a principal who is big and
-- nothing about who is moving. The question they actually ask walking in is
-- "who's up and who's down", and the honest version of that has to compare
-- matched effort — a store that worked six days this month against its own
-- first six days last month, not against a finished month.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS SQL AND NOT TYPESCRIPT
-- ---------------------------------------------------------------------------
-- Doing it in the app means reading dms_daily_advisor_total for eleven stores
-- across two months: roughly 5,800 rows. PostgREST caps a select at 1,000, and
-- this session has already lost nine rooftops' periods to exactly that cap,
-- silently, with the import reporting success. Aggregating in the database
-- means the cap cannot apply and the app receives one row per store.
--
-- ---------------------------------------------------------------------------
-- WORKED DAYS PER STORE, NOT PER GROUP
-- ---------------------------------------------------------------------------
-- Each store's worked days are its own — one may be shut a Saturday another
-- opens. So N is counted per rooftop and the prior window is that rooftop's
-- FIRST N worked days. A store whose prior period ran out of worked days first
-- is flagged rather than padded, exactly as the advisor screen does it.
--
-- ---------------------------------------------------------------------------
-- _compare_to IS A PARAMETER SO YEAR-ON-YEAR IS FREE
-- ---------------------------------------------------------------------------
-- It defaults to the previous month. Passing (_month - interval '1 year') makes
-- this the same-worked-days comparison against last year with no other change.
-- The data does not reach back that far yet; the shape does, so nothing has to
-- be rewritten when it does.
-- ============================================================================

create or replace function group_store_trend(
  _month      date,
  _compare_to date default null
)
returns table (
  rooftop_id      uuid,
  worked_days     int,
  current_ros     numeric,
  current_sales   numeric,
  prior_days      int,
  prior_ros       numeric,
  prior_sales     numeric,
  prior_exhausted boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select date_trunc('month', _month)::date as cur_m,
           date_trunc('month', coalesce(_compare_to, (_month - interval '1 month')::date))::date as pri_m
  ),
  -- One row per store per day it actually traded. A day with no activity is not
  -- a worked day, and padding with zeroes would make "first N worked days" mean
  -- something else.
  days as (
    select d.rooftop_id,
           date_trunc('month', d.report_date)::date as m,
           d.report_date,
           sum(d.unique_ros)  as ros,
           sum(d.labor_sales) as sales
      from dms_daily_advisor_total d, bounds b
     where date_trunc('month', d.report_date)::date in (b.cur_m, b.pri_m)
       -- Scoped inside the definer, the same pattern the other helpers use.
       and d.rooftop_id in (select my_rooftops())
     group by 1, 2, 3
    having sum(d.unique_ros) > 0 or sum(d.labor_sales) > 0
  ),
  ranked as (
    select *, row_number() over (partition by rooftop_id, m order by report_date) as rn
      from days
  ),
  cur as (
    select r.rooftop_id, count(*)::int as n, sum(r.ros) as ros, sum(r.sales) as sales
      from ranked r, bounds b
     where r.m = b.cur_m
     group by r.rooftop_id
  ),
  pri_total as (
    select r.rooftop_id, count(*)::int as n
      from ranked r, bounds b
     where r.m = b.pri_m
     group by r.rooftop_id
  ),
  pri as (
    -- Explicit joins: mixing a comma-join with JOIN binds the JOIN to `bounds`
    -- and puts `ranked` out of scope in the ON clause.
    select r.rooftop_id, count(*)::int as n, sum(r.ros) as ros, sum(r.sales) as sales
      from ranked r
      join cur c on c.rooftop_id = r.rooftop_id
      cross join bounds b
     where r.m = b.pri_m
       and r.rn <= c.n
     group by r.rooftop_id
  )
  select
    c.rooftop_id,
    c.n,
    c.ros,
    c.sales,
    coalesce(p.n, 0),
    coalesce(p.ros, 0),
    coalesce(p.sales, 0),
    coalesce(pt.n, 0) < c.n
  from cur c
  left join pri      p  on p.rooftop_id  = c.rooftop_id
  left join pri_total pt on pt.rooftop_id = c.rooftop_id
$$;

revoke all on function group_store_trend(date, date) from public, anon;
grant execute on function group_store_trend(date, date) to authenticated;

notify pgrst, 'reload schema';
