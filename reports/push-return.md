# Did the push bring them back

**Ryan, 14 October:** *"I need to make sure the push notifications are going out
and if it is working to get users back in. So like advisor lapsed 3 days,
notification went out, and 1 hr later he logged back in."*

---

## The answer, in two sentences

**No push has ever gone out to anybody at Doggett Ford of Beaumont, and the
reason is not the transport — not one of the nine has a device push token, so
`generate_push_outbox` never queues them.** The loop itself demonstrably works:
on the one account in the whole database that has a live token, four `return`
pushes have been accepted by Apple since 5 October and three were followed by a
recorded return — 144, 230 and 377 minutes — with the sharpest case being a
`streak_keeper` on 14 September delivered at 17:00:41Z and the day completed
**51 minutes later**.

The full audit is `reports/push-return-part-1-audit.md`. This file is what was
built, what it is proved against, and what is left for Ryan to rule on.

---

## Part 1 — the audit, read-only

```
set -a && . ./.env.local && set +a
SB_URL=$NEXT_PUBLIC_SUPABASE_URL SB_KEY=$SUPABASE_SERVICE_ROLE_KEY \
ROOFTOP=$ROLLCALL_ROOFTOP_ID SINCE=2026-10-12 npm run audit:push-return
```

Scope first: the **9 active advisor memberships** at rooftop
`84bef302-…`, read through `membership` — the table the generator itself
iterates, so this is the population the push logic sees. Named by UUID; there is
deliberately no lookup by store name.

| | |
|---|---|
| Token registered | **0 of 9.** Not declined, not retired — never written. |
| Pushes queued | 0 |
| Delivered | 0 |
| APNs failures | — |
| Returned 1 h / 4 h / 24 h | n/a — **not 0%**, because a rate over zero deliveries is undefined |

Two of the nine **are on the iOS build** — `app_event.signed_in` with
`platform: ios` on 12, 13 and 14 October — and neither phone registered a token.
The distinguishing evidence: **`user_notification_pref` holds no row for any of
the nine**, and `record_soft_ask` writes that row when the card is *shown*. So
this is not nine people who declined. **Nobody was asked.**

### The three checks

**A — APNs gateway vs build: PASSES.** 12 of the most recent 12 `push_delivery`
rows across every rooftop came back `ok 200`, zero `BadDeviceToken`, zero
`Unregistered`. The host cannot be read from here (it is `APNS_SANDBOX` in
Vercel), but Apple's answer is better evidence: a production TestFlight token
offered to the sandbox host fails *every* token. Twelve consecutive 200s is the
acceptance half, which is the half that normally gets skipped.

**B — Return counts scheduled workdays, so onboarding gates it.** 4 of 9 have
confirmed a schedule. With `schedule_set_at` null, `previous_scheduled_day`
returns null, the lapse comparison is null, and **the advisor can never lapse,
ever.** Correct behaviour, but it means five of the nine would still get nothing
even with phones and permission. Two causes, not one.

**C — the cron is firing.** `streak-saver` last completed 2026-10-15 **14:00:41Z**
(28 min before the audit), `rollcall` 2026-10-14 **22:30:26Z** — both on the
minute their schedules name. **Stated scope, and it is narrow:** `cron_heartbeat`
has `job` as its primary key, so it holds one row per job — the last completed
run, with no history. Stronger evidence comes from the sends themselves: four
`return` rows queued at 07:00 store-local on 5, 7, 9 and 15 October and delivered
at 12:00:4xZ each time. A job that only sometimes ran could not have hit four
separate 07:00 windows a fortnight apart.

**Nothing here is a policy or gateway fault, so Part 2 proceeded.**

---

## Part 2 — what was built

Migration **0165**, one migration, nothing changed in what is sent: no kind, no
copy, no cadence, no change to `generate_push_outbox` or `push_outbox_due`.

### `push_return` — one row per delivered push

`security_invoker = on`. Columns: user, rooftop, kind, store date, the **four
instants** (`queued_for`, `sent_at`, `attempted_at`, and the return), Apple's
answer, and the first `signed_in` / `daily_activity` / `daily_completion` after
an **accepted** delivery with the gap in minutes — null beyond seven days.
`returned` is that gap ≤ 24 h. **The gap is kept**, because the one-hour cases
are the question and a boolean discards exactly them.

Three decisions worth naming:

- **The grain is per DEVICE, not per message.** A person with two handsets is
  two rows and one notification, so `outbox_id` is on the row: count distinct
  for messages, count rows for deliveries. Collapsing to one grain is what would
  make the two uncountable.
- **The gap is measured from `push_delivery.at`** — the only one of the four
  instants that is an observation of the thing whose effect is measured. The
  other three are the sender talking about itself. All four are on the row so a
  reader can see they agree.
- **A refused delivery is still a row**, with nulls in the return columns.
  Dropping it would make "sent but not delivered" invisible on the one screen
  that asks why nobody came back.

### `advisor_reachable` — a second view, and why it had to exist

The Reachable column cannot be built from `push_return`: an advisor with a token
who has never been sent anything has no delivery row and would read "no". The
fact lives only in `device_push_token`, whose **only read policy is own-read** —
so the screen, read through an admin's client, would have rendered **"Reachable:
no" for all nine Beaumont advisors** regardless of the truth. The audit found
that same answer legitimately; the two would have been indistinguishable.

A team read policy on `device_push_token` would hand managers the raw token.
0102 keeps only six characters of it in `push_delivery` — *"not enough to be a
credential sitting in a log"* — so widening it to light up one column is the
wrong trade. Instead: a view that **does not select the token at all**, with the
gate in its body. The unsafe state is not avoided, it is unrepresentable, and
0056's own-read policy is untouched.

It is `security_invoker = off` **and says so**, with the opposite assertion in
the apply-time check from `push_return`'s — so a later tidy-up cannot make them
consistent with each other and wrong.

### Rollcall

Two fields per advisor and a block above the list.

```
PUSHES · LAST 30 DAYS
5 sent · 4 delivered · 3 back within 24 h · 75% return rate
3 of 4 delivered messages were followed by a sign-in, an activity record or a
completed morning within 24 hours. Sends run 3 Oct to 15 Oct.
⚠ 1 device delivery refused by Apple…
"Back" is the first sign-in, activity record or completed morning after the
delivery. All three are recorded once per store-day…
```

| | Reachable | Last push |
|---|---|---|
| came back | `Yes · iOS, 15 Oct` | `return 13 Oct · back in 52 min` |
| no return yet | `Yes · iOS, 15 Oct` | `return 3 Oct · no return yet` |
| no device | `No — never registered` | `None sent` |
| Apple refused | `Yes · iOS, 15 Oct` | `return 13 Oct · failed: BadDeviceToken` |
| token retired | `No — token retired: Unregistered` | — |

Screenshots at 390 px: `reports/push-return-rollcall-phone.png` and
`reports/push-return-rollcall-states.png`.

The period is **printed on the line**, the denominator is said out loud, and
`rate` is **null rather than 0 %** when nothing was delivered — "0% return rate"
on a rollout week would read as advisors ignoring us. At zero the block says
*why* it is zero, because "0 sent" has two causes with two different remedies.

### Slack

One line under the counts in the 17:30 post, today's numbers:

```
Pushes today: 1 sent, 1 delivered, 1 back within 24 h (100%).
```

and on a quiet day — which is most days — it **still prints**, with the reason:

```
Pushes today: 0 sent. 4 of 6 reachable.
```

An advisor whose push Apple refused is marked `:warning:` **before** the six
facts, so their positions do not move, with the reason on a continuation line
beside the existing `new:` and `tracks:` ones. No new env.

---

## Prove it

`npm run accept:push-return` — **48 assertions, all passing on a freshly reset
database.** Every claim is asked over PostgREST **as the role that really
calls**; the acceptance half comes first so nothing can pass against an empty
table.

Section 11 drives the **real `generate_push_outbox`** with the harness clock:

```
✓ THE REAL GENERATOR QUEUED A `return` FOR THE LAPSED ADVISOR — not a hand-built row
✓ at 07:00 store-local, carrying the deep link whose opened_via tag this PR also fixed
✓ and its rationale names the lapse it was decided from, not the stale current_len of 3
✓ the Rollcall row reads the push and the return, with the gap in minutes

    Reachable   Yes · iOS
    Last push   return 2026-10-15 · back in 41 min
```

**The one link that is simulated, said rather than hidden:** the APNs call
itself. A test cannot reach Apple and `APNS_*` is not set locally, so the
`push_delivery` row is written the way the cron writes it from `sendToTokens`.
That link is proved in **production** instead, which is stronger than a harness
— four real `return` pushes accepted at 200, three followed by real returns.

**The test advisor has no device token**, so the literal "sign in from the phone"
needs a handset of Ryan's; the one real token in the database is his. Everything
either side of that one call is proved.

### Non-vacuity — each gate broken, each failure recorded

| break | result |
|---|---|
| drop `push_delivery_team_read` | **31 passed, 11 failed** — admin and manager read zero |
| `push_return` → `security_invoker = off` | **39 passed, 3 failed** — advisor reads 4 rows including their own; manager at B reads A's |
| strip `first_return_after`'s service_role branch | **36 passed, 6 failed** |
| restore | **48 passed, 0 failed** |

### Two real defects the suite caught in my own work

**1. `first_return_after` was blind to the service role.** `managed_users()`
keys on `auth.uid()`, the service role has none, and **a `SECURITY DEFINER`
function gets nothing from BYPASSRLS** — the WHERE clause is doing the
excluding. Every return column came back null for the cron. The row count
passed and told us nothing, because the rows come from `push_delivery` which the
service role reaches by BYPASSRLS; only the **values** were wrong.

What that would have shipped, verbatim from the broken run:

```
✗ the non-zero line reads "Pushes today: 1 sent, 1 delivered, 1 back within 24 h"
    got "Pushes today: 1 sent, 1 delivered, 0 back within 24 h (0%)."
```

**Every evening, forever, with a 200 and no error**, while the same view on the
screen showed the real figure. I wrote the warning about this pattern forty
lines below in the same file before making the mistake forty lines above. The
lesson is not "remember the service role" — it is that the only thing that
caught it was a test exercising the path *as the role that really calls*.

**2. The apply-time refusal caught `anon` reading `push_return`.** Supabase's
default privileges grant select on new objects in `public` to anon, so a view is
publicly readable the moment it is created and nothing in the create statement
says so. Being invoker meant it would have returned zero rows in practice —
which is exactly why it would have survived. Now `revoke all … from anon,
authenticated` then grant back.

### Checks

| | |
|---|---|
| `0001 → 0165` chain replay | **clean**, via `supabase db reset` |
| `npm run accept:push-return` | **48 passed, 0 failed** |
| `npm run accept:rollcall` | **37 passed, 0 failed** — no regression from the loader change |
| `npx tsc --noEmit` | clean |
| `npm run lint` | 0 errors (13 pre-existing warnings, none in changed files) |
| `npm run check:nav` | passes |
| `npm run preview:push` | **FAILS — and it failed before this branch.** See below. |

---

## Three findings beyond the three deliverables

### 1. `opened_at` can never be set for `return` or `start` — FIXED in this PR

`app/(app)/today/page.tsx` stamped the open from a fixed two-entry map.
0152 added `/today?opened_via=return` and `?opened_via=start` and the map was
never widened — so a return tap looks itself up, finds `undefined`, and
**silently stamps nothing**. No error, no log. `opened_at` is null on every send
this database has ever made.

A dashboard built on `opened_at` would have reported a 0% open rate as a fact
about advisors. **This is why `push_return` is built on the three activity
records and not on the stamp.**

The fix closes the class rather than the case: `OPENED_VIA_KIND` is **derived
from `PUSH_COPY`'s own deep links**, so a kind that gains a link gains its stamp
with nothing to remember, and `lintPushCopy` now refuses a `/today` link with no
tag and refuses two kinds sharing one tag. This is a change to **attribution,
not to sending**, which is why it is here rather than held — but it is beyond
the three items Part 2 names and is flagged as such.

**What I am not claiming:** that the map is the only reason `opened_at` is null.
`streak_keeper` *is* in the map and its sends are unstamped too, so either those
links were not tapped or the tap is not reaching this handler. The map gap is
confirmed by reading the code; the tap rate is unmeasured.

### 2. `npm run preview:push` is failing on `main`, on a copy drift — RYAN'S CALL

```
COPY vs SQL — 1 DRIFT
  start: body differs
    ts : Your first morning is about five minutes — a mindset video and one idea for the drive.
    sql: Your first morning is three minutes — a mindset video and one idea for the drive.
```

0153's header says *"start's body, which still says 'three minutes' … is left for
a separate decision"* — and the TypeScript mirror was edited anyway. The script
exits 1, correctly. **Confirmed present on `main` with this branch stashed**, so
it is not mine. The live `start` push says "three minutes"; the file says five.
It is a copy change, which Part 2 explicitly excludes, so **nothing was touched**.

### 3. `completion_team_read` excludes the group roles — RECORDED, NOT SWEPT

0011 wrote `has_role(rooftop_id,'manager') or has_role(rooftop_id,'admin')`
instead of calling `managed_rooftops()`, so `group_owner` and `group_manager`
read no `daily_completion` — the 0115 bug shape. It is why
`first_return_after` is a definer function rather than three raw joins: joined
raw, the view would tell a group owner "no return" where an admin sees one, and
a label whose value depends on who is reading it is the worst shape here.

**The question, written down rather than answered:** *which read policies spell
out the membership check instead of calling `managed_rooftops()`?* That affects
every reader of `daily_completion`, not just this view, and wants its own sweep —
it is a privilege widening, which is not something to slip into this PR.

---

## What stands between Beaumont and a Return push

In order, and neither is a code change:

1. **Nobody has been asked for notification permission.** No
   `user_notification_pref` row for any of the nine. Two are already on the iOS
   build and would be reachable the moment they allow it. This is the one that
   matters.
2. **Five of nine have no confirmed work schedule**, so even with a token they
   can never lapse and can never be selected. Onboarding first, then push.
