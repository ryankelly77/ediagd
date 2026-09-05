-- ============================================================================
-- EDIAGD — 0098 Free Surf: the badge 0025 described and never minted
--
-- WHAT WAS ALREADY HERE
-- 0025 added daily_completion.was_scheduled and its comment names the badge
-- outright — "This is what the Free Surf badge counts" — with the query beside
-- it. lib/gamification/streak.ts computes outcome.onScheduledDay on every
-- completion and says why: "celebrate up, never punish down ... recorded so it
-- can be celebrated separately rather than penalised."
--
-- Neither shipped a badge. The data has been recorded faithfully for months and
-- read by nothing, and onScheduledDay has been computed and consumed by nothing.
-- This is the catalog row; completeDay awards it.
--
-- WHY A BADGE AND NOT A COUNTER
-- Turning up on a day nobody asked you to is a different act from turning up on
-- a day you were rostered, and the app has had no way to say so. A count would
-- make it a target — advisors working their days off to farm a number is the
-- opposite of the intent. One badge, the first time, then nothing.
--
-- SEAFOAM, NOT GOLD. The same ring as First Light: a first-of-its-kind moment
-- rather than an achievement earned over months. Gold is for the Swells and
-- certification.
--
-- 100 SAND DOLLARS, matching game_settings.sand_badge, which is what
-- completeDay actually pays for this class of badge. lib/badge-rewards.ts is
-- updated in the same commit to read it from that setting rather than from this
-- column, so the two can never drift.
--
-- MITCH CAN RENAME IT. The key is the contract; the name and description are
-- his words to change, and /admin has no badge editor yet, so it is one update
-- here when he has a better one.
-- ============================================================================

insert into badge (key, name, description, ring, sand_dollars)
values (
  'free_surf',
  'Free Surf',
  'Took the rep on a day off',
  'seafoam',
  100
)
on conflict (key) do nothing;
