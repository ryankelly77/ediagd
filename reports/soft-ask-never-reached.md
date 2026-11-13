# Why nobody has been asked about notifications

**Ryan, 20 October:** reproduce in the simulator as the test advisor with one
completed morning — does the card render, does `noteSoftAskShown()` write a row,
does Yes register a token. Check `lib/native/bridge.ts` first; the push
registration there was left as a deliberate stub returning "unavailable".

**Nothing was changed.** This is the report asked for before any fix.

---

## First: the stub is not the problem

`lib/native/bridge.ts:94`

```ts
export const PUSH_ENABLED = true;
```

The comment above it is the history — *"PUSH IS DORMANT, AND THAT IS THE WHOLE
POINT OF SHIPPING IT NOW"* — followed by:

> **AWAKE AS OF THE STREAK SAVER.** The dormancy above is the history of this
> constant, kept because it explains why the whole path below was written months
> before anything used it.

So it was switched on. `registerForPush` runs for real: it checks permissions,
raises the OS dialog only when `prompt: true`, attaches a `registrationError`
listener that reports failures rather than swallowing them, and races a 10-second
timeout so a missing token reports `no_token` instead of a false success. That
path already learned the lesson you're worried about — the comment in it records
the weeks when the shell shipped without an `aps-environment` entitlement and the
app reported success while `device_push_token` never gained a row.

**It is also not reachable**, which is the actual finding.

---

## The cause: the card is on a screen almost nobody lands on

`offerSoftAsk` is computed on the `/today` server render and then passed to
**exactly one component** in the whole flow:

| | |
|---|---|
| `DailyFlow.tsx:449` | `<DoneForTodayScreen … offerSoftAsk={offerSoftAsk} />` |
| `DailyFlow.tsx:2067` | `{offerSoftAsk && <SoftAsk />}` — inside `DoneForTodayScreen` |

And `DoneForTodayScreen` is gated on:

```ts
if (doneOnArrival && !ritualRun && !preview) {
```

`doneOnArrival` — they **arrived** with the day already complete.
`!ritualRun` — they did **not** just do it in this session.

`CelebrationStep` — the screen you see the moment you finish a morning, rendered
at `DailyFlow.tsx:643` for `step === 4` — **does not receive `offerSoftAsk` at
all.** Its prop list has no such field.

So the only way to see the card is:

> **Open the app on a day you have already completed, in a session where you did
> not just complete it.**

Finish your morning and put the phone down — which is the entire design of the
product, five minutes before the drive gets busy — and you never see it. That is
why four people have used the iOS build daily for over a week and
`user_notification_pref` has **zero rows** at Beaumont.

`shouldOfferSoftAsk` is doing its job correctly, for the record: no live token,
`soft_ask_count = 0`, `completions >= 1` — all true for Austin, Konner, Reck and
Heather. The budget logic is fine. It is asked a question on a screen they never
reach.

---

## The write path works — proven, not assumed

The other half had to be eliminated, or "the card never renders" would be a
guess. `record_soft_ask` was called **as the advisor over PostgREST**, the role
and path the server action really uses (it resolves the user from the session and
passes no user id):

```
rows before:             0
after noteSoftAskShown:  [{"soft_ask_count":1,"soft_ask_answer":null,"push_enabled":true}]   err=none
after answerSoftAsk yes: [{"soft_ask_count":1,"soft_ask_answer":"yes","soft_ask_answered_at":"…"}]  err=none
```

Both writes land. Nothing is broken downstream of the card — it is never fired.

---

## The simulator run: what I got, and where I stopped

Built and ran the real shell: Xcode 26.6, iPhone 17 Pro, iOS 26.5, `BUILD
SUCCEEDED`, app installed and launched. Pointed at a local dev server and local
Supabase rather than production, so no credential was ever typed into
`app.ediagd.ai`. The shell loaded the web app and rendered the front door.

**I could not complete the sign-in, and the reason is the harness and not the
app.** `System Events` refuses mouse clicks here (`-25204`), so I have a keyboard
and no pointer. Three ways round it all failed:

- a path in `server.url` is rejected by Capacitor — it silently fell back to the
  offline bundle in `native/www`, which is a blank navy screen;
- a temporary custom URL scheme did reach `appUrlOpen`, but iOS puts a native
  **"Open in EDIAGD?"** confirmation in front of it, and that dialog does not
  take Return from this setup;
- the login page has no autofocus, so there is nothing for the keyboard to type
  into without a tap first.

I stopped there rather than keep going, per the rule about not grinding on a
failing automation path. **Every temporary edit is reverted** — `capacitor.config.ts`,
`Info.plist` (ATS and the URL scheme), the fixture user, the simulator install.
`git status` is clean.

### And the third question cannot be answered in a simulator at all

**The iOS Simulator cannot obtain a real APNs device token.** There is no APNs
connection behind it; `xcrun simctl push` exists for testing *delivery handling*
with a payload file, but it does not issue a token. So "does Yes register a
token" needs a **physical device** — your phone, or Mitch's — regardless of the
input problem above. Reporting a simulator failure there would have been a false
negative about production.

What that question *can* be answered by, cheaply, once the card is reachable: the
`registrationError` listener already in `registerForPush` returns
`failed: <reason>` rather than a silent success, so a real device will say
precisely why if it fails.

---

## What I did not do

No code changed. The fix is small and the decision is yours, because it is a
product-behaviour question rather than a bug with one correct answer:

1. **Pass `offerSoftAsk` to `CelebrationStep` as well** — ask at the moment the
   app has just been useful, which is what `push-prefs.ts`'s own header says the
   first ask is for: *"The first ask lands the day they complete their first
   block, when the app has just been useful and the offer makes sense."* The code
   describes a design the wiring does not implement.
2. **Mind the off-by-one.** `offerSoftAsk` is computed at page load from
   completions *before* today's. On somebody's very first morning it is false, so
   even wired to the celebration they would not be asked until their second. If
   the intent is "the day they complete their first block", the count needs to
   include the completion that just happened.
3. **Leave the already-done screen as it is** — it is a reasonable second
   surface, just not a sufficient one.

---

## Separately: large text is breaking the front door

From the screenshot on the Desktop (20 Oct, 4:03 PM), at a large Dynamic Type
setting:

- "something" is clipped at the right edge of the navy card;
- "Nine core tracks, the others…" is cut off at the bottom;
- the "A WORD FROM MITCH" header collides with the status bar and Dynamic Island.

My own simulator screenshots show the same oversized text, so the simulator was
carrying a large accessibility text size and the app does not hold up at it.
There is a `DynamicType.swift` in the iOS shell and an existing
`npm run audit:larger-text`, so some of this is already thought about — but the
front door is not surviving it. Not touched; say the word and it gets its own
pass.
