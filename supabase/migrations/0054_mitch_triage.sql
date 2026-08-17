-- ============================================================================
-- EDIAGD — 0054 Mitch's triage, and the grain it needed
--
-- The 46 sub-categories that had been sitting unmapped went to Mitch as a
-- decision sheet and came back ruled: 18 not coachable, 12 mapped, 7 new, and
-- 9 marked PARTIAL or SPLIT — "the coachable service is in here, and so is
-- repair work, and you cannot tell them apart from the label".
--
-- Two things had to change before any of it could land.
--
-- ---------------------------------------------------------------------------
-- 1. HIS BIGGEST RULINGS HAD NOWHERE TO GO
-- ---------------------------------------------------------------------------
-- service_family held 13 names. Mitch's sheet routes $435K of Suspension, $540K
-- of HVAC, $639K of belt and cooling work and 1,611 wiper lines — and not one
-- of those had a family. Of his 12 "fully covered" labels, only four could be
-- stored at all.
--
-- Seven families are added, of two kinds.
--
-- Six are CONTENT-GATED: they map and they report, and they do not appear in
-- Eddie's Pick or any coaching surface until somebody writes cues against them.
-- All six have zero cues today. See COACHABLE_FAMILIES in lib/advisor.ts.
--
-- The seventh, Accessories, is mapped for REPORTING ONLY and never coaches at
-- all — it is in neither list in lib/advisor.ts, so no cue can switch it on.
--
-- ---------------------------------------------------------------------------
-- 2. PARTIAL AND SPLIT CANNOT BE RESOLVED AT SUB-CATEGORY GRAIN
-- ---------------------------------------------------------------------------
-- "Transmission" is a fluid service and a $9,000 replacement under one label.
-- Mapping the whole label either credits the replacement as a coachable sale or
-- throws the service away.
--
-- So the verdict moves down a level, to the op-code text the dealership itself
-- writes. Measured across the nine PARTIAL/SPLIT labels — $3,346,405 of labor —
-- $442,505 is defensibly coachable and $2.9M is repair. That 13% is not a weak
-- result; it is the reason Mitch marked them PARTIAL, and crediting the rest
-- would have inflated every advisor's attach rate at every store.
--
-- IT HAD TO BE DESCRIPTION GRAIN, NOT OP-CODE GRAIN. The obvious design — a map
-- from (rooftop, sub-category, op code) to a family — was measured first and
-- rejected: generic codes like 100, MISC, TRIM and ENGINE carry both service
-- and repair under one code, and keying there would have wrongly credited
-- $388,668 of repair as coachable. Nearly as much as the rule captures.
--
-- Hence resolved_family joins the advisor_op_metric grain. This is the same
-- move 0039 made when it found 440 of 3,413 op codes appearing under more than
-- one sub-category: when one key holds two kinds of work, the key is wrong.
-- A code whose descriptions disagree now produces two rows with the dollars and
-- ROs correctly apportioned, instead of one row filed under a guess.
-- ============================================================================


-- ---- 1. The seven new families ------------------------------------------------
--
-- The first six are content-gated: they map and report now, and coach once cues
-- are written against them.
--
-- Accessories (ACC-060) is a different kind and sorts last on purpose. It is
-- mapped for REPORTING ONLY and is never coached — it appears in neither list
-- in lib/advisor.ts, so no cue can ever switch it on. It exists because filing
-- glass, tint and data dots under Miscellaneous took one store's Miscellaneous
-- from 1.3% to 23.4% and made a bucket Mitch reads meaningless.

insert into service_family (name, sort_order) values
  ('HVAC',            140),
  ('Belts & Cooling', 150),
  ('Wipers',          160),
  ('Lighting',        170),
  ('Suspension',      180),
  ('Inspections',     190),
  ('Accessories',     200)
on conflict (name) do nothing;


-- ---- 2. Normalisation, shared with the rule file ------------------------------
/**
 * Mirror of normaliseSubCategory() in lib/dms/mapping.ts.
 *
 * TWO COPIES OF ONE FUNCTION, DELIBERATELY. The rules are authored and matched
 * in TypeScript; they are EVALUATED here, inside rebuild_dms_periods, because
 * that is the only place the op-code description still exists. If one changes,
 * change the other — the rule keys stop matching silently otherwise, which
 * looks like "no rows qualified" rather than like a bug.
 */
create or replace function normalise_sub_category(_raw text)
returns text
language sql
immutable
as $$
  select btrim(
           regexp_replace(
             regexp_replace(lower(coalesce(_raw, '')), '[&/,()–—-]', ' ', 'g'),
             '\s+', ' ', 'g'
           )
         )
$$;

grant execute on function normalise_sub_category(text) to authenticated;


-- ---- 3. The op-code text rules ------------------------------------------------
/**
 * One row per PARTIAL/SPLIT sub-category: which op-code descriptions inside it
 * are a coachable service, and which family they belong to.
 *
 * SEEDED BY scripts/remap.ts FROM lib/dms/mapping.ts, never by hand. The rule
 * file stays the single place a rule is written; this table is its projection
 * into the database, the same way sub_category_map is the projection of the
 * sub-category rules. A rule edited here and not there survives until the next
 * remap and then vanishes, which is the confusing failure this note exists to
 * prevent.
 *
 * PATTERNS ARE POSTGRES REGEX. The rule file writes word boundaries as \y for
 * exactly this reason: in Postgres \b is a backspace character, and a pattern
 * authored for JavaScript matches nothing here without complaining.
 */
create table if not exists op_text_rule (
  sub_category    text primary key,      -- normalised
  family          text not null references service_family(name) on delete restrict,
  include_pattern text not null,
  exclude_pattern text,
  priority        int  not null default 100,
  note            text,
  updated_at      timestamptz not null default now()
);

comment on table op_text_rule is
  'Projection of OP_TEXT_RULES in lib/dms/mapping.ts. Seeded by npm run remap. '
  'Evaluated by rebuild_dms_periods against dms_daily_metric.op_description, '
  'which is the last place the description exists.';

alter table op_text_rule enable row level security;

drop policy if exists op_text_rule_read on op_text_rule;
create policy op_text_rule_read on op_text_rule
  for select using ((select auth.uid()) is not null);

grant select on op_text_rule to authenticated;


/**
 * Replace the whole rule set in one statement.
 *
 * DELETE-THEN-INSERT rather than upsert: a rule REMOVED from the file must
 * disappear here too, and an upsert would leave it behind forever, still
 * silently classifying rows against a rule nobody can find.
 */
create or replace function set_op_text_rules(_rules jsonb)
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
    raise exception 'set_op_text_rules: platform owner only';
  end if;

  -- `where true` is not decoration: Supabase runs with a guard that rejects an
  -- unqualified DELETE, and without it this function fails at runtime only.
  delete from op_text_rule where true;

  insert into op_text_rule (sub_category, family, include_pattern, exclude_pattern, priority, note)
  select normalise_sub_category(r.sub_category), r.family, r.include_pattern,
         nullif(r.exclude_pattern, ''), coalesce(r.priority, 100), r.note
    from jsonb_to_recordset(_rules) as r(
      sub_category text, family text, include_pattern text,
      exclude_pattern text, priority int, note text
    );
  get diagnostics _n = row_count;
  return _n;
end $$;

revoke all on function set_op_text_rules(jsonb) from public, anon;
grant execute on function set_op_text_rules(jsonb) to authenticated;


-- ---- 4. resolved_family joins the metric grain --------------------------------

alter table advisor_op_metric
  add column if not exists resolved_family text;

comment on column advisor_op_metric.resolved_family is
  'Family decided from the op-code DESCRIPTION by op_text_rule, for labels that '
  'hold both service and repair. Null means the row is classified by its '
  'sub-category alone, which is the normal case.';

-- The grain widens with it. Without this a code carrying both a service and a
-- repair description collapses to one row and the insert trips the old index.
drop index if exists advisor_op_metric_grain_idx;

create unique index if not exists advisor_op_metric_grain_idx
  on advisor_op_metric (
    period_id, advisor_op_id, op_code,
    coalesce(sub_category, ''), coalesce(resolved_family, '')
  );


-- ---- 5. Not-coachable becomes something the rule file can say -----------------
/**
 * Extended so one call can carry both halves of Mitch's ruling: a family, or a
 * decision that there is no family and never will be.
 *
 * BACKWARD COMPATIBLE. jsonb_to_recordset returns null for a field the caller
 * did not send, so an older caller passing only (sub_category, family) behaves
 * exactly as before.
 *
 * Still only touches 'unmapped' rows, so a confirmed mapping is never reverted
 * by a later upload.
 */
create or replace function apply_sub_category_automap(
  _import_id uuid,
  _rules     jsonb
)
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
    raise exception 'apply_sub_category_automap: platform owner only';
  end if;

  update sub_category_map m
     set family = case when r.not_coachable then null else r.family end,
         status = case when r.not_coachable then 'not_coachable' else 'auto' end
    from jsonb_to_recordset(_rules) as r(
      sub_category text, family text, not_coachable boolean
    )
   where m.sub_category = r.sub_category
     and (r.family is not null or r.not_coachable)
     and m.status = 'unmapped'
     and m.rooftop_id in (
       select distinct rooftop_id from dms_import_row where import_id = _import_id
     );
  get diagnostics _n = row_count;
  return _n;
end $$;

revoke all on function apply_sub_category_automap(uuid, jsonb) from public, anon;
grant execute on function apply_sub_category_automap(uuid, jsonb) to authenticated;


-- ---- 6. The rebuild, now resolving op-code text -------------------------------
/**
 * Unchanged from 0044 except for the advisor_op_metric insert, which now asks
 * op_text_rule what each daily row is before it aggregates.
 *
 * RE-RUN THIS AFTER EVERY RULE CHANGE. The resolution is computed here and
 * stored, not evaluated at read time, so an edited rule does not take effect
 * until the periods are rebuilt: rebuild_dms_periods(null, null).
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
  -- The rule set is tiny (one row per PARTIAL/SPLIT label) and most daily rows
  -- match nothing, which is the intended outcome: they are classified by their
  -- sub-category alone.
  left join lateral (
    select ot.family
      from op_text_rule ot
     where ot.sub_category = normalise_sub_category(d.sub_category)
       and d.op_description ~* ot.include_pattern
       and (ot.exclude_pattern is null or d.op_description !~* ot.exclude_pattern)
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


-- ---- 7. The attach view honours the finer verdict -----------------------------
/**
 * Family resolution, most specific first:
 *
 *   1. advisor_op_metric.resolved_family — this exact op-code line was ruled a
 *      coachable service inside a label that also holds repair.
 *   2. sub_category_map.family — the whole label has one family.
 *   3. service_line.family, then .category — the legacy monthly path.
 *
 * EXCLUDED ENTIRELY: rows whose sub-category is unmapped AND which no op-text
 * rule claimed, and rows marked not_coachable. Unmapped is excluded because
 * guessing is worse than waiting; not_coachable because counting a state
 * inspection as an attach would make every advisor's rate wrong and the
 * coaching nonsensical.
 *
 * The new clause is `or m.resolved_family is not null`. A PARTIAL label has no
 * whole-label family on purpose, so without it every row the op-text rules just
 * rescued would be dropped again one line later.
 *
 * Output columns are unchanged, so family_store_benchmark replaces cleanly.
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
  left join service_line sl on sl.op_code = m.op_code
  left join sub_category_map scm
    on m.sub_category is not null
   and scm.rooftop_id = m.rooftop_id
   and scm.sub_category = m.sub_category
  where
    (m.sub_category is null or scm.family is not null or m.resolved_family is not null)
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


-- ---- 8. The content gate's input ----------------------------------------------
/**
 * Published cues per family — the second half of the coachability gate in
 * lib/advisor.ts. A family Mitch created but nobody has written for stays out of
 * Eddie's Pick until this number is above zero, at which point it turns itself
 * on with no code change.
 *
 * AGGREGATED IN SQL, and not for style: there are 1,257 published cues, and a
 * client-side group-by over `content` would be silently truncated at PostgREST's
 * 1,000-row cap. It would come back looking like several families had no cues —
 * which reads exactly like the gate working correctly.
 */
create or replace view service_family_cue_count as
select
  c.service_family              as family,
  count(*)::int                 as published_cues
from content c
where c.type = 'cue'
  and c.status = 'published'
  and c.service_family is not null
group by c.service_family;

alter view service_family_cue_count set (security_invoker = on);
grant select on service_family_cue_count to authenticated;


-- ---- 9. What is still waiting on Mitch ----------------------------------------
/**
 * The residue: op-code lines inside a PARTIAL or SPLIT label that no rule
 * claimed. $2.9M of it, and most of it is genuinely repair — but it is the list
 * Mitch asked to see, and it is round two.
 *
 * Rows whose label carries no op-text rule at all are excluded: those are
 * either mapped whole or ruled not coachable, and neither is a question.
 */
create or replace function op_text_residue()
returns table (
  sub_category   text,
  op_code        text,
  op_description text,
  labor_sales    numeric,
  ro_lines       numeric,
  lines          bigint,
  rooftops       int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.sub_category,
    d.op_code,
    d.op_description,
    sum(d.labor_sales)                 as labor_sales,
    sum(d.cp_ros)                      as ro_lines,
    count(*)                           as lines,
    count(distinct d.rooftop_id)::int  as rooftops
  from dms_daily_metric d
  join op_text_rule ot
    on ot.sub_category = normalise_sub_category(d.sub_category)
  where (
          coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
            = 'service_role'
          or d.rooftop_id in (select admin_rooftops())
        )
    and not (
      d.op_description ~* ot.include_pattern
      and (ot.exclude_pattern is null or d.op_description !~* ot.exclude_pattern)
    )
  group by d.sub_category, d.op_code, d.op_description
  order by sum(d.labor_sales) desc nulls last
$$;

revoke all on function op_text_residue() from public, anon;
grant execute on function op_text_residue() to authenticated;

notify pgrst, 'reload schema';
