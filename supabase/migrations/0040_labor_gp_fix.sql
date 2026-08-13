-- ============================================================================
-- EDIAGD — 0040 Labor GP is labour GP
--
-- The advisor screen showed "LABOR GP 113.2%", which is not a thing.
--
-- 0039 filled advisor_period_total_src.gp_pct from the DMS advisor rollup's
-- own `gp` column divided by labor sales. But `gp` is TOTAL gross profit —
-- labour GP plus PARTS GP — while the denominator is labour sales alone. Any
-- job with parts on it pushes the ratio above 100%, and on this data it does:
-- 113.2% for August, 111.9% for July.
--
-- The column feeds a figure the screen labels "Labor GP", so it has to be
-- labour GP over labour sales. dms_daily_metric carries labor_gp per line, and
-- MONEY is safe to sum across lines — it is only RO COUNTS that are not, which
-- is why the numerator moves here and total_ros stays exactly where it was, on
-- dms_daily_advisor_total.
--
-- Re-running rebuild_dms_periods() after this corrects every existing row; no
-- backfill statement is needed because the rebuild replaces the periods
-- wholesale.
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
    s.last_day < s.month_end,
    s.days_covered,
    s.last_day,
    'dms_daily'
  from _scope s
  on conflict (rooftop_id, starts_on, ends_on) do update
    set is_partial       = excluded.is_partial,
        days_covered     = excluded.days_covered,
        last_day_covered = excluded.last_day_covered,
        source_kind      = excluded.source_kind,
        source_file      = excluded.source_file;
  get diagnostics _periods = row_count;

  create temp table _periods_touched on commit drop as
  select p.id as period_id, p.rooftop_id, p.starts_on, p.ends_on
    from perf_period p
    join _scope s
      on s.rooftop_id = p.rooftop_id
     and s.month_start = p.starts_on
   where p.source_kind = 'dms_daily';

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

  -- ---- the totals -------------------------------------------------------
  -- total_ros still comes from dms_daily_advisor_total, summed across DAYS.
  -- Only the GP ratio moved: its numerator is now LABOUR gross profit from the
  -- line table, which matches the denominator and matches the screen's label.
  with labour_gp as (
    select t.period_id, m.rooftop_id, m.advisor_op_id,
           sum(m.labor_gp)     as lgp,
           sum(m.labor_sales)  as lsales
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
