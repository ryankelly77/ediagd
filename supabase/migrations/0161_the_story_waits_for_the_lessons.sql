-- ============================================================================
-- EDIAGD — 0161 The story waits for the lessons
--
-- Ryan, 5 October: "I can submit my good news story ahead of completing all of
-- the videos. This should not be possible."
--
-- 0127 built the record and four RLS rules about WHO may write a story. It said
-- nothing about WHEN, so `advisor_story_insert` accepted a row from the author
-- on day one of a track. The application gate is submitStory() in
-- lib/story-actions.ts and that is the boundary; this is the belt to its braces,
-- exactly as the user_id arm already is.
--
-- ---------------------------------------------------------------------------
-- WHY THE POLICY CAN AFFORD THE CONDITION
-- ---------------------------------------------------------------------------
-- The worry with a predicate in a WITH CHECK is cost per row. This one is
-- evaluated once per INSERTed story, and a story is written at most once per
-- track per advisor — eight times in a credential's eight-to-fifteen months.
-- It is not on any read path and not on any hot path. Compare the read policy,
-- which runs its three arms on every row a manager lists.
--
-- ---------------------------------------------------------------------------
-- THE POPULATION IS GATING MODULES, AND my_certification_progress IS NOT IT
-- ---------------------------------------------------------------------------
-- The tempting one-liner is 0117's rollup: done_modules >= total_modules. Its
-- `mods` CTE is certification_course join module with NO gating filter, so the
-- denominator holds cue-only modules, and since 0143 a cue-only module can never
-- earn a module_completion row. On any track holding one the comparison is false
-- FOREVER.
--
-- Measured on production, 8 October — craft tracks, 0117's denominator against
-- the gating population:
--
--     craft-walk-around                   13 / 12   1 cue-only   NEVER  [core]
--     craft-setting-up-the-mpi            11 / 10   1 cue-only   NEVER  [core]
--     craft-four-step-close               13 / 11   2 cue-only   NEVER  [core]
--     craft-success-cycle                 20 / 13   7 cue-only   NEVER  [core]
--     craft-overcoming-objections         15 / 12   3 cue-only   NEVER  [core]
--     craft-power-of-positive-language     7 /  0   7 cue-only   NEVER  [core]
--     craft-chemical-warranty             18 / 12   6 cue-only   NEVER  [master]
--
-- Six of the nine core tracks, which is the 30 September incident verbatim —
-- requiring every module "made six of the nine core tracks structurally
-- unearnable" (lib/lms.ts). A policy keyed on that rollup would have refused
-- every story on those six forever, and refused them in the direction that looks
-- like caution.
--
-- So this reads gating_content_types() — the same definition my_module_progress,
-- moduleRequirementsMet() and craftModuleProgress() read — and the credential's
-- own rule for the modules leg: every gating module carries a module_completion
-- row for this advisor, over a non-empty set.
-- ============================================================================

-- ---- 1. The predicate -------------------------------------------------------

/**
 * Are this track's lessons finished for the CALLER?
 *
 * SECURITY DEFINER and NO USER PARAMETER, both for the reasons 0117 and 0127
 * give. `content` carries RLS, so evaluated as the invoker a base-tier advisor's
 * GATING SET would shrink to what their rooftop has bought and the gate would
 * open early — the 0117 denominator hazard pointing at a permission instead of a
 * percentage. And a `_user uuid` argument would let any signed-in advisor probe
 * whether a colleague has finished a track, so there is no parameter to forge.
 *
 * NAMING THE ROLES, because a gate written as "not X" has decided something
 * about every role that is not X:
 *
 *   authenticated   the advisor writing their own story — the real caller, and
 *                   the one the gate is for. Proved both ways in §3.
 *   service_role    bypasses RLS, so the policy never runs for it. Nothing
 *                   server-side inserts a story (the accrual only READS, via
 *                   my_story_for) — and if that changes, the write will not be
 *                   silently gated, it will simply not be gated here.
 *   anon            all privileges revoked on advisor_story by 0127.
 *   manager/admin   may not insert for anybody else at all (the user_id arm),
 *                   and writing their OWN story meets this same condition.
 *
 * STABLE, not immutable: it reads module_completion, which changes under it.
 */
create or replace function my_track_lessons_complete(_certification uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with mods as (
    /* DISTINCT because a module reachable through two course links must not be
       counted twice — the lesson the service branch learned in 0116 and the
       craft branch keeps having to relearn. Harmless under `exists`, and it
       stays correct if this ever grows a count. */
    select distinct m.id
      from certification_course cc
      join module m on m.course_id = cc.course_id
     where cc.certification_id = _certification
  ),
  gating as (
    /*
     * A module gates when it holds at least one PUBLISHED, UNRETIRED item of a
     * gating type. `retired_at is null` matches gatingModuleIds() in lib/lms.ts,
     * which is what the track page and the credential count — and it is NOT what
     * my_module_progress.items_done does, which filters on status alone. That
     * divergence is real today: 15 advisor_video rows are published AND retired
     * on production, 8 October. This function agrees with the surfaces that
     * decide the credential, because a gate disagreeing with the screen that
     * invites the write is the failure being fixed here.
     */
    select distinct mo.id
      from mods mo
      join content c on c.module_id = mo.id
     where c.status = 'published'::public.content_status
       and c.retired_at is null
       and c.type = any (gating_content_types())
  )
  select
    /*
     * NON-EMPTY FIRST. `not exists (... unfinished ...)` over an empty set is
     * TRUE, which would open the story on a track whose films have not been
     * shot — Power of Positive Language today, seven modules and no film.
     * certificationEarned() refuses the empty set for the same reason.
     */
    exists (select 1 from gating)
    and not exists (
      select 1
        from gating g
       where not exists (
         select 1
           from module_completion mc
          where mc.module_id = g.id
            and mc.user_id = (select auth.uid())
       )
    );
$$;

comment on function my_track_lessons_complete is
  'Are the track''s GATING lessons all complete for the caller? The condition the '
  'Good News Story waits on (0161). Gating modules, never every module: 0117''s '
  'total_modules counts cue-only modules that can never complete, which is false '
  'forever on six of the nine core tracks. Takes no user argument — it reads '
  'auth.uid(), so there is no parameter to forge. The application boundary is '
  'submitStory(); this is the second refusal.';

revoke all on function my_track_lessons_complete(uuid) from public, anon;
grant execute on function my_track_lessons_complete(uuid) to authenticated, service_role;

-- ---- 2. The condition, on INSERT only ---------------------------------------

/*
 * RESTATED IN FULL rather than patched, so the next reader sees the rule instead
 * of a diff — the posture 0143 took with my_module_progress. The first two arms
 * are 0127's, unchanged.
 */
drop policy if exists advisor_story_insert on advisor_story;
create policy advisor_story_insert on advisor_story
  for insert with check (
    user_id = (select auth.uid())
    and rooftop_id in (select my_rooftops())
    /* 0161 — and not before the lessons are done. */
    and my_track_lessons_complete(certification_id)
  );

/*
 * THE UPDATE POLICY IS DELIBERATELY NOT NARROWED TO MATCH.
 *
 * An advisor who has already written a story keeps it and keeps editing it,
 * whatever the lesson count later says. Three ways that state is reachable and
 * every one is legitimate: a story written before this migration (nothing is
 * deleted — Ryan's instruction), a tenth film published onto a track that was
 * complete when they wrote, and a film retired from under them. The gate is
 * about writing a first story early. Freezing somebody's own words because the
 * catalogue moved would be a new defect wearing this one's clothes.
 *
 * Shown here rather than left implicit: a reader comparing the two policies
 * should find the asymmetry explained, not have to guess it was an oversight.
 */

-- ---- 3. Prove it, both directions -------------------------------------------

/*
 * A REFUSAL IS NOT SELF-VERIFYING. A policy that refuses looks identical whether
 * it is right or wrong, so the acceptance half is asserted first and is the half
 * that catches a gate which refuses everything. Run AS `authenticated` with a
 * forged JWT claim, because as the owner neither arm is consulted.
 *
 * Everything here is rolled back — the DO block raises at the end to unwind its
 * own fixtures. A migration that leaves acceptance rows behind is a migration
 * that seeds production.
 */
do $$
declare
  _org      uuid;
  _roof     uuid;
  _user     uuid := gen_random_uuid();
  _cert     uuid;
  _course   uuid;
  _mod_film uuid;
  _mod_cue  uuid;
  _film     uuid;
  _refused  text := null;
  _failure  text := null;
begin
  /*
   * ITS OWN FIXTURES, never the catalogue. 0143's data proofs had to grow a skip
   * path because a fresh local has no content and the refusal was making the
   * chain unreplayable. A probe that builds the exact population it is about
   * needs no skip path and proves the same thing everywhere — including on a
   * database where no advisor has finished anything yet, which is every database
   * today.
   *
   * IT NEEDS AN auth.users ROW, and finding that out is worth recording. The
   * local database this was first written against had `app_user` carrying only a
   * primary key, so the probe skipped auth entirely and passed. The FULL CHAIN
   * replay has `app_user_id_fkey` referencing auth.users(id), and the probe
   * failed on statement 6. The schema was measured on one database and stated as
   * a fact about the schema — which is this project's oldest rule, caught here by
   * the one check that uses the real population: `supabase db reset --local`.
   *
   * auth.users needs nothing but an id. The row is rolled back with the rest.
   */
  insert into org (name) values ('0161 probe org') returning id into _org;
  insert into rooftop (name, org_id, timezone)
    values ('0161 probe roof', _org, 'America/Chicago') returning id into _roof;
  insert into auth.users (id) values (_user);
  insert into app_user (id, full_name) values (_user, '0161 Probe');
  insert into membership (user_id, rooftop_id, role, active)
    values (_user, _roof, 'advisor', true);

  insert into certification (slug, name, kind, is_core, glyph_key, sort)
    values ('0161-probe-track', '0161 Probe Track', 'craft', false,
            'craft_walk_around', 999)
    returning id into _cert;
  insert into course (track, name, slug)
    values ('craft', '0161 Probe Course', '0161-probe-course')
    returning id into _course;
  insert into certification_course (certification_id, course_id, sort)
    values (_cert, _course, 1);

  insert into module (course_id, name, sort_order)
    values (_course, '0161 Probe Lesson', 1) returning id into _mod_film;
  /*
   * A CUE-ONLY MODULE IN THE SAME TRACK, and it is the whole point of the
   * fixture. Under 0117's denominator this track can NEVER satisfy the gate, so
   * if the acceptance half below passes, the condition is demonstrably counting
   * the gating population and not every module. Without this row the probe would
   * pass just as well with the wrong rollup in the policy.
   */
  insert into module (course_id, name, sort_order)
    values (_course, '0161 Probe Reinforcement', 2) returning id into _mod_cue;

  insert into content (title, type, status, module_id)
    values ('0161 probe film', 'advisor_video', 'published', _mod_film)
    returning id into _film;
  insert into content (title, type, status, module_id)
    values ('0161 probe cue', 'cue', 'published', _mod_cue);

  -- ---- the refusal half: no module_completion yet ---------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', _user, 'role', 'authenticated')::text, true);

  /*
   * ASSERT THE HARNESS BEFORE ASSERTING THE SUBJECT. `set_config(..., true)` is
   * a no-op outside a transaction, and as the owner RLS is never consulted — so
   * the insert would succeed and this probe would report a broken gate, or worse
   * the acceptance half would "pass" while testing nothing. A check that cannot
   * fail is not a check, and that applies to its own scaffolding first.
   */
  if current_user <> 'authenticated' then
    _failure := format(
      '0161 FAILED: could not become `authenticated` (current_user is %s), so '
      'neither half of this probe would have exercised the policy.', current_user);
  end if;

  if _failure is null then
    begin
      insert into advisor_story (user_id, rooftop_id, certification_id, body)
        values (_user, _roof, _cert, 'written on day one');
      _refused := null;
    exception
      when insufficient_privilege or check_violation then
        _refused := sqlerrm;
    end;

    if _refused is null then
      _failure :=
        '0161 FAILED: the insert policy accepted a story with every lesson '
        'outstanding. This is the defect the migration exists to close.';
    end if;
  end if;

  perform set_config('role', 'postgres', true);

  -- ---- the acceptance half, and it is the one that catches a dead gate ------
  if _failure is null then
    insert into content_progress (user_id, rooftop_id, content_id, completed_at)
      values (_user, _roof, _film, now());
    insert into module_completion (user_id, module_id)
      values (_user, _mod_film);

    perform set_config('role', 'authenticated', true);

    begin
      insert into advisor_story (user_id, rooftop_id, certification_id, body)
        values (_user, _roof, _cert, 'and now the words are earned');
    exception when others then
      _failure := format(
        '0161 FAILED: the insert policy refused a story on a track whose GATING '
        'lessons are all complete (%s). The cue-only module cannot earn a '
        'module_completion row and must not be counted — refusing here is the '
        'six-of-nine failure, and it would have looked like caution.', sqlerrm);
    end;

    perform set_config('role', 'postgres', true);
  end if;

  if _failure is null then
    /* `%` and not `%s` — RAISE takes a bare percent. `%s` prints the value and
       then a stray literal "s", which is how the first run of this probe
       reported a table called "advisor_story"s. */
    raise notice
      '0161 proved, as `authenticated`: refused with the lessons outstanding (%), '
      'accepted once every GATING lesson was complete — on a track that also holds '
      'a cue-only module.', _refused;
  end if;

  /*
   * UNWIND. Raising out of a block with an EXCEPTION clause discards every write
   * the block made, which is the only way to roll back inside a DO. A migration
   * that leaves its probe fixtures behind has seeded production with a fake
   * rooftop and a fake track.
   */
  raise exception 'ROLLBACK_0161_PROBE: %', coalesce(_failure, 'ok');
exception
  when others then
    if sqlerrm like 'ROLLBACK_0161_PROBE: ok' then
      raise notice '0161 probe fixtures rolled back.';
    elsif sqlerrm like 'ROLLBACK_0161_PROBE: %' then
      /* Re-raise the real finding, now that the fixtures are gone. `substring`
         and not `ltrim`: ltrim takes a SET OF CHARACTERS, not a prefix, so it
         would eat any leading letter that happened to appear in the tag. */
      raise exception '%',
        substring(sqlerrm from length('ROLLBACK_0161_PROBE: ') + 1);
    else
      raise;
    end if;
end $$;

notify pgrst, 'reload schema';
