# Push diagnosis and the clock-following greeting

*1 October 2026, branch `push-and-greeting`.*

## Push: the chain walked in order — no link is broken

1. **Cron + CRON_SECRET**: `cron_heartbeat` shows streak-saver ran at
   2026-10-01 04:00 UTC with a full detail payload — the route authenticated
   and executed. No 401s reach the heartbeat path.
2. **Outbox**: zero `notification_outbox` rows in 8 days — and that is the
   generator being HONEST, not broken. The candidate predicate requires
   `current_len >= 2` AND `last_completed_on = previous_scheduled_day(...)`.
   The only person with a live device token is Ryan, whose Swell has been at
   1 since 25 September; his last qualifying streak ended 22 September —
   **exactly the date the sends stopped**. Push did not stop working; streaks
   stopped qualifying.
3. **APNs config and sends**: the heartbeat took the *configured* branch
   (`sent: 0`, not "APNs not configured"), so the env survives the recent
   deploys. The last real delivery (22 Sep) was `ok=true, apns_status=200`
   to token `…C8D360` — the same token that is still live.
4. **Tokens**: Ryan's iOS token `…C8D360`, created 8 Sep, **last_seen 1 Oct**
   — the shell IS re-registering on cold start. **Mitch has no device token
   at all** (only a retired Android row, "no transport in v1"). That is the
   one human-shaped gap: until his phone registers, no push can ever reach
   him — one app launch on his iPhone fixes it. Ryan's to chase, not code.

**The proof send**: a labeled prove-out row is queued —
`notification_outbox d20ad882-f06d-4a67-9368-6a4fe7c1c563`, kind
`streak_keeper`, scheduled 2026-10-01 07:00 America/Chicago (12:00 UTC),
rationale naming this diagnosis. The first same-night attempt was **refused
by `notification_outbox_quiet_hours` (06:30–19:00)** — it was 23:41 at the
store, and I did not forge a timestamp past a safety constraint. The first
in-window Vercel cron delivers it through the real path; read the result
with:

```sql
select o.sent_at, d.ok, d.apns_status, d.apns_reason, d.apns_id
  from notification_outbox o left join push_delivery d on d.outbox_id = o.id
 where o.id = 'd20ad882-f06d-4a67-9368-6a4fe7c1c563';
```

(For an instant transport answer at any hour there is already
`POST /api/push/test` — platform-owner-only, your own tokens, returns
Apple's verdict per token.)

## The greeting follows the store's clock

`greetingForHour(hour)` sits beside `BRAND.greeting` in `lib/brand.ts`
(morning < 12, afternoon 12–16, evening ≥ 17; anything unreadable falls back
to "Aloha" — a brand word at the wrong hour over a wrong claim about the
time). `rooftopGreeting(client, rooftopId)` feeds it from
`rooftop_local_now()` — the same `now() at time zone rooftop.timezone` that
`rooftop_today()` reads. Never the server's hour, never the phone's.

**Two corrections to the brief's map, found by the sweep:**
- `AppHeader` does not read the greeting; no change there.
- The worst offender was invisible to a `BRAND.greeting` grep:
  **`MindsetStep` in DailyFlow hardcoded the literal words "Good morning"**
  at every hour — the first line of every ritual, wrong after noon. That is
  how "Good morning" met the evening.

Converted to the store clock (threaded from the server pages): the `/advisor`
headline, DailyFlow's `MindsetStep` and `RestDayCard`, `RooftopNotReady`,
`TechnicianDay`. Kept as "Aloha": the login screen (`AuthShell`) and
onboarding — nobody is signed in or no store clock is the day's anchor yet.
Seven on-screen greeting moments before, seven after; none added, none lost.

**Proofs:** `npm run test:greeting` — 9 of 9, the six named boundaries
(06:00, 11:59, 12:00, 16:59, 17:00, 23:30) through the same string-slice the
rpc path uses, plus three unreadable-clock fallbacks. Render proof:
`/today` as advisor `921e2537…` (by id) on the prod-restore with the
rooftop's timezone pinned to Pacific/Honolulu (local hour 18) —
**"GOOD EVENING, DEMO"** — `reports/screenshots/today-evening-greeting.png`.
