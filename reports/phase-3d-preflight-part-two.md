# Phase 3d, part two — The floor, then apply

*20 September 2026. The floor is in 0124 and re-validated. Ruling 2's honest
state is built. `test:brakes` is rewritten. **Nothing has been applied to
production** — 0123 is ready for you and the three checks are prepared.*

---

## Ruling 1 — the floor, and what it costs

One predicate, in `derive_focus_family`:

```sql
and a.advisor_ros >= min_ros_for_coaching()::numeric
```

**`advisor_ros` is already the advisor's period total** — `advisor_family_attach`
selects `t.total_ros as advisor_ros` from `advisor_period_total_src` (0081). So
no extra join was added: a second read of the same number is a second chance to
read it differently. `min_ros_for_coaching()`, never a literal.

### What it changes, across all measured operators

| | Operators |
|---|---|
| With rows in the latest period | **58** |
| Derived a family **before** the floor | **37** |
| Derive a family **after** the floor | **29** |
| **Drop to no assignment** | **8** |

The eight, and what they would have been given:

```
Doggett Ford South Loop      21831     7 ROs -> Differential   on 0.1 missed ROs
Doggett Ford South Loop      901954    9 ROs -> Filters        on 2.4 missed ROs
Doggett Ford South Loop      397      12 ROs -> Filters        on 4.9 missed ROs
Doggett Chrysler Dodge Jeep  671      12 ROs -> Filters        on 2.1 missed ROs
Doggett Ford South Loop      10181    15 ROs -> Filters        on 3.4 missed ROs
Doggett Honda of Beaumont    800020   15 ROs -> Fluids         on 0.9 missed ROs
Mercedes Benz of Beaumont    610039   17 ROs -> HVAC           on 0.9 missed ROs
Doggett Ford South Loop      221      19 ROs -> Filters        on 3.4 missed ROs
```

**The largest missed-RO figure among them is 4.9. The smallest is 0.1.** Every
one is noise, and on screen each was indistinguishable from Ryan's 7-RO pick.

> Note the 25-below-floor figure from part one is not the same as 8: seventeen
> of those operators were not deriving a family anyway, because nothing they
> were weak on had a film. The floor's real effect is **eight**.

### What the four real accounts do

| Advisor | Before the floor | After |
|---|---|---|
| Ryan Kelly (35122, 35 ROs) | normal — Filters, 8 films | **unchanged** |
| Demo Advisor (400025, 23 ROs) | normal — Belts & Cooling, 12 films | **unchanged** |
| **Mitch Hardt (671, 12 ROs)** | normal — Filters on 1 missed RO | **two-slot** |
| Tracie Mendoza (626) | nothing | **unchanged** — see ruling 2 |

**So yes: the floor takes one of the three working advisors down to a two-slot
morning, and it is Mitch.** That is what you asked to know before 0124 goes on.
It is also the correct answer — 12 ROs is below the bar the product has always
used, and the old hero card showed him nothing at all.

Counts on 1 October, post-floor: **2 normal, 1 two-slot, 1 not-provisioned.**

**Validated:** `accept:loop` 77/77, including a below-floor advisor deriving
nothing, and the same advisor deriving a family once their volume is lifted to
the floor — so the assertion is not vacuous.

---

## Ruling 2 — an unentitled advisor is told, not stuck

`lib/entitlement.ts` + `components/daily/RooftopNotReady.tsx`, checked in
`/today` **before anything is assembled**.

It asks `rooftop_has_product(rooftop, 'advisor_base')` — the database's own
predicate, the one RLS uses. Restating the rule here would be a second copy of
an entitlement decision, which is what 0118 refused to do.

- `advisor_base` covers **both** `cue` and `advisor_video`, so one question
  covers the whole ritual; there is no partial state.
- **Fails towards "set up".** A database hiccup must not replace a working
  ritual with a support message; the opposite failure costs an unprovisioned
  advisor one more empty morning they were getting anyway.

The screen says three things: the app is fine and the **account** is not, it is
not your fault, and here is who to tell. It deliberately has **no CTA** — there
is nothing an advisor can press that would help, and a button that does not fix
the problem it appears under is how somebody presses it four times and decides
the app is broken. No paywall language: nobody here declined to buy anything.
No streak language: nothing is at risk, and raising it would invent an anxiety
to reassure.

The same path covers a subscription lapsing later.

**Validated:** asserted both ways — an unprovisioned rooftop reports as such, a
provisioned one does not.

---

## Ruling 3 — the two costings

### (a) Provision a rooftop properly

Per rooftop, the rows that must exist:

| Row | Count | Who supplies it |
|---|---|---|
| `rooftop_product` | **1** — `(rooftop_id, 'advisor_base')`, status defaults to `active` | Ryan. No other input needed. |
| `auth.users` + `app_user` + `membership` | **1 per advisor** | Ryan creates; **Mitch supplies the names** |
| `membership.op_code_id` | 1 per advisor | **Mitch** — must match a live `dms_advisor.advisor_op_id` at that rooftop |
| `work_schedule` | 1 per advisor | **the advisor**, through onboarding |

Everything else is already there. All 11 rooftops have a `perf_period` at
`2026-08-01` and DMS history; `advisor_family_attach` resolves for all of them.

The roster is the scale:

| Rooftop | base | advisors | live roster | operators measured |
|---|---|---|---|---|
| Doggett Chrysler Dodge Jeep Ram | **yes** | 3 | 6 | 4 |
| Doggett Ford South Loop | no | 0 | 19 | 10 |
| Doggett Honda Med Center | no | 1 | 18 | 12 |
| Doggett Ford | no | 0 | 16 | 9 |
| Doggett Ford of Beaumont | no | 0 | 11 | 4 |
| Doggett Honda of Beaumont | no | 0 | 8 | 3 |
| Volkswagen of Beaumont | no | 0 | 7 | 2 |
| Doggett Toyota of Beaumont | no | 0 | 7 | 4 |
| Doggett Nissan of Beaumont | no | 0 | 7 | 3 |
| BMW Of Beaumont | no | 0 | 5 | 4 |
| Mercedes Benz of Beaumont | no | 0 | 5 | 4 |

**109 live roster rows across 11 rooftops.** Full provisioning is **10 product
rows and up to 109 accounts**; the binding cost is not the product rows, it is
Mitch confirming names against operator ids, one per advisor. Of the 109, only
**58** have rows in the latest period, so an account for the other 51 works but
derives nothing until they trade.

*One live defect found while costing:* **1 of the 4 existing advisor accounts
has no `work_schedule`**, which bounces them to `/onboarding` — correct
behaviour, but worth knowing it is there. All 4 operator ids **do** match their
rooftop roster; none is stale.

### (b) Make a rooftop inert

**Zero rows, zero work — as of this phase.** An unprovisioned rooftop is now
inert by default: no `rooftop_product` row means `RooftopNotReady`, and that is
the honest state. Ruling 2 *is* the costing for ruling 3(b).

Which reverses the risk: before today, a rooftop that was half-present was the
default and an advisor there was silently stuck. Now leaving a rooftop alone is
the safe option, and provisioning is the deliberate act. **You can scope the
pilot to one rooftop without doing anything to the other ten.**

---

## Ruling 4 — web for the pilot, and the thing that must not get lost

> ### In-app account deletion is a hard prerequisite for App Store submission.
>
> **Guideline 5.1.1(v) will reject the build without it.** No delete-account
> route exists anywhere in the app today. It is **off** the 1 October list
> because the pilot is web — and it is **on** the late-October submission list
> as a blocker, not a nice-to-have. Discovering this during review in November
> is the expensive version: a rejection costs a review cycle, and review timing
> is not ours to control.

Recorded here so it cannot be lost between phases.

---

## Ruling 5 — `test:brakes` rewritten, not retired

It was red for a good reason: **3b retired all three things its last section
asserted** — the four-rung cue ladder, `pitch_video_skipped`, and the generic
passage — and 0124 retired the six-stage block its middle section asserted.

Retiring the whole suite would have thrown away the parts that still hold, so it
is rewritten:

- **Kept:** Eddie's Pick at family grain — 4% against a 22% benchmark picks
  Brake Service, an 18-point gap, tier `low`, and no pick under the floor.
- **Removed, with the reason written into the header:** the block's six stages,
  the cue ladder's rungs, the skip flag, the generic passage.
- **New:** the SQL floor and the TypeScript floor are asserted to be the same
  number, so a later ruling on it has to move `min_ros_for_coaching()` and both
  follow. This is the bug this phase found, now guarded.
- **Re-pointed:** section 3 tests the op-code bridge through
  `service_family_content` — the resolution that replaced the ladder — and
  asserts it reaches a real playable Brake Service film.

**It is currently 8 passed, 5 failed against production, and that is correct:**
`service_family_content` does not exist until 0125. It goes green when 0125
lands, which makes it a fourth post-migration check.

> **One thing it did wrong, which I fixed:** the first version read a missing
> relation as *"0 mappings"* — supabase-js puts the error in a separate field
> and `?? []` swallowed it. The suite meant to catch confident-wrong-answers
> committed one. It now names `PGRST205` and says 0125 is probably not applied.

A second instance of the same shape, in `accept:family`: a non-vacuity revert
silently failed a `CHECK` constraint (`retired_at` before `effective_from`,
because `rooftop_today` in Chicago and the server's `current_date` had diverged
over midnight), the revert did nothing, and the check reported *"it passed
anyway"*. Now it reads `effective_from` and retires the day after. **Both were
errors sitting in a field nobody looked at.**

---

## Ruling 6 — ready to apply. The before state, captured

### The three checks, all proven able to fail

| After | Check | **Before state, measured on production** |
|---|---|---|
| **0123** | `select count(*) from family_store_benchmark` as the service role returns rows | **`status 200, rows: 0`** — a 200 with nothing in it, the exact silent shape |
| **0124** | A real advisor's morning serves three slots, mindset first | `advisor_focus_family`, `advisor_pool_seen`, `advance_focus_family` all **PGRST205 — relation does not exist** |
| **0125** | Belts & Cooling lists twelve films, Video tab no longer "Soon" | `service_family_content` **PGRST205**; 52 films reachable by op code, **0** visible to any member screen |

Plus `test:brakes` against production: **8 passed, 5 failed**, failing precisely
on `service_family_content` being absent.

### The sequence, on your go

```
pg_dump → 0123 → check → pg_dump → 0124 → check → pg_dump → 0125 → check
```

**0123 is unchanged since you said go.** 0124 now carries the floor and has been
re-validated end to end. 0125 is unchanged.

### After they land, the production walk

- **Ryan Kelly's morning** — three slots, mindset first, Filters.
- **The derived family with its missed volume**, against the prediction above
  (Filters, 7 missed ROs, attach 14.3% vs store 35.4%). If the live derivation
  disagrees with that, the prediction was wrong and **that** is the finding.
- **The cycle rolling over** — forced by completing all 8 Filters films, showing
  the assignment ending and the next family deriving, both sides.
- **Belts & Cooling on `/service`** — twelve films listed.
- **Watch-ahead, then the loop** — on the real row.
- **Track entry confirmed as not firing** — all four advisors should render
  ordinary mornings. I will check it *happens*, not assume it: a half-rendered
  entry morning is worse than one that never fires.

---

## Verification

```
accept:loop            77 passed, 0 failed    (+2 entitlement, +3 floor)
accept:family          34 passed, 0 failed
accept:focus-family    43 passed, 0 failed
test:certification     70 passed, 0 failed
test:streak           112 passed, 0 failed
test:watch             67 passed, 0 failed
test:day-ticket        35 passed, 0 failed
check:nav              every watched route reachable
tsc --noEmit           clean
eslint                 0 errors (9 pre-existing warnings, three unrelated scripts)
npm run build          Compiled successfully
test:brakes (prod)     8 passed, 5 failed — expected until 0125; see ruling 5
```

Full local replay `0001 → 0125` clean, four times across this phase.

---

## Waiting on you

**Say go on 0123** (`pg_dump` first) and I will run the benchmark check and
report before we move to 0124.

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
?? reports/phase-3d-preflight-part-two.md
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

No ahead count. Nothing committed.
