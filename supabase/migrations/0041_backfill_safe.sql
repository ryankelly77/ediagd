-- ============================================================================
-- EDIAGD — 0041 Make an older month safe to upload
--
-- Prep for backfilling April and May, which is the first time a month OLDER
-- than what is already loaded goes through the importer. The audit found one
-- serious defect and one naming problem.
--
-- ---------------------------------------------------------------------------
-- 1. THE SUPERSEDE RULE RETIRED THE WRONG PERIODS
-- ---------------------------------------------------------------------------
-- commit_dms_import marks a perf_period superseded when committed daily data
-- fully covers it. The intent was narrow: retire the June CDJR month that came
-- from the OLD OpCode export, so the same month is not counted twice once it
-- arrives at day grain.
--
-- The predicate never checked WHICH FORMAT the period came from. So it also
-- matched periods that were themselves derived from daily data — and those are
-- fully covered by definition. The consequence:
--
--     uploading ANY further month retires every complete daily-derived month
--     that already exists.
--
-- Demonstrated on the local mirror, where July 2026 is already superseded: it
-- fired the second time the workbook was committed, once the July period
-- existed. Production escaped only because its commit happened before
-- rebuild_dms_periods had created any daily periods at all. An April upload
-- would have retired July, and July is the month every screen currently
-- defaults its coaching to.
--
-- The fix is one clause: only ever retire a period from a DIFFERENT source
-- format. A daily-derived month is not superseded by more daily data — it is
-- rebuilt by it, which rebuild_dms_periods already does.
--
-- ---------------------------------------------------------------------------
-- 2. source_kind NOW NAMES THE REPORT, NOT THE MECHANISM
-- ---------------------------------------------------------------------------
-- 'dms_daily' described how the rows arrived. With three formats in play the
-- useful question is WHICH REPORT produced a month, because that is what makes
-- two months comparable or not:
--
--     'dynatron'  the daily Dynatron feed        (Apr, May, Jul, Aug)
--     'opcode'    the older OpCode Analysis export (Jun)
--     'monthly'   left as-is on demo/seed periods, which came from neither
--
-- June becomes a permanent island between two Dynatron runs, and the trend
-- logic keys on this column to refuse comparing across it.
-- ============================================================================


-- ---- 1. Rename the formats --------------------------------------------------
-- Only rows we can identify. Demo seed periods stay 'monthly': they came from
-- the seeder, and relabelling 600 of them 'opcode' would assert something
-- untrue about where they came from.

update perf_period set source_kind = 'dynatron' where source_kind = 'dms_daily';

update perf_period set source_kind = 'opcode'
 where source_kind = 'monthly'
   and source_file like 'OpCode%';

comment on column perf_period.source_kind is
  'Which report produced this month: dynatron (daily feed), opcode (the older '
  'OpCode Analysis export), or monthly (demo/seed). Two months are only '
  'comparable when this matches — see lib/advisor-trend.ts.';


-- ---- 2. Un-retire anything the old rule wrongly retired ---------------------
-- Idempotent, and a no-op on a database where it never fired.

update perf_period
   set superseded_at = null
 where superseded_at is not null
   and source_kind = 'dynatron';


-- ---- 3. The corrected commit ------------------------------------------------
-- Identical to 0038's function except for the source_kind guard in `covered`
-- and the format name it writes.

create or replace function commit_dms_import(
  _import_id uuid,
  _org_name  text default 'Doggett Automotive Group'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _org_id           uuid;
  _rooftops_created int := 0;
  _advisors_touched int := 0;
  _rows_deleted   int := 0;
  _rows_inserted  int := 0;
  _tot_deleted    int := 0;
  _tot_inserted   int := 0;
  _superseded     int := 0;
  _status         text;
begin
  if not (
    is_platform_owner()
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
       = 'service_role'
  ) then
    raise exception 'commit_dms_import: platform owner only';
  end if;

  select status into _status from dms_import where id = _import_id;
  if _status is null then
    raise exception 'commit_dms_import: no such import %', _import_id;
  end if;
  if _status = 'committed' then
    raise exception 'commit_dms_import: % is already committed', _import_id;
  end if;

  select id into _org_id from org where name = _org_name;
  if _org_id is null then
    insert into org (name) values (_org_name) returning id into _org_id;
  end if;

  insert into rooftop (org_id, name)
  select distinct _org_id, s.dealer_name
    from dms_import_row s
   where s.import_id = _import_id
     and s.rooftop_id is null
     and not exists (select 1 from rooftop r where lower(btrim(r.name)) = lower(btrim(s.dealer_name)));
  get diagnostics _rooftops_created = row_count;

  update dms_import_row s
     set rooftop_id = r.id
    from rooftop r
   where s.import_id = _import_id
     and s.rooftop_id is null
     and lower(btrim(r.name)) = lower(btrim(s.dealer_name));

  update dms_import_advisor_total s
     set rooftop_id = r.id
    from rooftop r
   where s.import_id = _import_id
     and s.rooftop_id is null
     and lower(btrim(r.name)) = lower(btrim(s.dealer_name));

  if exists (select 1 from dms_import_row where import_id = _import_id and rooftop_id is null) then
    raise exception 'commit_dms_import: staged rows still have no rooftop';
  end if;

  insert into dms_advisor (rooftop_id, advisor_op_id, display_name, first_seen, last_seen)
  select s.rooftop_id, s.advisor_op_id,
         min(s.advisor_raw), min(s.report_date), max(s.report_date)
    from dms_import_row s
   where s.import_id = _import_id
   group by s.rooftop_id, s.advisor_op_id
  on conflict (rooftop_id, advisor_op_id) do update
     set display_name = excluded.display_name,
         first_seen   = least(dms_advisor.first_seen, excluded.first_seen),
         last_seen    = greatest(dms_advisor.last_seen, excluded.last_seen);
  get diagnostics _advisors_touched = row_count;

  insert into sub_category_map (rooftop_id, sub_category, family, status)
  select distinct s.rooftop_id, s.sub_category, null, 'unmapped'
    from dms_import_row s
   where s.import_id = _import_id
  on conflict (rooftop_id, sub_category) do nothing;

  create temp table _days on commit drop as
  select distinct rooftop_id, report_date
    from dms_import_row where import_id = _import_id;

  delete from dms_daily_metric d
   using _days a
   where d.rooftop_id = a.rooftop_id and d.report_date = a.report_date;
  get diagnostics _rows_deleted = row_count;

  insert into dms_daily_metric (
    rooftop_id, report_date, advisor_op_id, sub_category, op_code, op_description,
    cp_ros, frhs, frhs_per_ro, labor_sales, labor_per_ro, labor_gp_pct,
    tot_per_ro, elr, num_ros, labor_gp, parts_gp, gp, gp_pct, import_id)
  select rooftop_id, report_date, advisor_op_id, sub_category, op_code, op_description,
         cp_ros, frhs, frhs_per_ro, labor_sales, labor_per_ro, labor_gp_pct,
         tot_per_ro, elr, num_ros, labor_gp, parts_gp, gp, gp_pct, _import_id
    from dms_import_row
   where import_id = _import_id;
  get diagnostics _rows_inserted = row_count;

  delete from dms_daily_advisor_total d
   using _days a
   where d.rooftop_id = a.rooftop_id and d.report_date = a.report_date;
  get diagnostics _tot_deleted = row_count;

  insert into dms_daily_advisor_total (
    rooftop_id, report_date, advisor_op_id, unique_ros, frhs, labor_sales,
    labor_per_ro, elr, gp, gp_pct, import_id)
  select rooftop_id, report_date, advisor_op_id, unique_ros, frhs, labor_sales,
         labor_per_ro, elr, gp, gp_pct, _import_id
    from dms_import_advisor_total
   where import_id = _import_id
     and rooftop_id is not null;
  get diagnostics _tot_inserted = row_count;

  -- ---- retire a month only when a DIFFERENT report already covered it ----
  -- THE FIX. Without the source_kind guard this also retires daily-derived
  -- months, which are fully covered by definition — so every upload after the
  -- first quietly deleted the previous months from every screen.
  with covered as (
    select p.id
      from perf_period p
     where p.superseded_at is null
       and p.source_kind is distinct from 'dynatron'
       and exists (select 1 from _days d where d.rooftop_id = p.rooftop_id)
       and not exists (
         select 1
           from generate_series(p.starts_on, p.ends_on, interval '1 day') g(day)
          where extract(isodow from g.day) < 6
            and not exists (
              select 1 from dms_daily_metric m
               where m.rooftop_id = p.rooftop_id
                 and m.report_date = g.day::date
            )
       )
  )
  update perf_period set superseded_at = now()
   where id in (select id from covered);
  get diagnostics _superseded = row_count;

  update dms_import
     set status = 'committed', committed_at = now()
   where id = _import_id;

  return jsonb_build_object(
    'import_id', _import_id,
    'rooftops_created', _rooftops_created,
    'advisors_upserted', _advisors_touched,
    'metric_rows_deleted', _rows_deleted,
    'metric_rows_inserted', _rows_inserted,
    'advisor_totals_deleted', _tot_deleted,
    'advisor_totals_inserted', _tot_inserted,
    'monthly_periods_superseded', _superseded
  );
end $$;

revoke all on function commit_dms_import(uuid, text) from public, anon;
grant execute on function commit_dms_import(uuid, text) to authenticated;


-- ---- 4. The rebuild writes the new format name ------------------------------

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

  /*
   * A month is PARTIAL when its data stops before the month does — measured
   * against the calendar, not against "is this the newest month we have".
   * Backfilling April must produce a complete April, and it does: April's data
   * runs to the 30th, so last_day = month_end and is_partial is false. Nothing
   * here knows or cares which month is newest.
   */
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
