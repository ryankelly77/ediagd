# EDIAGD Badge System

The full badge system — families, criteria, and what unlocks each. Some badges are buildable today; others are **gated on features that don't exist yet** (a lesson library, historical period tracking, team-activity tracking). Every badge must fire on real data — a badge that can never be earned is worse than no badge — so each is tagged with what it needs.

Guiding brand rule (from the brand book): **celebrate up, never punish down. Compete with yesterday, never your teammate.** This is why there are NO individual-ranking badges here — "beat your coworkers" contradicts the brand. The personal-best badges are the brand-correct version of that instinct.

## Construction (all badges)
Circle + dotted inner ring + one flat motif (sun / wave / palm / mark). Flat palette colors, never metallic, never red. **Tier is carried by the ring color**, and the tier names are the brand's:
- **First Light** (starting out) — seafoam ring
- **Dawn Patrol** (showing up) — seafoam ring, filled
- **Golden Hour** (performance milestones) — gold ring
- **Big Wave** (mastery / top achievements) — full gold

Status tags:
- **[now]** — buildable today; data exists (the streak engine tracks it).
- **[needs lessons]** — requires the advisor lesson library (completing more than the daily one).
- **[needs history]** — requires month-over-month performance tracking (a second period of data).
- **[needs team]** — requires team-activity tracking (who was active together, huddles).
- **[manual]** — can't be automatic; a manager/admin awards it (no data signal exists).

---

## Consistency — the Swell (streak) family
Built on the streak engine that exists today.

| Badge | Criteria | Tier | Motif | Status |
|---|---|---|---|---|
| First Light | First daily loop completed | First Light | sunrise | **[now]** |
| 7-Day Swell | One week of great days | Dawn Patrol | wave | **[now]** |
| 30-Day Swell | A month of great days | Golden Hour | wave | **[now]** |
| 90-Day Swell | A quarter of great days | Golden Hour | wave (fuller) | **[now]** |
| 365-Day Swell | A year of great days | Big Wave | wave (cresting) | **[now]** — added per Ryan; wire into engine milestone check |

Note: motif for the Swell family is primarily the wave; First Light uses the rising sun.

---

## Learning — courses & daily engagement family
**Gated on the advisor lesson library** (the "do more than 3 minutes" system). These are the reward layer that makes the library sticky — you can't count "ten courses" until there's a place to complete them.

| Badge | Criteria | Tier | Motif | Status |
|---|---|---|---|---|
| Ten Sunrises | Ten lessons completed | Dawn Patrol | sunrise | **[needs lessons]** |
| Fifty Sunrises | Fifty lessons completed | Golden Hour | sunrise | **[needs lessons]** |
| Eddie's Pick | Twenty daily picks completed | Golden Hour | sunrise | **[now-ish]** — daily picks ARE tracked (daily_completion); buildable once we decide it counts picks completed, not just streak length |
| Full Horizon | Every lesson in a service/track completed | Big Wave | sunrise | **[needs lessons]** — needs the concept of a "track" (a complete service curriculum) |

Note: today we have cues, not structured courses. The library defines whether completing a cue = a "lesson."

---

## Performance — attach-rate family
**Gated on historical tracking** — comparing this period to prior periods. We have one month of Doggett data; these need at least two.

| Badge | Criteria | Tier | Motif | Status |
|---|---|---|---|---|
| Personal Best | Beat your own attach-rate record | Dawn Patrol | sun | **[needs history]** — brand-correct "compete with yesterday" |
| Five Points | Attach rate up five points (period over period) | Golden Hour | sun | **[needs history]** |
| Clean Sweep | Every coachable opportunity attached in a day | Golden Hour | sun (sweep) | **[needs definition]** — needs daily RO-level data; the DMS report is monthly, so may not be computable |

CUT (violate the brand — individual ranking): Top of the Board (first on leaderboard), High Noon (best in group). The brand book forbids ranking advisors against each other. Personal Best is the on-brand alternative.

---

## Team — camaraderie family
**Gated on team-activity tracking** AND Mitch's ruling on team social features. Brand-aligned (team-first, celebrate-up) but needs data we don't collect yet.

| Badge | Criteria | Tier | Motif | Status |
|---|---|---|---|---|
| Crew | Whole team active on the same day | Dawn Patrol | palm (2) | **[needs team]** |
| Morning Huddle | Thirty straight team huddles | Golden Hour | palm (1) | **[needs team]** — needs a "huddle" concept |
| Full Crew | Every advisor earned a badge this month | Big Wave | palm (3) | **[needs team]** |
| Lift | Helped a teammate to a personal best | Dawn Patrol | palm (lift) | **[manual]** — no data signal for "helped"; manager awards |

---

## Mastery — certification family
**Gated on a certification system** (structured courses culminating in certification). Doesn't exist yet.

| Badge | Criteria | Tier | Motif | Status |
|---|---|---|---|---|
| Big Wave | Certification earned | Big Wave | mark | **[needs certification]** — in brand book; the +500 sand-dollar event |
| Coach | Coached another advisor to certification | Golden Hour | mark | **[manual]** / [needs certification] |
| Waterman | Certified in every track | Big Wave | mark (double) | **[needs certification]** |

---

## Build order (dependency-driven)

1. **[now] Consistency family** — First Light + 7/30/90/365 Swell. Build the SVG art + wire 365 into the engine milestone check. Fills the badges wall today.
2. **Advisor lesson library** — the "do more" system. Unlocks the Learning family.
3. **[needs lessons] Learning family** — once lessons can be completed and counted.
4. **[needs history] Performance family** — once a second month of data exists.
5. **[needs team] Team family** — once team-activity tracking + Mitch's social ruling.
6. **[needs certification] Mastery family** — once courses to certification exists.

## Open questions for Mitch
- Does "course/lesson" = completing a cue, or a structured multi-cue unit? (Defines Learning badges + Full Horizon's "track".)
- Team social features — how much, given the brand's team-first / no-individual-ranking stance?
- What is a "certification"? (Gates the Mastery family + the +500 event.)
- Clean Sweep: is daily opportunity-level data available, or is the DMS report monthly-only?
