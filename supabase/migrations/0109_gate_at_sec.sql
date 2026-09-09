-- ============================================================================
-- EDIAGD — 0109 The Continue button opens when the lesson ends, not when the
--          file does
--
-- Ryan: "the continue button is showing early before the video is over. Can we
-- make it so the button turns gold when you hear the word 'mahalo'? Or 2s
-- before video ends?"
--
-- Those are not the same thing, and the transcripts say so. Every one of the 77
-- films signs off with "Mahalo", and the gap between that word and the end of
-- the file runs from 0.93s to 21.58s — median 3.44. What sits in that gap is
-- nothing: checked across the batch, there is not a single word after the
-- sign-off. It is trailing silence.
--
-- So a gate at "2 seconds before the end" would hold the button through up to
-- twenty seconds of dead air, and a percentage gate — 90% of a 130-second film
-- — opens it thirteen seconds before the lesson finishes. Both are wrong in
-- opposite directions, which is why the current one felt early.
--
-- gate_at_sec is the moment the film stops teaching. Per film, because the
-- answer is per film.
--
-- NULL MEANS FALL BACK. Older content has no transcript and no timestamp, and
-- the percentage rule stays exactly as it was for those. This adds a better
-- answer where one is known rather than replacing a working one everywhere.
-- ============================================================================

alter table content
  add column if not exists gate_at_sec numeric;

comment on column content.gate_at_sec is
  'Seconds into THIS cut at which the lesson ends — the sign-off, not the file. '
  'The Continue gate opens here when set; falls back to game_settings.video_complete_pct when null.';

/* Never past the end, and never negative — a gate that cannot be reached is a
   button that never turns gold. */
do $$ begin
  alter table content
    add constraint content_gate_at_sec_sane
    check (gate_at_sec is null or gate_at_sec >= 0);
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
