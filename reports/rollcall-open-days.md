# The Rollcall post goes out on days the store is open

**Ryan, 19 October:** *"roll call slack message should only be sent on weekdays
and honor the location's days off, so you don't send on holidays either."*

---

## What changes

The cron still fires every day at `30 22 * * *`. It now decides whether to post,
on **the store's date**:

1. **Weekend** — Saturday or Sunday at the store → no post.
2. **Confirmed closure** — a `rooftop_closed_day` row with `status = 'confirmed'`
   → no post.
3. Otherwise → post, exactly as before.

Both outcomes write a heartbeat, and a skip returns **200** — the job ran and
correctly declined.

## What Beaumont will actually do

Read from production, 19 October. The store's calendar **is set up and ruled
on**, which matters: this rule can only suppress a post on a closure somebody
has confirmed.

| 19 Oct → 31 Dec 2026 | days |
|---|---|
| Posts | **51** |
| Weekend skips | 20 |
| Holiday skips | **3** |

The three:

| | | |
|---|---|---|
| Wed 11 Nov 2026 | Veterans Day | confirmed |
| Thu 26 Nov 2026 | Thanksgiving | confirmed |
| Fri 25 Dec 2026 | Christmas Day | confirmed |

All three are weekdays that would have posted into a channel nobody was reading.

Beaumont has **14 closure rows from today forward and no unruled proposals** —
seven confirmed closures and seven dismissed ones (MLK, Presidents', Memorial,
Juneteenth, Labor, Columbus and Veterans 2027: the store is open, and somebody
said so). That is the calendar working as designed, and it is why the hole below
does not bite here.

---

## Three decisions worth the argument

### The rule is not in `vercel.json`

`30 22 * * 1-5` would do the weekday half in one character. It is the wrong
place twice over:

- **A cron expression cannot know about Thanksgiving.** Half the rule would live
  in the schedule and half in the route — two sources of truth about when the
  post goes out, which this route's own header already warns against in those
  words.
- **Vercel crons are UTC.** 22:30 UTC lands on the same calendar day as Central,
  so a UTC day-of-week filter is right for Beaumont *by coincidence*.
  `ROLLCALL_ROOFTOP_ID` is a variable: the day it names a store east of
  Greenwich, 22:30 UTC is already tomorrow there and the post goes out on a
  Saturday with nothing erroring.

So the schedule is unchanged and the rule is one pure function, keyed on the
store's date.

### Monday's post covers the weekend, and that took no new code

"What changed since" is keyed on `posted_at` — the last **successful** post —
not on `ran_at`. The skip path carries `posted_at` forward untouched, so the
window simply widens to fill the gap. An advisor who did their five minutes on
Saturday appears in Monday's `new:` list rather than being lost.

That machinery already existed for a failed Slack call. A weekend is the same
shape, and the acceptance suite asserts it rather than assuming it:
`posted_at` unchanged, `ran_at` moved.

### A skip still writes a heartbeat

0108 exists because *"the cron ran and correctly did nothing"* and *"the cron
did not run"* produce identical evidence, and separating them cost five queries
once already. A silent Saturday is that ambiguity, every weekend, forever. So
every skip records which rule fired, on what date, and for which closure.

---

## The hole, named rather than hidden

**Only `confirmed` closures suppress a post.** A proposal is a question, not a
decision — 0101 is explicit that *"Only status='confirmed' rows affect
anything"* — and suppressing a post on one would be acting on an answer nobody
gave.

The consequence is real: **a store whose calendar nobody has ruled on will get a
post on Thanksgiving**, while this route looks like it prevents exactly that.
That is the "exclude the rows marked X" shape — the rule exempts every row that
never got marked.

So it is not silent. Every such day records `unruled_closure` on the heartbeat
naming the label somebody has to rule on, and `/admin/engagement` already shows
the closure calendar per rooftop with *"N still to rule"* or *"not set up"*.
**Beaumont has none**, so nothing is outstanding there today — but the next
store onboarded will have a calendar full of proposals until a manager works
through it.

A dismissed proposal is a decision the other way and is correctly ignored: 0101
keeps the row with `dismissed_at` stamped so the annual seeder cannot resurrect
it, and the route filters on that.

---

## Checking a holiday without waiting for it

```
GET /api/cron/rollcall?preview_at=2026-11-26T18:00:00Z
```

Reports what it would decide at that instant and **posts nothing, writes
nothing** — it never touches the heartbeat, so it cannot corrupt the window.
Still behind `CRON_SECRET`.

```json
{ "preview": true, "due": false, "skip": "closed", "weekday": "Thu",
  "localDate": "2026-11-26",
  "reason": "the store is closed on 2026-11-26 for Thanksgiving — confirmed, so no post." }
```

---

## Proof

**`npm run test:rollcall-schedule` — 28 assertions, pure.** No database, no
clock, so a Saturday in November costs the same to test in October. Every skip
is paired with the day that must post, because "it does not post on a Saturday"
is compatible with a function that never posts at all.

The two that matter most:

- **A working Thursday with a confirmed closure skips; the same Thursday with no
  closure posts.** 26 November is deliberately a Thursday — a Sunday closure
  would have proven nothing, because the weekend rule fires first.
- **22:30 UTC on a Friday is Friday in Chicago and already Saturday in Tokyo**,
  and the same instant posts for one and skips the other. That is the case a UTC
  day-of-week cron gets wrong.
- **A whole year counted**: 261 posting days and 104 skips across 2026 — the
  arithmetic of a 365-day year starting on a Thursday. A hand-picked sample is
  evidence about the sample, and an off-by-one in the isodow conversion would
  survive every symmetric assertion above.

**`npm run accept:rollcall-cron` — 21 assertions against the real route** over
HTTP with the real `CRON_SECRET`, a real rooftop and a real closure row. It
proves the wiring the pure test cannot: that the route calls the rule, reads the
right row, returns 200, writes the heartbeat, and leaves `posted_at` alone.

Two guards stop it posting into `#ediagd`: the dev server runs with
`SLACK_ROLLCALL_WEBHOOK` empty (and the suite refuses to start if its own shell
has one), and every case names a fixture rooftop. The acceptance case **asserts**
it got `no_url` — if it ever sees `posted: true` it fails and says a real message
went out.

**Non-vacuous.** With the skip disabled (`if (false && !decision.due)`), the
closure case walks straight past the gate to Slack and **4 assertions fail**:

```
✗ 200, not 502 — the job ran and correctly declined
✗ skipped: closed  — {"posted":false,"reason":"no_url",…}
✗ the reason names the holiday
✗ it never reached Slack — the reason is the decision, not `no_url`
  17 passed, 4 failed
```

Restored: **21 passed, 0 failed.**

**And the two systems are reconciled.** `rooftop_closed_day.closed_on` is
defined against SQL's `rooftop_today()`; the route looks the row up with a date
computed in TypeScript. If they ever disagreed the route would check the wrong
day's closure and post on a holiday, silently. The suite asserts
`storeDateOf(now, tz) === rooftop_today(rooftop)` before anything else.

| | |
|---|---|
| `test:rollcall-schedule` | **28 passed, 0 failed** |
| `accept:rollcall-cron` | **21 passed, 0 failed** |
| `accept:rollcall` (regression — `lib/rollcall.ts` changed) | **37 passed, 0 failed** |
| `tsc --noEmit` | clean |
| `eslint` | 0 errors (13 pre-existing warnings) |
| `check:nav` | passes |

No migration, no schema change, no change to the message itself.

---

## One tidy-up carried along

`lib/rollcall.ts` held a private copy of "format an instant as the date it fell
on at the store". The cron now needs the same answer to decide whether to post,
and a second copy would be a second **definition** of the store's day — they
would agree until one of them changed, and then a screen would group an event
onto a different date from the one the post was skipped for. Both now call
`storeDateOf` in `lib/store-day.ts`. The empty-string guard stayed in
`lib/rollcall.ts`, because that is a fact about its callers and not about dates.

---

## Note on scope

Advisors do work Saturdays — `work_schedule` has a `saturday_mode` for exactly
that. This change is about the **Slack status post**, not about advisors: a
Saturday completion is still recorded, still counted, and appears in Monday's
post. Nothing about what advisors see or receive has changed, and no
notification cadence was touched.

There is deliberately **no `?force=1`** to post on a skipped day. A bypass that
leaves no trace is not a gate, and nobody asked for one — if an ad-hoc Saturday
post is ever wanted, say so and it will be added with the override recorded on
the heartbeat.
