/* ===========================================================================
   0134 — RETIRE "SELLING SPEECH", WHICH IS NOT A SELLING SPEECH
   ===========================================================================

   `CRAFT — Selling speech — v1.mov` is a muffled, untrimmed, misnamed second
   take of a film that already exists clean. Retired, not deleted, and not
   renamed: renaming it into MINDSET would give the library two copies of the
   same Alex Hormozi quote, one of them worse on every measure taken.

   ---------------------------------------------------------------------------
   THE SENTENCE THIS MIGRATION EXISTS TO WRITE DOWN
   ---------------------------------------------------------------------------

   Without it the next person to find a muffled "Selling speech" starts from
   nothing, because the only evidence that survived the first time was the audio:

     The content is Stay in a Great Mood (Alex Hormozi). The clean master is
     MINDSET — Stay in a Great Mood (Alex Hormozi) — v1. The original camera
     file is IMG_2294.MOV.

   How each part was established, since a claim like that is worth no more than
   its provenance:

     content     the first 40s transcribed off the published master match the
                 Hormozi quote verbatim; the title matches nothing in it
     clean take  MINDSET — Stay in a Great Mood (Alex Hormozi) — v1 is the same
                 quote, slated, 131.7s, HF median -30.5 dB, 0.0s muffled. This
                 row is 143.2s, HF median -43.9 dB, 42.4s muffled (29.6%). The
                 18s difference is the spoken slate, which the trim removes from
                 the clean take and which this one never had.
     camera file reports/dropzone-rename-plan.json names IMG_2294.MOV at 143.2s
                 with a transcript matching this film's opening verbatim. No
                 provenance column holds it: mux_upload.draft already recorded
                 `source_filename: FND — Selling speech — v1.MOV`, so the file
                 was renamed by hand before it ever entered the pipeline.

   And the rename bypassed a hold that had already refused it. The same plan file
   carries, for IMG_2294: action `hold`, reason "two films proposed for this same
   name; one is misread". The hold was right. Nothing recorded that it was
   overridden. That is the twelfth standing rule, and it is why this comment is
   long.

   ---------------------------------------------------------------------------
   retired_reason IS ADDED HERE BECAUSE THERE WAS NOWHERE TO PUT THE SENTENCE
   ---------------------------------------------------------------------------

   `content` has `retired_at` and nothing else. So 0129 and 0130 retired eleven
   films whose reasons exist only in their migration comments — recoverable from
   git by somebody who knows to look there, and invisible to anybody reading the
   row. A retire that does not say why is the same shape as the hold that left no
   trace: the decision survives, the reasoning does not.

   Nullable, no default, no backfill. The eleven earlier retires still read null
   and the text for them is in 0129 and 0130 if Ryan wants it written across.

   ---------------------------------------------------------------------------
   WHAT WAS COUNTED BEFORE RETIRING, AND WHY THE ANSWER WAS NOT ZERO
   ---------------------------------------------------------------------------

   The expectation was zero views — collection is 'Craft', slot 1 filters on
   collection 'Mindset', and it is attached to no module. It was not zero.
   Counted across all 21 FK columns referencing `content`, derived from
   pg_constraint rather than from a list, so a table nobody remembered is counted
   too:

     content_progress                     2   neither completed
     daily_completion.video_content_id     3   served as slot 1, 09-09 and 09-15
     daily_completion.pitch_video_content_id 1 served as slot 2, 09-10
     watch_gate                            4   watched 90.0, 90.1, 98.7, 98.7 %
     mux_upload                            1   the upload record
                                         ---
                                          11 rows, 2 people

   Both people hold admin/advisor/manager on one rooftop, so this reached the two
   internal accounts and no pilot advisor. Four genuine views, not accidental
   opens.

   IT IS ALREADY UNREACHABLE, WHICH IS WHY RETIRING IT IS SAFE AND ALSO WHY THE
   COUNT MATTERED. All three slots refuse it today, and each was checked rather
   than assumed:

     slot 1  pickMindset filters .eq("collection", "Mindset"); this is 'Craft'
     slot 2  pickPitch resolves through service_family_content, where this film
             has 0 rows — it has no service_family and no op_code
     slot 3  module_id is null

   The slot 1 filter landed on 2026-09-19 (245c1c9). Every view above predates
   it, when slot 1 filtered on `placement = 'daily_lifestyle'` alone — which this
   film has. So the film was served as a mindset film on three mornings, that
   commit closed the class, and this migration closes the instance. Retiring it
   is therefore belt and braces rather than the fix; the fix already shipped.

   Nothing cascades. `retired_at` is a flag, not a delete, and the eleven rows
   above are left exactly as they are — an advisor who watched it on 9 September
   did watch it, and a ledger that rewrites itself is worth less than one that
   records something awkward.
   =========================================================================== */

alter table content add column if not exists retired_reason text;

comment on column content.retired_reason is
  'Why the row was retired, written at the moment of retiring. Null on rows '
  'retired before 0134, whose reasons are in their own migration comments. A '
  'retire without a reason is a decision whose reasoning did not survive it.';

do $$
declare
  _id uuid;
  _n int;
  _clean uuid;
begin
  /*
   * A fresh local database seeds neither film, and 0129's first version refused
   * on exactly that — it could not tell "nothing to do" from "the wrong number
   * of things to do". Count first, return quietly at zero, so
   * `supabase db reset --local` keeps replaying the whole chain.
   */
  select id into _id from content
   where type = 'advisor_video'
     and title = 'Selling speech'
     and source_filename = 'FND — Selling speech — v1.MOV'
     and retired_at is null;

  if _id is null then
    raise notice '0134: no live "Selling speech" row — nothing to retire';
    return;
  end if;

  /*
   * THE CLEAN TAKE MUST EXIST BEFORE THIS ONE GOES.
   *
   * The whole justification for retiring rather than renaming is that the
   * content survives elsewhere. If that film is absent, retiring this row
   * removes the Hormozi quote from the library altogether and the reason
   * sentence points at nothing — so refuse rather than proceed on a premise
   * that has stopped being true.
   */
  select id into _clean from content
   where type = 'advisor_video'
     and canonical_filename = 'MINDSET — Stay in a Great Mood (Alex Hormozi) — v1.mov'
     and status = 'published'
     and retired_at is null;

  if _clean is null then
    raise exception
      '0134: refusing — the clean take (MINDSET — Stay in a Great Mood (Alex Hormozi) — v1) is not live, so retiring this row would remove the quote entirely';
  end if;

  update content
     set retired_at = now(),
         retired_reason =
           'Not a selling speech. The content is Stay in a Great Mood (Alex Hormozi). '
           'The clean master is MINDSET — Stay in a Great Mood (Alex Hormozi) — v1 '
           '(131.7s, slated, 0.0s muffled); this is an untrimmed second take '
           '(143.2s, 42.4s muffled, worst -64.4 dB at 1:44). The original camera '
           'file is IMG_2294.MOV, which reports/dropzone-rename-plan.json had '
           'held — "two films proposed for this same name; one is misread" — '
           'before it was renamed by hand and uploaded. Retired by 0134; do not '
           'reshoot it.',
         updated_at = now()
   where id = _id;

  get diagnostics _n = row_count;
  if _n <> 1 then
    raise exception '0134 expected to retire exactly 1 row, updated %', _n;
  end if;

  /* ---- ASSERT BOTH HALVES, because a retire looks the same either way ---- */

  select count(*) into _n from content
   where id = _id and retired_at is not null and retired_reason is not null;
  if _n <> 1 then
    raise exception '0134: the row is not retired, or carries no reason';
  end if;

  /*
   * AND THE CLEAN TAKE IS STILL LIVE. The failure this guards is a predicate
   * that matched both films — which would retire the good one silently and read
   * as success, because "a row was retired" is true either way.
   */
  select count(*) into _n from content
   where id = _clean and status = 'published' and retired_at is null;
  if _n <> 1 then
    raise exception '0134: the clean take is no longer live — the retire matched too much';
  end if;

  /*
   * The quote must still be reachable by slot 1, or this migration has removed a
   * mindset film from the morning rather than a duplicate. Checked through
   * pickMindset's own predicate, not through the row.
   */
  select count(*) into _n from content
   where type = 'advisor_video' and placement = 'daily_lifestyle'
     and collection = 'Mindset' and status = 'published' and retired_at is null
     and mux_playback_id is not null
     and title ilike '%great mood%';
  if _n < 1 then
    raise exception '0134: the Hormozi quote is no longer servable by slot 1';
  end if;

  raise notice '0134: retired "Selling speech" (%); clean take % remains live and servable', _id, _clean;
end
$$;
