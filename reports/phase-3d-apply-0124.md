# 0124 — applied to production, without the UPDATE

*19 September 2026, 20:55 CT. `0124_two_ladders_loop.sql` is on production, amended
to leave the coaching blocks alone. 0125 is **not** applied. Stopping for your read.*

---

## The check did not pass, and the reason is the finding

**"A real advisor's morning serves three slots, mindset first."**

| Slot | Ryan Kelly | Demo Advisor | Mitch Hardt |
|---|---|---|---|
| 1 mindset | ✅ *Confidence* | ✅ *Four Things You Can't Get Back* | ✅ *A Tree Grows in Two Directions* |
| 2 pitch | ❌ **absent** | ❌ **absent** | — *(no assignment: the floor)* |
| 3 item | ✅ Walk Around 28/56 | ✅ Walk Around 1/56 | ✅ Walk Around 1/56 |
| morning kind | `two_slot` | `two_slot` | `two_slot` |

**Mindset is first and the item serves. The pitch slot is empty for everyone** —
including the two advisors who *do* have a derived assignment with a stocked shelf.

### Why

```
service_family_content  ->  PGRST205, does not exist      (0125, not applied)
family_pitch_supply     ->  [{"family":"Filters","film_count":8}]   (0123, fine)
advance_focus_family    ->  HTTP 200                                (0124, fine)
```

The derivation is correct and the shelf is there. What cannot happen is *reading
the films*: 3c rewired `pickPitch` onto `loadFamilyContent`, which reads
`service_family_content` — a 0125 relation.

**So the three-slot check was never a check on 0124 alone. It is a check on the
pair.** The database migrations split cleanly into three; **the code does not.**
The deployable unit needs all three on before it can serve a pitch.

### And it fails silently — ninth instance, in my own code

`loadFamilyContent` does this:

```ts
const { data, error } = await client.from("service_family_content")…
if (error || !data) break;
…
if (mapping.length === 0) return {};
```

A missing relation, an RLS refusal and a network failure are **indistinguishable
from "this family has no films"**. Nothing threw. Nothing logged. Every advisor
quietly got a two-slot morning, and the only reason I know why is that I went
looking.

This is exactly the pattern from part three's Ruling 2 sweep — observed live
rather than predicted, in code I wrote while fixing that pattern elsewhere. It
is on the findings list for the 0125 report; I am not changing application code
mid-sequence.

> **Consequence for the deploy, and it is the important line in this report:**
> **do not deploy the 3b/3c code until 0125 is applied.** If it went out now,
> all four advisors would get a two-slot morning, no error anywhere, and the
> pitch slot — the centre of the phase — would simply never fire.

---

## What 0124 changed for the currently-deployed code: nothing

Verified rather than assumed. `coaching_block` after the push:

| Family | started | ended | updated |
|---|---|---|---|
| Differential | 2026-08-31 | 2026-09-11 | `…09-12T01:25:30.298Z` |
| **Filters** | 2026-09-02 | **null** | `…09-02T15:33:13.038Z` |
| **Belts & Cooling** | 2026-09-11 | **null** | `…09-12T01:25:30.417Z` |

Byte-identical to the before state — same `ended_on`, same `updated_at`. **No
row was touched.**

Everything else in 0124 is additive (new columns on `daily_completion`, new
tables, new functions) or replaces a function the deployed code never calls. So:

> **The stale-page refusal does not occur.** I flagged it as the one
> user-visible artifact of this push — that was true *of the version with the
> UPDATE*. Dropping the statement removed it. There is no user-visible artifact
> at all. Ryan has nothing to recognise.

**No `coaching_block` data dump was taken**, since nothing writes those rows.
Schema dump only: `backups/pre-0124-schema.sql` (494 KB), verified to contain
0123's `advisor_focus_family` (32 references) and none of 0124's
`advisor_pool_seen` (0) before the push.

---

## The amended header

0124 §2 now reads, in part:

> **THIS MIGRATION DOES NOT CLOSE THE OPEN BLOCKS, AND THAT IS DELIBERATE.**
> An earlier draft ended every open block here […] The justification written
> next to it was that completeDay asserts the day's stamp and the open block
> agree […] **That justification was false by the time it was written.** The
> assertion it cited — and the `readOpenBlock()` call behind it — were removed
> from completeDay in the same phase. […] Correct SQL, for a reason that had
> stopped being true. Caught only by being asked to say what actually breaks.
>
> […] **Asymmetry decided it.** Not closing them is reversible […] Closing them
> is not cleanly reversible […]
>
> **If you are reading this because you noticed the blocks are still open: that
> is F1, it is known, and it is not a gap in this migration.**

The header's numbered list was amended to match, so item 2 no longer claims the
blocks are closed.

---

## The four accounts, checked individually

Run against production with the real `assembleMorning`.

**Nobody is left in a day they cannot close.** Every advisor's gate evaluates
`complete: true` with the offered slots met:

```
Ryan Kelly      legs: mindset* pitch- item* track_film-    FINISHABLE: yes
Demo Advisor    legs: mindset* pitch- item* track_film-    FINISHABLE: yes
Mitch Hardt     legs: mindset* pitch- item* track_film-    FINISHABLE: yes
Tracie Mendoza  rooftop not provisioned -> RooftopNotReady, no morning assembled
```

- **Mitch's morning is two-slot and finishable.** `assignment none` — the floor
  did exactly what it was put in for. (He would be two-slot today regardless,
  because of the 0125 gap above; the floor is why he has no *assignment*.)
- **Tracie sees the honest state**, not a stall — `rooftopIsProvisioned` returns
  false for Doggett Honda Med Center and `/today` renders `RooftopNotReady`
  before assembling anything. *(Code not yet deployed; this is the function
  answering correctly against production data.)*

### The derivation, against the prediction

| | Predicted (part one, in JS) | Actual (production) |
|---|---|---|
| Ryan Kelly | Filters, **7** missed ROs, $151 | **Filters**, missed **7.39**, **$151.39**, shelf 8 |
| Demo Advisor | Belts & Cooling, ~0 missed ROs | **Belts & Cooling**, missed **0.16**, $93.50, shelf 12 |
| Mitch Hardt | none — below the floor | **none** |

The prediction held. Worth noting the Demo account's **0.16 missed ROs** — it is
above the 20-RO floor (23 ROs) so the floor does not catch it; it ranks first
only because nothing else ranks at all. That is the demo problem from Ruling 4
of part three, now visible in a real row.

### Track entry

```
core certifications: 8,  with an entry film: 0
advisor_track_entry rows: 0
```

All three provisioned advisors show `track film (none — Walk Around, entering)`
and `morning kind` is **not** `track_entry`. **Confirmed happening, not
assumed:** entry mornings do not half-render — the branch is simply not taken,
and every advisor gets an ordinary morning while the track starts anyway.

---

## Ruling 1 — F1 is recorded

`PHASE_3_PLAN.md` now carries a **Numbered follow-ups** section:

> ### F1 — Close the two vestigial coaching blocks, and the screen that counts them
> **Trigger:** after the 3b/3c code is deployed. **Owner:** Ryan.
> […] 1. a tidy-up migration setting `ended_on` on both.
> 2. **`/admin/mapping/families/confirm` reads them** […] After 3b that warning
> is false in both directions […] **The screen has to move to
> `advisor_focus_family` or lose the warning — closing the blocks without
> touching it leaves a warning that always reads zero**, which is worse than the
> wrong number it shows today.
> **Do not do (1) without (2).**

That second half was not in the brief and is the part that matters: closing the
blocks *alone* converts a wrong number into a permanently silent one.

---

## Verification

Full local replay `0001 → 0125` clean with the amended 0124.

```
accept:loop            77 passed, 0 failed
accept:family          34 passed, 0 failed
accept:focus-family    43 passed, 0 failed
test:certification     70 passed, 0 failed
test:streak           112 passed, 0 failed
test:watch             67 passed, 0 failed
test:day-ticket        35 passed, 0 failed
test:rest-day          22 passed, 0 failed
tsc --noEmit           clean
eslint                 0 errors (9 pre-existing warnings)
npm run build          Compiled successfully
```

Production migration state: `0123 → 0123`, `0124 → 0124`, `0125 → ""`.

---

## Next

**0125 on your go.** It is the one that makes the pitch slot fire, and its own
check (`/service` listing twelve Belts & Cooling films, the Video tab losing
"Soon", `test:brakes` going green on `service_family_content`) is also what
turns the three-slot check above from two-of-three into three-of-three. I will
re-run this same production check after it lands and report both.

The swallowed-error sweep from part three's Ruling 2 comes with that report, now
with one live instance in it.

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
