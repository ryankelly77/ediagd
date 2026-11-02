# Ingest run — three Cabin Air Filter reshoots

Briefed as the 5 October run; executed 11–12 October. Mitch reshot two of the
CAF-002 deck's four films and split the kiosk film in two.

---

## Per-file disposition

| file as dropped | renamed to | identified_by | route | action |
|---|---|---|---|---|
| `IMG_3259.MOV` | `CAF-002 — At the Kiosk — v2.mov` | slate | `replace:video` onto `21255996` | **replaced** — published, v1 → v2 |
| `IMG_3262.MOV` | `CAF-002 — MPI Setup — v2.mov` | slate | `replace:video` onto `64b33bb7` | **replaced** — published, v1 → v2 |
| `IMG_3260.MOV` | `CAF-002 — At the Kiosk, Part 2 — v1.mov` | slate | `ingest:videos` → new row `142cef75` | **new draft, parked** with a `library_reason` |

Counts: **2 reshoots replaced · 1 new draft · 0 held · 0 failed.**

### Integrity check

**Published `advisor_video` rows: 445 before, 445 after.** Two in-place
replacements and one draft — the count must not move, and it did not. Stale
verticals across the library: **66 before, 66 after** — every vertical this run
marked stale was re-derived and verified before the run ended.

---

## The kiosk ruling, as applied

Ryan ruled **two films**, against the brief's default of joining them. The
transcripts are why:

- Part 1 carries its own slate, its own Aloha **and its own Mahalo** — a
  complete film by this pipeline's own head/tail doctrine.
- Part 1 closes *"At the kiosk **part two** is coming up next. That's where
  we'll put it on the menu. Mahalo."*
- Part 2 opens with its own slate and Aloha, then **recaps before advancing**:
  *"you know the interval and you know the number and you know the rules. So
  let's put that Cabin Air Filter right on the menu."*

Recap-then-advance is authored two-parter, not one take split mid-thought.
Joining them would have put a Mahalo and a second Aloha mid-film and left it
announcing a Part 2 that was itself.

### Part 2 is a parked draft, and the placement Ryan asked for does not exist

The ruling was: published, with a placement that keeps it out of the loop's
pitch slot but on the service shelf and in the library — *"if no such placement
exists, park it as a draft with a `library_reason` and say so."*

**No such placement exists.** `pickPitch` does not filter placement itself; it
calls `loadFamilyContent`, which reads `service_family_content` — and so does
`/service/[family]`. `lib/service-family.ts` builds the `films` array **once**
and hands the same list to both callers, with its own comment saying that is
deliberate: *"Same rule the pitch slot applies… it is here so the screen and the
loop cannot drift apart when one of those becomes false."*

So every lever moves both surfaces together:

| lever | pitch slot | service shelf |
|---|---|---|
| `placement = 'daily_pitch'` | serves it | shows it |
| `placement = 'reference'` | excluded (0128) | **also excluded** — 0128 drops it from both arms of the view |
| `coachable = false` / `via ≠ op_code` | excluded | **also excluded** — same `continue` in the same loop |

And the Lesson Library is module-based: **all four CAF-002 films have
`module_id` null**, so none of them has ever been in it.

Part 2 is therefore `status = draft` with the whole of the above written into
`content.library_reason`, including what would release it: either a seam
between the pitch slot and the shelf, or a module so the library can carry it.

---

## Before and after

| row | stage | v1 | v2 | change |
|---|---|---|---:|---:|
| `21255996` At the Kiosk | At the Kiosk | 314 s | **82 s** | −232 s |
| `64b33bb7` MPI Setup | MPI Setup | 158 s | **110 s** | −48 s |
| `142cef75` At the Kiosk, Part 2 | At the Kiosk | — | **142 s** (draft) | new |

The kiosk stage as a whole: **314 s serving → 82 s serving, with 142 s parked.**

---

## Why the replacements went ahead on a 30% content shortfall

Measured Aloha→Mahalo with the same instrument on both sides:

| stage | live v1 | new | delta | words |
|---|---|---|---|---|
| At the Kiosk | 312.2 s | P1 80.8 + P2 140.7 = 221.5 s | −90.8 s (−29%) | 803 → 658 |
| MPI Setup | 155.8 s | 108.8 s | −47.0 s (−30%) | 465 → 349 |

That is Phase 4b's second hold, and it was put to Ryan before anything was
applied. His ruling: *"Replace both. Mitch reshot them on purpose, the new takes
are his current teaching, and the audio is in a different class. What the new
takes drop goes to Mitch as a note, not back into the pipeline."*

The audio, which is not in dispute — every incoming take is cleaner on every
statistic:

| film | median | worst | muffled |
|---|---|---|---|
| Kiosk P1 (new) | −31.2 dB | −42.7 | **0.0 s (0.0%)** |
| Kiosk P2 (new) | −30.7 dB | −41.1 | **0.0 s (0.0%)** |
| MPI Setup (new) | −31.4 dB | −40.0 | **0.0 s (0.0%)** |
| At the Kiosk v1 | −33.5 dB | −58.2 | 15.1 s (4.8%) |
| MPI Setup v1 | −36.7 dB | −62.6 | **25.7 s (16.4%)** |

The retired MPI Setup was worst −62.6 dB against the −64 dB worst-in-library
calibration point, with a bad passage at 2:09–2:16.

### The note for Mitch — teaching the new takes drop

Not a pipeline item. These are blocks present in the retired v1 and absent from
both new takes:

**At the Kiosk**
- *Say the brand.* "A brand new Toyota one, a brand new BMW one, a brand new
  Motorcraft one… the difference between something a customer could grab off the
  shelf at Walmart and something that came from the people who built their car."
  It pre-answers the price objection before it is raised.
- *"Happy birthday to your Camry"* as the framing for the annual AC evaporator
  cleaning — "it makes the service feel like a gift rather than a repair."

**MPI Setup**
- The glove-box teaching: the filter lives behind it, *don't* pull it on the
  drive, it is time-consuming.
- The vividness: "leaves are in it, pine needles, sometimes whole seed pods,
  sometimes they can be pretty hairy. It looks exactly as bad as it is."
- The engine-air-filter pairing on the third item — "Hector's already pulling
  that cabin air filter, he's going to be looking at the engine air filter."
- The payoff: "most people don't ever go through their glove box… so that photo
  isn't just evidence, it's news to them."

What the new takes **add**, for balance: the 25,000-mile → 20%-airflow number
and the defroster-in-January framing; the 30,000-mile compressor warranty on the
AC treatment; and in MPI Setup a good closing line — *"notice what you still
haven't said a word about: the smell of their car. Hector's photo will do the
heavy lifting."*

---

## Trim verification — from durations, and from the ends

Every cut verified twice: the arithmetic, and a read of the finished master.

| film | untrimmed source | cut | expected | **live** | head air | tail air | opens / closes |
|---|---:|---|---:|---:|---:|---:|---|
| At the Kiosk | 98.67 s | 12.10 → 93.86 | 81.76 | **81.76** | 0.30 | 0.50 | Aloha! / Mahalo! |
| MPI Setup | 125.14 s | 10.90 → 120.70 | 109.80 | **109.80** | 0.23 | 0.49 | Aloha. / Mahalo. |
| At the Kiosk, Part 2 | 156.94 s | 10.60 → 152.32 | 141.72 | **141.72** | 0.17 | 0.49 | Aloha! / Mahalo. |

`trim:verify`, landscape rendition, 3 s window: **3 verified, 3 pass, 0 fail.**
Each vertical was also read before it was accepted — `derive:vertical` refuses a
crop whose ends do not match.

Part 2's head air of 0.17 s is the tightest of the three. It clears the 0.15 s
floor and is noted rather than re-cut.

### Ledger rows backfilled

`replace:video` trims inline and writes no ledger row, so all three were written
by hand into `reports/trim-pass.json` — **284 → 287 entries** — each keyed on the
asset it was cut from, each carrying the `trim:verify` head and tail and a
`backfilledBy` line saying it was written by hand and why.

---

## Verticals

All three cleared **within the run** — none left pending, nothing handed to the
cron:

| film | vertical | checked |
|---|---|---|
| At the Kiosk | `Um02rgvEUVBxFA…` ready | 81.93 s vs master 82 s, Aloha!/Mahalo. |
| MPI Setup | `uFxlQK1ZOLYRcF…` ready | 109.93 s vs master 110 s, Aloha!/Mahalo. |
| At the Kiosk, Part 2 | `FwHsPH8JbZ00Cm…` ready | 141.97 s vs master 142 s, Aloha!/Mahalo! |

`derive-vertical` refused nothing.

---

## `replace:video` now keeps the untrimmed upload

Carried in from PR #59. The fix is **ordering, not new SQL**: when a run both
uploads and trims, the row is swapped twice — untrimmed upload first (carrying
the version and canonical name), clip second (carrying neither, per 0107, since
a trim is the same take cut differently). `replace_master_asset` already copies
the current `mux_asset_id` into `archived_asset_id`, so the second swap leaves
the untrimmed generation behind.

Proven on the first real film:

```
Untrimmed upload recorded first: {"archived":"X5rVJTKvIBhMJe…"}   <- the old v1 asset
Swapped.                         {"archived":"QF01G7y6ZBnKNw…"}   <- the untrimmed v2 upload
```

| row | `archived_asset_id` now | which is |
|---|---|---|
| At the Kiosk | `QF01G7y6ZBnKNw…` | the untrimmed v2 upload |
| MPI Setup | `e98DVFUm9JfKyl…` | the untrimmed v2 upload |
| At the Kiosk, Part 2 | `IesmnEyCN7IMYW…` | the untrimmed ingest upload |

**A second-order fix made during the run.** The change as first written swapped
the upload in *before* the clip was created — which would have left the
published row serving the untrimmed take, spoken slate and all, for the several
minutes Mux takes to transcode. A fix for a bookkeeping gap must not put a slate
in front of an advisor's morning. The upload's id is now held in a local and
both swaps happen back to back after the clip is ready.

**The cost, stated in both the script and `INGEST.md`:** the row stops pointing
at the superseded v1 asset. That is the lesser loss — v1's master is on the shelf
at `04 - Archive/CAF-002 — At the Kiosk — v1 (superseded by v2).mov`, while the
untrimmed v2 upload had no record anywhere.

---

## Transcripts

`content_transcript` held the **v1** text for both replaced rows — stale the
moment the asset changed, and read by the blog corpus and the caption work. The
two rows were cleared and refilled through `transcripts:backfill` from Mux
captions on the new assets, then checked to be the v2 text rather than assumed:

- At the Kiosk now opens *"Aloha, even if a pre-write or walk around didn't get
  completed…"* (217 words) — the new Part 1, not the retired v1.
- MPI Setup now opens *"Aloha! Say you didn't do pre-write…"* (343 words).

Published films with a transcript: **445 of 445, 0 null.**

Part 2 has none, correctly — the backfill scans published films and Part 2 is a
draft. It will fill when Part 2 is published.

---

## Drop Zone

**Not empty, by ruling.** It holds **17 `IMG_*.MOV` files and `MANIFEST.csv`.**

The brief described three files; there were nineteen when the run started, and
**IMG_3290 arrived during the run** (16 at inventory, 17 at ingest). Ryan ruled:
*"The 16 files from this morning are a separate run. Do not touch them."* They
have not been transcribed, renamed, moved or uploaded.

The live `ingest:videos` pass confirms they were never at risk — **"DID NOT
PARSE — skipped, not guessed at: 17"**, and `parsed: 1`.

`MANIFEST.csv` is dated 26 September and mentions none of them.

---

## Two films recorded as unreadable — for t29

PR #59 left **five** films alone, not three, in two groups with different
reasons. Ryan ruled the Mindset trio for re-cutting and these two to be
recorded:

| film | content id | master asset | why |
|---|---|---|---|
| At the Kiosk (**BAT-033**, 168 s) | `74f7fb33-6cf9-49d4-a9c4-7678841c6e4c` | `I4FoDi02nSQalG1vl9atQ201gjJlOpVhdK1TzgDebef88` | re-read on the master failed the same way twice — **partial pull: 6.80 s came back of a 10.00 s window**. No third read was taken. |
| Piggyback (179 s) | `0298ebf1-89dc-40a5-9399-277b17693cec` | `uctYJRVODz900DmBnFTVze4hkfKaFN4PrPh5Y1a9IwYA` | same — **partial pull: 6.75 s of 10.00 s**. |

Both are `no sign-off` — no Mahalo was heard — so their tails are kept by rule
and neither has a head or tail reading at all. **They are not known to be
mis-trimmed; they are known to be unmeasured.**

**Worth knowing before anyone picks this up:** #59's report identifies films by
title, and *"At the Kiosk"* matches **23 live rows**. This one is BAT-033 at
168 s. It is **not** the CAF-002 film this run replaced — checked, because the
collision would have been silent.

---

## CAF-002 deck

| stage | film | version | duration | status | vertical |
|---|---|---|---:|---|---|
| On the Drive | On the Drive | v1 | 298 s | published | ready |
| MPI Setup | MPI Setup | **v2** | **110 s** | published | ready |
| At the Kiosk | At the Kiosk | **v2** | **82 s** | published | ready |
| At the Kiosk | At the Kiosk, Part 2 | v1 | 142 s | **draft, parked** | ready |
| After-MPI | After-MPI | v1 | 228 s | published | ready |

**Complete** — four published films across the four stages, unchanged in
coverage.

**Newly servable (op code, stage) pairs: none.** Both replaced films were
already serving; this batch changed what is served, not whether. Part 2 is
parked and serves nothing.

**Still exposed on this deck:** `On the Drive` and `After-MPI` remain v1 with no
voice in their canonical names, so `identityOf()` cannot match a future reshoot
of either — the known gap on the 2 October list. The two films this run touched
kept the same no-voice form deliberately: **adding "Mitch Hardt" would have
broken the identity chain** and made the *next* reshoot undetectable, since
`identityOf()` strips only the `— vN.ext` suffix.

**Punch-list burndown:** not reported. Mitch's outstanding filming list was not
loaded in this run and I am not going to estimate it.

---

## Corrections made during the run

1. **I had `IMG_3260` (156.9 s) pegged as the MPI Setup reshoot** on durations
   alone, because the live MPI Setup is 158 s. The slate says it is Kiosk Part 2;
   the 125 s file is the MPI Setup. A coincidence that looked like a finding —
   caught before it reached a proposal.
2. **The first transcription returned `IMG_3259` as three flat 30-second
   chunks**, so its reported `aloha_at` of 8.43 s was the *first sound*, not the
   Aloha. A word-level re-read puts the Aloha at **12.40 s**. Cutting on 8.43 −
   0.3 would have published a film opening with 4.3 s of spoken slate.
3. **The `archived_asset_id` change, as first written, would have served the
   untrimmed take** for the length of a Mux transcode. Reordered before anything
   was applied; see above.
4. **The brief says PR #59 left three films alone; it left five**, in two groups.

---

## Repository

```
## main...origin/main
 M INGEST.md
 M reports/trim-pass.json
 M reports/trim-verify.json
 M scripts/replace-video.ts
```

`.venv-whisper/` and `reports/dropzone-transcripts.json` are both gitignored and
out of the commit, confirmed with `git check-ignore`.

---

## Open — needs a ruling

**The Mindset trio cannot be re-cut from their archives.** See the section in the
hand-off message; the archive is a *different take* for two of the three, and
the archive route was already tried and failed for the third.
