/* ===========================================================================
   0173 — POWER OF POSITIVE LANGUAGE GETS ITS THIRTEEN LESSONS
   ===========================================================================

   Mitch delivered fifteen films for this track on 26 October: an opener, a
   closer, and THIRTEEN numbered lessons. The course has seven modules, all
   cue-only — Knowledge Notes 1 to 6 and Closing Strategies — and the obvious
   move was to fit thirteen films into those seven.

   RYAN'S RULING WAS THE OTHER WAY, and the evidence was on his side. Each film
   becomes its own lesson, in Mitch's part order, named from his slate. The
   seven cue modules stay exactly as they are and become reinforcement after
   the lessons.

   WHY FITTING THEM WOULD HAVE BEEN WRONG. The films and the cues do not line
   up. Six films restate one cue each and could be placed; four restate a cue
   that appears in TWO modules (Total Investment is in both Knowledge Notes 1
   and 3; Say the Brand is in Knowledge Notes 5 and Closing Strategies); and
   three teach something no cue covers at all — Condition Over Opinion
   ("say what it's doing, not what it is"), Hospitality Words, and Never End
   With a Question. Mapping those three would have meant inventing a home, and
   mapping the four would have meant picking one of two by coin-toss. This is
   the Four Step Close lesson in a different track: its films and quiz agree to
   part 9 and diverge from part 10, and joining on the number would have looked
   right and been wrong.

   ---------------------------------------------------------------------------
   ORDER
   ---------------------------------------------------------------------------
   Lessons 1-13, then the seven cue modules at 14-20, then the closer at 21.
   The cue modules' CONTENT is untouched; only their sort_order moves, because
   reinforcement that arrives before the teaching is not reinforcement.

   A closer is the last module of its track — one film, no quiz, sort_order
   after every lesson and cue module. Same shape as `Menu Wrap-Up, Part 2` and
   `Coverage is Key — Closer`.

   The OPENER gets no module. Its destination is
   `certification.entry_film_content_id`, set after Ryan publishes the film in
   admin, which the loop already serves (lib/loop.ts RULING 2).

   ---------------------------------------------------------------------------
   THIS MIGRATION DOES NOT ATTACH THE FILMS
   ---------------------------------------------------------------------------
   The fifteen films are uploading as DRAFTS while this is written, and a
   webhook creates each content row when its asset is ready. A migration whose
   correctness depends on how far a transcode has got is a migration that
   passes or fails by timing. So this creates the modules — which is
   deterministic — and `npm run ppl:attach` sets `content.module_id` afterwards
   by canonical filename, asserting it found all fifteen.

   `module.sort_order` has no uniqueness constraint (0142 recorded that), so
   the reorder below cannot collide mid-statement. It is still done cue-first
   so that no intermediate state has two modules claiming one number.
   =========================================================================== */

do $$
declare
  _course   uuid;
  _cues     int;
  _films    int;
  _lessons  int;
  _after    int;
begin
  select id into _course from course where name = 'Language That Sells';
  if _course is null then
    raise notice '0173: no Language That Sells course on this database — nothing to do';
    return;
  end if;

  /* ---- ALREADY APPLIED? ------------------------------------------------- */
  select count(*) into _lessons
    from module where course_id = _course and name = 'Dirty Is a Dirty Word';
  if _lessons > 0 then
    raise notice '0173: lessons already present — nothing to do';
    return;
  end if;

  /* ---- THE PRE-STATE THIS WAS WRITTEN AGAINST --------------------------- */
  select count(*) into _cues from module where course_id = _course;
  if _cues <> 7 then
    raise exception '0173 expected 7 cue modules on Language That Sells, found % — the course moved underneath this migration', _cues;
  end if;

  /* Cue-only was the whole premise: if a film is already attached here,
     somebody has routed one and this plan is out of date. */
  select count(*) into _films
    from content c join module m on m.id = c.module_id
   where m.course_id = _course and c.mux_asset_id is not null and c.retired_at is null;
  if _films <> 0 then
    raise exception '0173 expected the seven modules to be cue-only, found % film(s) attached', _films;
  end if;

  /* ---- the cue modules move to 14-20, keeping their relative order ------ */
  update module m
     set sort_order = m.sort_order + 13
   where m.course_id = _course;

  /* ---- the thirteen lessons, in Mitch's part order, named from his slate - */
  insert into module (course_id, name, sort_order, name_status) values
    (_course, 'Dirty Is a Dirty Word',          1, 'ok'),
    (_course, 'Reward Action',                  2, 'ok'),
    (_course, 'Share, Don''t Tell',             3, 'ok'),
    (_course, 'Condition Over Opinion',         4, 'ok'),
    (_course, 'Graded, Not Found',              5, 'ok'),
    (_course, 'Item of Concern',                6, 'ok'),
    (_course, 'Total Investment',               7, 'ok'),
    (_course, 'Certified Technician by Name',   8, 'ok'),
    (_course, 'Say the Brand',                  9, 'ok'),
    (_course, 'Remove the Doubt',              10, 'ok'),
    (_course, 'Hospitality Words',             11, 'ok'),
    (_course, 'Words That Calm',               12, 'ok'),
    (_course, 'Never End With a Question',     13, 'ok');

  /* ---- and the closer, last ------------------------------------------- */
  insert into module (course_id, name, sort_order, name_status) values
    (_course, 'Power of Positive Language — Closer', 21, 'ok');

  /* ---- REFUSE IF THE SHAPE IS NOT WHAT WAS INTENDED -------------------- */
  select count(*) into _after from module where course_id = _course;
  if _after <> 21 then
    raise exception '0173 expected 21 modules after insert, found %', _after;
  end if;

  if exists (
    select 1 from (
      select sort_order, count(*) n from module where course_id = _course group by sort_order
    ) d where d.n > 1
  ) then
    raise exception '0173 left two modules sharing a sort_order';
  end if;

  if (select count(*) from module
       where course_id = _course and sort_order between 1 and 21) <> 21 then
    raise exception '0173 left a gap: sort_order is not 1..21 contiguous';
  end if;

  raise notice '0173: 13 lessons at 1-13, 7 cue modules moved to 14-20, closer at 21';
end
$$;

comment on table module is
  'A module is one step of a course. Power of Positive Language carries its '
  'thirteen lesson films as thirteen modules (0173) rather than fitting them '
  'into the seven cue modules, because the films and the cues do not line up: '
  'four restate a cue that appears in two modules and three teach something no '
  'cue covers.';
