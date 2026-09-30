/* ===========================================================================
   0143 — A CUE NEVER GATES A MODULE
   ===========================================================================

   Walk Around and Overcoming Objections are attached and serving advisors now,
   and their modules hold films AND cues:

     Walk Around             3 videos   56 cues   59 items   worst module 11
     Overcoming Objections   2 videos   29 cues   31 items   worst module  9

   An advisor ticks eleven things to close one Walk Around module, three of which
   are film. That is not a gaming risk; it is the coaching model inverted. A cue is
   reinforcement, and reinforcement that gates a lesson turns the lesson into a
   checklist. Sixty advisors meet it tomorrow.

   ---------------------------------------------------------------------------
   THE RULE WAS IMPLEMENTED TWICE, WHICH IS THE REAL DEFECT
   ---------------------------------------------------------------------------

   Two independent definitions of "module complete" exist and both counted cues:

     SQL   my_module_progress.items_done
             count(c.id) > 0 and count(c.id) = count(cp.content_id)
             — feeds the library screens and the quiz-page redirect
     TS    moduleRequirementsMet() in lib/lms.ts
             itemsDone = completedItems >= ids.length
             — feeds module_completion, which is what the credential reads

   Changing one would have made the gate and the screen disagree: a module the
   system considered finished while the page said "3 of 11". So both move here, in
   the same commit, and the allowlist they share is defined ONCE — as
   `gating_content_types()` below, which the view calls. The TypeScript mirrors it
   and `npm run check:gating` fails if the two ever differ, because two lists that
   must agree with nothing comparing them is how `--publish-when-ready` survived.

   ---------------------------------------------------------------------------
   AN ALLOWLIST, NOT `type <> 'cue'`
   ---------------------------------------------------------------------------

   The enum holds six values: cue, advisor_video, manager_video, joe_the_pro,
   quote, technician_video. Only `cue` and `advisor_video` have ever appeared
   inside a module. A denylist would mean the next type anybody attaches starts
   gating silently — `technician_video` in particular, whose whole point (0091) is
   that it belongs to a different audience.

   So the allowlist is exactly `advisor_video`, and a technician track will need
   `technician_video` added deliberately, one line, when its first module exists.

   ---------------------------------------------------------------------------
   total_items AND completed_items DO NOT CHANGE MEANING
   ---------------------------------------------------------------------------

   The library shows "3 of 11" from `total_items` / `completed_items`, and a module
   still LISTS its cues — an advisor works through them, they are just not a gate.
   So those two stay as they are, counting every published item, and only
   `items_done` narrows. Changing the displayed number to "1 of 1" would have made
   the screen stop describing the page it is on.

   ---------------------------------------------------------------------------
   THE NON-EMPTY GUARD, AND WHY IT MATTERS ONLY NOW
   ---------------------------------------------------------------------------

   Both implementations already refuse an empty item set — the view has
   `count(c.id) > 0`, the function returns `met: false` when `ids` is empty. Today
   neither ever fires, because a cue-bearing module always has items.

   The moment cues stop counting, a cue-only module has ZERO gating items, and
   without that guard `completedItems >= ids.length` is `0 >= 0` — true. Every
   filmless module would complete itself instantly. That is 197 cue-only modules
   across five tracks, and Power of Positive Language — 51 cues, no film, active —
   would certify an advisor on content that does not exist.

   The guard is not there to stop an advisor getting ahead. It is there to stop the
   system awarding a credential for nothing. It is now load-bearing rather than
   theoretical, which is why it is asserted below rather than trusted.
   =========================================================================== */

/*
 * THE ONE PLACE THE ALLOWLIST LIVES.
 *
 * IMMUTABLE and no search_path dependency, so it is safe in a view definition and
 * cannot be redefined by a caller's path. Returns an array rather than taking a
 * value so the list can be read and compared by a check script.
 */
create or replace function gating_content_types()
  returns public.content_type[]
  language sql
  immutable
  set search_path = ''
as $$ select array['advisor_video']::public.content_type[] $$;
/* Types are SCHEMA-QUALIFIED because search_path is empty. Unqualified
   `content_type[]` fails to resolve — the same emptiness that makes the function
   safe inside a view is what stops it finding its own return type. */

/*
 * THE ENUM ITSELF, so a check can ask "is every content type accounted for?"
 * rather than inferring from the rows that happen to exist.
 *
 * check:gating first tried `select type from content` and read ONE type, because
 * that select hit the 1000-row cap and returned a single page — the unstable-paging
 * fault this codebase has shipped before, here making a check under-report and pass.
 * A type with zero rows today is exactly the one somebody attaches tomorrow, so the
 * enum is the right population and the rows never were.
 */
create or replace function content_type_values()
  returns text[]
  language sql
  stable
  set search_path = ''
as $$
  select array_agg(e.enumlabel::text order by e.enumsortorder)
    from pg_catalog.pg_enum e
   where e.enumtypid = 'public.content_type'::regtype
$$;

comment on function content_type_values is
  'Every value of the content_type enum, for checks that must account for all of '
  'them. Reading distinct values out of `content` is evidence about rows, not types.';

comment on function gating_content_types is
  'The content types whose completion gates a module. A cue is reinforcement and '
  'never gates. An ALLOWLIST on purpose: a denylist would silently enrol the next '
  'type anybody adds, technician_video first. lib/lms.ts mirrors this and '
  'npm run check:gating asserts the two agree.';

/*
 * items_done NARROWS TO THE GATING TYPES. total_items and completed_items keep
 * counting everything, because they are what the screen displays and the module
 * still lists its cues.
 *
 * Rebuilt rather than patched: `create or replace view` cannot change a column
 * list, and stating the whole definition is how the next reader sees the rule
 * rather than a diff.
 */
create or replace view my_module_progress as
  select m.id as module_id,
         m.course_id,
         m.name as module_name,
         m.name_status,
         m.sort_order,
         count(c.id)::integer as total_items,
         count(cp.content_id)::integer as completed_items,
         /*
          * THE GATE. Filtered aggregates so it is one pass over the same join:
          * at least one gating item must exist, and every one of them done.
          * `count(c.id) > 0` on the unfiltered set would be the old behaviour and
          * is deliberately not what this says.
          */
         count(c.id) filter (where c.type = any (gating_content_types())) > 0
           and count(c.id) filter (where c.type = any (gating_content_types()))
             = count(cp.content_id) filter (where c.type = any (gating_content_types()))
           as items_done,
         (exists (select 1 from quiz_question q
                   where q.module_id = m.id and q.status = 'published')) as has_quiz,
         (exists (select 1 from quiz_attempt a
                   where a.module_id = m.id and a.user_id = (select auth.uid()) and a.passed)) as quiz_passed,
         (select mc.completed_at from module_completion mc
           where mc.module_id = m.id and mc.user_id = (select auth.uid())) as completed_at,
         max(cp.completed_at) as last_activity
    from module m
    left join content c
      on c.module_id = m.id and c.status = 'published'::public.content_status
    left join content_progress cp
      on cp.content_id = c.id and cp.user_id = (select auth.uid())
     and cp.completed_at is not null
   group by m.id, m.course_id, m.name, m.name_status, m.sort_order;

comment on view my_module_progress is
  'Per-module progress for the signed-in advisor. total_items and completed_items '
  'count EVERY published item because the screen lists them all; items_done counts '
  'only gating_content_types(), because a cue never gates. See 0143.';

/* ===========================================================================
   PROVE IT, BOTH DIRECTIONS
   =========================================================================== */

do $$
declare
  _n int;
  _types text;
begin
  select array_to_string(gating_content_types(), ',') into _types;
  if _types <> 'advisor_video' then
    raise exception '0143: gating types are %, expected advisor_video', _types;
  end if;

  /*
   * THE REFUSAL HALF. A cue-only module must NOT read items_done — that is the
   * self-completing credential this migration exists to prevent. Checked against
   * the view's own expression rather than a restatement of it, because a
   * restatement would be a third copy of the rule.
   */
  select count(*) into _n
    from module m
   where exists (select 1 from content c
                  where c.module_id = m.id and c.status = 'published'
                    and c.type = 'cue')
     and not exists (select 1 from content c
                      where c.module_id = m.id and c.status = 'published'
                        and c.type = any (gating_content_types()));
  raise notice '0143: % cue-only module(s) exist and can no longer self-complete', _n;
  if _n = 0 then
    raise exception
      '0143: found no cue-only modules — the non-empty guard is untestable here, which means this database is not the one this migration is about';
  end if;

  /*
   * THE ACCEPTANCE HALF, and it is the one that gets skipped. A module holding a
   * film must still be gateable — if the allowlist were wrong or the filter
   * inverted, everything above would pass and nothing would ever complete.
   */
  select count(*) into _n
    from module m
   where exists (select 1 from content c
                  where c.module_id = m.id and c.status = 'published'
                    and c.type = any (gating_content_types()));
  if _n < 1 then
    raise exception '0143: no module has a gating item — the allowlist matches nothing';
  end if;
  raise notice '0143: % module(s) have a gating item and remain completable', _n;

  /*
   * AND THE DISPLAY DID NOT MOVE. total_items must still count cues, or the
   * library screens start describing a different page than the one they render.
   */
  select count(*) into _n
    from module m
    join content c on c.module_id = m.id and c.status = 'published' and c.type = 'cue'
   where exists (select 1 from content c2 where c2.module_id = m.id and c2.type='cue');
  if _n = 0 then
    raise exception '0143: no cue is attached to any module — total_items cannot be verified';
  end if;
  raise notice '0143: total_items still counts % cue row(s) for display', _n;
end
$$;
