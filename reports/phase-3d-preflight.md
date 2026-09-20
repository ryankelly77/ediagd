# Phase 3d — Pre-flight

*19 September 2026. Twelve days to Doggett. Nothing new was built in this phase.
0123, 0124 and 0125 are still unapplied. Read-only work is complete; the
migration checks and the production walk (rulings 1 and 2) wait on Ryan.*

---

## STOP — read this before applying anything

Two things found in pre-flight change what 1 October looks like, and both are
about **who can actually use the app**, not about whether the code works.

### 1. Ten of eleven rooftops cannot read any content

`rooftop_product` in production:

| Rooftop | Products |
|---|---|
| Doggett Chrysler Dodge Jeep Ram | `advisor_base`, `joe_the_pro`, `manager_meetings` |
| Doggett Ford South Loop | **(none)** |
| Doggett Honda Med Center | **(none)** |
| Volkswagen of Beaumont | **(none)** |
| BMW Of Beaumont | **(none)** |
| Doggett Ford | **(none)** |
| Doggett Honda of Beaumont | **(none)** |
| Doggett Toyota of Beaumont | **(none)** |
| Mercedes Benz of Beaumont | **(none)** |
| Doggett Nissan of Beaumont | **(none)** |
| Doggett Ford of Beaumont | **(none)** |

`content_entitled_read` (0010) requires `rooftop_has_product(...)`, and
`rooftop_has_product` requires an actual row with status `active` or `trialing`.
**No row means no content — not a smaller library, none.** No mindset film, no
pitch, no item, no quote.

And because `evaluateDayGate` **fails closed** on a morning with nothing offered
(3b, deliberately — an empty screen must not pay out a streak), an advisor at
those ten rooftops **cannot complete a day at all**. No error, no explanation.

This is not caused by 3a–3c and it is not fixed by them. It predates all three.

### 2. There are four advisor accounts

| | Count |
|---|---|
| Rooftops | 11 |
| **Active advisor app accounts** | **4** |
| Distinct DMS operators with history | 201 |
| Operators with rows in the latest period | 59 |

Active memberships across the whole platform: 4 advisor, 3 manager, 2 admin,
1 technician. One of the four advisors is called *Demo Advisor*.

So "eleven rooftops of advisors open the app on a Tuesday morning" is, as
provisioned today, **three real people at one rooftop plus one advisor at a
rooftop that cannot read anything**.

> Both of these are provisioning, not code. Neither blocks applying the
> migrations — the loop will work correctly for whoever is provisioned. They
> block *launch* meaning what it sounds like it means.

---

## Ruling 3 — the morning each advisor gets on 1 October

Computed by running `derive_focus_family()`'s exact logic in JS against live
production, because the migrations are not applied yet. The store average is
recomputed from the same inputs under the same rules (mean attach rate over
advisors at or above the 20-RO floor, departed advisors excluded).

| Advisor | Rooftop | Op id | Morning | Why |
|---|---|---|---|---|
| Ryan Kelly | Doggett CDJR | 35122 | **normal** | Filters, 8 of 8 films unwatched |
| Demo Advisor | Doggett CDJR | 400025 | **normal** | Belts & Cooling, 12 of 12 unwatched |
| Mitch Hardt | Doggett CDJR | 671 | **normal** | Filters, 8 of 8 unwatched — *but see ruling 4* |
| Tracie Mendoza | Doggett Honda Med Center | 626 | **empty** | no attach rows in the latest period **and** the rooftop has no product |

**Counts per case:**

| Case | Advisors |
|---|---|
| Normal (mindset + pitch + item) | **3** |
| Two-slot — no DMS operator id | 0 |
| Two-slot — history but none in the latest period | **1** |
| Two-slot — nothing ranked or filmed | 0 |
| **Cannot complete at all — no entitlement** | **1** *(the same advisor)* |

**Depth of the shelves that were picked:** Filters 8 films, Belts & Cooling 12.
Neither is the two-deep case, so **no advisor exhausts a cycle in their first
week** — the supply-shaped rollover will not fire at Doggett before roughly
mid-October for Ryan and Mitch, and later for the Demo account.

**Track entry:** `advisor_track_entry` does not exist in production yet, so on
1 October **every advisor is entering their first track**. No certification has
an entry film, so **all 4 render as ordinary mornings** and the entry is
recorded silently. That is ruling 2 of 3b behaving as designed, and it means the
track-entry screen will not be seen by anyone at launch.

### The derived picks, with the numbers behind them

So you can sanity-check them against what a human would say:

```
Ryan Kelly    Filters          missed 7 ROs   $151    attach 14.3% vs store 35.4%
              Brake Service    missed 2 ROs   $230                    (runner-up)
              Differential     missed 1 RO    $259                    (runner-up)

Mitch Hardt   Filters          missed 1 RO    $93     attach 25.0% vs store 35.4%

Demo Advisor  Belts & Cooling  missed 0 ROs   $94     attach  4.3% vs store  5.0%
```

> **Two of these three picks are noise, and that is the finding.** Ryan's is
> defensible — 7 missed ROs on a 21-point gap. Mitch's is one missed RO. The
> Demo account's rounds to **zero** missed ROs and is picked only because the
> tie-break fell that way. Ranking by missed volume is right; ranking by missed
> volume *without a volume floor underneath it* is what produces this.

---

## Ruling 4 — the no-history advisor, corrected

**Your correction holds, and it is narrower still than stated.** All 11 rooftops
carry `advisor_family_attach` history, and all four advisor accounts have
history against their operator id. The launch cohort is not the empty case.

**But the floor is the real dividing line, and it is not where I put it.**
Checking *every* operator in the latest period per rooftop, not just those over
the floor:

| | Operators |
|---|---|
| With attach rows in the latest period | **59** |
| At or above the 20-RO floor | **34** |
| **Below the floor** | **25** |
| No totals row at all | 0 |

**25 of 59 — 42% — are below the floor**, and among them is **Mitch Hardt at
12 ROs**, one of the four app accounts.

### What the loop does for them today, unchanged

Not null. **Worse than null:** it gives them a confident answer.

- `eddiesPick()` (lib/advisor.ts) returns **null** below 20 ROs — `canCoach` is
  false and the old hero card did not render. That was the product saying "not
  enough volume to coach on".
- **`derive_focus_family()` has no such floor.** It requires only
  `a.advisor_ros > 0`. So a 12-RO advisor is ranked against a benchmark built
  from advisors with real volume, gets a focus family, gets a pitch film every
  morning, and gets a progress card — all off one missed RO.

The two disagree, and I introduced the disagreement in 0123. Under the old
product Mitch saw no pick; under the new one he gets a locked assignment.

> **This is a decision for you, and I have not taken it.** The fix is one
> predicate in `derive_focus_family` — join `advisor_period_total_src` and
> require `total_ros >= min_ros_for_coaching()`. I have deliberately **not**
> made it, because 0124 is validated as it stands and about to be applied, and
> changing it now means re-validating the whole chain. Say the word either way.
>
> If it goes in: Mitch gets two-slot mornings until his volume rises, which is
> what the old product did. If it does not: he gets a family chosen from noise,
> and so will the November hires whose first month is thin.

**The November hire** — the case that does not go away — behaves exactly like a
below-floor advisor: history exists, volume does not. Which means the answer to
"what happens to a new hire" is already decided by the floor question above.

---

## Ruling 1 — the three checks, and how I know each would go red

### After 0123

```sql
-- as the SERVICE ROLE, over PostgREST
select count(*) from family_store_benchmark;
```

**Must return > 0.**

*How I know it would have gone red:* **it is red right now.** Measured against
production this morning, service role, pre-migration:

```
GET /rest/v1/family_store_benchmark   status 200,  rows returned: 0
```

Zero rows and a 200 — the exact silent shape. `has_performance_surface()` keys
on `auth.uid()`, which the service role does not have, so 0096's technician gate
also excludes the backend. Every server-side read of the store benchmark returns
nothing today. 0123 §0 adds `bypasses_rls() or …`.

### After 0124

**A real advisor's morning serves three slots, mindset first.** Run as Ryan
Kelly's own user through `assembleMorning`, asserting `kind === "normal"`,
`mindset !== null`, `pitch.family === "Filters"`, `item !== null`.

*How I know it would go red:* `advisor_focus_family`, `advisor_pool_seen` and
`advance_focus_family` **do not exist in production** — confirmed by probe, all
return PGRST205 "could not find the table". Before 0124 there is no three-slot
morning to serve; `/today` renders the five-step loop with the mindset film
fourth.

### After 0125

**Belts & Cooling lists twelve films and the Video tab no longer says "Soon".**

*How I know it would go red:* `service_family_content` does not exist in
production (PGRST205), and the count the dialog would show comes from
`listCuesForServices`, which reads `content.service_family` only — and **no
published film carries one**. The tab is hard-coded to badge "Soon" until
`films.total > 0`, and pre-0125 that value is 0 for every family. Measured:
52 films reachable by op code, **0** visible to the advisor's screens.

> **All three are currently red and I can demonstrate it.** I have not applied
> anything. Say go per migration and I will run each check and report.

---

## Ruling 2 — the production walk *(pending)*

Blocked on the migrations. When 0123–0125 are applied I will walk **Ryan Kelly**
(op 35122, Doggett CDJR, Filters, 8 films) on production and report:

- the family the derivation actually picked and the missed volume behind it,
  against the JS prediction above — if they disagree, the prediction is wrong
  and that is the finding
- **the cycle rolling over**: forced by completing all 8 Filters films, showing
  the assignment ending and the next family deriving, with both sides
- the card at partial (say 3 of 8) and at fully-watched (8 of 8, "tomorrow's
  loop moves you on")
- watch-ahead on `/service/Filters`, then the loop the next morning skipping it

Nothing has ever watched a real cycle end. That is the part I most want to see.

---

## Ruling 5 — the queue, against 1 October

| Item | Verdict | Reasoning |
|---|---|---|
| **In-app account deletion** (5.1.1(v)) | **BLOCKS 1 OCTOBER — if you ship the iOS build** | **No delete-account route exists anywhere in the app.** Guideline 5.1.1(v) requires in-app account deletion for any app offering account creation; review rejects on it routinely. If 1 October is web-only this drops to "after launch". If the native shell ships, this stops the release and nothing else on this list does. |
| **EV & Hybrid missing from `SERVICE_FAMILIES`** | Should be true by 1 October | It is in *neither* `COACHABLE_FAMILIES` nor `COACHABLE_PENDING_CONTENT`, so `isCoachable()` returns false and the family is filtered out of `buildServiceFamilies` entirely — **71 published cues invisible** on the service list and it can never be Eddie's Pick. It does *not* affect the loop: the family has 0 films, so `derive_focus_family` excludes it anyway. One line, no migration. |
| **`test:brakes` failing** | Should be true by 1 October | It fails on three assertions — `cue_match === "op_code"`, `pitch_video_skipped === true`, "still serves the generic passage" — and **3b retired all three**. It is now asserting a product that no longer exists. Not a regression; a stale suite that needs rewriting or retiring. Leaving it red trains everyone to ignore a red suite, which is the expensive part. |
| **`item_count` entitlement-awareness** | After launch | `recompute_certification_content` counts all published content regardless of rooftop entitlement. It **fails safe**: the accrual check is equally blind, so an advisor whose rooftop lacks content can never *complete* the family — the certification becomes unreachable rather than falsely granted. And with ten rooftops holding no products at all, this is dwarfed by the provisioning gap above. |
| **Lead-capture screen behind the sign-in wall** | After launch | A prospect-facing screen only reachable by people who already have accounts. Costs marketing reach, costs no advisor anything on 1 October. |
| **Badge parity audit** | After launch | Checked: catalog 11 badges, **0 orphans in either direction** — no awarded key missing from the catalog, no catalog key that cannot be awarded. The six never-awarded keys are `swell_30/90/365`, `big_wave`, `fifty_sunrises`, `full_horizon` — all streak milestones nobody has reached yet. There is no parity defect visible in the data. |
| **Admin dropdown sweep** | After launch | Admin-only surface. No advisor touches it on 1 October. |

---

## Ruling 6 — the three things most likely to fail silently on 1 October

A prediction, made before launch.

### 1. Missing entitlement reads as an empty library

**What an advisor sees:** a morning that renders, with "Coming soon" where the
film should be, and a Continue that never completes the day. **What nobody
sees:** an error. `content_entitled_read` returning nothing is
indistinguishable from a library with nothing in it, and every pool in
`lib/loop.ts` degrades politely to null by design.

**Ten of eleven rooftops are in this state today.** It is already true; the only
reason it has not been noticed is that only one rooftop has advisor accounts.

**What surfaces it:** a per-rooftop count of *advisors who can read at least one
published content row, as themselves*. Not a product-row count — the read
itself, through an advisor's client. Run before launch and on a schedule. Zero
for a rooftop with active advisors is the alarm.

### 2. A focus family derived from too little volume

**What an advisor sees:** "Filters · 0 of 8 films · Continue", a progress bar,
and a film every morning — all chosen from one missed RO. Completely plausible.
**What nobody sees:** that `eddiesPick` would have refused to render anything
for the same advisor.

**42% of measured operators are below the floor**, including one of the four app
accounts.

**What surfaces it:** record the advisor's `total_ros` alongside
`missed_ros` on `advisor_focus_family` and alert when an assignment is derived
below `min_ros_for_coaching()`. Cheaper still: add the floor, and watch the
count of derived assignments drop by the number of advisors it was quietly
serving noise to.

### 3. The DMS operator link

**What an advisor sees:** somebody else's morning, or none. `membership.op_code_id`
is the *only* bridge from an app account to a book — `dms_advisor.linked_user_id`
is null for every user in production (0081 says so and it is still true). A
typo'd, stale or reassigned operator id produces either a confident morning
derived from another advisor's numbers, or an empty one. **Neither errors.**

Tracie Mendoza is already this shape: op 626 has history, but none in the latest
period, so she resolves to nothing with no indication why.

**What surfaces it:** reconcile every `membership.op_code_id` against
`dms_advisor` for that rooftop *and* against the latest period's rows, before
launch. Two columns: "is this a real operator here" and "did they turn a wrench
last month". An id that fails either is a silent morning waiting to happen.

---

## Verification

Nothing was changed in this phase. Confirming the tree is as 3c left it:

```
accept:family          34 passed, 0 failed
accept:loop            71 passed, 0 failed
accept:focus-family    43 passed, 0 failed
test:certification     70 passed, 0 failed
tsc --noEmit           clean
eslint                 0 errors (9 pre-existing warnings, three unrelated scripts)
npm run build          Compiled successfully
```

`test:brakes` is red — see ruling 5. It was red before this phase and is red for
additional reasons now.

---

## What I need from you

1. **Say go on 0123** (`pg_dump` first). I will run the benchmark check and
   report before we move to 0124.
2. **The floor decision** in ruling 4 — with or without, before 0124 goes in if
   you want it changed.
3. **Is 1 October a native release or web?** It decides whether account deletion
   is a blocker or a backlog item.
4. **Provisioning**: ten rooftops with no products, and four advisor accounts.
   Neither is mine to fix and both decide what launch means.

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
 M scripts/check-admin-nav.ts
 M scripts/day-ticket-scenarios.ts
?? PHASE_3_PLAN.md
?? TWO_LADDERS.md
?? app/(app)/service/
?? components/advisor/FocusFamilyCard.tsx
?? components/advisor/ServiceShelf.tsx
?? data/File.png
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
?? reports/phase-3d-preflight.md
?? scripts/family-acceptance.ts
?? scripts/focus-family-acceptance.ts
?? scripts/loop-acceptance.ts
?? scripts/loop-screenshot-fixture.ts
?? scripts/tsconfig.family.json
?? scripts/tsconfig.focusfamily.json
?? scripts/tsconfig.loop.json
?? scripts/tsconfig.shotfixture.json
?? supabase/migrations/0123_two_ladders_spine.sql
?? supabase/migrations/0124_two_ladders_loop.sql
?? supabase/migrations/0125_one_resolved_family.sql
```

No ahead count. Nothing committed. No file was changed in this phase except this
report.
