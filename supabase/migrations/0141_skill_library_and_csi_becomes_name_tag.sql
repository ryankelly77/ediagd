/* ===========================================================================
   0141 — THE SKILL LIBRARY, AND CSI BECOMES NAME TAG
   ===========================================================================

   Two things, in this order, because the second needs the first: destination 3
   has to exist before anything can be put into it.

   ---------------------------------------------------------------------------
   PART ONE — THE SKILL LIBRARY IS A STATE, NOT AN ABSENCE
   ---------------------------------------------------------------------------

   The problem it solves is the one `05 - Held` solved in the Drop Zone, one layer
   up. An unattached film and an un-triaged film are **indistinguishable on disk
   and in the database**: both have `module_id = null`. So "undecided" has never
   had a destination, and undecided content accumulates in the only place it can,
   which is nowhere. 100 craft films and 485 quiz questions currently sit in that
   non-place.

   So membership is made explicit rather than inferred from absence:

     content.library_reason       non-null  =>  deliberately in the skill library
     quiz_question.status         gains 'library' as a third state
     quiz_question.library_reason the open question, and it is REQUIRED

   `quiz_question.status` was CHECK (draft|published). A question is now in exactly
   one of three states — awaiting publication, serving, or parked with a named
   question — and the unsafe state cannot be represented: the CHECK below refuses
   `status='library'` with no reason. That is the difference between a destination
   and a shrug.

   WHY NOT REUSE `reference`. The mileage shelf is keyed to `mileage_rung`, and
   `lib/mileage.ts` filters `mileage_rung is not null`, so a craft film given
   `placement='reference'` would be invisible to the shelf AND excluded from the
   loop by `service_family_content` — the worst of both, which is 0128's NULL hole
   exactly. A craft film has no mileage. The library is a different axis.

   WHAT THE LIBRARY DOES NOT DO, deliberately: it certifies nothing, costs no days,
   and is pulled rather than pushed. Nothing here grants it a surface — no screen
   reads `library_reason` yet. A row in the library is parked, not published, and
   promoting one into a track later is an UPDATE, not a re-ingest: the film keeps
   its Mux asset, its canonical name and its content row.

   ---------------------------------------------------------------------------
   PART TWO — CSI IS NOW NAME TAG. RYAN'S RULING.
   ---------------------------------------------------------------------------

   The CSI certification is core, active=false, and holds no films, no cues, no
   course and no modules. Mitch called CSI "the first cousin to Name Tag", and his
   own quiz bank names CSI parts with Name Tag film titles. So the empty track
   becomes the home of the ten published Name Tag films.

   BUT THE QUIZ BANK DESCRIBES A DIFFERENT CURRICULUM, and this is the part that
   would have gone wrong on a title match. Compared by CONTENT, not by part number:

     Name Tag films   the literal name tag — dealership name, brand, title, your
                      name — plus framing, advice, listening, ownership
     CSI quiz         the customer visit — the phone as first impression, upon
                      arrival, dissuade them from waiting, Duke's Steakhouse,
                      fall on the sword, upon departure, survey talk

   Only TWO of twelve CSI parts match a Name Tag film:

     CSI Part 3  "Why They Come Here"  ->  Name Tag Part 1  "Why do they come here?"
     CSI Part 6  "Active Listening"    ->  Name Tag Part 9  "Active listening"

   That is 7 questions of 41. Attaching the other 34 by part number would have put
   customer-visit questions onto name-tag modules and looked entirely correct —
   the same trap that Four Step Close sprang in 0140, where parts 1-9 agreed and
   everything after diverged by one.

   Ryan's ruling on the 34: **the CSI outline is replaced by Name Tag, and the
   questions are kept rather than retired — they may serve a Master track or
   continuing education later.** So they go to the library with that as their named
   open question. Kept, not deleted, not retired, and not attached.

   The 7 that match are joined to their film by `content_id` and left without a
   `module_id`. The part numbers disagree (CSI 3 against Name Tag 1), and a
   content match across two differently-numbered curricula is weaker evidence than
   the film-level fact. Whether a question authored as "CSI Part 3" belongs in the
   module for "Name Tag Part 1" is Mitch's call, not an inference.

   ---------------------------------------------------------------------------
   TEN MODULES MAKES THIS THE LARGEST TRACK IN THE CREDENTIAL
   ---------------------------------------------------------------------------

   Current maximum is 7 — Walk Around, Menus, Success Cycle, Power of Positive
   Language. Nothing in the schema enforces a cap; checked every constraint on
   `certification`, `course` and `module`. Ryan holds a policy of six per Basic
   track with Master taking the overflow, and splitting one series across two
   tracks is a thing this schema has never done — so it is NOT done here. All ten
   land on one track and the split waits for the span question to be answered
   rather than guessed at.
   =========================================================================== */

/* ================= PART ONE — BUILD DESTINATION 3 ======================== */

alter table content add column if not exists library_reason text;

comment on column content.library_reason is
  'Non-null means this row is deliberately in the skill library: named, published, '
  'reachable by pull, certifying nothing and costing no days, with the open '
  'question recorded here. NULL means the row is routed normally — it does NOT '
  'mean "unplaced". An unattached film with a NULL reason has not been triaged.';

alter table quiz_question add column if not exists library_reason text;

comment on column quiz_question.library_reason is
  'Why this question is parked. Required when status = ''library''.';

do $$
begin
  /*
   * status gains a third value. The old CHECK allowed draft|published only, so a
   * parked question had to pretend to be a draft — which is how 485 questions
   * became indistinguishable from work in progress.
   */
  alter table quiz_question drop constraint if exists quiz_question_status_check;
  alter table quiz_question add constraint quiz_question_status_check
    check (status = any (array['draft','published','library']));

  /*
   * AND THE REASON IS MANDATORY FOR THE LIBRARY STATE.
   *
   * Without this the library is a value a row can take with nothing recorded, and
   * an exclusion by value is only as strong as the guarantee the value is written.
   * With it, a question cannot BE in the library without saying why it is there.
   */
  alter table quiz_question drop constraint if exists quiz_question_library_reason_shape;
  alter table quiz_question add constraint quiz_question_library_reason_shape
    check (status <> 'library' or library_reason is not null);
end
$$;

/*
 * ONE PLACE TO ASK "WHAT IS PARKED" — so the unplaced count is measurable rather
 * than reconstructed by whoever next wonders. security_invoker so it cannot
 * become another definer view nobody audited.
 */
create or replace view skill_library
with (security_invoker = on) as
  select 'film'::text as kind, c.id, c.title, c.collection,
         c.duration_sec, c.library_reason as reason
    from content c
   where c.library_reason is not null and c.retired_at is null
  union all
  select 'quiz'::text, q.id, coalesce(q.film, q.deck), q.deck,
         null::int, q.library_reason
    from quiz_question q
   where q.status = 'library';

comment on view skill_library is
  'Destination 3. Everything deliberately parked, with the question that would '
  'release it. An empty result means nothing is waiting on a ruling — not that '
  'nothing is unplaced; see module_id for that.';

/* ================= PART TWO — CSI BECOMES NAME TAG ======================= */

do $$
declare
  _cert uuid;
  _course uuid;
  _m uuid;
  _f uuid;
  _n int;
  _attached int := 0;
  r record;
begin
  select id into _cert from certification where name = 'CSI';
  if _cert is null then
    select id into _cert from certification where slug = 'craft-name-tag';
  end if;
  if _cert is null then
    raise notice '0141: no CSI certification and no craft-name-tag — nothing to switch';
    return;
  end if;

  select count(*) into _n from content
   where type='advisor_video' and status='published' and retired_at is null
     and title ~ '^Name Tag, Part [0-9]+$';
  if _n = 0 then
    raise notice '0141: the Name Tag films are not present — nothing to attach';
    return;
  end if;
  if _n <> 10 then
    raise exception '0141: expected 10 Name Tag films, found % — refusing to attach a subset', _n;
  end if;

  /*
   * REFUSE IF THE TRACK ALREADY HOLDS ANYTHING. CSI was verified empty — no
   * course, no modules, no films, no cues — and that emptiness is why a rename is
   * safe rather than destructive. If something has appeared since, stop: a
   * cascade delete is not a retire and this migration must not become one.
   */
  select count(*) into _n
    from certification_course cc
    join course co on co.id = cc.course_id
    join module m on m.course_id = co.id
   where cc.certification_id = _cert;

  /*
   * ALREADY DONE IS NOT THE SAME AS OCCUPIED, and the first version of this guard
   * could not tell them apart. It raised '0141: the track already has 10
   * module(s)' on its own second run — correct outcome, unreplayable migration,
   * which is precisely the fault 0137 had and 0129 before it. `supabase db reset
   * --local` replays the whole chain, so a migration that refuses itself breaks
   * every later one.
   *
   * The distinction is whether the ten modules are THE TEN THIS MIGRATION MAKES.
   * If they are, the work is done and this returns quietly. Anything else on that
   * track is genuinely occupied ground and still refuses — a cascade delete is not
   * a retire, and renaming onto somebody else's modules would be one.
   */
  if _n > 0 then
    select count(*) into _n
      from certification_course cc
      join course co on co.id = cc.course_id
      join module m on m.course_id = co.id
      join content ct on ct.module_id = m.id
     where cc.certification_id = _cert
       and co.slug = 'name-tag'
       and ct.title ~ '^Name Tag, Part [0-9]+$';
    if _n = 10 then
      raise notice '0141: the ten Name Tag films are already attached — nothing to switch';
      return;
    end if;
    raise exception
      '0141: the track holds modules that are not this migration''s ten (% Name Tag films found) — refusing to rename onto occupied ground', _n;
  end if;

  update certification
     set name = 'Name Tag', slug = 'craft-name-tag', updated_at = now()
   where id = _cert;

  insert into course (name, slug, track, description, sort_order)
  values ('Name Tag', 'name-tag', 'Craft',
          'What is on your name tag and why the customer is really here. Ten lessons.',
          910)
  on conflict (slug) do nothing;
  select id into _course from course where slug = 'name-tag';

  insert into certification_course (certification_id, course_id, sort)
  values (_cert, _course, 1)
  on conflict do nothing;

  for r in select n from generate_series(1,10) as n loop
    select id into _m from module where course_id = _course and sort_order = r.n;
    if _m is null then
      insert into module (course_id, name, sort_order)
      values (_course, 'Part ' || r.n, r.n) returning id into _m;
    end if;

    select id into _f from content
     where type='advisor_video' and status='published' and retired_at is null
       and title = 'Name Tag, Part ' || r.n;
    if _f is null then
      raise exception '0141: no published film titled Name Tag, Part %', r.n;
    end if;

    /* The film first in its module — the lesson is the teaching, cues reinforce. */
    update content set module_id = _m, module_order = 1,
                       placement = 'daily_craft', updated_at = now()
     where id = _f;
    _attached := _attached + 1;
  end loop;

  if _attached <> 10 then
    raise exception '0141: attached % films, expected 10', _attached;
  end if;

  /* ---- the 41 questions now belong to this track ------------------------ */
  update quiz_question set deck = 'Name Tag', updated_at = now()
   where deck = 'CSI';

  /* The two that match a film by content get the film-level fact, no module. */
  update quiz_question q
     set content_id = c.id, updated_at = now()
    from content c
   where q.source_id like 'SCMQB:CSI:P3:%' and c.title = 'Name Tag, Part 1'
     and c.type='advisor_video' and c.status='published' and c.retired_at is null;
  update quiz_question q
     set content_id = c.id, updated_at = now()
    from content c
   where q.source_id like 'SCMQB:CSI:P6:%' and c.title = 'Name Tag, Part 9'
     and c.type='advisor_video' and c.status='published' and c.retired_at is null;

  /* ---- and the other 34 go to the library, kept -------------------------- */
  update quiz_question
     set status = 'library',
         library_reason =
           'Authored against the CSI outline, which Ryan replaced with Name Tag on '
           '2026-09-29. The lesson this question examines has no film: compared by '
           'content rather than part number, only CSI Part 3 (Why They Come Here) '
           'and Part 6 (Active Listening) match a Name Tag film. KEPT, not '
           'retired — candidate for a Master track or continuing education. '
           'Releasing it needs Mitch to say whether the CSI lesson will be shot.',
         updated_at = now()
   where source_id like 'SCMQB:CSI:%' and content_id is null;
  get diagnostics _n = row_count;
  if _n <> 34 then
    raise exception '0141: sent % questions to the library, expected 34', _n;
  end if;

  /* ================= ASSERT, BOTH DIRECTIONS ============================ */

  select count(*) into _n from certification
   where id = _cert and name = 'Name Tag' and is_core and not is_master_track;
  if _n <> 1 then
    raise exception '0141: the certification is not a core track named Name Tag';
  end if;

  select count(*) into _n from content
   where type='advisor_video' and retired_at is null
     and title ~ '^Name Tag, Part [0-9]+$' and module_id is not null
     and placement = 'daily_craft';
  if _n <> 10 then
    raise exception '0141: % of 10 Name Tag films are attached as daily_craft', _n;
  end if;

  /* The positive half: the questions that stayed are exactly the 7 with a film. */
  select count(*) into _n from quiz_question
   where source_id like 'SCMQB:CSI:%' and status = 'draft' and content_id is not null;
  if _n <> 7 then
    raise exception '0141: % CSI questions remain attached to a film, expected 7', _n;
  end if;

  /* Nothing is routed to a module. Mitch has not mapped CSI parts onto Name Tag. */
  select count(*) into _n from quiz_question
   where source_id like 'SCMQB:CSI:%' and module_id is not null;
  if _n <> 0 then
    raise exception '0141: % CSI question(s) carry a module_id — that mapping is Mitch''s', _n;
  end if;

  /* And every library row carries its reason — the constraint, exercised. */
  select count(*) into _n from quiz_question
   where status = 'library' and library_reason is null;
  if _n <> 0 then
    raise exception '0141: % library question(s) have no reason', _n;
  end if;

  raise notice '0141: CSI -> Name Tag; 10 films attached as 10 modules; 7 questions keep a film, 34 in the library';
end
$$;

/* item_count and active are derived, not asserted — same statement 0116 uses. */
select recompute_certification_content();
