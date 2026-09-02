-- ============================================================================
-- EDIAGD — 0077 The writers catch up with the partial indexes
--
-- 0074 made three mappings append-only. It dropped their primary keys and put
-- a PARTIAL unique index in each one's place — "one live row per key, any
-- number of retired ones" — and its section 4 named the problem this migration
-- finishes: `on conflict` cannot use a partial index without repeating its
-- predicate. Four writers still name the old shape and every one of them now
-- raises 42P10:
--
--   commit_dms_import      insert into sub_category_map … on conflict
--                          (rooftop_id, sub_category) — THE DMS IMPORT CANNOT
--                          COMMIT. This is the one that matters today.
--   seed_op_text_rules     on conflict (sub_category), which also takes
--                          `npm run remap` down with it
--   scripts/seed-op-code-family.ts   upsert on `code`, via PostgREST
--   lib/dms/mapping-actions.ts       upsert on (rooftop_id, sub_category) —
--                          rewritten properly in the next commit, not here
--
-- The fix is one clause: `on conflict (key) where retired_at is null`. That
-- names the partial index exactly, so the arbiter is inferable again, and it
-- says the true thing as well — a seeder writes to the CURRENT version.
--
-- ---------------------------------------------------------------------------
-- AND WHILE WE ARE HERE: A SEEDER THAT DELETED THE HISTORY
-- ---------------------------------------------------------------------------
-- set_op_text_rules still runs `delete from op_text_rule where true`. Before
-- 0074 that removed one row per rule and was the whole point — the file is
-- authoritative, so a rule dropped from the file must not survive. After 0074
-- the table holds every historical VERSION of every rule, and the delete takes
-- those with it: the record of which rule produced which month, which is the
-- only thing making a rebuild reproducible, gone with no trace.
--
-- Its guard has the matching blind spot. It refuses when an `origin = 'admin'`
-- row exists, with no `retired_at` filter — so it is asking about the live
-- population while the delete reaches every row. A rule Mitch edited and then
-- superseded is invisible to the guard and destroyed by the delete.
--
-- Both halves are fixed below: retire rather than delete, and ask the question
-- about every row rather than the live ones.
-- ============================================================================


-- ---- 1. The DMS import can commit again -------------------------------------
/*
 * Byte-identical to the 0041 body except for the sub_category_map insert. It is
 * reproduced in full rather than patched because `create or replace function`
 * has no other form, and a reader comparing the two should find exactly one
 * difference.
 */
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

  /*
   * THE ONE CHANGED STATEMENT.
   *
   * `where retired_at is null` names sub_category_map_live_idx, the partial
   * index 0074 put where the primary key used to be. Without it Postgres has no
   * arbiter to infer and raises 42P10, which aborts this whole function — and
   * with it the entire import, since this is one transaction.
   *
   * `effective_from` is stamped at genesis to match 0074's backdate. These rows
   * are placeholders the machine discovered, not decisions anybody made, so
   * they carry `origin = 'file'` by default and reach back as far as the seeded
   * mappings do. A placeholder effective from today would leave every
   * historical period unable to see the sub-category it is made of.
   */
  insert into sub_category_map (rooftop_id, sub_category, family, status, effective_from)
  select distinct s.rooftop_id, s.sub_category, null, 'unmapped', '2000-01-01'::date
    from dms_import_row s
   where s.import_id = _import_id
  on conflict (rooftop_id, sub_category) where retired_at is null do nothing;

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


-- ---- 2. The additive rule seeder ------------------------------------------
/*
 * Same one-clause fix, plus the genesis stamp. A rule the file adds is a rule
 * that was always meant to apply, so it reaches back like every other seeded
 * row — a rule effective from the day somebody happened to run the seeder would
 * be invisible to every period already measured.
 */
create or replace function seed_op_text_rules(_rules jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare _n int := 0;
begin
  if not (
    is_platform_owner()
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
       = 'service_role'
  ) then
    raise exception 'seed_op_text_rules: platform owner only';
  end if;

  insert into op_text_rule (
    sub_category, family, include_pattern, exclude_pattern, priority, note,
    origin, effective_from)
  select normalise_sub_category(r.sub_category), r.family, r.include_pattern,
         nullif(r.exclude_pattern, ''), coalesce(r.priority, 100), r.note,
         'file', '2000-01-01'::date
    from jsonb_to_recordset(_rules) as r(
      sub_category text, family text, include_pattern text,
      exclude_pattern text, priority int, note text
    )
  on conflict (sub_category) where retired_at is null do nothing;

  get diagnostics _n = row_count;
  return _n;
end $$;

revoke all on function seed_op_text_rules(jsonb) from public, anon;
grant execute on function seed_op_text_rules(jsonb) to authenticated;


-- ---- 3. The authoritative reset stops destroying the history ---------------
/**
 * Replace every rule with the file's, WITHOUT deleting what was there.
 *
 * ---------------------------------------------------------------------------
 * WHY RETIRE AT ITS OWN effective_from RATHER THAN AT TODAY
 * ---------------------------------------------------------------------------
 * "The file is authoritative" is a CORRECTION in 0074's vocabulary: it asserts
 * the old values were never right, not that they were right until now. So each
 * outgoing version is retired at the date it began, which makes its interval
 * EMPTY — `effective_from <= d < retired_at` is false for every d. The row
 * survives as a record of what was once believed; it applies to nothing.
 *
 * Retiring at today's date instead would leave every past period still measured
 * under the old rule while the new one claimed the same span from genesis — two
 * rows matching one period, which is the overlap 0078's exclusion constraint
 * exists to make impossible.
 *
 * A rule the file no longer contains is retired and NOT replaced, which is the
 * delete's intent preserved: it stops applying, and it stops being a rule.
 */
create or replace function set_op_text_rules(_rules jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  _n       int := 0;
  _edited  text;
begin
  if not (
    is_platform_owner()
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
       = 'service_role'
  ) then
    raise exception 'set_op_text_rules: platform owner only';
  end if;

  /*
   * THE INVERSION, ENFORCED — now over the right population.
   *
   * The guard used to read the live rows while the statement below reached
   * every row, so a rule somebody edited and later superseded was invisible to
   * the check and destroyed by the write. `retired_at` is deliberately not
   * filtered here: an admin edit is a fact about the row's history, and the
   * file does not get to overwrite it just because a newer version exists.
   */
  select string_agg(distinct sub_category, ', ' order by sub_category)
    into _edited
    from op_text_rule
   where origin = 'admin';

  if _edited is not null then
    raise exception
      'set_op_text_rules: refusing to wipe admin-edited rules (%). '
      'op_text_rule is authoritative since 0071 — use seed_op_text_rules() to '
      'add missing rules without destroying these, or reset origin to ''file'' '
      'on a rule you genuinely want the file to own again.', _edited;
  end if;

  -- Retire, never delete. Each version collapses to an empty interval at the
  -- date it began, so it applies to no period and is still on the record.
  update op_text_rule
     set retired_at = effective_from,
         updated_at = now()
   where retired_at is null;

  insert into op_text_rule (
    sub_category, family, include_pattern, exclude_pattern, priority, note,
    origin, effective_from)
  select normalise_sub_category(r.sub_category), r.family, r.include_pattern,
         nullif(r.exclude_pattern, ''), coalesce(r.priority, 100), r.note,
         'file', '2000-01-01'::date
    from jsonb_to_recordset(_rules) as r(
      sub_category text, family text, include_pattern text,
      exclude_pattern text, priority int, note text
    );
  get diagnostics _n = row_count;
  return _n;
end $$;

revoke all on function set_op_text_rules(jsonb) from public, anon;
grant execute on function set_op_text_rules(jsonb) to authenticated;


-- ---- 4. The family seeder moves into the database --------------------------
/**
 * Seed op_code_family from the CSV, additively, respecting admin edits.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A FUNCTION AND NOT STILL A POSTGREST UPSERT
 * ---------------------------------------------------------------------------
 * scripts/seed-op-code-family.ts called `.upsert(rows, { onConflict: "code" })`,
 * and PostgREST has no way to express a partial index's predicate — the
 * `on_conflict` parameter takes column names and nothing else. There is no
 * clause to add on that side, so the write comes down here where the predicate
 * can be written, alongside seed_op_text_rules which is already shaped this way
 * for the same reason.
 *
 * `do update … where op_code_family.origin = 'file'` is the 0073 guard restated
 * in SQL. The script still filters admin rows out of the payload and NAMES
 * them, because being told which rows kept their edits is the point; this is
 * the backstop for every future caller that forgets.
 */
create or replace function seed_op_code_family(_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare _n int := 0;
begin
  if not (
    is_platform_owner()
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
       = 'service_role'
  ) then
    raise exception 'seed_op_code_family: platform owner only';
  end if;

  insert into op_code_family (
    code, family, coachable, confidence, note, origin, effective_from, updated_at)
  select r.code, r.family, coalesce(r.coachable, true),
         coalesce(r.confidence, 'high'), r.note, 'file', '2000-01-01'::date, now()
    from jsonb_to_recordset(_rows) as r(
      code text, family text, coachable boolean, confidence text, note text
    )
  on conflict (code) where retired_at is null do update
     set family     = excluded.family,
         coachable  = excluded.coachable,
         confidence = excluded.confidence,
         note       = excluded.note,
         updated_at = now()
   where op_code_family.origin = 'file';

  get diagnostics _n = row_count;
  return _n;
end $$;

revoke all on function seed_op_code_family(jsonb) from public, anon;
grant execute on function seed_op_code_family(jsonb) to authenticated;
