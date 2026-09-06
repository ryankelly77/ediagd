-- ============================================================================
-- EDIAGD — 0100 the pitch lookup gets a second rung
--
-- WHAT STEP 3 DOES TODAY
-- pickPitchVideo matches (op_code, stage) exactly and returns null otherwise,
-- so the step is dropped from the day and recorded as skipped. That is right
-- when nothing relevant exists and wrong when something does: a deck with no
-- film for "After-MPI" has nothing to show, while the foundational Selling
-- speech teaches exactly that beat for every op code.
--
-- So the lookup gains a rung. Exact film, then the foundational module for the
-- stage, then skipped-and-recorded as before.
--
-- WHY AN ALIAS ROW AND NOT A TABLE IN lib/daily.ts
-- 0087 left `kind` as text-with-a-check "precisely so new kinds could be
-- added", and named the reason: Mitch's names drift, and the drift is data he
-- can fix from the Aliases screen rather than a lookup buried in a script only
-- a developer can edit. Which module covers which stage is that same kind of
-- decision — it will change as films are shot.
--
-- TWO OF THE FOUR ARE PROPOSED, NOT CONFIRMED, because the films do not exist:
-- there is no Setup speech film and no Overcoming Objections film. An unconfirmed
-- row is inert, so the rung simply does not fire for those stages until somebody
-- films them and confirms the row. That is the same posture as the deck-map
-- proposals: a row that means "this is the plan" rather than "this is in force".
-- ============================================================================

alter table mapping_alias drop constraint if exists mapping_alias_kind_check;
alter table mapping_alias add constraint mapping_alias_kind_check
  check (kind in (
    'op_code', 'collection', 'voice', 'service_family', 'stage', 'stage_fallback'
  ));

comment on constraint mapping_alias_kind_check on mapping_alias is
  'stage_fallback: alias is one of the six canonical stages, canonical is the '
  'title of the foundational film that covers it when a deck has none. Read by '
  'pickPitchVideo as rung 2. Unconfirmed rows are inert.';
