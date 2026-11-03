# Ingest, 30 October — report

54 files in the Drop Zone. 12 byte-identical twins, 41 clips from Mitch's
25–26 October shoot, and `MANIFEST.csv`.

Written as the run proceeds. Anything still in flight says so.

## Phase 1 — the twelve September files were all twins

Each of the twelve size-matched exactly one file in `02 - Published`, and all
twelve then matched on **sha-256**. They are in `04 - Archive/duplicates` with
twelve manifest rows appended.

`IMG_2954 2 min walk part 2.MOV` already had a copy in that folder from a
previous recurrence. All three copies — Drop Zone, Published, and the archived
one — hash identically (`3afd5883bdd879e3…`), checked before overwriting, so
the move replaced identical bytes with identical bytes.

**Why they came back at all:** Drive re-syncing Mitch's copies. The folder had
a sibling `04 - Archive 2` present, which is the shape Drive leaves when it
resolves a conflict by duplicating.

## Phase 2 — 41 clips, every one identified from its spoken slate

Four series. No clip needed the transcript-match fallback: series, number and
subject were spoken in every slate.

| series | clips | disposition |
|---|---|---|
| Coverage is Key | 8 | reshoots of live films |
| Power of Positive Language | 15 | new — opener, 13 lessons, closer |
| Overcoming Objections | 2 | new — opener and closer |
| Jeff Becker Service Manager | 16 | **held** |

**Whisper mangled three slates, and the fixes went in the parser, not the data:**
"Series" came back as **"Siri"** (`IMG_3426`), "Power of" as **"Power-up"**
(`IMG_3468`), and `IMG_3418` lost its punctuation. Same class as the rule that a
quote's attribution never comes from a transcript. The series name was read from
"Jeff Becker", which whisper got right on all sixteen.

**The Becker series numbers its intro "Film one" and its first mindset "Number
one",** in different sentences — so a film number alone cannot tell them apart.
Recorded in the hold's README.

## The naming law in INGEST.md is contradicted by the library

INGEST.md specifies `PREFIX — Title — Voice — vN.ext`. Measured over
`02 - Published`: **331 of 481** published files use `PREFIX — Title (Voice) —
vN.ext`, and exactly **one** uses the documented form. Names were proposed in
the form actually on disk — a reshoot named any other way cannot be matched to
its live sibling. The document wants fixing.

## Phase 3 — 25 renamed, 16 held

All 25 renames rested on Mitch's spoken slate, so none was held back for
resting on the transcript alone. `IMG_3462` and `IMG_3468` had whisper-mangled
series names normalised on the strength of the other 13 slates — slate evidence
corrected by slate consensus, not transcript inference.

The 16 Becker clips are in `05 - Held`, keeping their camera names, with a
README line naming the open question and Ryan as the person who answers it:
*"Where do these belong, and is the series Jeff Becker or 14 Mindsets?"*

## Phase 4 — the dry run, and a routing defect it exposed

25 parsed, 8 REPLACE, 17 new, 0 skipped, 9.79 GB.

**`ROUTES.CRAFT` sent every film to `placement = daily_lifestyle`.** 0131 added
`daily_craft` as slot 3's placement and said calling a craft lesson film
`daily_lifestyle` "would be false about every one of them"; the ingest's routing
table was never updated. Measured before the fix: **116 of the 141** live Craft
films carry `daily_craft`, and all 12 Coverage is Key films do.

It was inert rather than harmless — nothing reads `daily_craft` yet, and the
lifestyle slot also requires `collection = 'Mindset'`, so these films could not
have reached the wrong morning. What it would have produced is 17 rows whose
placement was a false statement about them. Fixed in this PR.

## Phase 4b — the reshoot is a de-branding pass, not an audio fix

**Muffled is 0.0 s on all sixteen files, both takes, every pair.** The
doctrine's deciding statistic cannot separate them, so "the cleaner take wins"
had nothing to weigh. HF median favours v2 everywhere by 1.0–8.6 dB, and
TMB-039 is on record that median is *not* the statistic that decides.

So the uniformity was chased rather than trusted, and it is the finding:

- v1 names **MOC / mockproducts.com in 6 of 8**. v2 names it in **0 of 8**.
- Five v2 takes say **"the chemical company"** instead; v1 says it never.
- The voice moves from first person to third: v1 *"my stuff went into that
  vehicle"*, *"we're going to pay"* → v2 *"whatever the customer would have
  paid, that's what **they** pay"*.

| film | v2/v1 length | Δ | v2/v1 HF median | Δwords |
|---|---|---|---|---|
| Opener | 64.9 / 95.0 s | **−30.1** | −30.4 / −31.4 dB | **−58** |
| Part 1 | 92.1 / 100.1 s | −8.0 | −27.1 / −30.5 | +3 |
| Part 5 | 113.0 / 125.3 s | −12.3 | −26.1 / −32.1 | −15 |
| Part 6 | 124.1 / 130.4 s | −6.3 | −26.7 / −35.3 | −20 |
| Part 7 | 101.6 / 108.8 s | −7.2 | −28.3 / −33.6 | +15 |
| Part 8 | 106.4 / 146.0 s | **−39.6** | −28.3 / −35.4 | **−112** |
| Part 9 | 95.7 / 101.7 s | −6.0 | −28.1 / −34.8 | 0 |
| Closer | 90.0 / 77.7 s | +12.3 | −28.0 / −29.4 | +28 |

Ryan's ruling: all eight replace in place, newer stays, the de-branding removes
the vendor's own program detail on purpose.

**Checked against the eighteen-file trap first.** The incoming lengths are
whisper's untrimmed audio and `duration_sec` is the trimmed Mux asset —
different quantities, and several pairs differ by 4–11 s, exactly slate range.
All eight were size-compared against every published master: **no byte-identity.**
Genuine take-2 recordings.

### A question for Mitch, which did not hold the upload

**The Opener is not a retake, it is a different film.** v1 is the origin story —
*"the second class I ever wrote… southeast Texas… 'why would I use your fluid
when I could just use Toyota Fluid?'… the answer was hidden in fine print on a
brochure. The word was coverage."* None of that is in v2, which opens on *"the
service they bought last month came with a warranty and nobody told them."*

**Does the origin story come back, in the de-branded voice?** The v1 master is
in `04 - Archive`, named with what superseded it.

Part 8 also drops three concrete things: *"we'll pay for the deductible"*, the
reset-the-clock mechanism, and the claim URL.

## Phase 5 — applied

**The eight replaces: 8 of 8 swapped, each cut before it went live.**

Cut from its own disk file at its slate point (measured by `slate-timings.py`,
4.09–9.07 s, lead-in 0.35 s), uploaded, gated, swapped once — already cut, with
the v2 `canonical_filename` and version. The live v1 row was never pointed at an
uncut v2 asset. Sync gate on every one: **−37.9 to −38.1 ms**.

Parts 2, 3, 4 and 10 were not re-shot and are untouched at v1.

**Head only in this pass.** The window came from `slate-timings.py`, the only
measurement available for a file with no content row yet. The tails are measured
by `trim:measure` against the now-live assets and cut by `trim:apply`.

**The 17 new films landed as drafts**, uploaded slate-on, and are cut by
`trim:apply` from their disk masters behind the gate before anybody publishes
them.

## Two defects found in freshly-merged code, both fixed in their own PRs

**#88 — the sync gate was comparing the wrong pair.** `replace:video` resolved
the gate's master from the content row, which on a replacement is the take being
superseded. So a v2 asset was measured against its v1 master: 8 of 8 refused,
`unmeasurable`, every live row untouched. Because `unmeasurable` is the cautious
answer it read as the gate working rather than the gate being misfed. Proven
both ways — the same asset passes at −38.1 ms against its own file and refuses
at audio-corr 0.199 against v1, and a stream-copy cut is still refused at
−993.6 ms.

**#89 — nothing in the repo performed a cut.** #87 removed the trim flags from
`replace:video` and documented `trim:apply` as the cutter, but left
`trim-apply.ts` passing the removed flags, and that file had no ffmpeg in it.
`lib/video/cut-master.mjs` is now the one cutter, used by `trim:apply` and the
sync repair. Lifting it fixed a drift the copies had already acquired:
`sync-repair.mjs` requested captions at the top level of `new_asset_settings`,
where Mux silently generates nothing.

## Verticals: 25 pending

The derive is the sync agent's to fix — `derive-vertical.ts` crops from the
whole master, which is the defect #78 fixed in `sync-finish`'s phase 5, in the
other deriver. The cut draft came back `vertical_status = 'failed'` for exactly
that reason: a ~148.9 s vertical against a 127 s landscape, refused by its own
duration check. Nothing wrong is served — a failed vertical mints no token and
the phone letterboxes the landscape.

## Burndown: what Mitch still owes

Of the ~16 films on the list, **2 arrived** (Objections opener and closer), and
Power of Positive Language arrived as **15** rather than 9.

Still owed, none of them in this batch:

- **Walk-Around Part 7, The Handback** — module 13 of 13, the only cue-only gap
  in that track, and until it exists Walk Around cannot be completed as a track
- **Walk-Around opener and closer**
- **The 2748 and 2821 menu recuts**

And **24 clips arrived that were not asked for**: the 16 Becker films and the 8
Coverage is Key reshoots.

## Power of Positive Language is not a complete track of nine

It is **15 films**: an opener, **13** lessons, and a closer. The track had 7
cue-only modules. Ryan's ruling: each film becomes its own lesson in Mitch's
part order, the 7 cue modules stay as reinforcement, opener to
`entry_film_content_id`, closer last.

Migration **0173** creates 13 lesson modules at sort 1–13 and the closer at 21,
moving the cue modules to 14–20. It applies from `main` — `db:migrate` refuses
off-main by design, which is correct: a migration reaches production from the
deploy path.

The certification is `item_count 0, active false`, so publishing is what
activates the track.

---

# Phase 7 — the run is over

## Per-file disposition

| what | count | where it went |
|---|---|---|
| September twins | 12 | `04 - Archive/duplicates`, byte-identical, manifest rows |
| Coverage is Key reshoots | 8 | replaced their rows in place at v2; masters to `02 - Published/Craft` |
| the v1 masters they superseded | 8 | `04 - Archive`, renamed "(superseded by v2)" |
| Power of Positive Language | 15 | new **drafts**, masters in `02 - Published/Craft` |
| Overcoming Objections opener/closer | 2 | new **drafts**, masters in `02 - Published/Craft` |
| Jeff Becker Service Manager | 16 | `05 - Held`, camera names kept, README names the question and Ryan |

**The Drop Zone holds `MANIFEST.csv` and nothing else.** 154 data rows, up from
109; the file parses as valid CSV, checked by reading it back with an
RFC4180 reader rather than by looking at it.

## Counts by state

- reshoots replaced in place: **8**
- new drafts created: **17**
- files held: **16**
- twins archived: **12**
- rows retired: **0**

## Integrity check — the published count, read from the database

**published `advisor_video`, not retired: 442.** It did not move for this batch,
which is what a batch of reshoots-plus-new-drafts should do: the 8 reshoots
replaced published rows **in place**, so no row was added or retired, and the 17
new films are **drafts**. Draft count is 20, of which 17 are this run's.

`rows retired by this batch: 0` — verified, not assumed. Replace-in-place keeps
the content id, so every `content_progress` row and every
`daily_completion.video_content_id` stays attached.

## Trim verification, derived from durations

| | |
|---|---|
| cut | 16 of 16 |
| failed | 0 |
| came back the right length | 16 |
| length mismatch | 0 |
| captions confirm clean | 15 |
| captions unverified | 1 (word not transcribed — not a failure) |
| dead air removed | 4.3 minutes |
| progress rows before / after | 28 / 385 / 232 → 28 / 385 / 232 |

The 8 reshoots were cut **before** the swap, so none went live with its slate
on. Independent re-measurement reads `head = 0` on all eight. Ledger rows were
written for every cut, keyed on the asset that was cut.

**No double cut, by construction rather than by care:** re-measuring the already
cut draft read `head = 0, no cut proposed`, because the plan measures the
**served asset**. An already-cut film has no dead air to find.

## Power of Positive Language — attached

21 modules, **14 carry a film**: lessons 1–13 in Mitch's part order and the
closer at 21. The seven cue modules sit at 14–20 as reinforcement, untouched.
The opener is the certification's `entry_film_content_id`.

`item_count 0, active false` — publishing is what activates the track, and that
is Ryan and Mitch's step in admin.

## Phone versions: 25 pending

**24 of 25 are `ready` and measured correct** — every vertical checked matches
its landscape within 0.18 s, 26 of 26, no mismatches. One is `failed` with no
vertical asset: `Power of Positive Language, Part 1`, the film cut first as the
standalone proof. `vertical_derivation_queue` selects
`('pending','stale','failed')`, so it is picked up once the schedule returns.

**A correction to an earlier claim in this run.** I reported that all 25 would
land `failed` because `derive-vertical.ts` crops from the whole master. Measured,
that did not happen: 24 of 25 are correct. The extrapolation was from one early
failure and one line of code, and the measurement contradicts it. The deriver is
the sync agent's to fix.

## Newly servable, once published

Thirteen `Power of Positive Language` lessons, its opener and closer, and the
`Overcoming Objections` opener and closer. Nothing is advisor-visible until
somebody publishes it.

## Reminder

**17 drafts await publishing in admin.**

## Holds needing a ruling

1. **The sixteen Jeff Becker films.** Where do they belong, and is the series
   *Jeff Becker* or *14 Mindsets*? The slate is unambiguous and the destination
   is not. Manager Meetings holds a 17-film `Bank Account` series on the
   identical intro + numbered body + outro shape.
2. **The Coverage is Key Opener's origin story.** v1 is a different film, not a
   retake — *"the second class I ever wrote… why would I use your fluid when I
   could just use Toyota Fluid?… the answer was hidden in fine print on a
   brochure. The word was coverage."* Does it come back in the de-branded voice?
   The v1 master is in `04 - Archive`.
3. **Part 8 dropped three concrete things**: the deductible payment, the
   reset-the-clock mechanism, and the claim URL.

## Corrections to statements made earlier in this run

- I said all 25 phone versions would fail. **24 of 25 are ready and correct.**
- I said the eight replaces would need a second pass for their tails. Measured
  after the swap, the tails are 0.08–1.67 s, inside tolerance: **no second pass.**
- I wrote the eight manifest rows with a raw `printf`, leaving the filename
  field unquoted; six of the eight filenames contain a comma, so six rows parsed
  as nine fields. The repair then turned nested quotes into `+`. Both fixed, and
  the reason text now carries no quote characters at all — a field that cannot
  contain the delimiter cannot be mis-escaped by the next person writing it.
- My first attempt at the eight ran before #88 was merged into this branch, so
  the old gate refused two of them again and stranded one extra asset. All nine
  stranded assets were deleted.

## What Mitch still owes

- **Walk-Around Part 7, The Handback** — module 13 of 13, the only cue-only gap
  in that track; until it exists Walk Around cannot be completed as a track
- **Walk-Around opener and closer**
- **The 2748 and 2821 menu recuts**

## Two documents that disagree with the code

1. **The naming law.** INGEST.md specifies `PREFIX — Title — Voice — vN.ext`;
   **331 of 481** published files use `PREFIX — Title (Voice) — vN.ext` and
   exactly **one** matches the document.
2. **`derive-vertical.ts`** crops from the whole master while INGEST.md's trim
   doctrine says a cut comes from the disk master at the served window. The sync
   agent owns it.
