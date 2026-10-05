/* ===========================================================================
   0159 — OPENERS AND CLOSERS TAKE THEIR PLACES, AND WALK AROUND GETS ITS FILMS
   ===========================================================================

   The 30 September ingest (reports/ingest-30-september.md, PR #36) landed 29
   drafts; Ryan has published them. This migration puts them where INGEST.md's
   two title forms say they go, and attaches the three Walk-Around films Ryan
   ruled on.

     OPENERS   certification.entry_film_content_id, one per core track.
               Five tracks: Setting up the MPI, Four Step Close, Success Cycle,
               Lasting Impressions, Name Tag. Menus was already set (0132), to
               "Dealer Upsell Menus and Interval Charts — Opener".

     CLOSERS   one new module at the END of the track's course, one film, no
               quiz. Five tracks, the same five. Menu Wrap-Up 1 and 2 as Menus
               modules 8-9 (0144) are the worked example.

     WALK      three published films onto the three filmless thematic modules
     AROUND    Ryan ruled on, module_order 1, quizzes untouched. Module 7
               stays filmless — Mitch owes it.

   ---------------------------------------------------------------------------
   WHY AN OPENER IS A POINTER AND A CLOSER IS A MODULE
   ---------------------------------------------------------------------------
   Not a style choice — it is TWO_LADDERS' asymmetry. A track film is NOT a
   daily item: on the morning an advisor enters a track the film IS the day, and
   it replaces the pitch and item slots rather than stacking with them. That is
   a property of the certification, so it lives on the certification. A closer
   is the opposite: it is the last ordinary morning of the track, so it is an
   ordinary module and trackComplete() needs nothing new.

   `exit_film_content_id` was proposed in reports/lock-basic-certification-
   1-october.md and is deliberately NOT built here: the convention needs no
   schema and the sort is stated explicitly below.

   ---------------------------------------------------------------------------
   THE OPENER ASSERTS THE LOOP'S OWN THREE FILTERS
   ---------------------------------------------------------------------------
   lib/loop.ts pickItem() reads the entry film with
       .eq("status","published") .is("retired_at",null) .not("mux_playback_id","is",null)
   and silently serves `film: null` when the row fails any of them — which the
   assembler reads as "a normal morning". So a pointer at a film the loop will
   not serve produces an entry morning with no entry film and NO ERROR: worse
   than null, because null is at least honest. All three filters are asserted
   per film before the pointer is written, and asserted again at the end.

   ---------------------------------------------------------------------------
   WHERE THE CLOSER MODULE NAMES COME FROM
   ---------------------------------------------------------------------------
   The film's own title, which is what the ingest took from Mitch's spoken slate
   — the same rule 0144 used for Menu Wrap-Up 1 and 2. A slate names the shoot,
   not the curriculum, so NO FILM IS RETITLED here and no module name is
   invented. The slates, transcribed (content_transcript, source mux_caption):

     Setting up the MPI — Closer   "Outro, get the hell out of here."
     Four Step Close — Closer      "Aloha! That's the 4-step close."
     Success Cycle — Closer        "Outro, this success cycle."
     Lasting Impressions — Closer  "Alotro, lasting impressions."
     Name Tag — Closer             "Aotro, what's in a name tag?"

   ---------------------------------------------------------------------------
   THE CLOSER SORTS AFTER EVERYTHING, INCLUDING THE TRAILING CUE MODULES
   ---------------------------------------------------------------------------
   0144 moved every Knowledge Notes module to the end of its course, so "after
   every lesson module" is not sufficient — the closer must sort after the cue
   modules too, or the track's last morning is a cue. Computed as
   max(sort_order) + 1 over the whole course rather than written as a literal,
   because a literal would be a second definition of "the end" and would be
   wrong the next time a module is added. Today that resolves to:

     Setting up the MPI     10 modules (KN at 10)        -> closer at 11
     Four Step Close        12 modules (KN 1-2 at 11-12) -> closer at 13
     Success Cycle          19 modules (KN 1-7 at 13-19) -> closer at 20
     Lasting Impressions    12 modules (no cue modules)  -> closer at 13
     Name Tag               10 modules (no cue modules)  -> closer at 11

   ---------------------------------------------------------------------------
   MENUS IS HELD, DELIBERATELY, AND THIS MIGRATION DOES NOT TOUCH IT
   ---------------------------------------------------------------------------
   Menus already carries two closer modules (8 Menu Wrap-Up Part 1, 9 Part 2)
   from 0144, and the 30 September run added a third film, "Menus — Closer".
   Three closers is not a track shape anybody has ruled on, so nothing is
   attached: `Menus — Closer` stays unattached and `Menus` keeps its nine
   modules. The three slates and durations are side by side in
   reports/openers-and-closers-4-october.md for Ryan's ruling, and whatever he
   rules is a follow-up migration.

   This migration ASSERTS the hold rather than merely declining to act on it —
   see the Menus assertion at the end. A hold that leaves no trace is not a
   hold, and "we did not get round to it" and "this is held" must not be the
   same state in the schema.

   ---------------------------------------------------------------------------
   THE WALK-AROUND ATTACHES, AND THE SENTENCE THAT DECIDES EACH
   ---------------------------------------------------------------------------
   Ryan's ruling on the #36 proposal. The films are STEP-based and the modules
   are THEMATIC, so the fit is partial and argued from the transcript body
   rather than the title — a slate names the shoot, not the curriculum. Each
   sentence below is verbatim from content_transcript for that film:

     module 4  Raising a Problem Well
       <- 30 Second Walk-Around, Part 2, Four Goals, Two Words
       "Every ding, every scratch, document it, and never a negative without a
        positive solution."
       Corroborated by the module's own published quiz: its cues are
       "Never Bring Up a Negative Without a Positive Solution" and
       "No Negative Without a Positive Solution — The Paint ...".

     module 5  Tires on the Drive
       <- 30 Second Walk-Around, Part 5, Step 4, Wheels to the Left
       "That view is what sets up Rotate Balance Alignment and Tires."
       Corroborated by the module's cue "The Tire Maintenance Ladder —
       Rotate · Balance · Alignment".

     module 6  Visibility and Wipers
       <- 30 Second Walk-Around, Part 6, Step 5, Washer Fluid
       "Running the system opens up wipers, glass treatment, washer fluid and a
        complete service."
       Corroborated by the module's cue "Check Wipers on Every RO".

     module 7  The Handback — NO FILM. The step films are the intake
       walk-around; none covers returning the car, and module 7's questions are
       about PPE removal and proofing the car at handback. Mitch owes it.

   The modules' existing cues sort at module_order 11-36, so a film at
   module_order 1 leads its module without colliding with or reordering
   anything. No quiz question and no cue is touched.

   ---------------------------------------------------------------------------
   item_count AND active COME OUT OF THE FUNCTION, NOT THIS FILE
   ---------------------------------------------------------------------------
   recompute_certification_content() runs at the end and its answer is CHECKED,
   not written. Every track here GAINS items (five closers +1 each, Walk Around
   +3), so no core track can lose `active` — asserted. module_completion is
   asserted unchanged: this migration inserts modules and never touches a row
   an advisor earned.

   Walk Around's is_core sort position (1) and its four quiz-bearing modules
   (4-7) keep their numbering — nothing here moves a module.

   ---------------------------------------------------------------------------
   THE LOCAL-REPLAY SKIP, SAME SHAPE AS 0142 AND 0144
   ---------------------------------------------------------------------------
   The local seed carries none of these films, so on `db reset --local` every
   leg takes its "no film present — skipping" path and the migration is a
   no-op. On production every count is asserted exactly and a subset refuses.
   Both halves are proven: the skip path on a full local replay, the build path
   on a restore of the production dump.
   =========================================================================== */

do $$
declare
  _row    record;
  _cert   uuid;
  _course uuid;
  _film   uuid;
  _m      uuid;
  _n      int;
  _sort   int;
  _cur    uuid;
  _held   uuid;
  _ok     boolean;
  _openers_set   int := 0;
  _closers_built int := 0;
  _walk_attached int := 0;
  _completions_before bigint;
begin
  select count(*) into _completions_before from module_completion;

  /* =========================================================================
     PART A — THE OPENERS. certification.entry_film_content_id, five tracks.
     ========================================================================= */
  for _row in
    select * from (values
      ('Setting up the MPI',   'Setting up the MPI — Opener'),
      ('Four Step Close',      'Four Step Close — Opener'),
      ('Success Cycle',        'Success Cycle — Opener'),
      ('Lasting Impressions',  'Lasting Impressions — Opener'),
      ('Name Tag',             'Name Tag — Opener')
    ) as t(cert_name, film_title)
  loop
    select id, entry_film_content_id into _cert, _cur
      from certification where name = _row.cert_name and is_core;
    if _cert is null then
      raise notice '0159: no core certification "%" — skipping', _row.cert_name;
      continue;
    end if;

    /* THE FILM MUST SATISFY THE LOOP'S OWN THREE FILTERS, not merely exist.
       A pointer at a film pickItem() will not serve yields an entry morning
       with no film and no error. */
    select count(*) into _n from content
     where title = _row.film_title
       and type = 'advisor_video'
       and status = 'published'
       and retired_at is null
       and mux_playback_id is not null;

    if _n = 0 then
      raise notice '0159: opener "%" is not present and servable — skipping', _row.film_title;
      continue;
    end if;
    if _n <> 1 then
      raise exception
        '0159: % servable films titled "%" — an opener must be exactly one, refusing',
        _n, _row.film_title;
    end if;

    select id into _film from content
     where title = _row.film_title
       and type = 'advisor_video'
       and status = 'published'
       and retired_at is null
       and mux_playback_id is not null;

    /* ALREADY SET IS NOT OCCUPIED, but set to something ELSE is a ruling this
       migration did not make and must not overwrite. */
    if _cur = _film then
      raise notice '0159: % opener is already set — nothing to do', _row.cert_name;
      _openers_set := _openers_set + 1;
      continue;
    end if;
    if _cur is not null then
      raise exception
        '0159: % already points at a different entry film (%) — refusing to overwrite a ruling',
        _row.cert_name, _cur;
    end if;

    update certification set entry_film_content_id = _film, updated_at = now()
     where id = _cert;
    _openers_set := _openers_set + 1;
  end loop;

  /* =========================================================================
     PART B — THE CLOSERS. One module at the end of the course, one film,
     module_order 1, placement daily_craft, no quiz.
     ========================================================================= */
  for _row in
    select * from (values
      ('Setting up the MPI',  'The Multi-Point Inspection', 'Setting up the MPI — Closer'),
      ('Four Step Close',     'The 4-Step Close',           'Four Step Close — Closer'),
      ('Success Cycle',       'The Success Cycle',          'Success Cycle — Closer'),
      ('Lasting Impressions', 'Lasting Impressions',        'Lasting Impressions — Closer'),
      ('Name Tag',            'Name Tag',                   'Name Tag — Closer')
    ) as t(cert_name, course_name, film_title)
  loop
    select co.id into _course
      from certification c
      join certification_course cc on cc.certification_id = c.id
      join course co on co.id = cc.course_id
     where c.name = _row.cert_name and c.is_core and co.name = _row.course_name;
    if _course is null then
      raise notice '0159: no course "%" on "%" — skipping', _row.course_name, _row.cert_name;
      continue;
    end if;

    select count(*) into _n from content
     where title = _row.film_title
       and type = 'advisor_video'
       and status = 'published'
       and retired_at is null
       and mux_playback_id is not null;
    if _n = 0 then
      raise notice '0159: closer "%" is not present and servable — skipping', _row.film_title;
      continue;
    end if;
    if _n <> 1 then
      raise exception
        '0159: % servable films titled "%" — a closer must be exactly one, refusing',
        _n, _row.film_title;
    end if;

    select id, module_id into _film, _m from content
     where title = _row.film_title
       and type = 'advisor_video'
       and status = 'published'
       and retired_at is null
       and mux_playback_id is not null;

    /* Idempotent: already this course's closer, nothing to do. Attached
       ANYWHERE else is a state no run of this migration produces. */
    if _m is not null then
      select count(*) into _n from module where id = _m and course_id = _course;
      if _n = 1 then
        raise notice '0159: % closer is already attached — nothing to do', _row.cert_name;
        _closers_built := _closers_built + 1;
        continue;
      end if;
      raise exception
        '0159: closer "%" is attached to a module outside % — refusing',
        _row.film_title, _row.course_name;
    end if;

    /* THE END OF THE COURSE, COMPUTED. 0144 moved the Knowledge Notes modules
       to the end, so "after the lessons" is not "after everything". */
    select coalesce(max(sort_order), 0) + 1 into _sort
      from module where course_id = _course;

    /* A closer module must not already exist under this name (a half-applied
       run), and the name must be free on the course. */
    select count(*) into _n from module
     where course_id = _course and name = _row.film_title;
    if _n <> 0 then
      raise exception
        '0159: a module named "%" already exists on % but does not hold the film — refusing',
        _row.film_title, _row.course_name;
    end if;

    insert into module (course_id, name, sort_order, name_status)
    values (_course, _row.film_title, _sort, 'ok')
    returning id into _m;

    update content set module_id = _m, module_order = 1,
                       placement = 'daily_craft', updated_at = now()
     where id = _film;

    _closers_built := _closers_built + 1;
  end loop;

  /* =========================================================================
     PART C — WALK AROUND MODULES 4, 5 AND 6. Ryan's ruling; the deciding
     sentence for each is quoted in the header. Module 7 stays filmless.
     ========================================================================= */
  for _row in
    select * from (values
      ('4. Raising a Problem Well', '30 Second Walk-Around, Part 2, Four Goals, Two Words'),
      ('5. Tires on the Drive',     '30 Second Walk-Around, Part 5, Step 4, Wheels to the Left'),
      ('6. Visibility and Wipers',  '30 Second Walk-Around, Part 6, Step 5, Washer Fluid')
    ) as t(module_name, film_title)
  loop
    select co.id into _course
      from certification c
      join certification_course cc on cc.certification_id = c.id
      join course co on co.id = cc.course_id
     where c.name = 'Walk Around' and c.is_core and co.name = 'The Walk-Around';
    if _course is null then
      raise notice '0159: no Walk-Around course — skipping';
      exit;
    end if;

    select id into _m from module
     where course_id = _course and name = _row.module_name;
    if _m is null then
      raise notice '0159: no Walk Around module "%" — skipping', _row.module_name;
      continue;
    end if;

    select count(*) into _n from content
     where title = _row.film_title
       and type = 'advisor_video'
       and status = 'published'
       and retired_at is null
       and mux_playback_id is not null;
    if _n = 0 then
      raise notice '0159: Walk-Around film "%" is not present and servable — skipping', _row.film_title;
      continue;
    end if;
    if _n <> 1 then
      raise exception
        '0159: % servable films titled "%" — refusing', _n, _row.film_title;
    end if;

    select id, module_id into _film, _held from content
     where title = _row.film_title
       and type = 'advisor_video'
       and status = 'published'
       and retired_at is null
       and mux_playback_id is not null;

    if _held is not null then
      if _held = _m then
        raise notice '0159: "%" is already on % — nothing to do', _row.film_title, _row.module_name;
        _walk_attached := _walk_attached + 1;
        continue;
      end if;
      raise exception
        '0159: Walk-Around film "%" is attached to another module — refusing',
        _row.film_title;
    end if;

    /* The module must not already hold a film — these three are the FILMLESS
       modules, and attaching a second film to one would make the fit a guess
       about ordering rather than a ruling. */
    select count(*) into _n from content
     where module_id = _m and type = 'advisor_video'
       and status = 'published' and retired_at is null;
    if _n <> 0 then
      raise exception
        '0159: module "%" already holds % published film(s) — refusing',
        _row.module_name, _n;
    end if;

    update content set module_id = _m, module_order = 1,
                       placement = 'daily_craft', updated_at = now()
     where id = _film;

    _walk_attached := _walk_attached + 1;
  end loop;

  /* =========================================================================
     NOTHING, OR EVERYTHING. A SUBSET IS NOT A STATE EITHER SIDE PRESENTS.
     ========================================================================= */
  if _openers_set = 0 and _closers_built = 0 and _walk_attached = 0 then
    raise notice '0159: none of these films are on this database — nothing to do';
    return;
  end if;
  if _openers_set <> 5 or _closers_built <> 5 or _walk_attached <> 3 then
    raise exception
      '0159: partial — % of 5 openers, % of 5 closers, % of 3 Walk-Around attaches. '
      'This database carries a subset of the films, which is not a state production '
      'or an empty local ever presents.',
      _openers_set, _closers_built, _walk_attached;
  end if;

  /* ================= ASSERT, BOTH DIRECTIONS ============================== */

  /* ---- A1. five openers set, and each film passes the loop's three filters */
  select count(*) into _n
    from certification c
    join content ct on ct.id = c.entry_film_content_id
   where c.is_core
     and c.name in ('Setting up the MPI','Four Step Close','Success Cycle',
                    'Lasting Impressions','Name Tag')
     and ct.status = 'published'
     and ct.retired_at is null
     and ct.mux_playback_id is not null;
  if _n <> 5 then
    raise exception
      '0159: % of 5 core tracks point at a film the loop will actually serve', _n;
  end if;

  /* ---- A2. and the pointer is the OPENER, not some other film ------------ */
  select count(*) into _n
    from certification c
    join content ct on ct.id = c.entry_film_content_id
   where c.is_core
     and c.name in ('Setting up the MPI','Four Step Close','Success Cycle',
                    'Lasting Impressions','Name Tag')
     and ct.title = c.name || ' — Opener';
  if _n <> 5 then
    raise exception '0159: % of 5 entry films are the track''s own opener', _n;
  end if;

  /* ---- A3. Menus still points at the opener 0132 set -------------------- */
  select count(*) into _n
    from certification c
    join content ct on ct.id = c.entry_film_content_id
   where c.name = 'Menus' and c.is_core
     and ct.title = 'Dealer Upsell Menus and Interval Charts — Opener';
  if _n <> 1 then
    raise exception '0159: the Menus entry film is no longer 0132''s opener';
  end if;

  /* ---- A4. the three tracks Mitch still owes stay NULL ------------------- */
  select count(*) into _n from certification
   where is_core
     and name in ('Walk Around','Overcoming Objections','Power of Positive Language')
     and entry_film_content_id is not null;
  if _n <> 0 then
    raise exception
      '0159: % track(s) Mitch has not delivered an opener for acquired one', _n;
  end if;

  /* ---- B1. each closer is the LAST module of its course, holds exactly one
         film at module_order 1 as daily_craft, and carries NO quiz ---------- */
  for _row in
    select * from (values
      ('Setting up the MPI',  'The Multi-Point Inspection', 'Setting up the MPI — Closer'),
      ('Four Step Close',     'The 4-Step Close',           'Four Step Close — Closer'),
      ('Success Cycle',       'The Success Cycle',          'Success Cycle — Closer'),
      ('Lasting Impressions', 'Lasting Impressions',        'Lasting Impressions — Closer'),
      ('Name Tag',            'Name Tag',                   'Name Tag — Closer')
    ) as t(cert_name, course_name, film_title)
  loop
    select co.id into _course
      from certification c
      join certification_course cc on cc.certification_id = c.id
      join course co on co.id = cc.course_id
     where c.name = _row.cert_name and co.name = _row.course_name;

    select id, sort_order into _m, _sort from module
     where course_id = _course and name = _row.film_title;
    if _m is null then
      raise exception '0159: % has no closer module', _row.cert_name;
    end if;

    /* THE LAST MODULE — strictly after every other module on the course,
       lesson and cue alike. */
    select count(*) into _n from module
     where course_id = _course and id <> _m and sort_order >= _sort;
    if _n <> 0 then
      raise exception
        '0159: % module(s) on % sort at or after the closer', _n, _row.cert_name;
    end if;

    /* exactly one published film, at module_order 1, as daily_craft */
    select count(*) into _n from content
     where module_id = _m and type = 'advisor_video'
       and status = 'published' and retired_at is null
       and module_order = 1 and placement = 'daily_craft'
       and title = _row.film_title;
    if _n <> 1 then
      raise exception
        '0159: % closer module holds % matching film(s) at module_order 1', _row.cert_name, _n;
    end if;

    /* ONE film and nothing else — a closer is one film, no quiz, no cue */
    select count(*) into _n from content
     where module_id = _m and status = 'published' and retired_at is null;
    if _n <> 1 then
      raise exception
        '0159: % closer module holds % published items; a closer is one film',
        _row.cert_name, _n;
    end if;

    select count(*) into _n from quiz_question
     where module_id = _m and status = 'published';
    if _n <> 0 then
      raise exception
        '0159: % closer module carries % published question(s); a closer has no quiz',
        _row.cert_name, _n;
    end if;

    /* no duplicate sort_order anywhere on the course */
    select count(*) into _n from (
      select sort_order from module where course_id = _course
      group by sort_order having count(*) > 1
    ) dup;
    if _n <> 0 then
      raise exception '0159: % has % duplicated module sort_order(s)', _row.cert_name, _n;
    end if;
  end loop;

  /* ---- C1. MENUS IS HELD, AND THE SCHEMA SAYS SO ------------------------- */
  select co.id into _course
    from certification c
    join certification_course cc on cc.certification_id = c.id
    join course co on co.id = cc.course_id
   where c.name = 'Menus' and co.name = 'Menus';

  select count(*) into _n from module where course_id = _course;
  if _n <> 9 then
    raise exception
      '0159: Menus has % modules, expected the 9 that 0144 left — Menus is HELD here', _n;
  end if;

  select count(*) into _n from content
   where title = 'Menus — Closer' and status = 'published' and retired_at is null
     and module_id is null;
  if _n <> 1 then
    raise exception
      '0159: "Menus — Closer" must stay unattached pending Ryan''s ruling on three closers (found % unattached)',
      _n;
  end if;

  /* ---- D1. the three Walk-Around attaches, and module 7 still filmless --- */
  select co.id into _course
    from certification c
    join certification_course cc on cc.certification_id = c.id
    join course co on co.id = cc.course_id
   where c.name = 'Walk Around' and co.name = 'The Walk-Around';

  for _row in
    select * from (values
      ('4. Raising a Problem Well', '30 Second Walk-Around, Part 2, Four Goals, Two Words'),
      ('5. Tires on the Drive',     '30 Second Walk-Around, Part 5, Step 4, Wheels to the Left'),
      ('6. Visibility and Wipers',  '30 Second Walk-Around, Part 6, Step 5, Washer Fluid')
    ) as t(module_name, film_title)
  loop
    select count(*) into _n from content ct
      join module m on m.id = ct.module_id
     where m.course_id = _course and m.name = _row.module_name
       and ct.title = _row.film_title and ct.type = 'advisor_video'
       and ct.status = 'published' and ct.retired_at is null
       and ct.module_order = 1 and ct.placement = 'daily_craft';
    if _n <> 1 then
      raise exception
        '0159: Walk Around "%" does not hold "%" at module_order 1',
        _row.module_name, _row.film_title;
    end if;
  end loop;

  /* Module 7 is owed, not forgotten — if a film ever lands here silently, this
     fails and somebody reads the sentence. */
  select count(*) into _n from content ct
    join module m on m.id = ct.module_id
   where m.course_id = _course and m.name = '7. The Handback'
     and ct.type = 'advisor_video' and ct.status = 'published'
     and ct.retired_at is null;
  if _n <> 0 then
    raise exception
      '0159: Walk Around module 7 (The Handback) holds % film(s); 0159 expects it filmless — Mitch owes it', _n;
  end if;

  /* Walk Around keeps its seven modules at 1..7 — nothing here moved one. */
  select count(*) into _n from module where course_id = _course;
  if _n <> 7 then
    raise exception '0159: Walk Around has % modules, expected 7', _n;
  end if;
  select count(*) into _n from module
   where course_id = _course and sort_order between 1 and 7;
  if _n <> 7 then
    raise exception '0159: Walk Around modules no longer occupy sort_order 1..7';
  end if;

  /* ---- E. NO ROW AN ADVISOR EARNED WAS TOUCHED -------------------------- */
  select count(*) into _n from module_completion;
  if _n <> _completions_before then
    raise exception
      '0159: module_completion moved from % to % rows', _completions_before, _n;
  end if;

  raise notice
    '0159: 5 openers set, 5 closer modules built, 3 Walk-Around films attached; '
    'Menus held at 9 modules; Walk Around module 7 still filmless; '
    'module_completion unchanged at %', _completions_before;
end
$$;

/*
 * item_count and active come out of the function. Run as postgres here, which
 * proves nothing about the PostgREST path (pg_safeupdate) — the acceptance run
 * calls it over PostgREST as the service role, the way the application does.
 */
select recompute_certification_content();

/*
 * THE FUNCTION'S ANSWER, CHECKED — NOT WRITTEN.
 *
 * Every track this migration touched GAINED items: five closers at +1 each and
 * Walk Around at +3. So no core track can lose `active`, and the five closer
 * tracks must each read exactly one more item than before. Checking the
 * function's answer rather than writing one is the rule 0144 set.
 */
do $$
declare
  _n int;
begin
  /* Only assert where the build happened. An empty local skipped it and owes
     nothing — but a database that DID build must not reach here unasserted. */
  if not exists (
    select 1 from certification c
      join content ct on ct.id = c.entry_film_content_id
     where c.name = 'Setting up the MPI' and ct.title = 'Setting up the MPI — Opener'
  ) then
    raise notice '0159: build was skipped on this database — activation not asserted';
    return;
  end if;

  /* all nine core tracks active, by computation */
  select count(*) into _n from certification where is_core and active;
  if _n <> 9 then
    raise exception
      '0159: % of 9 core tracks are active after recompute — a track lost its credential', _n;
  end if;

  /* and the bar is cleared with room: every track this migration touched */
  select count(*) into _n from certification
   where is_core and active
     and name in ('Walk Around','Setting up the MPI','Four Step Close',
                  'Success Cycle','Lasting Impressions','Name Tag');
  if _n <> 6 then
    raise exception '0159: % of the 6 touched tracks are active', _n;
  end if;

  /* item_count agrees with the rule, independently recomputed, on the six */
  select count(*) into _n
    from certification c
   where c.is_core
     and c.name in ('Walk Around','Setting up the MPI','Four Step Close',
                    'Success Cycle','Lasting Impressions','Name Tag')
     and c.item_count <> (
       select count(*)::int
         from certification_course cc
         join module m on m.course_id = cc.course_id
         join content ct on ct.module_id = m.id
        where cc.certification_id = c.id and ct.status = 'published'
     );
  if _n <> 0 then
    raise exception
      '0159: stored item_count disagrees with the rule on % track(s)', _n;
  end if;

  raise notice '0159: nine core tracks active by computation; item_count agrees with the rule';
end
$$;
