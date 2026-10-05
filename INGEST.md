---
name: ingest
description: "Run the EDIAGD Drop Zone video pipeline end to end: identify and rename Mitch's clips, route and upload to Mux as drafts or reshoot replacements, verify trims from durations, move published files, and report deck completeness. Use when Ryan invokes /ingest or asks to process the Drop Zone."
---

# EDIAGD Drop Zone Ingest

Run the full pipeline that takes Mitch's raw uploads from the Drop Zone into Mux. Work phase by phase, in order.

**Two hard gates**: no file is renamed and nothing is uploaded without Ryan's explicit confirmation of the exact proposal shown (the one-tap rule: a confirmation is only legitimate when the value shown is exactly the value applied).

**Standing habit**: verify rather than assume, and when checking contradicts something you already told Ryan earlier in the run, say so plainly and correct it in the same report.

## Config (fill once, then keep current)

- DROP_ZONE: `~/Library/CloudStorage/GoogleDrive-appdeveloper@peartreecompanies.com/My Drive/EDIAGD Video Masters/00 - Drop Zone`
- PUBLISHED: `~/Library/CloudStorage/GoogleDrive-appdeveloper@peartreecompanies.com/My Drive/EDIAGD Video Masters/02 - Published` — per-collection subfolders.

  Note the sibling folders in the same parent, which the pipeline does **not** write to
  and which are Ryan's: `01 - Ready` (staging, currently empty), `03 - Reshoot`,
  `04 - Archive`. The published folder is `02 - Published` with a hyphen, not an em dash.

  These were placeholders until 21 September 2026 and had been filled in by hand twice.
  If they ever stop resolving, fix them here rather than in the run.
- REPO: the ediagd repo (~/ediagd), which holds the ingest / slate / trim / replace scripts and DB access.

## Phase 0 — Preflight

Verify DROP_ZONE and PUBLISHED exist; repo on main and clean; ffmpeg present; the live database reachable (query op_code_catalog).

**faster-whisper** runs from `.venv-whisper` in the repo (gitignored, not installed system-wide). If it is missing, build it before Phase 2 — and keep it out of any commit.

### Where the transcripts live

`reports/dropzone-transcripts.json` — the path is unchanged, but the file is
**untracked** (gitignored since 0159's PR) and that is deliberate.

It used to be tracked, so a `git reset` mid-run on 30 September **reverted it**
and threw away a batch that had just been transcribed — a full re-transcription,
whisper over thirty-odd films, for a git operation that had nothing to do with
them. A tracked working file is one a reset is entitled to discard. An untracked
one survives every git command there is, which is exactly the property this file
needs.

**It is a cache, not the record.** The durable home for a transcript is
`content_transcript` in the database (0155) — 447 rows, written by
`npm run transcripts:backfill`, read by the blog corpus and the caption work.
This file only has to outlive the run that produced it, and after the run the
transcripts should be pushed into the database so the next reader does not
depend on one laptop.

Three scripts read it — `identify-videos.ts`, `slate-plan.ts` and
`transcripts-backfill.ts` — and **all three now treat its absence as ordinary**,
printing the rebuild command instead of a stack trace:

```
python3 scripts/transcribe-dropzone.py --dir="<Drop Zone>" --out=reports/dropzone-transcripts.json
```

Two of the three already guarded it; the backfill did not, and took the whole
run down on a missing file including its own Mux caption pass, which needs no
local file at all. Same question, answered in two places out of three.

**Consequence worth knowing before the next run:** the store currently holds
`IMG_2161`–`IMG_2512` only, 168 files. The 30 September batch (`IMG_3204`–`3235`
and the Walk-Around clips) is **not in it** — that is what the reset destroyed.
Those transcripts survive only in `content_transcript`, where the Mux caption
pass put them, which is the argument for the database being the record.

The **live DB is the only authority** for op codes, stages, aliases, and quotes — never the files in data/, which are stale snapshots. If the Drop Zone is empty, say so and stop.

## Phase 1 — Inventory

List every file and classify:

- **Reshoot / replacement**: parses canonically and its identity (collection + title + voice) already exists **published**. Default disposition is `replace:video` onto the existing row — the published row keeps serving throughout, no new row is created, and the published count does not change. Ryan rules replace vs. new version before anything is applied.
- **New film**: parses canonically, identity not yet present → created as **draft**.
- **Unnamed**: phone-style names (IMG_xxxx etc.) → Phase 2.
- **Known holds**: files Ryan has previously parked (ask if a holds list exists this run). Leave untouched.

**Naming law**: `PREFIX — Title — Voice — vN.ext` with em dashes. Voice defaults to Mitch Hardt; version defaults to v1. PREFIX is an op code (e.g. EAF-001) or a collection alias (TECH, MINDSET, FND). FND is a mapping alias for foundational modules, **not** a catalog op code. Canonical stage names only: Pre-Write, On the Drive, At the Kiosk, MPI Setup, After-MPI, Objections — always "After-MPI", never "MPI Selling".

**Openers and closers** (added 30 Sep 2026, for the track entry and exit films
Mitch is delivering): two title forms, using the track's name as the catalog
carries it —

- `<Track> — Opener — Mitch Hardt — v1` — the film that opens a track. Its
  destination is `certification.entry_film_content_id`, one per core track, set
  by migration after Ryan publishes the film in admin; the loop already serves
  it (lib/loop.ts RULING 2), no code change.
- `<Track> — Closer — Mitch Hardt — v1` — the film that closes a track. A
  closer is the **last module of its track**: one film, no quiz, `sort_order`
  after every lesson and cue module, so the track's final morning is Mitch
  closing it and `trackComplete()` needs nothing new. `Menu Wrap-Up, Part 1`
  and `Part 2` as Menus modules 8 and 9 (0144) are the worked example.

Which track an opener or closer belongs to is **Mitch's word, from the slate**.
Where the slate names a track that does not exist by that name (the AGENTS.md
"a slate names the shoot" table), the file is a **hold** — ask, never infer.
The precedent for the opener form is `Dealer Upsell Menus and Interval Charts —
Opener`, already set as Menus' entry film.

## Phase 2 — Identify unnamed clips

For each unnamed clip: extract audio with ffmpeg, transcribe with local whisper. Evidence, strongest first:

1. **Spoken slate** — quote videos open "<Title> by <Voice>" (redos add a take number); deck films open "<Deck>. Film N. <Stage>. Take N."
2. **Transcript match** against the live catalog (op codes, stage scripts), Mitch's outstanding filming punch list (expected films match easiest — check it first), and the Quote Master for MINDSET quotes.

**Whisper mangles proper nouns, especially attributions.** Never take a transcribed author name as the attribution. Match the quote *text* against the Quote Master and take the attribution from that row; if the text isn't in the Quote Master, the clip is a hold for Ryan — he asks Mitch. Never attribute from general knowledge or the open internet.

**Quote matcher rules** (learned the hard way):
- The matcher applies a **voice gate**; keep it on. Low-information words ("one", "focus") produce confident-looking false matches without it.
- Assignment is **greedy over a shared pool**, so ruling out a bad match one at a time makes things worse — each rule-out lets the next claimant through and can knock a correct match off its own film. Refuse on evidence via the gate; do not hand-tune thresholds or reject matches individually.

Propose a canonical name per clip with confidence and the evidence line quoted. Present the full table and **wait for Ryan's confirmation — never rename on a guess**. Unmatched clips stay in place and go on the holds list for a ruling. Record `identified_by` for every clip (declared | slate | transcript | ruled).

## Phase 3 — Rename

Apply confirmed renames only. Anything unconfirmed stays exactly as it was.

## Phase 4 — Ingest dry run

Run the repo ingest script in dry-run mode. Every file must parse; list per-file route, op code, stage or film title, version, and disposition (replace vs. new draft). Unknown prefixes go to the review queue — **never guessed**. Replacements are called out separately: Ryan decides replace vs. new version before apply.

## Phase 4b — A reshoot's disposition is decided by measurement, not by a ruling

**When an incoming film matches a live film's identity, profile both. The cleaner
take becomes v2 and retires the other. If the incoming take is not cleaner, it
goes to Archive.** Report both numbers and which won.

No ruling per file. `scripts/muffle-profile.py` is the instrument — HF ratio on
voiced frames, 2.5-second medians. Run it on the incoming file **and** on the live
master, and put both lines in the report.

**Name the statistic that decided it, because the obvious one can be wrong.**
`TMB-039 — MPI Setup`: the reshoot's HF *median* was marginally **worse** (−35.4
against −34.1 dB) while it had **0.0 s muffled against 10.1 s across five
passages**. Muffled means sustained passages below −48 dB, not average brightness.
Deciding on the median would have retired the better film.

### Three holds on this rule, and they are not optional

1. **If the identity key cannot establish a match with confidence, hold and
   report — never guess.** `identityOf()` includes the voice, and **84 of 321 live
   films carry no parenthesised voice, 43 of them op-coded** (ABT-054, ACO-055,
   ACR-047, BFF-012, CAF-002, CLF-010, CLH-042, DFF-014, EAF-001, PSF-013,
   SRP-038, TMB-039, TRF-011). The dry run said `0 would REPLACE` for a file that
   was demonstrably a reshoot. So a "no match" from the key is **not** evidence of
   a new film, and this rule must not paper over that exposure. It is a known gap
   on the 2 October list, not a solved problem.

2. **If the incoming take is materially shorter, hold it** rather than retiring the
   longer one on an audio score alone. SRP-038 is why: `On the Drive` at 320 s and
   `On the Drive, Part 1` at 88 s are different films, and a shorter replacement can
   be a re-cut that drops content. An audio score cannot see missing teaching.
   A slate-length difference is not material; a minute is.

3. **Retire, never delete, and record which take replaced it and by what margin**
   in `content.retired_reason`. A retire that does not say why leaves the next
   reader with a tombstone and no reasoning — eleven rows retired before 0134 have
   exactly that problem.

**The loser of a reshoot comparison goes to `04 - Archive` with its reason in that
folder's README. The retired film's master stays in `02 - Published`** — its row is
retired, the file is not discarded.

## Phase 5 — Apply, and the trim doctrine

On Ryan's confirmation of the dry-run table: upload to Mux. New films land **draft** — publishing is Ryan and Mitch's step in admin, never this pipeline's. Reshoots replace their published rows in place, with full taxonomy preserved.

**Trimming is the dangerous part of this pipeline. A double-trim is invisible — the film still plays, it just starts mid-sentence.**

- `replace:video` trims reshoots **inline** and does **not** write the trim ledger. The ledger is therefore incomplete by construction and must never be the sole check.
- **Verify trims from durations, not from the ledger or the ingest report**: full audio length minus slate offset, compared against live duration, for every file in the batch. That comparison is unambiguous; a ledger lookup is not.
- After any trim applied outside the ledger-writing path, **backfill the ledger row** so the next blanket run can't re-cut it.
- Never run `trim:slates --apply` across a set without duration-verifying that set first.

MINDSET clips run the quote matcher; artifact links land as proposals in the review queue, inert until confirmed.

## Phase 6 — Move and settle

> **The Drop Zone is a transit folder. Every run ends with it empty.** A file that
> cannot be published goes to a destination with a written reason. **A pending
> decision is itself a destination**, not a reason to leave a file where it is.

```
02 - Published      ingested and live
03 - Reshoot        Mitch has to record it
04 - Archive        duplicate, or not a film
05 - Held           a decision is pending — README says whose and what
```

**`05 - Held` is the one that was missing, and its absence is what kept refilling
the Drop Zone.** With only three destinations, every undecided file defaulted to
staying put, so "held" and "not yet looked at" became the same state on disk — and
the folder that means *work has arrived* slowly came to mean *work nobody has
resolved*. Three separate runs ended with files left behind for this reason alone.

A file in `05 - Held` is not lost, not forgotten and not in the way. **The README
there carries one line per file: what question is open, and who answers it.**
Naming the person matters as much as naming the question — a hold addressed to
nobody is how a decision waits forever.

**If a file fits none of the four, that is worth stopping for.** It is the only
thing that is.

Move each ingested file from DROP_ZONE to PUBLISHED/<collection>. Files are **moved, never deleted**. When done, the Drop Zone holds only unresolved files (holds and unmatched).

Vertical renditions are generated by a **cron**, not by this pipeline. Note which files are pending and **confirm they actually clear** — check back rather than assuming the hand-off worked.

If a run dies partway, do not assume the resumed run faces the same work: files already moved out of the Drop Zone are already done. Re-inventory before resuming and state the real remaining count.

## Phase 7 — Report

End with:
- Per-file disposition table (name, identified_by, route, action taken: replaced | new draft | held).
- Counts by state: reshoots replaced, new drafts created, files held.
- **Integrity check**: the published count should be unchanged when the batch is reshoots-plus-new-drafts. If it moved, explain why.
- Trim verification result for every file (duration-derived), and any ledger rows backfilled.
- Verticals pending, and confirmation once they clear.
- Counts by deck; which decks are now complete (all four films) vs. partial.
- Newly servable (op code, stage) pairs — advisor step-3 skips that end once published.
- Punch-list burndown: what Mitch still owes.
- Holds needing rulings, with the evidence for each.
- Reminder: N drafts await publishing in admin.
- Any corrections to statements made earlier in the run.
- `git status -sb` showing no ahead count; `.venv-whisper` and other local tooling stay out of the commit.