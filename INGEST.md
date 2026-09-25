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

The **live DB is the only authority** for op codes, stages, aliases, and quotes — never the files in data/, which are stale snapshots. If the Drop Zone is empty, say so and stop.

## Phase 1 — Inventory

List every file and classify:

- **Reshoot / replacement**: parses canonically and its identity (collection + title + voice) already exists **published**. Default disposition is `replace:video` onto the existing row — the published row keeps serving throughout, no new row is created, and the published count does not change. Ryan rules replace vs. new version before anything is applied.
- **New film**: parses canonically, identity not yet present → created as **draft**.
- **Unnamed**: phone-style names (IMG_xxxx etc.) → Phase 2.
- **Known holds**: files Ryan has previously parked (ask if a holds list exists this run). Leave untouched.

**Naming law**: `PREFIX — Title — Voice — vN.ext` with em dashes. Voice defaults to Mitch Hardt; version defaults to v1. PREFIX is an op code (e.g. EAF-001) or a collection alias (TECH, MINDSET, FND). FND is a mapping alias for foundational modules, **not** a catalog op code. Canonical stage names only: Pre-Write, On the Drive, At the Kiosk, MPI Setup, After-MPI, Objections — always "After-MPI", never "MPI Selling".

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

## Phase 5 — Apply, and the trim doctrine

On Ryan's confirmation of the dry-run table: upload to Mux. New films land **draft** — publishing is Ryan and Mitch's step in admin, never this pipeline's. Reshoots replace their published rows in place, with full taxonomy preserved.

**Trimming is the dangerous part of this pipeline. A double-trim is invisible — the film still plays, it just starts mid-sentence.**

- `replace:video` trims reshoots **inline** and does **not** write the trim ledger. The ledger is therefore incomplete by construction and must never be the sole check.
- **Verify trims from durations, not from the ledger or the ingest report**: full audio length minus slate offset, compared against live duration, for every file in the batch. That comparison is unambiguous; a ledger lookup is not.
- After any trim applied outside the ledger-writing path, **backfill the ledger row** so the next blanket run can't re-cut it.
- Never run `trim:slates --apply` across a set without duration-verifying that set first.

MINDSET clips run the quote matcher; artifact links land as proposals in the review queue, inert until confirmed.

## Phase 6 — Move and settle

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