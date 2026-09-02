-- ============================================================================
-- EDIAGD — 0078 An edit is one statement, and an interval cannot overlap
--
-- 0074 stored the epochs, 0075 taught the rebuild and the attach view to read
-- them, and 0076 gave the automap a dry run. What none of them did is make the
-- WRITE side safe, and three defects have been sitting in that gap:
--
--   1  sub_category_map is edited IN PLACE. 0075's own header says this table
--      "rewrote every historical attach rate the instant it was saved — no
--      rebuild required, no trace that anything happened", and then fixed only
--      the reader. All four editors in lib/dms/mapping-actions.ts still update
--      the live row, so the 815 rows behave exactly as they did before 0074.
--
--   2  The retire and the insert are two network calls. lib/mapping/admin-
--      actions.ts compensates when the insert fails, but the compensation is
--      itself a call that can fail, and a process death between the two leaves
--      a key with NO LIVE ROW — the code falls silently out of every family and
--      the loop degrades to family grain with nothing recording why.
--
--   3  The live-row index does not stop overlapping HISTORY. It is unique over
--      `retired_at is null`, which guarantees one current row and says nothing
--      about the retired ones. A Correction applied after a Change leaves the
--      original (retired at the change date) and the correction (live from
--      genesis) both matching every period in between.
--
-- ---------------------------------------------------------------------------
-- THE SHAPE OF AN EDIT, ONCE, FOR ALL THREE TABLES
-- ---------------------------------------------------------------------------
--   CORRECTION  every existing version is retired AT ITS OWN effective_from,
--               which makes each interval empty — `effective_from <= d
--               < retired_at` is false for every d. The rows survive as a
--               record of what was once believed; they apply to nothing. Then
--               one new row from genesis.
--
--   CHANGE      the live version is retired at the new date and the new row
--               starts there. Half-open, so they meet and never overlap.
--
-- Retiring a correction's older versions at GENESIS rather than at their own
-- start was the obvious first draft and it is wrong: a version that began in
-- October would get `retired_at` in 2000, an inverted interval that reads as
-- corrupt to anybody who looks and that the check constraint below refuses.
-- Retiring each at its own start says the same thing — this applied to nothing —
-- in a form that is still a legible date range.
-- ============================================================================


-- ---- 1. An interval must be sane, and two of them must not overlap ---------
/*
 * `>=` RATHER THAN `>`, DELIBERATELY.
 *
 * An empty interval (retired_at = effective_from) is not a mistake, it is how a
 * correction says "this version applied to nothing" while keeping the row. It
 * is what set_op_text_rules writes in 0077 and what mapping_edit() writes
 * below. `>` would reject the correction path this migration exists to make
 * correct. What must stay impossible is the INVERTED interval — retired before
 * effective — which is the symptom of a version retired at somebody else's
 * date, and `>=` is exactly the line between the two.
 */
alter table sub_category_map drop constraint if exists sub_category_map_interval_sane;
alter table sub_category_map add constraint sub_category_map_interval_sane
  check (retired_at is null or retired_at >= effective_from);

alter table op_text_rule drop constraint if exists op_text_rule_interval_sane;
alter table op_text_rule add constraint op_text_rule_interval_sane
  check (retired_at is null or retired_at >= effective_from);

alter table op_code_family drop constraint if exists op_code_family_interval_sane;
alter table op_code_family add constraint op_code_family_interval_sane
  check (retired_at is null or retired_at >= effective_from);

/*
 * THE CONSTRAINT THE PARTIAL INDEX WAS MISTAKEN FOR.
 *
 * `<key>_live_idx` guarantees one CURRENT row per key. That is not the property
 * the interval test needs — it needs "for any date, at most one row applies",
 * which is a statement about the retired rows too. An exclusion constraint over
 * daterange(effective_from, retired_at) is that statement, and Postgres
 * enforces it on every write rather than leaving it to whoever wrote the editor.
 *
 * Empty ranges never overlap anything, so the corrections above pass. Adjacent
 * ranges do not overlap either, so a Change meeting its predecessor passes.
 * btree_gist is what lets a plain `=` on the key sit in the same constraint as
 * the `&&` on the range.
 *
 * Verified against production before writing this: 0 overlapping pairs and 0
 * inverted intervals across all three tables, so both constraints apply to the
 * existing 897 rows without a single exception.
 */
create extension if not exists btree_gist;

alter table sub_category_map drop constraint if exists sub_category_map_no_overlap;
alter table sub_category_map add constraint sub_category_map_no_overlap
  exclude using gist (
    rooftop_id with =,
    sub_category with =,
    daterange(effective_from, retired_at) with &&
  );

alter table op_text_rule drop constraint if exists op_text_rule_no_overlap;
alter table op_text_rule add constraint op_text_rule_no_overlap
  exclude using gist (
    sub_category with =,
    daterange(effective_from, retired_at) with &&
  );

alter table op_code_family drop constraint if exists op_code_family_no_overlap;
alter table op_code_family add constraint op_code_family_no_overlap
  exclude using gist (
    code with =,
    daterange(effective_from, retired_at) with &&
  );


-- ---- 2. One statement, so a crash cannot land between the halves -----------
/**
 * Retire the current version of a mapping and insert its replacement.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS IN THE DATABASE AND NOT IN THE SERVER ACTION
 * ---------------------------------------------------------------------------
 * Because the two halves have to be one thing. The TypeScript version was an
 * update, then an insert, then a compensating update if the insert failed —
 * three round trips with two windows in them, and the compensation could fail
 * on its own. What is on the other side of those windows is a key with no live
 * row: `<table>_live` returns nothing for it, loadCoachableCodes drops the code,
 * and the advisor's block quietly falls back to family grain. Nothing errors
 * and nothing records it. Postgres closes the window for free.
 *
 * ---------------------------------------------------------------------------
 * ONE FUNCTION, THREE TABLES, AN ALLOW-LIST
 * ---------------------------------------------------------------------------
 * The alternative was three near-identical functions, and three copies of this
 * logic is how one of them ends up subtly different — the difference showing up
 * later as a period measured under two mappings. `_table` is checked against a
 * literal list before it reaches format(), so the dynamic SQL cannot be pointed
 * anywhere else.
 *
 * The new row INHERITS the old one. Only the columns in `_values` change, so a
 * caller editing a family does not have to know that sub_category_map also
 * carries status, confirmed_by and created_at — and cannot blank one by
 * forgetting it.
 */
create or replace function mapping_edit(
  _table          text,
  _key            jsonb,
  _values         jsonb,
  _mode           text,
  _effective_from date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _genesis   constant date := '2000-01-01';
  _eff       date;
  _where     text;
  _k         text;
  _prior     jsonb;
  _prior_eff date;
  _payload   jsonb;
  _retired   int := 0;
begin
  if not (
    is_platform_owner()
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
       = 'service_role'
  ) then
    raise exception 'mapping_edit: platform owner only';
  end if;

  if _table not in ('sub_category_map', 'op_text_rule', 'op_code_family') then
    raise exception 'mapping_edit: % is not a versioned mapping', _table;
  end if;
  if _mode not in ('correction', 'change') then
    raise exception 'mapping_edit: mode must be correction or change, not %', _mode;
  end if;
  if _key is null or jsonb_typeof(_key) <> 'object' or _key = '{}'::jsonb then
    raise exception 'mapping_edit: a key is required';
  end if;

  _eff := case when _mode = 'correction'
               then _genesis
               else coalesce(_effective_from, current_date) end;

  -- The key predicate, cast through text so one branch covers uuid and text
  -- alike. Values arrive as literals via quote_literal, never interpolated raw.
  select string_agg(format('%I::text = %L', k, _key ->> k), ' and ' order by k)
    into _where
    from jsonb_object_keys(_key) as k;

  -- The version being replaced. Locked, so two admins editing the same key
  -- serialise here rather than racing to leave two live rows behind.
  execute format(
    'select to_jsonb(t), t.effective_from from %I t where %s and t.retired_at is null for update',
    _table, _where
  ) into _prior, _prior_eff;

  if _prior is null then
    raise exception 'mapping_edit: % has no live row for %', _table, _key;
  end if;

  /*
   * A CHANGE CANNOT START BEFORE THE VERSION IT REPLACES.
   *
   * Retiring a row at a date earlier than its own start would invert its
   * interval, which the check constraint refuses — correctly, but with a
   * constraint name rather than a sentence. An edit dated before the current
   * mapping began is not a change, it is a correction, and saying so is more
   * use to the person than a 23514.
   */
  if _mode = 'change' and _eff < _prior_eff then
    raise exception
      'mapping_edit: the current mapping began on %, so a change cannot take '
      'effect on %. An edit that reaches back before the value it replaces is '
      'a correction, not a change.', _prior_eff, _eff;
  end if;

  if _mode = 'correction' then
    -- Every version, live or already retired, collapses to an empty interval at
    -- its own start. "No period should ever have been measured under any of
    -- these" is what a correction asserts, and this is that sentence in dates.
    execute format(
      'update %I t set retired_at = t.effective_from, updated_at = now() '
      '  where %s and (t.retired_at is null or t.retired_at <> t.effective_from)',
      _table, _where
    );
  else
    execute format(
      'update %I t set retired_at = %L, updated_at = now() where %s and t.retired_at is null',
      _table, _eff, _where
    );
  end if;
  get diagnostics _retired = row_count;

  -- Inherit the prior version, then apply the edit on top of it.
  _payload := _prior
    || _values
    || _key
    || jsonb_build_object(
         'id',             gen_random_uuid(),
         'effective_from', _eff,
         'retired_at',     null,
         'origin',         'admin',
         'updated_at',     now()
       );

  execute format('insert into %I select * from jsonb_populate_record(null::%I, $1)', _table, _table)
    using _payload;

  return jsonb_build_object(
    'table', _table,
    'mode', _mode,
    'effective_from', _eff,
    'versions_retired', _retired
  );
end $$;

revoke all on function mapping_edit(text, jsonb, jsonb, text, date) from public, anon;
grant execute on function mapping_edit(text, jsonb, jsonb, text, date) to authenticated;


-- ---- 3. The labor view reads the rules that were in force that month -------
/**
 * 0075 fixed advisor_family_attach and missed the view sitting next to it.
 *
 * advisor_family_labor joins sub_category_map BARE — no period, no interval
 * test — which was invisible while every key had exactly one version and
 * becomes wrong the moment one has two: the join matches both, sum(m.ros) and
 * sum(m.labor_sales) double, and labor_per_ro is computed against a doubled
 * denominator. That number is what lib/family-labor.ts turns into
 * `opportunity`, which is what Eddie's Pick RANKS on — so the rate half of the
 * pick would stay right while the dollar half quietly went wrong, which is the
 * worst of the available failures because nothing on the screen disagrees.
 *
 * THE 0055 CLAMP LANDS HERE TOO. The DMS feed carries no RO ids, so a family's
 * RO count can exceed the advisor's total; advisor_family_attach clamps with
 * `least(fam_ros, total_ros)` and exposes what it clamped away. This view
 * divided by the RAW figure, which understates labor_per_ro wherever there is
 * overflow — 61 ROs on Maintenance and 16 on Accessories in production today.
 * Both views now clamp the same way and expose the same two extra columns, so
 * `fam_ros` means one thing across the pipeline.
 *
 * `fam_ros` KEEPS ITS NAME AND CHANGES ITS VALUE. Renaming it to make the
 * change loud is not available — `create or replace view` cannot drop or
 * reorder columns — and adding a second name for the clamped figure would leave
 * the raw one in place for the next caller to reach for by accident. The raw
 * figure is still there, called what advisor_family_attach calls it.
 */
create or replace view advisor_family_labor as
with fam as (
  select
    m.period_id,
    m.rooftop_id,
    m.advisor_op_id,
    coalesce(m.resolved_family, scm.family, sl.family, sl.category) as family,
    sum(m.ros)         as fam_ros,
    sum(m.labor_sales) as labor_sales
  from advisor_op_metric m
  join perf_period p on p.id = m.period_id
  left join service_line sl on sl.op_code = m.op_code
  left join sub_category_map scm
    on m.sub_category is not null
   and scm.rooftop_id = m.rooftop_id
   and scm.sub_category = m.sub_category
   /* The interval test, identical to advisor_family_attach's. */
   and scm.effective_from <= p.starts_on
   and (scm.retired_at is null or p.starts_on < scm.retired_at)
  where
    (m.sub_category is null or scm.family is not null or m.resolved_family is not null)
    and (scm.status is null or scm.status <> 'not_coachable')
  group by 1, 2, 3, 4
)
select
  f.period_id,
  f.rooftop_id,
  f.advisor_op_id,
  f.family,
  least(f.fam_ros, t.total_ros)                        as fam_ros,
  f.labor_sales,
  case when least(f.fam_ros, t.total_ros) > 0
       then round(f.labor_sales / least(f.fam_ros, t.total_ros), 2)
  end                                                  as labor_per_ro,
  f.fam_ros                                            as fam_ros_raw,
  greatest(f.fam_ros - t.total_ros, 0)                 as ros_overflow
from fam f
join advisor_period_total_src t using (period_id, rooftop_id, advisor_op_id)
where f.family is not null;

alter view advisor_family_labor set (security_invoker = on);


-- ---- 4. The documented seedable rule matches what the seeders do ------------
/*
 * `origin = 'file'` with no retired_at filter reports a code as seedable when
 * its RETIRED version came from the file and its live one is somebody's edit —
 * which is precisely the row 0073 exists to protect. The seeders read the table
 * directly and happen to get this right; the view is the rule as written down,
 * and it disagreed with them.
 */
create or replace view mapping_seedable as
  select 'op_code_catalog'::text as table_name, code
    from op_code_catalog where origin = 'file' and retired_at is null
  union all
  select 'op_code_family'::text, code
    from op_code_family where origin = 'file' and retired_at is null;

alter view mapping_seedable set (security_invoker = on);
grant select on mapping_seedable to authenticated;
