# TWO LADDERS — the daily loop and the certification

*Settled 18 September 2026. Supersedes every earlier description of the daily loop.*
*Build sequence lives in `PHASE_3_PLAN.md`.*

## The shape

Two kinds of morning. Five minutes or less, one completion state, one streak.

```
Track-entry morning     mindset video  ->  track film                 ->  done
Every other morning     mindset video  ->  pitch video  ->  next item  ->  done
```

Three slots answering three unrelated questions, deliberately:

| Slot | Question | Source | Mechanism |
|---|---|---|---|
| `mindset` | Get your head right | Mindset collection | Pool draw, no repeat in cycle |
| `pitch` | What are you selling now | `op_code` -> `op_code_family` | **Derived** from DMS, locked per cycle |
| `item` | How do you sell anything | The advisor's current module | **Sequential**, module order |

**Every completed day advances two credentials.** The pitch counts toward a service
certification through the op-code path. The item counts toward a craft track. The
advisor is never asked to think about either.

## Why the pitch is derived and the item is not

This asymmetry is the architecture, not an implementation convenience.

**The pitch can be derived because the data exists.** The DMS reports attach rate by
family. That is a measurable gap, and closing it is remediation — reordered as the
numbers move.

**The item cannot be derived, because nothing measures craft.** No feed anywhere
reports that an advisor is weak at Power of Positive Language. Quiz results are the
only craft signal, they exist on one track, and they arrive *after* a module — so they
can say whether teaching landed, never what to teach next.

So the craft side is a **curriculum**: same order for everyone, paced by where the
advisor is in it. Do not build a personalization mechanism for slot 3. Scoring craft
tracks against advisor data would put a guess underneath a credential.

- **Service certification** = closing a gap. Derived, reorders constantly.
- **Craft certification** = completing a curriculum. Sequential, identical for everyone.

That is why they are two credentials rather than one.

## Derivation rules for the pitch

1. **Rank by missed volume, not attach rate.** A family with two opportunities and zero
   sold is 0% and worth nothing; two hundred at 40% is where the money is.
2. **Derive once, write a row, read the row.** Never recompute on page load — a mid-week
   DMS drop would move an advisor off the family their manager mentioned on Monday.
3. The row gives the manager override for free. Same shape as `op_code_family`:
   derive -> allow a human ruling -> lock.

## Track films are entry gates

Eight core tracks, eight films, one apiece. A track film is **not** a daily item — it is
what happens on the morning an advisor *enters* a track, eight times across the whole
certification. On that morning the film is the day. It replaces the pitch and item
slots; it never stacks alongside them.

- **Fixes the orphan.** Without the gate an advisor works fifty-one positive-language
  cues having never watched Mitch teach positive language.
- **Makes the film mean something.** Loose in a cue list it is item #34. As a threshold
  there are only eight.

Watching the track film completes the day and advances the streak like any other morning.

## Slot 3 is format-agnostic

A module holds an **ordered list of items**: text cue, video cue, possibly quote. The
slot serves whatever comes next and renders it accordingly.

**No filtering by format.** The moment the loop decides "only text here, video
elsewhere," two orderings compete — the module's and the loop's. One ordering, and it
lives in the module.

## Naming

In code the slots are `mindset`, `pitch`, `item`. **Nothing in the schema or components
is named `craft`** — that word already means the cue tracks and appears on the
certificate ladder. Customer-facing copy may say "work on your craft" over slot 2; copy
and schema are allowed to differ, two columns named `craft` are not.

Slot 3 is `item`, not `cue`, because it will not always be a cue.

## The Eddie's Pick card (on /advisor)

**Correction, 19 September:** this was written as "the /today card" and that was
wrong. `/today` is the immersive ritual and has no card; Eddie's Pick lives on
`/advisor`. 3c built it where the card actually is.

With the pitch inside the loop, the Eddie's Pick card repeats the film the
advisor just watched. The card becomes a **focus-family progress card**:
*Belts & Cooling - 3 of 7 - continue*.

The loop guarantees a floor; the card lifts the ceiling. Both read and write **one
consumption record**, so the loop never re-serves a film watched in the card.

**No equivalent card on the craft side.** Service content is remediation and bingeing
works. Craft is a curriculum — fifty-one cues in one sitting teaches nobody anything and
would let an advisor speed-run to a credential over a weekend. Show craft progress on
the certification page; offer no "continue" button.

## The curriculum, and how long it takes

Settled 24 September. Supersedes the earlier duration budget, which counted cues as
curriculum.

**Video is the curriculum. Cues are reinforcement.**

A cue can be read in seconds and teaches nothing by being ticked, so ticking cues cannot
earn a credential. Cues appear in the morning and on the home screen, they recur, and they
gate nothing.

### The units

- **A module** is one lesson video plus its quiz — **six mornings** at the settled rhythm
  (lesson, two cue days, quiz, two cue days).
- **A track** is an entry film, then its modules, then the advisor's Good News Story.
  `entry + 6n + story` mornings.
- **Slot 3** serves the next lesson or quiz when one is due, and a reinforcement cue
  otherwise. An advisor is never blocked: when the filmed lessons run out, the loop
  continues on cues.

### The rhythm

Something advances the credential every third morning. The two between are reinforcement.

Lengthening the credential is done **by spacing, not by padding**. One more cue day between
lessons costs nothing and no advisor can tell. Adding modules that re-cover material is how
a credential stops meaning anything.

### The budget, at five mornings a week

| | tracks | modules | mornings | daily | every other day |
|---|---|---|---|---|---|
| EDIAGD Certified | 9 | 35 | 246 | 11.3 months | 22.7 months |
| Master | 3 | 14 | 96 | 4.4 months | 8.8 months |
| **Total** | **12** | **49** | **342** | **15.7 months** | **31 months** |

Menus is a **core** track, not a Master one. Seven modules, every film already shot.

### The mileage shelf

The 51 mileage-rung films are **not modules and consume no mornings**. Fourteen rungs,
5,075 through 70,000, two to six films apiece. They sit in the lesson library and the
advisor looks up the rung matching the car in front of them.

**The product does not and cannot know what is on an advisor's drive** — the DMS feed is a
monthly spreadsheet of aggregate attach rates, not a live work-in-progress. It does not need
to. The advisor wrote the mileage on the repair order ninety seconds ago.

### Two ladders, both daily

- **Ladder 1 — Service.** Slot 2. Derived from the advisor's own numbers, re-ranked only
  when a family's films are exhausted. No quizzes, no story.
- **Ladder 2 — Craft.** Slot 3. The twelve tracks above, in a fixed order, identical for
  everybody. An advisor with no repair-order history gets Ladder 2 only — a two-slot
  morning, which is correct behavior and not a fault.

### Open

- **Master Certification is undefined.** The tier is named and nothing states what earns it.
- **Where the quiz surfaces** — Ryan's preference is slot 3 on the day a module closes, so
  the morning stays three things. Not built.
- **The entry-film gate.** `entry_film_content_id` is NULL on all thirty certifications.
- **The mornings column and the stated formula disagree.** `entry + 6n + story` reads as
  `2 + 6n` per track, which gives 228 / 90 / 318. The table's figures are `4 + 6n`
  (35×6 + 9×4 = 246; 14×6 + 3×4 = 96). Either the entry film and the story are two mornings
  each, or the formula is `4 + 6n`. Recorded rather than resolved, because two documents
  disagreeing about the same fact is the bug.

## BUILT — the Good News Story (phase 3e, 0127)

A written account, at track exit, of something the advisor did differently on the drive
because of what the track taught them. The film opens the track; the story closes it.
**Eight tracks, eight films, eight stories.** Never per module, never per day.

The credential has four legs: **showing up, passing the checks, writing what you did
differently, and your numbers moving.** The fourth is **reported, not required** — attach
rate moves for reasons that have nothing to do with the advisor, and gating a credential
on a number invites gaming it. Nothing computes a causal claim; movement is shown over
the certification timeline and no more is asserted than that.

**The leg gates a TRACK, not a day.** `dayGate.ts` decides a morning; `certification.ts`
decides a track, and that is where the leg lives — `trackComplete()`, beside the module
rule. An earlier version of this document stated the formula ambiguously and the note
landed in `dayGate.ts`; 0127 moved it and corrected the comment.

How the three reversibility constraints were met:

1. **A flag, not a structure.** `game_settings.story_required`, read in exactly one
   place — `loadStoryGate()` in `lib/story.ts`. Turning it off is
   `update game_settings set story_required = false;` and no migration.
   It **ships ON**: no advisor completes a track before February, so a dark launch would
   have created the very cohort mismatch the flag exists to avoid.
2. **Track completion is expressed in exactly one place.** `TRACK_LEGS` in
   `lib/certification.ts` — the legs are data, so removing the story later is deleting an
   entry rather than hunting a condition through three components.
3. **It is decided, so it goes in the pitch.**

Two working assumptions, mine rather than Mitch's and cheap to reverse: submission counts
immediately with manager review visible but never blocking, and team sharing off by
default. Both are built that way and both are flagged in `reports/phase-3e-*`.

**The RLS is the feature.** This is the first place an advisor writes free text about
their own work and a manager reads it. Four rules — own always; manager at their own
rooftop; shared stories to that rooftop only; nobody across rooftops — each proved as a
refusal over PostgREST in `accept:story`, and each proved non-vacuous.

Onboarding says all four legs on day one (phase 3e Piece A), so the story is never news
in month eight.

## Open — Mitch's

1. Which track each film opens. (*The Big Ticket Visit* and *Part 2* are two films; if
   both open one track, one more film is owed.)
2. Track order — fixed for everyone, or set per advisor by the manager?
3. Item budget for the four remaining tracks (~33 each holds the claim).
4. Starting family for an advisor with no DMS history — every Doggett advisor on 1 October.
5. Captions on the eight track films. Only Pre-Write has them; mandatory track entry
   without captions is a different conversation.
6. Which 10 filmless families to film first (see *Settled by phase 3a* below).

## Open — architecture (2026-09-23)

### A. Counts or dollars? The product already answers both ways.

Rule 1's example is in RO counts ("two opportunities and zero sold… two hundred at 40%"),
and `derive_focus_family` follows it: ranked on `missed_ros`, with `opportunity` kept only
as a tie-break. But `rank()` in `lib/advisor.ts` is `f.opportunity ?? f.missedRos` —
**dollars when we have them** — and that feeds the service list, Eddie's Pick, the tier
score and the manager's team priorities.

**So the /advisor screen and the morning pitch already rank the same question differently,
and today they disagree for a live advisor** (op 35122: /advisor puts Battery on top at
$424.89; the morning coaches Filters on 7.38 missed ROs). The shoot list Mitch works from
is dollar-ranked too.

Measured 2026-09-23 before any ruling:

- **`opportunity` is not trustworthy at low RO counts.** `labor_per_ro = labor_sales /
  fam_ros`, and **48% of `advisor_family_labor` rows have `fam_ros < 5`**. Period-over-period
  volatility of `labor_per_ro`: median CV **0.65** at `fam_ros` 0–2 versus **0.10** at 50+,
  median worst jump 3.9x versus 1.3x. Dollars are ~3.3x noisier on thin families.
- A **store-level** denominator is thicker (median 17 ROs vs 5) and steadier (CV 0.38), but
  at Doggett individual families are still thin — HVAC has 4 store ROs — so it picks HVAC on
  0.53 missed ROs.
- A **trailing window** barely helps: CV 0.38 → 0.32 from 1 to 12 periods.
- For reference, `attach_rate_pct` itself has median CV **0.42**. The count side is not a
  stable baseline either.
- Under four rules, op 35122 gets **three different families**: count → Filters,
  dollars(own) → Battery, dollars(own, `fam_ros>=5`) → Filters, dollars(store) → HVAC.

Two constraints on any switch: `opportunity` is **null** wherever the DMS reports no labor,
so a dollar sort has to decide what happens to those families rather than `coalesce` them
onto a different scale; and a `fam_ros` floor produces two-slot mornings (it nulls op 400025
outright).

**Not a 1 October blocker** — two active accounts, agreeing under either measure. It matters
before sixty. Whatever is decided, `lib/advisor.ts` and `derive_focus_family` have to be
changed together, or the disagreement above survives the ruling.

### B. Exhaustion is the wrong re-rank trigger.

`advance_focus_family` returns the active assignment untouched while **any** unwatched film
remains, so **publishing into a family an advisor is already on keeps them there longer** —
op 400025 went from 12 mornings to 28 on 2026-09-22, for no reason connected to performance.
The better a family is stocked, the longer an advisor is held in it, which is backwards from
what filming is for.

There is also a phase problem: the DMS refreshes **monthly**, the assignment refreshes every
~28 mornings (about six weeks). An advisor can fix a family and keep being coached on it.

The argument for stickiness is real — being moved mid-stream teaches nothing — so the
question is the trigger, not the principle. Shape of the alternative:

- `advisor_focus_family.period_id` **already records which period the pick came from**, so
  "has the period changed" is a comparison against a stored column, not new state.
- Candidate rule: re-rank at **period change or exhaustion, whichever comes first**, with
  `source = 'manager'` still exempt from the period-change arm (a human ruling should not be
  ended by a DMS drop — that is rule 2) while remaining exempt-until-exhausted as today.
- **Leaving a family unfinished appears safe.** The pitch slot serves the next film the
  advisor has not completed; `content_progress` is per-film, so an interrupted family is
  resumable rather than lost, and `advisor_focus_family_one_active` already permits ending
  one row and inserting another. It is "your biggest gap today", not a curriculum.
- Open sub-question: `film_count` is frozen deliberately, so a card counting "3 of 7" does
  not move overnight — but `advance_focus_family` decides exhaustion from **live** supply.
  Those two numbers can already disagree (stored 12 vs live 28). Whatever trigger is chosen
  has to say which one the card is counting towards.

*Sweep answered 2026-09-23: who reads `film_count` raw? `lib/loop-preview.ts` reads the live
view (correct); `lib/loop.ts` carries the stored value into `assignment.filmCount`, whose only
consumer is `scripts/check-0124-production.ts`, a console diagnostic. No screen reads it. The
staleness is real and the blast radius is nil — do not re-ask.*


---

# Settled by phase 3a

*Measured 18 September 2026. Migration 0123. Full report in
`reports/phase-3a-ground-truth.md`.*

## Quotes are not module items — they are the close

393 published quotes. Zero carry `module_id`, an op code, or a family;
`collection` is null on all of them. The only grouping is `subcategory`: 55
source labels with near-duplicates, which is a byproduct of import, not a filing
system. Do not promote it into one.

**The ruling is arithmetic, not taste.** The item slot is one item per morning,
and 195 items is roughly nine months. Folding 393 quotes into the sequence makes
it 588 — about twenty-seven months, nearly double the top of the "8 to 15
months" claim. Quotes cannot be items without redefining the credential's length.

So a quote is the **completion screen** — the line the advisor carries onto the
drive after the streak advances. It costs no time, it gates nothing, and it is
the only content in the library that works by being read in passing.

## The pitch slot has a supply gate, and it is not the cue gate

Of 19 families in `op_code_family`, **7 have a published pitch film and 12 do
not** — 10 of those 12 are otherwise coachable. The seven that are stocked run
2 to 12 films deep: Belts & Cooling 12, Fluids 12, HVAC 10, Filters 8, Brake
Service 4, Differential 4, Wipers 2.

`lib/coachable-families.ts` gates on published **cues**, which is right for the
cue ladder and wrong here — the pitch slot serves a **film**. Battery has 56
cues and no film; gating on cue depth would put it in the rotation with nothing
to play.

**The derivation ranks only among families that can supply a film**, and a
manual override to a filmless family is refused. `family_pitch_supply` (0123 §1)
is the gate.

**Consequence to hold onto:** an advisor whose real weakest family is filmless
gets remediation on their *second* problem. That is a content gap, not a bug —
and it is why the filming order matters more than it looks.

## The cycle is supply-shaped, not weekly

A family two films deep cannot carry five mornings. The assignment lasts until
its films are consumed, then the next family derives. A calendar week was the
wrong unit.

## "Five minutes or less" is already tight on two slots

Mindset median 1:00 + pitch median 3:43 = **4:43 before the item slot opens**.
At p90 it is **6:50 on two slots**. It holds today only because the item is
necessarily text.

Two consequences: pitch films should target **3:00 or under** going forward, and
the website copy should say *about five minutes* rather than *five minutes or
less*, which is not true at p90.

## Item counts confirmed

195 items across 29 modules, matching this document exactly (56 / 55 / 51 / 29).
Zero of all 249 modules carry a video; no module row has a `mux_playback_id` at
all. The "~25 mornings per track" figure in the 3a prompt was wrong — 195 across
four finished tracks is **48 per track**, which is what this document said.

## The consumption record needed one column, not a rewrite

`content_progress` was already format-agnostic and already prevented a repeat;
0118 had closed the entitlement hole. It gains `source` and nothing else.

## Three track films are owed, not one

Six Craft films exist and **none is named for a core track**. Two of the six are
already wired as pitch-stage fallbacks through `mapping_alias` — promoting those
to track films removes a fallback the pitch slot relies on, so which families
lose cover has to be known before 3b promotes anything. One of the six is
captioned.

Separately: the code has six pitch stages and the films carry four. **Pre-Write
and Objections have never been filmed against an op code.**
