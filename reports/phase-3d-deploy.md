# Phase 3d, part seven — the deploy

*20 September 2026, 04:40 UTC (19 Sept, 23:40 CT). Three rulings answered, the
tree validated, the before state recorded, and **PR #8 open against `main`
awaiting your merge — which is the deploy.** Recommendation: merge in the
morning, not tonight — §6.*

---

## 1. Ruling 1 — does the card show the gap?

**Yes. It shows it as two percentages, not as missed ROs.** `FocusFamilyCard.tsx`
renders, under the family name:

> Your {family} attach is **{rate}%** — the store averages **{storeAvg}%**.

Measured against production, this is what the two derived advisors would read:

| Advisor | The card's reason line | Gap |
|---|---|---|
| Ryan Kelly | *"Your **Filters** attach is **14.3%** — the store averages **35.4%**."* | 21.1pp over 35 ROs |
| Demo Advisor | *"Your **Belts & Cooling** attach is **4.3%** — the store averages **5.0%**."* | **0.7pp over 23 ROs** |

**So nobody is misled by a number.** An advisor reading "4.3% versus 5.0%" can
see for themselves that the difference is nothing. It degrades to **merely odd**,
as you put it, not dishonest — the lower urgency.

Two qualifications, because the answer is not unconditional:

- **The headline still asserts remediation.** The family is a 3xl headline under
  the eyebrow *"What you're working"*, with a progress bar. The confident framing
  sits above quiet evidence that contradicts it. Nothing lies; the emphasis is
  simply wrong.
- **The numbers are conditional on `rate != null && storeAvg != null`** — they
  render only while the pick still names the same family the assignment locked.
  When it does not, the card shows **the family name and nothing else**, which is
  your "different urgency" case. It is not the state either derived advisor is in
  today, but it is reachable.

**The Demo account's seeded gap is data, and I have not touched it** — it is
outside this phase and it is the fix. For the record, seeding must move the
*attach rate*, not the RO count: the account already clears the 20-RO floor at 23.

---

## 2. Ruling 2 — can the UTC fallback stamp a `daily_completion` or a streak?

**Neither branch you offered. It cannot write a wrong date — but it can stop an
advisor closing a day they actually did, for five hours every evening.** Here is
the trace.

### It cannot corrupt the record

`completeDay` is the only writer of `daily_completion` and the swell, and it is
the one path in the codebase that does this correctly:

```ts
if (todayError) throw new CompleteDayError(todayError.message, "rooftop_today");
```

It **throws** rather than falling back, and at line 217 it verifies the signed
day stamp against that same date:

```ts
const stampCheck = readDayStamp(content.dayStamp, userId, today);
```

So a UTC date can never reach `completion_date` and never reach the streak.
**Certification is not the exposure either** — `certification-server.ts:59` is
real but it is a February problem, as you said.

### What it can do instead

`app/(app)/today/page.tsx:116` reads `rooftop_today` **with the error swallowed**
and falls back to `new Date().toISOString().slice(0,10)` — **UTC**. That date
mints the day stamp.

Doggett is `America/Chicago`. Between **19:00 and midnight Central**, UTC has
already rolled over. So on a transient `rooftop_today` failure in that window:

1. `/today` mints a stamp dated **tomorrow**.
2. The advisor does their morning against it.
3. `completeDay` computes the **correct** date (it throws rather than guessing).
4. `readDayStamp` rejects the stamp → **`"Could not verify today's screen
   (…). Reload the day and try again."`**
5. Reloading re-mints the same wrong stamp for as long as the RPC keeps failing.

**The habit mechanic breaks by refusal, not corruption** — and the error message
tells the advisor to do the one thing that cannot help. It fires at **7pm, not
midnight**, and only on an evening shift.

### And there are two different fallbacks in the same flow

| Path | Fallback |
|---|---|
| `app/(app)/today/page.tsx:119` | `new Date().toISOString()` → **UTC** |
| `app/(app)/daily/actions.ts:163, 229` | `storeToday()` → **America/Chicago** |

`storeToday()` hard-codes Chicago, so it is right for Doggett **by luck** and
wrong for any rooftop that is not Central. The two disagree with each other.

> **My read on your ordering rule:** you said if it can stamp a completion or a
> streak it jumps to first. It cannot. But "blocks the close for five hours a
> night" is the habit mechanic breaking by another route, and it fires *this
> week* on the same evidence. **I would still put `entitlements.ts` first** —
> it fires all day, not just evenings — and this second, ahead of `/verify`.
> The ranking is yours; I am flagging that the third option you did not list is
> the one that is true.

Also worth noting: there are **16** `new Date().toISOString().slice(0,10)`
fallbacks across `lib/` and `app/`, including `/streak/page.tsx:66` and
`app/(app)/layout.tsx:136`, which can make the streak *display* a day off even
when the record is right.

**Not fixed.** Follow-up deploy, as ruled.

---

## 3. Ruling 3 — the `.range(` sweep

Every `.range(` in `lib/`, `app/`, `components/` and `scripts/`, checked for an
`.order(` in the same chain. **40 call sites; 12 unordered.**

### Application code — 8, reported, not fixed

| Site | Rows it pages | What an unstable page does |
|---|---|---|
| **`lib/service-family.ts:132`** | **`service_family_content`, 2,321** | **This one is in today's deploy.** Family resolution pages in 1000s with no order — a multi-family call can drop or duplicate mappings, so a film silently vanishes from a shelf or a cue is counted twice. |
| `lib/library.ts:94, 156, 214, 248` | `content` | Library pages repeat or skip rows on scroll. |
| `lib/economy/audit.ts:91` | ledger | An audit total that does not reconcile. |
| `lib/mapping/dealer-codes.ts:43` | dealer codes | A code missing from the admin list. |
| `app/(app)/admin/content/service/[service]/page.tsx:91` | content | Same, admin-side. |

`service-family.ts:132` is the one I would take first, and it is the **same
function** as the ninth instance — the swallowed `break` on line 133 and the
unordered `.range(` on line 132 are adjacent lines in the same loop. *(Belts &
Cooling is 890 rows, under one page, which is why the deploy check below still
reads a clean 12.)*

### Suites — nothing to fix, and I am not inventing work

**No acceptance suite pages unordered.** The four unordered scripts
(`certification-punch-list`, `propose-twins`, `seed-closure-proposals`,
`sync-mux-titles`) are **tools and backfills, not assertion suites** — 0–1
assert-like lines between them, no `ok()`/`nonVacuous()` harness. An unstable
count there produces a wrong report, not a false pass.

I also checked the one suite that reads the new view: `brakes-acceptance.ts:191`
has no `.range(` and its assertions are existence-based (`rows.length > 0`,
`some(via === "op_code")`), so the 1000-row cap cannot manufacture a pass.

**The tenth instance is real and the sweep was worth running — but the fix you
authorised has no target.** Saying so beats editing four scripts to look busy.

---

## 4. Before the deploy — recorded

Production, 19 September 2026, store date `2026-09-19`, **old five-step loop
still serving**. Every `daily_completion` below has `morning_kind = null` — the
signature of the old loop, and the contrast for the after table.

| | Ryan Kelly | Demo Advisor | Mitch Hardt | Tracie Mendoza |
|---|---|---|---|---|
| Rooftop | Doggett CDJR | Doggett CDJR | Doggett CDJR | Doggett Honda Med Center |
| **Swell (current / longest)** | **7 / 9** | **1 / 1** | **6 / 6** | **0 / 0** |
| Last completed | 2026-09-15 | 2026-09-02 | 2026-09-16 | — |
| Completed today | no | no | no | no |
| `morning_kind` on every past row | **null** | *(none)* | **null** | *(none)* |
| Focus assignment *(written, unread)* | Filters, 7.39, $151.39, shelf 8 | Belts & Cooling, 0.16, $93.50, shelf 12 | none *(floor)* | none |
| Open `coaching_block` | Belts & Cooling since 09-11 | Filters since 09-02 | none | none |

```
core certifications: 8,  with an entry film: 0      advisor_track_entry rows: 0
Belts & Cooling: 890 mappings, 451 distinct,  family_pitch_supply film_count: 12
```

**The three swells are the thing that must survive.** 7, 1 and 6.

---

## 5. What to watch — the three predictions, now as queries

You asked whether each prediction has a **detectable signature**. All three do,
all three are one query, and I ran them to establish a baseline.

### Signature 1 — entitlement reads as an empty library

*Rooftops with ≥1 active advisor where `rooftop_has_product(_, 'advisor_base')` is false.*

```
ALARM  Doggett Honda Med Center          advisors=1  advisor_base=false
  ok   Doggett Chrysler Dodge Jeep Ram   advisors=3  advisor_base=true
>> SIGNATURE 1 = 1
```

**Baseline 1, and it is Tracie.** This is the alarm firing correctly on a known
state, which is also the proof it is not vacuous. It must go to **0** before
1 October, and that is the provisioning decision with Mitch, not code.

### Signature 2 — a family derived from too little volume

*Active derived assignments whose operator's latest-period `advisor_ros` <
`min_ros_for_coaching()` (= 20).*

```
  ok   Ryan Kelly      Filters          ros=35  missed=7.39
  ok   Demo Advisor    Belts & Cooling  ros=23  missed=0.16
>> SIGNATURE 2 = 0
```

**Baseline 0 — the floor working.** Non-vacuity is on the record from part four:
before 0124's floor this returned Mitch Hardt, and 37 derivations became 29.
A non-zero here means the floor has been bypassed or the DMS period moved.

### Signature 3 — the DMS operator link

*Each active advisor's `membership.op_code_id`, checked twice: is it a real
operator at that rooftop, and did it appear in the latest period?*

```
      advisor          rooftop                     op      real?  latest-period?
ALARM Tracie Mendoza   Doggett Honda Med Center    626     yes    NO
  ok  Ryan Kelly       Doggett CDJR                35122   yes    yes
  ok  Demo Advisor     Doggett CDJR                400025  yes    yes
  ok  Mitch Hardt      Doggett CDJR                671     yes    yes
>> SIGNATURE 3 = 1
```

**Baseline 1, and it is Tracie again** — exactly the shape predicted: op 626 is
a real operator with history but nothing in the latest period, so she resolves to
nothing with no indication why.

> **The two alarms are the same person.** Tracie Mendoza is simultaneously
> unentitled and unresolvable, and she is a third of the launch cohort. Both
> clear the same way — provisioning Doggett Honda Med Center and confirming her
> operator id — and neither is code.

`signatures.mjs` is read-only and takes about twenty seconds. It belongs in the
repo as a pre-launch check; I have not added it, as that is new scope.

---

## 6. The deploy — branched, pushed, PR open, awaiting your merge

### → **https://github.com/ryankelly77/ediagd/pull/8**

`phase-3-two-ladders → main`, **67 files, +12,566 −939, MERGEABLE.**
Not merged. **The merge is yours and it is the deploy.**

**The tree is ready.** Validated at the moment of writing:

```
accept:loop            77 passed, 0 failed     test:streak           112 passed, 0 failed
accept:family          34 passed, 0 failed     test:watch             67 passed, 0 failed
accept:focus-family    43 passed, 0 failed     test:day-ticket        35 passed, 0 failed
test:certification     70 passed, 0 failed     test:rest-day          22 passed, 0 failed
                                               ---------------------------------------
tsc --noEmit           clean                   460 assertions, 0 failed
eslint                 0 errors (9 pre-existing warnings)
next build             ✓ Compiled successfully in 4.3s
```

### What stopped, and why it was worth stopping

This project deploys from git — `README.md:13` says Vercel, there is no
`.vercel/` link, no CLI, and the two workflows in `.github/` do not deploy. So
there is no path from a working tree to production that does not pass through
`main`, and the standing rule said **"Do not commit."**

Rather than pick the reading that suited me, I stopped. Your ruling: the rule
was always about **the gate, not the commit object** — a branch is not
production, the PR is the review artifact, the merge is yours.

**That is now written into `AGENTS.md` in this PR**, so it costs nobody a second
round trip:

> ## "Do not commit" means nothing reaches `main` without Ryan
>
> - **You may** commit to a working branch and push that branch.
> - **You may** open a pull request against `main`.
> - **You may not** commit to `main`, merge your own PR, or route around a merge
>   that is refused.
>
> **This matters more than it looks, because `main` *is* the deploy.** Vercel
> builds on merge, so a commit to `main` deploys itself before anyone has read
> it. For the same reason there is **one deploy path and it is `main`**: do not
> link the Vercel CLI or deploy a working tree. A second path means git-deploy
> and CLI-deploy can disagree about what is live, and nobody finds out until
> they do — which is this file's other standing rule wearing an infrastructure
> costume.

### What went in, and what did not

**67 files.** Three migrations, the loop and family code, the new routes and
components, the four suites, and `reports/phase-3a` → `3d`.

| Excluded | Why |
|---|---|
| **`.gitignore`** | Adds `data/*.MOV`/`.mov`/`.mp4`. Real repo hygiene, but it is Drop Zone scope, not Phase 3, and I could not justify it in the PR description. **Left in your working tree, unstaged** — it is a one-line PR of its own. |
| **`data/File.png`** | A stray image, untracked before this phase began. Not part of the work. |
| **`.claude/`** | Workspace, not work. Confirmed **0 tracked files** — it was never staged. |

| Kept, with the justification | |
|---|---|
| **`package.json`** | Adds exactly four scripts — `accept:loop`, `accept:family`, `accept:focus-family`, `fixture:loop`. The 460 assertions do not run without them. |
| **`AGENTS.md`** | The standing rules this phase established, plus the merge rule above. Points at `TWO_LADDERS.md` and `PHASE_3_PLAN.md`, both in this PR. |
| **`reports/`** | Your call and the right one — including the two reversals, which the diff alone would not show. |

*(I briefly reverted `.gitignore` in your working tree while removing it from the
commit, which would have destroyed a local change that predates this phase. Put
back and verified on disk. Excluding something from a commit is not the same
operation as undoing it.)*

### Pick the hour — and it should not be now

It is **23:35 CT**. Your own ruling says merge when the checks can be run
immediately afterwards, not last thing at night, and I would hold to that:
**merge in the morning.**

The checks below are short but the last one — completing a real day as Ryan —
writes a `daily_completion` and moves a live swell from **7 to 8**. If it goes
wrong at midnight it is wrong in production overnight, and the store date rolls
at 00:00 Central, which would put the repair on a different day from the
breakage. There is no deadline tonight; 1 October is eleven days out.

---

## 7. After the merge — ready to run

Not yet run. **Everything below is pending your merge.**

| Check | Passes when | Status |
|---|---|---|
| Three slots | Ryan's morning serves mindset → pitch → item, mindset first | ⏳ |
| The pick | Filters, 7.39 missed ROs, matching the derivation | ⏳ |
| Two-slot renders | Mitch's morning is complete and finishable | ⏳ |
| Honest empty | Tracie gets `RooftopNotReady`, not a stall | ⏳ |
| The shelf | Belts & Cooling lists 12 films; no "Soon" | ⏳ |
| Watch-ahead | A film watched on the shelf does not return in tomorrow's loop | ⏳ |
| Track entry | Not firing — morning kind is never `track_entry` | ⏳ |
| **A real day, as a person** | **Ryan's swell goes 7 → 8** | ⏳ |

That last row is the one that matters. Every green number in this phase came
from a query or a suite; **not one of them came from a person finishing a
morning.** Six of the nine silent failures found in this phase were in code that
was passing its own tests at the time.

---

## Out of scope, untouched

The Good News Story (3e, awaiting stable deploy), the thin-gap redesign (after
1 October), application-side swallowed errors and paging (follow-up deploy),
F1's coaching blocks. The Demo account's seeded gap is data and is not mine.

```
$ git status -sb
## phase-3-two-ladders...origin/phase-3-two-ladders
 M .gitignore
 M reports/phase-3d-deploy.md
?? data/File.png

$ gh pr view 8 --json state,changedFiles,mergeable
PR #8  OPEN  phase-3-two-ladders -> main  files 67  +12566 -939  MERGEABLE
```

**No ahead count** — the branch is pushed, so it is level with its remote.
**Nothing on `main`.** `backups/` is gitignored.

The two remaining working-tree entries are the deliberate exclusions from §6:
`.gitignore` (Drop Zone scope) and `data/File.png` (a stray). Both stay on your
disk, neither is in the PR.

*(I first wrote this block from an earlier run and a guess at how git would
render it, and it was wrong in two places — `family-acceptance.ts` was still
untracked, and `reports/` was listed per-file rather than collapsed. Re-read
from the actual command both times. A transcript pasted from memory is the same
class of error as everything else in this phase.)*
