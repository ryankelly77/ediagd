# Phase 3d, part nine — the two answers, before the merge

*Sunday 20 September 2026, 09:05 CT. **PR #8 is open, mergeable, and not merged
— that is yours.** Both blocking rulings are answered below. Ruling 1 requires
no fix, so the merge can proceed as planned.*

---

## Ruling 1 — the UTC fallback is **pre-existing**. Merge as planned.

**Answer: it is already live, byte-identical, and this PR does not touch it.**

```
main    (b6e5c47)  app/(app)/today/page.tsx:86
PR #8   (7d4d31d)  app/(app)/today/page.tsx:119

  const today = (todayRaw as IsoDate | null) ?? new Date().toISOString().slice(0, 10);
```

Same line. It moved down 33 lines because the provisioning check was inserted
above it; the text is unchanged.

I checked the whole trap, not just the line, because "the line didn't change"
would not have been enough — every component has to be pre-existing for the
conclusion to hold:

| Component of the trap | On `main` | In PR #8 |
|---|---|---|
| UTC fallback minting the stamp | `today/page.tsx:86` | identical, line 119 |
| `completeDay` throws on `rooftop_today` error | line 119 | unchanged |
| `readDayStamp` checks the stamp against the rooftop's date | line 173 | unchanged |
| `daily/actions.ts` → `storeToday()` (Chicago) | 2 occurrences | **2, unchanged** |

`git diff b6e5c47 HEAD` shows **no `+`/`-` line touching any date or stamp
path** in `completeDay.ts` or `daily/actions.ts`.

> **So the trap fires on production tonight whether or not you merge.** This PR
> neither introduces it nor widens it. Your rule applies as written: ship the
> tested tree, fix it in the follow-up. **It goes first in that follow-up**, per
> your Ruling 2 — which I accept, and the deciding argument is yours: *the 7pm
> notification drives advisors into the window where the bug fires, and a reload
> re-mints the same bad stamp.* Recoverability is the right line. I had ranked
> on blast radius and that was the weaker test.

### One genuine, transient artifact of *this* merge — recoverable, and it argues for a quiet hour

`completeDay.ts` carries this, written during 3b:

> *A stamp minted by the PREVIOUS deploy fails here on length, because 0124
> appended six keys. That is the intended behaviour and it costs one reload to
> anybody holding a page open across the deploy.*

So anyone holding an open `/today` from before the merge who submits after it
gets **"Could not verify today's screen. Reload the day and try again."** One
reload fixes it — unlike the UTC trap, this one does let go. It is a real
user-visible consequence of merging, it is by design, and it is an argument for
merging at the lowest-traffic hour of the week, which is now.

*(This is the stale-page refusal I predicted for the 0124 push and then
withdrew when the `UPDATE` was dropped. It was wrong about the migration and
right about the code deploy. Withdrawing it entirely was an over-correction.)*

---

## Ruling 0 — today **is** a rest day for three of four. **All eight checks still run.**

**Answer: `day_off`, and it does not block anything.**

### The rest-day status, measured

`rooftop_closed_day` is **empty** for both rooftops today — this is not a store
closure. It is each advisor's own `work_schedule`:

| Advisor | `works_sun` | Rest day today? | Why |
|---|---|---|---|
| Ryan Kelly | **false** | **yes — `day_off`** | own schedule |
| Demo Advisor | **false** | **yes — `day_off`** | own schedule |
| Mitch Hardt | **false** | **yes — `day_off`** | own schedule |
| Tracie Mendoza | *no schedule row* | **no** | `restDayFor` returns null with no schedule |

### But a rest day assembles the whole morning and offers it anyway

I was about to report the completion check as *unable to run*. That would have
been wrong, and it is the exact shape you warned about — `restDayFor` returning
`day_off` is a **label**, not evidence of what the screen does.

`app/(app)/today/page.tsx:482`:

> *A rest day opens as a card, not a ritual. The whole day is still assembled
> above and handed down — the quote, the video, the stamp — so **"Take today's
> rep anyway" reveals it without a second round trip, and the voluntary
> completion is byte-for-byte the one a Tuesday would have written.***

`assembleMorning` runs at line 397 regardless of `restDay`. The three slots, the
stamp and the swell write are all identical on a Sunday.

**And the data proves it rather than the comment claiming it:**

```
Ryan Kelly   completed 2026-09-06  (Sunday — works_sun=false)
Mitch Hardt  completed 09-16, 09-09, 09-08, 09-02, 09-01, 08-31
             — every one on a weekday his schedule marks false
```

Advisors already take the rep on rest days routinely. **The swell 7 → 8 check is
live today**, behind one extra tap.

### So: all eight run today, and the rest card adds a ninth thing to look at

| # | Check | Today |
|---|---|---|
| 1 | Three slots, mindset first | **live** (via "Take today's rep anyway") |
| 2 | The pick — Filters, 7.39 | **live** |
| 3 | Two-slot renders (Mitch) | **live** |
| 4 | Honest empty (Tracie) | **live** — she has no schedule, so no rest card either way |
| 5 | The shelf — 12 films, no "Soon" | **live** — `/service` is not the ritual |
| 6 | Watch-ahead | **partial today, confirms Monday** — I can watch on the shelf and verify the exclusion, but "does not return in *tomorrow's* loop" is Monday's observation |
| 7 | Track entry not firing | **live** |
| 8 | **A real day — swell 7 → 8** | **live** |
| **9** | **The rest card offers the rep, and what it reveals is the three-slot morning** | **new, and only observable today** |

Check 9 exists only because today is a rest day. It is worth having: the rest
card is the only surface that renders the new morning *without* being the
morning, and nothing in 460 assertions covers it.

**Nothing waits for Monday except the second half of check 6.**

### One data finding, not mine to fix

**Mitch Hardt's `work_schedule` has every weekday false** — `works_mon` through
`works_fri` all `false`, `saturday_mode=alternating`, set 2026-09-01. He is
scheduled for alternating Saturdays and nothing else, so he sees a rest card six
days a week, and all six of his completions are "take the rep anyway". Either
the schedule is wrong or he is genuinely Saturday-only. It is data, it is
Ryan's, and it does not block anything.

---

## Ruling 5 — the two Tracie answers, and the second is worse than reported

### Does alarm 1 clear with provisioning alone? **Yes.**

```
rooftop_product rows for Doggett Honda Med Center:  NONE — no product at all
```

Not a missing `advisor_base` among others — the rooftop has **no product row of
any kind**. Granting `advisor_base` clears signature 1 and `RooftopNotReady`
stops rendering. One act, and it is the Doggett conversation.

### Is the DMS resolution a separate act? **Yes — and provisioning alone makes it worse.**

```
membership.op_code_id = 626
dms_advisor 626       = "Nguyen, Thomas (626)"   last_seen 2026-01-21
op 626 in the last six monthly periods: absent from all six
```

**Tracie's account is pointed at a different person's operator id**, and that
person has not appeared in the data since January.

> **The ordering matters and it is the thing to carry into the Doggett
> conversation.** Today Tracie is stopped at an honest screen that says her
> rooftop is not set up. **Provision her rooftop and nothing else, and she walks
> through that screen into a loop deriving from Thomas Nguyen's dormant book** —
> which, because 626 has no recent rows, resolves to nothing and gives her a
> permanent two-slot morning with no error anywhere.
>
> She would go from *correctly told nothing is ready* to *silently given a
> diminished product*. **Provision and re-map together, or neither.**

That is prediction 3 from the preflight arriving exactly as written: *"a
confident morning derived from another advisor's numbers, or an empty one.
Neither errors."*

### And my own signature 3 was too weak — found by running it

Checking every account, not just Tracie:

| App account | op | DMS display name |
|---|---|---|
| Ryan Kelly | 35122 | **Esparza, David (35122)** |
| Demo Advisor | 400025 | **Hill, Teroneka (400025)** |
| Mitch Hardt | 671 | **Helton, Erin (671)** |
| Tracie Mendoza | 626 | **Nguyen, Thomas (626)** |

**All four point at somebody else's book.** For the first three that is almost
certainly deliberate — they are developer, demo and staff accounts borrowed onto
real operators so the app has data at all. I cannot prove intent from data, and
that is the point:

> **Signature 3 as I built it asks "is the op real and did it trade recently",
> and by that test three of these four pass.** It cannot tell a deliberate test
> mapping from a real mis-mapping. Before 1 October it needs a third column —
> an explicit "this mapping is intentional" mark, or a name comparison with the
> exceptions listed by hand. A detector that green-lights the exact shape it was
> built to catch is not a detector.

Found by running it rather than by writing it. Noted for the follow-up; not
changed today.

---

## Ruling 6 — acknowledged

Stage-level operations only. `git restore --staged` / `git reset <path>` — the
index is what a commit is made from, and it is the only thing that needs
touching. I reverted a worktree file to shape a commit and destroyed a local
change that predated this phase; restoring it does not make it fine. The
worktree is yours.

---

## The merge, and the eight checks

**PR #8 — https://github.com/ryankelly77/ediagd/pull/8 — `OPEN`, `MERGEABLE`,
67 files, +12,566 −939. Not merged.**

Both blocking rulings are answered and **Ruling 1 requires no fix**, so nothing
stands in the way. The window you named is now, and it is the right hour twice
over: lowest traffic of the week, and well clear of the 19:00–24:00 Central
band where the stamp trap fires.

**Status of the eight checks: not yet run — awaiting your merge.** None can be
marked `passed`, `failed` or `could not run` until production is serving the new
code. The before state they will be measured against is recorded in
`phase-3d-deploy.md` §4; the three that matter most:

```
Ryan Kelly   swell 7 (longest 9)   last completed 2026-09-15
Mitch Hardt  swell 6               last completed 2026-09-16
Demo Advisor swell 1               last completed 2026-09-02
```

Merge when you are at the desk and I will run all eight — plus check 9 — and
report each one marked, inside the hour.

```
$ git status -sb
## phase-3-two-ladders...origin/phase-3-two-ladders
 M .gitignore
?? data/File.png

$ gh pr view 8
PR #8  OPEN  phase-3-two-ladders -> main  files 67  +12566 -939  MERGEABLE
```

No ahead count. Nothing on `main`. The two working-tree entries are the
deliberate exclusions from `phase-3d-deploy.md` §6 — `.gitignore` (Drop Zone
scope) and `data/File.png` (a stray) — both left on your disk, neither in the PR.
