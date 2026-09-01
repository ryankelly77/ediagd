# Knowledge-tab re-import — Phase 0

**Date:** 2026-08-31 · **Source:** `~/Downloads/Ediagd_master_2026_08_17_v2.xlsx`
**Report only. Nothing written.**
**CSV:** `reports/knowledge-tabs.csv` — every source row with its proposed title, body, tier and codes.

---

## Stop before Phase 1: the 450 are not one thing

**223 are stumps. 169 are finished cues that were never damaged.** They sit in the
same twelve source labels and look nothing alike:

```
STUMP    **A/C STILL REQUIRES SERVICE — POE OIL ONLY ON ELECTRIC COMP
         lead with POE-only on every EV/Hybrid A/C conversation

WRITTEN  Arctic Blast
         Arctic Blast is a lifetime service, so long as the A/C is not
         compromised. If it is, we recommend an EVAP service first.
```

The second is Mitch's own writing — short title, whole sentences, no markdown,
nothing truncated. There are **169 of those**, and the Phase 1 rule as written
("existing draft rows with no source match → retire, they're stumps of
nothing") would withdraw every one, because they have no source row by
definition: they never came from a knowledge tab.

**Proposed change to Phase 1:** only rows that are stumps are eligible for
update-or-retire. A row is a stump when its title is ≥58 characters (the 60-char
cut) or begins with `**`. Everything else is left exactly as it is — not
updated, not retired, not touched. Say the word and I'll apply that; I have not
assumed it.

---

## Q1 — Long-text columns on `content`

| Column | Holds today |
| --- | --- |
| `body` | the servable text |
| `coaching_nugget` | why this one, for the advisor |
| `best_used_for` | short applicability note |

There is **no home for the full Fact**. `best_used_for` is a phrase field, not a
paragraph, and overloading it would put lesson material in a column the quote
screens already render inline.

**Proposal: one additive column, `detail text`** — the untruncated Fact, which
is the lesson material the LMS will need for service-knowledge lessons. Additive
only, nullable, no backfill required.

---

## Q2 — The publish gate: your inference and mine were both wrong

I said last time I'd inferred `service_family` was the gate. It is not, and I
should not have offered it without checking:

```
published cues                      1,245
  ... with null service_family        404
draft cues                            450
  ... with null service_family        450
```

404 published cues have no service family. Checking every other column that
could plausibly gate it:

| Column | Published | Draft |
| --- | --- | --- |
| `service_family` | 841 / 1245 | 0 / 450 |
| `tier` | 1245 / 1245 | 450 / 450 |
| `module_id` | 1245 / 1245 | 450 / 450 |
| `subcategory` · `op_code` · `collection` · `placement` | 0 / 1245 | 0 / 450 |

**Nothing structural separates them.** `status` is a flag somebody set. The 450
were left draft because they were visibly broken, not because a rule stopped
them. Worth knowing for Phase 2: publishing a tab is purely a `status` write,
with no gate to satisfy first.

Also worth flagging: **`op_code` is null on all 1,245 published cues.** The
re-imported rows will be the first cues in the library to carry one. That is
consistent with `collection = 'Pitches by Op Code'` and with the 0063
constraint requiring an op code for that collection — but it means these rows
will behave differently from every other cue, which is a change worth wanting
rather than discovering.

---

## Q3 — Matching: 223 of 223 stumps matched

Normalized first-40 characters of the Fact against the stump title, plus tab
name. 40 rather than 60, so the key sits comfortably inside the cut.

| Tab | Source rows | Drafts | Stumps | Written | Stumps matched |
| --- | ---: | ---: | ---: | ---: | ---: |
| Service Knowledge — AC HVAC | 86 | 95 | 57 | 38 | **57** |
| Service Knowledge — EV Hybrid | 83 | 89 | 51 | 38 | **51** |
| Product Knowledge — Hoses | 143 | 48 | 33 | 15 | **33** |
| Product Knowledge — Headlights | 20 | 43 | 29 | 14 | **29** |
| Product Knowledge — Timing Belt | 148 | 24 | 16 | 8 | **16** |
| Product Knowledge — Belts | 148 | 20 | 13 | 7 | **13** |
| Product Knowledge — Wipers | 83 | 18 | 11 | 7 | **11** |
| MOC Warranty | 59 | 42 | 11 | 31 | **11** |
| The 4-Step Close | 13 | 13 | 2 | 11 | **2** |
| | **783** | **392** | **223** | **169** | **223 — 100%** |

Every stump has a source row to be repaired from, so ids survive and the two
rows already in the review queue keep their flags.

**783 source rows against 223 stumps.** The original import took a small
fraction of each tab — Timing Belt has 148 rows and produced 16. The other 560
are new inserts, which is most of the work: this is less a repair than a first
proper import.

Two corrections I had to make to get here, both mine:

- **The walk dropped everything after PART A.** `Fact / Talking Point` appears
  once per tab, above PART A; I was treating each later `PART` banner as
  closing the data section. MOC Warranty read as 8 rows when it has 59.
- **The match rate was measured backwards.** Counting source→stump through a map
  keyed on stump prefix silently loses stumps that share 40 characters. A/C
  HVAC reported 28 of 59 when the true figure is 57 of 57.

---

## Q4 — The sources with no tab are not stumps

| Draft source | Rows | Stump / Written |
| --- | ---: | --- |
| **Engine & Perf** | 21 | **0 / 21** |
| Belts & Hoses | 10 | 0 / 10 |
| Wipers | 8 | 0 / 8 |
| Lasting Impressions | 4 | 2 / 2 |
| Walk Around Tip | 1 | 0 / 1 |
| Nametag Skills | 1 | 1 / 0 |

**Engine & Perf has no tab in v2 and needs none** — all 21 rows are finished
cues, none truncated. The name survives in the workbook only as a
cross-reference (`Cross-references Engine & Perf R11` in A/C HVAC), so it was a
section label in an older book, not a lost tab.

Same for Belts & Hoses and Wipers: they read as the pre-split names of
`Product Knowledge — Belts` / `— Hoses` / `— Wipers`, and their rows are intact.

**Only 3 stumps in the whole library have no source row**: 2 in Lasting
Impressions, 1 in Nametag Skills. Those need you or Mitch — there is no v2 tab
to recover them from.

---

## Q5 — Codes: three real unknowns, and a regex trap

**Every code that does not resolve, that a tab actually declared:**

| Tab | Unknown codes |
| --- | --- |
| Service Knowledge — AC HVAC | **ABL-006** · **ACO-010** · **EVC-007** |

That is the whole list. `ACS-048` and `WBF-018` — both named in the brief as
expected unknowns — **do resolve** against `op_code_catalog`.

Everything else that looked like an unknown code was **a vehicle model**:

```
CX-50  CX-70  CX-90  MX-30  FL-22   Mazda models and a Mazda coolant spec
FS-65  YN-35  AAR-024                appear only in row prose
```

`ABC-123` cannot distinguish `CX-90` from `ACR-047`, and tightening the pattern
does not help because the catalog itself holds two-letter codes (`FF-003`,
`OF-008`). What separates them is *where they appear*: a real op code is
declared in the tab's `Op Codes:` header, a model name only ever turns up in
row prose. The report splits them on exactly that, and guesses at neither.

**For Mitch — three codes to translate:**

| Old code | Appears in | Context from the tab |
| --- | --- | --- |
| `ABL-006` | A/C HVAC header + 2 rows | "Arctic Blast" |
| `ACO-010` | A/C HVAC header + 2 rows | "A/C Odor" |
| `EVC-007` | A/C HVAC header + 3 rows | "Evap Core" |

Once he gives canonical codes, they go in the alias table and the import
re-resolves. There is no alias table yet — I'd add it with the `detail` column
in the same migration.

---

## What Phase 1 will do, given the above

Unchanged from your spec except where noted:

- **Only stumps are updated or retired.** The 169 written rows are untouched. *(change)*
- 223 stumps updated in place, ids preserved, staying draft.
- ~560 new rows inserted as draft, with `source_tab` / `source_row` recorded.
- `body` = the Zero/Low quoted line where present, else the first sentence of
  the Fact. Never a truncation.
- `detail` = the full Fact, markdown stripped.
- Rows whose only codes are `ABL-006` / `ACO-010` / `EVC-007` land in review
  rather than importing with a guessed code — that is the A/C HVAC tab, so
  expect a visible chunk of it to wait on Mitch.

Say go and I'll write the migration (`detail`, `source_tab`, `source_row`,
op-code alias table) and the importer.
