# Ingest run — 30 September (applied 1 October)

Run end to end per INGEST.md. Both gates held: the proposal was confirmed before
any rename, and the dry-run table before any upload. Nothing advisor-visible —
every row is a DRAFT; publishing is Ryan and Mitch's step in admin.

## Correction to the brief's inventory

The Drop Zone held **32 video files, not 31**: Batch B is **21** files
(IMG_3204–3235 with gaps), not 20. Rule 3 also calls Batch A "the nine new
films"; three of those eleven are twins, so there are **8 new** Walk-Around
films. Both corrected here and carried through the counts.

## Per-file disposition (32 files + MANIFEST)

**Batch A — Walk-Around (11):**

| file | slate | disposition |
|---|---|---|
| 30 sec walk around part 1 | "part one, before you go outside" | new draft — 30 Second Walk-Around, Part 1, Before You Go Outside |
| …part 2 | "Four goals, two words" | new draft — Part 2, Four Goals, Two Words |
| …part 3 | "steps one and two… are you here to see anyone?" | new draft — Part 3, Steps 1 and 2, Are You Here to See Anyone |
| …part 4 | "step three, start it" | new draft — Part 4, Step 3, Start It |
| …part 5 | "step four, wheels to the left" | new draft — Part 5, Step 4, Wheels to the Left |
| …part 6 | "step 5, washer fluid" | new draft — Part 6, Step 5, Washer Fluid |
| …part 7 | "the four step close" | new draft — Part 7, The Four Step Close |
| IMG_2950 …part 8 | matches published Part 8 | **twin → 04-Archive/duplicates** (byte-identical, md5) |
| IMG_2951 …part 9 | matches published Part 9 | **twin → Archive** (byte-identical) |
| IMG_2952 2 min walk | "2 minute walk around, part 1. Pop the hood" | new draft — Two Minute Walk-Around, Part 1, Pop the Hood |
| IMG_2954 2 min walk part 2 | matches published TMW Part 2 | **twin → Archive** (byte-identical) |

**Batch B — openers, closers, CSI (21):**

| files | slate | disposition |
|---|---|---|
| IMG_3204–3210 (6) | "CSI film one… CSI is not a score" → "…2-month follow-ups" | 6 new drafts, **CSI — <title>, Part 1–6**, parked (reference + library_reason) |
| IMG_3213 / 3215 | "Intro/Outro, what's in the name tag" | Name Tag — Opener / Closer (new drafts, daily_lifestyle) |
| IMG_3217 / 3220 | "Intro/Outro, coverage is key" | Coverage is Key — Opener / Closer, **parked** (Master series) |
| IMG_3222 / 3223 | "Intro/Outro Phones and Tones" | Phones and Tones — Opener / Closer, **parked** (Master series) |
| IMG_3224 / 3226 | "Intro/Outro Success Cycle" | Success Cycle — Opener / Closer (new drafts) |
| IMG_3227 / 3228 | "Intro/Outro, lasting impressions" | Lasting Impressions — Opener / Closer (new drafts) |
| IMG_3229 / 3232 | "Intro/Outro, the four step close" | Four Step Close — Opener / Closer (new drafts) |
| IMG_3233 / 3234 | "Intro/Outro, get the hell out of here… MPI setup" | Setting up the MPI — Opener / Closer (new drafts) |
| IMG_3235 | "Menus Outro" | Menus — Closer — v1 (new draft; option a, alongside the two Menu Wrap-Up closers) |

## Counts

- **29 new drafts** created in Mux (19 `daily_lifestyle`: 8 Walk-Around + 10
  core opener/closers + 1 Menus closer; 10 `reference`: 6 CSI + 2 Master pairs).
- **3 twins archived** to `04 - Archive/duplicates` (reasons in its README).
- **0 holds** — every file was confirmed and routed.
- Drop Zone now holds only `MANIFEST.csv`. The script filed 29 masters into
  `02 - Published/Craft`, **moved 29, left 0**.

## Integrity: trims verified from durations, not the ledger

All 29 are **new drafts**, so none took the `replace:video` inline-trim path
and there is **no ledger row to backfill**. Verified every one from durations:
the Mux asset `duration_sec` against `ffprobe` on the on-disk master —
**29 of 29 match within 0.5s, worst |diff| 0.5s**. CRAFT lessons are uploaded
whole (their spoken intro is content, not a slate to cut), so Mux == disk is
the correct result and proves nothing was double-trimmed or truncated.

## Opener / closer coverage by track (after this run)

| track | opener | closer | note |
|---|---|---|---|
| Walk Around | no | no | none in this batch — owed |
| Setting up the MPI | **yes** | **yes** | from "get the hell out of here" intro/outro |
| Four Step Close | **yes** | **yes** | |
| Success Cycle | **yes** | **yes** | |
| Overcoming Objections | no | no | none in this batch — owed |
| Power of Positive Language | no | no | none in this batch — owed |
| Lasting Impressions | **yes** | **yes** | |
| Name Tag | **yes** | **yes** | slate says the class title "what's in a name tag"; routed to the Name Tag track |
| Menus | yes (pre-existing) | yes | new Menus — Closer — v1 joins the two Menu Wrap-Up closers (option a) |

All opener/closer drafts are unattached; `entry_film_content_id` stays null.
Attachment is a separate migration after Ryan publishes — not this run.

## CSI — parked, with the question-match evidence

6 CSI films ingested as reference drafts, `library_reason` = *"CSI is not one of
the nine core tracks; whether it becomes a Master track is Ryan and Mitch's
October ruling."* Attached to nothing; no track created; **not joined to the 34
library questions.**

Evidence for that October ruling: the **34** library questions are keyed to
**12 quiz parts**, but Mitch shot **6 films** that segment the material
differently — the "Prior to Arrival" film alone bundles what the quiz splits
into Prepare to Win, The Phone, and Dissuade Them From Waiting. Matching by
subject: ~**10 of 34** map cleanly 1:1 (Not a Score 4, Upon Arrival 3, Upon
Departure 3); ~**10 more** fall inside a film whose subject plainly contains
them (the pre-arrival bundle); the remaining ~**14** (Two Customers, Duke's
Steakhouse, Fall on the Sword, Survey Talk) have no dedicated film segment.
**6 films ≠ 12 parts, so a part-number join would be wrong** — the Name Tag /
Four Step Close lesson again. Attach by subject, in October, or not at all.

## The Walk-Around proposal (nothing attached — Ryan rules)

**One series or three? One routine at three depths.** Two Minute Part 1 is
decisive: *"This is adding one step. Step 8… Steps 1 through 7 are exactly the
same."* And 30-Second Part 1: *"today is about 30 seconds. Not two minutes, not
four minutes."* The 30-Second is the base routine (steps 1–7+); the Two-Minute
is it plus step 8 (pop the hood); the Four-Minute extends further. **Item 14 on
the 2 October list: not three routines — one, named by its length.** They should
likely live as one course of step-modules, not be scattered onto the thematic
cert modules.

**Which film teaches each filmless Walk Around module (4–7):** the new films are
**step-based**, the cert modules are **thematic**, so the fit is partial and the
honest answer includes a gap.

| module (filmless) | proposed film | deciding sentence | confidence |
|---|---|---|---|
| 4. Raising a Problem Well | 30 Second Part 2 (Four Goals) | "never a negative without a positive solution" | strong |
| 5. Tires on the Drive | 30 Second Part 5 (Wheels to the Left) | "that view is what sets up rotate, balance, alignment and tires" | strong (Part 8, a twin already live, also covers tires) |
| 6. Visibility and Wipers | 30 Second Part 6 (Washer Fluid) | "running the system opens up wipers, glass treatment, washer fluid, and a complete service" | strong |
| 7. The Handback | **none in this batch** | the step films are the intake walk-around; none covers returning the car | **still owed** |

The sixteen published quiz questions on those modules corroborate 4–6 (negative-
with-positive, rotate/balance/alignment, the washer-button demo) and confirm 7
has no film: its questions are about PPE removal and proofing the car at
handback, which no intake-walk-around film touches.

## Punch-list burndown — what Mitch still owes

- **Openers and closers**: Walk Around, Overcoming Objections, Power of Positive
  Language (opener + closer each).
- **Walk Around module 7 (The Handback)**: a lesson film — nothing in the
  catalog teaches it.
- **CSI**: a ruling (Master track or skill-library), then either shoot the
  missing segments or re-segment the quiz; 6 films vs 12 quiz parts today.
- **Master opener/closers** (Coverage is Key, Phones and Tones) wait on Master
  being defined.

## Awaiting Ryan in admin

**29 drafts** to review and publish. 19 are track-facing (opener/closers +
Walk-Around lessons); 10 are parked reference (6 CSI, 4 Master). None serves an
advisor until published, and attachment of the openers/closers and any
Walk-Around films is a migration after that.

## Verticals

Queued by the webhook (vertical_status = pending on all 29). The 9:16
renditions are being derived by the same worker the cron runs
(`npm run derive:vertical`) — **3 of 29 ready** at report time and
climbing monotonically, so the path is confirmed working rather than assumed.
The remainder clear on the worker (and the every-30-min production cron is the
backstop if it ends). Confirm completion with:

```sql
select vertical_status, count(*) from content
 where created_at::date = current_date and type='advisor_video'
 group by vertical_status;   -- expect: ready | 29
```
