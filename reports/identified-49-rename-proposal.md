# The 49 in `_identified/` — rename proposal

Nothing here is renamed, uploaded, moved or published. This is the proposal for
Ryan to confirm or amend.

**Why they are not in `02 - Published`.** They have no `content` rows, no Mux
assets, and still carry camera names. `02 - Published` holds 283 files that all
have live rows; putting these 49 in it would make the folder's name stop being
evidence of what is in it. The order is: confirm names → rename → ingest →
publish → move.

**Names rebuilt from each film's spoken slate**, not from the earlier
`proposed_name` column — ten of those had the whole spoken sentence embedded
(`CRAFT — Coverage is key part 10. Don't keep it a secret, Part 10 — …`), which is
the malformation caught once before on the 53.

---

## 24 ready to confirm

Series and part number both spoken, destination known, no collision with anything
live.

| file | secs | proposed name |
|---|---|---|
| IMG_2877 | 100 | `CRAFT — Coverage is Key, Part 1 — Mitch Hardt — v1` |
| IMG_2878 | 131 | `CRAFT — Coverage is Key, Part 2 — Mitch Hardt — v1` |
| IMG_2879 | 101 | `CRAFT — Coverage is Key, Part 3 — Mitch Hardt — v1` |
| IMG_2881 | 127 | `CRAFT — Coverage is Key, Part 4 — Mitch Hardt — v1` |
| IMG_2883 | 125 | `CRAFT — Coverage is Key, Part 5 — Mitch Hardt — v1` |
| IMG_2885 | 130 | `CRAFT — Coverage is Key, Part 6 — Mitch Hardt — v1` |
| IMG_2887 | 109 | `CRAFT — Coverage is Key, Part 7 — Mitch Hardt — v1` |
| IMG_2889 | 146 | `CRAFT — Coverage is Key, Part 8 — Mitch Hardt — v1` |
| IMG_2890 | 102 | `CRAFT — Coverage is Key, Part 9 — Mitch Hardt — v1` |
| IMG_2891 | 164 | `CRAFT — Coverage is Key, Part 10 — Mitch Hardt — v1` |
| IMG_2868 | 160 | `CRAFT — Menu Wrap-Up, Part 1 — Mitch Hardt — v1` |
| IMG_2870 | 210 | `CRAFT — Menu Wrap-Up, Part 2 — Mitch Hardt — v1` |
| IMG_3038 | 105 | `CRAFT — Phones and Tones, Part 1 — Mitch Hardt — v1` |
| IMG_3039 | 90 | `CRAFT — Phones and Tones, Part 2 — Mitch Hardt — v1` |
| IMG_3040 | 84 | `CRAFT — Phones and Tones, Part 3 — Mitch Hardt — v1` |
| IMG_3041 | 93 | `CRAFT — Phones and Tones, Part 4 — Mitch Hardt — v1` |
| IMG_3042 | 93 | `CRAFT — Phones and Tones, Part 5 — Mitch Hardt — v1` |
| IMG_3044 | 108 | `CRAFT — Phones and Tones, Part 6 — Mitch Hardt — v1` |
| IMG_3046 | 103 | `CRAFT — Phones and Tones, Part 7 — Mitch Hardt — v1` |
| IMG_3047 | 88 | `CRAFT — Phones and Tones, Part 8 — Mitch Hardt — v1` |
| IMG_3048 | 158 | `CRAFT — Phones and Tones, Part 9 — Mitch Hardt — v1` |
| IMG_3049 | 134 | `CRAFT — Phones and Tones, Part 10 — Mitch Hardt — v1` |
| IMG_3050 | 102 | `CRAFT — Phones and Tones, Part 11 — Mitch Hardt — v1` |
| IMG_3051 | 106 | `CRAFT — Phones and Tones, Part 12 — Mitch Hardt — v1` |

Coverage is Key is the Chemical Warranty Master track; Menu Wrap-Up is Menus;
Phones and Tones is a Master track. All three exist.

## 6 pitch films, corrected from MPI-061

The matcher filed seven films under `MPI-061` because "Multi-Point Inspection"
appears inside the **stage phrase** — the error Mitch's hand annotation caught.
**MANIFEST.csv was never corrected.** Re-derived from each film's own slate:

| file | secs | spoken subject | proposed name |
|---|---|---|---|
| IMG_2960 2 | 103 | Fuel system | `FSC-017 — MPI Setup — Mitch Hardt — v1` |
| IMG_2987 | 96 | Spark Plugs | `SPK-043 — MPI Setup — Mitch Hardt — v1` |
| IMG_2993 | 81 | Rotation | `TRO-022 — MPI Setup — Mitch Hardt — v1` |
| IMG_2999 | 101 | Tires | `TIR-057 — MPI Setup — Mitch Hardt — v1` |
| IMG_2988 | 166 | Spark Plugs | `SPK-043 — After-MPI — Mitch Hardt — v1` |
| IMG_2994 | 136 | Tire rotation | `TRO-022 — After-MPI — Mitch Hardt — v1` |

Each stage is checked against the live catalog and free. The seventh is below.

---

## 19 need a ruling

### 1 · IMG_2576 — a second take, not a v1

Slate: *"Timing Belt, Setting up the multi-point inspection."* → `TMB-039 — MPI
Setup`. **That film is already live**, as `TMB-039 — MPI Setup — v1.mov`.

`identityOf()` strips only the version suffix, so the live film's identity is
`tmb-039 — mpi setup` while a new `TMB-039 — MPI Setup (Mitch Hardt) — v2.mov`
reads as `tmb-039 — mpi setup (mitch hardt)`. **They do not match**, so the
ingest's duplicate check would not fire and this would land as a *second live
film at the same stage* — the defect 0129 cleaned up.

**It is a class: 84 of 321 live films carry no parenthesised voice, 43 of them
op-coded** — ABT-054, ACO-055, ACR-047, BFF-012, CAF-002, CLF-010, CLH-042,
DFF-014, EAF-001, PSF-013, SRP-038, TMB-039, TRF-011. Each is a silent duplicate
waiting on its reshoot, and three of today's 32 new arrivals are ACO-055
reshoots.

Also: `IMG_2576.MOV` here and `IMG_2576 timing belt setting up mpi.MOV` in the
root are **byte-identical** — 332,860,586 bytes, 79.7 s. One copy goes to
`_twins`.

### 7 · Name Tag — the series is complete, and part 10 has two takes

Parts 1–6 and 10 are here; **parts 7–10 are the hand-named files in the Drop Zone
root.** Combined, the series is 1–10 with two surplus files:

| part | file | secs |
|---|---|---|
| 1 | IMG_2894 | 170 |
| 2 | IMG_2895 | 119 |
| 3 | IMG_2896 | 122 |
| 4 | IMG_2897 | 128 |
| 5 | IMG_2900 | 192 |
| 6 | IMG_2901 | 128 |
| 7 | `Nametag part 7.MOV` | 177 |
| 8 | `Nametag part 8.MOV` | 134 |
| 9 | `Nametag part 9.MOV` | 165 |
| 9 | `Nametag part 9 (1).MOV` | 165 — **byte-identical duplicate**, → `_twins` |
| 10 | `Nametag part 10.MOV` | 148 — *"log it, reset it, own it"* |
| 10 | IMG_2908 | 158 — *"log it, reset it, and own it"* |

**Two different recordings of part 10**, same lesson, 10 s apart. Not a
duplicate — a choice, and not mine to make.

**And the track is unknown.** The series was read as *"CSI or Lasting
Impressions"*; both exist and are empty. Ten films is a whole track.

### 10 · Selling Skills — parts 1–10 with one gap and one topic-named film

Parts 1, 2, 3, 4, 6, 7, 8, 9, 10 are here. **IMG_3029 (105 s) speaks no part
number** — its slate is *"Selling Skills, The Steer Objection."* Part 5 is the
missing number, but a part number is not assigned from position, so it is either
`CRAFT — Selling Skills, Part 5 — …` on your ruling or
`CRAFT — Selling Skills, The Steer Objection — …` as spoken.

Track unknown — read as *Overcoming Objections*, which exists and now has two
films attached by 0132.

### 1 · IMG_3003 — held

`TIR-057 — ???`. Stage not derivable. Held on your ruling as a product question.
Not ingested, not moved.
