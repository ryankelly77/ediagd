# Phase 3f — the stale streak

*Sunday 20 September 2026. Branch `stale-streak`, PR open, **not merged.**
The display no longer reads a write-time number. Ruling 3's answer is not the
one expected — §2. The precedence is written in and proved a no-op — §4.*

---

## 1. The assertion, failing against the old code

Ryan asked for one assertion that would have caught this. Here it is run against
what the display did before — `Number(swellRow?.current_len ?? 0)`, and the rest
card's `streak + 1`:

```
A Swell read before the day completes  — AGAINST THE OLD CODE
    ✗ a Swell broken by three missed work days reads 0, not 7   expected 0, got 7
    ✗   and it knows it is gone                                 expected false, got true
    ✗   and the next rep is honestly Day 1                      expected 1, got 8

  0 passed, 3 failed

What the old code put on screen for this row:
  "Day 7 holds today. Three minutes on Monday makes it Day 8."
  "Your streak is safe"
  header badge: 7
```

The fixture **is Ryan's real row** on the day the bug was found: `current_len 7`,
`last_completed_on 2026-09-15`, Wed/Thu/Fri missed, one paddle-out against a
three-day gap.

`test:streak` is now **127 passed, 0 failed** — fifteen new assertions, all of
which read the number *before* any day completes. That is the whole point:

> The 112 assertions that existed could not see this, because **every one of
> them calls `applyDailyCompletion` first and then asserts on what comes back —
> which is the operation that makes `current_len` true again.** The test
> performed the repair before it looked.

The new ones also pin the cases a careless fix would break:

| Assertion | Guards against |
|---|---|
| an unbroken Swell still reads 7 over the weekend | a "fix" that just returns 0 |
| a Swell grace would bridge still reads alive | under-reporting — see Mitch, §3 |
| the written record is not mutated | a projection that repairs as a side effect |
| a Swell that never started is not 'alive' | `alive:true` alongside `current:0` |

That last one **failed first, and the code was wrong, not the test** —
`firstEver` is not a reset, so `alive` was true for somebody with no streak at
all. `alive` now requires `currentLen > 0`.

---

## 2. Ruling 3 — the notification already verifies. And there is no 7pm push.

**Answer: it does not promise what it has not checked, and it has not for some
time.** Two corrections to the premise, both in the product's favour.

**There is no 7pm notification.** It was moved, by Ryan, to **noon** — the
comment records why: *"end of day right before signing off seems too late to me.
If the advisor didn't have a chance in the morning, then we remind them at
lunch."* A second, `streak_last_call`, fires at 16:50.

**Neither says "don't lose your streak."** `push-copy.ts` rule 4 forbids it
outright — *"THE STREAK KEEPER IS AN INVITATION, NEVER A WARNING… 'One session
keeps it going' — never 'don't lose your streak'."*

```
streak_keeper     "Keep your Swell going!"  /  "It's just 3 minutes. Now is a good moment."
                  -> names no number at all

streak_last_call  "Don't forget your 3 minutes at EDIAGD!"
                  "Keep that Swell going to {days_next} days!"
                  -> names a number
```

`{days_next}` is a claim. But the gate behind it is real — `0112`, line 195:

```sql
and s.current_len >= 2
and s.last_completed_on is not null
and s.last_completed_on = previous_scheduled_day(m.user_id, _l_date)
```

**It requires the last completion to be on the immediately previous scheduled
work day**, so a lapsed advisor matches nothing and receives nothing. The stale
number cannot reach a push.

### And this is the sharpest part of the whole finding

`previous_scheduled_day()` exists *for this exact reason*. 0102's own comment:

> *"`swell.current_len` is only recomputed when somebody COMPLETES a day, so an
> advisor who ran a 3-day streak and then missed a work day still reads
> `current_len = 3` until their next completion. **Sending them 'Day 3 is on the
> line' would be a lie about a streak that is already gone.**"*

**The bug was known, written down, and correctly defended against — in the
notification layer only.** The screens went on reading the raw number for
another twenty-four migrations. Nobody re-asked the question one layer over.

**No change needed to notifications.** I have not touched them.

---

## 3. Ruling 2 — computed at read time, from the function that already knows

`swellAsOf(state, onDate, settings, context)` in `lib/gamification/streak.ts`.

**It adds no second definition.** It runs `applyDailyCompletion` — the same
function `completeDay` writes with — against a **copy**, and keeps the verdict:

```ts
const { next, outcome } = applyDailyCompletion({ ...state }, onDate, settings, context);
if (outcome.noop) …            // already completed: the written number is true
const alive = !outcome.streakReset && state.currentLen > 0;
return { current: alive ? state.currentLen : 0, nextIfCompleted: next.currentLen, … };
```

The answer cannot drift from the engine, because it **is** the engine. Nothing
writes; the caller's state is not mutated (asserted).

### It is not expensive, and here is why rather than a claim

| Surface | Extra cost |
|---|---|
| `/today` | **none** — `scheduleContext` is already loaded for the rest card |
| app layout (the badge) | **none** — already calls `loadScheduleContext` for `restDayFor` |
| `/streak` | one `loadScheduleContext`, on a screen somebody opened deliberately |

The two highest-traffic surfaces already had the data sitting next to the wrong
answer.

### What changed on screen

Also gated: **`"Your streak is safe"` was unconditional.** It now renders only
when there is a live Swell. Nothing replaces it — a rest day with no live streak
has nothing reassuring to say that is also true. The promise line was already
`{streak > 0 && …}`, so a dead streak makes it vanish with no new copy invented.

### Against live production data, read-only

| Advisor | Last completed | OLD showed | NOW shows | |
|---|---|---|---|---|
| Ryan Kelly | 2026-09-20 | 1 | **1** | completed today |
| **Demo Advisor** | 2026-09-02 | **1**, *"makes it Day 2"*, *"streak is safe"* | **0**, no promise, no reassurance | **11 work days missed — every word was false** |
| Tracie Mendoza | never | 0 | 0 | unchanged |
| **Mitch Hardt** | 2026-09-16 | 6 | **6** | **alive only because grace bridges a 1-day gap** |

**Mitch is the row that matters.** A naive liveness check — "was the last
completion on the previous scheduled day", which is what the notification uses —
would have shown him **0**. His Swell is alive; a paddle-out covers the gap.
`previous_scheduled_day()` is *deliberately* not grace-aware because silence is
the right answer for a push; **under-reporting is not the right answer for a
screen.** Going through `applyDailyCompletion` gets this right for free, and
there is an assertion pinning it.

---

## 4. Ruling 5 — `0126_family_precedence.sql`, and the 714/714 comment

The precedence is written in: **an explicit `content.service_family` outranks
the `op_code → op_code_family` path.** One line does it —
`and c.service_family is null` on the op-code arm.

The comment carries the evidence, as asked:

> Measured against production on 2026-09-20, across all 2,534 published rows:
>
> ```
> rows carrying BOTH a service_family and an op code that resolves:  714
>   the two AGREE:                                                   714
>   the two DISAGREE:                                                  0
> ```
>
> […] It is written now BECAUSE it is a no-op now. A rule adopted while it is a
> coincidence costs nothing; the same rule adopted after the first disagreement
> is a migration that moves somebody's content while they are looking at it.

**Both readers move together.** `my_certification_progress()` (0117) carried its
own copy of the derivation — an `OR` with `distinct`, UNION semantics by another
spelling. Changing the view and leaving that alone would make the shelf and the
advisor's own progress bar disagree the first time a row disagreed — the exact
failure 0125 existed to end. 0126 redefines it to read the view.
`recompute_certification_content()` needs no edit; it inherits.

### Proved a no-op against production, not just "it applies"

```
0125  UNION, both arms    distinct (family,content): 1607   arm-rows: 2321
0126  explicit wins       distinct (family,content): 1607   arm-rows: 1607

  pairs LOST   : 0   <-- nothing moves family
  pairs GAINED : 0
  duplicate op_code arms removed: 714
```

**Not one piece of content changes family.** The only difference is that 714
redundant second rows stop being returned.

`accept:family` caught the change and went red on *"a row reachable BOTH ways
appears under both vias"* — an assertion that encoded the old UNION. It now
asserts the ruling instead, and says in a comment that it moved deliberately.

---

## 5. What I did not do, and why

- **`lib/admin-advisor-detail.ts:289`** — the same stale read, on
  `/admin/engagement` and `/admin/rooftop/[id]`. **Left alone deliberately.**
  `loadAdvisorDetails(client, userIds, today)` has no rooftop and loads no
  closures, and `countMissedWorkDays` without closures counts a closed store as
  a missed day. That would show a manager a **dead streak for an advisor whose
  streak is alive** — trading an over-report for an under-report. Doing it
  properly means threading closures through a bulk loader, which is a change to
  admin paths and not a hotfix. **It is the one display surface still reading
  raw.**
- **Ruling 4, the Mux signing swallow.** On the list at #2 and not in this
  branch. It needs a behavioural ruling I do not have — throw, log, or degrade —
  and the phase is named for the streak. Flagging, not deciding.
- Items 3–6 of the follow-up list.

---

## 6. Verification

```
test:streak          127 passed, 0 failed   (was 112 — 15 new)
accept:family         34 passed, 0 failed
accept:loop           77 passed, 0 failed
accept:focus-family   43 passed, 0 failed
test:certification    70 passed, 0 failed
test:watch            67 passed, 0 failed
test:day-ticket       35 passed, 0 failed
test:rest-day         22 passed, 0 failed
test:streak-saver     19 passed, 0 failed
test:streak-chip      every chip state is what it should be

supabase db reset --local   0001 → 0126 clean
tsc --noEmit                clean
eslint                      0 errors (9 pre-existing warnings)
next build                  ✓ Compiled successfully in 4.4s
```

**0126 is not applied to production.** `pg_dump` first, Ryan applies, as always.

---

## 7. State

```
branch stale-streak -> main, not merged
  lib/gamification/streak.ts          swellAsOf
  app/(app)/today/page.tsx            the rest card and the milestone line
  app/(app)/layout.tsx                the header chip
  app/(app)/streak/page.tsx           the Swell screen
  components/daily/DailyFlow.tsx      "Your streak is safe", gated
  scripts/streak-scenarios.ts         15 assertions that read before completing
  scripts/family-acceptance.ts        the both-vias assertion, moved with the ruling
  supabase/migrations/0126_family_precedence.sql
```

`.gitignore` (Drop Zone scope) and `data/File.png` remain the deliberate
exclusions on your disk. Nothing on `main`.

**3e next**, on its own branch.
