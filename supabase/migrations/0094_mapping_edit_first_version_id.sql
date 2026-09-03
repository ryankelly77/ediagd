-- ============================================================================
-- EDIAGD — 0094 The first-version branch never set an id
--
-- 0093 gave mapping_edit an insert path for a key with no live row, and the
-- payload it builds omits `id`. jsonb_populate_record does not apply column
-- defaults — it materialises every column, and an absent key becomes NULL — so
-- the insert failed 23502 on the primary key. The edit branch three lines below
-- has always set 'id', gen_random_uuid(); the new branch simply did not copy it.
--
-- Nothing shipped on top of the broken branch: it was caught by exercising the
-- function in a rolled-back transaction immediately after applying 0093, and
-- the only callers are in the commit that follows this one.
--
-- THE SAME LESSON AS 0089, WHICH IS WHY IT IS WRITTEN DOWN TWICE. A migration
-- that installs BEHAVIOUR needs that behaviour run against it, not just a
-- schema that parses. Both times the fault was a line the neighbouring branch
-- already had.
--
-- 0093 is left exactly as applied. An applied migration is a record of what the
-- database did, not a draft.
-- ============================================================================

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

  -- 0093 adds dms_op_code_map: the op-code-grain bridge. Same machinery, same
  -- effective dating, nothing reading it yet.
  if _table not in ('sub_category_map', 'op_text_rule', 'op_code_family',
                    'dms_op_code_map') then
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
    /* ---- FIRST VERSION -------------------------------------------------
     * Nothing to retire and nothing to inherit. The key plus the values IS
     * the row. See the note at the top of this migration for why a change
     * dated in the past is not refused here.
     */
    _payload := _values
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
      'versions_retired', 0,
      'first_version', true
    );
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
    'versions_retired', _retired,
    'first_version', false
  );
end $$;

revoke all on function mapping_edit(text, jsonb, jsonb, text, date) from public, anon;
grant execute on function mapping_edit(text, jsonb, jsonb, text, date) to authenticated;
