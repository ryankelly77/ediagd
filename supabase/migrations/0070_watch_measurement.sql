-- ============================================================================
-- EDIAGD — 0070 How much of the day's videos was actually watched
--
-- The certification programme is about to treat "watched in the daily loop" as
-- lesson credit, and today the loop cannot support that claim: Continue is
-- always enabled, so a completion recording a video id means the step was
-- SHOWN, not seen. These columns are the measurement that makes the claim
-- checkable.
--
-- Additive and nullable. Every daily_completion written before this migration
-- reads null, which means UNKNOWN — not zero. Defaulting to 0 would assert that
-- thousands of past completions watched nothing, which is a claim nobody
-- measured and the LMS would then have to un-learn.
-- ============================================================================


alter table daily_completion
  /*
   * A PERCENTAGE, NOT A BOOLEAN, AND THAT IS THE WHOLE POINT.
   *
   * The bar for credit is 95% today and it will move — the LMS owns that rule,
   * not this table. Storing the measurement rather than the verdict means a
   * threshold change re-scores history instead of invalidating it. You can
   * always derive "did they watch it" from a number; you can never recover a
   * number from a stored yes.
   *
   * numeric(5,2) rather than int: 94.7 and 95.0 are different answers to a
   * question with a 95 bar, and rounding at write time would decide the
   * borderline cases silently and permanently.
   */
  add column if not exists pitch_video_watch_pct numeric(5, 2),
  add column if not exists lifestyle_video_watch_pct numeric(5, 2),

  /*
   * THE PLAYER FAILED AND WE LET THEM THROUGH.
   *
   * A 404 asset, a dead network, or twenty seconds after pressing play with
   * nothing decoded — the gate releases and the day completes, because a broken
   * video must never cost an advisor their streak. But a 0% that means "the
   * video was broken" and a 0% that means "they tapped straight past" are
   * different facts, and only one of them is about the advisor.
   *
   * Without this column the LMS would read a wall of honest zeroes as advisors
   * skipping their coaching, and the first person to notice would be whoever
   * gets asked why compliance collapsed the week a Mux asset went missing.
   */
  add column if not exists watch_error boolean;

comment on column daily_completion.pitch_video_watch_pct is
  'Share of step 3''s video actually PLAYED (not scrubbed past), 0-100. Null '
  'means unmeasured — rows predating 0070, or a step with no video.';
comment on column daily_completion.lifestyle_video_watch_pct is
  'Share of step 4''s video actually played, 0-100. Null means unmeasured.';
comment on column daily_completion.watch_error is
  'True when a player error, a missing asset or a playback timeout released the '
  'gate. Distinguishes "the video was broken" from "they watched none of it".';

alter table daily_completion drop constraint if exists daily_completion_watch_pct_range;
alter table daily_completion add constraint daily_completion_watch_pct_range
  check (
    (pitch_video_watch_pct is null or pitch_video_watch_pct between 0 and 100)
    and (lifestyle_video_watch_pct is null or lifestyle_video_watch_pct between 0 and 100)
  );

/*
 * The LMS's question is "which completions in this range clear the bar", and it
 * asks it per day across everybody. The date leads for the same reason it does
 * on daily_completion_cue_match_idx.
 */
create index if not exists daily_completion_watch_idx
  on daily_completion(completion_date, lifestyle_video_watch_pct);
