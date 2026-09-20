# Phase 3b — The loop

*Built 18–19 September 2026. Migration `0124_two_ladders_loop.sql`, written and
validated, **not applied and not committed**. Architecture: `TWO_LADDERS.md`,
including *Settled by phase 3a*. Prior phase: `reports/phase-3a-ground-truth.md`.*

---

## Ruling 1 — where all five existing steps went

Stated before the diff, as asked. Nothing below was merged by accident, and two
things were removed on purpose.

| # | Step today | Disposition | Where it went |
|---|---|---|---|
| 1 | **Life quote** (`slot3`) + greeting | **Moved** | Becomes the **closing line on the completion screen** (ruling 6). The *greeting* moved to the new step 1, because a morning ritual that opens without saying good morning reads as a kiosk. |
| 2 | **Focus card**: coaching cue **+** sales quote (`slot2`) | **Split, and one half removed** | The **cue** is replaced by the `item` slot — same table, different selection: the four-rung family ladder gives way to module order. The **sales quote is REMOVED**, see below. |
| 3 | **Pitch video** (conditional on stage) | **Kept, re-selected** | Still the pitch, now slot 2 of 3. Selection changes from `(op_code, stage)` + a stage-fallback film to *the next unwatched film in the locked focus family*. |
| 4 | **Lifestyle video** (Mindset/Craft alternating) | **Kept, moved to FIRST** | Becomes the `mindset` slot. Same shelf, same player, same gate — the position was the whole complaint. Craft is no longer drawn from (see below). |
| 5 | **Celebration** | **Kept, extended** | Unchanged as the payoff; now also carries the closing quote and any certification earned. |

**Two things are gone on purpose, not by omission:**

1. **The second quote.** The old day served two — `slot3` to open and `slot2`
   beside the cue. Ruling 6 gives the day *one* quote, on the completion screen.
   The `slot2` pool is not deleted and no quote is retired; every published
   quote is now a candidate for the one draw (393 rather than 335). The
   `quote_slot` column stops being read by the loop.
2. **The Craft shelf in the mindset rotation.** The old picker alternated
   Mindset with Craft. The `mindset` slot draws from **Mindset only** — the six
   Craft films are the foundational ones, and two of them are wired as pitch
   stage-fallbacks. Serving one as the day's mindset film would put the same
   film in two slots on the same morning.

**And one thing left the loop entirely:** the **coaching block**. It locked a
family, chose an op code and walked six stages; `advisor_focus_family` now does
the first two and consumption order does the third. Two things cannot both own
the op code — 3a flagged that 3b would have to choose. 0124 §2 closes every open
block (two in production) because `completeDay` asserts the stamp and the open
block agree, so a block left open would refuse every new-shape morning. The
table is retired, not dropped; `daily_completion.block_id` still points at it.

---

## Ruling 2 — track entry is recorded; the gate appears only with a film

Built exactly as specified, and the specified state is the one production is in.

- `advisor_track_entry` gets its row **the moment an advisor starts a track**,
  film or no film. Verified: all three fixture advisors have an entry row for
  *Walk Around*; only one of them saw a film.
- The entry morning differs from a normal morning **only** when
  `certification.entry_film_content_id` is non-null. It is null for all eight
  core tracks and stays null — which film opens which track is Mitch's ruling.
- No placeholder, no "coming soon", no borrowed film. `lib/loop.ts` branches on
  the column each morning; `TrackFilmStep` is written and reachable but never
  fires today.

**The test of whether this was built right** is that attaching a film is an
`UPDATE` and nothing else. The screenshot fixture does exactly that —
`scripts/loop-screenshot-fixture.ts` sets the column on a local copy — and entry
mornings start appearing with no code change. Screenshot 08.

---

## Ruling 3 — one completion gate, in one place

`lib/gamification/dayGate.ts`. Pure, no database, no app imports.

A morning is a **list of legs**; the morning type only decides which are
*required*. Adding or dropping a leg is one entry in `LEGS`.

```
mindset      required always
pitch        required when kind === 'normal'
item         required when kind === 'normal' || 'two_slot'
track_film   required when kind === 'track_entry'
```

A leg that was **not offered** cannot hold the day open — that is what makes a
two-slot morning completable without a special case. A morning where *nothing*
is required **fails closed**: an empty screen must not pay out a streak day and
ten Sand Dollars.

`completeDay` asks it **once**, before the completion row is claimed, so a
refused day does not take the date and can be retried. All three morning types
go through that one call.

**No Good News Story leg exists.** It is still PROPOSED, and 3d says not to
design for it. What is prepared is the shape: a key, when it is required, how it
is met. That cost nothing and is worth having on its own.

> **One honest limit, named rather than buried.** A *text* item has nothing
> observable to measure, so its leg is met by the client's acknowledgement
> (`itemAck`). That is the same trust boundary the old cue step had — the
> difference is that it is now a named claim the server records as a leg rather
> than the day silently counting because the client navigated. A **video** item
> is gated by the watch record and ignores the flag; the moment Mitch attaches a
> film to a module, that leg becomes genuinely measured with no code change.

---

## Ruling 4 — existing streaks survive

**Checked before the migration was written, as asked.** Old completion rows are
never re-read to compute a streak: `applyDailyCompletion` takes the stored
`swell` row plus the work calendar. `daily_completion` is a per-day record, not
the streak's source. So a change to what "complete" means cannot rewrite
history — it can only decide whether *today* counts.

**Demonstrated end to end.** An advisor with three days written in the old shape
(`morning_kind` null, `cue_content_id` set, `item_content_id` null — byte for
byte what the pre-0124 loop wrote) completed a new-shape two-slot morning:

```
 completion_date |   shape    | cue | item | pitch
-----------------+------------+-----+------+-------
 2026-09-16      | (pre-0124) | t   | f    | f
 2026-09-17      | (pre-0124) | t   | f    | f
 2026-09-18      | (pre-0124) | t   | f    | f
 2026-09-19      | two_slot   | f   | t    | f

 STREAK: day 4, longest 4, unbroken through 2026-09-19
```

Screenshot **07** is that advisor's celebration: **Day 4**, no reset, no grace
spent. The acceptance suite asserts the same thing (`rB.streak === 4`,
`streakReset === false`, `graceUsed === false`) and the four-row shape string.

---

## Ruling 5 — mindset gets real recency; pitch and item do not

`advisor_pool_seen (user_id, pool, content_id, cycle)`. Draw the next unseen;
when nothing is unseen, `cycle + 1` and the whole pool is available again, in a
different order (the cycle number is in the ordering hash, so pass two genuinely
re-shuffles). Deterministic, so a reload serves the same film.

- **pitch** and **item** need no new state — `content_progress.completed_at` is
  already their cursor, and it already prevents a repeat.
- **The cursor is written at completion, not at serve.** An advisor who opens
  the app and walks away has not seen the film, and tomorrow must not move on
  without them.
- **One table, two pools.** The quote needs the identical mechanism (ruling 6),
  and two tables with the same shape drift the first time one is fixed.

> **THE TRADE, ON THE RECORD.** Today every advisor at a store sees the same
> mindset film on the same day and can talk about it on the drive. Per-advisor
> recency ends that: two advisors at one rooftop diverge on their second morning
> and never re-sync. Visible in the screenshots — the three fixture advisors
> draw three different films.
>
> **It is reversible.** Delete the `advisor_pool_seen` read in `pickMindset` and
> restore the epoch-day rotation; the table simply stops being written and the
> history it holds stays readable. Worth noting the old fairness was partly a
> fiction anyway: an advisor who missed Tuesday never saw Tuesday's film.

---

## Ruling 6 — the quote is the close

One quote, on the **completion screen**, after the streak advances. It gates
nothing, counts toward nothing, is not in `LEGS`, and carries the keep control
with it. It follows ruling 5's no-repeat through the same pool cursor. In code
the prop is `closingQuote`, not `quote`, so nothing reads it as step one again.

Screenshot **04** — below the Sand Dollar breakdown and the signoff.

---

## Ruling 7 — the null composite

`lib/pg-composite.ts`, one function, `compositeOrNull(row, discriminator)`.
Takes the discriminator explicitly rather than guessing at emptiness. Asserted
three ways in the suite, including the SETOF-array form. `pickPitch` is the real
caller; without it an advisor with no DMS history is locked onto a null family
and nothing throws.

---

## Ruling 8 — both ladders, and entitlement

`npm run accept:loop` — **71 assertions, 71 passing**. It drives the real
`completeDay()` with a real signed day stamp, the way `completeDayAction` does,
and reads back what the database holds. Each scenario is a genuine single-day
completion (the engine resolves the date from `rooftop_today`, so one advisor
can complete one real day; each scenario gets its own advisor with its history
pre-loaded).

**Before → after, one normal morning:**

| | before | after |
|---|---|---|
| service certification held | 0 | **1** |
| craft items consumed | 0 | **2** (pitch + item) |
| craft track earned | 0 | 0 — *a module is still unfinished* |
| streak | 0 | **1** |
| `morning_kind` | — | `normal` |
| `cue_content_id` | — | **null** (the old ROI join untouched) |
| ROI view sees coaching on the family | false | **true** |

**A two-slot morning** (focus family out of film): completes, `morning_kind =
two_slot`, streak advances 3 → 4, the second item finishes the module and the
**craft track earns**.

**A base-tier advisor reaches nothing new.** The product is removed from the
*rooftop* — the real condition — and the morning comes back with no mindset
film, no pitch, no item and no quote; the gate refuses it, so nobody banks a day
on an empty screen. Restoring the product and re-running the same advisor
returns content, which is what proves the empty morning was empty for the right
reason.

**Non-vacuity.** Every guard is reverted, re-checked, and restored:
the op-code bridge in `impact_coaching`, `module_completion`, the pool cursors,
and the entitlement. Each turns its assertion red.

---

## Four things found while building, which are the report

### 1. The pitch slot was silently dead, and nothing errored

`op_code_family` was readable by any signed-in user in 0066; **0081 narrowed it
to platform owner or admin**, on the stated grounds that "no app code reads
service_line, op_code or product_catalog at runtime at all". True then. The
pitch slot makes it false.

`lib/loop.ts` first read the family's op codes through the *advisor's* client.
That returns **zero rows and no error**, so every morning came back two-slot,
for everyone, and the only symptom was a pitch slot that never fired. Caught
because the suite asserts the *shape of the morning* rather than trusting the
pickers.

Fixed by reading the code list with the **service role** — correct rather than a
workaround: it is a coaching vocabulary carrying nothing about the advisor, and
the entitlement that decides what may be *served* is on `content`, still read as
the advisor. Asserted from both sides so a future "simplification" of the two
clients fails here rather than in production.

**This also corrects 0123.** That migration granted `family_pitch_supply` to
`authenticated` and claimed an advisor "counts only films they are entitled to
play". They count *nothing*. 0124 §5b revokes the grant and rewrites the
comment. A card built on it would have rendered "0 films" for every family.

### 2. The ROI figure would have gone to zero

`impact_coaching` decides whether an advisor was coached on a family in a
period; `impact_rollup` and `admin_impact_*` turn that into the ROI-per-rooftop
number a dealer principal reads. All three of its sources resolve the family
through `content.service_family`:

- `cue_content_id` — the old family ladder. **Gone**: the item slot serves craft
  curriculum and 408 of the 410 published Foundations items have
  `service_family` null.
- `video_content_id` — the lifestyle film. Never carried a family.
- `content_progress` — library lessons. Unaffected.

So on the day 3b shipped, the primary coaching signal would have stopped and the
number would have quietly drifted toward whatever the library alone produces.
**Nothing would have errored.** 0124 §5 adds the pitch film resolved through
`op_code → op_code_family` — the way 3a established every film resolves — plus
the item where it does carry a family. Every existing branch is preserved
verbatim; 3,038 historical completions keep proving coverage the old way.

### 3. The daily loop had never advanced a certification

`accrueFromCompletion` was wired only to `lib/library-actions.ts`. An advisor
who did the loop every morning and never opened the library advanced **no
certification at all** — against `TWO_LADDERS`: *"Every completed day advances
two credentials."*

The craft half needed more than wiring: `craftComplete` reads
`module_completion`, and only the library ever wrote one. `maybeCompleteModule`
was a private helper inside a `"use server"` module. It moved to `lib/lms.ts` as
`completeModuleIfReady`, and **both** callers now use it — which is
`TWO_LADDERS`'s own ask that *"track completion is expressed in exactly one
place"*.

> **A decision for you.** The library pays `game_settings.sand_module` when a
> module completes. **The loop passes bonus 0.** Finishing a module is the same
> act on both surfaces, so paying differently is an inconsistency — but adding a
> second currency source to the morning is a product decision nobody has taken,
> and 3b was not asked to change the economy. The completion row, which is what
> the credential reads, is identical either way. Say the word and it is a
> one-line change.

### 4. A shared device showed one advisor another's celebration

The celebration cache was keyed `ediagd:celebration:${today}` — the date alone.
One browser, two advisors, one day: the second finishes their morning and is
shown the **first one's** streak, badge and Sand Dollars, because the cache hit
short-circuits the action before it runs — so their day is **never completed at
all**. Found while photographing the three morning types, which is exactly the
shared-iPad case a service drive has.

Both session caches are now keyed on the day stamp's MAC, which is an HMAC over
user *and* date *and* content, so it is unique per advisor per day by
construction.

**Alongside it, a step-reset.** Filing a watch gate is a server action, so it
refreshes the route and can remount `DailyFlow` — the file has documented that
for as long as the gate has existed, and the celebration already defended
against it. What changed is *when* the first gate is filed: the mindset film is
now step 1, so the first Continue could throw the advisor back to step 1 while
the write landed. The step is now persisted the same way the celebration is.
Pre-existing in kind; 3b made it bite on the first tap, so 3b fixes it.

---

## The screenshots

`reports/phase-3b-screens/`. Driven through the real app against local Supabase
with `npm run fixture:loop`. **The players show a network error because the
fixture's Mux playback ids are fake** — the honest "Couldn't play this one —
moving on" line is the app behaving correctly, not a defect.

| File | What it shows |
|---|---|
| `01-normal-step1-mindset.jpg` | **The reversal.** Mindset film **first**, "Good morning", 4 dots. |
| `02-normal-step2-pitch.jpg` | Pitch: *On the Drive · Serpentine Belt · Belts & Cooling*, dot 2. |
| `03-normal-step3-item.jpg` | Item: *Walk Around · Opening the conversation · 1 of 3*, rendered as text. |
| `04-normal-step4-celebration-quote.jpg` | Day 7, badge, Sand Dollars — **then the closing quote** with its nugget and Keep control. |
| `05-twoslot-step1-mindset.jpg` | Two-slot morning: **3 dots, not 4**, and a *different* mindset film — ruling 5 visible. |
| `06-twoslot-step2-item-pitch-skipped.jpg` | The pitch step is **skipped entirely**; step 2 is the item. |
| `07-streak-spans-migration-day4.jpg` | **Ruling 4** — Day 4 from 3 old-shape days + 1 new. |
| `08-track-entry-film-is-the-day.jpg` | **Ruling 2** — *"Starting Walk Around"*, the film, and **"Finish the day"**. No pitch, no item. |
| `09-preview-normal-banner.jpg` | The admin walkthrough, naming the borrowed pitch. |
| `10-preview-normal-borrowed-pitch.jpg` | The borrowed pitch film, banner still on screen. |
| `11-preview-two-slot.jpg` | Two-slot walkthrough — "nothing was substituted", which is the true answer for this account. |
| `12-preview-track-entry-standin.jpg` | Track-entry walkthrough, naming the stand-in film and that nothing is attached. |
| `13-preview-track-entry-film.jpg` | The stand-in film as the day. |

What the database recorded for those same three mornings:

```
  full_name   | morning_kind | mindset | pitch | item | entered
--------------+--------------+---------+-------+------+---------
 shot entry   | track_entry  | t       | f     | f    | t
 shot normal  | normal       | t       | t     | t    | f
 shot twoslot | two_slot     | t       | f     | t    | f
```

---

## The admin walkthrough

`/today?preview=` — one entry per morning type in **Admin → Previews**.

**Why it needed rebuilding, not just relabelling.** The old preview walked the
*real* morning and handed it a canned completion. That was right when every
morning had one shape. After 3b the shape is derived from the viewer: the pitch
slot needs `membership.op_code_id` → a DMS book → a ranked family. An admin
account has no operator id, so the walkthrough served a **two-slot morning every
time, silently** — the one screen the phase exists to show was unreachable from
the menu that claimed to show it.

| Menu entry | URL | What it shows |
|---|---|---|
| Daily Loop — a normal morning | `?preview=normal` | mindset → pitch → item → celebration (4 dots) |
| Daily Loop — a two-slot morning | `?preview=two-slot` | mindset → item (3 dots) |
| Daily Loop — a track-entry morning | `?preview=track-entry` | mindset → the film that opens a track (3 dots) |

`?preview=1` still resolves to the normal morning — it is what the menu linked
to before and what any bookmark holds. Dropping it would have made an old link
render a **real, writable day**.

**Every substitution is named on screen.** `lib/loop-preview.ts` leaves real
everything that works for any viewer — the mindset draw, the item, the closing
quote — and substitutes only what the viewer's own data cannot supply. What it
substituted is listed in a banner above the ritual, on every step including the
celebration:

- *normal* — "The pitch is borrowed from Belts & Cooling — this account has no
  DMS history…"
- *two-slot* — on an account that had no pitch anyway: "Every slot came from
  this account's own data — nothing was substituted."
- *track-entry* — "**STAND-IN FILM.** No track has an entry film yet… Nothing is
  attached to Walk Around; the real loop still serves an ordinary morning and
  records the track entry anyway."

That last one matters: the walkthrough does **not** write
`certification.entry_film_content_id`. Ruling 2 is intact — production still has
null for all eight, and the real loop still serves an ordinary morning.

**The banner says "no day is saved", not "nothing is saved".** Verified by
walking all three shapes against an account holding zero rows and re-counting
afterwards: completions 0, consumption 0, pool cursors 0, track entries 0,
assignments 0, Sand Dollars 0, swell 0, module completions 0. The one thing that
*is* written is a `watch_gate` row if the admin opens a player and clears its
bar — that is a true record of a real watch and is deliberately not made
preview-aware, so the banner does not claim otherwise.

Screens `09`–`13` in `reports/phase-3b-screens/`.

---

## Report, do not act

### A. Which families lose cover if the two `mapping_alias` films are promoted

Two `stage_fallback` rows are **confirmed and live**: `Pre-Write → Pre-Write`
and `After-MPI → Selling speech`. (Two more — `MPI Setup → Setup speech`,
`Objections → Overcoming Objections` — are proposed and inert; no such film
exists.)

**Before 3b**, promoting them costs:

| Film promoted | Covers | Op codes that lose their fallback |
|---|---|---|
| **Pre-Write** | the Pre-Write stage | **all 14 filmed op codes** — no deck has its own Pre-Write film |
| **Selling speech** | After-MPI | **2 of 14** — HVAC's `ABT-054` and `ACO-055` |

So *Pre-Write* is the expensive one: every family loses Pre-Write cover, and
none has a replacement. *Selling speech* costs two HVAC codes.

**After 3b, both cost nothing — and that is the real answer.** The pitch slot no
longer looks anything up *by stage*. It walks the focus family's films in deck
order and skips what is watched, so `mapping_alias kind='stage_fallback'` is no
longer read by any code path. Deck depth per family is unchanged by promotion:

| Family | Deck films | Deck stages covered | Change if both are promoted |
|---|---|---|---|
| Belts & Cooling | 12 | 4 of 6 | none |
| Fluids | 12 | 4 of 6 | none |
| HVAC | 10 | 4 of 6 | none |
| Filters | 8 | 4 of 6 | none |
| Brake Service | 4 | 4 of 6 | none |
| Differential | 4 | 4 of 6 | none |
| Wipers | 2 | 2 of 6 | none |

> **So promotion need not wait for replacement films** — but only because 3b
> retired the lookup that depended on them. If you would rather keep the
> stage-fallback path alive for anything else, *Pre-Write* should not be
> promoted until a replacement exists.

### B. The filmless families, ranked by missed volume across Doggett

All 11 production rooftops are Doggett-group stores; there is no demo cohort to
exclude. `family_store_benchmark` returns zero rows to the service role in
production (the 0123 §0 bug, still unapplied), so the store average is
recomputed here from the same inputs under the same rules — mean attach rate
over advisors with ≥ 20 ROs, departed advisors excluded from periods after they
left.

**Most recent period per rooftop — what to film next:**

| # | Family | Est. labor $ left | Missed ROs | Advisors |
|---|---|---|---|---|
| 1 | **Fuel System** | $2,976 | 13 | 8 |
| 2 | **Tires & Rotation** | $2,457 | 33 | 12 |
| 3 | **Battery** | $1,950 | 7 | 7 |
| 4 | **Alignment** | $1,023 | 8 | 7 |
| 5 | **Oil Change** | $781 | 27 | 11 |
| 6 | **Suspension** | $346 | 1 | 2 |
| 7 | **Spark Plugs** | $314 | 1 | 3 |
| 8 | **Lighting** | $162 | 1 | 1 |
| — | EV & Hybrid, Inspections | *no measured gap* | | |

**Cumulative across every period on file** — steadier, and it reorders the top:

| # | Family | Est. labor $ | Missed ROs |
|---|---|---|---|
| 1 | **Fuel System** | $310,542 | 1,191 |
| 2 | **Suspension** | $229,950 | 353 |
| 3 | **Spark Plugs** | $168,396 | 592 |
| 4 | **Alignment** | $168,014 | 1,101 |
| 5 | **Battery** | $129,350 | 1,101 |
| 6 | **Tires & Rotation** | $107,486 | 2,020 |
| 7 | **Oil Change** | $100,081 | 2,505 |
| 8 | **Lighting** | $23,669 | 247 |
| 9 | **Inspections** | $13,638 | 166 |

> **Fuel System is first on both readings and is not close.** After that the two
> views disagree, and the disagreement is informative: *Suspension* and *Spark
> Plugs* are large historically and quiet this month, while *Tires & Rotation*
> and *Oil Change* are high-volume and low-dollar — many missed ROs, little
> labor behind each. If Mitch films four, the cumulative list is the safer
> order; if he films one, it is Fuel System either way.

---

## What is left, and what is yours

**Ryan:**

1. **Apply `0124_two_ladders_loop.sql`** (`pg_dump` first). `0123` is still
   unapplied too — **0124 depends on it** and must go second.
2. **§2 closes every open coaching block.** Two in production. It is a real
   write to real people and it is required: without it those advisors cannot
   complete a morning at all.
3. **The module bonus** — the loop passes 0 where the library pays
   `sand_module`. Your call (finding 3).
4. The two session-cache fixes (finding 4) change client behaviour on shared
   devices; worth a look before deploy.
5. **The admin walkthrough** is the fastest way to review this — Admin →
   Previews → the three Daily Loop entries. See *The admin walkthrough* above.

**Mitch — unchanged and still sequenced as in `PHASE_3_PLAN.md`:** which track
each film opens; track order (the loop uses `certification.sort`, which is his
order from 0115, until he says otherwise); the starting family for an advisor
with no DMS history (they get two-slot mornings, honestly, until then); item
budget; captions. Plus the filming order in section B above.

**Out of scope and untouched:** the /today card (3c — it will visibly duplicate
the pitch slot until then, as expected); the Good News Story (no schema, no
flag, no column); attaching films to tracks or modules.

---

```
$ git status -sb
## main...origin/main
 M .gitignore
 M AGENTS.md
 M app/(app)/today/page.tsx
 M components/daily/DailyFlow.tsx
 M lib/daily.ts
 M lib/day-stamp.ts
 M lib/gamification/completeDay.ts
 M lib/library-actions.ts
 M lib/lms.ts
 M package.json
 M scripts/day-ticket-scenarios.ts
?? PHASE_3_PLAN.md
?? TWO_LADDERS.md
?? data/File.png
?? lib/gamification/dayGate.ts
?? lib/loop.ts
?? lib/pg-composite.ts
?? reports/phase-3a-ground-truth.md
?? reports/phase-3b-the-loop.md
?? reports/phase-3b-screens/
?? scripts/focus-family-acceptance.ts
?? scripts/loop-acceptance.ts
?? scripts/loop-screenshot-fixture.ts
?? scripts/tsconfig.focusfamily.json
?? scripts/tsconfig.loop.json
?? scripts/tsconfig.shotfixture.json
?? supabase/migrations/0123_two_ladders_spine.sql
?? supabase/migrations/0124_two_ladders_loop.sql
```

No ahead count. Nothing committed.

**Verification:** full local replay `0001 → 0124` clean. `accept:loop` 71/71,
`accept:focus-family` 43/43, `test:certification` 70/70, `test:day-ticket`
35/35, `test:streak` 112/112, `test:watch` 67/67. `tsc --noEmit` clean.
`eslint` 0 errors (9 warnings, all pre-existing in three unrelated scripts).
`npm run build` succeeds. `.env.local` was pointed at local Supabase for the
screenshot run and restored byte-for-byte afterwards.
