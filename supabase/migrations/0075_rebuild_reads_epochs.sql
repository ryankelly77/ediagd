-- ============================================================================
-- EDIAGD — 0075 The rebuild and the attach view read rules as of the period
--
-- 0074 gave all three mappings effective_from and retired_at. This is the half
-- that reads them, and it is where the epoch stops being a column and starts
-- being the arithmetic.
--
-- Two readers change, and they are in different places, which is the thing that
-- makes this migration worth reading twice:
--
--   op_text_rule       is BAKED IN at rebuild time, into
--                      advisor_op_metric.resolved_family
--   sub_category_map   is read AT QUERY TIME by advisor_family_attach
--
-- So one needs the period's start date inside rebuild_dms_periods, and the
-- other needs it inside a view that never had a period date to hand. Fixing
-- only the rebuild would have left half the mapping still rewriting history,
-- and it is the half with 815 rows.
--
-- op_code_family is not read by measurement at all today — it routes cues — so
-- it correctly keeps reading as of TODAY. That becomes measurement the day the
-- pick moves to op-code grain, and this file is where it will join.
--
-- ---------------------------------------------------------------------------
-- THIS MIGRATION MUST CHANGE NO NUMBERS
-- ---------------------------------------------------------------------------
-- Every seeded rule is effective from 2000-01-01 with retired_at null, so the
-- interval test is true for every period that exists. A rebuild after this must
-- produce byte-identical metrics — proved with npm run snapshot:metrics, not
-- asserted here.
-- ============================================================================


-- ---- 1. The rebuild picks the rules that were in force that month -----------
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
    is_partial, days_covered, last_day_covered, source_kind, rules_as_of)
  select
    s.rooftop_id, s.month_start, s.month_end,
    to_char(s.month_start, 'FMMonth YYYY'),
    'dms-daily',
    s.last_day < month_last_weekday(s.month_start),
    s.days_covered,
    s.last_day,
    'dynatron',
    /*
     * WHICH RULE SET PRODUCED THESE NUMBERS. Always the period's own start —
     * that IS the as-of date — recorded so a period rebuilt before 0074 (null)
     * is distinguishable from one rebuilt after, and so a rebuild is
     * reproducible rather than a function of when it happened to run.
     */
    s.month_start
  from _scope s
  on conflict (rooftop_id, starts_on, ends_on) do update
    set is_partial       = excluded.is_partial,
        days_covered     = excluded.days_covered,
        last_day_covered = excluded.last_day_covered,
        source_kind      = excluded.source_kind,
        source_file      = excluded.source_file,
        rules_as_of      = excluded.rules_as_of,
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
    period_id, rooftop_id, advisor_op_id, op_code, sub_category, resolved_family,
    ros, elr, frhs, frhs_per_ro, labor_sales, labor_per_ro, labor_gp_pct, ro_lines)
  select
    t.period_id, d.rooftop_id, d.advisor_op_id, d.op_code, d.sub_category, r.family,
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
  left join lateral (
    select ot.family
      from op_text_rule ot
     where ot.sub_category = normalise_sub_category(d.sub_category)
       and d.op_description ~* ot.include_pattern
       and (ot.exclude_pattern is null or d.op_description !~* ot.exclude_pattern)
       /*
        * THE INTERVAL TEST. A rule applies to this period iff it was in force
        * on the period's first day. `t.starts_on` is the month, so a rule
        * effective 15 September is simply not visible to the September period
        * and takes effect with October — never mid-month, because a month is
        * one number and half of it under each mapping is a number nobody can
        * reconcile.
        */
       and ot.effective_from <= t.starts_on
       and (ot.retired_at is null or t.starts_on < ot.retired_at)
     order by ot.priority
     limit 1
  ) r on true
  group by t.period_id, d.rooftop_id, d.advisor_op_id, d.op_code, d.sub_category, r.family;
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


-- ---- 2. The attach view resolves the sub-category as of the period ----------
/**
 * Same interval test, applied where sub_category_map is actually read.
 *
 * This view is the OTHER half of measurement and it is easy to miss: the
 * sub-category family is not baked into advisor_op_metric, it is joined on
 * every read. So a sub-category correction rewrote every historical attach rate
 * the instant it was saved — no rebuild required, no trace that anything
 * happened. 815 rows behave this way against op_text_rule's 9.
 *
 * The period's start comes from perf_period, which was already reachable and
 * simply never joined.
 */
create or replace view advisor_family_attach as
with fam as (
  select
    m.period_id,
    m.rooftop_id,
    m.advisor_op_id,
    coalesce(m.resolved_family, scm.family, sl.family, sl.category) as family,
    sum(m.ros) as fam_ros
  from advisor_op_metric m
  join perf_period p on p.id = m.period_id
  left join service_line sl on sl.op_code = m.op_code
  left join sub_category_map scm
    on m.sub_category is not null
   and scm.rooftop_id = m.rooftop_id
   and scm.sub_category = m.sub_category
   /* The interval test, same as the rebuild's. */
   and scm.effective_from <= p.starts_on
   and (scm.retired_at is null or p.starts_on < scm.retired_at)
  where
    (m.sub_category is null or scm.family is not null or m.resolved_family is not null)
    and (scm.status is null or scm.status <> 'not_coachable')
  group by 1, 2, 3, 4
)
/*
 * THE 0055 CLAMP IS PRESERVED EXACTLY, INCLUDING BOTH ITS EXTRA COLUMNS.
 *
 * The first draft of this migration rewrote the view from the 0054 definition
 * and Postgres refused it — "cannot drop columns from view" — because 0055 had
 * since added fam_ros_raw and ros_overflow. That refusal was the good outcome:
 * the DMS feed carries no RO ids so a family's RO count can exceed the
 * advisor's total, and 0055 clamps the rate while EXPOSING the amount clamped
 * away. Silently dropping those two would have hidden the inflation again and
 * left every caller reading a number with no way to tell how much it was
 * hiding.
 */
select
  f.period_id,
  f.rooftop_id,
  f.advisor_op_id,
  f.family,
  least(f.fam_ros, t.total_ros)                       as fam_ros,
  t.total_ros                                         as advisor_ros,
  case when t.total_ros > 0
       then round(100.0 * least(f.fam_ros, t.total_ros) / t.total_ros, 1)
  end                                                 as attach_rate_pct,
  f.fam_ros                                           as fam_ros_raw,
  greatest(f.fam_ros - t.total_ros, 0)                as ros_overflow
from fam f
join advisor_period_total_src t using (period_id, rooftop_id, advisor_op_id)
where f.family is not null;

alter view advisor_family_attach set (security_invoker = on);
