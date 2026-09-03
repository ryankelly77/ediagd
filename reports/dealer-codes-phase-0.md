# Dealer Codes — Phase 0

What the two translation grains actually are, who edits them today, and what is
waiting. Written before the screen, so the screen is built against the database
rather than against a description of it.

---

## 1 · Two grains, and only one of them feeds anything

### Sub-category → family — LIVE

`sub_category_map`, keyed `(rooftop_id, sub_category)`, effective-dated since
0074 with `sub_category_map_live` as the current-version view.

This is the grain measurement reads. The chain:

    dms_daily_metric.sub_category
      -> sub_category_map.family
        -> advisor_family_attach / advisor_family_labor
          -> Eddie's Pick, the store benchmark, the coaching block

Change a row here and an advisor's attach rate moves. That is why every write
goes through `mapping_edit()` and why the Correction/Change distinction exists:
a correction says the mapping was always this and re-measures history, a change
says it starts now.

**815 live rows** across 11 rooftops.

### DMS op code → canonical code — NOT LIVE, NOT EVEN PRESENT

`advisor_op_metric.op_code` holds **1,805 distinct raw codes** for Doggett, and
`dms_daily_metric` carries `op_code` plus `op_description` and per-code volume.

Nothing maps them to `op_code_catalog`. There is no table for it. Coaching is
family-grained today, so the op-code grain is data we hold and do not use.

Section 2 of the new screen creates that table and starts collecting rulings
**before** anything reads them, because when Eddie's Pick moves to op-code
precision the bridge has to already have an honest history. A mapping invented
on the day it is first needed has no effective dates worth trusting.

---

## 2 · Who edits these today, and what happens to them

One surface: **`/admin/dms/mapping`** (plus `/admin/dms/mapping/confirm`),
registered in `NAV_EXEMPT` as "the sub-category queue, opened from DMS Upload
once an import lands".

Four server actions in `lib/dms/mapping-actions.ts`, all already routed through
`applyMappingEdit` → `mapping_edit()`:

| action | what it does |
|---|---|
| `setSubCategoryFamily` | one sub-category at one rooftop |
| `markNotCoachable` | rules a sub-category out of coaching, every rooftop |
| `clearNotCoachable` | puts it back in the queue |
| `setFamilyEverywhere` | one family for a sub-category at every rooftop |

### Ruling: ABSORB, not supersede

The actions are already correct and already the single write path. Rewriting
them would be building a second door in order to close the first.

So: the new screen **calls the same four actions**, and `/admin/dms/mapping`
becomes a redirect to `/admin/mapping/dealer-codes`. The queue does not move —
it grows a dealer picker, volume evidence, and Mitch's proposals beside it. One
surface, one write path, and the DMS Upload screen keeps its link because the
link still lands somewhere useful.

---

## 3 · What is waiting

### Sub-category rows, by status

| status | rows | meaning |
|---|---|---|
| `auto` | 561 | matched by rule file — a guess somebody should be able to disagree with |
| `not_coachable` | 155 | a decision: state inspections, diagnosis, body work |
| `unmapped` | 99 | nobody has ruled |
| **total** | **815** | |

`confirmed` is absent from this table today: every row is either an automatic
guess, a not-coachable ruling, or unmapped. Confirming an auto row is one of the
things the screen makes possible.

### Mitch's deck-map proposals

**49 unconfirmed**, and **all 49 name a sub-category Doggett has actually
sent** — so every one is a real ruling waiting, not a hypothetical. 48 carry Aug
2026 volume evidence (ROs, labor, store count); the 49th is the Tires row added
by the 055–057 ruling.

Two are already confirmed (`ABL-006`, `ACO-010`, `EVC-007` are code-to-code
aliases rather than sub-category proposals, and are not part of this queue).

### The dealer grain

`org` already exists: **one row, "Doggett Automotive Group", 11 rooftops**. A
second dealer is a second `org` row. No schema change is needed for the picker,
which is what the brief asked for — the model already had the grain.

---

## Nothing contradicts the design

Two things the design does not yet have a home for, both handled in the schema
commit rather than by bending an existing table:

* **Lock state** is per dealer, and `org` has nowhere to put it.
* **Section 2's rulings** need an effective-dated table that `mapping_edit()`
  will accept, which means adding it to that function's whitelist.
