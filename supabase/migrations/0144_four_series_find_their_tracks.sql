/* ===========================================================================
   0144 — FOUR SERIES FIND THEIR TRACKS, AND MENUS GETS ITS CLOSERS
   ===========================================================================

   Ryan's rulings, 29 September, on the evidence in
   reports/unhomed-series-for-mitch.md and the AGENTS.md slate table:

     Get the Hell Out of Here, Parts 1-9   -> Setting up the MPI     (9 modules)
     Four Step Close, Parts 1-10           -> Four Step Close       (10 modules)
     Success Cycle, Parts 1-12             -> Success Cycle         (12 modules)
     Selling Skills, 10 films              -> Overcoming Objections (modules 3-12)
     Menu Wrap-Up, Parts 1 and 2           -> Menus                 (modules 8-9)

   43 films, 43 new modules, every film published and attached to nothing today.
   Every existing module is MOVED (sort_order), never dissolved — module_completion
   rows are never deleted and no cue is repointed.

   ---------------------------------------------------------------------------
   WHERE THE MODULE NAMES COME FROM, SERIES BY SERIES
   ---------------------------------------------------------------------------

   A slate names the shoot, not the curriculum — so no film is retitled here. The
   MODULE names are new, and each set has a stated source:

     Setting up the MPI      the spoken slate titles transcribed in
                             reports/unhomed-series-for-mitch.md, verbatim.
     Four Step Close         the quiz bank's part titles for Parts 1-9 — they
                             agree with the films — and "After the Close" for
                             module 10, because the film numbered Part 10 is the
                             workbook's Part 11 (0140 recorded the divergence;
                             the workbook's Part 10, "Fit the Close to the
                             Customer", has NO film and gets no module).
     Success Cycle           the spoken titles already in content.title.
     Overcoming Objections   the spoken slate titles from the unhomed report.
                             "The Steer Objection" carries NO spoken part number;
                             it is placed LAST (module 12) by ruling, not by
                             slate — flagged here and in the report. Checked
                             before ruling: Part 6 opens on a fresh scenario and
                             Part 4 closes with no hand-off, so nothing says it
                             is the missing Part 5.
     Menus                   the film titles. These two are the CLOSER worked
                             example: a closer is the last module of its track,
                             one film, no quiz, sorted after every lesson and
                             cue module, so the track's final morning is Mitch
                             closing it and trackComplete() needs nothing new.

   ---------------------------------------------------------------------------
   WHY THE KNOWLEDGE NOTES MODULES MOVE TO THE END
   ---------------------------------------------------------------------------

   Video is the curriculum; cues are reinforcement (TWO_LADDERS). The lesson
   modules must come first or an advisor entering Setting up the MPI would work
   two cues before the first film. Interleaving the cues INTO the lesson modules
   is October work (matching cue text to film transcript) — moving a module's
   sort_order costs nothing now and does not prejudge that mapping.

     The Multi-Point Inspection   Knowledge Notes            1 -> 10
     The 4-Step Close             Knowledge Notes 1, 2       1,2 -> 11,12
     The Success Cycle            Knowledge Notes 1..7       1..7 -> 13..19
     Objection Handling           Knowledge Notes 3, 4,      3,4,5 -> 13,14,15
                                  Closing Strategies
                                  (Knowledge Notes 1 and 2 hold the two published
                                  Overcoming Objections films and STAY at 1-2)

   ---------------------------------------------------------------------------
   active AND item_count COME OUT OF THE FUNCTION, NOT THIS FILE
   ---------------------------------------------------------------------------

   recompute_certification_content() runs at the end. The bar is 5, so Setting up
   the MPI (11 items) and Four Step Close (12) activate BY COMPUTATION, and the
   assertion below checks the function's answer rather than writing one. No
   certification may LOSE active here — asserted, both directions.

   ---------------------------------------------------------------------------
   THE LOCAL-REPLAY SKIP, SAME SHAPE AS 0142
   ---------------------------------------------------------------------------

   The local seed carries none of these films, so on `db reset --local` each
   series takes the "no films present — skipping" path and the migration is a
   no-op. On production every count is asserted exactly; a subset refuses.
   =========================================================================== */

do $$
declare
  _spec record;
  _course uuid;
  _m uuid;
  _f uuid;
  _n int;
  _expected int;
  _built int := 0;
  _completions_before bigint;
  _film record;
begin
  select count(*) into _completions_before from module_completion;

  /* =========================================================================
     THE FIVE SERIES. film_pattern is anchored so a later "Part 13" or a
     similarly-prefixed film ("Success Cycle" also prefixes two vocabulary
     films WITH part numbers, which is fine — but "Sing It" and "Wrap-Up"
     without the prefix must not match, and do not).
     ========================================================================= */
  for _spec in
    select * from (values
      ('Setting up the MPI', 'The Multi-Point Inspection',
       '^Get the Hell Out of Here, Part [0-9]+$', 9),
      ('Four Step Close', 'The 4-Step Close',
       '^Four Step Close, Part [0-9]+$', 10),
      ('Success Cycle', 'The Success Cycle',
       '^Success Cycle, Part [0-9]+, .+$', 12),
      ('Overcoming Objections', 'Objection Handling',
       '^Selling Skills, (Part [0-9]+|The Steer Objection)$', 10),
      ('Menus', 'Menus',
       '^Menu Wrap-Up, Part [0-9]+$', 2)
    ) as t(cert_name, course_name, film_pattern, film_count)
  loop
    select co.id into _course
      from certification c
      join certification_course cc on cc.certification_id = c.id
      join course co on co.id = cc.course_id
     where c.name = _spec.cert_name and co.name = _spec.course_name;
    if _course is null then
      raise notice '0144: no course "%" on "%" — skipping', _spec.course_name, _spec.cert_name;
      continue;
    end if;

    select count(*) into _n from content
     where type='advisor_video' and status='published' and retired_at is null
       and title ~ _spec.film_pattern;
    if _n = 0 then
      raise notice '0144: no % films present — skipping', _spec.cert_name;
      continue;
    end if;
    if _n <> _spec.film_count then
      raise exception '0144: expected % films matching %, found % — refusing to attach a subset',
        _spec.film_count, _spec.film_pattern, _n;
    end if;

    /* ALREADY DONE IS NOT OCCUPIED (0142's lesson). All attached to this
       course: nothing to do. Some attached, or attached elsewhere: refuse —
       that is a state no run of this migration produces. */
    select count(*) into _n from content ct
      join module m on m.id = ct.module_id
     where ct.title ~ _spec.film_pattern and ct.retired_at is null
       and m.course_id = _course;
    if _n = _spec.film_count then
      raise notice '0144: % is already built — nothing to do', _spec.cert_name;
      continue;
    end if;
    select count(*) into _n from content ct
     where ct.title ~ _spec.film_pattern and ct.retired_at is null
       and ct.module_id is not null;
    if _n <> 0 then
      raise exception
        '0144: % film(s) matching % are attached to a module this migration did not expect — refusing',
        _n, _spec.film_pattern;
    end if;

    _built := _built + 1;
  end loop;

  if _built = 0 then
    raise notice '0144: nothing to build on this database';
    return;
  end if;
  if _built <> 5 then
    raise exception
      '0144: only % of 5 series are buildable — this database has a subset of the films, which is not a state production or an empty local ever presents',
      _built;
  end if;

  /* =========================================================================
     STEP 1 — MOVE THE CUE MODULES TO THE END, by id-free name match within
     the one course each lives in. sort_order carries no uniqueness
     constraint, so the shifts cannot collide with the inserts below.
     ========================================================================= */
  update module m set sort_order = 10
    from course co, certification_course cc, certification c
   where m.course_id = co.id and cc.course_id = co.id and cc.certification_id = c.id
     and c.name = 'Setting up the MPI' and co.name = 'The Multi-Point Inspection'
     and m.name = 'Knowledge Notes';

  update module m set sort_order = m.sort_order + 10
    from course co, certification_course cc, certification c
   where m.course_id = co.id and cc.course_id = co.id and cc.certification_id = c.id
     and c.name = 'Four Step Close' and co.name = 'The 4-Step Close'
     and m.name in ('Knowledge Notes 1','Knowledge Notes 2')
     and m.sort_order <= 2;

  update module m set sort_order = m.sort_order + 12
    from course co, certification_course cc, certification c
   where m.course_id = co.id and cc.course_id = co.id and cc.certification_id = c.id
     and c.name = 'Success Cycle' and co.name = 'The Success Cycle'
     and m.name like 'Knowledge Notes %'
     and m.sort_order <= 7;

  update module m set sort_order = m.sort_order + 10
    from course co, certification_course cc, certification c
   where m.course_id = co.id and cc.course_id = co.id and cc.certification_id = c.id
     and c.name = 'Overcoming Objections' and co.name = 'Objection Handling'
     and m.name in ('Knowledge Notes 3','Knowledge Notes 4','Closing Strategies')
     and m.sort_order between 3 and 5;

  /* =========================================================================
     STEP 2 — THE 43 MODULES, EACH WITH ITS ONE FILM AT module_order 1.
     Films are matched by exact title — the only key both systems observed.
     ========================================================================= */
  for _film in
    select * from (values
      -- Setting up the MPI: slate titles from reports/unhomed-series-for-mitch.md
      ('Setting up the MPI','The Multi-Point Inspection', 1,'The easiest sell you''ll ever make','Get the Hell Out of Here, Part 1'),
      ('Setting up the MPI','The Multi-Point Inspection', 2,'The speech','Get the Hell Out of Here, Part 2'),
      ('Setting up the MPI','The Multi-Point Inspection', 3,'Certified technician and completing','Get the Hell Out of Here, Part 3'),
      ('Setting up the MPI','The Multi-Point Inspection', 4,'The 90-second highlight video','Get the Hell Out of Here, Part 4'),
      ('Setting up the MPI','The Multi-Point Inspection', 5,'Name the favourites','Get the Hell Out of Here, Part 5'),
      ('Setting up the MPI','The Multi-Point Inspection', 6,'Text it, and speed matters','Get the Hell Out of Here, Part 6'),
      ('Setting up the MPI','The Multi-Point Inspection', 7,'The green approve button','Get the Hell Out of Here, Part 7'),
      ('Setting up the MPI','The Multi-Point Inspection', 8,'May I give you a quick call?','Get the Hell Out of Here, Part 8'),
      ('Setting up the MPI','The Multi-Point Inspection', 9,'Set up your teammate','Get the Hell Out of Here, Part 9'),
      -- Four Step Close: quiz-bank part titles 1-9; module 10 is the workbook's
      -- Part 11 "After the Close", which is what the film numbered Part 10 teaches
      ('Four Step Close','The 4-Step Close', 1,'Ends the Same Way','Four Step Close, Part 1'),
      ('Four Step Close','The 4-Step Close', 2,'What They Need','Four Step Close, Part 2'),
      ('Four Step Close','The 4-Step Close', 3,'How Much','Four Step Close, Part 3'),
      ('Four Step Close','The 4-Step Close', 4,'When','Four Step Close, Part 4'),
      ('Four Step Close','The 4-Step Close', 5,'Authorization','Four Step Close, Part 5'),
      ('Four Step Close','The 4-Step Close', 6,'Then Stop Talking','Four Step Close, Part 6'),
      ('Four Step Close','The 4-Step Close', 7,'Assume the Yes','Four Step Close, Part 7'),
      ('Four Step Close','The 4-Step Close', 8,'The Close in Four Places','Four Step Close, Part 8'),
      ('Four Step Close','The 4-Step Close', 9,'The Close You Never Have to Make','Four Step Close, Part 9'),
      ('Four Step Close','The 4-Step Close',10,'After the Close','Four Step Close, Part 10'),
      -- Success Cycle: the spoken titles already in content.title
      ('Success Cycle','The Success Cycle', 1,'Not a Rut Team','Success Cycle, Part 1, Not a Rut Team'),
      ('Success Cycle','The Success Cycle', 2,'Vocabulary That Sails','Success Cycle, Part 2, Vocabulary That Sails'),
      ('Success Cycle','The Success Cycle', 3,'More Vocabulary','Success Cycle, Part 3, More Vocabulary'),
      ('Success Cycle','The Success Cycle', 4,'Green Yellow Red','Success Cycle, Part 4, Green Yellow Red'),
      ('Success Cycle','The Success Cycle', 5,'The 6 Stages','Success Cycle, Part 5, The 6 Stages'),
      ('Success Cycle','The Success Cycle', 6,'More Staging','Success Cycle, Part 6, More Staging'),
      ('Success Cycle','The Success Cycle', 7,'Features and Benefits','Success Cycle, Part 7, Features and Benefits'),
      ('Success Cycle','The Success Cycle', 8,'Anticipate the No','Success Cycle, Part 8, Anticipate the No'),
      ('Success Cycle','The Success Cycle', 9,'More on Overcoming Objections','Success Cycle, Part 9, More on Overcoming Objections'),
      ('Success Cycle','The Success Cycle',10,'Anatomy of the Speech','Success Cycle, Part 10, Anatomy of the Speech'),
      ('Success Cycle','The Success Cycle',11,'The Repair Call','Success Cycle, Part 11, The Repair Call'),
      ('Success Cycle','The Success Cycle',12,'Your song, Go Sing It','Success Cycle, Part 12, Your song, Go Sing It'),
      -- Overcoming Objections: slate titles from the unhomed report. Modules
      -- 3-12 because Knowledge Notes 1 and 2 hold the two published films the
      -- track already serves. There is no Selling Skills Part 5; The Steer
      -- Objection is placed last BY RULING (it carries no spoken part number).
      ('Overcoming Objections','Objection Handling', 3,'Watch the video first','Selling Skills, Part 1'),
      ('Overcoming Objections','Objection Handling', 4,'Send the link before you call','Selling Skills, Part 2'),
      ('Overcoming Objections','Objection Handling', 5,'Hand them something','Selling Skills, Part 3'),
      ('Overcoming Objections','Objection Handling', 6,'We caught it in time','Selling Skills, Part 4'),
      ('Overcoming Objections','Objection Handling', 7,'The redirect and the dentist','Selling Skills, Part 6'),
      ('Overcoming Objections','Objection Handling', 8,'Information overload','Selling Skills, Part 7'),
      ('Overcoming Objections','Objection Handling', 9,'The trade-in','Selling Skills, Part 8'),
      ('Overcoming Objections','Objection Handling',10,'Read the customer','Selling Skills, Part 9'),
      ('Overcoming Objections','Objection Handling',11,'After the second no','Selling Skills, Part 10'),
      ('Overcoming Objections','Objection Handling',12,'The Steer Objection','Selling Skills, The Steer Objection'),
      -- Menus: the two closers, after the seven lesson modules. The worked
      -- example for "a closer is the last module of its track".
      ('Menus','Menus', 8,'Menu Wrap-Up, Part 1','Menu Wrap-Up, Part 1'),
      ('Menus','Menus', 9,'Menu Wrap-Up, Part 2','Menu Wrap-Up, Part 2')
    ) as t(cert_name, course_name, sort_order, module_name, film_title)
  loop
    select co.id into _course
      from certification c
      join certification_course cc on cc.certification_id = c.id
      join course co on co.id = cc.course_id
     where c.name = _film.cert_name and co.name = _film.course_name;

    select id into _f from content
     where type='advisor_video' and status='published' and retired_at is null
       and title = _film.film_title;
    if _f is null then
      raise exception '0144: no published film titled "%"', _film.film_title;
    end if;

    select id into _m from module
     where course_id = _course and name = _film.module_name;
    if _m is null then
      insert into module (course_id, name, sort_order, name_status)
      values (_course, _film.module_name, _film.sort_order, 'ok')
      returning id into _m;
    end if;

    update content set module_id = _m, module_order = 1,
                       placement = 'daily_craft', updated_at = now()
     where id = _f;
  end loop;

  /* ================= ASSERT, BOTH DIRECTIONS ============================== */

  for _spec in
    select * from (values
      ('Setting up the MPI','The Multi-Point Inspection','^Get the Hell Out of Here, Part [0-9]+$', 9, 1, 9, array[]::text[]),
      ('Four Step Close','The 4-Step Close','^Four Step Close, Part [0-9]+$',10, 1,10, array[]::text[]),
      ('Success Cycle','The Success Cycle','^Success Cycle, Part [0-9]+, .+$',12, 1,12, array[]::text[]),
      /* Knowledge Notes 1 and 2 hold the track's two published FILMS and lead
         it at sort 1-2 — they are the one pair allowed inside a lesson run. */
      ('Overcoming Objections','Objection Handling','^Selling Skills, (Part [0-9]+|The Steer Objection)$',10, 3,12,
       array['Knowledge Notes 1','Knowledge Notes 2']),
      ('Menus','Menus','^Menu Wrap-Up, Part [0-9]+$', 2, 8, 9, array[]::text[])
    ) as t(cert_name, course_name, film_pattern, film_count, lo, hi, keep_inside)
  loop
    select co.id into _course
      from certification c
      join certification_course cc on cc.certification_id = c.id
      join course co on co.id = cc.course_id
     where c.name = _spec.cert_name and co.name = _spec.course_name;

    /* every film attached, as daily_craft, inside this course */
    select count(*) into _n from content ct join module m on m.id = ct.module_id
     where ct.title ~ _spec.film_pattern and ct.retired_at is null
       and m.course_id = _course and ct.placement = 'daily_craft'
       and ct.module_order = 1;
    if _n <> _spec.film_count then
      raise exception '0144: % has % of % films attached as daily_craft',
        _spec.cert_name, _n, _spec.film_count;
    end if;

    /* the lesson modules cover lo..hi with no gap, no duplicate sort_order
       anywhere in the course, and exactly one film each */
    select count(distinct m.sort_order) into _n from module m
      join content ct on ct.module_id = m.id
       and ct.type = 'advisor_video' and ct.title ~ _spec.film_pattern
     where m.course_id = _course and m.sort_order between _spec.lo and _spec.hi;
    if _n <> _spec.film_count then
      raise exception '0144: % lesson modules cover % of positions %..%',
        _spec.cert_name, _n, _spec.lo, _spec.hi;
    end if;

    select count(*) into _n from (
      select sort_order from module where course_id = _course
      group by sort_order having count(*) > 1
    ) dup;
    if _n <> 0 then
      raise exception '0144: % has % duplicated module sort_order(s)', _spec.cert_name, _n;
    end if;

    /* and the MOVED cue modules landed AFTER every lesson module */
    select count(*) into _n from module m
     where m.course_id = _course
       and m.name ~ '^(Knowledge Notes( [0-9]+)?|Closing Strategies)$'
       and m.name <> all (_spec.keep_inside)
       and m.sort_order <= _spec.hi;
    if _n <> 0 then
      raise exception '0144: % cue module(s) on % still sort inside the lesson run',
        _n, _spec.cert_name;
    end if;
  end loop;

  /* no cue changed modules IN THE FIVE TOUCHED COURSES — the interleaving is
     October work. (Scoped: elsewhere in the library cues legitimately live in
     named modules; that population is not this migration's.) */
  select count(*) into _n from content ct
    join module m on m.id = ct.module_id
    join course co on co.id = m.course_id
   where ct.type = 'cue'
     and co.name in ('The Multi-Point Inspection','The 4-Step Close',
                     'The Success Cycle','Objection Handling','Menus')
     and m.name !~ '^(Knowledge Notes( [0-9]+)?|Closing Strategies)$';
  if _n <> 0 then
    raise exception '0144: % cue(s) in a touched course sit outside a Knowledge Notes/Closing Strategies module', _n;
  end if;

  /* no completion row was touched — moved, never dissolved */
  select count(*) into _n from module_completion;
  if _n <> _completions_before then
    raise exception '0144: module_completion moved from % to % rows', _completions_before, _n;
  end if;

  raise notice '0144: 43 films attached across five tracks; cue modules moved to the end; no completion touched';
end
$$;

/*
 * item_count and active come out of the function. The migration runs it as
 * postgres, which proves nothing about the API path (pg_safeupdate) — the
 * acceptance run also calls it over PostgREST as the service role, the way the
 * application does.
 */
select recompute_certification_content();

/*
 * THE FUNCTION'S ANSWER, CHECKED — NOT WRITTEN. Bar is 5: Setting up the MPI
 * lands at 11 published items and Four Step Close at 12, so both must be active
 * BY COMPUTATION. And no core certification may have LOST active: the five
 * touched tracks all gained items, and the other four were not touched.
 */
do $$
declare
  _n int;
begin
  /* Only assert when the films are present (production); the local replay
     skipped the build and owes nothing. */
  if not exists (
    select 1 from content
     where title = 'Get the Hell Out of Here, Part 1'
       and status = 'published' and retired_at is null and module_id is not null
  ) then
    raise notice '0144: build was skipped on this database — activation not asserted';
    return;
  end if;

  select count(*) into _n from certification
   where name in ('Setting up the MPI','Four Step Close') and is_core and active;
  if _n <> 2 then
    raise exception
      '0144: recompute_certification_content() activated % of the 2 tracks this migration fills', _n;
  end if;

  select count(*) into _n from certification
   where is_core and name in
     ('Walk Around','Success Cycle','Overcoming Objections',
      'Power of Positive Language','Lasting Impressions','Name Tag','Menus')
     and not active;
  if _n <> 0 then
    raise exception '0144: % previously-active core track(s) lost active', _n;
  end if;

  raise notice '0144: nine core tracks, nine active';
end
$$;
