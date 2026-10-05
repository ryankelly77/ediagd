/* ===========================================================================
   0160 — THE LIBRARY SHOWS WHAT IT HAS

   Ryan's rulings of 5 October, on the audit in
   reports/lesson-library-audit-5-october.md.

   THE DEFECT, IN ONE LINE: 35 of 45 courses have no film, every one of them is
   listed, and a filmless module reads "0 of 8 · 0%" over a denominator of cues
   that cannot move it — because `items_done` has needed an `advisor_video`
   since 0143 while `total_items` kept counting everything.

   An advisor tapping Product Knowledge saw sixteen courses and not one film.

   ---------------------------------------------------------------------------
   WHAT THIS MIGRATION DOES
   ---------------------------------------------------------------------------
     A  course visibility, DERIVED — a course is offered only if one of its
        modules holds a film. Plus an explicit, recorded override.
     B  the progress views count GATING items only, and gain the counts the
        screens need to tell "no lesson yet" from "nothing here at all".
     C  recompute_certification_content() counts gating items only, and gains
        an activation hold so a ruling can outrank the arithmetic.
     D  the duplicate cue rows, deduped — 23 of them, not 295.
     E  Walk Around becomes the routine in order: 13 modules, 12 lessons.
     F  the twelve Coverage is Key films become The MOC Warranty Program.
     G  Menus gains its closer as module 10.

   ---------------------------------------------------------------------------
   THREE PLACES THIS DOES NOT DO WHAT THE RULING LITERALLY SAID, AND WHY
   ---------------------------------------------------------------------------
   Each is reported in the PR rather than decided quietly.

   1. "course.visible boolean not null default true" is NOT a stored flag that
      a backfill sets. `default true` is precisely the hole AGENTS.md names
      under "an exclusion by value is not an exclusion unless the value is
      mandatory": the next filmless course anybody imports takes the default
      and is VISIBLE, which is the bug this migration exists to close. So
      visibility is DERIVED in the view and cannot go stale — a film landing or
      being retired changes the answer with no trigger and no backfill. The
      override that the ruling also wanted is a separate NULLABLE column, so
      "nobody has ruled" and "Ryan said show it anyway" are different states
      and the second one leaves a trace.

   2. The dedupe is keyed on (module_id, title, body), NOT (module_id, body).
      The ruling's COUNT is right and its KEY is not, and they disagree by five
      real cues:

        (module_id, title)        229 groups  295 surplus   <- the brief's first number
        (module_id, title, body)   11 groups   23 surplus   <- the ruling's count
        (module_id, body)          14 groups   28 surplus   <- the ruling's key

      The five extra rows the body-only key would delete have DIFFERENT titles
      and the same body — and in this library the title is where the teaching
      often lives (728 cues carry it there). Two of the five are
      "BPF-028 Brake Pads Front" and "BPR-029 Brake Pads Rear": one body, two
      op codes, front and rear. Deduping on body deletes rear brake pads and
      reports a cleanup.

   3. "assert module_completion and content_progress rows unchanged" holds for
      module_completion and CANNOT hold for content_progress: 9 progress rows
      point at rows being deleted. They are MERGED onto the keeper rather than
      cascaded away, so no advisor loses credit, and the exact delta is
      asserted and reported instead of a figure that would have to be wrong.

   Also: "keep the oldest" does not discriminate here. All 23 surplus rows
   share created_at = 2026-08-03T21:13:50.769671+00:00, to the microsecond, so
   the tiebreak is the lowest id and that is stated rather than left to
   whichever order the planner returns.

   ---------------------------------------------------------------------------
   THE LOCAL-REPLAY SKIP, same shape as 0142, 0144 and 0159
   ---------------------------------------------------------------------------
   The local seed carries none of these films and no deck import, so on
   `db reset --local` every data leg takes its "not present — skipping" path
   and this migration is a structural no-op. The schema halves — views,
   functions, columns — run everywhere and are asserted everywhere. Both
   halves are proven: the skip path on a full local replay, the build path on a
   restore of the production dump.
   =========================================================================== */


-- ============================================================================
-- A. COURSE VISIBILITY, DERIVED — with a recorded override
-- ============================================================================

/*
 * NULL means "nobody has ruled, derive it". true/false is an explicit ruling,
 * and `visible_reason` is why — because a hold that leaves no trace when it is
 * overridden is not a hold (AGENTS.md), and the same is true of a reveal.
 */
alter table course
  add column if not exists visible_override boolean,
  add column if not exists visible_reason   text;

comment on column course.visible_override is
  'NULL = derive visibility from whether any module holds a gating item (the '
  'normal case, and the one that cannot go stale). true/false = an explicit '
  'ruling that outranks the derivation; say why in visible_reason. 0160.';

/* Guarded because Postgres has no `add constraint if not exists`, and a
   migration that cannot be re-run is a migration that cannot be replayed. */
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'course_visible_override_has_reason'
       and conrelid = 'public.course'::regclass
  ) then
    alter table course
      add constraint course_visible_override_has_reason
      check (visible_override is null or visible_reason is not null);
  end if;
end $$;


-- ============================================================================
-- B. THE PROGRESS VIEWS COUNT GATING ITEMS ONLY
-- ============================================================================
/*
 * 0143 narrowed `items_done` to gating_content_types() and DELIBERATELY left
 * total_items counting everything, with this reasoning:
 *
 *   "Changing the displayed number to '1 of 1' would have made the screen stop
 *    describing the page it is on."
 *
 * That was right when the page listed cues as the thing to work through. It is
 * wrong now, and Ryan's ruling 6 reverses it: the number must describe what can
 * actually be completed, because "0 of 8 · 0%" on a module whose eight items
 * cannot move the percentage is a confident wrong answer, which this codebase
 * holds to be worse than a crash.
 *
 * So total_items/completed_items narrow to the gating types, and TWO NEW
 * COLUMNS carry what the old meaning was for:
 *
 *   all_items    every published row in the module. Distinguishes "no lesson
 *                yet, but there are cues" from "nothing here at all" — which
 *                is the difference between a module the library should list as
 *                reinforcement and one it must not list at all.
 *   cue_items    the non-gating remainder, so a deck can say "4 cues".
 *
 * Dropped and recreated rather than replaced: `create or replace view` cannot
 * change a column list, and my_course_progress depends on this one so it goes
 * first and comes back after.
 */
drop view if exists my_course_progress;
drop view if exists my_module_progress;

create view my_module_progress as
  select m.id                                   as module_id,
         m.course_id,
         m.name                                 as module_name,
         /*
          * THE COURSE'S NAME, carried so the Continue card can say WHICH track
          * the lesson belongs to. "5. Tires on the Drive" on its own is not a
          * place — an advisor returning after a week needs "The Walk-Around"
          * above it. Joined here rather than fetched by the card, because
          * loadContinuePoint returns ONE row and a second round trip for one
          * string is the per-module fan-out 0035 exists to prevent.
          *
          * Advisor-facing copy calls this a TRACK and calls a module a LESSON;
          * the schema keeps `course` and `module`. The column is named for the
          * schema, and the translation happens once, in the component.
          */
         co.name                                as course_name,
         co.track                               as course_track,
         m.name_status,
         m.sort_order,
         /* THE GATING COUNTS — what "0 of N" now means. */
         count(c.id) filter (where c.type = any (gating_content_types()))::integer
           as total_items,
         count(cp.content_id) filter (where c.type = any (gating_content_types()))::integer
           as completed_items,
         /* THE POPULATION COUNTS — what the screen may list. */
         count(c.id)::integer                   as all_items,
         count(c.id) filter (where not (c.type = any (gating_content_types())))::integer
           as cue_items,
         /* Unchanged from 0143, and still the one definition of the gate. */
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
         max(cp.completed_at)                   as last_activity
    from module m
    join course co on co.id = m.course_id
    left join content c
      on c.module_id = m.id and c.status = 'published'::public.content_status
    left join content_progress cp
      on cp.content_id = c.id and cp.user_id = (select auth.uid())
     and cp.completed_at is not null
   group by m.id, m.course_id, m.name, co.name, co.track, m.name_status, m.sort_order;

alter view my_module_progress set (security_invoker = on);

comment on view my_module_progress is
  'Per-module progress for the signed-in advisor. total_items/completed_items '
  'count GATING items only (0160, reversing 0143''s display choice): the number '
  'on screen must be one the advisor can drive to completion. all_items counts '
  'every published row so a surface can tell "no lesson yet" from "nothing '
  'here"; cue_items is the non-gating remainder.';

/*
 * COURSE LEVEL. total_modules counts LESSONS — modules holding a gating item —
 * not every module, for the same reason total_items narrowed: Success Cycle has
 * 13 lessons and 7 cue-only modules, and "13 of 20" would be a denominator an
 * advisor can never reach. listable_modules is the render count.
 *
 * `visible` IS DERIVED HERE and is the whole of rule 1. A course with no film
 * anywhere is not offered; a film landing makes it offered on the next read,
 * with no trigger to forget and no flag to backfill.
 */
create view my_course_progress as
  select c.id                                            as course_id,
         c.track,
         c.name,
         c.slug,
         c.sort_order,
         count(*) filter (where mp.total_items > 0)::integer        as total_modules,
         count(*) filter (where mp.completed_at is not null)::integer as completed_modules,
         coalesce(sum(mp.total_items), 0)::integer       as total_items,
         coalesce(sum(mp.completed_items), 0)::integer   as completed_items,
         count(*) filter (where mp.name_status = 'needs_name')::integer as modules_needing_names,
         count(*) filter (where mp.all_items > 0)::integer           as listable_modules,
         max(mp.last_activity)                           as last_activity,
         coalesce(
           c.visible_override,
           count(*) filter (where mp.total_items > 0) > 0
         )                                               as visible
    from course c
    left join my_module_progress mp on mp.course_id = c.id
   group by c.id, c.track, c.name, c.slug, c.sort_order,
            c.visible_override;

alter view my_course_progress set (security_invoker = on);

comment on view my_course_progress is
  'Per-course progress for the signed-in advisor. total_modules counts LESSONS '
  '(modules with a gating item), listable_modules counts modules with any '
  'published content. `visible` is DERIVED — true when the course has at least '
  'one lesson — and course.visible_override outranks it when somebody has '
  'ruled. Nothing stores visibility, so nothing can hold a stale answer. 0160.';

/*
 * ---- THE GRANTS, EXPLICITLY -----------------------------------------------
 *
 * DROP VIEW TAKES THE VIEW'S PRIVILEGES WITH IT. 0143 could use
 * `create or replace`, which preserves them; this migration changes the column
 * list, which `create or replace` cannot do, so both views are genuinely new
 * objects with no inherited ACL.
 *
 * In practice Supabase's default privileges re-grant anon and authenticated on
 * anything created in `public`, and a local replay confirms they are present
 * after this migration. But "it happens to be re-granted by a database-level
 * default somebody could change" is not the same as "this migration grants
 * what its readers need", and the failure mode is the entire Lesson Library
 * returning permission-denied for every advisor at once.
 *
 * Named by the role that really calls it, which is the step this project keeps
 * paying for skipping:
 *   authenticated  every library screen, read as the advisor   — needs SELECT
 *   service_role   the acceptance suites and the credential     — needs SELECT
 *   anon           nothing; both views key on auth.uid() and
 *                  return nothing without one                   — not granted
 */
grant select on my_module_progress to authenticated, service_role;
grant select on my_course_progress to authenticated, service_role;


-- ============================================================================
-- C. THE CREDENTIAL COUNTS GATING ITEMS, AND A RULING CAN OUTRANK IT
-- ============================================================================
/*
 * `item_count` is the number the credential CLAIMS. It counted every published
 * row, so Power of Positive Language claimed 51 items, was `active`, and held
 * zero films — 51 items none of which can complete a module. The track was
 * unearnable by construction and said nothing about it.
 *
 * THE SERVICE ARM MOVES TOO, and that is the half worth explaining. The service
 * credential is already earned on films alone — advisor_family_film_progress
 * filters `type = 'advisor_video'` — while item_count counted cues, so Fluids
 * claimed 309 items against 15 watchable films. Narrowing both arms makes the
 * number the credential claims agree with the function that decides whether it
 * is earned. Four flags change; all four are reported by the block below rather
 * than discovered later.
 *
 * WHAT IS STILL NOT RECONCILED, named rather than closed: the service arm now
 * counts published films in the family, while advisor_family_film_progress
 * additionally requires via = 'op_code', coachable, and a non-null
 * mux_playback_id. Those two numbers are closer than they were and are still
 * not the same measurement. Not widened here — it is a separate ruling, and
 * silently adopting the stricter predicate would deactivate tracks nobody
 * asked about.
 */
alter table certification
  add column if not exists activation_hold        boolean not null default false,
  add column if not exists activation_hold_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'certification_hold_has_reason'
       and conrelid = 'public.certification'::regclass
  ) then
    alter table certification
      add constraint certification_hold_has_reason
      check (not activation_hold or activation_hold_reason is not null);
  end if;
end $$;

comment on column certification.activation_hold is
  'When true, recompute_certification_content() leaves this certification '
  'inactive however many items it has. For a track whose content exists but '
  'whose release is a decision — Chemical Warranty, 0160. The reason is '
  'mandatory so the hold is legible to the next reader.';

create or replace function recompute_certification_content()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  _bar int;
begin
  select coalesce(certification_min_items, 0) into _bar from game_settings limit 1;
  _bar := coalesce(_bar, 0);

  /* CRAFT: gating items in the track's modules. A cue never gates (0143), so a
     cue cannot contribute to the number the credential claims either. */
  update certification c
     set item_count = (
           select count(*)::int
             from certification_course cc
             join module m  on m.course_id = cc.course_id
             join content ct on ct.module_id = m.id
            where cc.certification_id = c.id
              and ct.status = 'published'
              and ct.retired_at is null
              and ct.type = any (gating_content_types())
         ),
         updated_at = now()
   where c.kind = 'craft';

  /* SERVICE: one resolution, read rather than restated. count(DISTINCT) still,
     because a row reachable both ways must not be counted twice — 0116's note
     about a 3-item track clearing a 5-item bar. Now gating-typed, so it counts
     the same films advisor_family_film_progress measures. */
  update certification c
     set item_count = (
           select count(distinct sfc.content_id)::int
             from service_family_content sfc
             join content ct on ct.id = sfc.content_id
            where sfc.family = c.service_family
              and ct.status = 'published'
              and ct.retired_at is null
              and ct.type = any (gating_content_types())
         ),
         updated_at = now()
   where c.kind = 'service';

  /* A HOLD OUTRANKS THE ARITHMETIC. Written as `not activation_hold and ...`
     rather than as a separate update, so there is no window in which a held
     certification is briefly active. */
  update certification c
     set active = (not c.activation_hold
                   and c.item_count > 0
                   and c.item_count >= _bar),
         updated_at = now()
   where c.id is not null;
end $$;

revoke all on function recompute_certification_content() from public, anon, authenticated;


-- ============================================================================
-- D–G. THE DATA. One block, so a refusal anywhere rolls back everything.
-- ============================================================================

do $$
declare
  _row    record;
  _course uuid;
  _moc    uuid;
  _film   uuid;
  _m      uuid;
  _keep   uuid;
  _n      int;
  _sort   int;
  _bar    int;
  _mc_before            bigint;
  _mc_after             bigint;
  _cp_before            bigint;
  _cp_after             bigint;
  _cp_merged            int := 0;
  _cp_removed           int := 0;
  _deduped              int := 0;
  _wa_renamed           int := 0;
  _wa_created           int := 0;
  _wa_attached          int := 0;
  _moc_built            int := 0;
  _moc_removed          int := 0;
  _menus_closer         int := 0;
  _courses_hidden       int := 0;
  /* The twelve MOC lesson modules, by id — see F for why identity and not
     sort_order is the right key here. */
  _lessons              uuid[] := array[]::uuid[];
begin
  select count(*) into _mc_before from module_completion;
  select count(*) into _cp_before from content_progress;

  /* No course may already carry an override — if one does, somebody ruled
     before this migration existed and A's constraint would be describing a
     state it did not create. */
  select count(*) into _n from course where visible_override is not null;
  if _n <> 0 then
    raise exception '0160: % course(s) already carry visible_override — refusing', _n;
  end if;

  /* ======================================================================
     D. THE DUPLICATE CUE ROWS
     ======================================================================
     Keyed on (module_id, title, body) — see the header for why the body-only
     key is wrong by five cues. Keeper is the oldest, tie broken by lowest id,
     because every one of these rows shares a created_at to the microsecond.

     PROGRESS IS MERGED, NOT CASCADED. content_progress.content_id is
     ON DELETE CASCADE, so deleting a duplicate silently takes an advisor's
     completion with it. Each doomed row's progress moves to the keeper first,
     taking the furthest watch and the earliest completion; where the advisor
     already has progress on the keeper the redundant row is removed and
     counted, because that is a real change to a row count and must not be
     reported as "unchanged".
     ====================================================================== */
  for _row in
    with grouped as (
      select c.id,
             c.module_id,
             btrim(regexp_replace(coalesce(c.title, ''), '\s+', ' ', 'g')) as t,
             btrim(regexp_replace(coalesce(c.body,  ''), '\s+', ' ', 'g')) as b,
             c.created_at,
             row_number() over (
               partition by c.module_id,
                            btrim(regexp_replace(coalesce(c.title, ''), '\s+', ' ', 'g')),
                            btrim(regexp_replace(coalesce(c.body,  ''), '\s+', ' ', 'g'))
               order by c.created_at, c.id
             ) as rn,
             first_value(c.id) over (
               partition by c.module_id,
                            btrim(regexp_replace(coalesce(c.title, ''), '\s+', ' ', 'g')),
                            btrim(regexp_replace(coalesce(c.body,  ''), '\s+', ' ', 'g'))
               order by c.created_at, c.id
             ) as keeper
        from content c
       where c.module_id is not null
         and c.status = 'published'
         and c.retired_at is null
         and not (c.type = any (gating_content_types()))
    )
    select id, keeper from grouped where rn > 1
  loop
    _keep := _row.keeper;

    /* Move what can move. */
    update content_progress cp
       set content_id = _keep
     where cp.content_id = _row.id
       and not exists (
         select 1 from content_progress k
          where k.user_id = cp.user_id and k.content_id = _keep
       );
    /* Where the keeper already has the advisor's row, fold the better of the
       two into it and drop the redundant one. */
    update content_progress k
       set watched_pct  = greatest(k.watched_pct, d.watched_pct),
           completed_at = least(coalesce(k.completed_at, d.completed_at),
                                coalesce(d.completed_at, k.completed_at))
      from content_progress d
     where d.content_id = _row.id
       and k.content_id = _keep
       and k.user_id = d.user_id;

    select count(*) into _n from content_progress where content_id = _row.id;
    _cp_removed := _cp_removed + _n;
    delete from content_progress where content_id = _row.id;

    delete from content where id = _row.id;
    _deduped := _deduped + 1;
  end loop;

  raise notice '0160/D: % duplicate cue row(s) deleted; % progress row(s) folded into a keeper',
    _deduped, _cp_removed;

  /* Nothing may remain duplicated under the key we deduped on. */
  select count(*) into _n from (
    select 1
      from content c
     where c.module_id is not null
       and c.status = 'published'
       and c.retired_at is null
       and not (c.type = any (gating_content_types()))
     group by c.module_id,
              btrim(regexp_replace(coalesce(c.title, ''), '\s+', ' ', 'g')),
              btrim(regexp_replace(coalesce(c.body,  ''), '\s+', ' ', 'g'))
    having count(*) > 1
  ) x;
  if _n <> 0 then
    raise exception '0160/D: % duplicate group(s) survive the dedupe — refusing', _n;
  end if;

  /* ======================================================================
     E. WALK AROUND BECOMES THE ROUTINE IN ORDER
     ======================================================================
     Modules 1-3 stay the Four Minute parts. 4-12 are 30 Second Parts 1-9 in
     order. 13 is The Handback, filmless until Mitch shoots it.

     THE THREE MODULES THAT ALREADY HOLD PARTS 2, 5 AND 6 ARE RENAMED AND
     RESORTED, NEVER RECREATED — they carry 12 quiz questions and 2 module
     completions between them, and a drop-and-insert would take both.
     ====================================================================== */
  select co.id into _course
    from certification c
    join certification_course cc on cc.certification_id = c.id
    join course co on co.id = cc.course_id
   where c.name = 'Walk Around' and c.is_core and co.name = 'The Walk-Around';

  if _course is null then
    raise notice '0160/E: no Walk-Around course — skipping';
  else
    /* E1. Rename and resort the three that exist, keyed on the FILM they hold
       rather than on their current name — the name is what we are changing, so
       keying on it would break the moment this migration is half-applied. */
    for _row in
      select * from (values
        ('30 Second Walk-Around, Part 2, Four Goals, Two Words',                        '5. Four Goals, Two Words',                        5),
        ('30 Second Walk-Around, Part 5, Step 4, Wheels to the Left',                   '8. Step 4 — Wheels to the Left',                  8),
        ('30 Second Walk-Around, Part 6, Step 5, Washer Fluid',                         '9. Step 5 — Washer Fluid',                        9)
      ) as t(film_title, module_name, sort)
    loop
      select m.id into _m
        from module m
        join content ct on ct.module_id = m.id
       where m.course_id = _course
         and ct.title = _row.film_title
         and ct.type = 'advisor_video'
         and ct.status = 'published';
      if _m is null then
        raise notice '0160/E: no module holds "%" — skipping', _row.film_title;
        continue;
      end if;
      update module set name = _row.module_name, sort_order = _row.sort, name_status = 'ok'
       where id = _m;
      _wa_renamed := _wa_renamed + 1;
    end loop;

    /* E2. The Handback moves to 13, whatever it is currently called. */
    update module set name = '13. The Handback', sort_order = 13
     where course_id = _course
       and not exists (select 1 from content ct
                        where ct.module_id = module.id
                          and ct.type = any (gating_content_types())
                          and ct.status = 'published');

    /* E3. The six missing parts: one module each, the film attached. */
    for _row in
      select * from (values
        ('30 Second Walk-Around, Part 1, Before You Go Outside',                        '4. Before You Go Outside',                        4),
        ('30 Second Walk-Around, Part 3, Steps 1 and 2, Are You Here to See Anyone',    '6. Steps 1 and 2 — Are You Here to See Anyone?',  6),
        ('30 Second Walk-Around, Part 4, Step 3, Start It',                             '7. Step 3 — Start It',                            7),
        ('30 Second Walk-Around, Part 7, The Four Step Close',                          '10. The Four Step Close',                         10),
        ('30 Second Walk-Around, Part 8, Step 6 and 7, Miles, Shut It Off and Tires',   '11. Steps 6 and 7 — Miles, Shut It Off and Tires', 11),
        ('30 Second Walk-Around, Part 9, 42 seconds',                                   '12. 42 Seconds',                                  12)
      ) as t(film_title, module_name, sort)
    loop
      /* The film must be present AND servable — a module pointing at a film
         pickItem() will not serve is a lesson that renders an empty player. */
      select count(*) into _n from content
       where title = _row.film_title
         and type = 'advisor_video'
         and status = 'published'
         and retired_at is null
         and mux_playback_id is not null;
      if _n = 0 then
        raise notice '0160/E: "%" is not present and servable — skipping', _row.film_title;
        continue;
      end if;
      if _n <> 1 then
        raise exception '0160/E: % servable films titled "%" — refusing', _n, _row.film_title;
      end if;

      select id, module_id into _film, _m from content
       where title = _row.film_title
         and type = 'advisor_video'
         and status = 'published'
         and retired_at is null
         and mux_playback_id is not null;

      if _m is not null then
        select count(*) into _n from module where id = _m and course_id = _course;
        if _n = 1 then
          raise notice '0160/E: "%" is already attached here — nothing to do', _row.film_title;
          _wa_attached := _wa_attached + 1;
          continue;
        end if;
        raise exception '0160/E: "%" is attached to a module outside The Walk-Around — refusing',
          _row.film_title;
      end if;

      select id into _m from module
       where course_id = _course and name = _row.module_name;
      if _m is null then
        insert into module (course_id, name, sort_order, name_status)
        values (_course, _row.module_name, _row.sort, 'ok')
        returning id into _m;
        _wa_created := _wa_created + 1;
      end if;

      update content set module_id = _m, module_order = 1,
                         placement = 'daily_craft', updated_at = now()
       where id = _film;
      _wa_attached := _wa_attached + 1;
    end loop;

    raise notice '0160/E: % renamed, % created, % attached', _wa_renamed, _wa_created, _wa_attached;
  end if;

  /* ======================================================================
     F. THE TWELVE COVERAGE IS KEY FILMS BECOME THE MOC WARRANTY PROGRAM
     ======================================================================
     The slate says Coverage is Key; the curriculum is Chemical Warranty
     (AGENTS.md's slate table, settled by the identification pass and not by
     the title). Twelve lesson modules in order: opener, ten parts, closer.

     Chemical Warranty STAYS INACTIVE — twelve films would otherwise clear the
     five-item bar the moment recompute runs, which is why C added the hold.
     ====================================================================== */
  select id into _moc from course where name = 'The MOC Warranty Program';

  if _moc is null then
    raise notice '0160/F: no MOC Warranty Program course — skipping';
  else
    _sort := 0;
    for _row in
      select * from (values
        ('Coverage is Key — Opener',  'Coverage is Key — Opener',  1),
        ('Coverage is Key, Part 1',   'Part 1',                    2),
        ('Coverage is Key, Part 2',   'Part 2',                    3),
        ('Coverage is Key, Part 3',   'Part 3',                    4),
        ('Coverage is Key, Part 4',   'Part 4',                    5),
        ('Coverage is Key, Part 5',   'Part 5',                    6),
        ('Coverage is Key, Part 6',   'Part 6',                    7),
        ('Coverage is Key, Part 7',   'Part 7',                    8),
        ('Coverage is Key, Part 8',   'Part 8',                    9),
        ('Coverage is Key, Part 9',   'Part 9',                    10),
        ('Coverage is Key, Part 10',  'Part 10',                   11),
        ('Coverage is Key — Closer',  'Coverage is Key — Closer',  12)
      ) as t(film_title, module_name, sort)
    loop
      select count(*) into _n from content
       where title = _row.film_title
         and type = 'advisor_video'
         and status = 'published'
         and retired_at is null
         and mux_playback_id is not null;
      if _n = 0 then
        raise notice '0160/F: "%" is not present and servable — skipping', _row.film_title;
        continue;
      end if;
      if _n <> 1 then
        raise exception '0160/F: % servable films titled "%" — refusing', _n, _row.film_title;
      end if;

      select id, module_id into _film, _m from content
       where title = _row.film_title
         and type = 'advisor_video'
         and status = 'published'
         and retired_at is null
         and mux_playback_id is not null;

      if _m is not null then
        select count(*) into _n from module where id = _m and course_id = _moc;
        if _n = 1 then
          raise notice '0160/F: "%" is already attached — nothing to do', _row.film_title;
          _moc_built := _moc_built + 1;
          continue;
        end if;
        raise exception '0160/F: "%" is attached outside the MOC course — refusing', _row.film_title;
      end if;

      select id into _m from module where course_id = _moc and name = _row.module_name;
      if _m is null then
        insert into module (course_id, name, sort_order, name_status)
        values (_moc, _row.module_name, _row.sort, 'ok')
        returning id into _m;
      else
        update module set sort_order = _row.sort, name_status = 'ok' where id = _m;
      end if;

      update content set module_id = _m, module_order = 1,
                         placement = 'daily_craft', updated_at = now()
       where id = _film;
      _moc_built := _moc_built + 1;
      /* Remember WHICH modules are the lessons. Keyed on identity, not on
         sort_order: the placeholders already occupy 1-6, so "sort_order > 12"
         described none of them and left them interleaved with the lessons it
         was meant to push below. Found by applying this migration to a restore
         of production, where it reported "0 placeholders removed" over six
         that were still there. */
      _lessons := array_append(_lessons, _m);
    end loop;

    /* The deck-import placeholders — every module on this course that is not
       one of the twelve lessons. REMOVED ONLY IF THEY HOLD NOTHING: no content
       of any status, no completion, no quiz. The two carrying a cue each are
       kept, because a module holding curriculum is not a placeholder however it
       is named. */
    for _row in
      select m.id, m.name from module m
       where m.course_id = _moc
         and not (m.id = any (_lessons))
         and not exists (select 1 from content ct where ct.module_id = m.id)
         and not exists (select 1 from module_completion mc where mc.module_id = m.id)
         and not exists (select 1 from quiz_question q where q.module_id = m.id)
    loop
      delete from module where id = _row.id;
      _moc_removed := _moc_removed + 1;
      raise notice '0160/F: removed empty placeholder module "%"', _row.name;
    end loop;

    /* Whatever survives that is not a lesson sits after the twelve, keeping its
       existing relative order. */
    _sort := coalesce(array_length(_lessons, 1), 0);
    for _row in
      select id, name from module
       where course_id = _moc and not (id = any (_lessons))
       order by sort_order, name
    loop
      _sort := _sort + 1;
      update module set sort_order = _sort where id = _row.id;
      raise notice '0160/F: kept "%" (holds content) at sort %', _row.name, _sort;
    end loop;

    raise notice '0160/F: % lesson module(s) built, % empty placeholder(s) removed',
      _moc_built, _moc_removed;
  end if;

  /* Chemical Warranty's hold, set whether or not the films landed — the ruling
     is about the track, not about this run's luck with titles. */
  update certification
     set activation_hold = true,
         activation_hold_reason =
           'Ryan''s ruling, 5 October 2026: the twelve Coverage is Key films attach '
           'to The MOC Warranty Program in 0160, which would otherwise clear the '
           'five-item bar and activate the track. Release is a separate decision.',
         updated_at = now()
   where name = 'Chemical Warranty';

  /* ======================================================================
     G. MENUS GAINS ITS CLOSER AS MODULE 10
     ======================================================================
     Carried in from the openers report (#50). 0144's header called the two
     Menu Wrap-Ups the closer worked example; the transcripts say they are
     lessons that end on Mahalo, and the new film is the one with the closer's
     shape. The Wrap-Ups stay as modules 8 and 9.

     0144's header is NOT edited — a migration's text records what it did and
     what its author believed at the time. The correction lives here.
     ====================================================================== */
  select co.id into _course
    from certification c
    join certification_course cc on cc.certification_id = c.id
    join course co on co.id = cc.course_id
   where c.name = 'Menus' and c.is_core and co.name = 'Menus';

  if _course is null then
    raise notice '0160/G: no Menus course — skipping';
  else
    select count(*) into _n from content
     where title = 'Menus — Closer'
       and type = 'advisor_video'
       and status = 'published'
       and retired_at is null
       and mux_playback_id is not null;
    if _n = 0 then
      raise notice '0160/G: "Menus — Closer" is not present and servable — skipping';
    elsif _n <> 1 then
      raise exception '0160/G: % servable films titled "Menus — Closer" — refusing', _n;
    else
      select id, module_id into _film, _m from content
       where title = 'Menus — Closer'
         and type = 'advisor_video'
         and status = 'published'
         and retired_at is null
         and mux_playback_id is not null;

      if _m is not null then
        select count(*) into _n from module where id = _m and course_id = _course;
        if _n = 1 then
          raise notice '0160/G: the Menus closer is already attached — nothing to do';
          _menus_closer := 1;
        else
          raise exception '0160/G: "Menus — Closer" is attached outside Menus — refusing';
        end if;
      else
        select id into _m from module where course_id = _course and name = 'Menus — Closer';
        if _m is null then
          insert into module (course_id, name, sort_order, name_status)
          values (_course, 'Menus — Closer', 10, 'ok')
          returning id into _m;
        else
          update module set sort_order = 10, name_status = 'ok' where id = _m;
        end if;
        update content set module_id = _m, module_order = 1,
                           placement = 'daily_craft', updated_at = now()
         where id = _film;
        _menus_closer := 1;
      end if;
    end if;
  end if;

  raise notice '0160/G: Menus closer attached: %', _menus_closer;

  /* ======================================================================
     PROVE IT
     ====================================================================== */
  /* What rule 1 actually does to the shelf, counted rather than claimed. */
  select count(*) into _courses_hidden
    from course c
   where not exists (
     select 1 from module m
       join content ct on ct.module_id = m.id
      where m.course_id = c.id
        and ct.status = 'published'
        and ct.type = any (gating_content_types())
   );
  select count(*) into _n from course;
  raise notice '0160/A: % of % course(s) hold no lesson and are no longer offered to advisors',
    _courses_hidden, _n;

  select count(*) into _mc_after from module_completion;
  if _mc_after <> _mc_before then
    raise exception '0160: module_completion moved from % to % — refusing',
      _mc_before, _mc_after;
  end if;
  raise notice '0160: module_completion unchanged at %', _mc_after;

  select count(*) into _cp_after from content_progress;
  if _cp_after <> _cp_before - _cp_removed then
    raise exception
      '0160: content_progress is % but % - % folded = % — the dedupe lost a row it did not account for',
      _cp_after, _cp_before, _cp_removed, _cp_before - _cp_removed;
  end if;
  raise notice '0160: content_progress % -> % (% folded into a keeper, none lost)',
    _cp_before, _cp_after, _cp_removed;

  /* Every module in a listed course must be reachable: no module may hold a
     gating item and sit outside its course's ordering. */
  select count(*) into _n
    from module m
   where exists (select 1 from content ct where ct.module_id = m.id
                  and ct.status = 'published' and ct.type = any (gating_content_types()))
     and m.sort_order <= 0;
  if _n <> 0 then
    raise exception '0160: % lesson module(s) have a non-positive sort_order — refusing', _n;
  end if;
end $$;


-- ============================================================================
-- RECOMPUTE, AND REPORT EVERY FLAG THAT MOVED
-- ============================================================================
/*
 * The before/after is captured around the call rather than predicted, because
 * a migration that announces what it intended is this codebase's own recorded
 * failure — ingest-videos.ts printed "Mux is transcoding" over 102 refusals
 * and exited 0.
 */
do $$
declare
  _row record;
  _n   int := 0;
begin
  create temporary table _cert_before on commit drop as
    select id, name, kind, active, item_count from certification;

  perform recompute_certification_content();

  for _row in
    select b.name, b.kind, b.active as was_active, c.active as now_active,
           b.item_count as was_count, c.item_count as now_count,
           c.activation_hold
      from _cert_before b
      join certification c on c.id = b.id
     where b.active is distinct from c.active
        or b.item_count is distinct from c.item_count
     order by b.kind, b.name
  loop
    if _row.was_active is distinct from _row.now_active then
      _n := _n + 1;
      raise notice '0160: % (%) ACTIVE % -> %   item_count % -> % %',
        _row.name, _row.kind, _row.was_active, _row.now_active,
        _row.was_count, _row.now_count,
        case when _row.activation_hold then '[HELD]' else '' end;
    else
      raise notice '0160: % (%) item_count % -> % (active unchanged at %)',
        _row.name, _row.kind, _row.was_count, _row.now_count, _row.now_active;
    end if;
  end loop;
  raise notice '0160: % certification(s) changed their active flag', _n;

  /* THE ACCEPTANCE HALF, which is the one that gets skipped. Narrowing
     item_count must not have deactivated a core track that holds films —
     if the type filter were wrong or inverted, every assertion above would
     still pass and nine tracks would quietly go dark. */
  select count(*) into _n
    from certification c
   where c.is_core
     and not c.active
     and exists (
       select 1 from certification_course cc
         join module m on m.course_id = cc.course_id
         join content ct on ct.module_id = m.id
        where cc.certification_id = c.id
          and ct.status = 'published'
          and ct.retired_at is null
          and ct.type = any (gating_content_types())
     );
  if _n <> 0 then
    raise exception
      '0160: % core track(s) are inactive while holding films — the narrowing is wrong', _n;
  end if;

  /* Walk Around specifically: Ryan asked for its item_count to be reported and
     for the track to stay active.

     CONDITIONAL ON THE TRACK ACTUALLY HOLDING FILMS, because a fresh local has
     none and "Walk Around is inactive" is the CORRECT answer there — a track
     with nothing in it must not be active, which is the whole point of this
     migration. Asserting unconditionally made the local replay fail on the one
     behaviour 0160 exists to produce. The assertion still bites on production,
     where the films are present, which is where the regression would matter. */
  for _row in
    select name, active, item_count from certification where name = 'Walk Around'
  loop
    raise notice '0160: Walk Around active=% item_count=%', _row.active, _row.item_count;
    if _row.item_count = 0 then
      raise notice '0160: Walk Around holds no films on this database — active-flag assertion skipped';
    elsif not _row.active then
      raise exception
        '0160: Walk Around holds % film(s) and went inactive — refusing', _row.item_count;
    end if;
  end loop;

  /* And the rule that started all of this: no course may be `visible` while
     holding no lesson. Asserted against the view's own expression. */
  select count(*) into _n from my_course_progress where visible and total_modules = 0;
  if _n <> 0 then
    raise exception '0160: % course(s) are visible with no lesson — refusing', _n;
  end if;
end $$;
