-- ============================================================================
-- EDIAGD — 0076 A remap you can run without writing to production
--
-- `npm run remap` has never had a preview, which had two consequences the
-- mapping inventory recorded and could not fix:
--
--   * the "preview before apply" guardrail the admin screens need is
--     unbuildable, because there is nothing to preview WITH
--   * a full remap has never been timed, because timing it would have meant
--     writing to production for no reason
--
-- ---------------------------------------------------------------------------
-- IT DOES THE REAL WRITE AND THEN ROLLS IT BACK
-- ---------------------------------------------------------------------------
-- Not a SELECT that models what the UPDATE would have done. A modelled diff and
-- a real one disagree exactly where it matters — a `where` clause somebody
-- edited on one and not the other — and the whole point of a preview is that it
-- is trustworthy.
--
-- A plpgsql BEGIN/EXCEPTION block is an implicit SAVEPOINT: the UPDATE inside it
-- is really executed, really touches the rows, and is really undone when the
-- block raises. Which means the row count and the duration are the true ones,
-- measured on the true statement.
--
-- PLPGSQL VARIABLES SURVIVE THE ROLLBACK. That is what makes this work at all —
-- the transaction state is unwound but `_n` and `_ms` are memory, not table
-- data, so the numbers escape the block that threw them away.
-- ============================================================================

create or replace function apply_sub_category_automap_dry(
  _import_id uuid,
  _rules     jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _n       int := 0;
  _t0      timestamptz;
  _ms      numeric := 0;
  _changes jsonb := '[]'::jsonb;
begin
  if not (
    is_platform_owner()
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
       = 'service_role'
  ) then
    raise exception 'apply_sub_category_automap_dry: platform owner only';
  end if;

  begin
    _t0 := clock_timestamp();

    /*
     * The rows this WOULD change, captured BEFORE the update so the diff shows
     * both sides. Limited to 200 for the payload's sake — the count below is
     * exact regardless, and a preview nobody can read is not a preview.
     */
    select coalesce(jsonb_agg(x), '[]'::jsonb) into _changes from (
      select jsonb_build_object(
               'rooftop_id',   m.rooftop_id,
               'sub_category', m.sub_category,
               'from_family',  m.family,
               'from_status',  m.status,
               'to_family',    case when r.not_coachable then null else r.family end,
               'to_status',    case when r.not_coachable then 'not_coachable' else 'auto' end
             ) as x
        from sub_category_map m
        join jsonb_to_recordset(_rules) as r(
          sub_category text, family text, not_coachable boolean
        ) on m.sub_category = r.sub_category
       where (r.family is not null or r.not_coachable)
         and m.status = 'unmapped'
         and m.retired_at is null
         and m.rooftop_id in (
           select distinct rooftop_id from dms_import_row where import_id = _import_id
         )
       limit 200
    ) s;

    -- The real statement, verbatim from apply_sub_category_automap.
    update sub_category_map m
       set family = case when r.not_coachable then null else r.family end,
           status = case when r.not_coachable then 'not_coachable' else 'auto' end
      from jsonb_to_recordset(_rules) as r(
        sub_category text, family text, not_coachable boolean
      )
     where m.sub_category = r.sub_category
       and (r.family is not null or r.not_coachable)
       and m.status = 'unmapped'
       and m.retired_at is null
       and m.rooftop_id in (
         select distinct rooftop_id from dms_import_row where import_id = _import_id
       );
    get diagnostics _n = row_count;

    _ms := extract(epoch from (clock_timestamp() - _t0)) * 1000;

    /*
     * Undo it. A raise inside the block unwinds to the implicit savepoint, and
     * a bespoke sqlstate keeps this from being mistaken for a real failure by
     * anything that logs exceptions.
     */
    raise exception using errcode = 'ED001', message = 'dry run complete';
  exception
    when sqlstate 'ED001' then
      null; -- expected: the rollback is the feature
  end;

  return jsonb_build_object(
    'dry_run',    true,
    'rows',       _n,
    'ms',         round(_ms, 1),
    'changes',    _changes,
    'truncated',  jsonb_array_length(_changes) >= 200
  );
end $$;

revoke all on function apply_sub_category_automap_dry(uuid, jsonb) from public, anon;
grant execute on function apply_sub_category_automap_dry(uuid, jsonb) to authenticated;


-- ---- The live-row guard on the real one too ---------------------------------
/*
 * sub_category_map is append-only since 0074, so the automap must not update a
 * RETIRED row — it would resurrect a mapping somebody deliberately replaced,
 * and because the retired row keeps its (rooftop, sub_category) it would then
 * collide with the live one on the partial unique index. Adding the same
 * predicate to both keeps the dry run honest: a preview whose WHERE clause
 * differs from the apply's is worse than no preview.
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
     and m.retired_at is null
     and m.rooftop_id in (
       select distinct rooftop_id from dms_import_row where import_id = _import_id
     );
  get diagnostics _n = row_count;
  return _n;
end $$;

revoke all on function apply_sub_category_automap(uuid, jsonb) from public, anon;
grant execute on function apply_sub_category_automap(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
