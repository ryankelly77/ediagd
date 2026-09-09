-- ============================================================================
-- EDIAGD — 0110 gate_at_sec removed: a constant does the job
--
-- 0109 added a per-film gate point on the theory that "when he says Mahalo" and
-- "two seconds before the end" were materially different — the transcripts said
-- the gap between the sign-off and the end of the file ranged from 0.9s to 21.6s.
--
-- That range was an artifact. Those transcripts were made with VAD filtering
-- on, which strips silence before the model sees the audio and lets the
-- reported timestamps drift from wall-clock. Re-measured properly — last 45
-- seconds of each film, word-level, VAD off — across all 90:
--
--     min 0.84s   median 1.46s   max 3.34s     87 of 90 under 2s
--
-- The sign-off is always about a second and a half from the end. So "at Mahalo"
-- and "2s before the end" are the same instruction, and the second one needs no
-- data, no backfill, and nothing for a future batch to remember to compute.
--
-- The column goes rather than lingering unused. A nullable column that nothing
-- writes is a question every future reader has to answer for themselves.
-- ============================================================================

alter table content drop constraint if exists content_gate_at_sec_sane;
alter table content drop column if exists gate_at_sec;

notify pgrst, 'reload schema';
