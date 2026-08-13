-- ============================================================================
-- EDIAGD — 0050 The group's month-by-month line
--
-- The group card shows one month's labor sales and its movement against the
-- previous one. That answers "are we up" and not "what has been happening",
-- which is the question a principal actually holds — a single down month reads
-- very differently after three up ones than after three down ones.
--
-- AGGREGATED IN SQL, for the third time this week and the same reason. Eleven
-- rooftops × eight months × ten advisors is ~880 advisor-period rows today,
-- comfortably under PostgREST's 1,000-row select cap and comfortably over it by
-- the time a year of history has landed. That cap has already cost this project
-- nine rooftops' periods once, silently. One row per month is not close to any
-- limit and never will be.
--
-- SCOPED TWICE, DELIBERATELY. The caller passes the rooftops it means (the org
-- the group screen resolved), and the function intersects that with
-- my_rooftops() so a crafted argument cannot widen the answer beyond what the
-- caller was already entitled to read.
-- ============================================================================

create or replace function group_month_totals(_rooftop_ids uuid[])
returns table (
  starts_on   date,
  label       text,
  is_partial  boolean,
  ros         numeric,
  labor_sales numeric,
  rooftops    int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.starts_on,
    -- One label per month; every rooftop's period for a month carries the same
    -- one, so min() is just "pick it" rather than a comparison.
    min(p.label)                                  as label,
    -- The month is partial for the GROUP if it is partial for any store in it.
    bool_or(p.is_partial)                         as is_partial,
    coalesce(sum(t.total_ros), 0)                 as ros,
    coalesce(sum(t.total_labor_sales), 0)         as labor_sales,
    count(distinct p.rooftop_id)::int             as rooftops
  from perf_period p
  left join advisor_period_total_src t on t.period_id = p.id
  where p.rooftop_id = any(_rooftop_ids)
    and p.rooftop_id in (select my_rooftops())
    and p.superseded_at is null
  group by p.starts_on
  order by p.starts_on
$$;

revoke all on function group_month_totals(uuid[]) from public, anon;
grant execute on function group_month_totals(uuid[]) to authenticated;

notify pgrst, 'reload schema';
