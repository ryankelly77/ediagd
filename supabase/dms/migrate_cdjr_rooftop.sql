-- ============================================================================
-- EDIAGD — give the Doggett CDJR pilot a real rooftop
--
--   psql "$DATABASE_URL" -f supabase/dms/migrate_cdjr_rooftop.sql
--
-- WHAT THIS FIXES. The CDJR pilot has been living on a rooftop called "Test
-- Rooftop — San Antonio" under the "Pear Test Group" org. It holds the real
-- June CDJR period, the four real CDJR advisors (35122, 400025, 400030,
-- 400049) and their activity. The group workbook names that store "Doggett
-- Chrysler Dodge Jeep Ram", so without this the importer would either fail to
-- match it or create a SECOND rooftop and split the store's history in half —
-- with June on one and July onward on the other.
--
-- This creates the properly named rooftop under a Doggett org and moves
-- everything across. The test rooftop is left in place but empty, so nothing
-- that references it by id breaks.
--
-- IDEMPOTENT. Re-running finds the rooftop already exists and moves whatever
-- is left, which is nothing. Safe to run twice.
--
-- NEVER TOUCHES [DEMO] DATA. Every statement is keyed to the one source
-- rooftop id, and that id is asserted to be the non-demo test rooftop before
-- anything moves.
-- ============================================================================

begin;

do $$
declare
  _src_id  uuid;
  _src_nm  text;
  _org_id  uuid;
  _dst_id  uuid;
  _moved   int;
begin
  -- ---- 1. Find the source, and refuse to run against anything unexpected ----
  -- FOUND BY WHAT IT HOLDS, NOT BY ITS NAME. The pilot rooftop is called
  -- "Test Rooftop — San Antonio" on production and "Doggett CDJR" locally, and
  -- a hardcoded name silently did nothing against the database it did not
  -- match — which looks exactly like success. The store that owns the CDJR
  -- June period is the store being migrated, whatever it is currently called.
  select r.id, r.name into _src_id, _src_nm
    from rooftop r
   where r.name not like '[DEMO]%'
     and r.name <> 'Doggett Chrysler Dodge Jeep Ram'
     and exists (
       select 1 from perf_period p
        where p.rooftop_id = r.id
          and p.source_file like 'OpCode%'
     )
   limit 1;

  if _src_id is null then
    -- Already migrated, or never existed. Either way there is nothing to move.
    raise notice 'no un-migrated rooftop holds the CDJR monthly period — nothing to move';
  elsif _src_nm like '[DEMO]%' then
    raise exception 'refusing to touch a [DEMO] rooftop';
  else
    raise notice 'source rooftop: % (%)', _src_nm, _src_id;
  end if;

  -- ---- 2. The Doggett org --------------------------------------------------
  select id into _org_id from org where name = 'Doggett Automotive Group';
  if _org_id is null then
    insert into org (name) values ('Doggett Automotive Group') returning id into _org_id;
    raise notice 'created org Doggett Automotive Group (%)', _org_id;
  end if;

  -- ---- 3. The rooftop ------------------------------------------------------
  select id into _dst_id
    from rooftop
   where name = 'Doggett Chrysler Dodge Jeep Ram';

  if _dst_id is null then
    insert into rooftop (org_id, name, dms_kind)
    values (_org_id, 'Doggett Chrysler Dodge Jeep Ram', 'cdk')
    returning id into _dst_id;
    raise notice 'created rooftop Doggett Chrysler Dodge Jeep Ram (%)', _dst_id;
  end if;

  if _src_id is null then
    raise notice 'nothing to move';
    return;
  end if;

  -- ---- 4. Move everything that hangs off a rooftop --------------------------
  -- Enumerated explicitly rather than looped over the catalogue: a new table
  -- with a rooftop_id should force a decision here, not be swept along by a
  -- migration written before it existed.
  --
  -- Order matters only for the ones carrying unique constraints; none of these
  -- collide, because the destination rooftop is new and therefore empty.

  update perf_period               set rooftop_id = _dst_id where rooftop_id = _src_id;
  get diagnostics _moved = row_count; raise notice 'perf_period               %', _moved;

  update advisor_op_metric         set rooftop_id = _dst_id where rooftop_id = _src_id;
  get diagnostics _moved = row_count; raise notice 'advisor_op_metric         %', _moved;

  update advisor_period_total_src  set rooftop_id = _dst_id where rooftop_id = _src_id;
  get diagnostics _moved = row_count; raise notice 'advisor_period_total_src  %', _moved;

  update membership                set rooftop_id = _dst_id where rooftop_id = _src_id;
  get diagnostics _moved = row_count; raise notice 'membership                %', _moved;

  update daily_activity            set rooftop_id = _dst_id where rooftop_id = _src_id;
  get diagnostics _moved = row_count; raise notice 'daily_activity            %', _moved;

  update daily_completion          set rooftop_id = _dst_id where rooftop_id = _src_id;
  get diagnostics _moved = row_count; raise notice 'daily_completion          %', _moved;

  update content_progress          set rooftop_id = _dst_id where rooftop_id = _src_id;
  get diagnostics _moved = row_count; raise notice 'content_progress          %', _moved;

  update module_completion         set rooftop_id = _dst_id where rooftop_id = _src_id;
  get diagnostics _moved = row_count; raise notice 'module_completion         %', _moved;

  update notification              set rooftop_id = _dst_id where rooftop_id = _src_id;
  get diagnostics _moved = row_count; raise notice 'notification              %', _moved;

  update rooftop_product           set rooftop_id = _dst_id where rooftop_id = _src_id;
  get diagnostics _moved = row_count; raise notice 'rooftop_product           %', _moved;

  -- Rollup tables are DERIVED. Moving stale rows would carry the old rooftop's
  -- numbers under the new name; deleting them lets the nightly refresh rebuild
  -- from the facts that just moved.
  delete from engagement_rollup where rooftop_id in (_src_id, _dst_id);
  delete from impact_rollup     where rooftop_id in (_src_id, _dst_id);
  raise notice 'engagement_rollup / impact_rollup cleared — nightly refresh rebuilds';
end $$;

-- ---- 5. What it looks like now ----------------------------------------------

\echo ''
\echo '================ CDJR ROOFTOP ================'
select r.name as rooftop, o.name as org,
       (select count(*) from membership       m where m.rooftop_id = r.id) as memberships,
       (select count(*) from perf_period      p where p.rooftop_id = r.id) as periods,
       (select count(*) from daily_activity   d where d.rooftop_id = r.id) as daily_activity,
       (select count(*) from advisor_op_metric a where a.rooftop_id = r.id) as op_metrics
from rooftop r
join org o on o.id = r.org_id
where r.name in ('Doggett Chrysler Dodge Jeep Ram', 'Test Rooftop — San Antonio')
order by r.name;

\echo ''
\echo '-- the June period should now sit on the CDJR rooftop --'
select r.name as rooftop, p.starts_on, p.ends_on, p.label, p.superseded_at
from perf_period p join rooftop r on r.id = p.rooftop_id
where p.source_file like 'OpCode%';

commit;
