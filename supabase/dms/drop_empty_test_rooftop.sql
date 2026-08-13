-- ============================================================================
-- EDIAGD — remove the emptied test rooftop
--
--   psql "$DATABASE_URL" -f supabase/dms/drop_empty_test_rooftop.sql
--
-- migrate_cdjr_rooftop.sql moved the CDJR pilot onto a properly named rooftop
-- and deliberately left the old one in place, empty, so nothing referencing it
-- by id could break. Nothing does — and an empty rooftop is not harmless: it
-- counts in admin_scope, so the engagement hero says 112 while only 111 stores
-- exist, and one of the "not started" rooftops is a store that never was one.
--
-- REFUSES TO DELETE ANYTHING THAT STILL HOLDS DATA. The guard is the point:
-- run against a database where the migration has not happened, and this does
-- nothing rather than taking the pilot's history with it.
--
-- Idempotent, and a no-op where the rooftop is already gone.
-- ============================================================================

begin;

do $$
declare
  _id   uuid;
  _name text;
  _n    int;
begin
  for _id, _name in
    select r.id, r.name from rooftop r
     where r.name not like '[DEMO]%'
       and (r.name = 'Test Rooftop — San Antonio' or r.name = 'Doggett CDJR')
  loop
    select
      (select count(*) from membership        where rooftop_id = _id)
    + (select count(*) from perf_period       where rooftop_id = _id)
    + (select count(*) from daily_activity    where rooftop_id = _id)
    + (select count(*) from advisor_op_metric where rooftop_id = _id)
    + (select count(*) from dms_daily_metric  where rooftop_id = _id)
    into _n;

    if _n > 0 then
      raise notice 'KEEPING % (%) — still holds % rows', _name, _id, _n;
    else
      delete from rooftop where id = _id;
      raise notice 'deleted empty rooftop % (%)', _name, _id;
    end if;
  end loop;
end $$;

\echo ''
select count(*) filter (where name not like '[DEMO]%') as real_rooftops,
       count(*)                                        as total_rooftops
from rooftop;

commit;
