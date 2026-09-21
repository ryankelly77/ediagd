# Phase 3f — 0126 applied, #9 merged

*Sunday 20 September 2026, 20:25 CT. `0126_family_precedence.sql` is on
production and **PR #9 is merged as `b8cdc46`**. The stale streak is fixed on the
live site. **3e Piece A has not started — the spec is not in this conversation
or the repo, §5.***

---

## 1. 0126 — applied, and it did what it said

```
backups/pre-0126-schema.sql     505 KB
  verified before pushing: service_family_content present (12 refs)
                           the precedence line absent (0 matches)

supabase db push --linked
  {"migrations":["0126_family_precedence.sql"]}
```

| | Before | After |
|---|---|---|
| `service_family_content` rows | **2,321** | **1,607** |
| Belts & Cooling rows | 890 | **451** |
| Belts & Cooling **distinct content** | **451** | **451** — unchanged |
| `family_pitch_supply` film_count | 12 | **12** |
| `service_family_cue_count` | 439 | **439** |
| `my_certification_progress()` | 200 | **200** |
| `test:brakes` (production) | 12/0 | **12/0** |

**Not one piece of content changed family.** The 714 duplicate arms are gone and
nothing else moved — exactly the prediction from the read-only measurement.

The split is cleaner than I expected and worth recording, because it is the
whole argument for the precedence in one line:

```
Belts & Cooling by via:   { family_tag: 439,  op_code: 12 }
```

**The 439 cues carry the tag; the 12 films carry the op code.** The two paths
were never really in competition — they describe different kinds of content —
and the precedence simply stops a row being filed twice when it happens to have
both.

---

## 2. PR #9 — merged and live

```
PR #9   MERGED  2026-09-21T01:22:03Z
main    b8cdc46
```

`/streak` on production, through the new `loadScheduleContext` + `swellAsOf`
path: **Day 1 · The Swell begins · Longest 9 · Paddle Back Out 1 of 5.** Renders
clean, no error.

Ryan completed today, so Day 1 is the true answer and the `completedOnDate`
branch is what served it. The discriminating case — the Demo Advisor, who should
now read **0** instead of 1 — cannot be checked from here without their session;
it was verified read-only against production before the merge.

**Merged at 20:22 CT, inside the 19:00–24:00 stamp band.** Deliberate and safe:
nothing in this deploy touches the day stamp, and no day was completed to test
it. I did not run anything that writes a completion tonight.

---

## 3. The 7pm push — settled from both sides

You checked your phone: **Monday 2:01pm, Tuesday and Wednesday noon, nothing at
7pm.** That matches the database exactly. The complete delivery history, all to
your iPhone:

```
push_delivery — every APNs attempt that has ever succeeded
  09/10  5:00 PM   streak_last_call   (16:50 target, hourly cron)
  09/11 12:00 PM   streak_keeper
  09/14 12:00 PM   streak_keeper
  09/15 12:00 PM   streak_keeper
  09/16 12:00 PM   streak_keeper

live outbox_policy:  streak_keeper 12:00:00 enabled · streak_last_call 16:50:00 enabled
```

Everything before 10 September is `skipped — "v1: queued before a transport
existed; never delivered"`.

**Your recollection was of something real.** 0112's comment records it: *"This
used to fire at 19:00 and read 'Day {days} is on the line'"* — and records you
moving it. The 7pm push existed as a design; it was changed before any push was
ever delivered.

Two loose threads, neither worth chasing now, both recorded:

- **Monday's noon send showed at 2:01pm** — a two-hour gap between `sent_at` and
  arrival. `apns.ts` says streak nudges *"expire at the end of the hour rather
  than never"*, which a 2:01pm arrival from a noon send should not survive.
  Either the expiry is not doing what the comment claims, or the handset queued
  it locally. A label-versus-behaviour question on a small surface.
- **`/api/push/test` bypasses the outbox** and writes no `push_delivery` row, so
  a manual test send is invisible to every query above. Worth knowing before
  anyone reasons from these tables again.

**No change to notifications.** The gate was already correct.

---

## 4. `AGENTS.md` — the new discipline, merged

Rule two now closes with **"A defect you find is a class, not an instance"**,
with 0102 as the worked example:

> The bug was identified, understood, and correctly defended against — with
> `previous_scheduled_day()`, in the **notification layer only**. Twenty-four
> migrations later the screens were still reading the same number raw […]
>
> Nobody was careless. The fix went exactly where the bug was found. **What
> nobody did was ask who else reads `current_len`** — which is one `grep`, and
> would have found the answer two years earlier.
>
> **In practice:** when you fix something, write down the *question* the bug was
> an answer to […] and then answer it everywhere before you close the work. If
> the sweep is too large for the change in hand, say so and record the question;
> an unasked question is the thing that survives.

`PHASE_3_PLAN.md` gained **F6** for `admin-advisor-detail.ts:289` — recorded as a
proper fix with the bulk loader, not a patch, with your wording on why:

> A manager congratulating somebody on a stale streak is awkward. Telling
> somebody their live streak is dead is a wound. **Trading an over-report for an
> under-report is not a hotfix.**

---

## 5. 3e Piece A — I cannot start it, and this is the one thing I need

**The specification is not in this conversation, and it is not in the repo.**

- No message in this session has described 3e or broken it into pieces. The
  Good News Story has been named as out of scope in every prompt until now —
  *"3e. Still unapproved. No schema, no flag, no column."*
- `PHASE_3_PLAN.md` calls it **3d — Good News Story**, not 3e, and says only:
  *"Out of scope until Mitch approves the direction. Not blocked by code —
  blocked by a decision. Do not design schema for it speculatively."*
- **"Piece A" appears nowhere** in the repo. Neither does a warm-up question:
  `grep -rn "Piece A\|warm-up" --include=*.md .` returns nothing.

What I have is one sentence from your prompt:

> *Onboarding says what the credential rests on — showing up, passing the
> checks, writing what you did differently, your numbers moving. Before
> 1 October.*

That names four pillars and a deadline. It does not tell me what Piece A is, and
**it does not contain the warm-up question you asked me to answer.**

I am not going to invent a question and answer it. That is the exact failure
this fortnight has been about — a confident answer to something nobody asked —
and it would be a poor way to start the one piece of work with a launch date on
it.

**Send me Piece A and its warm-up question and I will answer it in the next
report without another round trip.** Everything else in this prompt is done.

Worth flagging while you write it: the plan says the Good News Story is *blocked
on Mitch's approval of the direction*, and `PHASE_3_PLAN.md` still lists that
approval as outstanding. If onboarding copy depends on that direction, Piece A
may be blocked on the same decision — or it may be deliberately the part that
is not. Your call, and it would help to say which in the prompt.

---

## 6. Verification

```
supabase migration list --linked     0126 -> 0126
test:brakes (production)             12 passed, 0 failed
test:streak                         127 passed, 0 failed
accept:family / loop / focus-family   34 / 77 / 43, 0 failed
db reset --local  0001 -> 0126        clean
tsc / eslint / build                  clean · 0 errors · Compiled successfully
```

```
$ git log --oneline -1
b8cdc46 Merge pull request #9 from ryankelly77/stale-streak

$ git status -sb
## main...origin/main
 M .gitignore
?? data/File.png
```

No ahead count. Nothing uncommitted but the two standing exclusions —
`.gitignore` (Drop Zone scope) and `data/File.png` (a stray). `backups/` is
gitignored.

**On the follow-up list, unchanged and unreordered:** the Mux signing swallow,
the stamp and the two date fallbacks, `lib/entitlements.ts`, F3, and
`lib/service-family.ts:132`. The stamp-versus-entitlements order is left open,
to be settled on the evidence when we reach them.
