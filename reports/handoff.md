# Handoff

- Merged #48 — the signed-out front door plays exactly two films (mindset: Attitude, item: Walk-Around Part 1) on the two public playback ids the website already uses; no intro, pitch, stills or fallback branch, and nothing minted or deleted in Mux.
- Migration ledger is at **0158** (`0158_front_door_two_films.sql`, applied to production): two slots only, `public_playback_id` NOT NULL, RLS on `front_door_slot` with anon's write grants revoked, `front_door_film` granted to anon alone.
- This PR adds the openers-brief guard — `scripts/db-migrate.sh` now refuses unless the checkout is `main` and `main` is not behind `origin/main`, with `git checkout main && git pull` as the only message; `--guard-only` runs it alone so its acceptance can be proven without migrating production. **Done.**
- Also here: `PublicFilm` genuinely caps at 70vh (desktop 354×630 centred, aspect preserved; phone width unchanged at 408) — the old inline `maxHeight` capped nothing and measured 908×1614.
- Open: anon still holds SELECT on `content`/`content_still` so it returns `200 []` rather than a refusal (Ryan's call to revoke); the `front-door` and `front-door-two-films` branches are deleted on origin.
