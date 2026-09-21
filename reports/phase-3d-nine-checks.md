# Phase 3d, part ten — merged, and the nine checks

*Sunday 20 September 2026, 17:25 CT. **PR #8 merged at 16:53 CT as `b2cdd64`.**
Production is serving the Two Ladders loop. Eight of nine checks pass. **Check 8
failed, and it found a real bug on the core mechanic** — §3.*

---

## 1. The merge

```
PR #8   MERGED  2026-09-20T21:53:33Z
main    b2cdd64  Merge pull request #8 from ryankelly77/phase-3-two-ladders
        67 files, +12,566 −939
```

Build confirmed live before any check ran, and confirmed **against a control**
rather than by assumption:

```
/service/Nonsense    -> 307   (the new dynamic route exists, redirecting to auth)
/zzz-not-a-route     -> 404   (control: middleware does NOT 307 everything)
```

The control matters. A 307 alone would have proved nothing — middleware could
have been intercepting every path. The 404 on a route that cannot exist is what
makes the 307 evidence.

---

## 2. The nine checks

| # | Check | Result |
|---|---|---|
| 1 | Three slots, mindset first | **passed** |
| 2 | The pick — Filters, 7.39 missed ROs | **passed** |
| 3 | Two-slot renders (Mitch), finishable | **passed** *(server-side — see note)* |
| 4 | Honest empty — Tracie gets `RooftopNotReady` | **passed** *(server-side — see note)* |
| 5 | The shelf — 12 films, no "Soon" | **passed** |
| 6 | Watch-ahead | **passed** *(both halves, and earlier than expected)* |
| 7 | Track entry not firing | **passed** |
| 8 | **A real day — swell 7 → 8** | **FAILED — swell went 7 → 1** |
| 9 | Rest card offers the rep, reveals three slots | **passed** |

**Note on 3 and 4:** verified by running the deployed code against production for
those accounts, not by logging in as them — I have Ryan's session, not theirs.
Same evidence class as before the merge, and I am not calling it more than it is.
Checks 1, 2, 5, 6, 8 and 9 were done in the browser as a person.

### 1, 2 and 9 — the ritual, in the browser

Today is a **rest day** for Ryan (`works_sun=false`), so the rest card came
first, exactly as predicted:

> **Scheduled day off** · *Your streak is safe* · "Today isn't one of your work
> days. Nothing is owed — skipping today costs you nothing."
> **[ Take today's rep anyway ]** — *It counts in full: Sand Dollars, Swell and all.*

Taking the rep revealed a **four-step bar** and the three slots in order:

| Step | Screen | Matches the derivation? |
|---|---|---|
| 1 | **Confidence** — mindset | yes |
| 2 | **On the Drive**, eyebrow **FILTERS** — pitch | yes, Filters 1/8 |
| 3 | **The Tire Maintenance Ladder**, *Walk Around · 28 of 56* — item | yes |
| 4 | Close — *"A fresh swell begins"*, +10 Sand Dollars, then the quote | Ruling 6: the quote is the close, not a slot |

**Mindset is first. Check 9's second half is the same screenshot as check 1.**

### 5 — the shelf

`/service/Belts & Cooling`:

```
Belts & Cooling
0 of 12 films · 439 cues
PITCH FILMS
 1 On the Drive 4:08   2 At the Kiosk 1:01   3 MPI Setup 2:14   4 After-MPI 3:30
 5 On the Drive 5:20   6 At the Kiosk 1:07   7 MPI Setup 3:32   8 After-MPI 3:46
 9 On the Drive 5:34  10 At the Kiosk 1:15  11 MPI Setup 1:48  12 After-MPI 5:08
COACHING CUES 439
```

**Twelve films, 439 cues, no "Soon" anywhere on the page.** The contradiction
that opened 3c is closed on the screen it was reported from.

### 6 — watch-ahead, both halves, without waiting for Monday

I expected to confirm this Monday. Both halves resolved today:

- **The loop half.** After the completion consumed Filters film 1,
  `pickPitch` against production returns **"At the Kiosk", position 2/8**. The
  watched film does not come back.
- **The shelf half.** `/service/Filters` reads **"1 of 8 films"**, film 1
  carries a check, and **film 2 is the highlighted next** — the same film
  `pickPitch` returned. *The card and the loop agree by construction*, which was
  3c's whole objective.

**And the 3c errored-watch fix is confirmed live.** Playing film 3 from the shelf
errored in this browser; it wrote **no `watch_gate` row and no
`content_progress` row**, and the shelf still reads 1 of 8. Non-vacuous: the same
error path *did* fire gates inside the loop, by design — so this is the shelf
refusing to credit a failure, not errors going unrecorded everywhere.

### 7 — track entry

```
daily_completion.morning_kind      = "normal"        (never "track_entry")
advisor_track_entry                 = 1 row written
  certification_id  7f738423 (Walk Around)
  film_content_id   null
```

**Ruling 2 of 3b, working exactly as specified:** the entry is *always recorded*;
the gate only appears when a film exists, and no core certification has one. The
row was written and the morning stayed normal.

---

## 3. Check 8 failed, and the failure is the finding

**Ryan's swell went 7 → 1.**

```
before   current_len 7   longest_len 9   last_completed_on 2026-09-15
after    current_len 1   longest_len 9   last_completed_on 2026-09-20
```

The completion itself is **correct in every field**:

```
completion_date 2026-09-20   morning_kind "normal"
video/pitch/item/quote content ids  all set
entered_certification_id            set
content_progress  2 rows, source = "loop"
advisor_pool_seen mindset + quote, cycle 1
```

### The reset is right. The card was wrong.

Ryan last completed **Tuesday 15 September**. His schedule is Mon–Fri. Since
then:

```
2026-09-16 Wed  MISSED     no closure, no island time
2026-09-17 Thu  MISSED
2026-09-18 Fri  MISSED
```

**Three missed scheduled work days.** The streak was already gone. The engine did
the right thing, and the close screen said so gracefully — *"A fresh swell
begins · Day 1 · Your best is 9 — yesterday's you is the one to beat."*

**But before I completed anything, the app told me this:**

> *Your streak is safe*
> **Day 7 holds today. Three minutes on Monday makes it Day 8.**

and the header badge read **7**.

**All of that was false.** Not stale by a little — the 7 had been dead since
Friday, and the card turned it into a *promise about Monday* that the engine was
guaranteed to break.

### Why

`app/(app)/today/page.tsx:314`

```ts
const currentStreak = Number(swellRow?.current_len ?? 0);
```

A straight read of a stored value. Nothing evaluates "has this streak already
lapsed?" on read — and `lib/gamification/streak.ts:196` says so out loud:

> `@param streak  swell.current_len — never recomputed here.`

`swell.current_len` is a **write-time** number, updated only by `completeDay`.
Between a lapse and the next completion, **every surface shows a streak that is
already dead**: the rest card, the header badge (`layout.tsx:103`), the streak
chip.

> **This is the phase's own rule, on the core mechanic: a label checked against
> nothing.** And it is the one class of bug 460 assertions cannot catch, because
> every one of them completes a day — which is the operation that makes the
> number true again. It took running the thing as a person, once, on an account
> with a real lapse.

**Not caused by this deploy.** `swell`, `completeDay`'s streak path and the rest
card are untouched by PR #8 — `test:streak` 112/0 and no diff on any streak line.
Pre-existing, and surfaced by check 8 doing exactly what it was for.

**Nothing was destroyed.** `longest_len` is still 9, and the same reset would
have happened on Ryan's next completion whenever it came. What changed is that
we now know.

### Where it goes

I am not going to slot this myself — it competes with the stamp, and you have
ruled that order twice. What it has that the others do not: **it is
unconditional** (no transient failure required — it is true for anyone who
lapses), **it is on the streak**, and **it makes an explicit promise** rather
than merely showing a wrong number. What it lacks: it does not trap anyone; the
next completion corrects it.

The fix is small — evaluate the lapse on read, from the same
`countMissedWorkDays` the engine already uses, or have the rest card stop
promising a number it has not verified.

---

## 4. A tenth instance, in my own harness, and it is also in the product

My first post-merge run reported **mindset and pitch both absent for every
advisor** — a catastrophic-looking regression. It was my harness: I had exported
only the Supabase variables, so `MUX_SIGNING_KEY_ID` / `_PRIVATE` were missing,
`shapeVideo` could not sign a playback URL, and it **returned null**. The item
slot survived because it is a text cue.

I nearly filed that as a failed deploy.

**But the product does the same thing.** `pickMindset` ends:

```ts
const shaped = await shapeVideo(client, draw.item, userId, today);
return shaped ? { video: shaped, cycle: draw.cycle } : null;
```

A signing failure is indistinguishable from an empty pool. **If the Mux signing
credentials were ever rotated or unset in production, every advisor would get a
two-slot morning — or no morning at all — with no error anywhere.** Same shape as
the ninth instance, one layer down, and it belongs on the follow-up list.

---

## 5. PR #7 — read, recorded, closed

Closed as superseded, with a comment on the PR explaining the version-prefix
collision so nobody reopens it.

**Is there anything in it 0125 does not cover? One thing: a precedence ruling.**

When a row carries both an explicit `service_family` and an `op_code` resolving
to a **different** family:

| | Behaviour |
|---|---|
| PR #7 — `coalesce(service_family, resolved)` | **Explicit wins.** One family. |
| 0125 — `UNION` | **Both.** The row appears on both shelves. |
| 0117 `my_certification_progress` | **Both** (`OR` + `distinct`) — 0125 matches what already shipped |

**Measured on production: 714 published rows carry both, and all 714 agree. Zero
disagreements.** The two implementations return identical answers today, so
nothing is broken and no 0126 is urgent. But only PR #7 had *decided* what
happens when that stops being true, and 0125's answer is emergent rather than
ruled.

Also carried forward: PR #7's `comment on column content.service_family` marking
it SUPERSEDED (0125 left no marker), and its `security_invoker` `content_service`
shape, which is the better starting point if `lib/service-family.ts:132` is ever
rewritten.

**All of it is recorded as F5 in `PHASE_3_PLAN.md`.** Nothing was discarded.

---

## 6. The follow-up list, before 1 October

Unchanged in order, with two additions from today:

1. **The stamp and the two date fallbacks**, together.
2. **F3** — the "whose book is this" disclosure, invisible to the advisor role.
3. **The stale streak** *(new — §3)*. Your call where it lands; my argument for
   moving it up is that it is unconditional and it makes a promise.
4. `lib/entitlements.ts`
5. `lib/service-family.ts:132` — unordered `.range(` **and** the swallowed break.
6. **`shapeVideo` returning null on a signing failure** *(new — §4)*.

`/verify` before February. **F2 still outranks all of it operationally** —
provision-and-remap as one act, or Tracie trades an honest blocked state for a
silent wrong one.

`AGENTS.md` now names the role-gate sub-pattern with all three instances, merged
in #8.

---

## 7. State

```
$ git log --oneline -1
b2cdd64 Merge pull request #8 from ryankelly77/phase-3-two-ladders

$ git status -sb
## main...origin/main
 M .gitignore
?? data/File.png

$ gh pr list --state all --limit 3
#8 MERGED   Phase 3 — The Two Ladders
#7 CLOSED   One resolved service family, everywhere  (superseded, F5)
#6 MERGED   The importer reads the header instead of remembering it
```

No ahead count. Nothing committed since the merge — this report is uncommitted,
as is the standing posture. `.gitignore` (Drop Zone scope) and `data/File.png`
remain the deliberate exclusions on your disk.

**Production now serves the Two Ladders loop to three advisors at Doggett.**
3e next.
