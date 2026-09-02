-- ============================================================================
-- EDIAGD — 0074 A period is measured under the rules in effect on its start
--
-- `effective_from` has existed on op_code_family since 0066 and nothing has
-- ever read it. rebuild_dms_periods recomputes every period under whatever
-- rules exist at run time, so a mapping edit rewrites numbers advisors were
-- already measured on. This migration is the storage half of closing that.
--
-- ---------------------------------------------------------------------------
-- THE RULE, ONCE, SO EVERY READER CAN QUOTE IT
-- ---------------------------------------------------------------------------
--   a rule applies to a period  iff
--     rule.effective_from <= period.starts_on
--     and period.starts_on < coalesce(rule.retired_at, 'infinity')
--
-- The DMS grain is the month, so the measurement grain is the month. A period
-- is ONE number; a month running half under one mapping and half under another
-- is a number nobody at the dealership can reconcile. Never split.
--
-- `perf_period.starts_on` is the period's covers_from — for dynatron periods it
-- is date_trunc('month', report_date), set by rebuild_dms_periods itself.
--
-- ---------------------------------------------------------------------------
-- TWO READERS, TWO "AS OF" DATES
-- ---------------------------------------------------------------------------
--   MEASUREMENT   rebuild_dms_periods, advisor_family_attach, Eddie's Pick's
--                 numbers — read rules as of the PERIOD START.
--   ROUTING       the daily loop's cue picker, the knowledge importer — read
--                 rules as of TODAY.
--
-- A mid-month family change moves what Mitch is coaching tomorrow without
-- touching what the advisor was scored on this month. Those are different
-- questions and they were only ever the same answer by accident.
--
-- ---------------------------------------------------------------------------
-- GENESIS IS '2000-01-01'
-- ---------------------------------------------------------------------------
-- Every row that came from a seed file (origin = 'file') is backdated to a
-- sentinel comfortably before any data: the earliest perf_period.starts_on in
-- production is 2025-01-01. Without this backdate no rule matches any
-- historical period and every advisor's history goes to zero on the next
-- rebuild — which is the single most destructive thing this migration could
-- do, so it is done here rather than left to a script.
--
-- A sentinel rather than the computed earliest period: a fixed date is the same
-- on every environment, and a computed one silently changes meaning the first
-- time somebody imports an older file.
-- ============================================================================


-- ---- 1. The two mappings that lack the columns ------------------------------

alter table sub_category_map
  add column if not exists effective_from date not null default '2000-01-01',
  add column if not exists retired_at     date,
  add column if not exists origin         text not null default 'file',
  add column if not exists updated_by     uuid references app_user(id),
  add column if not exists updated_at     timestamptz not null default now();

alter table sub_category_map drop constraint if exists sub_category_map_origin_valid;
alter table sub_category_map add constraint sub_category_map_origin_valid
  check (origin in ('file', 'admin'));

alter table op_text_rule
  add column if not exists effective_from date not null default '2000-01-01',
  add column if not exists retired_at     date;

/*
 * op_code_family already carries effective_from (0066) and origin (0073). It
 * gains only retired_at, so all three tables answer the interval test the same
 * way and a reader never has to remember which shape it is looking at.
 */
alter table op_code_family
  add column if not exists retired_at date;

comment on column sub_category_map.effective_from is
  'First period start this mapping applies to. See 0074 for the interval test.';
comment on column op_text_rule.effective_from is
  'First period start this rule applies to. See 0074 for the interval test.';
comment on column op_code_family.retired_at is
  'First period start this mapping NO LONGER applies to. Null = still current.';


-- ---- 2. Backdate everything the seed files own ------------------------------
/*
 * REPORTED, NOT SILENT. These counts are the difference between "history is
 * intact" and "every advisor's numbers just went to zero", and a migration that
 * does it quietly gives nobody a chance to notice it did not.
 */
do $$
declare
  _scm int; _otr int; _ocf int;
begin
  update sub_category_map set effective_from = '2000-01-01'
   where origin = 'file' and effective_from > '2000-01-01';
  get diagnostics _scm = row_count;

  update op_text_rule set effective_from = '2000-01-01'
   where origin = 'file' and effective_from > '2000-01-01';
  get diagnostics _otr = row_count;

  update op_code_family set effective_from = '2000-01-01'
   where origin = 'file' and effective_from > '2000-01-01';
  get diagnostics _ocf = row_count;

  raise notice 'backdated to genesis — sub_category_map: %, op_text_rule: %, op_code_family: %',
    _scm, _otr, _ocf;
end $$;


-- ---- 3. Append-only needs room for a second version -------------------------
/*
 * EDITING A MAPPING MEANS RETIRING A ROW AND INSERTING ANOTHER, which the
 * primary keys forbid today: sub_category_map is keyed (rooftop_id,
 * sub_category), op_text_rule on sub_category, op_code_family on code. Two
 * versions of one mapping collide on all three.
 *
 * So each gains a surrogate id, and the old key becomes a PARTIAL UNIQUE INDEX
 * over the LIVE row only — "one current mapping per key, any number of retired
 * ones". Same shape as coaching_block_one_open_idx (0067), and it keeps the
 * guarantee that actually mattered: a reader asking for today's mapping can
 * never get two answers.
 *
 * op_code_family.code is NOT touched here. It is the target of no foreign key,
 * but content.op_code, coaching_block.op_code and daily_completion.op_code all
 * reference op_code_catalog(code) — a different table — and versioning THAT one
 * would break four foreign keys at once. See the note at the end.
 */

/*
 * NAME-AGNOSTIC, AND IT REFUSES RATHER THAN CASCADES.
 *
 * `drop constraint <name> cascade` needs the constraint's name to be what you
 * guessed, and silently drops every foreign key that depended on it. Both
 * halves of that are unacceptable on a production table: a wrong guess fails
 * the migration, and a right guess with a dependent FK quietly removes
 * referential integrity somebody is relying on.
 *
 * So the primary key is looked up, dependent foreign keys are counted, and the
 * whole thing aborts with the names if any exist. Today none do — nothing
 * references these three by their old keys — and the check is what makes that
 * a fact rather than an assumption.
 */
do $$
declare
  _t      text;
  _pk     text;
  _deps   text;
begin
  foreach _t in array array['sub_category_map', 'op_text_rule', 'op_code_family']
  loop
    -- Anything pointing at this table at all?
    select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ')
      into _deps
      from pg_constraint c
     where c.contype = 'f'
       and c.confrelid = _t::regclass;

    if _deps is not null then
      raise exception
        '0074: % is referenced by foreign keys (%) — versioning it would break them. Stopping.',
        _t, _deps;
    end if;

    execute format('alter table %I add column if not exists id uuid default gen_random_uuid()', _t);
    execute format('update %I set id = gen_random_uuid() where id is null', _t);
    execute format('alter table %I alter column id set not null', _t);

    select conname into _pk
      from pg_constraint
     where contype = 'p' and conrelid = _t::regclass;

    if _pk is not null then
      execute format('alter table %I drop constraint %I', _t, _pk);
    end if;

    execute format('alter table %I add primary key (id)', _t);
  end loop;
end $$;

create unique index if not exists sub_category_map_live_idx
  on sub_category_map(rooftop_id, sub_category) where retired_at is null;
create index if not exists sub_category_map_history_idx
  on sub_category_map(rooftop_id, sub_category, effective_from);

create unique index if not exists op_text_rule_live_idx
  on op_text_rule(sub_category) where retired_at is null;
create index if not exists op_text_rule_history_idx
  on op_text_rule(sub_category, effective_from);

create unique index if not exists op_code_family_live_idx
  on op_code_family(code) where retired_at is null;
create index if not exists op_code_family_history_idx
  on op_code_family(code, effective_from);


-- ---- 4. Seeders upsert on the old key, which no longer exists ----------------
/*
 * set_op_text_rules and seed_op_text_rules (0071) both target `sub_category` as
 * a conflict key, and PostgREST upserts in the seeders target `code` and
 * `(rooftop_id, sub_category)`. Those are now partial unique indexes rather
 * than primary keys, and `on conflict` cannot use a partial index without
 * repeating its predicate.
 *
 * Rather than teach four call sites the predicate, the live-row lookup gets a
 * name. A seeder that writes through these is writing to the CURRENT version,
 * which is what it means to seed.
 */
create or replace view op_text_rule_live as
  select * from op_text_rule where retired_at is null;
alter view op_text_rule_live set (security_invoker = on);
grant select on op_text_rule_live to authenticated;

create or replace view op_code_family_live as
  select * from op_code_family where retired_at is null;
alter view op_code_family_live set (security_invoker = on);
grant select on op_code_family_live to authenticated;

create or replace view sub_category_map_live as
  select * from sub_category_map where retired_at is null;
alter view sub_category_map_live set (security_invoker = on);
grant select on sub_category_map_live to authenticated;


-- ---- 5. A period records which rule set produced it --------------------------
/*
 * WITHOUT THIS A REBUILD IS NOT REPRODUCIBLE. The interval test makes the
 * numbers a function of the period's start date, but only if you know the
 * rebuild actually applied it — and a period rebuilt before this migration and
 * one rebuilt after are indistinguishable from the outside.
 *
 * Set to starts_on at rebuild time, so a row that says 2025-03-01 is asserting
 * "these numbers came from the rules in effect on 1 March 2025". Null means
 * "rebuilt before epochs existed", which is honestly different from any date.
 */
alter table perf_period
  add column if not exists rules_as_of date;

comment on column perf_period.rules_as_of is
  'The date whose rule set produced this period''s metrics — always starts_on, '
  'written by rebuild_dms_periods. Null means rebuilt before 0074, so which '
  'rules applied is unknown rather than assumed.';


-- ============================================================================
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--
-- op_code_catalog is NOT made append-only, so the piggyback-correction case
-- cannot be expressed as retire + insert yet. Four foreign keys target
-- op_code_catalog(code) — content.op_code, op_code_family.code,
-- coaching_block.op_code, daily_completion.op_code — and a foreign key requires
-- its target to be UNIQUE. Two versions of a code makes `code` non-unique and
-- breaks all four at once, taking the daily loop and the content model with it.
--
-- It is also not one of the three mappings that move measured numbers:
-- piggyback_partners is a pairing hint, not a family, and no period's
-- arithmetic reads it. Versioning it buys nothing for measurement and costs a
-- restructure of the content model.
-- ============================================================================
