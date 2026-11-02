# Ingest run, 30 October: Mitch's late-October shoot

Ryan, 30 October: "We have more to ingest." 54 files sit in the Drop Zone. Work only in `~/ediagd-ingest`, a worktree on branch `ingest-nov` cut from today's main, which carries #77 (the sync gate and trim doctrine v2). `~/ediagd` belongs to the sync-repair run until tomorrow: no git there, no scripts there, do not prune worktrees, do not read its lock away. Run every phase of `INGEST.md`, both hard gates. Nothing is renamed and nothing is uploaded without Ryan's confirmation of the exact table shown.

## What is in the Drop Zone

- **41 unnamed clips from 25 and 26 October**: `IMG_3389 2.MOV` through `IMG_3435 2.MOV` (26 files, 200 to 390 MB) and `IMG_3451.MOV` through `IMG_3490.MOV` (15 files, 330 to 515 MB). This is the shoot.
- **12 files dated 13 to 24 September**: four min walk around parts 1 to 3, the "dumi 25000" and "dumi 70000" parts, 30 sec walk around part 7, 2 min walk, 2 min walk part 2. The 30 September report ends with the Drop Zone holding only `MANIFEST.csv`, so these came back, most likely Drive re-syncing Mitch's copies. Before transcribing anything, sha-compare each against `02 - Published` and `04 - Archive`. Byte-identical: `04 - Archive/duplicates`, manifest row, no transcription. Not identical: treat as unnamed, same as the 41, and say in the report that it differed and how.
- `MANIFEST.csv`: append rows, never rewrite.

## What Mitch was asked to film

The list Ryan posted for Mitch in #ediagd: Walk-Around Part 7, The Handback, with the Walk-Around opener and closer; the Overcoming Objections opener and closer; the whole Power of Positive Language track (Knowledge Notes 1 to 6 and Closing Strategies, seven modules that exist cue-only today, plus its opener and closer); and recuts of the two menu films #59 unpublished (content ids 2748 and 2821). About sixteen films. Forty-one clips means retakes, parts, or films off the list. The slate decides, not the list; the list is only the first thing to match against, and `reports/openers-and-closers-4-october.md` and `reports/library-audit-5-october.md` name the gaps.

## Phases 0 to 3

Preflight in the worktree: `.env.local` is already copied; reuse whisper with `ln -s ~/ediagd/.venv-whisper .venv-whisper` rather than rebuilding, and keep it out of the commit. Transcribe every clip that is not a twin. Spoken slate first, transcript match second, the quote matcher with its voice gate on for anything that reads as a Mindset quote. Canonical names per the naming law. An opener or closer takes the track Mitch names on the slate; a track that does not exist by that name is a hold, never an inference. One table, every clip, grouped by proposed track, with confidence and the evidence line quoted. Stop. That is gate one. Rename only what Ryan confirms; the rest go to `05 - Held` with a README line naming the question and that Ryan answers it.

## Phases 4 and 5

Dry run, one table, stop. That is gate two. Then apply:

- New films land as **drafts** on their existing modules (the Power of Positive Language modules exist cue-only; Walk-Around Part 7 and the openers and closers per the 4 October report). Publishing is Ryan and Mitch's step in admin.
- The 2748 and 2821 recuts go through `replace:video` onto their existing rows under Phase 4b: measure both, the cleaner take wins, both numbers in the report. They stay unpublished until Ryan republishes.
- **Trim doctrine v2, no exceptions.** Every file is uploaded slate-on; the slate is cut by `trim:apply` from the disk file, full re-encode, sync gate on the finished asset, ledger row. Nobody pre-trims. Verify every cut from durations, not from the ledger. If `trim:apply` refuses because the sync-repair run holds a shared lock, do not touch the lock: leave the drafts slate-on, say so, and the cuts run after that job ends.
- **No vertical work in this run.** The derive cron is off on purpose while phase 5 of the sync run works the stale queue. New films sit `pending`; the cron re-enable PR picks them up. List them.

## Phases 6 and 7

Every file leaves the Drop Zone: Published by collection, Archive for twins, Held for open questions with its README line. Report per `INGEST.md` Phase 7, plus three things: the list burndown (which of the sixteen arrived, which Mitch still owes), whether Power of Positive Language is now a complete track with all nine films, and the count of drafts waiting in admin. Copy this brief into `reports/` in the worktree and commit it. PR from `ingest-nov` against main, base checked by hand. No migration expected; say so if one turns out to be needed.
