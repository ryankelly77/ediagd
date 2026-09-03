-- ============================================================================
-- EDIAGD — 0093 Dealer Codes: a first version, a lock, and the op-code bridge
--
-- Three additive pieces, all in service of the Dealer Codes screen.
-- ============================================================================


-- ---- 1. mapping_edit can write a FIRST version ----------------------------
/*
 * THE CARRY-OVER FROM THE 055-057 RULING.
 *
 * mapping_edit refused a key with no live row — correctly for an edit, since
 * there is nothing to retire — and the only other insert path,
 * seed_op_code_family(), hard-codes origin='file', which is exactly the marking
 * 0073 says a seeder may revert. So minting three op codes meant hand-writing
 * their first family rows and hand-stamping origin='admin', and the next new
 * code from the Op Codes screen would have had the same problem.
 *
 * Now a missing prior row is an INSERT rather than an exception, in the shape
 * the hand-written rows were given:
 *
 *     effective_from  genesis for a correction, the given date for a change
 *     retired_at      null
 *     origin          'admin'
 *     versions_retired 0
 *
 * WHY A FIRST VERSION IS ALWAYS ALLOWED TO BE A CORRECTION. There is no prior
 * interval to invert, so the "a change cannot start before the version it
 * replaces" rule has nothing to compare against and is skipped for this branch
 * only. A brand-new key defaulting to genesis is right: a code that has just
 * been added to the catalog was not un-mapped before today, it was un-known,
 * and re-measuring history under a mapping that did not exist is exactly what
 * a correction means.
 *
 * `_values` must carry every NOT NULL column the table has, because there is no
 * prior row to inherit from. jsonb_populate_record leaves the rest at their
 * defaults, and a missing required column raises 23502 by name — which is a
 * better error than the one this branch used to raise.
 */
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


-- ---- 2. The op-code bridge -------------------------------------------------
/*
 * WHAT A DEALER'S DMS CALLS A JOB, AND WHAT WE CALL IT.
 *
 * Doggett sends 1,805 distinct op codes. None of them maps to
 * op_code_catalog, because coaching is family-grained and nothing has needed
 * the finer join yet.
 *
 * This table is built BEFORE anything reads it, which is deliberate and is the
 * whole argument for doing it now: when Eddie's Pick moves to op-code
 * precision, this is the bridge, and a bridge whose history starts on the day
 * it was first needed cannot answer "what was this code mapped to in August".
 * Rulings collected now, effective-dated now, are worth something later.
 * Rulings invented later are not.
 *
 * Same shape as sub_category_map: keyed per rooftop, retire-and-insert,
 * `origin` for who decided, and mapping_edit() as the only write path.
 */
create table if not exists dms_op_code_map (
  id           uuid primary key default gen_random_uuid(),
  rooftop_id   uuid not null references rooftop(id) on delete cascade,
  /* What the DMS sends, verbatim. Not a foreign key — the whole point is that
     it is somebody else's vocabulary and we do not control it. */
  dms_op_code  text not null,
  /* Ours. Null is a legitimate ruling: "no canonical code fits this". */
  canonical_code text references op_code_catalog(code) on delete set null,
  status       text not null default 'proposed'
    check (status in ('proposed', 'confirmed', 'no_match')),
  /* Where the proposal came from, so a reviewer can weigh it: an auto-match on
     the description reads differently from a line in Mitch's deck map. */
  matched_by   text check (matched_by in ('auto', 'deck_map', 'human')),
  note         text,
  effective_from date not null default '2000-01-01',
  retired_at   date,
  origin       text not null default 'file',
  updated_by   uuid references app_user(id) on delete set null,
  updated_at   timestamptz not null default now(),
  -- Same interval rule the other versioned mappings carry (0078).
  constraint dms_op_code_map_interval check (retired_at is null or retired_at >= effective_from)
);

comment on table dms_op_code_map is
  'A dealer''s raw DMS op code -> our catalog code. NOTHING READS THIS YET. It '
  'exists so that when coaching moves to op-code precision the bridge already '
  'has an honest effective-dated history. Written only through mapping_edit().';

-- One live row per (rooftop, dms code), the same guarantee checkmap enforces
-- for the other three mappings.
create unique index if not exists dms_op_code_map_live_idx
  on dms_op_code_map (rooftop_id, dms_op_code) where retired_at is null;

create index if not exists dms_op_code_map_rooftop_idx
  on dms_op_code_map (rooftop_id, status);

/* The current-version view, matching sub_category_map_live (0074). */
create or replace view dms_op_code_map_live as
  select * from dms_op_code_map where retired_at is null;

alter table dms_op_code_map enable row level security;

/*
 * PLATFORM OWNER ONLY, matching the other mapping tables. This is Mitch's
 * vocabulary, not a rooftop's, and an advisor has no reason to read a
 * dealer's whole op-code list.
 */
drop policy if exists dms_op_code_map_owner on dms_op_code_map;
create policy dms_op_code_map_owner on dms_op_code_map
  for all
  using ((select is_platform_owner()))
  with check ((select is_platform_owner()));


-- ---- 3. The lock -----------------------------------------------------------
/*
 * A DEALER'S TABLE, RULED AND CLOSED.
 *
 * Onboarding a dealer ends somewhere: the list is pulled, auto-matched, ruled,
 * and then it is done. Lock is that ending. It does not forbid edits — it makes
 * them announce themselves, because after the table is ruled an edit is no
 * longer "finishing onboarding", it is changing a mapping that months have
 * already been measured under.
 *
 * On `org` rather than a table of its own: one dealer, one lock, and a nullable
 * timestamp is the whole of it. `org` is also already the dealer grain the
 * picker groups by, so a second dealer arrives locked=null with no schema
 * change — which was the brief's test.
 */
alter table org
  add column if not exists codes_locked_at timestamptz,
  add column if not exists codes_locked_by uuid references app_user(id) on delete set null;

comment on column org.codes_locked_at is
  'When this dealer''s code table was ruled complete. Null means still being '
  'onboarded. After lock, edits demand the new-measurement-epoch confirmation. '
  'See /admin/mapping/dealer-codes.';
