# 0125 — applied to production

*19 September 2026, 21:45 CT. `0125_one_resolved_family.sql` is on production.
All three migrations are now remote. **Nothing is deployed.** Stopping for your
read; the deploy is the next prompt.*

---

## The check, with its before state

**`service_family_content` answers, and Belts & Cooling on `/service` lists
twelve films with the Video tab no longer saying "Soon."**

| | Before | After |
|---|---|---|
| `service_family_content` | **PGRST205** — does not exist | **2,321 mappings** |
| `advisor_family_film_progress` rpc | **HTTP 404** | HTTP 200 |
| Belts & Cooling, resolved | *(unanswerable)* | 890 mappings, 451 distinct |
| Belts & Cooling **films** | *(the "Soon" badge)* | **12** |
| Belts & Cooling cues | 439 via the old count | 439 |
| `test:brakes` against prod | 8 passed, **5 failed** | **12 passed, 0 failed** |

```
Video tab would render:  Films 0 / 12        (no "Soon" badge)
films: CLH-042, SRP-038, TMB-039 — four stages each
```

**The contradiction that opened 3c is closed.** The pitch slot and the advisor's
own screen now read the same relation, so a morning serving a Belts & Cooling
film can no longer coexist with a screen saying that family has none coming.

### Nothing was recomputed into a different answer

The one thing worth checking on a migration that rewrites `recompute_certification_content`:

| | Before | After |
|---|---|---|
| service certifications | 18 | **18** |
| certification items | 1,536 | **1,536** |
| active | 12 | **12** |

**No certification changed. The resolution moved; the counts did not.** That is
the result I wanted and not the one I would have assumed — a new resolver that
agrees exactly with the old one on live data is evidence it is a unification
rather than a redefinition.

### Backup

```
backups/pre-0125-schema.sql     502 KB
  verified before pushing: contains advisor_pool_seen (17 refs, 0124)
                           contains service_family_content (0 refs)
```

Production migration state: `0123 → 0123`, `0124 → 0124`, **`0125 → 0125`**.

---

## The loop against production, all three now on

Run with the real `assembleMorning` against production data. **This is the
function answering correctly, not a claim about the deployed app** — the code is
still uncommitted and undeployed. It is the evidence for the deploy gate.

```
Ryan Kelly      MORNING KIND: normal
                mindset  Confidence
                pitch    On the Drive              [Filters 1/8]
                item     Walk Around 28/56
                legs: mindset* pitch* item* track_film-    FINISHABLE: yes

Demo Advisor    MORNING KIND: normal
                pitch    …                         [Belts & Cooling 1/12]
                legs: mindset* pitch* item* track_film-    FINISHABLE: yes

Mitch Hardt     MORNING KIND: two_slot      assignment none   (the floor)
                legs: mindset* pitch- item* track_film-    FINISHABLE: yes

Tracie Mendoza  rooftop provisioned: NO -> RooftopNotReady, no morning assembled
```

**Three of three.** The check that failed on 0124 was a check on the pair, and
it passes now that the pair is complete.

---

## Ruling 4 — I corrected my own prediction, and here it is on the record

In the 0123 report I wrote that 0124's `update coaching_block` was **required**,
and predicted a stale-page refusal as the one user-visible artifact of that push.

Both were wrong, and in the same way. The UPDATE was justified by an assertion
in `completeDay` that I had **already removed in this same phase** — correct SQL
defended by a mechanism that no longer existed. Once the statement was dropped,
the artifact I had predicted went with it: `coaching_block` came back
**byte-identical** after the 0124 push, same `ended_on`, same `updated_at`, and
there was nothing for you to recognise.

The prediction was not wrong because the reasoning slipped. It was wrong because
I never checked that the thing I cited was still there. That is the eighth
instance, and it is the same failure as everything below: **a confident answer
derived from something nobody re-read.**

---

## Ruling 2 — how big is the gap the derivation actually ranks on?

### First: the number I gave you in part two was unstable, and I caught it here

I quoted **29** post-floor derivations. Measuring it properly gave 25 on one run
and 30 on the next. The cause was mine: I was paging PostgREST **without an
`ORDER BY`**, so rows repeated across pages and others were never fetched at all.
Every paged read in the measurement now carries a stable sort key, and the
result repeats exactly across three consecutive runs.

**The real number is 30.** Treat 25 and 29 as artifacts; neither was measured
the way this one was. *(This is the same class as everything in the sweep below —
a confident number from a read that silently did not return what it claimed.)*

### The measurement

Across **30 operators** who derive a family with the 20-RO floor applied, on
production, ranked exactly as `derive_focus_family` ranks them:

| Top gap, in missed ROs | Operators |
|---|---|
| **< 0.5** | **6** |
| **0.5 – 1** | **2** |
| 1 – 3 | 14 |
| 3 – 10 | 8 |
| 10 + | 0 |

| Top gap, in labor dollars *(29 of 30 have a figure)* | Operators |
|---|---|
| < $25 | 0 |
| **$25 – $50** | **3** |
| $50 – $200 | 10 |
| $200 – $1,000 | 16 |

> **8 of 30 — 27% — rank on a top gap below one missed RO.**
> 3 of 29 rank on under $50 of labor.
> Median: **2.30 missed ROs, $212.**

### The thin ones, and the column that matters

```
rooftop                          op       family            ROs  missed      $  gap pp  alts
Doggett Honda Med Center         901931   HVAC               24    0.10    $43    0.4    1
Doggett Ford of Beaumont         274      Brake Service      30    0.12      —    0.4    1
Doggett Chrysler Dodge Jeep Ram  400025   Belts & Cooling    23    0.16    $94    0.7    1
Doggett Nissan of Beaumont       800019   Brake Service      32    0.29    $34    0.9    1
Doggett Nissan of Beaumont       800047   Filters            37    0.33    $50    0.9    1
Doggett Honda of Beaumont        901815   Brake Service      33    0.36    $32    1.1    3
Mercedes Benz of Beaumont        610034   Brake Service      31    0.56   $137    1.8    3
Mercedes Benz of Beaumont        610036   Fluids             20    0.62   $201    3.1    2
```

**`alts` is the answer to your question.** Five of the eight have **exactly one
rankable family** — not a bad pick among many, but nothing to pick from. The
derivation is not mis-ranking these advisors. It is being asked to name a
weakness in someone who, as far as the data goes, has one gap of 0.4 percentage
points and no second candidate.

**So: a product problem, not a demo curiosity.** Roughly one advisor in four at
Doggett will be told to work on a family where the measured shortfall is a
fraction of a single repair order. That is not wrong, exactly — it is true and
trivial, which is worse, because the card states it with the same confidence as
Ryan Kelly's 7.39 missed ROs and $151.

I am not proposing the fix here; the threshold question (a second floor on the
*gap* rather than on volume, versus falling back to breadth) is a ruling, not an
implementation detail.

### The consequence for the Demo account

The Demo Advisor is **row three above**: Belts & Cooling, 23 ROs, **0.16 missed
ROs**, a 0.7-point gap, and **one alternative**.

> **Seeding the Demo account with more volume will not fix it.** The 20-RO floor
> is a volume floor and the account already clears it. What the account lacks is
> a *gap* — the demo needs an operator who is visibly behind their store on a
> family with films, not one who does more ROs.

Demoing this to Mitch as-is shows the card working perfectly and saying almost
nothing. That is a worse demo than an empty state.

---

## Ruling 3 — the swallowed-error sweep

Swept `lib/`, `app/`, `components/` and `scripts/` for every shape: `?? []`,
`?? 0`, `?? null`, `data!`, and bare `const { data }` with the error dropped.

```
bare const { data }, error not destructured   64  (application code)
non-null assertion on a query result           0
remaining false-pass swallows in the suites    1  -> fixed, below
```

**64 is the surface, not the finding.** Most are reads whose failure produces an
obviously empty screen. What follows is the ranked subset where a failure
produces a **confident wrong answer** instead.

### The worked example — `lib/service-family.ts`, the ninth instance

```ts
const { data, error } = await client.from("service_family_content")…
if (error || !data) break;
…
if (mapping.length === 0) return {};
```

A missing relation, an RLS refusal and a network failure are indistinguishable
from "this family has no films." This one **hid behind a migration boundary**:
between the 0124 and 0125 pushes it was live, every advisor silently got a
two-slot morning, nothing threw and nothing logged. The centre of the phase
simply did not fire, and the only reason I know is that I went looking. It was
written by me, in this phase, while fixing this exact pattern elsewhere.

### Ranked by what a person would actually see

| # | Site | On failure, the person sees | Who |
|---|---|---|---|
| **1** | `app/verify/[id]/page.tsx:79` | `data ?? { status: "not_found" }` — the public verification page tells an **outsider** the advisor's credential **does not exist**. A transient failure is rendered as a forged certificate. | **Anyone outside the company** |
| **2** | `lib/entitlements.ts:46` | An entitled manager is told **their store has not bought the product**. The comment above it says the whole point is to avoid a dead end; the swallow puts them in one. | Manager / advisor |
| **3** | `lib/certification-server.ts:59` | `rooftop_today` fails → falls back to **the server's UTC date**. A certification is stamped a day off for any rooftop west of UTC. This is the exact Chicago/UTC divergence that broke my own acceptance test. | Advisor's permanent record |
| **4** | `lib/admin-impact.ts:229` `loadThresholds` | Falls back to hard-coded **75 / 0.5**. If the dealer has tuned them, a failed read silently reverts the analysis to defaults and **the quadrant counts move** with nothing saying why. | Dealer principal |
| **5** | `lib/admin-impact.ts:198, 216` + `admin-engagement.ts` | ROI and the coaching grid render **zeros and empty quadrants** — "the programme produced nothing" rather than "we could not read it." | Dealer principal |
| **6** | `lib/loop.ts:91` `advisor_pool_seen` | Reads as "nothing seen" → the pool reshuffles → **the advisor is served a mindset film they already watched.** Precisely what Ruling 5 of 3b was about. | Advisor, daily |
| **7** | `lib/loop.ts:245` `advance_focus_family` | The composite trap is handled; an **RPC error** is not. Silent two-slot morning — the ninth instance's twin. | Advisor, daily |
| **8** | `lib/lms.ts:297` | `content_progress` unreadable → **nothing reads as complete**, module progress shows 0, and the shared `completeModuleIfReady` path sees an unfinished module. | Advisor |
| **9** | `lib/watch-gate.ts:75` | Reads as "never watched" → the leg stays unmet and **the day cannot be closed.** Fails closed, so at least it is visible. | Advisor |
| **10** | `lib/daily.ts:227` | The close screen renders **with no quote** — the thing Ruling 6 made the close. | Advisor |

**Not fixed. Reported, as ruled.** Items 1–3 are the ones I would take first:
each converts an infrastructure hiccup into a **false statement about a
person** — their credential, their entitlement, their record.

### The counter-example worth copying

`lib/gamification/completeDay.ts` does it right, at every single read:

```ts
if (todayError) throw new CompleteDayError(todayError.message, "rooftop_today");
if (settingsError) throw new CompleteDayError(settingsError.message, "game_settings");
if (swellReadError) throw new CompleteDayError(swellReadError.message, "swell.read");
```

The economy already treats an unreadable row as a failure rather than a zero.
Whatever you rule for the rest, the pattern is in the codebase already and does
not need inventing.

### Fixed in the suites, as ruled

One false pass survived part three's pass — `scripts/family-acceptance.ts:418`,
inside a **non-vacuity** check:

```ts
return Number(data?.published_cues ?? 0) === 3;   // before
```

The revert unpublishes a cue and the count should fall 3 → 2, so `false` means
"the guard bit." But an **errored read** also gives `0 !== 3` → `false` →
**non-vacuity "proven" by a read that never happened.** Identical in shape to
the revert that silently failed its CHECK constraint and reported passing anyway.
It now takes the error and throws. `accept:family` **34 passed, 0 failed**.

No other suite swallow can produce a false pass — the rest are fixture inserts
that would crash, or guarded by `need()`.

---

## Where this disagrees with the brief

Nothing in 0125 conflicts with the rulings. Two things to name:

- **`AGENTS.md`'s standing rule is satisfied for 0125 but not symmetrically.**
  `service_family_content` was exercised as `authenticated` through PostgREST by
  `accept:family` (34/34, including the base-tier advisor resolving nothing, and
  the same advisor resolving once the product returns). The production check
  above ran as the **service role**. Both paths are covered, but on different
  systems.
- **The measurement above is read-only JS that reimplements the ranking.** It
  agrees with what `derive_focus_family` actually wrote for the two real derived
  advisors (Filters 7.39/$151.39; Belts & Cooling 0.16/$93.50), which is the
  only cross-check available without writing to production.

Out of scope and untouched, as ruled: the Good News Story, provisioning any real
account, attaching films to tracks, the application-side swallowed errors, and
closing the coaching blocks (F1).

---

## Next

**The deploy**, on your go — and it is the real gate. Everything above is three
migrations and a set of functions answering correctly; not one advisor has seen
any of it. The 0125 evidence says the loop will serve three slots when the code
lands, and that claim is untested in a browser by a person.

Two rulings are waiting on you: **the thin-gap threshold** (27% of Doggett) and
**which of the ten swallowed errors to fix before 1 October** — my order would
be 1, 2, 3.

```
$ git status -sb
## main...origin/main
 M .gitignore
 M AGENTS.md
 M app/(app)/advisor/page.tsx
 M app/(app)/today/page.tsx
 M components/advisor/PitchButton.tsx
 M components/advisor/PitchDialog.tsx
 M components/advisor/ServiceList.tsx
 M components/daily/DailyFlow.tsx
 M lib/daily.ts
 M lib/day-stamp.ts
 M lib/gamification/completeDay.ts
 M lib/library-actions.ts
 M lib/lms.ts
 M lib/navigation.ts
 M package.json
 M scripts/brakes-acceptance.ts
 M scripts/check-admin-nav.ts
 M scripts/day-ticket-scenarios.ts
?? PHASE_3_PLAN.md
?? TWO_LADDERS.md
?? app/(app)/service/
?? components/advisor/FocusFamilyCard.tsx
?? components/advisor/ServiceShelf.tsx
?? components/daily/RooftopNotReady.tsx
?? data/File.png
?? lib/entitlement.ts
?? lib/gamification/dayGate.ts
?? lib/loop-preview.ts
?? lib/loop.ts
?? lib/pg-composite.ts
?? lib/service-family.ts
?? reports/phase-3a-ground-truth.md
?? reports/phase-3b-screens/
?? reports/phase-3b-the-loop.md
?? reports/phase-3c-one-resolved-family.md
?? reports/phase-3c-screens/
?? reports/phase-3d-apply-0123.md
?? reports/phase-3d-apply-0124.md
?? reports/phase-3d-apply-0125.md
?? reports/phase-3d-preflight-part-two.md
?? reports/phase-3d-preflight.md
?? scripts/check-0124-production.ts
?? scripts/family-acceptance.ts
?? scripts/focus-family-acceptance.ts
?? scripts/loop-acceptance.ts
?? scripts/loop-screenshot-fixture.ts
?? scripts/tsconfig.chk.json
?? scripts/tsconfig.family.json
?? scripts/tsconfig.focusfamily.json
?? scripts/tsconfig.loop.json
?? scripts/tsconfig.shotfixture.json
?? supabase/migrations/0123_two_ladders_spine.sql
?? supabase/migrations/0124_two_ladders_loop.sql
?? supabase/migrations/0125_one_resolved_family.sql
```

No ahead count. Nothing committed. `backups/` is gitignored.
