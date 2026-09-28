/* ===========================================================================
   0137 — THE SPEECH SERIES GOES LIVE, AND TWO MINDSET RESHOOTS CLOSE
   ===========================================================================

   PART ONE. Nine films, "Get the Hell Out of Here" — the speech that sets up a
   multi-point inspection. Published and attached to nothing, per Ryan's ruling
   that naming is not routing: a film waiting on a routing decision waits in the
   catalog, not in a folder. The track is Mitch's call; `reports/unhomed-series-
   for-mitch.md` puts it beside Name Tag and Selling Skills, and notes that a core
   track literally called "Setting up the MPI" is sitting at two films and
   inactive.

   PART TWO. Three MINDSET reshoots, and the reason only two need help here.

   ---------------------------------------------------------------------------
   THE SAME EXPOSURE, MEASURED ON A THREE-FILE BATCH
   ---------------------------------------------------------------------------

   The dry run for those three reported:

     REPLACE  All for One and One for All Versus Every Man for Himself   v1 -> v2
     new      Success Is a Choice
     new      Tomorrow Me vs. Today Me

   All three are reshoots of live films with the same title. The first was seen as
   a reshoot and replaced in place; the other two were not — because their live
   rows are named `MINDSET — Success Is a Choice — v1.mov` and `MINDSET — Tomorrow
   Me vs. Today Me — v1.mov`, with NO voice in the filename, while `All for One`
   carries `(Mitch Hardt)`. identityOf() includes the voice, so two of three
   collapsed into "new" and would have left the catalog holding both takes.

   Two out of three, in a batch of three. The population figure is 84 of 321 live
   films with no parenthesised voice; this is what that number does in practice.
   The key change and its tests are on the 2 October list.

   ---------------------------------------------------------------------------
   WHY THESE THREE WERE RESHOOTS AND NOT DIFFERENT FILMS
   ---------------------------------------------------------------------------

   Duration alone said otherwise, and duration alone would have been wrong. The
   incoming takes are much LONGER — Success Is a Choice goes 32s to 110s, which is
   3.4x and looks exactly like the SRP-038 trap (On the Drive 320s versus On the
   Drive, Part 1 at 88s are different films, not two takes).

   So the transcripts were compared rather than the lengths:

     All for One    179 -> 207 words   same Dumas quote, reworked for the drive
     Success        71 -> 255 words    same quote, now credited and built out
     Tomorrow Me    104 -> 186 words   same quote, made concrete on the service floor

   Every one covers the same lesson at greater length. Ryan's guard is against a
   replacement that DROPS content; none of these drop anything, so the guard does
   not fire. Had the comparison been made on duration it would have refused all
   three, and refusing in the cautious direction is the failure mode that survives
   review because it wears the costume of care.

   And the audio, which is what decides under the standing rule:

     All for One   live 24.4% muffled, worst -59.0 dB   ->  reshoot 0.0%
     Success       live  4.0% muffled, worst -49.2 dB   ->  reshoot 0.0%
     Tomorrow Me   live 14.2% muffled, worst -61.2 dB   ->  reshoot 0.0%

   Success Is a Choice is the honest one to flag: at 1.2s muffled and a -25.3 dB
   median it is the brightest film measured anywhere in the library, so "cleaner"
   there is a marginal call on a film that was not broken. It is recorded in the
   retire reason so nobody later reads a 4.0% as a fault.
   =========================================================================== */

do $$
declare
  _speech text[] := array[
    'CRAFT — Get the Hell Out of Here, Part 1 (Mitch Hardt) — v1.mov',
    'CRAFT — Get the Hell Out of Here, Part 2 (Mitch Hardt) — v1.mov',
    'CRAFT — Get the Hell Out of Here, Part 3 (Mitch Hardt) — v1.mov',
    'CRAFT — Get the Hell Out of Here, Part 4 (Mitch Hardt) — v1.mov',
    'CRAFT — Get the Hell Out of Here, Part 5 (Mitch Hardt) — v1.mov',
    'CRAFT — Get the Hell Out of Here, Part 6 (Mitch Hardt) — v1.mov',
    'CRAFT — Get the Hell Out of Here, Part 7 (Mitch Hardt) — v1.mov',
    'CRAFT — Get the Hell Out of Here, Part 8 (Mitch Hardt) — v1.mov',
    'CRAFT — Get the Hell Out of Here, Part 9 (Mitch Hardt) — v1.mov'
  ];
  _v2 text[] := array[
    'MINDSET — Success Is a Choice (Mitch Hardt) — v2.mov',
    'MINDSET — Tomorrow Me vs. Today Me (Mitch Hardt) — v2.mov'
  ];
  _n int;
  _ready int;
begin
  /* ---- 0. IS THIS THE DATABASE THIS MIGRATION IS ABOUT? ----------------- */
  select count(*) into _n from content
   where type = 'advisor_video' and canonical_filename = any(_speech || _v2);
  if _n = 0 then
    raise notice '0137: none of the eleven films are present — nothing to do';
    return;
  end if;
  if _n <> 11 then
    raise exception '0137: expected 11 films, found % — refusing rather than acting on a subset', _n;
  end if;

  /* ---- 1. NOTHING GOES LIVE POINTING AT NOTHING ------------------------- */
  select count(*) into _ready from content
   where canonical_filename = any(_speech || _v2)
     and mux_playback_id is not null and duration_sec is not null;
  if _ready <> 11 then
    raise exception '0137: only % of 11 have a playback id and duration — Mux is not finished', _ready;
  end if;

  /* ---- 2. PUBLISH ALL ELEVEN -------------------------------------------- */
  update content set status = 'published', updated_at = now()
   where canonical_filename = any(_speech || _v2)
     and status = 'draft' and retired_at is null;
  get diagnostics _n = row_count;
  raise notice '0137: published % row(s)', _n;

  /* ---- 3. RETIRE THE TWO SUPERSEDED TAKES -------------------------------
   *
   * Only AFTER the v2s are confirmed published. Retiring first would leave the
   * quote absent from slot 1 entirely if anything above had failed.
   *
   * EACH RETIRE IS GUARDED ON THE ROW STILL BEING LIVE, and the first version of
   * this migration was not. It asserted `updated = 1` unconditionally, so the
   * second run — with both v1s already retired — raised `expected to retire 1,
   * updated 0` and failed. Correct outcome, unreplayable migration: exactly the
   * fault 0129 had, where a query could not tell "nothing to do" from "the wrong
   * number of things to do". Caught by re-running it, which is the only way this
   * class ever gets caught.
   */
  select count(*) into _n from content
   where canonical_filename = any(_v2) and status = 'published' and retired_at is null;
  if _n <> 2 then
    raise exception '0137: the two v2 reshoots are not both live — refusing to retire their v1s';
  end if;

  update content
     set retired_at = now(),
         retired_reason =
           'Superseded by MINDSET — Success Is a Choice (Mitch Hardt) — v2. Reshoot '
           'decided on the audio profile: this take is 1.2s muffled (4.0%), worst '
           '-49.2 dB; the v2 is 0.0s. NOTE the margin is small — at a -25.3 dB HF '
           'median this was the brightest film measured in the library, so it was '
           'not a broken film. The v2 also expands the lesson from 71 to 255 words '
           'and credits the source, so nothing is lost. The ingest did NOT see this '
           'as a replacement: identityOf() includes the voice and this filename '
           'carries none. Retired by 0137; master stays in 02 - Published.',
         updated_at = now()
   where canonical_filename = 'MINDSET — Success Is a Choice — v1.mov'
     and retired_at is null;
  get diagnostics _n = row_count;
  if _n = 0 then
    select count(*) into _n from content
     where canonical_filename = 'MINDSET — Success Is a Choice — v1.mov' and retired_at is not null;
    if _n = 1 then
      raise notice '0137: Success Is a Choice v1 was already retired';
    else
      raise exception '0137: Success Is a Choice v1 is neither live nor retired — expected exactly one row';
    end if;
  elsif _n <> 1 then
    raise exception '0137: expected to retire 1 Success Is a Choice v1, updated %', _n;
  end if;

  update content
     set retired_at = now(),
         retired_reason =
           'Superseded by MINDSET — Tomorrow Me vs. Today Me (Mitch Hardt) — v2. '
           'Reshoot decided on the audio profile: this take is 7.0s muffled (14.2%), '
           'worst -61.2 dB; the v2 is 0.0s muffled, worst -42.5 dB. The v2 expands '
           'the lesson from 104 to 186 words and sets it on the service floor, so '
           'the extra length adds content rather than re-cutting it. The ingest did '
           'NOT see this as a replacement: identityOf() includes the voice and this '
           'filename carries none. Retired by 0137; master stays in 02 - Published.',
         updated_at = now()
   where canonical_filename = 'MINDSET — Tomorrow Me vs. Today Me — v1.mov'
     and retired_at is null;
  get diagnostics _n = row_count;
  if _n = 0 then
    select count(*) into _n from content
     where canonical_filename = 'MINDSET — Tomorrow Me vs. Today Me — v1.mov' and retired_at is not null;
    if _n = 1 then
      raise notice '0137: Tomorrow Me v1 was already retired';
    else
      raise exception '0137: Tomorrow Me v1 is neither live nor retired — expected exactly one row';
    end if;
  elsif _n <> 1 then
    raise exception '0137: expected to retire 1 Tomorrow Me v1, updated %', _n;
  end if;

  /* ---- 4. ASSERT BOTH HALVES -------------------------------------------- */

  select count(*) into _n from content
   where canonical_filename = any(_speech)
     and status = 'published' and retired_at is null;
  if _n <> 9 then
    raise exception '0137: % of the 9 speech films are live, expected 9', _n;
  end if;

  /*
   * EXACTLY ONE LIVE TAKE PER QUOTE. This is the assertion the whole migration
   * exists for — two live takes of one quote is the defect, and counting only the
   * v2s would be satisfied while both were still live.
   */
  select count(*) into _n from content
   where type = 'advisor_video' and collection = 'Mindset' and retired_at is null
     and (title ilike '%Success Is a Choice%' or title ilike '%Tomorrow Me%');
  if _n <> 2 then
    raise exception
      '0137: expected exactly 2 live films across the two quotes (one each), found %', _n;
  end if;

  /*
   * And slot 1 must still be able to serve them — pickMindset's own predicate,
   * not a proxy for it. A retire that made a quote unservable would satisfy every
   * count above.
   */
  select count(*) into _n from content
   where type = 'advisor_video' and placement = 'daily_lifestyle'
     and collection = 'Mindset' and status = 'published' and retired_at is null
     and mux_playback_id is not null
     and (title ilike '%Success Is a Choice%' or title ilike '%Tomorrow Me%');
  if _n <> 2 then
    raise exception '0137: only % of the 2 quotes are servable by slot 1', _n;
  end if;

  raise notice '0137: 9 speech films live and unattached; 2 mindset reshoots live, 2 v1s retired';
end
$$;
