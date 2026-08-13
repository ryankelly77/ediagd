-- ============================================================================
-- EDIAGD — 0042 Two defects the April/May backfill exposed
--
-- Both were found by checking what actually landed rather than by trusting the
-- import's own success report, which said "committed" for all three files.
--
-- ---------------------------------------------------------------------------
-- 1. NINE OF ELEVEN ROOFTOPS GOT NO APRIL OR MAY PERIOD
-- ---------------------------------------------------------------------------
-- The daily rows landed correctly for all eleven stores — 8,464 April detail
-- rows, 8,216 for May, every dealer present. But only Doggett Ford and Doggett
-- Honda of Beaumont ended up with a perf_period, so nine stores' backfill was
-- invisible to every screen.
--
-- The cause is in commitImport, not here: it read the rooftops to rebuild with
--
--     .from("dms_import_row").select("rooftop_id").eq("import_id", …)
--
-- and PostgREST caps a select at 1,000 rows. The April import staged 8,464, so
-- the loop only ever saw the first thousand — which, because staging is written
-- dealer by dealer, covered two stores. A bounded read that silently truncated,
-- reported as success.
--
-- The fix is to stop shipping the scope through the API at all:
-- rebuild_dms_periods_for_import() derives it in SQL, where DISTINCT over
-- 8,464 rows costs nothing and no limit applies.
--
-- ---------------------------------------------------------------------------
-- 2. MAY WAS FLAGGED PARTIAL BECAUSE IT ENDS ON A SUNDAY
-- ---------------------------------------------------------------------------
-- is_partial was `last_day < month_end`. May's data runs through Saturday the
-- 30th; the 31st is a Sunday nobody worked. So a complete May was labelled
-- "(partial)" everywhere, excluded from `lastComplete`, and would have been
-- compared on worked days as though it were still running.
--
-- A month is complete when its data reaches the last WEEKDAY, not the last
-- calendar day. April (ends Thursday) and July (ends Friday) were unaffected,
-- which is why this did not show up until a month ended on a weekend — it
-- would have recurred every few months forever.
-- ============================================================================


-- ---- 1. Complete means "through the last weekday" ---------------------------

create or replace function month_last_weekday(_month_start date)
returns date
language sql
immutable
as $$
  select max(g.day)::date
    from generate_series(
           _month_start,
           (_month_start + interval '1 month - 1 day')::date,
           interval '1 day'
         ) g(day)
   where extract(isodow from g.day) < 6
$$;

comment on function month_last_weekday(date) is
  'Last Mon-Fri of the month. A month whose data reaches this day is complete, '
  'even when the calendar runs on into a weekend nobody worked.';


-- ---- 2. The rebuild, with the corrected partial test ------------------------

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
    -- THE FIX: measured against the last WEEKDAY.
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
        source_file      = excluded.source_file;
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

  return jsonb_build_object(
    'periods_written', _periods,
    'periods_rebuilt', _lines,
    'op_metrics', _metrics,
    'advisor_totals', _totals
  );
end $$;

revoke all on function rebuild_dms_periods(uuid, date) from public, anon;
grant execute on function rebuild_dms_periods(uuid, date) to authenticated;


-- ---- 3. Rebuild an import's scope without shipping it through the API -------
/**
 * Rebuild exactly the (rooftop, month) pairs one import touched.
 *
 * The scope is derived HERE, from dms_import_row, because the caller cannot
 * read it reliably: PostgREST caps a select at 1,000 rows and an import stages
 * thousands. Nine rooftops lost their April and May periods to that cap, and
 * the only symptom was an absence.
 *
 * Still scoped — one import's rooftops and months, not the whole network.
 */
create or replace function rebuild_dms_periods_for_import(_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _r      record;
  _out    jsonb := '[]'::jsonb;
  _n      int := 0;
begin
  if not (
    is_platform_owner()
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
       = 'service_role'
  ) then
    raise exception 'rebuild_dms_periods_for_import: platform owner only';
  end if;

  for _r in
    select distinct rooftop_id, date_trunc('month', report_date)::date as month_start
      from dms_import_row
     where import_id = _import_id
       and rooftop_id is not null
  loop
    _out := _out || rebuild_dms_periods(_r.rooftop_id, _r.month_start);
    _n := _n + 1;
  end loop;

  return jsonb_build_object('scopes_rebuilt', _n, 'results', _out);
end $$;

revoke all on function rebuild_dms_periods_for_import(uuid) from public, anon;
grant execute on function rebuild_dms_periods_for_import(uuid) to authenticated;

notify pgrst, 'reload schema';
