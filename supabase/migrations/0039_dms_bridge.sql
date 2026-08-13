-- ============================================================================
-- EDIAGD — 0039 The DMS data reaches the screens
--
-- 0038 imported 10,529 daily rows and every performance screen carried on
-- showing June, because /advisor, /manager, Eddie's Pick and the impact screens
-- all read perf_period + advisor_op_metric + advisor_period_total_src, and
-- nothing wrote to them. The data was in the building and invisible.
--
-- This derives those three from the daily tables, one period per calendar
-- month per rooftop, and is safe to re-run after every import.
--
-- ---------------------------------------------------------------------------
-- RO COUNTS COME FROM THE TOTALS TABLE. AGAIN.
-- ---------------------------------------------------------------------------
-- advisor_period_total_src is filled from dms_daily_advisor_total, summed
-- across DAYS — legitimate, because a repair order belongs to one day. It is
-- never built by summing dms_daily_metric, which over-counts by 96% (15,105
-- against an authoritative 7,700) for the reason 0005 and 0038 both document:
-- one RO carries op codes in several sub-categories.
--
-- ---------------------------------------------------------------------------
-- SUB-CATEGORY HAD TO JOIN advisor_op_metric
-- ---------------------------------------------------------------------------
-- Family used to come from service_line, keyed by op code alone. DMS op codes
-- are not in service_line, and — measured — 440 of 3,413 advisor-month op codes
-- appear under MORE THAN ONE sub-category. Collapsing those to one "dominant"
-- sub-category would misfile 13% of the lines into the wrong family, so
-- sub_category is now part of the row and part of its uniqueness.
--
-- The old constraint is replaced with an index over coalesce(sub_category,'')
-- so legacy rows, which have none, still de-duplicate exactly as before.
--
-- ---------------------------------------------------------------------------
-- PARTIAL MONTHS ARE ROLLED UP AND LABELLED, NOT WITHHELD
-- ---------------------------------------------------------------------------
-- The first file ends on 10 August. Holding August back would mean the app
-- showed nothing for the current month all month — the period an advisor most
-- wants to see is the one they are still working in. So it is imported, with
-- ends_on set to the CALENDAR month end (stable across re-runs, so the unique
-- key does not move when the rest of August arrives) and is_partial, with
-- days_covered and last_day_covered, describing exactly how much is there.
--
-- Every screen that shows a period must read is_partial. A partial month
-- compared against a full one is a 68% drop that never happened.
-- ============================================================================


-- ---- 1. Not every sub-category is coachable ---------------------------------
/**
 * Diagnosis (334 rows), State Inspection (225), Body (167), Engine (157).
 *
 * A state inspection is required, not sold. Diagnosis is time booked against
 * whatever it turns out to be. Body is a different department. Filing any of
 * them into a service family would inflate the denominator of every attach rate
 * and, worse, produce coaching telling an advisor to sell more state
 * inspections — which is not a thing they can do.
 *
 * So this is a THIRD answer, distinct from "not mapped yet": a recorded
 * decision that the rows are real, are stored, and are deliberately outside the
 * coaching maths. It stops them coming back in the queue every month.
 */
alter table sub_category_map drop constraint if exists sub_category_map_status_check;
alter table sub_category_map
  add constraint sub_category_map_status_check
  check (status in ('auto', 'confirmed', 'unmapped', 'not_coachable'));

comment on column sub_category_map.status is
  'unmapped = nobody has decided. auto = the rule file guessed. confirmed = a '
  'person agreed. not_coachable = a person decided it is outside coaching '
  'entirely (state inspection, diagnosis, body work) — stored, never counted.';


-- ---- 2. What a period covers ------------------------------------------------

alter table perf_period
  add column if not exists is_partial       boolean not null default false,
  add column if not exists days_covered     int,
  add column if not exists last_day_covered date,
  add column if not exists source_kind      text not null default 'monthly';

comment on column perf_period.is_partial is
  'True when the source data stops before the month does. Screens MUST say so: '
  'a partial month read as a full one looks like a collapse in performance.';


-- ---- 3. Sub-category joins the metric grain ---------------------------------

alter table advisor_op_metric
  add column if not exists sub_category text;

-- Replace the constraint with an index that tolerates the new column.
alter table advisor_op_metric
  drop constraint if exists advisor_op_metric_period_id_advisor_op_id_op_code_key;

create unique index if not exists advisor_op_metric_grain_idx
  on advisor_op_metric (period_id, advisor_op_id, op_code, coalesce(sub_category, ''));

create index if not exists advisor_op_metric_period_idx
  on advisor_op_metric (period_id, rooftop_id);


-- ---- 4. Family resolution, per rooftop --------------------------------------
/**
 * Where a line's service family comes from, in order:
 *
 *   1. sub_category_map for THIS rooftop, when the row carries a sub-category.
 *      Per-rooftop because "Tune Up" is not obliged to mean the same thing at a
 *      Honda store and a BMW store.
 *   2. service_line.family, then .category — the legacy monthly path, unchanged.
 *
 * EXCLUDED ENTIRELY: rows whose sub-category is unmapped, and rows marked
 * not_coachable. Unmapped is excluded because guessing is worse than waiting;
 * not_coachable because counting a state inspection as an attach would make
 * every advisor's rate wrong and the coaching nonsensical. Both remain in
 * dms_daily_metric — this view decides what counts, not what is kept.
 */
create or replace view advisor_family_attach as
with fam as (
  select
    m.period_id,
    m.rooftop_id,
    m.advisor_op_id,
    coalesce(scm.family, sl.family, sl.category) as family,
    sum(m.ros) as fam_ros
  from advisor_op_metric m
  left join service_line sl on sl.op_code = m.op_code
  left join sub_category_map scm
    on m.sub_category is not null
   and scm.rooftop_id = m.rooftop_id
   and scm.sub_category = m.sub_category
  where
    -- A DMS row only counts once somebody has said where it belongs.
    (m.sub_category is null or scm.family is not null)
    -- and never when they have said it belongs nowhere.
    and (scm.status is null or scm.status <> 'not_coachable')
  group by 1, 2, 3, 4
)
select f.period_id, f.rooftop_id, f.advisor_op_id, f.family,
       f.fam_ros, t.total_ros as advisor_ros,
       case when t.total_ros > 0
            then round(100.0 * f.fam_ros / t.total_ros, 1) end as attach_rate_pct
from fam f
join advisor_period_total_src t using (period_id, rooftop_id, advisor_op_id)
where f.family is not null;


-- ---- 5. The bridge ----------------------------------------------------------
/**
 * Derive perf_period, advisor_op_metric and advisor_period_total_src from the
 * daily DMS tables. One period per calendar month per rooftop.
 *
 * RE-RUNNABLE BY CONSTRUCTION. Every month it touches is rebuilt from scratch:
 * the period's derived rows are deleted and re-inserted, so a corrected upload
 * refreshes cleanly and running it twice changes nothing. Only periods whose
 * source_kind is 'dms_daily' are ever touched — the June monthly period is not
 * derived from daily data and is left exactly alone.
 *
 * SCOPED, NOT UNBOUNDED. Takes an optional rooftop and month so the post-import
 * hook rebuilds only what the import actually changed, rather than sweeping 11
 * rooftops of daily data every time.
 */
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

  -- ---- which (rooftop, month) pairs are in play --------------------------
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

  -- ---- the op codes have to exist before a metric can reference them -----
  -- service_line's primary key is the op code alone, so this is reference data
  -- with no family: family for DMS rows comes from sub_category_map, per
  -- rooftop, which a global table cannot express.
  insert into service_line (op_code, category, description, family)
  select distinct d.op_code, 'DMS import', min(d.op_description), null
    from dms_daily_metric d
    join _scope s on s.rooftop_id = d.rooftop_id
     and date_trunc('month', d.report_date)::date = s.month_start
   where not exists (select 1 from service_line l where l.op_code = d.op_code)
   group by d.op_code;

  -- ---- one period per rooftop-month --------------------------------------
  -- ends_on is the CALENDAR month end even when the data stops early, so the
  -- unique key (rooftop, starts_on, ends_on) does not move when the rest of the
  -- month arrives and the period is updated in place rather than duplicated.
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

  -- ---- rebuild the derived rows for exactly those periods ----------------
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
    -- ELR is a rate: re-derived from the totals, never averaged out of daily
    -- averages, which would weight a one-RO day the same as a twenty-RO day.
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

  -- THE AUTHORITATIVE TOTALS. Summed across days, never across op-code lines.
  insert into advisor_period_total_src (
    period_id, rooftop_id, advisor_op_id,
    total_ros, blended_elr, total_labor_sales, gp_pct, total_ro_lines)
  select
    t.period_id, a.rooftop_id, a.advisor_op_id,
    sum(a.unique_ros),
    case when sum(a.frhs) > 0 then round(sum(a.labor_sales) / sum(a.frhs), 2) end,
    sum(a.labor_sales),
    case when sum(a.labor_sales) > 0 then round(sum(a.gp) / sum(a.labor_sales), 4) end,
    null
  from dms_daily_advisor_total a
  join _periods_touched t
    on t.rooftop_id = a.rooftop_id
   and a.report_date between t.starts_on and t.ends_on
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


-- ---- 6. Rooftops that have not started --------------------------------------
/**
 * The donut said 100 while the hero said 112, and nobody could see why.
 *
 * engagement_rollup only holds rooftops where somebody has an account and has
 * done something. The eleven Doggett stores have performance data and no
 * logins, so they were absent from the rollup and therefore absent from the
 * chart — eleven stores silently missing from a total an admin reads as "all
 * of them".
 *
 * "Not started" is a fourth band, and it is NOT the bottom of the scale. These
 * stores have not failed at engagement; nobody has been invited yet. Rendering
 * them in the same clay as "need attention" would be a false accusation
 * against a store that has done nothing wrong.
 */
create or replace view admin_engagement_coverage as
select
  (select count(*)::int from rooftop where id in (select admin_rooftops()))
    as rooftops_in_scope,
  (select count(distinct rooftop_id)::int
     from engagement_rollup where rooftop_id in (select admin_rooftops()))
    as rooftops_reporting,
  (select count(*)::int
     from rooftop r
    where r.id in (select admin_rooftops())
      and not exists (
        select 1 from engagement_rollup e where e.rooftop_id = r.id))
    as rooftops_not_started,
  (select count(*)::int
     from rooftop r
    where r.id in (select admin_rooftops())
      and not exists (select 1 from engagement_rollup e where e.rooftop_id = r.id)
      and exists (select 1 from perf_period p where p.rooftop_id = r.id))
    as not_started_with_data;

alter view admin_engagement_coverage set (security_invoker = on);
grant select on admin_engagement_coverage to authenticated;

notify pgrst, 'reload schema';
