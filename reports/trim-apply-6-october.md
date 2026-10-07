# The dead air is gone: 252 films cut, 64 minutes removed

*Applied 6–7 October 2026 against production by `npm run trim:apply`, in the
priority order Ryan set. `reports/trim-pass.json` is the ledger,
`reports/trim-plan-approved.json` the plan it was cut from.*

---

## Before and after

| | before | after | removed |
|---|---:|---:|---:|
| the 252 cut films | **9.67 h** | **8.59 h** | **64.4 min** |
| share of those films | | | 11.1% |
| mean per film | | | 15.3 s |
| longest single cut | | | 26.5 s |

| | |
|---|---:|
| films cut | **252** |
| came back the length the cut asked for | **252 / 252** |
| **length mismatches** | **0** |
| cut at both ends | 184 |
| head only | 21 |
| tail only | 47 |

| collection | films |
|---|---:|
| Craft | 124 |
| Menu | 90 |
| Pitches by Op Code | 26 |
| Mindset | 11 |
| Onboarding | 1 |

**`module_completion` unchanged at 5.** `content_progress` 91 → 92 and
`watch_gate` 55 → 56 — both are one real advisor (`c5e6ee88`) opening a film at
17:48 on 6 October, not the pass. Every individual run also reported no movement
inside its own window.

**All 447 published films have a ready vertical and a ready English caption
track.** No film lost its captions.

---

## The film Ryan reported

| | before | after |
|---|---|---|
| duration | 100.576 s | **80 s** |
| first frame | Mitch looking down, not addressing camera | **Mitch mid-"Aloha"** |
| head before the greeting | 17.40 s | **0.10 s** |
| tail after the sign-off | 4.45 s | **0.63 s** |

Twenty-two seconds of a hundred-second film, gone. Frames in
`reports/trim-frames/`.

---

## Did the cuts land where they were meant to?

Two separate questions, and they have different answers.

**Did each film come back the length the cut asked for?** Yes, 252 of 252, zero
mismatches. This is the load-bearing check: it is derived from what happened,
needs nothing to be transcribed, and is available for every film.

**Is the dead air actually gone?** Measured on the new assets — captions first,
then word-level timing for everything captions could not settle. **All 252
measured, 245 tight, 7 not:**

| film | head | tail | why |
|---|---:|---:|---|
| Coverage is Key, Part 8 | **10.00** | 0.67 | head deliberately **not cut** — `small.en` could not hear its Aloha, so nothing was proposed. Wants your ear. |
| Success Cycle, Part 1, Not a Rut Team | 1.98 | 0.61 | cut landed; the original Aloha measurement ran ~1.7 s early |
| All for One and One for All… | 1.94 | 0.61 | same |
| Menu Wrap-Up, Part 1 | 1.84 | 0.59 | same |
| Lasting Impressions, Part 2 | 1.44 | 1.66 | head as above; tail **not cut** — the two passes disagreed about Mahalo |
| Coverage is Key, Part 6 | 1.36 | 0.60 | ~1 s early |
| Your Toughest Opponent… | 0.00 | — | head clean; tail **not cut**, no sign-off in the film |

Five films carry 1.4–2.0 s of lead-in instead of the intended 0.3 s. Not worth
re-cutting — a second of Mitch settling beats the 10–17 s they had, and a second
cut risks clipping the "A". **Coverage is Key, Part 8 is the one that still has
a real problem**, and it has it because the pass refused to cut a head it could
not measure, which is the behaviour you want.

A caption reading alone was never enough: of five films the caption check called
"outside the ceiling", word-level found **one of them clean** — the cue boundary
was out by a second, which is exactly why the measure pass refuses to cut on
caption numbers.

---

## What the run order bought

Ryan's priority, so invites could go out before the whole library was done:

| group | films | |
|---|---:|---|
| 1. Welcome from Mitch | 1 | ✓ |
| 2. Item slot, days 1–6 | 3 | ✓ |
| 3. Pitch slot — every `daily_pitch` | 23 | ✓ |
| 4. Mindset — every Mindset film | 10 | ✓ |
| 4b. Tail-only remainder | 3 | ✓ |
| **invite gate** | **40** | reached in 2.7 h |
| 5a. Rest of the item slot | 7 | ✓ |
| 5b. Craft curriculum | 77 | ✓ |
| 5c. Menu + mileage shelf | 88 | ✓ |

**The Four Minute Walk-Around Parts 1–3 needed no work** — already measured
fine, heads 0–0.31 s. So days one to three of the item slot were clean before
the pass started.

**The pitch and mindset simulations were deliberately not run.**
`advance_focus_family` is not a read: it `UPDATE`s `advisor_focus_family` to end
the current assignment and derives a new one. Running it for seven accounts over
three mornings would have locked seven real advisors onto focus families before
they opened the app. So those groups are **every** pitch film and **every**
mindset film — a strict superset of anything the pick could return, at a cost of
132 minutes. The mindset slot, for the record, is **not random**: it is a
deterministic FNV-1a hash of (user, pool, cycle, content id) with a per-advisor
cursor.

---

## Five interruptions, and what they taught

The background runs were killed five times — twice by me, three times by
something outside the process, at 117 and 55 minutes and once mid-group. Not a
fixed timeout, and I never saw the cause.

**No film was cut twice and nothing was lost.** The ledger is keyed on the
`mux_asset_id` that was cut, and before each cut the row's current asset is
compared against the one the plan measured — so a film already cut is refused
rather than re-cut on offsets that no longer mean anything.

**But a refusal is not a record.** `replace:video` runs clip → swap →
derive-vertical, so a kill landing after the swap leaves a film cut, unledgered,
and with a stale vertical. That happened five times. `trim:reconcile` now
recovers it on **two independent witnesses** — the archived asset equals the one
the plan measured, and the duration matches what the cut asked for — and
refuses anything where only one holds.

Writing that rule down immediately caught a flaw in it. Six rows reported a
length match on films **nobody had touched**: `duration_sec` is rounded, so for
any cut removing less than a second the *original* length already sits inside
the tolerance. *Your Toughest Opponent* is 31.34 s, the cut asks 30.42 s, and
the untouched row reads 31. Had either witness been enough, six uncut films
would have been recorded as cut and skipped forever. The duration now only
counts once it has moved from the original.

The reconciler also missed half the damage at first: it restored ledgers and
said nothing about verticals, leaving **two invite-gate films serving phones a
letterboxed master**. It now checks every ledgered film's rendition and exits
non-zero.

---

## Two bugs in existing scripts, found by using them

**`transcripts:backfill --force` never reached the pass it exists for.** One
line honoured `FORCE`; the next re-applied the exact condition `FORCE` overrides,
so the Mux caption pass could never re-read a film that already had a transcript
— which is every published film. It printed *"filled this run: 0 … published
films with a transcript now: 447"*, which reads as success and means nothing was
re-read. Every cut film still held the transcript of its uncut take.

**And fixing it exposed a defect our own cut had created.** The trim leaves a
0.3 s beat before "Aloha" on purpose, so the "A" is not clipped. That sliver of
the slate's last syllable is enough for Mux's caption model to expand into the
whole sentence:

```
00:00:00.000 --> 00:00:00.100
Multipoint inspection set up part one, the easiest sell you'll ever make.
```

Seventy-three characters in a tenth of a second. On screen it is a one-frame
flash; in `content_transcript` it is not, because the timings are dropped — so a
sentence **not in the film** entered the store the blog corpus reads.
`vttToText` now discards any cue whose text cannot fit its interval, keyed on the
rate rather than on "the first cue", so it closes the class rather than the case.

**130 of 447 films carried such a cue** after the pass. Without the fix, 130
transcripts would describe a take nobody is served.

---

## Afterwards

| | |
|---|---|
| `transcripts:backfill --force` | 447 refilled from Mux, 130 implausible cues dropped |
| `stills:backfill --force` | 447 written, 0 errors, no black frames |
| `captions:sync` | 447 of 447 correct, nothing to write |
| verticals | **447 of 447 ready** |

**Skipped, as ruled:** `25,000 Mile Dealer Upsell Menu (2748)` and `70,000 Mile
Dealer Upsell Menu, Part 2 (2821)` — not trim problems. One ends mid-sentence,
the other on an outtake. Ryan is unpublishing both for reshoot.

**Still open for a ruling:** the three no-greeting films, the four no-sign-off
films, and the four the model cannot measure — listed in
`reports/trim-measure-5-october.md`, unchanged by this pass.
