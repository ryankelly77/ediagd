# Phase 3a — ground truth and the spine

*Read live from production on 2026-09-18. Nothing below is transcribed from an
earlier run. Query scripts are ephemeral; every number is reproducible from
`content`, `op_code_family`, `certification_course`, `module` and
`content_progress` over PostgREST.*

Architecture: `TWO_LADDERS.md`. Sequence: `PHASE_3_PLAN.md`.

---

## The six questions

### 1. Quotes

| | |
|---|---|
| rows `type='quote'` | 436 |
| live (`retired_at` null) | 393 |
| live **and** published | **393** |
| draft | 0 |
| retired | 43 |

**Do they carry `module_id`? No — zero of 393.** They also carry no `op_code`
(0) and no `service_family` (0). A quote is currently unattached to the
curriculum in every direction.

**Does `collection` group them? No — `collection` is null on all 393.** The
grouping that exists is `subcategory`, and it is not a filing system: 143 rows
have none, and the other 250 spread across **55 distinct values** which are
source labels rather than categories — `KOBE BRYANT — Mental Toughness / The
Redirect` (62), `WARREN BUFFETT — raw video list` (21), and a long tail of 1s
and 2s. Several are near-duplicates of each other (`KOBE BRYANT — Mental
Toughness / The Redirect` and `… / The Redirect Technique`; two spellings each
of the Valvano and Carpe Diem groups).

What they do carry: `quote_slot` (both 222 / slot3 113 / slot2 58), 39 distinct
voices, `coaching_nugget` on 392 of 393, `best_used_for` on 378.
`needs_translation` is true on 170.

> **For Mitch (open question 6 — are quotes module items?)** There is no
> existing filing to preserve. Making quotes module items is a green field, not
> a migration of something already organised. `subcategory` should not be
> carried into it.

### 2. Published films per service family

154 published, live films in total: Mindset 95, **Pitches by Op Code 52**,
Craft 6, Onboarding 1. All are `advisor_video`. **No published film is tagged
`service_family` directly** — the `op_code` → `op_code_family` bridge is the
only path, and all 52 pitch films resolve through it cleanly (0 unmapped
codes). None has an inherited op code.

| family | coachable | codes | **films** | stages |
|---|---|---|---|---|
| Belts & Cooling | yes | 6 | **12** | 4 |
| Fluids | yes | 5 | **12** | 4 |
| HVAC | yes | 7 | **10** | 4 |
| Filters | yes | 6 | **8** | 4 |
| Brake Service | yes | 7 | **4** | 4 |
| Differential | yes | 2 | **4** | 4 |
| Wipers | yes | 5 | **2** | 2 |
| Accessories | no | 1 | 0 | 0 |
| Alignment · Battery · EV & Hybrid · Fuel System · Inspections · Lighting · Oil Change · Spark Plugs · Suspension · Tires & Rotation | yes | 39 | **0** | 0 |
| Maintenance | no | 3 | 0 | 0 |

**12 of 19 families have zero published films. Ten of those are coachable.**
Only **14 op codes** have been filmed at all.

> **A week is the wrong cycle.** Supply runs 2 to 12. A fixed five-morning week
> repeats Wipers from Wednesday and never finishes Belts & Cooling. The cycle
> has to be supply-shaped. `film_count` is recorded on the assignment row for
> exactly this reason (see the spine, below).

**A second supply constraint, not in either document.** `STAGES` in
`lib/coaching-block.ts` has **six** stages (Pre-Write, On the Drive, At the
Kiosk, MPI Setup, After-MPI, Objections). The 52 films carry only **four** — MPI
Setup 12, On the Drive 13, At the Kiosk 14, After-MPI 12, plus one film with no
stage. Pre-Write and Objections have never been filmed against an op code.
Two of every six block days therefore cannot have a pitch film even in the four
best-stocked families.

### 3. Modules across the core eight with ≥1 attached video

**Zero — as expected, and the number is more complete than that.**

**Zero of all 249 modules** in the database have an attached published video.
1,696 content rows carry a `module_id`; 1,695 are cues and one is a video that
is not published. **No row in any module carries a `mux_playback_id` at all.**

Also worth Mitch's attention: of 41 courses, **34 are attached to no
certification**, and two of the core eight (**Lasting Impressions** and **CSI**)
have no course, so no modules and no items.

### 4. Runtime distribution

| shelf | n | median | p90 | max | ≤ 5:00 |
|---|---|---|---|---|---|
| **Mindset** | 95 | **1:00** | 1:36 | 2:07 | 100% |
| **Pitches by Op Code** | 52 | **3:43** | 5:14 | 5:34 | 81% |
| Craft | 6 | 3:26 | 4:10 | 5:03 | 83% |

**"Five minutes or less" survives two slots and does not survive three.** At the
medians, mindset (1:00) + pitch (3:43) = **4:43** before the item slot has been
opened at all. At p90 it is 1:36 + 5:14 = **6:50**, already over on two slots.
Ten of the 52 pitch films are themselves over five minutes.

The claim holds only if the item slot is a **text cue** on a normal morning,
which today it necessarily is — see question 3, there are no module videos. It
stops holding the day films are attached to modules.

Track-entry mornings are comfortable: mindset + one Craft film ≈ 1:00 + 3:26.

### 5. Item counts per module across the core eight

29 modules across 6 courses, **195 published live items** — all of them cues.
Per module: min 1, median 8, max 11, mean 6.7. **No module is empty.**

| core track | modules | items |
|---|---|---|
| Walk Around | 7 | **56** |
| Success Cycle | 7 | **55** |
| Power of Positive Language | 7 | **51** |
| Overcoming Objections | 5 | **29** |
| Setting up the MPI | 1 | 2 |
| Four Step Close | 2 | 2 |
| Lasting Impressions | 0 | 0 |
| CSI | 0 | 0 |

> **The prompt and `TWO_LADDERS.md` disagree here, and the document is right.**
> `PHASE_3_PLAN.md` §3a asks this question to validate "the ~25-mornings-per-track
> figure". No such figure appears in the duration math: `TWO_LADDERS.md`
> §Duration budget says the four finished tracks average **48**, and that the
> remaining four need **~33 apiece**. The live numbers confirm the document
> exactly — 195 total, 191 of them in the four finished tracks at 56/55/51/29.
> **25 is not a number this build rests on.** Flagging rather than picking, per
> AGENTS.md.

### 6. What the loop does today

Stated from the code: `app/(app)/today/page.tsx`, `lib/daily.ts`,
`lib/coaching-block.ts`, `components/daily/DailyFlow.tsx`.

There are **two screens**, decided before anything else runs. A
technician-**only** account returns early to `TechnicianDay` (one quote, one
`technician_video`, no streak, no block, no Sand Dollars). A mixed
advisor+technician account stays pure advisor. Everything below is the advisor
screen.

**Five steps, one of which is conditional:**

| step | what | selection |
|---|---|---|
| 1 | life quote | `pickQuoteForSlot(slot3)` |
| 2 | focus card: coaching cue **+** sales quote | four-rung ladder; `pickQuoteForSlot(slot2)` |
| 3 | pitch video — **skipped entirely when null** | `pickPitchVideo`, two rungs |
| 4 | lifestyle video | `pickLifestyleVideo`, Mindset/Craft alternating |
| 5 | celebration / completion | — |

**Every pool is a deterministic rotation on the epoch day. There is no
randomness, no cursor and no recency table anywhere in the loop.**
`rotationIndex(date, count, offset) = (epochDay + offset) % count`. Offsets are
used to keep pools off each other: cue 1, lifestyle 3, pitch 5, generic
passage 7.

- **Quotes (steps 1 and 2).** Pool is `type='quote' AND status='published' AND
  quote_slot IN (slot, 'both')`. The pool is laid out by `voiceDiverseOrder()` —
  a rearrangement greedy so no two neighbours share a voice, which makes "not
  the same voice two days running" hold by construction with no lookback. Slot 3
  draws first; slot 2 yields to it on collision, and both exclude the artifact
  the day's lifestyle film is a filming of. **This is the only repeat-avoidance
  in the system, and it is same-day only** — cross-day non-repeat is the
  rotation itself, one cycle per pool.
- **Coaching cue (step 2).** Four rungs, then an honest empty:
  `op_code+stage+tier` → `op_code+stage` → `op_code` → `family` → `none`. Rungs
  1–2 are dead (no cue carries a stage). Rung 3 is gated on the op code having
  at least `coaching_block_days` (6) published cues, else it falls to the family
  shelf. The 404-row generic pool is **not** on this ladder — it is reachable
  only when the advisor has no block at all. Which rung fired is written to
  `daily_completion.cue_match`. **Live: of 27 completions, 6 landed on `family`,
  2 on `op_code`, 19 recorded nothing (no block).**
- **Pitch video (step 3).** Requires a block with **both** an op code and a
  stage. Rung 1 is the deck's own film for that `(op_code, stage)`; rung 2 is a
  foundational film named by `mapping_alias kind='stage_fallback'`; otherwise
  null, the step is dropped from the day, and `pitch_video_skipped` is recorded.
  **Live: 5 skipped, 3 served, 19 not applicable.**
- **Lifestyle video (step 4).** `placement='daily_lifestyle'`, shelves
  alternating by epoch day with **empty shelves dropped before the alternation**
  so the index counts turns of a stocked shelf rather than raw days.
- **The block.** `ensureBlockForToday` runs under the **service role** — there
  is deliberately no user-facing insert policy, so an advisor cannot open a
  block on a family they are already good at. Family comes from Eddie's Pick;
  the op code rotates within the family on the block's start day; **`stage` is
  not stored, it is derived** from completions-in-block via `stageForIndex`, so
  a missed Tuesday meets Tuesday's stage on Wednesday. Blocks do not open from a
  part-month or on a rest day. Live: 3 blocks, 2 open.
- **The day is signed.** `mintDayStamp` seals the ids the page actually served;
  the client returns it untouched and `completeDay` writes what it verified.

**Three differences 3b will have to make deliberately:**

1. **The mindset film is currently LAST (step 4).** `TWO_LADDERS.md` puts it
   first. That is a reordering, not a new slot.
2. **The pitch is currently downstream of the coaching block**, which is a
   six-stage cursor over one op code. The Two Ladders pitch is downstream of a
   *focus family* assignment. These are two different locks on overlapping data;
   3b has to say which one owns the op code, or they will disagree.
3. **Slot 2 is a quote today**, not an item. The sales quote on the focus card
   has no equivalent in the three-slot model.

---

## The spine — `0123_two_ladders_spine.sql`

Written and validated; **not applied to production, and not committed.**

### What it adds

1. **`family_pitch_supply`** (view) — films, op codes, stages and caption state
   per family. The pitch slot's supply gate and the cycle-length input. Security
   invoker, so an advisor counts only films they may play.
2. **`advisor_focus_family`** — the locked assignment. One active row per
   advisor enforced by a partial unique index; history retained (`ended_on`,
   never deleted). Carries `source` (`derived`/`manager`/`default`), the
   `period_id` and `missed_ros`/`opportunity` the ranking used, and
   `film_count` at the moment of locking. Read policy mirrors
   `coaching_block_read`; **no user-facing write policy.**
3. **`derive_focus_family(user, rooftop, period)`** — ranks by missed RO volume
   among families with a film, and locks the top one. Definer, **granted to
   nobody**. Never overwrites a `manager` row.
4. **`set_focus_family_override(...)`** — the manager's ruling. Definer, granted
   to `authenticated`, and it *checks* the caller rather than trusting them.
5. **`content_progress.source`** — one column. See below.
6. **`advisor_track_entry`** + **`certification.entry_film_content_id`** — track
   entry state, and the empty column Mitch's ruling lands in.

### Three findings from building it

**A. The benchmark was invisible to the role that had to rank against it.**

Measured on a clean replay of 0001–0122, before anything new existed:

```
set local role service_role;
select has_performance_surface();              -> false
select count(*) from family_store_benchmark;   -> 0
select count(*) from advisor_family_attach_all -> 20906
```

0096 added `and (select has_performance_surface())` to
`family_store_benchmark` so a **technician** gets zero rows rather than an
error. That is right. But the predicate asks about `auth.uid()`, and the
service role has no JWT — so the gate written to exclude technicians also
excludes the application's own backend. **Every server-side read of the store
benchmark under the service key returns zero rows today**, silently, because an
empty benchmark is indistinguishable from a store with no history.

`derive_focus_family` reads that view and runs under the service role. It would
have returned null for every advisor, forever, while the migration applied
cleanly and `db reset` stayed green — the exact failure AGENTS.md documents for
`recompute_certification_content()`. 0123 §0 adds `bypasses_rls() or …`, which
is the idiom 0081 already uses in this position. **The three application readers
of this view (`lib/advisor-data.ts`, `/advisor`, `/manager`) all pass a user
JWT, so nothing a human sees changes**, and the suite asserts a technician still
gets nothing.

**B. The consumption record needed one column, not a new table.**

`content_progress` already does more of this job than the plan assumes. Live:
50 rows over 48 content rows — **cue 30, advisor_video 20**. It is *already
format-agnostic*, which is exactly what slot 3 asks for, and `unique (user_id,
content_id)` is already "never see it twice". 0118 already closed the
entitlement hole on both the insert and the update policy. **It needed no new
structure at all.**

What it could not answer was *which surface* produced a row — and once the card
lets an advisor watch ahead, "did the card do anything" is not recoverable from
a `watched_pct`. That is one nullable column, `source`, with **no backfill**:
stamping the 50 existing rows `'library'` would assert a fact nobody checked.

> *Correction to a note I was carrying: `content_progress` inserts are **not**
> unchecked. 0118 fixed that. Nothing here reopens or re-fixes it.*

**C. The eight track films do not exist, and two of the six that do are already
load-bearing.**

`TWO_LADDERS.md` §"Track films are entry gates" assumes eight films, one per
core track, and flags that *The Big Ticket Visit* + *Part 2* may open one track
so "one more film is owed". The library says the gap is larger:

| Craft film | runtime | captions |
|---|---|---|
| Pre-Write | 5:03 | **yes** |
| Selling speech | 2:23 | no |
| Sing It | 3:26 | no |
| The Big Ticket Visit | 4:10 | no |
| The Big Ticket Visit, Part 2 | 3:30 | no |
| Wrap-Up | 2:51 | no |

**Six films against eight core tracks**, and **none is named for a core track**
(Walk Around, Setting up the MPI, Four Step Close, Success Cycle, Overcoming
Objections, Power of Positive Language, Lasting Impressions, CSI — title search
returns 0 for every one of those names). If Big Ticket 1+2 open one track,
**three films are owed, not one.**

Worse, **two of the six are already wired as rung-2 pitch fallbacks**:
`mapping_alias kind='stage_fallback'` maps *Pre-Write* → the Pre-Write stage and
*Selling speech* → After-MPI, both confirmed and live. Repurposing them as
track-entry gates makes them do two jobs in one loop.

On captions (Mitch's open question 5): **one of six Craft films is captioned.**
Across all 154 published films, 43 are.

Because of all this, `certification.entry_film_content_id` ships **null** and
`advisor_track_entry.film_content_id` is **nullable** — a track can be entered
before anyone has decided what opens it.

### Evidence that the spine works

`npm run accept:focus-family` — **43 assertions, 43 passing**, every one over
PostgREST as the role that will really make the call:

- `derive_focus_family` as the **service role** (how the loop calls it).
- `set_focus_family_override` as a **signed-in manager**.
- The refusals as a **signed-in advisor**, each asserted rather than assumed:
  cannot call the derivation, cannot insert an assignment, cannot move one,
  cannot override themselves, cannot record their own track entry; a manager at
  another rooftop is refused and reads nothing.
- The supply gate proven non-vacuously: the fixture's **biggest** missed-RO gap
  is on a family with **no film**, and the derivation must not pick it.
- Rule 2 proven: a re-derivation after an override returns the manager's row.
- The technician still sees no benchmark.

**Proven not vacuous.** Reverting `has_performance_surface()` to 0096's body
turns 12 of the 43 red, including every derivation assertion. Restored, green
again.

One trap found by running it, which 3b needs: **a null composite comes back from
PostgREST as a row of nulls, not as `null`.** `returns advisor_focus_family`
with `return null` reaches the client as `{"id":null,"family":null,…}`, which is
truthy. The loop must test `.family`, not the row.

### Migration hygiene

- Full local replay `0001 → 0123` clean (`supabase db reset --local`), run four
  times across the build.
- `tsc --noEmit` clean. `npm run lint` — 0 errors; the 9 warnings are
  pre-existing in three unrelated scripts.
- The one `UPDATE` inside a function that closes a prior row carries
  `where id = _existing.id` — pg_safeupdate would otherwise let it pass the
  migration and throw for every PostgREST caller.

---

## Decisions this hands back

**Ryan:**

1. Apply `0123_two_ladders_spine.sql` (`pg_dump` first). I have not applied or
   committed it.
2. **§0 amends a shipped security function** (`has_performance_surface`). It is
   required for the derivation to work at all and is asserted both ways by the
   suite, but it is a security surface and deserves your eye before it lands.
3. **Ranking units.** 0123 ranks on `missed_ros` with `opportunity` as
   tiebreak. `rank()` in `lib/advisor.ts` is `opportunity ?? missedRos`, which
   compares dollars against RO counts, so any family with a labor figure
   outranks every family without one. The divergence is deliberate and
   documented in the migration; confirm you want it.

**Mitch — new, from this phase:**

4. **Three track films are owed, not one** — and two of the existing six are
   already pitch-stage fallbacks.
5. **Pre-Write and Objections have never been filmed against an op code**, so
   two of every six block days have no pitch film available.
6. **Lasting Impressions and CSI have no course at all**, so the item budget
   question has no container to land in yet.
7. Quotes have **no existing filing to preserve** — making them module items is
   a green field.

**Unblocked, unchanged:** everything in `PHASE_3_PLAN.md`'s Mitch table is still
his and still sequenced as written. None of it blocked 3a.

---

```
$ git status -sb
## main...origin/main
 M .gitignore
 M AGENTS.md
 M package.json
?? PHASE_3_PLAN.md
?? TWO_LADDERS.md
?? data/File.png
?? reports/phase-3a-ground-truth.md
?? scripts/focus-family-acceptance.ts
?? scripts/tsconfig.focusfamily.json
?? supabase/migrations/0123_two_ladders_spine.sql
```

No ahead count. Nothing committed.
