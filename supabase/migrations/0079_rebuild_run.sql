-- ============================================================================
-- EDIAGD — 0079 A rebuild leaves a record of whether it worked
--
-- scripts/rebuild-periods.ts is honest in its header — "a half-rebuilt library
-- is a state that can now exist and could not before" — and then leaves no way
-- to find out whether you are in one:
--
--   * per-period failures are counted and printed, and the process exits 0
--   * nothing anywhere records that a rebuild happened
--   * perf_period.rules_as_of cannot tell you either. It is always the period's
--     own start, so it is CONSTANT across every rebuild after the first. The
--     script's "N have no rules_as_of" line is a one-time pre-0074 marker, and
--     all 220 production periods now have one.
--
-- So after a mapping edit there is no way to know which periods have been
-- rebuilt under it, and a run that failed 200 of 220 looks exactly like one
-- that succeeded — on a laptop, in stdout, with an exit code of zero.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES NOT FIX, AND DELIBERATELY RECORDS INSTEAD
-- ---------------------------------------------------------------------------
-- The two halves of the mapping apply at different times. op_text_rule is BAKED
-- IN at rebuild time, into advisor_op_metric.resolved_family; sub_category_map
-- is read AT QUERY TIME by advisor_family_attach. So between an edit and a
-- rebuild the sub-category half is already live while the op-text half is not —
-- and because the view reads `coalesce(m.resolved_family, scm.family, …)` with
-- the baked value FIRST, a correction appears not to have applied to the 1,829
-- rows carrying a resolved_family while applying instantly to the other 60,112.
--
-- Making both halves land together is a redesign and does not belong in a
-- honesty commit. What belongs here is saying so: `mapping_changed_at` against
-- `last_full_rebuild_at` is that sentence, and the admin screen shows it.
-- ============================================================================


create table if not exists rebuild_run (
  id                 uuid primary key default gen_random_uuid(),
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  /* 'all', 'rooftop:<uuid>', or 'import:<uuid>' — what the run covered, so a
     scoped run is never mistaken for a full one. */
  scope              text        not null,
  periods_attempted  int         not null default 0,
  periods_succeeded  int         not null default 0,
  /* [{rooftop, month, error}] — the list, not just the count. "219 of 220"
     without saying WHICH one is a number you cannot act on. */
  failed             jsonb       not null default '[]'::jsonb,
  initiated_by       text        not null,
  constraint rebuild_run_initiated_by_valid
    check (initiated_by in ('script', 'import'))
);

create index if not exists rebuild_run_recent_idx on rebuild_run(started_at desc);

alter table rebuild_run enable row level security;

/* Read-only to the platform owner, like dms_import. Nothing writes through a
   user session — the two functions below are the only writers. */
drop policy if exists rebuild_run_read on rebuild_run;
create policy rebuild_run_read on rebuild_run
  for select using ((select is_platform_owner()));


-- ---- The two calls a runner makes -----------------------------------------
/*
 * OPEN THE ROW BEFORE THE WORK, CLOSE IT AFTER.
 *
 * A run recorded only on completion cannot describe the failure mode that
 * matters most — the one that died halfway and never came back. An open row
 * with a null finished_at IS the signal that something started and did not
 * report, which is exactly the state the header describes and nothing could
 * previously see.
 */
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

  insert into rebuild_run (scope, periods_attempted, initiated_by)
  values (_scope, coalesce(_attempted, 0), _initiated_by)
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
     set finished_at       = now(),
         periods_succeeded = coalesce(_succeeded, 0),
         failed            = coalesce(_failed, '[]'::jsonb)
   where id = _id;
end $$;

revoke all on function rebuild_run_start(text, int, text) from public, anon;
revoke all on function rebuild_run_finish(uuid, int, jsonb) from public, anon;
grant execute on function rebuild_run_start(text, int, text) to authenticated;
grant execute on function rebuild_run_finish(uuid, int, jsonb) to authenticated;


-- ---- The import's rebuild records itself too -------------------------------
/*
 * Same body as 0042's, wrapped in a run record and no longer swallowing a
 * per-scope failure. commitImport() already surfaces a thrown error to the
 * admin; what it could not do was say how much of the rebuild had happened
 * before the throw, which is the difference between "re-run it" and "re-run
 * these three months".
 */
create or replace function rebuild_dms_periods_for_import(_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _r        record;
  _out      jsonb := '[]'::jsonb;
  _failed   jsonb := '[]'::jsonb;
  _n        int := 0;
  _ok       int := 0;
  _attempts int := 0;
  _run      uuid;
begin
  if not (
    is_platform_owner()
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
       = 'service_role'
  ) then
    raise exception 'rebuild_dms_periods_for_import: platform owner only';
  end if;

  select count(*) into _attempts
    from (select distinct rooftop_id, date_trunc('month', report_date)
            from dms_import_row
           where import_id = _import_id and rooftop_id is not null) s;

  _run := rebuild_run_start('import:' || _import_id::text, _attempts, 'import');

  for _r in
    select distinct rooftop_id, date_trunc('month', report_date)::date as month_start
      from dms_import_row
     where import_id = _import_id
       and rooftop_id is not null
  loop
    _n := _n + 1;
    begin
      _out := _out || rebuild_dms_periods(_r.rooftop_id, _r.month_start);
      _ok := _ok + 1;
    exception when others then
      /*
       * ONE MONTH'S FAILURE IS NOT THE WHOLE IMPORT'S. Each rebuild_dms_periods
       * call deletes and rewrites only its own month, so a failure here leaves
       * that month unbuilt and the rest correct. Recording which one and
       * carrying on beats aborting eleven stores because one had a bad day —
       * and the run row is what makes "carrying on" honest rather than quiet.
       */
      _failed := _failed || jsonb_build_object(
        'rooftop', _r.rooftop_id,
        'month', _r.month_start,
        'error', sqlerrm
      );
    end;
  end loop;

  perform rebuild_run_finish(_run, _ok, _failed);

  return jsonb_build_object(
    'scopes_rebuilt', _ok,
    'scopes_attempted', _n,
    'failed', _failed,
    'run_id', _run,
    'results', _out
  );
end $$;


-- ---- What the admin screen asks -------------------------------------------
/**
 * The last rebuild, and whether the mappings have moved since the last full one.
 *
 * ONE ROW, ALWAYS. A screen that has to cope with "no rows yet" as well as
 * "here is the state" grows two code paths for one question, and the empty case
 * is the one nobody renders properly. Every column is nullable instead.
 *
 * `mapping_changed_at` spans all three versioned mappings. sub_category_map is
 * read live so an edit there is visible immediately; op_text_rule is baked into
 * advisor_op_metric at rebuild time so an edit there is NOT — and this view
 * cannot tell the two apart without claiming more than it knows. It reports the
 * later of them and lets the screen say "a rebuild is outstanding", which is
 * true either way.
 */
create or replace view rebuild_status as
with last_run as (
  select * from rebuild_run order by started_at desc limit 1
),
last_full as (
  select finished_at
    from rebuild_run
   where scope = 'all'
     and finished_at is not null
     and jsonb_array_length(failed) = 0
   order by finished_at desc
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
  -- Started and never reported. The state the old script could produce and
  -- nothing could see.
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
