# Phase 3c — One resolved family, and the card that needs it

*Built 19 September 2026. Migration `0125_one_resolved_family.sql`, written and
validated, **not applied and not committed**. Architecture: `TWO_LADDERS.md`.
Prior phases: `reports/phase-3a-ground-truth.md`, `reports/phase-3b-the-loop.md`.*

---

## The contradiction, measured

Five places in this codebase ask "what belongs to service family F". They gave
five answers. Against production, for **Belts & Cooling**:

| Asked by | Answer | Rule |
|---|---|---|
| `recompute_certification_content()` | **451** | direct **or** op code, `upper(btrim())` |
| `accrueService()` | **451** | same intent, `ilike`, written again in TS |
| `family_pitch_supply` (0123) | **12** | coachable op codes, playable films |
| `pickPitch()` (0124) | **12** | the same rule, written again in TS |
| **`listCuesForServices()`** — the advisor's own screen | **439** | **cues only, `service_family` only** |

The last one is the one an advisor sees, and it is the one that is wrong.

```
family-reachable published live content   1,607   (1,555 cues + 52 films)
visible on the advisor's service list     1,555
hidden                                       52   — every one of them a film
```

**Every hidden row is a film**, and the seven families that have any are exactly
the seven the pitch slot serves from:

| Family | Loop serves | The advisor's own list showed |
|---|---|---|
| Belts & Cooling | 12 films | 439 cues, **0 films** |
| Fluids | 12 films | 294 cues, **0 films** |
| HVAC | 10 films | 85 cues, **0 films** |
| Filters | 8 films | 39 cues, **0 films** |
| Brake Service | 4 films | 122 cues, **0 films** |
| Differential | 4 films | 81 cues, **0 films** |
| Wipers | 2 films | 83 cues, **0 films** |

It was worse than "nothing there". The dialog had a **Video tab badged
"Soon"** and a card reading *"Pitch videos for Belts & Cooling are on the
way. We're filming the walkthroughs now."* — for a family with twelve, on the
same day the loop served the advisor one of them.

That has been true since the films were imported. 3b made it visible by putting
one of those films in front of the advisor every morning.

---

## Half one — one resolved family

`service_family_content` (0125 §1). Both paths, one definition:

```
the row carries the family itself          content.service_family = F
       UNION
the human ruling maps its op code to F     op_code_family, retired_at is null,
                                           upper(btrim()) on both sides
```

**`UNION`, not `UNION ALL`.** 439 of Belts & Cooling's cues carry the family tag
*and* an op code that maps to it. Counting them twice is not hypothetical —
0116 records that exact double count letting a 3-item track clear a 5-item bar.

**It carries no content columns, and that is the security design.** The view has
to be `SECURITY DEFINER`, because it joins `op_code_family`, which 0081 narrowed
to admins — a security-invoker view over it returns **zero rows and no error**
to an advisor, the fault 3b found in `family_pitch_supply`. So the view is a
*mapping*: `(family, content_id, via, coachable)` and nothing else. Callers join
the ids back to `content` **through the viewer's own client**, where
`content_entitled_read` still decides. An unentitled advisor gets ids that
resolve to nothing — asserted both ways in the suite.

### What now reads it

| | Before | After |
|---|---|---|
| `service_family_cue_count` (the coachability gate) | `service_family` only, **no `retired_at` filter** | the view, live rows only |
| `family_pitch_supply` | its own copy of the join | the view + the pitch-specific filters |
| `recompute_certification_content()` | its own copy | the view |
| `pickPitch()` | its own copy | `lib/service-family.ts` |
| the advisor's service list | cues only | films **and** cues |
| the family shelf *(new)* | — | the view |

`lib/service-family.ts` is the one TS reader. `lib/loop.ts` lost its private copy
of the resolution *and* its own stage-ordering array — the loop now asks for a
family's films and gets them in deck order, so **"continue" on the card and
tomorrow's pitch are the same film by construction**, not by two functions being
careful.

### Two corrections to the gate

- **Live:** cues reachable only by op code did not count toward coachability —
  2 Brake Service, 4 Battery, 2 Tires & Rotation, 1 Differential.
- **Waiting:** it had no `retired_at` filter. **Zero published rows are retired
  today**, so nothing was actually miscounted. Stated as a fact rather than
  sold as a fix — a gate that would start lying the first time somebody retires
  a cue is still worth correcting now.

### Two things checked and found not to be problems

- **Normalisation.** All 766 op-coded rows resolve exactly; none needs
  `trim`/`upper`. The normalisation is copied from 0116 as insurance against a
  future import, not as a repair.
- **Coachability.** 13 of 76 codes are non-coachable (eleven `MNU-*` bundles,
  `MPI-061`, `ACC-060`) — and **no published content sits on any of them**. So
  the divergence between the certification rule (counts them) and the pitch rule
  (does not) is real in the schema and empty in the data. Both are kept, with
  their reasons written down.

---

## Half two — the card

Eddie's Pick becomes focus-family progress: **“Belts & Cooling · 1 of 4 films ·
Continue”**, with the attach rate demoted from headline to reason.

**It reads the assignment; it never derives one.** `advance_focus_family()` ends
an exhausted cycle and picks the next family, and that is the *loop's* to call —
a card that moved an advisor onto a new family by being rendered would be a read
with a side effect, fired by a page load, outside the ritual. A finished shelf
therefore shows "you've watched every Belts & Cooling film. Tomorrow's loop moves
you to the next family." The suite asserts the card returns **nothing at all**
before a morning has been assembled, which is how the first draft of the suite
caught itself asking in the wrong order.

**"Continue" lands on a real route** — `/service/[family]` — not a modal. The old
CTA said "Watch the pitch" and opened a dialog of text cues that could only exist
on that one screen.

**The shelf writes the one consumption record.** Completion goes through
`completeLibraryItem` — the *same* server action the lesson library uses, which
re-checks entitlement with the caller's own client, writes `completed_at` and
runs the certification accrual. A film watched ahead here is a film the pitch
slot skips tomorrow, for free. Asserted directly: watch ahead, and the loop's
next film moves on with the card's.

**No equivalent on the craft side**, per the doc.

---

## Three things found while building

### 1. A failed player credited a watch, and that silently hid a film

`TrackedVideo` fires `onGateMet` **"by watching or by failing"**. In the ritual
that is right — a broken player must never cost somebody their streak.

On the shelf it is the opposite. Completion here writes `completed_at`, which is
the cursor the **pitch slot** reads — so crediting a failure quietly removes that
film from the loop and the advisor is *never served it*. Caught by watching the
shelf against a fixture whose Mux ids are fake: **every film ticked itself the
moment its player gave up** (screenshot 02 is that bug; 03 is after the fix).
`ServiceShelf` now ignores an errored gate. Nothing is lost by not crediting —
the screen is voluntary and it is still there tomorrow.

### 2. The "Today's cue" badge had become untrue

The dialog rotated each family's cue list so its head *was* the cue the ritual
named that morning, and badged it "Today's cue". **3b ended that** — the item
slot serves the craft curriculum and draws no family cue at all. So there is no
"today's cue" for Belts & Cooling to agree with. The rotation and the badge are
removed rather than left pointing at a claim the product stopped making.

### 3. `check:nav` would have passed while checking nothing

`/service/[family]` sat outside `WATCHED`, so the checker reported *"every
watched route is reachable"* while saying nothing whatsoever about it — which is
the exact failure its own comment records from when the certifications wall
shipped. `service` is added to the watched trees and the route is registered in
`NAV_EXEMPT` with its reason: it is reached from the card and the dialog, never
from a menu, because an advisor has **one** focus family and a list of twenty
would be a second, competing way in.

---

## Evidence

`npm run accept:family` — **34 assertions, 34 passing**, each proven non-vacuous
by breaking the thing it guards:

- the view resolves both paths and counts a both-ways row **once**
- a film reachable **only** by op code is visible to the advisor *(fails when the
  op-code mapping is retired)*
- the cue gate counts op-code-only cues *(fails when one is unpublished)*
- **the certification catalogue is unchanged** — and matches 0116's original
  predicate row for row, counted directly against `content` with no view involved
- the card and the loop name the **same** next film, and agree on position
- watching ahead on the shelf makes the loop **skip** it *(fails when the
  consumption row is withdrawn)*
- a base-tier advisor resolves **nothing** — and the same advisor resolves three
  films once the product is back

Full replay `0001 → 0125` clean. `accept:loop` 71/71, `accept:focus-family`
43/43, `test:certification` 70/70, `test:streak` 112/112, `test:watch` 67/67,
`test:day-ticket` 35/35. `check:nav` passes with `/service` now watched.
`tsc --noEmit` clean, `eslint` 0 errors (9 pre-existing warnings in three
unrelated scripts), `npm run build` succeeds.

`reports/phase-3c-screens/` — the card, the bug, and the fix. Players show a
network error because the fixture's Mux ids are fake; that is the app being
honest.

---

## One disagreement to name

`PHASE_3_PLAN.md` heads this phase **"The /today card"**. The card it describes
is **Eddie's Pick**, which lives on **`/advisor`** — the numbers screen an
advisor lands on from "See my numbers" at the end of the loop. `TWO_LADDERS.md`
says "an Eddie's Pick card *beside* it", which fits /advisor and not /today;
/today is the immersive ritual and has no card at all.

Built where Eddie's Pick actually is. Flagging rather than picking, per
AGENTS.md — if you meant a second card inside the ritual, that is a different
piece of work and I have not done it.

---

## What is left, and what is yours

**Ryan:**

1. **Apply `0125_one_resolved_family.sql`** (`pg_dump` first). **0123 and 0124
   are still unapplied and 0125 depends on both** — they must go in order.
2. `0125` re-runs `recompute_certification_content()` on apply. Expected to
   change nothing; the suite asserts that, and it is worth an eye on the item
   counts either side in prod.
3. The shelf is a **new member-facing route**. It is entitlement-gated three
   ways (the mapping carries nothing, `content` decides, `completeLibraryItem`
   re-checks) but it is the first new one since the certifications wall.

**Mitch — unchanged:** which track each film opens, track order, the starting
family for an advisor with no DMS history, item budget, captions. Plus the
filming order in the 3b report — **ten coachable families still have no film at
all**, and the shelf now says so per family instead of promising "on the way" to
all of them.

**Out of scope and untouched:** the Good News Story (no schema, no flag, no
column); attaching films to tracks or modules.

---

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
