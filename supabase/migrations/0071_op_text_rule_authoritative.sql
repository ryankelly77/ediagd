-- ============================================================================
-- EDIAGD — 0071 The op-text rules stop being a cache the rule file stamps on
--
-- Phase 0's mapping inventory called this the sharpest edge in the system, and
-- it exists today:
--
--   `npm run remap` calls set_op_text_rules(), which DELETES every row in
--   op_text_rule and re-inserts the nine rules from lib/dms/mapping.ts.
--
-- So the table is a projection and the file is the source. That was correct
-- while the file was the only way to author a rule. It stops being correct the
-- moment an admin screen exists: the first remap after Mitch edits an op-text
-- rule reverts him silently — no warning, no log, and the rule quietly goes
-- back to classifying revenue the old way.
--
-- This inverts it. The TABLE is authoritative; the file becomes a seed for an
-- empty environment and a thing to diff against.
--
-- ---------------------------------------------------------------------------
-- WHY THE GUARD IS IN THE DATABASE AND NOT IN THE SCRIPT
-- ---------------------------------------------------------------------------
-- Editing remap.ts to stop calling the RPC would fix the one caller we know
-- about. The RPC is still there, still `security definer`, still executable by
-- anything holding the service key — a script somebody writes next month, a
-- one-off in a console, a copy of remap on another laptop. A rule that only
-- holds while everyone remembers it is not a rule.
--
-- So set_op_text_rules() now REFUSES to run when any rule has been edited by a
-- human, and the refusal names the rules it would have destroyed.
-- ============================================================================


-- ---- 1. Who last wrote each rule -------------------------------------------
alter table op_text_rule
  /*
   * 'file'  came from OP_TEXT_RULES and nobody has touched it since
   * 'admin' a person edited it; the file no longer describes it
   *
   * This is the column the guard reads, and it is the column the admin screen
   * will use to show "edited" beside a rule. Defaulting to 'file' is right for
   * the nine rows that exist: they were seeded from the file and never edited.
   */
  add column if not exists origin text not null default 'file',
  add column if not exists updated_by uuid references app_user(id);

alter table op_text_rule drop constraint if exists op_text_rule_origin_valid;
alter table op_text_rule add constraint op_text_rule_origin_valid
  check (origin in ('file', 'admin'));

comment on column op_text_rule.origin is
  '''file'' = seeded from OP_TEXT_RULES and untouched; ''admin'' = a person '
  'edited it, and set_op_text_rules() will refuse to wipe the table.';

comment on table op_text_rule is
  'AUTHORITATIVE. Was a projection of OP_TEXT_RULES in lib/dms/mapping.ts until '
  '0071; the file is now a seed for an empty environment and a diff source. '
  'Evaluated by rebuild_dms_periods against dms_daily_metric.op_description.';


-- ---- 2. The destructive seeder refuses to destroy a human's work ------------
create or replace function set_op_text_rules(_rules jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  _n       int := 0;
  _edited  text;
begin
  if not (
    is_platform_owner()
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
       = 'service_role'
  ) then
    raise exception 'set_op_text_rules: platform owner only';
  end if;

  /*
   * THE INVERSION, ENFORCED.
   *
   * Delete-then-insert is still the right shape for seeding an empty
   * environment — a rule removed from the file must not survive. It is exactly
   * the wrong shape once a person has edited a rule here, because then the file
   * is not a superset of the truth and the delete throws away the only copy.
   *
   * The exception names the rules rather than saying "refused", because the
   * person reading it is deciding whether to keep their edit or take the file's
   * version, and they cannot decide that without knowing which rules disagree.
   */
  select string_agg(sub_category, ', ' order by sub_category)
    into _edited
    from op_text_rule
   where origin = 'admin';

  if _edited is not null then
    raise exception
      'set_op_text_rules: refusing to wipe admin-edited rules (%). '
      'op_text_rule is authoritative since 0071 — use seed_op_text_rules() to '
      'add missing rules without destroying these, or reset origin to ''file'' '
      'on a rule you genuinely want the file to own again.', _edited;
  end if;

  delete from op_text_rule where true;

  insert into op_text_rule (sub_category, family, include_pattern, exclude_pattern, priority, note, origin)
  select normalise_sub_category(r.sub_category), r.family, r.include_pattern,
         nullif(r.exclude_pattern, ''), coalesce(r.priority, 100), r.note, 'file'
    from jsonb_to_recordset(_rules) as r(
      sub_category text, family text, include_pattern text,
      exclude_pattern text, priority int, note text
    );
  get diagnostics _n = row_count;
  return _n;
end $$;


-- ---- 3. The additive seeder, which is what remap should have been ----------
/**
 * Insert rules the table does not have. Never deletes, never overwrites.
 *
 * This is the safe half of what set_op_text_rules did: a fresh environment
 * still gets the nine rules, and an environment where Mitch has been working
 * gets whatever the file has added since — without a single existing row
 * changing underneath him.
 *
 * Returns the number of rules actually inserted, so a caller can say "nothing
 * to do" rather than implying it rewrote nine rules it did not touch.
 */
create or replace function seed_op_text_rules(_rules jsonb)
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
    raise exception 'seed_op_text_rules: platform owner only';
  end if;

  insert into op_text_rule (sub_category, family, include_pattern, exclude_pattern, priority, note, origin)
  select normalise_sub_category(r.sub_category), r.family, r.include_pattern,
         nullif(r.exclude_pattern, ''), coalesce(r.priority, 100), r.note, 'file'
    from jsonb_to_recordset(_rules) as r(
      sub_category text, family text, include_pattern text,
      exclude_pattern text, priority int, note text
    )
  on conflict (sub_category) do nothing;

  get diagnostics _n = row_count;
  return _n;
end $$;

revoke all on function seed_op_text_rules(jsonb) from public, anon;
grant execute on function seed_op_text_rules(jsonb) to authenticated;


-- ---- 4. An admin can now edit a rule directly -------------------------------
/*
 * Until now op_text_rule had a read policy and no write policy at all: every
 * write went through the security-definer RPC, because the only writer was a
 * script. The screens need a rule to be editable by the person looking at it,
 * and `origin` is stamped by the trigger below so an edit cannot forget to
 * mark itself.
 */
drop policy if exists op_text_rule_admin_write on op_text_rule;
create policy op_text_rule_admin_write on op_text_rule
  for all
  using (exists (select 1 from membership m
                 where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
         or is_platform_owner())
  with check (exists (select 1 from membership m
                 where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
         or is_platform_owner());

/*
 * A HUMAN EDIT MARKS ITSELF. Leaving `origin` to the caller means the one
 * update that forgets it is the one the next remap silently reverts — which is
 * the whole failure this migration exists to end. The trigger only fires for a
 * real session; the seeders run as the service role and set origin explicitly.
 */
create or replace function op_text_rule_stamp_admin()
returns trigger language plpgsql as $$
begin
  if (select auth.uid()) is not null then
    new.origin := 'admin';
    new.updated_by := (select auth.uid());
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists op_text_rule_marks_its_edits on op_text_rule;
create trigger op_text_rule_marks_its_edits
  before insert or update on op_text_rule
  for each row execute function op_text_rule_stamp_admin();
