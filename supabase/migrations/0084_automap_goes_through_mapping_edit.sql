-- ============================================================================
-- EDIAGD — 0084 The automap joins the one write path
--
-- 0078 routed every editor of the three versioned mappings through
-- mapping_edit(), so a change retires the old version and inserts the new one in
-- a single statement. apply_sub_category_automap was the one writer left doing
-- its own UPDATE.
--
-- It is not a history rewrite the way the four in-place editors were: it only
-- ever touches rows with `status = 'unmapped'`, which by definition carry no
-- family, so no period was measured under a value it displaces. That is exactly
-- what a CORRECTION means — "this always belonged here, nobody had said so" —
-- and stating it that way is the point. An in-place update says nothing.
--
-- WHY IT IS WORTH THE CHANGE ANYWAY. One write path is a property somebody can
-- check; "one write path plus a documented exception" is a property somebody has
-- to remember. checkmap already asserts one live row per key, and every write
-- going through the same function is what keeps that assertion cheap to trust.
--
-- The numbers do not move: an unmapped row corrected at genesis resolves
-- identically to an unmapped row updated in place, because the row it replaces
-- matched nothing.
-- ============================================================================

create or replace function apply_sub_category_automap(_import_id uuid, _rules jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _n int := 0;
  _r record;
begin
  if not (
    is_platform_owner()
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
       = 'service_role'
  ) then
    raise exception 'apply_sub_category_automap: platform owner only';
  end if;

  /*
   * ROW BY ROW, because mapping_edit() edits one key at a time — a retire and
   * an insert per version, which is what makes it atomic per key. The set here
   * is one import's unmapped sub-categories across its rooftops: 82
   * sub-categories over 11 stores in the largest run so far, so the cost of the
   * loop is measured in a second, against a commit that already rebuilds
   * periods.
   *
   * The WHERE is unchanged from the in-place version, including
   * `status = 'unmapped'` — a deliberate mapping still wins, and a row the
   * automapper already ruled on is not re-ruled.
   */
  for _r in
    select m.rooftop_id,
           m.sub_category,
           case when r.not_coachable then null else r.family end        as new_family,
           case when r.not_coachable then 'not_coachable' else 'auto' end as new_status
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
  loop
    perform mapping_edit(
      'sub_category_map',
      jsonb_build_object('rooftop_id', _r.rooftop_id::text, 'sub_category', _r.sub_category),
      jsonb_build_object('family', _r.new_family, 'status', _r.new_status),
      'correction'
    );
    _n := _n + 1;
  end loop;

  return _n;
end $$;

/*
 * ORIGIN STAYS 'file'-ISH IN SPIRIT AND BECOMES 'admin' IN FACT.
 *
 * mapping_edit() stamps origin='admin' on every row it writes, which is right
 * for a person's edit and slightly wrong for the automapper — nobody decided
 * this, a rule file matched it. It is recorded here rather than papered over:
 * the consequence is that a row the automapper filled in is now protected from
 * a future file-driven reseed the same way a hand-made decision is, which is
 * the conservative direction and matches what `status = 'auto'` already meant.
 */
comment on function apply_sub_category_automap(uuid, jsonb) is
  'Fills in unmapped sub-categories from the rule file, one mapping_edit() '
  'correction per row — the same write path every other editor of the three '
  'versioned mappings uses. See 0084.';
