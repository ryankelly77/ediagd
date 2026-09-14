-- ============================================================================
-- EDIAGD — 0122 Currency begins at the credential, not at the track
--
-- A track certification, once earned, is HELD PERMANENTLY. It does not expire.
-- EDIAGD Certified requires all eight core tracks held — not held-and-current —
-- and the credential carries the annual currency.
--
-- ---------------------------------------------------------------------------
-- WHY, BECAUSE THE OLD RULE LOOKED RIGHT
-- ---------------------------------------------------------------------------
-- 0115 gave each track a year of currency and required all eight current at
-- once. That assumed the eight could be collected inside twelve months. They
-- cannot: the four finished core courses run 29–56 items, the full eight is
-- 300–400, and at any plausible rate the first track is earned around day 61
-- and the eighth past day 440. The first lapses roughly a fortnight before the
-- last is earned, so EDIAGD Certified could never compute for anybody who
-- actually did the work.
--
-- Nothing was behaving incorrectly. The rule was wrong: annual currency assumed
-- a renewal path, and renewal was deferred on the reasoning that the first
-- lapse arrives a year after the first CERTIFICATION. It arrives a year after
-- the first TRACK, which is well before anyone finishes.
--
-- It also matches ASE, whose window is long relative to how fast the specialty
-- certifications stack; ours was shorter than the climb. And it collapses
-- renewal from eight refreshers a year to one — ten minutes for the advisor
-- rather than eighty, and one refresher for Mitch to write rather than thirty.
--
-- The accepted cost: a Certified advisor may hold a track they last touched
-- years ago. The credential is the public claim and the credential is what must
-- be renewed, so the honesty sits where a stranger can check it — on the verify
-- page, which reads advisor_credential.current_through and is unaffected.
--
-- ---------------------------------------------------------------------------
-- NO SCHEMA CHANGE. THIS IS A COMMENT AND A SETTING.
-- ---------------------------------------------------------------------------
-- The behaviour lives in lib/certification.ts, which is where the rule always
-- was. Nothing is dropped, nothing is backfilled, and no row changes meaning in
-- a way that needs rewriting — a held track was already held.
-- ============================================================================

/*
 * SUPERSEDED, DELIBERATELY KEPT — retire, never delete.
 *
 * Still written on every grant because the column is NOT NULL, and read by
 * nothing. If you are here because you found code consulting it: that code is
 * the bug. A track does not expire.
 */
comment on column advisor_certification.current_through is
  'SUPERSEDED by 0122 and inert. A track certification is held permanently; '
  'the annual currency lives on advisor_credential.current_through. Still '
  'populated because the column is NOT NULL. Nothing reads it — see '
  'lib/certification.ts.';

comment on column advisor_credential.current_through is
  'The only currency clock in the programme: one year from the day the '
  'CREDENTIAL was earned, renewed by the annual refresher when that is built. '
  'Not the earliest constituent — constituents no longer expire. See 0122.';

-- ---- Founding Class ---------------------------------------------------------

/*
 * 2027-12-31.
 *
 * From zero, EDIAGD Certified is an eight-to-fifteen month journey, so any of
 * the earlier dates discussed would have created a class nobody could join —
 * the first cohort would have finished after the window closed. End of 2027
 * covers the realistic first cohort.
 *
 * Extending is the safe direction if content slips; pulling it in un-marks
 * people who were told they were Founding Class, which is the one move that
 * costs something. Set generously, tighten never.
 */
update game_settings
   set founding_class_through = date '2027-12-31',
       updated_at = now()
 where id = true;

/* Apply it to whatever exists — currently nothing, since nobody has certified.
   Idempotent, and correct on a re-run. */
select recompute_founding_class();

notify pgrst, 'reload schema';
