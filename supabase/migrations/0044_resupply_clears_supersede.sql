-- ============================================================================
-- EDIAGD — 0044 A month re-supplied by the daily feed is not "superseded"
--
-- Uploading June in the Dynatron format hits a sequence the supersede rule was
-- not written for:
--
--   1. commit_dms_import sees the new June daily rows fully cover the existing
--      June period — which came from the OpCode export — and marks it
--      superseded. Correct: that is exactly what the rule is for.
--   2. rebuild_dms_periods then upserts June and, because perf_period is unique
--      on (rooftop_id, starts_on, ends_on), UPDATES that very same row to
--      source_kind = 'dynatron' and rebuilds its metrics from the daily data.
--
-- The row ends up owned by the daily feed while still carrying the timestamp
-- that says an older version of it was retired. The two statements disagree
-- about what the row is.
--
-- It is currently harmless only by accident: nothing reads superseded_at. The
-- comment on the column claims "reporting must ignore superseded periods" and
-- no query does — so the moment anything honours the flag, June would vanish
-- the day it was re-supplied in a better format.
--
-- A period the daily feed now owns has not been superseded, it has been
-- REPLACED. Clearing the flag on takeover keeps the row self-consistent
-- whichever way the flag is read later.
-- ============================================================================

create or replace function rebuild_dms_periods(
  _rooftop_id uuid default null,
  _month      date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _periods int := 0;
  _metrics int := 0;
  _totals  int := 0;
  _lines   int := 0;
begin
  if not (
    is_platform_owner()
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
       = 'service_role'
  ) then
    raise exception 'rebuild_dms_periods: platform owner only';
  end if;

  drop table if exists _scope;
  drop table if exists _periods_touched;

  create temp table _scope on commit drop as
  select
    d.rooftop_id,
    date_trunc('month', d.report_date)::date            as month_start,
    (date_trunc('month', d.report_date)
       + interval '1 month - 1 day')::date              as month_end,
    count(distinct d.report_date)::int                  as days_covered,
    max(d.report_date)                                  as last_day
  from dms_daily_metric d
  where (_rooftop_id is null or d.rooftop_id = _rooftop_id)
    and (_month is null or date_trunc('month', d.report_date) = date_trunc('month', _month))
  group by 1, 2, 3;

  insert into service_line (op_code, category, description, family)
  select distinct d.op_code, 'DMS import', min(d.op_description), null
    from dms_daily_metric d
    join _scope s on s.rooftop_id = d.rooftop_id
     and date_trunc('month', d.report_date)::date = s.month_start
   where not exists (select 1 from service_line l where l.op_code = d.op_code)
   group by d.op_code;

  insert into perf_period (
    rooftop_id, starts_on, ends_on, label, source_file,
    is_partial, days_covered, last_day_covered, source_kind)
  select
    s.rooftop_id, s.month_start, s.month_end,
    to_char(s.month_start, 'FMMonth YYYY'),
    'dms-daily',
    s.last_day < month_last_weekday(s.month_start),
    s.days_covered,
    s.last_day,
    'dynatron'
  from _scope s
  on conflict (rooftop_id, starts_on, ends_on) do update
    set is_partial       = excluded.is_partial,
        days_covered     = excluded.days_covered,
        last_day_covered = excluded.last_day_covered,
        source_kind      = excluded.source_kind,
        source_file      = excluded.source_file,
        -- THE FIX. This row is now the daily feed's copy of the month, so the
        -- "an older format's version of this was retired" flag is stale.
        superseded_at    = null;
  get diagnostics _periods = row_count;

  create temp table _periods_touched on commit drop as
  select p.id as period_id, p.rooftop_id, p.starts_on, p.ends_on
    from perf_period p
    join _scope s
      on s.rooftop_id = p.rooftop_id
     and s.month_start = p.starts_on
   where p.source_kind = 'dynatron';

  delete from advisor_op_metric m
   using _periods_touched t where m.period_id = t.period_id;

  delete from advisor_period_total_src a
   using _periods_touched t where a.period_id = t.period_id;

  insert into advisor_op_metric (
    period_id, rooftop_id, advisor_op_id, op_code, sub_category,
    ros, elr, frhs, frhs_per_ro, labor_sales, labor_per_ro, labor_gp_pct, ro_lines)
  select
    t.period_id, d.rooftop_id, d.advisor_op_id, d.op_code, d.sub_category,
    sum(d.cp_ros),
    case when sum(d.frhs) > 0 then round(sum(d.labor_sales) / sum(d.frhs), 2) end,
    sum(d.frhs),
    case when sum(d.cp_ros) > 0 then round(sum(d.frhs) / sum(d.cp_ros), 2) end,
    sum(d.labor_sales),
    case when sum(d.cp_ros) > 0 then round(sum(d.labor_sales) / sum(d.cp_ros), 2) end,
    case when sum(d.labor_sales) > 0 then round(sum(d.labor_gp) / sum(d.labor_sales), 4) end,
    sum(d.num_ros)
  from dms_daily_metric d
  join _periods_touched t
    on t.rooftop_id = d.rooftop_id
   and d.report_date between t.starts_on and t.ends_on
  group by t.period_id, d.rooftop_id, d.advisor_op_id, d.op_code, d.sub_category;
  get diagnostics _metrics = row_count;

  with labour_gp as (
    select t.period_id, m.rooftop_id, m.advisor_op_id,
           sum(m.labor_gp) as lgp, sum(m.labor_sales) as lsales
      from dms_daily_metric m
      join _periods_touched t
        on t.rooftop_id = m.rooftop_id
       and m.report_date between t.starts_on and t.ends_on
     group by t.period_id, m.rooftop_id, m.advisor_op_id
  )
  insert into advisor_period_total_src (
    period_id, rooftop_id, advisor_op_id,
    total_ros, blended_elr, total_labor_sales, gp_pct, total_ro_lines)
  select
    t.period_id, a.rooftop_id, a.advisor_op_id,
    sum(a.unique_ros),
    case when sum(a.frhs) > 0 then round(sum(a.labor_sales) / sum(a.frhs), 2) end,
    sum(a.labor_sales),
    max(case when g.lsales > 0 then round(g.lgp / g.lsales, 4) end),
    null
  from dms_daily_advisor_total a
  join _periods_touched t
    on t.rooftop_id = a.rooftop_id
   and a.report_date between t.starts_on and t.ends_on
  left join labour_gp g
    on g.period_id = t.period_id
   and g.rooftop_id = a.rooftop_id
   and g.advisor_op_id = a.advisor_op_id
  group by t.period_id, a.rooftop_id, a.advisor_op_id;
  get diagnostics _totals = row_count;

  select count(*) into _lines from _periods_touched;

  drop table if exists _scope;
  drop table if exists _periods_touched;

  return jsonb_build_object(
    'periods_written', _periods,
    'periods_rebuilt', _lines,
    'op_metrics', _metrics,
    'advisor_totals', _totals
  );
end $$;

revoke all on function rebuild_dms_periods(uuid, date) from public, anon;
grant execute on function rebuild_dms_periods(uuid, date) to authenticated;

notify pgrst, 'reload schema';
