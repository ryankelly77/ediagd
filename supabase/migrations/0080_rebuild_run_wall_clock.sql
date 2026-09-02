-- ============================================================================
-- EDIAGD — 0080 A rebuild run is timed by the wall clock, not the transaction
--
-- 0079 stamped rebuild_run.started_at and finished_at with now(), which in
-- Postgres is the START OF THE TRANSACTION and is constant inside one. Two
-- consequences, both found by the acceptance test rather than by reading:
--
--   * rebuild_dms_periods_for_import calls rebuild_run_start and
--     rebuild_run_finish inside ONE transaction, so every import-initiated run
--     recorded started_at = finished_at and a duration of zero — for the run
--     whose duration is the whole reason the rebuild had to be chunked.
--
--   * rebuild_status picks the latest run with `order by started_at desc
--     limit 1`. Two runs sharing a timestamp tie, and the view then reports an
--     arbitrary one of them — so a clean re-run could fail to clear the warning
--     left by the failed run before it.
--
-- clock_timestamp() reads the actual clock at each call. A rebuild's start and
-- finish are wall-clock events; nothing about them belongs to a transaction's
-- notion of when it began.
-- ============================================================================

alter table rebuild_run
  alter column started_at set default clock_timestamp();

create or replace function rebuild_run_start(
  _scope        text,
  _attempted    int,
  _initiated_by text default 'script'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare _id uuid;
begin
  if not (
    is_platform_owner()
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
       = 'service_role'
  ) then
    raise exception 'rebuild_run_start: platform owner only';
  end if;

  insert into rebuild_run (scope, periods_attempted, initiated_by, started_at)
  values (_scope, coalesce(_attempted, 0), _initiated_by, clock_timestamp())
  returning id into _id;
  return _id;
end $$;

create or replace function rebuild_run_finish(
  _id        uuid,
  _succeeded int,
  _failed    jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    is_platform_owner()
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
       = 'service_role'
  ) then
    raise exception 'rebuild_run_finish: platform owner only';
  end if;

  update rebuild_run
     set finished_at       = clock_timestamp(),
         periods_succeeded = coalesce(_succeeded, 0),
         failed            = coalesce(_failed, '[]'::jsonb)
   where id = _id;
end $$;

revoke all on function rebuild_run_start(text, int, text) from public, anon;
revoke all on function rebuild_run_finish(uuid, int, jsonb) from public, anon;
grant execute on function rebuild_run_start(text, int, text) to authenticated;
grant execute on function rebuild_run_finish(uuid, int, jsonb) to authenticated;

/*
 * AND A TIE-BREAK THAT DOES NOT DEPEND ON THE CLOCK BEING FINE-GRAINED.
 *
 * clock_timestamp() makes a tie vanishingly unlikely rather than impossible,
 * and "which run is the latest" must have exactly one answer — a status banner
 * that flickers between two runs is worse than one that is wrong consistently.
 * ctid is not stable, so the tie-break is on started_at then id: arbitrary, but
 * deterministic, which is the property that matters.
 */
create or replace view rebuild_status as
with last_run as (
  select * from rebuild_run order by started_at desc, id desc limit 1
),
last_full as (
  select finished_at
    from rebuild_run
   where scope = 'all'
     and finished_at is not null
     and jsonb_array_length(failed) = 0
   order by finished_at desc, id desc
   limit 1
),
mapping as (
  select max(updated_at) as changed_at from (
    select updated_at from sub_category_map
    union all select updated_at from op_text_rule
    union all select updated_at from op_code_family
  ) m
)
select
  lr.id                as run_id,
  lr.started_at,
  lr.finished_at,
  lr.scope,
  lr.periods_attempted,
  lr.periods_succeeded,
  lr.failed,
  lr.initiated_by,
  jsonb_array_length(coalesce(lr.failed, '[]'::jsonb)) as failed_count,
  (lr.id is not null and lr.finished_at is null) as unfinished,
  lf.finished_at       as last_full_rebuild_at,
  m.changed_at         as mapping_changed_at,
  (m.changed_at is not null
     and (lf.finished_at is null or m.changed_at > lf.finished_at)) as mapping_ahead_of_rebuild
from mapping m
left join last_run lr on true
left join last_full lf on true;

alter view rebuild_status set (security_invoker = on);
grant select on rebuild_status to authenticated;
