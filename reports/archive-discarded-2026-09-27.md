# 04 - Archive / discarded-2026-09-27

Twenty-eight files, one reason each. **Nothing here was deleted** — moved only, so every
discard is reversible until Ryan empties this folder in Finder.

Written 2026-09-27, while clearing `00 - Drop Zone`, `_identified/` and `_twins/`.

---

## Byte-identical duplicates of films already in the catalog (7)

Established by size plus a SHA-256 of the first and last 8 MB of each file —
enough to separate two takes of the same lesson, which differ from the first
frame. Not "looks like a duplicate": identical bytes.

| file | duplicate of |
|---|---|
| `IMG_2595 2.MOV` | published `WBF-018 — On the Drive, Part 1 (Mitch Hardt) — v1` |
| `IMG_2598 2.MOV` | published `WBF-018 — On the Drive, Part 2 (Mitch Hardt) — v1` |
| `IMG_2600 2.MOV` | published `WBF-018 — At the Kiosk (Mitch Hardt) — v2` |
| `IMG_2601 2.MOV` | published `WBF-018 — MPI Setup (Mitch Hardt) — v1` |
| `IMG_2607 (1).MOV` | published `WBF-018 — After-MPI (Mitch Hardt) — v2` |
| `IMG_2609 (1).MOV` | published `WBF-018 — Piggyback (Mitch Hardt) — v1` |
| `IMG_2593 2.MOV` | `00 - Drop Zone/IMG_2593 serpentine belt after mpi.MOV`, which is **still in the Drop Zone awaiting a name** — so this one duplicates a file that is not yet published. Kept the annotated copy because Mitch's annotation is the evidence. |

All six `WBF-018` masters were already filed in `02 - Published`. The ` 2` and
` (1)` suffixes are Google Drive's, added when the same file is downloaded twice.

## Byte-identical duplicate inside the Drop Zone (1)

| file | reason |
|---|---|
| `Nametag part 9 (1).MOV` | Identical to `Nametag part 9.MOV` (764,804,867 bytes, 164.7 s), which is published as `CRAFT — Name Tag, Part 9 — Mitch Hardt — v1`. Drive download duplicate. |

## Second take, lost on measurement (1)

| file | reason |
|---|---|
| `Nametag part 10.MOV` | A **genuinely different** take of Name Tag Part 10 — 148.0 s against `IMG_2908`'s 158.1 s, same lesson, both slated *"log it, reset it, own it."* Not a duplicate: a choice. Kept `IMG_2908` on the audio profile — HF median **−28.3 dB vs −31.7**, worst **−39.4 dB vs −42.6**. Neither has any passage below the −48 dB muffled threshold, so both are usable; `IMG_2908` is cleaner on both measures. Published as `CRAFT — Name Tag, Part 10`. |

## The reshoot's loser, and the annotation that corrected the catalog (1)

| file | reason |
|---|---|
| `IMG_2576 timing belt setting up mpi.MOV` | Byte-identical to `_identified/IMG_2576.MOV` (332,860,586 bytes, 79.7 s), which is published as `TMB-039 — MPI Setup — Mitch Hardt — v2`. **Mitch's hand annotation on this copy is what corrected the catalog:** the matcher had filed it as `MPI-061` because "Multi-Point Inspection" appears inside the *stage phrase* "setting up the multi-point inspection", and his three typed words `timing belt setting up mpi` named the real subject. Seven films were misfiled the same way and all seven were re-derived from their own spoken slates because of it. The annotation is recorded here because the file that carried it is leaving. |


---

## Eighteen hand-annotated files that were already published (18)

These looked like reshoots and were not. Mitch had annotated each one with its
subject and stage — `IMG_2572 Timing Belt on the Drive part 1` — and every op code
and stage in that set already had a live film, so the obvious reading was
"eighteen reshoots to profile against their counterparts".

**They are byte-identical to masters already in `02 - Published`.** Verified by
size plus a SHA-256 of the first and last 8 MB, the same test used on `_twins`.
Profiling them would have compared each file against itself.

**What nearly hid it:** every incoming file read about five seconds LONGER than
the live film's duration — 130s against 125s, 186 against 182, 204 against 198.
That looked like a set of slightly longer reshoots. It is the slate: the database
stores the **trimmed Mux asset** duration while the file on disk is untrimmed. One
number came from Mux and the other from the filesystem, and comparing them across
that boundary invented a difference that does not exist.

| file | identical to |
|---|---|
| `IMG_2268 Serpentine belt at the kiosk.MOV` | `SRP-038 — At the Kiosk — v1` |
| `IMG_2269 serpentine belt mpi setup.MOV` | `SRP-038 — MPI Setup — v1` |
| `IMG_2271 serpentine belt after the mpi (some spotty audio).MOV` | `SRP-038 — After-MPI — v1` |
| `IMG_2572 Timing Belt on the Drive part 1.MOV` | `TMB-039 — On the Drive, Part 1 (Mitch Hardt) — v1` |
| `IMG_2573 timing belt on the drive part 2.MOV` | `TMB-039 — On the Drive, Part 2 (Mitch Hardt) — v1` |
| `IMG_2577 timing belt after the mpi part 1.MOV` | `TMB-039 — After-MPI, Part 1 (Mitch Hardt) — v1` |
| `IMG_2578 timing belt after the mpi part 2.MOV` | `TMB-039 — After-MPI, Part 2 (Mitch Hardt) — v1` |
| `IMG_2580 timing belt piggy back sales.MOV` | `TMB-039 — Piggyback (Mitch Hardt) — v1` |
| `IMG_2581 coolant hoses on the drive part 1.MOV` | `CLH-042 — On the Drive (Mitch Hardt) — v1` |
| `IMG_2582 coolant hoses on the drive part 2.MOV` | `CLH-042 — On the Drive, Part 2 (Mitch Hardt) — v1` |
| `IMG_2583 coolant hoses at the kiosk.MOV` | `CLH-042 — At the Kiosk (Mitch Hardt) — v2` |
| `IMG_2584 coolant hoses setting up the mpi.MOV` | `CLH-042 — MPI Setup (Mitch Hardt) — v2` |
| `IMG_2585 coolant hoses after the mpi.MOV` | `CLH-042 — After-MPI (Mitch Hardt) — v2` |
| `IMG_2587 coolant hoses piggyback sales.MOV` | `CLH-042 — Piggyback (Mitch Hardt) — v1` |
| `IMG_2590 serpentine belt on the drive.MOV` | `SRP-038 — On the Drive, Part 1 (Mitch Hardt) — v2` |
| `IMG_2591 serpentine belt at the kisok.MOV` | `SRP-038 — At the Kiosk (Mitch Hardt) — v2` |
| `IMG_2592 serpentine belt setting up the mpi.MOV` | `SRP-038 — MPI Setup (Mitch Hardt) — v2` |
| `IMG_2593 serpentine belt after mpi.MOV` | `SRP-038 — After-MPI (Mitch Hardt) — v2` |

Three of these — `IMG_2268`, `IMG_2269`, `IMG_2271` — match masters whose rows
were **retired by 0129** as superseded takes. Their replacements are `IMG_2591`,
`IMG_2592` and `IMG_2593`, which are also in this list. So the Drop Zone was
holding both sides of a supersession that had already been resolved in the
database eight migrations ago.

`IMG_2593` also resolved a question that had been open twice. Its slate says
*"Serpentine Belt, Multi-Point Inspection, Selling"* — a phrase matching no
canonical stage, which had it held once as "stage unclear". Being byte-identical
to `SRP-038 — After-MPI (Mitch Hardt) — v2` proves the phrase **is** how Mitch
slates After-MPI. That is evidence, not inference, and it retired the same
question for `IMG_3063`.

---

## What is NOT here

`TMB-039 — MPI Setup — v1.mov`, the film IMG_2576 replaced, is **not archived** —
it is a published master and its row is retired rather than deleted, per the
standing rule. It stays in `02 - Published`. Its measurements, for the record:
10.1 s muffled across five passages, worst −54.4 dB at 0:20.5, against 0.0 s
muffled in the v2 that replaced it.
