# Part 1 — are the pushes going out to Beaumont, and has anyone come back?

**Read-only audit. 15 October 2026, 14:28 UTC. Nothing was changed to produce it.**

Reproduce with:

```
set -a && . ./.env.local && set +a
SB_URL=$NEXT_PUBLIC_SUPABASE_URL SB_KEY=$SUPABASE_SERVICE_ROLE_KEY \
ROOFTOP=$ROLLCALL_ROOFTOP_ID SINCE=2026-10-12 npm run audit:push-return
```

Scope, before any finding: the population is the **9 active advisor memberships
at rooftop `84bef302-ebd2-4536-ba9f-693c535f10d4` (Doggett Ford of Beaumont)**,
read through `membership` — which is the table `generate_push_outbox` itself
iterates, so this is the population the push logic sees and not a roster reached
by another path. The period is 12 October onward. Named by UUID throughout;
there is deliberately no lookup by store name.

---

## The answer in two sentences

**No push has ever gone out to anybody at Beaumont, and the reason is not the
transport — it is that not one of the nine has a device push token, so the
generator never queues them.** The push → return loop itself demonstrably works:
on the one account in the entire database that has a live token, four `return`
pushes have been delivered and accepted by Apple since 5 October, and three of
the four were followed by a recorded return within 24 hours — 377, 144 and 230
minutes.

---

## 1 · One table per advisor

Every advisor's row is identical in the only column that decides anything, so
the table collapses to one shape plus a reason column. **The full per-advisor
output is in the script; the reasons differ and are listed in §3.**

| Advisor | Token registered | Pushes queued | Delivered | APNs failures | Returned 1 h / 4 h / 24 h |
|---|---|---|---|---|---|
| Amanda Pinder | **no** — none ever | 0 | 0 | — | n/a |
| Austin Abate | **no** — none ever | 0 | 0 | — | n/a |
| Destiny Booker | **no** — none ever | 0 | 0 | — | n/a |
| Heather Sztaba | **no** — none ever | 0 | 0 | — | n/a |
| Konner Upshaw | **no** — none ever | 0 | 0 | — | n/a |
| Mathew Martin | **no** — none ever | 0 | 0 | — | n/a |
| Matthew Reck | **no** — none ever | 0 | 0 | — | n/a |
| Test Advisor | **no** — none ever | 0 | 0 | — | n/a |
| Valerie Patterson | **no** — none ever | 0 | 0 | — | n/a |

`device_push_token` holds **zero rows** for all nine, live or retired. Not a
declined permission, not a retired token — the row was never written.

The return columns are `n/a` rather than `0`: a return rate over zero
deliveries is not 0%, it is undefined, and printing 0% would read as "we asked
and they ignored us".

### Why that is not the same as "nobody has the app"

Two of the nine **are running the iOS build**. `app_event.signed_in` records the
shell a session ran in, and over 12–14 October:

| | platform | sessions recorded |
|---|---|---|
| Austin Abate | **ios** | 12, 13, 14 Oct |
| Matthew Reck | **ios** | 12 Oct |
| Valerie Patterson | web | 12, 13, 14 Oct |

So the TestFlight app is installed and being opened on two phones at Beaumont,
and **neither phone has registered a push token.** Those are two different
problems with two different remedies, and the distinguishing evidence is this:

> **`user_notification_pref` holds no row for any of the nine.**

`record_soft_ask` writes that row when the soft-ask card is *shown*, before the
OS dialog appears. No row means **the soft ask was never put in front of them** —
so this is not nine people who declined notifications. Nobody was asked.

---

## 2 · One line per advisor with no push

Judged against `generate_push_outbox`'s own conditions, in its order; the first
one that fails is the reason, because that is the one that decided.

Store today 2026-10-15 · Return policy **enabled**, target 07:00 ·
`rooftop_has_product(advisor_base)` = **true**, `rooftop_product.status =
active`.

| Advisor | First condition that failed |
|---|---|
| Austin Abate | no live `device_push_token` |
| Matthew Reck | no live `device_push_token` |
| Test Advisor | no live `device_push_token` |
| Valerie Patterson | no live `device_push_token` |
| Amanda Pinder | **no confirmed work schedule** — can never lapse |
| Destiny Booker | **no confirmed work schedule** — can never lapse |
| Heather Sztaba | **no confirmed work schedule** — can never lapse |
| Konner Upshaw | **no confirmed work schedule** — can never lapse |
| Mathew Martin | **no confirmed work schedule** — can never lapse |

Four are onboarded and unreachable. Five are not onboarded, which is a harder
stop than a missing token — see check B.

> **A correction to my own first run of this audit, recorded because it is the
> exact failure this codebase keeps paying for.** The first version read
> `rooftop_product` and selected a column named `active`. There is no such
> column — it is `status`, with `'active'` among its *values*. PostgREST returned
> an error, **the error was not checked**, `data` came back null, and the audit
> printed *"rooftop advisor_base is ABSENT"* for all nine advisors. A confident
> wrong answer in the direction that would have had somebody chasing an
> entitlement bug that does not exist. The fix is both halves: ask
> `rooftop_has_product()` — the function the generator itself calls, so the join
> is on what the decider observed — **and** reconcile it against
> `rooftop_product.status`, throwing if the two disagree. Every read in the
> script now checks its error, because a select whose error is dropped reports
> the empty set, and the empty set reads as a finding.

---

## 3 · Who holds a live token at all

Widened deliberately: "nought of nine" invites the conclusion that token
registration is broken, and the second route settles it.

**One live token in the entire database.** iOS, registered 8 September, last seen
today 05:27. It belongs to user `78929620` — admin, manager *and* advisor
memberships, all at other rooftops. One retired Android token, retired 8
September with the reason `android: no transport in v1`, which is correct and
deliberate.

Registration works. One phone proves it. Nobody at Beaumont has been through it.

---

## 4 · The three checks

### Check A — does the APNs gateway match the build? **YES.**

Scope: the most recent **12** `push_delivery` rows, across every rooftop — a
gateway is a property of the deployment, so the widest available population is
the right one.

```
  12    ok  200  (no reason returned)
```

**12 accepted, 0 BadDeviceToken, 0 Unregistered.**

The server's host cannot be read from here — it is decided by `APNS_SANDBOX` in
Vercel's environment, which this script has no access to. Apple's own answer is
the better evidence anyway: a production TestFlight token offered to the sandbox
host fails *every* token with `BadDeviceToken`. Twelve consecutive 200s is the
acceptance half of that gate, and the acceptance half is the one that normally
gets skipped. **The host is right for the build.**

### Check B — Return counts scheduled workdays, so onboarding gates it

Scope: the 9 advisor memberships, against `work_schedule`. **4 of 9 have
confirmed a schedule.**

| Advisor | `schedule_set_at` |
|---|---|
| Austin Abate | 12 Oct 16:31 |
| Matthew Reck | 12 Oct 16:32 |
| Valerie Patterson | 12 Oct 16:30 |
| Test Advisor | 1 Oct 13:53 |
| Amanda Pinder, Destiny Booker, Heather Sztaba, Konner Upshaw, Mathew Martin | **no `work_schedule` row at all** |

Return's lapse test is `last_completed_on < previous_scheduled_day(user, today)`
and its cadence is counted by `scheduled_days_since` — both call
`is_scheduled_day`, which reads `work_schedule`. With no confirmed schedule,
`previous_scheduled_day` returns null, the comparison is null, the `WHERE`
clause is not satisfied, and **the advisor can never lapse, ever.**

This is the push correctly declining to fire for somebody the app is still
holding at onboarding — not a fault. But it means that for those five, "no
Return push went out" is explained by **onboarding** and not by the transport,
and the two must not be reported as one thing. Giving those five phones and
notification permission would still send them nothing.

### Check C — is the cron firing on the schedule `vercel.json` declares?

**Scope, and it is narrow:** `cron_heartbeat` has `job` as its primary key, so it
holds exactly **one row per job — the last completed run**. There is no history
in it. This cannot show a schedule; it shows the most recent completion and
nothing about the ones before it. A one-row sample reported as a schedule would
be the scoped-measurement mistake again.

| job | declared | last completed | age |
|---|---|---|---|
| `streak-saver` | `0 * * * *` | 2026-10-15 **14:00:41Z** | 28 min — alive |
| `rollcall` | `30 22 * * *` | 2026-10-14 **22:30:26Z** | 15 h 58 min — alive |

```
streak-saver detail  {"sent":0,"skipped":0,"messages":0,"retired":0,"expired":0,
                      "generated":{"queued":0,"skipped":0}}
rollcall     detail  {"posted":true,"accounts":9,"installed":2,"onboarded":4,
                      "completed_today":1,"listed":9,"changed":1,"dropped":0}
```

Both fired on the minute their schedule names — `:00` and `:30` past — and both
completed. The streak-saver run queued nothing and sent nothing, which given §1
is the correct output and not a silence.

Stronger evidence than the heartbeat, and it comes from the send history: the
four `return` rows below were queued at **07:00 store-local on 5, 7, 9 and 15
October** and delivered at **12:00:4xZ** each time. A job that only sometimes
ran could not have hit four separate 07:00 windows a fortnight apart.

---

## 5 · The loop works — here is it working

This is the part that answers Ryan's question about the mechanism, and it is
live production data rather than a harness. User `78929620`, the one account with
a token:

| kind | store date 07:00 | delivered | first return | gap |
|---|---|---|---|---|
| `return` | 5 Oct | ok 200 | `daily_activity` | **377 min** |
| `return` | 7 Oct | ok 200 | `daily_activity` | **144 min** |
| `return` | 9 Oct | ok 200 | `daily_activity` | **230 min** |
| `return` | 15 Oct | ok 200 | none yet | — (sent 2 h 28 min ago) |

And the streak kinds, same transport, for completeness:

| kind | store date | delivered | first return | gap |
|---|---|---|---|---|
| `streak_last_call` | 10 Sep 16:50 | ok 200 | `daily_completion` | 386 min |
| `streak_keeper` | 11 Sep 12:00 | ok 200 | `daily_completion` | 505 min |
| `streak_keeper` | **14 Sep 12:00** | ok 200 | `daily_completion` | **51 min** |
| `streak_keeper` | 15 Sep 12:00 | ok 200 | `daily_activity` | 600 min |
| `streak_keeper` | 16 Sep 12:00 | ok 200 | `daily_activity` | 1998 min |
| `streak_keeper` | 22 Sep 12:00 | ok 200 | `daily_activity` | 143 min |
| `streak_keeper` | 1 Oct 07:00 | ok 200 | `daily_completion` | 505 min |
| `streak_keeper` | 14 Oct 12:00 | ok 200 | `daily_activity` + `signed_in(ios)` | 747 min |

**12 accepted deliveries, 11 followed by a return, and one of them is the exact
shape Ryan described — 14 September, delivered 17:00:41Z, the day completed 51
minutes later.**

The rationale strings are worth reading because they show the cadence behaving:
*"last completion 2026-10-01 — 1 missed scheduled day(s), 4 calendar day(s)
since; cadence due"*, then 3 missed, then 5 missed. Every second scheduled
workday, exactly as `outbox_policy.cadence` specifies.

---

## 6 · One defect found, and it is not send-side

**`opened_at` is null on all 13 sends, and for `return` and `start` it can never
be anything else.**

`app/(app)/today/page.tsx` stamps the open from a fixed map:

```ts
const OPENED_VIA: Record<string, "streak_keeper" | "streak_last_call"> = {
  streak_saver: "streak_keeper",
  streak_last_call: "streak_last_call",
};
const kind = params.opened_via ? OPENED_VIA[params.opened_via] : undefined;
```

0152 added two deep links — `/today?opened_via=return` and
`?opened_via=start` — and this map was never widened. A return tap arrives with
`opened_via=return`, the lookup returns `undefined`, and **nothing is stamped and
nothing is logged.** `stampStreakSaverOpened`'s parameter type is narrowed the
same way. A fixed list that says nothing when it meets something it does not
mention: `check:nav` three times over.

**What I am *not* claiming:** that this is the only reason `opened_at` is null.
`streak_keeper` *is* in the map and its sends are unstamped too, so either those
links were not tapped or the tap is not reaching this handler. The map gap is
confirmed by reading the code; the tap rate is unmeasured. Both stated, because
asserting the first explains the second would be a guess dressed as a finding.

This is why **`push_return` is built on `signed_in` / `daily_activity` /
`daily_completion` and not on `opened_at`.** A view keyed on the stamp would
have reported "nobody ever comes back" with total confidence.

The fix is in the attribution layer, not the send layer — no kind, no copy, no
cadence changes — and it is written to close the class rather than the case: the
map is **derived from `PUSH_COPY`'s own deep links**, so a kind that gains a deep
link is stamped without anyone remembering to add it. That change is in this PR
and flagged here as beyond the three items Part 2 names.

---

## 7 · What is and is not blocking

**Not a fault, nothing to rule on:** the APNs gateway, the Return policy, the
cadence, the cron, the entitlement. All four checked above and all four correct.
Part 2 proceeds.

**The two things standing between Beaumont and a Return push, in order:**

1. **Nobody has been asked for notification permission** — no
   `user_notification_pref` row for any of the nine, so the soft ask has not run
   for them. Two are already on the iOS build and would be reachable the moment
   they allow it. This is the one that matters, and it is an operational step,
   not a code change.
2. **Five of nine have no confirmed work schedule**, so even with a token they
   can never lapse and can never be selected. Onboarding first, then push.

Neither is a send-side change and neither needs a ruling to proceed; both are
reported because "the pushes are not going out" has two causes and fixing the
wrong one would leave the other in place.
