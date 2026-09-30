/* ===========================================================================
   0145 — QUESTIONS MEET THEIR MODULES
   ===========================================================================

   Everything here is a join on content_id where one exists, because 0140 set it
   for exactly this reason: "which film is this question about" is a fact about
   the question, not a routing decision. The routing decisions were 0144's.

     Lasting Impressions   38 draft -> published, module via content_id
     Four Step Close       32 draft -> published, module via content_id
                            3 draft -> library (the workbook's Part 10, "Fit the
                              Close to the Customer" — NO film exists for it;
                              0140 recorded the divergence)
     Name Tag (CSI deck)    7 draft -> published onto the two Name Tag modules
                              whose films they describe (Ryan's ruling, 29 Sep:
                              CSI quiz Part 3 "Why They Come Here" examines
                              Name Tag, Part 1; quiz Part 6 "Active Listening"
                              examines Name Tag, Part 9 — 2 of 12 CSI parts
                              match Name Tag BY CONTENT and these are they).
                              The other 34 stay in library; 0141's reason holds.
     Overcoming Objections 10 draft: 7 -> published, 3 -> library.

   ---------------------------------------------------------------------------
   THE OVERCOMING OBJECTIONS DECK WAS COMPARED AGAINST THE TRANSCRIPTS
   ---------------------------------------------------------------------------

   These 10 carry no content_id, so before attaching, both films were
   transcribed (whisper small.en, 29 Sep) and every question compared:

     deck "Part 1" (5): all five examine the five root reasons film —
       "money equals value … outside influence equals talk up your product",
       "if left ignored", "never run down the competition" are the film's own
       phrases. Attached to "Overcoming Objections, Part 1".

     deck "Part 2" (5): two examine "How to Take a No" nearly verbatim —
       "never debate something the customer is looking at … how much light gets
       through those pleats" (rule 2) and "reward action moment … sometimes our
       history is incomplete" (rule 3). Attached to Part 2.

       THREE DESCRIBE NEITHER FILM and go to library, each with the reason:
       - "I can do it myself"      the DIY objection; neither film teaches it
       - "Can't you just blow it out?"  a filter-specific response that belongs
                                    with a Filters op-code deck
       - "Not today … pre-write packet"  opens with Part 2's claim but tests the
                                    deferred-to-pre-write teaching, which is the
                                    Pre-Write film's

   deck/film COLUMNS ARE NOT REWRITTEN. They record what the workbook said —
   the observed key. module_id and content_id carry the ruling.

   ---------------------------------------------------------------------------
   sort_order
   ---------------------------------------------------------------------------
   Lasting Impressions, Four Step Close and the CSI seven keep the workbook's
   qno. The Overcoming Objections deck arrived with sort_order 0 on all ten, so
   the attached seven are numbered here, keyed on question text — an all-zero
   order would render the quiz in whatever order the planner felt like.

   On an empty local database every population is absent and every step is a
   quiet no-op, same shape as 0144.
   =========================================================================== */

do $$
declare
  _n int;
  _film_p1 uuid;
  _film_p2 uuid;
  _q record;
begin
  /*
   * KEYED ON THE FILMS, NOT THE BANK. A fresh local now carries the 114
   * questions (0140 inserts them with content_id null there) but none of the
   * films — so "bank present" is true on a database where every join below
   * would match nothing. The films are what this migration routes through;
   * their absence is what makes it a no-op.
   */
  if not exists (select 1 from content
                  where title = 'Lasting Impressions, Part 1'
                    and type = 'advisor_video' and status = 'published'
                    and retired_at is null and module_id is not null) then
    raise notice '0145: the attached films are not present on this database — nothing to do';
    return;
  end if;

  /* IDEMPOTENT, 0140's way: all done is a quiet return, partly done refuses.
     The published population this migration produces is exactly 112. */
  select count(*) into _n from quiz_question where status = 'published';
  if _n = 112 then
    raise notice '0145: 112 already published — nothing to do';
    return;
  end if;
  if _n <> 28 then
    raise exception
      '0145: % questions published — neither the 28 this starts from nor the 112 it ends at; refusing a partial re-run', _n;
  end if;

  /* =========================================================================
     1 · LASTING IMPRESSIONS — 38, module via content_id
     ========================================================================= */
  update quiz_question q
     set module_id = c.module_id, status = 'published', updated_at = now()
    from content c
   where c.id = q.content_id
     and q.source_id like 'SCMQB:Lasting Impressions:%'
     and c.module_id is not null;
  get diagnostics _n = row_count;
  if _n <> 38 then
    raise exception '0145: Lasting Impressions attached % of 38', _n;
  end if;

  /* =========================================================================
     2 · FOUR STEP CLOSE — 32 attach, 3 library
     ========================================================================= */
  update quiz_question q
     set module_id = c.module_id, status = 'published', updated_at = now()
    from content c
   where c.id = q.content_id
     and q.source_id like 'SCMQB:4-Step Close:%'
     and c.module_id is not null;
  get diagnostics _n = row_count;
  if _n <> 32 then
    raise exception '0145: Four Step Close attached % of 32', _n;
  end if;

  update quiz_question
     set status = 'library',
         library_reason = 'The workbook''s Part 10, "Fit the Close to the '
           || 'Customer", has no film — the lesson these examine was never '
           || 'shot. 0140 recorded the numbering divergence; these wait for '
           || 'the missing lesson, not for routing.',
         updated_at = now()
   where source_id like 'SCMQB:4-Step Close:P10:%'
     and content_id is null;
  get diagnostics _n = row_count;
  if _n <> 3 then
    raise exception '0145: Fit the Close moved % of 3 to library', _n;
  end if;

  /* =========================================================================
     3 · THE CSI SEVEN — onto the Name Tag modules whose films they describe.
     content_id is set here because it is a fact this migration establishes:
     the question examines that film. Matched by film title, never by id.
     ========================================================================= */
  update quiz_question q
     set module_id = c.module_id, content_id = c.id,
         status = 'published', updated_at = now()
    from content c
   where c.title = 'Name Tag, Part 1' and c.type = 'advisor_video'
     and c.status = 'published' and c.retired_at is null
     and q.source_id like 'SCMQB:CSI:P3:%' and q.status = 'draft';
  get diagnostics _n = row_count;
  if _n <> 3 then
    raise exception '0145: CSI Part 3 attached % of 3 to Name Tag, Part 1', _n;
  end if;

  update quiz_question q
     set module_id = c.module_id, content_id = c.id,
         status = 'published', updated_at = now()
    from content c
   where c.title = 'Name Tag, Part 9' and c.type = 'advisor_video'
     and c.status = 'published' and c.retired_at is null
     and q.source_id like 'SCMQB:CSI:P6:%' and q.status = 'draft';
  get diagnostics _n = row_count;
  if _n <> 4 then
    raise exception '0145: CSI Part 6 attached % of 4 to Name Tag, Part 9', _n;
  end if;

  /* the other 34 CSI stay exactly where 0141 put them */
  select count(*) into _n from quiz_question
   where source_id like 'SCMQB:CSI:%' and status = 'library';
  if _n <> 34 then
    raise exception '0145: CSI library count is %, expected 34 untouched', _n;
  end if;

  /* =========================================================================
     4 · THE OVERCOMING OBJECTIONS DECK — 7 attach on transcript agreement,
         3 library with the reason. Keyed on question text: the deck has no
         content_id and sort_order 0 throughout, so text is the only stable key.
     ========================================================================= */
  select id into _film_p1 from content
   where title = 'Overcoming Objections, Part 1' and type = 'advisor_video'
     and status = 'published' and retired_at is null;
  select id into _film_p2 from content
   where title = 'Overcoming Objections, Part 2 — How to Take a No'
     and type = 'advisor_video' and status = 'published' and retired_at is null;
  if _film_p1 is null or _film_p2 is null then
    raise exception '0145: an Overcoming Objections film is missing';
  end if;

  for _q in
    select * from (values
      ('How many root reasons are there behind every objection?',        1, 1),
      ('What''s the right way to handle outside influence as an objection?', 1, 2),
      ('A customer says no but never tells you why. What does Part 1 teach about that?', 1, 3),
      ('True or False: ''Time equals urgency'' means telling the customer the service takes very little time.', 1, 4),
      ('True or False: The five reasons are op-code specific and change from service to service.', 1, 5),
      ('''It doesn''t look that bad to me.'' What should you do?',        2, 1),
      ('True or False: ''I just had that done'' is a moment to correct the customer''s memory.', 2, 2)
    ) as t(question, part, ord)
  loop
    update quiz_question q
       set content_id = case _q.part when 1 then _film_p1 else _film_p2 end,
           module_id  = c.module_id,
           sort_order = _q.ord,
           status     = 'published',
           updated_at = now()
      from content c
     where c.id = case _q.part when 1 then _film_p1 else _film_p2 end
       and q.deck = 'Overcoming Objections'
       and q.question = _q.question
       and q.status = 'draft';
    get diagnostics _n = row_count;
    if _n <> 1 then
      raise exception '0145: OO deck question "%" matched % rows, expected 1',
        left(_q.question, 40), _n;
    end if;
  end loop;

  for _q in
    select * from (values
      ('A customer says ''I can do it myself.'' What''s the right response?',
       'Describes the DIY objection. Neither Overcoming Objections film teaches '
       || 'it — compared against both transcripts, 29 Sep 2026. Waits for a film '
       || 'that does.'),
      ('''Can''t you just blow it out?'' — what''s the honest answer?',
       'A filter-specific objection response — engine/cabin air media, not '
       || 'objection craft. Belongs with a Filters op-code deck; neither '
       || 'Overcoming Objections film mentions it. Compared 29 Sep 2026.'),
      ('True or False: ''Not today'' is your most common outcome, and handled well it becomes next visit''s pre-write packet.',
       'Opens with Part 2''s claim ("most of the time you''re not going to close '
       || 'it") but what it tests — deferred items feeding next visit''s '
       || 'pre-write packet — is the Pre-Write film''s teaching, absent from '
       || 'both Overcoming Objections transcripts. Compared 29 Sep 2026.')
    ) as t(question, reason)
  loop
    update quiz_question
       set status = 'library', library_reason = _q.reason, updated_at = now()
     where deck = 'Overcoming Objections'
       and question = _q.question
       and status = 'draft';
    get diagnostics _n = row_count;
    if _n <> 1 then
      raise exception '0145: OO library question "%" matched % rows, expected 1',
        left(_q.question, 40), _n;
    end if;
  end loop;

  /* ================= ASSERT, BOTH DIRECTIONS ============================== */

  /* every published question carries both ids — the whole bank, not the delta */
  select count(*) into _n from quiz_question
   where status = 'published' and (module_id is null or content_id is null);
  if _n <> 0 then
    raise exception '0145: % published question(s) missing module_id or content_id', _n;
  end if;

  /* the published population is exactly 28 + 38 + 32 + 7 + 7 = 112 */
  select count(*) into _n from quiz_question where status = 'published';
  if _n <> 112 then
    raise exception '0145: % published questions, expected 112', _n;
  end if;

  /* per-track module coverage: LI all 12, FSC all 10 lesson modules, Name Tag
     exactly 2, Walk Around still 7 */
  for _q in
    select * from (values
      ('Lasting Impressions', 12), ('The 4-Step Close', 10),
      ('Name Tag', 2), ('The Walk-Around', 7)
    ) as t(course_name, modules)
  loop
    select count(distinct m.id) into _n
      from quiz_question q join module m on m.id = q.module_id
      join course co on co.id = m.course_id
     where q.status = 'published' and co.name = _q.course_name;
    if _n <> _q.modules then
      raise exception '0145: % has published questions on % modules, expected %',
        _q.course_name, _n, _q.modules;
    end if;
  end loop;

  /* every attached question's module holds the film it examines — the join
     that would catch a content_id pointing one way and a module the other */
  select count(*) into _n
    from quiz_question q join content c on c.id = q.content_id
   where q.status = 'published' and c.module_id is distinct from q.module_id;
  if _n <> 0 then
    raise exception '0145: % published question(s) on a different module than their film', _n;
  end if;

  /* and no library question kept a module — parked means parked */
  select count(*) into _n from quiz_question
   where status = 'library' and module_id is not null;
  if _n <> 0 then
    raise exception '0145: % library question(s) still carry a module_id', _n;
  end if;

  /* quiz_question_public still exposes no correct column */
  select count(*) into _n from information_schema.columns
   where table_schema = 'public' and table_name = 'quiz_question_public'
     and column_name = 'correct';
  if _n <> 0 then
    raise exception '0145: quiz_question_public exposes correct';
  end if;

  raise notice '0145: 112 published (28 Walk Around, 38 Lasting Impressions, 32 Four Step Close, 7 Name Tag, 7 Overcoming Objections); 6 to library with reasons; 34 CSI untouched';
end
$$;
