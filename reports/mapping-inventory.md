# Every mapping in the system — Admin Mapping, Phase 0

**Date:** 2026-08-31 · **Report only. No code changed.**

---

## 1 · The inventory

Nine mappings. Three already live in the database, four live only in TypeScript,
one lives only in a spreadsheet in Ryan's Downloads, and one is a CSV outside
the repo.

| # | Mapping | Lives in | Rows | Read by | Source of truth today |
| --- | --- | --- | ---: | --- | --- |
| 1 | DMS sub-category → family | `sub_category_map` **(table)** + `RULES` in `lib/dms/mapping.ts` | **815** | `rebuild_dms_periods`, every perf view | **Split.** The table holds the data, the file holds the rules that generate it. `remap` pushes file → table. |
| 2 | Sub-category → *not coachable* | `NOT_COACHABLE` in `lib/dms/mapping.ts` | 146 rows in table | same | **File.** |
| 3 | Op-code description → family | `op_text_rule` **(table)** ← `OP_TEXT_RULES` in `lib/dms/mapping.ts` | **9** | `rebuild_dms_periods` at rebuild time | **File.** The table is a cache the file overwrites. |
| 4 | Canonical op codes | `op_code_catalog` **(table)** ← `op_code_seed.csv` | **73** | admin, importer, `op_code_family` FK | **Table**, but the seed CSV is **not in the repo** — see below. |
| 5 | Op code → family | `op_code_family` **(table)** ← `data/op_code_family_map.csv` | **73** | nothing yet (built this session) | **Table.** CSV is the editable artefact. |
| 6 | Aliases | `mapping_alias` **(table)** | **3** | nothing yet | **Table.** No file. |
| 7 | Filename prefix → collection | `scripts/ingest-videos.ts` | ~6 | ingest only | **File.** |
| 8 | Voice spellings | `VOICE_CANON` in `scripts/backfill-content-tags.ts` | ~20 | backfill only | **File.** |
| 9 | Doggett DMS code → canonical code | `Doggett_Sub-category_to_EDIAGD_Op_Code_Map.xlsx` | 46 | **nothing** | **A spreadsheet in Downloads.** Not in the repo, not in the database, read by no code. |

### The two that need saying out loud

**`op_code_seed.csv` is not in the repo.** `op_code_catalog` (73 rows) was
seeded from a file that lives in `~/Downloads`. `scripts/seed-op-codes.ts`
exists and works, but the input it validates against is on one laptop. If that
file is lost, the catalog is only reconstructable by dumping the table. It
should be committed to `data/` alongside `op_code_family_map.csv` whatever else
happens.

**Screen 3 has no backing anywhere.** The dealer translation table — 208 Doggett
DMS codes → 73 canonical codes — does not exist as a table, a file in the repo,
or a code path. Mitch's 46-row spreadsheet is a partial seed for it and nothing
reads it. This is the screen with the most new construction behind it.

### Current state of the data

```
sub_category_map   815    auto 561 · not_coachable 146 · unmapped 108
op_text_rule         9    in sync with the rule file
dms_unmapped_sub_category  254
advisor_op_metric  61,941   1,829 carrying a resolved_family
dms_import_row    164,999   across 21 committed imports
perf_period          220
rooftop               11
```

---

## 2 · What breaks if the database becomes the source of truth

| Mapping | What breaks | Difficulty |
| --- | --- | --- |
| **1 · sub-category → family** | Nothing structural — the table already *is* the read path. What breaks is `checkmap`'s "would the rule file have caught it?" check, which exists precisely to catch drift between file and table. Once the table is authoritative that comparison is meaningless and must be replaced by an *export* diff (table → file) instead. | **Low** |
| **2 · NOT_COACHABLE** | Same as 1, and it is already materialised into `sub_category_map.status`. | **Low** |
| **3 · op_text_rule** | `remap` currently *overwrites* the table from the file on every run. That must invert: the table becomes authoritative and `remap` stops seeding it. Otherwise the first `remap` after an admin edit silently reverts Mitch's work. **This is the sharpest edge in the whole inventory.** | **Medium — and it is a footgun today** |
| **4 · op_code_catalog** | Nothing; already table-first. Commit the seed CSV as an export. | **Low** |
| **5 · op_code_family** | Nothing; built table-first this session. | **None** |
| **6 · mapping_alias** | Nothing. | **None** |
| **7 · filename prefix** | Ingest runs as a script with no database read on this path. Moving it to the table means ingest gains a query it does not have, and an offline/failed read must **fail the ingest** rather than fall back to a stale constant — otherwise a video files itself into the wrong collection quietly. | **Medium** |
| **8 · VOICE_CANON** | Backfill-only, runs rarely. Same fail-closed requirement. | **Low** |
| **9 · dealer codes** | Nothing to break; nothing exists. | **New build** |

**The single ordering constraint:** #3 must invert *before* the admin screens
ship, or the first `npm run remap` after Mitch edits an op-text rule reverts
him with no warning and no log.

---

## 3 · `remap` and `checkmap` as server-side jobs

**What they do now**

`checkmap` is **read-only** and already safe to run from a server action. It
reads `sub_category_map`, `op_text_rule`, `dms_unmapped_sub_category` and
`advisor_op_metric`, compares the table against the rule file, and exits
non-zero on a real failure so it can gate a deploy.

`remap` does three things, in an order that matters:
1. pushes `OP_TEXT_RULES` into `op_text_rule` via `set_op_text_rules`
2. walks all 21 committed imports, computes `autoMatch()` per distinct
   sub-category, and writes through `apply_sub_category_automap`
3. **tells the caller to run `rebuild_dms_periods(null, null)` and does not do
   it** — deliberately, because the rebuild is the expensive half and belongs
   to whoever is watching

**Measured timing, this session, against live Doggett data**

```
checkmap, full run                    3.8 s     read-only
```

**I did not time a full `remap`, and that is itself a finding: `remap` has no
dry-run mode.** It writes to `op_text_rule` and `sub_category_map` on the only
path it has. Running it to measure it would have written to production for no
reason. Its two write phases are small — 9 rules and 815 map rows across 21
imports — and should land in the same few seconds as `checkmap`.

The cost is entirely in step 3, which the script never runs: `rebuild_dms_periods`
recomputes 220 periods over 164,999 import rows into 61,941 `advisor_op_metric`
rows. The script's own comment calls it "minutes of work across the whole
network". I have not measured it and will not guess a number.

**Where they should live**

```
/admin/mapping/jobs
  ├── Preview   checkmap + a diff of what WOULD change      read-only, ~4 s, safe to run on every screen load
  ├── Apply     remap steps 1–2                              writes mapping tables only
  └── Rebuild   rebuild_dms_periods(null, null)              minutes; explicit, separate button, progress shown
```

Three buttons, not one, because they have three different blast radii. The
current script collapses 1–2 into a single unpreviewable write and leaves 3 to
human memory — which is exactly the shape the admin screens are meant to fix.

**Two things `remap` needs before it can be a UI button:**
- a **dry-run mode** that returns the diff without writing (this is what the
  guardrail "preview before apply" requires, and it does not exist)
- **inverting the `op_text_rule` seed** so a run stops overwriting admin edits

---

## 4 · The measurement-epoch hazard

**The test: does changing this mapping change a number an advisor is measured
on, after they have already been measured on it?**

### Epoch-critical — an edit here moves the ground

| Mapping | What moves |
| --- | --- |
| **1 · sub-category → family** | Directly. `family` decides which bucket an RO lands in, which decides `advisor_family_attach`, which decides the attach rate, the benchmark, the status dot and **Eddie's Pick**. Moving one busy sub-category can move thousands of ROs between families. |
| **3 · op_text_rule** | Same, one level down: it decides `resolved_family` on `advisor_op_metric` for the op-code-text slice. 1,829 rows carry a verdict today. |
| **9 · dealer DMS code → canonical** | Will be, the moment it exists and the pick reads it. This is why the brief's lock-before-launch matters. |

For all three, the honest behaviour is: **`effective_from` on the row, and a
rebuild that recomputes only forward from that date**, leaving history on the
old mapping. A silent overwrite makes last month's Eddie's Pick incomparable to
this month's with nothing recording that the ground moved — the same failure
the booking-policy epochs exist to prevent.

There is a second-order effect worth naming: because a rebuild is
all-or-nothing today (`rebuild_dms_periods(null, null)`), **the current tooling
cannot honour an effective date at all.** It recomputes every period from the
current rules, which retroactively rewrites history by construction. Making
epochs real needs the rebuild to take a date floor, not just the table to carry
a column.

### Not epoch-critical — content routing only

| Mapping | Why it is safe |
| --- | --- |
| **5 · op_code_family** | Decides which *cues* reach which family. Changes what an advisor is coached with, not what they are measured on. **This changes under contract (b)** — once the pick is made at op-code grain, this table becomes epoch-critical too. |
| **4 · op_code_catalog** (name, category) | Labels. `code` is the key and is referenced by content, so renaming a code *is* dangerous — hence retire-never-delete on screen 1. |
| **6 · aliases** · **7 · prefixes** · **8 · voices** | Affect import and ingest, never measurement. |

### The one that is both

**`coachable`** on `op_code_family`, and family-level coachability. Flipping a
family from coached to not-coached doesn't move any number — but it does change
which family Eddie's Pick can land on, so an advisor's coaching history
develops a discontinuity that no metric explains. Not an epoch, but it belongs
in the audit log with a reason attached.

---

## What I would build first

1. **Commit `op_code_seed.csv` to `data/`.** One file move, removes a
   single-laptop dependency on the catalog.
2. **Invert the `op_text_rule` seed in `remap`** before any screen ships.
   Otherwise the admin's first edit is silently reverted by routine tooling.
3. **Add `--dry-run` to `remap`**, returning the diff. The "preview before
   apply" guardrail is unbuildable without it.
4. **Give `rebuild_dms_periods` a date floor** so effective dates can mean
   something. Without this, epochs are a column nobody can honour.
5. Then screens, in the order the seeds are ready: **1 (Op Codes)** and
   **2 (Families)** are pure reads of tables that now exist; **4 (Aliases)** is
   three rows and a form; **3 (Dealer Codes)** is the real build and needs a
   table, an auto-matcher and 208 rows of Doggett data behind it.

Stopping here.
