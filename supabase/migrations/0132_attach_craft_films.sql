/* ===========================================================================
   0132 — THIRTEEN CRAFT FILMS BECOME REACHABLE
   ===========================================================================

   All thirteen are published, live, transcoded, sitting in the library with
   `module_id` NULL — so `pickItem` cannot serve them and no advisor can reach
   them. Every one was shot, uploaded and paid for. Attaching them is the whole
   job.

   ---------------------------------------------------------------------------
   ATTACH ONLY. NOTHING IS MOVED, DISSOLVED, REPOINTED OR DELETED.
   ---------------------------------------------------------------------------

   The original plan collapsed Walk Around 7 -> 3 and Overcoming Objections
   5 -> 2 in the same change. It is not here, deliberately, and the reason is
   worth recording because it will look like an omission later:

   1  `module_completion_module_id_fkey` is ON DELETE CASCADE. Dissolving a
      module DELETES its completion rows, and five exist — four for Ryan, one for
      Mitch dated 2026-09-23. A cascade delete is not a retire.

   2  Archiving the surplus modules to a detached course would take their CUES
      with them, so an advisor would quietly stop seeing 25 of Walk Around's 57
      cues. Repointing the cues into the three survivors instead would give each
      survivor ~19 cues plus a film — and if `contentComplete` counts cues, an
      advisor would have to tick nineteen cues to finish a module, which is the
      model the video-is-the-curriculum ruling exists to end.

   Which of those it is depends on two things nobody has measured: whether
   `contentComplete` counts cues or only videos, and whether the loop can reach a
   cue by any path other than `module_id`. The collapse waits for those answers.
   Cosmetically Walk Around still shows seven modules for three films; that is
   worse-looking and better-behaved than today, and the track could not be
   completed this morning either.

   ---------------------------------------------------------------------------
   MENUS IS DONE IN FULL, BECAUSE NOTHING IS AT RISK THERE
   ---------------------------------------------------------------------------

   The shell has no courses, no modules, no completions and no rows in any of the
   seven tables that reference `certification` — proven before this was written.
   So it is renamed, made core, given a course and seven modules, and all eight
   films attached. Nothing is destroyed because there is nothing there.

   The shell is RENAMED rather than retired-and-replaced: it was created on
   2026-09-14, so it is recent and deliberate, and the one thing it owns is its
   name. A rename is one row and leaves no tombstone for a future reader to
   interpret.

   ---------------------------------------------------------------------------
   module_order STARTS AT 1, AND THE ENTRY FILM IS NOT AN ITEM
   ---------------------------------------------------------------------------

   The retired nine-second placeholder sits at `module_order` 0 in Walk Around's
   first module — the only module-attached video in the catalog before this. It is
   DETACHED here rather than dropped: draft and retired since 31 August, it
   reaches nobody, but left attached it reads as the entry film to whoever looks
   next, and it would be the one video in a module about to receive a real one.

   The Menus entry film goes on `certification.entry_film_content_id`, not into a
   module. TWO_LADDERS: a track film is what happens on the morning an advisor
   ENTERS a track, not a daily item.
   =========================================================================== */

do $$
declare
  _menus_cert uuid;
  _menus_course uuid;
  _attached int := 0;
  _n int;
  _m uuid;
  _f uuid;
  r record;
  _films int;
begin
  /*
   * ---- IS THIS DATABASE THE ONE THIS MIGRATION IS ABOUT? -----------------
   *
   * A fresh local database seeds none of these films, and 0129's first version
   * refused on exactly that — it could not tell "nothing to do" from "the wrong
   * number of things to do". Zero is an ambiguous answer: either the work is
   * done or the query is wrong. So count first and return quietly at zero,
   * which keeps `supabase db reset --local` replaying the whole chain.
   */
  select count(*) into _films from content
   where type='advisor_video' and status='published' and retired_at is null
     and title in (
       'The Four Minute Walk-Around, Part 1','The Four Minute Walk-Around, Part 2',
       'The Four Minute Walk-Around, Part 3','Overcoming Objections, Part 1',
       'Overcoming Objections, Part 2 — How to Take a No',
       'Dealer Upsell Menus and Interval Charts — Opener',
       'The OE Approach — The Maintenance Menu','The OE Approach — Severe Conditions',
       'The OE Approach — Lifetime Fluid','The OE Approach — Use the Chart',
       'The OE Stagger — Why We Spread Them Out','The OE Stagger — The Order and Why',
       'The OE Stagger — Running It');

  if _films = 0 then
    raise notice '0132: none of the thirteen craft films are present — nothing to attach';
    return;
  end if;
  if _films <> 13 then
    raise exception '0132 expected 13 craft films present, found % — refusing rather than attaching a subset', _films;
  end if;

  /* ================= 1. DETACH THE PLACEHOLDER ========================== */
  update content
     set module_id = null, module_order = null, updated_at = now()
   where title = 'Watch First — The Walk-Around'
     and module_id is not null;
  get diagnostics _n = row_count;
  raise notice '0132: detached % placeholder row(s)', _n;

  /* ================= 2. MENUS: RENAME, CORE, COURSE, MODULES ============= */
  select id into _menus_cert from certification where name = 'Menu Presentation';
  if _menus_cert is null then
    /* Already renamed by an earlier run — find it by slug instead. */
    select id into _menus_cert from certification where slug = 'craft-menus';
  end if;
  if _menus_cert is null then
    raise exception '0132: cannot find the Menus certification to rename';
  end if;

  /*
   * is_master_track MUST BE CLEARED, and the constraint says so.
   *
   * `certification_rung_shape` is CHECK (NOT (is_core AND is_master_track)), and
   * this shell is currently a MASTER track — sort 9, is_master_track true. So it
   * was never a plain non-core certification: it sat on the Master ladder. Ryan's
   * ruling is that Menus is core, not Master, which means this is a move between
   * ladders rather than a promotion, and the check refuses to let it be both.
   *
   * Caught by seeding a local fixture: the rename failed on the constraint, which
   * is the constraint doing exactly its job.
   *
   * The count changes with it: the credential becomes nine core tracks and three
   * Master ones rather than eight and four.
   */
  update certification
     set name = 'Menus',
         slug = 'craft-menus',
         is_core = true,
         is_master_track = false,
         updated_at = now()
   where id = _menus_cert;

  /* One course to hang the modules from. Menus had none. */
  select co.id into _menus_course
    from course co join certification_course cc on cc.course_id = co.id
   where cc.certification_id = _menus_cert limit 1;

  if _menus_course is null then
    insert into course (name, slug, track, description, sort_order)
    values ('Menus', 'menus', 'Craft',
            'Dealer upsell menus and interval charts. Seven lessons, every film shot.', 900)
    returning id into _menus_course;
    insert into certification_course (certification_id, course_id, sort)
    values (_menus_cert, _menus_course, 1);
    raise notice '0132: created the Menus course';
  end if;

  /*
   * Seven modules, named for the lesson each film teaches, in the order Mitch
   * teaches them: the approach first, then the stagger.
   */
  for r in
    select * from (values
      (1, 'The Maintenance Menu — the OE Approach',   'The OE Approach — The Maintenance Menu'),
      (2, 'The OE Approach — Severe Conditions',      'The OE Approach — Severe Conditions'),
      (3, 'The OE Approach — Lifetime Fluid',         'The OE Approach — Lifetime Fluid'),
      (4, 'The OE Approach — Use the Chart',          'The OE Approach — Use the Chart'),
      (5, 'The Stagger — Why We Spread Them Out',     'The OE Stagger — Why We Spread Them Out'),
      (6, 'The OE Stagger — The Order and Why',       'The OE Stagger — The Order and Why'),
      (7, 'The OE Stagger — Running It',              'The OE Stagger — Running It')
    ) as t(ord, module_name, film_title)
  loop
    select id into _m from module
     where course_id = _menus_course and sort_order = r.ord;
    if _m is null then
      insert into module (course_id, name, sort_order)
      values (_menus_course, r.module_name, r.ord)
      returning id into _m;
    end if;

    select id into _f from content
     where type = 'advisor_video' and status = 'published' and retired_at is null
       and title = r.film_title;
    if _f is null then
      raise exception '0132: no published film titled %', r.film_title;
    end if;

    update content set module_id = _m, module_order = 1,
                       placement = 'daily_craft', updated_at = now()
     where id = _f and module_id is distinct from _m;
    _attached := _attached + 1;
  end loop;

  /* The entry film is a gate, not an item. */
  update certification c
     set entry_film_content_id = f.id, updated_at = now()
    from content f
   where c.id = _menus_cert
     and f.title = 'Dealer Upsell Menus and Interval Charts — Opener'
     and f.status = 'published' and f.retired_at is null;

  /* ================= 3. WALK AROUND: three films, modules 1-3 =========== */
  for r in
    select * from (values
      (1, 'The Four Minute Walk-Around, Part 1'),
      (2, 'The Four Minute Walk-Around, Part 2'),
      (3, 'The Four Minute Walk-Around, Part 3')
    ) as t(ord, film_title)
  loop
    select m.id into _m from module m join course co on co.id = m.course_id
     where co.name = 'The Walk-Around' and m.sort_order = r.ord;
    select id into _f from content
     where type='advisor_video' and status='published' and retired_at is null
       and title = r.film_title;
    if _m is null or _f is null then
      raise exception '0132: Walk Around module % or film % missing', r.ord, r.film_title;
    end if;
    /*
     * module_order 1 puts the film FIRST in its module, ahead of the cues. The
     * lesson is the teaching; the cues are reinforcement, so the film is what
     * slot 3 should reach first.
     */
    update content set module_id = _m, module_order = 1,
                       placement = 'daily_craft', updated_at = now()
     where id = _f;
    _attached := _attached + 1;
  end loop;

  /* ================= 4. OVERCOMING OBJECTIONS: two films ================ */
  for r in
    select * from (values
      (1, 'Overcoming Objections, Part 1'),
      (2, 'Overcoming Objections, Part 2 — How to Take a No')
    ) as t(ord, film_title)
  loop
    select m.id into _m from module m join course co on co.id = m.course_id
     where co.name = 'Objection Handling' and m.sort_order = r.ord;
    select id into _f from content
     where type='advisor_video' and status='published' and retired_at is null
       and title = r.film_title;
    if _m is null or _f is null then
      raise exception '0132: Objection Handling module % or film % missing', r.ord, r.film_title;
    end if;
    update content set module_id = _m, module_order = 1,
                       placement = 'daily_craft', updated_at = now()
     where id = _f;
    _attached := _attached + 1;
  end loop;

  /* ================= 5. ASSERT ========================================== */
  raise notice '0132: attached % film(s)', _attached;
  if _attached <> 12 then
    raise exception '0132 expected to attach 12 module films (7 Menus + 3 Walk Around + 2 Objections), got %', _attached;
  end if;

  select count(*) into _n from content
   where type='advisor_video' and status='published' and retired_at is null
     and module_id is not null and placement = 'daily_craft';
  if _n <> 12 then
    raise exception '0132 expected 12 live daily_craft module films, found %', _n;
  end if;

  select count(*) into _n from certification
   where id = _menus_cert and is_core and not is_master_track
     and entry_film_content_id is not null;
  if _n <> 1 then
    raise exception '0132: Menus is not core, is still a Master track, or has no entry film';
  end if;
end
$$;

/*
 * item_count and `active` are derived from published module items — recompute them
 * so the certification page does not report a stale length the moment twelve
 * films arrive. Same statement 0116 and 0125 use; not restated, called.
 */
select recompute_certification_content();
