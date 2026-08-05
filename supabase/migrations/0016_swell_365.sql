-- ============================================================================
-- EDIAGD — 0016 The 365-Day Swell
--
-- The art exists and BADGES.md tags it [now], but the badge had no catalog row
-- and the engine's milestone list stopped at 90 — so it could never be earned
-- or displayed. This adds the row and its tunable payout; the engine change
-- lives in lib/gamification/streak.ts.
--
-- big_wave is deliberately LEFT ALONE. It is [needs certification] and nothing
-- awards it (it is not a streak milestone), but its catalog row must stay so
-- the badges wall can show it in the "Coming soon" state.
-- ============================================================================

-- ---- The tunable payout (admin-editable, like every other amount) ----------
alter table game_settings
  add column if not exists sand_swell_365 int not null default 1000;

-- ---- The catalog row -------------------------------------------------------
-- sand_dollars mirrors the game_settings default; game_settings remains the
-- source of truth the engine actually reads at runtime.
insert into badge (key, name, description, ring, sand_dollars) values
  ('swell_365', '365-Day Swell', 'A year of great days', 'gold', 1000)
on conflict (key) do update
  set name        = excluded.name,
      description = excluded.description,
      ring        = excluded.ring;
