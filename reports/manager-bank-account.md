# Manager Bank Account — ingested, trimmed, published

*14 October 2026. Mitch's seventeen-film manager series, from Drop Zone to a
tile Patterson and Reck can open.*

---

## Per-file disposition

All seventeen: **renamed → ingested → trimmed → published**. No holds, no
failures, no replacements.

| # | dropped as | published as | was | now |
|---|---|---|---:|---:|
| 01 | `IMG_3285` | Bank Account 01, Introduction | 102 s | **94 s** |
| 02 | `IMG_3287` | …02, Deposit 1, Keeping Your Word | 121 s | **113 s** |
| 03 | `IMG_3290` | …03, Withdrawal 1, Breaking Promises | 110 s | **103 s** |
| 04 | `IMG_3291` | …04, Deposit 2, Giving Credit | 125 s | **118 s** |
| 05 | `IMG_3294` | …05, Withdrawal 2, Taking Credit | 134 s | **127 s** |
| 06 | `IMG_3296` | …06, Deposit 3, Communicating Honestly | 139 s | **131 s** |
| 07 | `IMG_3297` | …07, Withdrawal 3, Avoiding Hard Conversations | 134 s | **126 s** |
| 08 | `IMG_3299` | …08, Deposit 4, Having Someone's Back | 126 s | **119 s** |
| 09 | `IMG_3300` | …09, Withdrawal 4, Making People Afraid to Make Mistakes | 140 s | **132 s** |
| 10 | `IMG_3301` | …10, Deposit 5, Giving Feedback With Respect | 155 s | **148 s** |
| 11 | `IMG_3302` | …11, Withdrawal 5, Changing Expectations Without Explanation | 152 s | **142 s** |
| 12 | `IMG_3304` | …12, Deposit 6, Admitting When You're Wrong | 159 s | **151 s** |
| 13 | `IMG_3306` | …13, Withdrawal 6, Asking for Trust You Haven't Earned | 160 s | **151 s** |
| 14 | `IMG_3308` | …14, Deposit 7, Listening Before Reacting | 163 s | **156 s** |
| 15 | `IMG_3310` | …15, Withdrawal 7, Leading Differently Depending on Who's Watching | 153 s | **143 s** |
| 16 | `IMG_3312` | …16, Deposit 8, Showing Up When It Matters | 132 s | **125 s** |
| 17 | `IMG_3313` | …17, Outro | 83 s | **76 s** |

`identified_by: slate` for every one. **2 minutes 12 seconds** of spoken slate
removed across the series.

**The series verifies its own completeness.** The outro says *"we've gone
through all of them — eight deposits, seven withdrawals."* That is exactly what
arrived, plus an introduction and the outro. Nothing is missing and nothing is
spare.

---

## Counts

| | |
|---|---|
| new drafts created | 17 |
| reshoots replaced | 0 |
| held | 0 |
| **published `manager_video`** | **17 of 17** |
| verticals derived and verified | **17 of 17** |
| published `advisor_video` | **445, unchanged** |
| Drop Zone | **empty** (`MANIFEST.csv` only) |

The advisor count is the integrity check: this batch adds a new content *type*
and must not have moved the advisor library. It did not.

---

## The route — two edits, and a third that was overdue

- `lib/video/ingest-routing.ts` — `Route.contentType` gains `"manager_video"`.
- `scripts/ingest-videos.ts` — a `MANAGER` route → collection `Manager
  Meetings`, `contentType: manager_video`, `placement: null`.

`placement: null` is safe **by construction**, not by convention: `/meetings`
selects on `type` and nothing else; the type already resolves to the
`manager_meetings` product through `roles_for_content_type` (0010, 0091), so an
advisor cannot read these at all; and every picker that reads placement names a
value this is not. Confirmed on the live rows — **17/17 `manager_video`, 17/17
`placement` null**.

**The third edit.** `scripts/ingest-videos.ts` carried its *own* local `Route`
type beside the one it imports, and it had already gone stale exactly as 0131
predicted: its `placement` union was a literal list of five that never gained
`daily_craft`. 0131's comment names three TypeScript sites that enumerate
placements and "are already stale by two"; this was a fourth. Deleted rather
than extended — the library owns the shape now, and this script cannot disagree
with the router it calls.

## 0164 — the grant

Reverses 0148's deliberate withholding, which was correct on the day it was
written: the films did not exist. Proven on a fixture **both ways** — refuses a
rooftop whose name does not match the id, grants and is idempotent when it does,
asserted by reading the table back. Chain replays 0001 → 0164. Applied to
production; Beaumont holds `advisor_base` and `manager_meetings`, both active.

---

## Trim — and the two the verifier caught

Head and tail measured at **word level on each untrimmed master**, then cut at
Aloha − 0.3 s and Mahalo + 0.7 s.

**The transcripts' `aloha_at` could not be used, and that is the headline.** Nine
of the seventeen reported an Aloha under 1.4 s, which is impossible when the
slate is a spoken sentence. Bank Account 01 reported **1.36 s**; the word-level
read puts the Aloha at **7.90 s**. Cutting on the transcript number would have
published a film opening with 6.8 seconds of slate. The cause is the same one
that nearly spoiled the CAF kiosk film last run: when whisper returns coarse
segments, `aloha_at` is the *first sound*, not the greeting.

Every cut was verified before anything pointed at it — `derive:vertical` reads
the finished clip's ends and refuses a crop that does not open on Aloha and
close on Mahalo. Then `trim:verify` read all seventeen again:

**First pass: 15 pass, 2 FAIL.**

| film | air before Aloha | floor |
|---|---:|---:|
| 02, Deposit 1, Keeping Your Word | 0.061 s | 0.15 s |
| 05, Withdrawal 2, Taking Credit | 0.137 s | 0.15 s |

Both opened on a *whole* "Aloha" — they were tight, not clipped — but under the
standard. Re-cut from `archived_asset_id` through `trim:recut`, which exists for
exactly this and refuses to swap a clip it has just read and found wanting.

**05 fixed by the ordinary rule** — a wider 0.6 s pad: 0.137 → **0.43 s**.

**02 needed the opposite of the rule, and this is the part worth keeping.**
Widening the pad barely moved it: 0.061 → 0.115 s, and `trim:recut` refused the
swap. Measuring the first twelve seconds word by word showed why:

```
   4.82 →   5.34   ' word.'        <- the slate ends
   6.48 →   7.10   ' Aloha,'       <- 1.14s later

   energy, 10ms frames:
     5.40–5.80s   -68 dB   true silence
     5.90–6.30s   -32 dB   A BREATH
     6.30–6.65s   -50 dB   quiet again
     6.70s        -11 dB   the Aloha
```

There is plenty of gap — but a breath sits in the middle of it. The standard pad
reaches **back into the breath**, so the energy reader finds "first sound" there
and measures almost no air. The fix was a **smaller** pad (0.04 s), landing the
cut in the quiet window between the breath and the greeting: **0.061 → 0.30 s**.

> **A pad assumes the air before the greeting is empty. When something is
> sounding in it, a bigger pad makes the reading worse, not better.** The
> instrument to reach for is the energy trace, not a larger constant.

**Final: `trim:verify` — 17 verified, 17 pass, 0 FAIL.** Air before Aloha ranges
0.25 s to 0.72 s; air after Mahalo 0.49 s to 0.62 s; every duration within 0.5 s
of plan.

### Ledger

`replace:video` trims inline and writes no ledger row — incomplete by
construction. **17 rows backfilled** into `reports/trim-pass.json` (284 → 301),
each keyed on the asset it was cut from, each carrying its `trim:verify` head
and tail and a `backfilledBy` line saying it was written by hand and why. The
two re-cuts wrote their own rows through `trim:recut` and were then refreshed
with their final numbers.

---

## A check that was silent about a whole content type

`trim:verify --all` selected **zero** of the seventeen and reported:

```
  verified 0   pass 0   FAIL 0
  opens INSIDE the greeting (< 0.15s of air): 0
```

— which reads exactly like seventeen passes. It enumerated `type =
'advisor_video'`, so it said nothing whatsoever about `manager_video`, and
saying nothing on a terminal is indistinguishable from all clear. Same shape as
`check:nav`'s three silent routes and the stale `Route` union above.

Fixed by **deriving the population instead of listing it**: the selection is now
`format = 'video'`, which is what a film *is*. `manager_video` needed no edit
under that rule and neither will the next type. It now prints its population
before it verifies anything:

```
  population: 462 published film(s) — advisor_video 445, manager_video 17
```

---

## The tile

Driven on **production**, as a real Beaumont manager, after 0164 and the
`checkEntitlement` fix were both live:

![Manager Meetings on production](manager-meetings/meetings-prod.png)

**All topics · Leadership (17)**, in teaching order — which is what the numeric
title prefix buys, since `/meetings` orders by title. The More menu carries the
row under a MANAGER heading.

The temporary manager account used to look at it was removed afterwards and the
removal verified: the auth user is gone, and Beaumont's memberships are the
eleven real people plus the pre-existing Test Advisor.

**Before publication it read "Manager Meetings is coming soon — the section is
built and waiting."** That window is now closed; it was never longer than this
run.

---

## Corrections made during the run

1. **The first trim runner reported all 17 FAILED and had done nothing.** It
   piped `npm` through `rg`, which is not on `PATH` in a non-interactive shell,
   so the pipeline died before `npm` started. Verified rather than assumed: 0 of
   17 had an `archived_asset_id`, durations unchanged, all still draft.
2. **The second runner was killed during film 13, and the log said `[13/17]`
   with no result — which reads as "13 failed, five to go". The database said 13
   were trimmed.** Film 13's swap had completed; the kill landed between the
   swap and its vertical. The real remaining work was four trims and one
   vertical. Resuming from the log would have re-cut a film that was already
   cut, and a double trim is invisible — the film still plays, it just starts
   mid-sentence.
3. **I nearly concluded the content types from a truncated sample.** A
   `select` of all content came back capped at PostgREST's 1000-row default and
   showed "33 published advisor_video", which I almost read as a fact. Counted
   properly: 445 advisor_video, 17 manager_video, 1,964 cues, 384 quotes.
4. **My hypothesis about film 02 was wrong.** I supposed the recording had no
   air between slate and greeting. It has 1.14 s of it — with a breath in the
   middle, which is a different problem with the opposite fix.

---

## Repository

`tsc`, `eslint` (0 errors) and `check:nav` clean. No migration beyond 0164,
which was already applied.
