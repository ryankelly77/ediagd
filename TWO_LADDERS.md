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

## Duration budget

Item count *is* the certification's length. One item, one morning.

- 195 items published today across the core eight; 191 of them sit in four finished
  tracks (Walk Around 56, Success Cycle 55, Power of Positive Language 51,
  Overcoming Objections 29).
- At five mornings a week that is roughly nine months — inside the "8 to 15 months" claim.
- Fifteen months is roughly 325 items. That leaves about **134 items for the remaining
  four tracks — roughly 33 apiece**, not the 48 the finished tracks average.

Two assumptions not yet confirmed: five mornings a week (advisors work Saturdays), and
one item per morning. If either changes, every number above changes.

## APPROVED 20 September — the Good News Story

A written account, at track exit, of something the advisor did differently on the drive.
The film opens the track; the story closes it. Eight tracks, eight films, eight stories.

This would take the credential from two legs (attendance, recall) to four (attendance,
recall, **application**, outcome). Attach rate movement is the fourth leg and should be
**reported, not required** — it moves for reasons that have nothing to do with the
advisor, and gating a credential on a number invites gaming it.

**Approved 20 September**: the direction, the placement at track exit, and attach rate
reported rather than required. Built in phase 3e, sequenced after 0123/0124/0125 land.

Two working assumptions not yet confirmed by Mitch — submission counts immediately with
manager review non-blocking, and team sharing off by default — are flagged in the 3e
prompt rather than buried.

**The leg gates a TRACK, not a day.** `dayGate.ts` decides a morning;
`certification.ts` decides a track, and that is where the leg lives. An earlier version
of this document stated the formula ambiguously and the note landed in the wrong file.

If it is approved, three constraints keep it reversible:

1. **The gate is a flag, not a structure** — `itemsDone && quizPassed !== false &&
   (storyRequired ? storySubmitted : true)`. Turning it off is config, not a migration.
2. **Track completion is expressed in exactly one place.** If three components each
   decide what "complete" means, removing a leg means finding all three and missing one.
   Worth insisting on regardless of this feature.
3. **It does not go into the pitch until it is decided.** Selling it and then removing it
   costs more than never building it.

The only genuinely irreversible part is the credential's definition, and no advisor
holds this credential before February — the 8-to-15-month clock starts 1 October.

## Open — Mitch's

1. Which track each film opens. (*The Big Ticket Visit* and *Part 2* are two films; if
   both open one track, one more film is owed.)
2. Track order — fixed for everyone, or set per advisor by the manager?
3. Item budget for the four remaining tracks (~33 each holds the claim).
4. Starting family for an advisor with no DMS history — every Doggett advisor on 1 October.
5. Captions on the eight track films. Only Pre-Write has them; mandatory track entry
   without captions is a different conversation.
6. Which 10 filmless families to film first (see *Settled by phase 3a* below).


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
