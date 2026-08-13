-- ============================================================================
-- EDIAGD — 0048 Which advisors are moving, on matched worked days
--
-- The team page ranks advisors by attach rate against the store average, which
-- is a comparison BETWEEN COLLEAGUES — the one comparison the rest of the
-- product deliberately refuses to make. The advisor's own screen says the
-- competition is yesterday; the manager's screen has been saying it is the
-- person at the next desk.
--
-- A per-advisor trend fixes that, and answers a question the ranking cannot:
-- who is MOVING. An advisor at 4% attach who was at 2% needs a different
-- conversation from one who was at 6%, and the ranked list shows them as
-- identical. Esparza is the case in point — mid-table on July's numbers, and
-- the strongest mover on the team.
--
-- Same rule as everywhere else: N worked days so far against that advisor's own
-- FIRST N worked days in the prior period. Matched effort, per person, because
-- two advisors on the same team do not work the same days.
--
-- Aggregated in SQL for the same reason as 0047: a team's two months of daily
-- rows overruns PostgREST's 1,000-row select cap, silently.
-- ============================================================================

create or replace function store_advisor_trend(
  _rooftop    uuid,
  _month      date,
  _compare_to date default null
)
returns table (
  advisor_op_id   text,
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
  days as (
    select d.advisor_op_id,
           date_trunc('month', d.report_date)::date as m,
           d.report_date,
           sum(d.unique_ros)  as ros,
           sum(d.labor_sales) as sales
      from dms_daily_advisor_total d
      cross join bounds b
     where d.rooftop_id = _rooftop
       -- The caller must be able to see this store at all.
       and _rooftop in (select my_rooftops())
       and date_trunc('month', d.report_date)::date in (b.cur_m, b.pri_m)
     group by 1, 2, 3
    having sum(d.unique_ros) > 0 or sum(d.labor_sales) > 0
  ),
  ranked as (
    select *, row_number() over (partition by advisor_op_id, m order by report_date) as rn
      from days
  ),
  cur as (
    select r.advisor_op_id, count(*)::int as n, sum(r.ros) as ros, sum(r.sales) as sales
      from ranked r cross join bounds b
     where r.m = b.cur_m
     group by r.advisor_op_id
  ),
  pri_total as (
    select r.advisor_op_id, count(*)::int as n
      from ranked r cross join bounds b
     where r.m = b.pri_m
     group by r.advisor_op_id
  ),
  pri as (
    select r.advisor_op_id, count(*)::int as n, sum(r.ros) as ros, sum(r.sales) as sales
      from ranked r
      join cur c on c.advisor_op_id = r.advisor_op_id
      cross join bounds b
     where r.m = b.pri_m
       and r.rn <= c.n
     group by r.advisor_op_id
  )
  select
    c.advisor_op_id,
    c.n,
    c.ros,
    c.sales,
    coalesce(p.n, 0),
    coalesce(p.ros, 0),
    coalesce(p.sales, 0),
    coalesce(pt.n, 0) < c.n
  from cur c
  left join pri       p  on p.advisor_op_id  = c.advisor_op_id
  left join pri_total pt on pt.advisor_op_id = c.advisor_op_id
$$;

revoke all on function store_advisor_trend(uuid, date, date) from public, anon;
grant execute on function store_advisor_trend(uuid, date, date) to authenticated;

notify pgrst, 'reload schema';
