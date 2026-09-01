# The Daily Loop as it exists today — Phase 0

**Date:** 2026-08-31 · **Report only. No code changed.**
Read from `lib/advisor.ts`, `lib/advisor-data.ts`, `lib/coachable-families.ts`,
`lib/daily.ts`, `app/(app)/today/page.tsx`, `lib/gamification/completeDay.ts`,
migrations 0011 / 0025 / 0029 / 0062 / 0063, and the live database.

---

## The finding that blocks the contract

**There are three op-code vocabularies in this system, and the one the contract
needs does not connect to the one the metrics use.**

```
1.  DMS op codes          advisor_op_metric.op_code
                          '30000'  '7000'  'MOCACD'  'DIAG'  'T0100'  'AF'  '11X'
                          208 distinct values at Doggett

2.  EDIAGD catalog codes  op_code_catalog.code
                          'BFF-012'  'ACR-047'  'EAF-001'
                          73 codes, 14 categories — Mitch's coaching taxonomy

3.  Service families      advisor_op_metric.resolved_family, and every view
                          'Brake Service'  'Fluids'  'Fuel System'
```

**Zero of the 208 DMS codes appear in `op_code_catalog`.** They are not the same
namespace and were never meant to be — vocabulary 1 is what the dealer's system
emits, vocabulary 2 is what Mitch wrote coaching against.

The DMS → family bridge **exists** (`resolved_family`, built by
`lib/dms/mapping.ts`). The catalog → family bridge **does not exist in any
form** — not a table, not a view, not a column. I checked for
`op_code_family`, `service_family_map`, `op_code_service_family`,
`dms_op_code_map`: none exist.

### What that means for the contract as written

> *"The pick is made at the op code grain, with the family as its label
> ('Brakes' on screen, `BFF-012` underneath)."*

Not buildable today, for three separate reasons:

| Needed | Status |
| --- | --- |
| Advisor attach rate per catalog code | **Does not exist.** `advisor_op_metric` is keyed by DMS code; attach rates are only computed at family grain (`advisor_family_attach`). |
| Benchmark per catalog code | **Does not exist.** `family_store_benchmark` is family-grained. There is no `op_code_store_benchmark`. |
| Catalog code → family | **Does not exist.** The catalog's 14 `category` values are a different vocabulary again (below). |

So the acceptance test — *"a test advisor whose brake fluid attach (`BFF-012`)
is 4% against a 22% benchmark"* — cannot be expressed against today's data. The
closest real number is **Brake Service family attach**, which blends `BFF-012`,
`BFF-013`, `RTF-030`, `RTR-031`, `BCS-032` and two more into one rate.

### The category ≠ family problem

`op_code_catalog.category` looks like it should be the bridge. It is not:

| Catalog category | Nearest coachable family | |
| --- | --- | --- |
| Brakes | Brake Service | renamed |
| Tires | Tires & Rotation | renamed |
| Battery & Electrical | Battery | renamed |
| Filters · Fluids | Filters · Fluids | **match** |
| Fluid Exchanges | — | no family |
| Engine & Performance | — | splits across Fuel System + others |
| Menus · Accessories · Inspection · EV / Hybrid · Suspension · Wipers · Belts & Hoses | — | no coachable family |

And in the other direction, four coachable families have **no** category:
`Oil Change` (its code `OIL-009` sits in *Fluids*), `Alignment` (`ALN-024` in
*Tires*), `Differential`, `Spark Plugs`.

**Two of fourteen match by name.** A mapping is a ~73-row editorial decision,
not a derivation. That is the first thing Phase 1 needs and the first thing I
cannot invent.

---

## 1 · Eddie's Pick, as built

`lib/advisor.ts` — pure functions, family grain throughout.

```
advisor_family_attach   ─┐
family_store_benchmark  ─┼──►  buildServiceFamilies()  ──►  eddiesPick()
advisor_family_labor    ─┘
```

- **Gate 1 — volume.** `hasCoachingVolume(totalRos)`: fewer than
  `MIN_ROS_FOR_COACHING = 20` ROs in the period and the pick is `null`. Below
  that, one extra oil change swings a rate by whole points.
- **Gate 2 — coachable.** `isCoachable(family, familiesWithCues)`. Two lists:
  `COACHABLE_FAMILIES` (9, always on) and `COACHABLE_PENDING_CONTENT` (6 of
  Mitch's new families, content-gated). A pending family coaches only if it
  appears in `loadFamiliesWithCues()`.
- **Content-gating** reads the `service_family_cue_count` view — families with
  ≥1 published cue. It **fails closed**: on error it returns an empty set, so
  the six pending families go quiet rather than shipping empty shelves.
  Today the view returns 8 families.
- **Benchmark floor.** A family with a null rate or null `store_avg_pct` is
  dropped rather than rendered — `buildServiceFamilies` returns `null` for it.
- **Worked-day matching** is not in the pick. It lives in `was_scheduled` on
  the completion row (0025), stamped at write time.
- **Ranking.** `opportunity = missedRos × laborPerRo` when
  `laborPerRoByFamily` is supplied, else `missedRos`. Sort is status band
  (`pursue` → `close` → `on-track`) then rank descending. `eddiesPick` then
  takes the highest-ranked family strictly below store average.

⚠️ **Every caller must pass `laborPerRoByFamily`** or ranking silently falls
back to RO count and reorders. That is a live footgun, unchanged.

**Battery is deliberately off** despite having 56 published cues — a standing
decision, not an oversight.

---

## 2 · How the cue is chosen

`pickCoachingCue(client, date, service, tier)` in `lib/daily.ts`.

**By `service_family` and `tier`. Not by `module_id`.** Three steps:

```
1.  type=cue · status=published · service_family=<family> · tier=<zero|low>   → "service+tier"
2.  type=cue · status=published · service_family=<family>                     → "service"
3.  type=cue · status=published · tier=generic · service_family IS NULL       → "generic"
```

Step 3 is the 404-row generic pool, drawn at rotation offset 7 so it can't land
on the same row as the quote. **There is no "no cue" state** — the fallback
always returns something, which is why an empty family currently degrades to a
generic passage rather than an empty card.

`cueTierForRate(rate)` → `zero` if `rate <= 0`, else `low`. `generic` is
content-only; it is never selected *for* an advisor, only as fallback.

Selection is `pickByRotation`: `count` first, then
`(epochDay + offset) % count` as a single-row `.range()` against an
`ORDER BY id`. Deterministic, no per-advisor state, no repeat memory beyond the
cycle length.

**`module_id` is set on all 1,695 cues and is not read by the loop at all** — it
routes the LMS. So the contract's premise that "`module_id` routes cues" is not
true of the daily loop; `service_family` does.

---

## 3 · Quote and video

**Quotes** — `pickQuotesForDay(client, date, videoArtifactId)`:
- Pool: `type=quote · status=published · quote_slot IN (slot, 'both')`.
- `voiceDiverseOrder()` reorders so no two neighbours share a voice, then
  `rotationIndex(date, …)` picks. Slot 3 first, slot 2 yields to it.
- **Artifact dedup**: slot 3 and slot 2 both step past the video's `artifact_id`
  twin, so an idea is served in one format per day.
- The pool filters on `status`, not `retired_at` — retiring sets
  `status='draft'`, so retired rows do drop out.

**Video** — `pickLifestyleVideo(client, date, userId)`:
- Pool: `type=advisor_video · placement=daily_lifestyle · status=published`,
  ordered by id, capped at 1,000.
- Deterministic rotation, then signed Mux playback minted per view.
- Returns `artifactId`, `quoteText`, `quoteVoice` for the linked twin.

**Both are `Mindset` today.** There is no Sales/Life alternation on slot 1 and
no Mindset/Craft rotation on slot 3 — the contract describes both; neither
exists.

---

## 4 · What a served day records

`daily_completion` (0011 + 0025):

| Column | |
| --- | --- |
| `user_id` · `rooftop_id` · `completion_date` | unique on (user, date) — the idempotency guard |
| `quote_content_id` | **one** quote id |
| `cue_content_id` | the cue |
| `video_content_id` | the lifestyle video |
| `was_scheduled` | three-valued, stamped at write time |

**What is not recorded, and is needed for the contract:**

- **The second quote.** Two quotes are served, one column exists. Slot 2's quote
  is not written down anywhere.
- `op_code` · `stage` · `tier` · `block_id`
- the slot-2 **pitch video** (distinct from the lifestyle video)
- which fallback step fired (`service+tier` / `service` / `generic`) — so today
  there is no way to measure how often the loop degrades to a generic passage.

Nothing can be credited to a certification later that isn't written now, and
right now four of the six contract fields have nowhere to go.

---

## 5 · Where an `op_code` row breaks the loop

**A re-imported knowledge cue would be invisible.** It carries
`op_code='ACR-047'`, `collection='Pitches by Op Code'`, `service_family=NULL`,
`tier='zero'|'generic'`, `module_id=NULL`.

| Step | Result |
| --- | --- |
| 1 · `service_family=<family>` + tier | never matches — `service_family` is null |
| 2 · `service_family=<family>` | never matches |
| 3 · generic | requires `tier='generic'` **and** `service_family IS NULL` — a `zero`/`low` row fails; a `generic` row *would* join the 404-row generic pool and could be served to any advisor on any service |

So publishing them today produces one of two bad outcomes: **unreachable**, or
**reachable by everyone for no reason**. Neither is a crash — which is worse,
because nothing reports it.

Two schema notes that constrain Phase 1:
- 0063 `content_pitch_needs_op_code` — `collection='Pitches by Op Code'`
  requires a non-null `op_code`. Correct and already enforced.
- 0063 `content_stage_needs_op_code` — `stage` requires `op_code`. Also fine.
- **Zero rows in the database have `op_code`, `stage`, or
  `collection='Pitches by Op Code'` today.** The re-import creates the first.

---

## What Phase 1 needs from you before it can start

1. **The catalog → family mapping.** ~73 codes to families. Without it, op-code
   rows cannot be reached by a family-grained pick, and legacy rows cannot be
   bridged the other way. This is the blocker.
2. **A decision on pick grain.** The contract says op code; the data supports
   family. Three options:
   - **(a) Keep the pick at family grain**, use the mapping to select cues by
     op code *within* the chosen family. Buildable now once the mapping exists.
     Blocks lock to a family, stages advance inside it.
   - **(b) Build per-op-code attach and benchmark views** from
     `advisor_op_metric` + the DMS→catalog mapping. This is the contract as
     written, and it needs a second mapping (208 DMS codes → 73 catalog codes)
     that also does not exist.
   - **(c) Ship (a) now, (b) when the DMS mapping lands.**

   My recommendation is **(c)**. (a) delivers the block, the stages, the tier
   ladder, the recording and the no-content state against real numbers this
   week; (b) is a data-mapping project that shouldn't hold the rest hostage.
3. **Confirm the five-day block shape** with Mitch, per your note.
4. **Sales/Life quote alternation and Mindset/Craft video rotation** — both are
   new, neither exists today.

Everything else in the contract — fallback ladder, block config, extended
`daily_completion`, the explicit no-content state — is buildable without further
decisions, and I'll take it as approved once you rule on 1 and 2.

Stopping here.
