# Two reasons to send a push: protect a streak, or bring someone back

*1 October 2026, branch `reengagement-push`. Migrations 0151/0152, one copy
file, one acceptance harness. Streak protection is untouched.*

## Precondition

The brief gated this on the push delivery fix being proven with a real send.
It is: the prove-out row from the push PR delivered —
`apns_status 200, apns_id 5DEB0544-481F-6367-15F1-C85746B32490`, sent
12:00:41 UTC on 1 October. A second producer now joins a path that works.

## The three classes, and the tables each is read from

Computed from data the product already has; the generator reads these:

1. **Protect** (unchanged, 0112): `swell` (current_len ≥ 2, last_completed_on
   = `previous_scheduled_day`), `daily_completion` (not done), `work_schedule`
   /`island_time`/`rooftop_closed_day` via `is_scheduled_day`,
   `user_notification_pref`, `device_push_token`. Noon nudge, 16:50 last call.
2. **Return**: `membership` (active advisor, `op_code_id` not null = mapped),
   `rooftop_product` via `rooftop_has_product` (entitled), `swell`
   (last_completed_on not null = completed before, and `< previous_scheduled_day`
   = the last scheduled day missed), `daily_completion`, `is_scheduled_day`,
   prefs, token. Cadence with decay, below.
3. **Start**: `membership` (active advisor, entitled), **no** `daily_completion`
   row ever, `membership.created_at` as the invite anchor, `is_scheduled_day`,
   prefs, token. Workday 1, then workday 3, then stop.

**They are disjoint by predicate** — live streak vs. completed-and-lapsed vs.
never-completed — so "at most one class a day, Protect > Return > Start" is
structural, not a tie-break. The branches still run in that order, and
`notification_outbox_one_per_day` (unique on recipient_id, local_date, every
kind but personal_best) is the backstop: "never a third" is the database's,
where the ruling asked the caps to live. Neither new class trusts `current_len`
(the F6 corpse); both decide from `last_completed_on` and `daily_completion`.

## The selections, as SQL

```
-- RETURN: lapsed, mapped, entitled, within 30 days, on a cadence send-day
where m.active and m.role='advisor' and m.op_code_id is not null
  and rooftop_has_product(m.rooftop_id,'advisor_base')
  and is_scheduled_day(m.user_id, _l_date)                       -- excludes closures/island
  and s.last_completed_on is not null
  and s.last_completed_on < previous_scheduled_day(m.user_id,_l_date)   -- missed the last day
  and (_l_date - s.last_completed_on) < 30                        -- hard stop
  and return_send_due(scheduled_days_since(..) - 1, cadence)      -- the decay, in MISSES
  and not exists (completion today) and push_enabled and has token

-- START: entitled, never completed, on workday 1 or 3 since invite
where m.active and m.role='advisor'
  and rooftop_has_product(m.rooftop_id,'advisor_base')
  and is_scheduled_day(m.user_id,_l_date)
  and not exists (any daily_completion for this user)
  and scheduled_days_since(m.user_id, m.created_at::date, _l_date)
        in (select value::int from cadence->'sends')
  and push_enabled and has token
```

**The cadence is counted in misses, not calendar days.** The first send is the
scheduled morning AFTER the first missed day (miss index 1), then every second
missed scheduled day through index 9 (1,3,5,7,9), then one per week
(15,20,25), then nothing — with a 30-calendar-day hard stop. A completion
resets the anchor. The decay numbers live in `outbox_policy.cadence` (jsonb)
and change without a deploy; the caps are in the generator.

## The policy rows, as shipped

| kind | target_local_time | enabled | cadence |
|---|---|---|---|
| return | 07:00 | true | `{stop_after_days:30, fast_until_workday:10, fast_interval:2, slow_interval:5}` |
| start | 07:00 | true | `{sends:[1,3]}` |

## The copy (Ryan reads every line before it ships)

| class | send | title | body |
|---|---|---|---|
| return | every send | Your Swell is here when you are | `{family}` is up today. About five minutes. |
| start | 1 and 2 | Welcome to EDIAGD | Your first morning is three minutes — a mindset video and one idea for the drive. |

`{family}` is the advisor's locked pitch family from `advisor_focus_family` —
the same row the morning's pitch slot reads — with a family-less fallback
("Today's training is up today…") when there is no assignment. Return never
changes words with the send number: a reminder that escalates in tone is the
red-flavoured thing push-copy.ts forbids. Both kinds were added to the
`advisor_safe` audience trigger (0056) deliberately — they are invitations,
not verdicts. `preview:push`: copy in sync with SQL, forbidden-tone lint clean.

## Acceptance (real account ids, on the dump restore, rolled back)

`scripts/reengagement-acceptance.sql` — 9 of 9:

```
ok  RETURN fires on miss indices {1,3,5,7,9,15,20,25}, nothing past 30 days
ok  RETURN body names what is waiting (no mention of the miss)
ok  RETURN a completion resets the cadence (silent day 13, fires day 14)
ok  START fires workday 1 and 3 only, then stops
ok  PROTECT wins: live-streak advisor gets 1 protect row, 0 return, 0 start
ok  PROTECT never fires on a confirmed store closure
ok  push OFF: no row of any kind
ok  unmapped account: no Return row
ok  unentitled rooftop: no row
```

The window deliberately spans Labor Day (a real confirmed closure in the dump):
calendar offsets and miss indices diverge there, which is the proof that the
cadence counts the advisor's scheduled misses and a shut store is not one. The
assertion is on the miss index — closure-independent.

## The counts the first Beaumont morning would produce

**Literally today: 0 / 0 / 0.** Doggett Ford of Beaumont has **no advisor
memberships yet** — part two of the Beaumont runbook (the per-person
`provision:advisor` writes) is Ryan's and has not run, and nobody there has a
device token. The re-engagement value arrives as advisors are provisioned:

- **Start** is the class every new Beaumont advisor lands in — no completion
  yet — so once the six are provisioned and have installed, their first
  scheduled morning queues a Start push (up to 6), a second two workdays later.
- **Return** needs a completion followed by a lapse, so it is empty at Beaumont
  on day one and fills only after advisors have built and broken a streak.
- **Protect** needs a live streak — also empty on day one.

**Prod-wide today**, the live class populations are: Protect 0, **Return 1**,
Start 0. The one Return candidate is Ryan's own account (last completed
25 September, mapped at entitled CDJR, token live) — miss index 3 today, a
send day.

## The one held item: the real Return send

A `return`-kind row cannot be written to production until the enum value exists
there, which lands when **you apply 0151/0152** (`npm run db:migrate`).
The delivery path is already proven (apns_id above). After the migration, no
hand-queued row is needed: Ryan's account is the single live Return candidate
and today's miss index is a send day, so the next 07:00 America/Chicago cron
run on a send-day queues his Return and the live sender delivers it — the first
real Return push, to his phone, by the generator. If you want it off-cycle, the
same labeled-row pattern the prove-out used works once the enum is in prod.

## Files

`supabase/migrations/0151_reengagement_push_kinds.sql`,
`0152_reengagement_push.sql`, `lib/notifications/push-copy.ts`,
`scripts/reengagement-acceptance.sql`.

## Finding (not fixed here — Protect is untouched by ruling)

`notification_outbox_one_per_day` exempts only `personal_best`, so
`streak_last_call` cannot actually coexist with `streak_keeper` on the same day
— the 16:50 last call is refused by the index whenever the noon nudge already
sent, contrary to 0112's design note. It has never surfaced (sends were sparse
and a live streak completing by noon removes the last-call candidate anyway).
Flagged for a separate decision; streak protection stays exactly as it is per
this ruling.
