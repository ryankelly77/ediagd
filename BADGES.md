# EDIAGD Badge System

The full badge system — families, criteria, and what unlocks each. Some badges are buildable today; others are gated on features that don't exist yet (a lesson library, historical period tracking, team-activity tracking). Every badge must fire on real data — a badge that can never be earned is worse than no badge — so each is tagged with what it needs.

Guiding brand rule (from the brand book): **celebrate up, never punish down. Compete with yesterday, never your teammate.** This is why there are NO individual-ranking badges here — "beat your coworkers" contradicts the brand. The personal-best badges are the brand-correct version of that instinct.

## Construction (all badges)

Circle + dotted inner ring + one flat motif. Flat palette colors, never metallic, never red. **Tier is carried by the ring color**, and the tier names are the brand's:

- **First Light** (starting out) — seafoam ring
- **Dawn Patrol** (showing up) — seafoam ring, filled
- **Golden Hour** (performance milestones) — gold ring
- **Big Wave** (mastery / top achievements) — full gold

**Motif vocabulary.** The brand book's original list was sun / wave / palm / mark. That was too narrow once the system passed a handful of badges — reusing the wave across the Swell family, Coach, Big Wave and Waterman made those badges indistinguishable at any real size. The vocabulary is now extended to the wider world of the brand: boards, paddles, flip-flops, umbrellas, flags, stars. Three rules govern it:

1. **The wave belongs to the Swell family and nothing else.** Its weight escalates with the streak — plain, then one foam line, then cresting with spray.
2. **The rising sun belongs to the badges named for it** — First Light and the Sunrises. Full Horizon uses the sun fully risen over a long horizon, which is the same idea completed.
3. **Palms are the team signal** — two for Crew, three for Full Crew. Every other badge owns a distinct object.

Everything else from the brand book holds: flat palette color, no metallic, no red, tier carried by the ring. The brand book's construction paragraph should be updated to match this vocabulary.

Status tags:

- **[now]** — buildable today; data exists (the streak engine tracks it).
- **[needs lessons]** — requires the advisor lesson library (completing more than the daily one).
- **[needs history]** — requires month-over-month performance tracking (a second period of data).
- **[needs team]** — requires team-activity tracking (who was active together, huddles).
- **[manual]** — can't be automatic; a manager/admin awards it (no data signal exists).

---

## Consistency — the Swell (streak) family

Built on the streak engine that exists today.

| Badge | Asset key | Criteria | Tier | Motif | Status |
|---|---|---|---|---|---|
| First Light | `first_light` | First daily loop completed | First Light | rising sun | **[now]** |
| 7-Day Swell | `swell_7` | One week of great days | Dawn Patrol | wave | **[now]** |
| 30-Day Swell | `swell_30` | A month of great days | Golden Hour | wave | **[now]** |
| 90-Day Swell | `swell_90` | A quarter of great days | Golden Hour | wave, fuller — one foam line | **[now]** |
| 365-Day Swell | `swell_365` | A year of great days | Big Wave | wave, cresting — double foam + spray | **[now]** — added per Ryan; wire into engine milestone check |

Note: the wave is exclusive to this family. First Light uses the rising sun.

---

## Learning — courses & daily engagement family

Gated on the advisor lesson library (the "do more than 3 minutes" system). These are the reward layer that makes the library sticky — you can't count "ten courses" until there's a place to complete them.

| Badge | Asset key | Criteria | Tier | Motif | Status |
|---|---|---|---|---|---|
| Ten Sunrises | `ten_sunrises` | Ten lessons completed | Dawn Patrol | rising sun | **[needs lessons]** |
| Fifty Sunrises | `fifty_sunrises` | Fifty lessons completed | Golden Hour | rising sun | **[needs lessons]** |
| Eddie's Pick | `eddies_pick` | Twenty daily picks completed | Golden Hour | surfboard — the board Eddie picks for you | **[now-ish]** — daily picks ARE tracked (daily_completion); buildable once we decide it counts picks completed, not just streak length |
| Full Horizon | `full_horizon` | Every lesson in a service/track completed | Big Wave | sun fully risen over a long horizon | **[needs lessons]** — needs the concept of a "track" (a complete service curriculum) |
| Free Surf | `free_surf` | Trained on five days you weren't scheduled | Golden Hour | hammock | **[now, once schedules exist]** — `daily_completion.was_scheduled` is stamped at write time (0025), so `count(*) where was_scheduled = false` is the criterion |

Note: today we have cues, not structured courses. The library defines whether completing a cue = a "lesson."

Eddie's Pick takes the surfboard rather than a third sunrise — as a sunrise it was visually identical to Fifty Sunrises, separated only by the numeral.

---

## Performance — attach-rate family

Gated on historical tracking — comparing this period to prior periods. We have one month of Doggett data; these need at least two.

| Badge | Asset key | Criteria | Tier | Motif | Status |
|---|---|---|---|---|---|
| Personal Best | `personal_best` | Beat your own attach-rate record | Dawn Patrol | planted flag — your own high-water mark | **[needs history]** — brand-correct "compete with yesterday" |
| Five Points | `five_points` | Attach rate up five points (period over period) | Golden Hour | five-pointed star | **[needs history]** |
| Clean Sweep | `clean_sweep` | Every coachable opportunity attached in a day | Golden Hour | sweeping stroke — the beach wiped clean | **[needs definition]** — needs daily RO-level data; the DMS report is monthly, so may not be computable |

CUT (violate the brand — individual ranking): Top of the Board (first on leaderboard), High Noon (best in group). The brand book forbids ranking advisors against each other. Personal Best is the on-brand alternative.

---

## Team — camaraderie family

Gated on team-activity tracking AND Mitch's ruling on team social features. Brand-aligned (team-first, celebrate-up) but needs data we don't collect yet.

| Badge | Asset key | Criteria | Tier | Motif | Status |
|---|---|---|---|---|---|
| Crew | `crew` | Whole team active on the same day | Dawn Patrol | two palms | **[needs team]** |
| Morning Huddle | `morning_huddle` | Thirty straight team huddles | Golden Hour | beach umbrella — everyone under one | **[needs team]** — needs a "huddle" concept |
| Full Crew | `full_crew` | Every advisor earned a badge this month | Big Wave | three palms | **[needs team]** |
| Lift | `lift` | Helped a teammate to a personal best | Dawn Patrol | flip-flops — walking alongside someone | **[manual]** — no data signal for "helped"; manager awards |

---

## Mastery — certification family

Gated on a certification system (structured courses culminating in certification). Doesn't exist yet.

| Badge | Asset key | Criteria | Tier | Motif | Status |
|---|---|---|---|---|---|
| Big Wave | `big_wave` | Certification earned | Big Wave | the master mark | **[needs certification]** — in brand book; the +500 sand-dollar event |
| Coach | `coach` | Coached another advisor to certification | Golden Hour | paddle — what you hand the next person | **[manual]** / [needs certification] |
| Waterman | `waterman` | Certified in every track | Big Wave | three boards planted in sand — a full quiver | **[needs certification]** |

All three previously used the master mark and were near-indistinguishable. Big Wave keeps it, because the certification badge being the brand mark itself is the point; Coach and Waterman now carry their own objects.

---

## Build order (dependency-driven)

1. **[now] Consistency family** — First Light + 7/30/90/365 Swell. Art is done and sitting in `buildable-now/`; wire 365 into the engine milestone check. Fills the badges wall today.
2. **Advisor lesson library** — the "do more" system. Unlocks the Learning family.
3. **[needs lessons] Learning family** — once lessons can be completed and counted.
4. **[needs history] Performance family** — once a second month of data exists.
5. **[needs team] Team family** — once team-activity tracking + Mitch's social ruling.
6. **[needs certification] Mastery family** — once courses to certification exists.

---

## Artwork

All 19 badges are drawn and exported. The status tags describe **data plumbing, not art** — `[needs lessons]` means the platform can't yet detect the achievement, not that the badge is missing. Design review can run on the whole system today.

- `svg/{key}.svg` — motif only. Ship this set.
- `svg-labeled/{key}.svg` — same art with the badge name curved along the bottom arc. For print and badge-detail views; the words stop resolving below ~60px.
- `buildable-now/` — the five **[now]** badges, ready to drop in.

Every file: 240×240 viewBox, badge centred at r104, identical padding, fully transparent, SVGO-optimized, all colors hex, numerals and label text as outlined paths. Verified legible on both Midnight and cream backgrounds.

Palette: Seafoam `#7EC8CD` · Reef `#4AA8B0` · Sunrise Gold `#E8B44C` · dotted ring `#8492A2` at 55%.
