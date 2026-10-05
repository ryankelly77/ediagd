# The library shows what it has — 0160 applied to Ryan's rulings

*5 October 2026. One migration (0160), two amended migrations (0157, 0158), the
loader and copy changes, `captions:sync` run against production.*

**Nothing is applied to production except `captions:sync`,** which Ryan asked to
be run. 0160 is on the branch; the merge and the apply are Ryan's.

**Validated both halves.** Build path: a restore of
`~/ediagd-backups/prod-2026-10-05T03-45-09Z.dump` with 0159 then 0160 applied,
then `accept:openers` over PostgREST against it — **37 passed, 0 failed**. Skip
path: `supabase db reset --local` replays **0001 → 0160 green**, which it could
not do before this PR.

---

## 1. The entitlement finding (ruling 8)

**`tracie@pearanalytics.com`** — user `645a4739-d5b4-41b5-9413-4e3495e1fb67`.

- **Rooftop:** Doggett Honda Med Center, `4a36620c-df8c-4aaa-92e9-dea2c2245238`
- **Missing row:** `rooftop_product (4a36620c…, 'advisor_base', 'active')`. The
  rooftop has **no `rooftop_product` rows at all** — the row is absent, not
  mis-statused.

**Not Beaumont.** `ryan+beaumont@pearanalytics.com` sits at Doggett Ford of
Beaumont, which has `advisor_base` active. By Ryan's conditional the fix does not
belong here, and his follow-up confirmed it: **Honda Med Center is left as it
is.** Nothing in 0160 touches `rooftop_product`.

For that account every track reads 0 of 0 and every deck shows the placeholder
with no cards — **indistinguishable on screen from the loader fault this audit
was sent to find.**

### The method correction that matters more than the finding

My first entitlement pass reported **all nine accounts unentitled**. It read
`rooftop_product.product_key`; the column is `product`. A failed read became a
confident finding that looked exactly like a discovery. The second pass refuses
rather than reporting on a failed read — `if (e2) throw`.

## 2. Start Here, reproduced per account (ruling 9)

`npm run repro:start-here`. Real `loadCourses`/`loadModules`/`loadModuleItems`,
imported not reimplemented, with a session per account from
`admin.generateLink` + `verifyOtp` — no password read, nothing mailed, and a
hard two-name allowlist so the script cannot reach anyone else's account.

**Before 0160, on production, both accounts saw every row.** Service role: 4
published rows in Start Here module 1. `ryan@`: 4. `ryan+beaumont@`: 4. Course
level identical for both — `totalModules=5, totalItems=25, pct=0`.

**So neither the data nor RLS was ever the problem.** What made it read empty:

1. `CueDeck` lifts the film **out** of the deck and renders it **above**
   (`CueDeck.tsx:97-101`). With no film the page synthesises a placeholder, so on
   a phone that block plus the header fills the viewport and **the cards are
   below the fold**.
2. The header said **"0 of 8 · 0%"** over eight cues that could never move it.

Both are fixed below. **One correction to my own audit:** it cited
`content_entitled_read` from 0010, and **0034 had already replaced it**. The
conclusion survives — 0034 widens `= role` to `= any(roles)` and still maps
`cue` and `advisor_video` to the same role and the same product — but it survived
on a re-read, which is why ruling 9 is now measured rather than derived.

---

## 3. What 0160 does, and what it reported on real data

| ruling | effect, measured on the production restore |
|---|---|
| 1 · tracks need a lesson | **35 of 45 courses no longer offered.** An advisor sees **10**, was 45 |
| 1 · empty modules never listed | **33 modules** hidden; 324 listable |
| 2 · Start Here hidden | **not returned** by `loadCourses`; nothing renamed, dissolved or deleted |
| 3 · Walk Around is the routine | 3 renamed, 6 created, 6 attached → **13 modules, 12 lessons**, active, `item_count 62 → 12` |
| 4 · Coverage is Key → MOC | **12 lesson modules built**; 0 placeholders removed; Chemical Warranty `item_count 2 → 12`, **held inactive** |
| 5 · gating-only `item_count` | **4 flags changed** — see below |
| 6 · progress counts gating only | `total_items` narrows; `all_items`/`cue_items` added so "no lesson yet" ≠ "nothing here" |
| 7 · dedupe | **23 rows deleted**, 8 progress rows folded onto keepers, 0 lost |
| Menus closer | module **10** |
| 0157 replay guard | chain replays 0001 → 0160 |

### The four certifications whose `active` flag changes

```
Power of Positive Language  (craft)    t -> f   item_count  51 -> 0
Differential                (service)  t -> f   item_count  85 -> 4
Fuel System                 (service)  t -> f   item_count 199 -> 4
Lighting                    (service)  t -> f   item_count  20 -> 0
```

**Ryan named only Power of Positive Language. Three service certifications also
flip, and this is the decision to look at first.**

I applied the rule to **both** arms, because the service credential is *already*
earned on films alone — `advisor_family_film_progress` filters
`type = 'advisor_video'` — while `item_count` counted cues. Fluids claimed 309
items against 15 watchable films. Narrowing both makes the number the credential
claims agree with the function that decides whether it is earned. Differential
and Fuel System hold 4 films against a 5-item bar; Lighting holds none.

**Reverting to craft-only is one line** (drop the `ct.type = any(...)` clause
from the service arm). Say the word.

**Still not reconciled, and named rather than closed:** the service arm now
counts published films in the family, while `advisor_family_film_progress` also
requires `via = 'op_code'`, `coachable`, and a non-null `mux_playback_id`. Closer
than they were, still not the same measurement. Adopting the stricter predicate
would deactivate tracks nobody asked about, so it is a separate ruling.

---

## 4. Three places I did not do what the ruling literally said

### The dedupe key would have deleted five real cues

Ryan's **count was right and his key was not**, and they disagree:

| key | groups | surplus |
|---|---|---|
| `(module_id, title)` | 229 | **295** — the brief's first number |
| `(module_id, title, body)` | 11 | **23** — the ruling's count, and what shipped |
| `(module_id, body)` | 14 | **28** — the ruling's key |

The five extra rows the body-only key deletes have **different titles and the
same body**, and in this library the title is often where the teaching lives.
Two of them are **`BPF-028 Brake Pads Front`** and **`BPR-029 Brake Pads Rear`**:
one body, two op codes, front and rear. Deduping on body deletes rear brake pads
and reports a cleanup.

*My own first measurement reproduced 295 exactly, which is what made me check it
instead of trusting it. A figure that lands on the expected number is the one to
re-measure.*

Also: **"keep the oldest" does not discriminate.** All 23 surplus rows share
`created_at` to the microsecond, so the tiebreak is the lowest id, stated in the
migration rather than left to the planner.

### `course.visible` is derived, not a stored flag

`boolean not null default true` is the hole AGENTS.md names under *an exclusion
by value is not an exclusion unless the value is mandatory* — the next filmless
course anybody imports takes the default and is **visible**, which is the bug
this migration closes. So `visible` is computed in `my_course_progress` and
cannot go stale: a film landing or being retired changes the answer with no
trigger and no backfill. The override Ryan also wanted is a separate **nullable**
`course.visible_override` with a mandatory `visible_reason`, so "nobody has
ruled" and "Ryan said show it anyway" are different states and the second leaves
a trace.

### `content_progress` rows could not be "unchanged"

**8 progress rows pointed at rows being deleted.** `content_progress.content_id`
is `ON DELETE CASCADE`, so the dedupe would have taken advisors' completions with
it. They are **merged onto the keeper** first — furthest watch, earliest
completion — and where the advisor already had a row on the keeper the redundant
one is removed and counted. `module_completion` **is** asserted unchanged (5).
`content_progress` goes **96 → 88**, asserted as exactly the folded count rather
than as a figure that would have to be wrong.

---

## 5. Two defects the rulings did not name

### 0158 had the identical unguarded-FK bug as 0157

Fixing only 0157 would have moved the failure from 0157 to 0158 and left the
chain exactly as unreplayable. **The question the bug is an answer to: which
migrations insert a hardcoded `content_id` through a foreign key with no guard?**
Swept all 160: **exactly two**, both `front_door_slot`. Both guarded; 0158's
assertions gained the same skip path so they no longer fail on an empty shop
window. Each amendment is dated and reasoned in its own header.

### The Walk-Around's films did not match its module names

Reported in the audit and fixed by ruling 3, but worth stating as the finding it
was: the course served **a nine-part sequential routine with six parts missing**,
and the three present sat in modules named for other topics — module 4 "Raising a
Problem Well" held "Part 2, Four Goals, Two Words". It now reads in order, and
the three existing modules were **renamed and resorted, never recreated**, so
their 12 quiz questions and 2 completions survived (proven: module 5 still
carries 4 questions and 1 completion).

### And one correction to my own audit

The audit called four MOC placeholder modules "REMOVABLE". They are not: all six
hold **draft** content (4–8 rows each) and my measurement counted only published
rows. 0160 removes none of them — which is what the ruling asked for — and
resorts them to 13–18 behind the twelve lessons.

---

## 6. Every string changed (advisor-facing copy)

Schema, code and admin keep **course** and **module** throughout. Only
advisor-facing text moves to **track** and **lesson**.

| file | was | now |
|---|---|---|
| `app/(app)/library/page.tsx` | "Courses built from the cues, in the order they're taught." | "Every track, lesson by lesson." |
| `app/(app)/library/page.tsx` | "The curriculum is being loaded" | "No tracks yet" |
| `app/(app)/library/page.tsx` | "Courses appear here once the curriculum map is imported." | "A track appears here as soon as one of its lessons has a film." |
| `app/(app)/library/page.tsx` | `{n} of {m} module/modules` | `{n} of {m} lesson/lessons` |
| `app/(app)/library/page.tsx` | `{c.pct}%` printed beside each row | **removed** |
| `app/(app)/library/[course]/page.tsx` | `{track} · {n} of {m} modules` | `{track} · {n} of {m} lesson/lessons` |
| `app/(app)/library/[course]/page.tsx` | `{n} of {m}` per row | `lessonCount(m)` — adds "N cues · no lesson yet" |
| `app/(app)/library/m/[module]/page.tsx` | `{n} of {m} · {pct}%` | `lessonCount(mod)` — no percentage |
| `components/library/CoursePieces.tsx` | *(no track name on Continue card)* | course name above the lesson title |
| `lib/navigation.ts` | "Coaching cues and pitch videos, by service." | "Every track, lesson by lesson." |

**The `/library` hint was describing a screen that does not exist** —
`listServiceBuckets` and `loadServiceContent` in `lib/library.ts` have zero
callers anywhere in the repo.

**`lessonCount()` is one function, in one place,** with three states — the middle
one is the point: a cue-only module now says "6 cues · no lesson yet" instead of
"0 of 0", and carries no progress bar, because a 0%-wide rule reads as a lesson
somebody failed to start.

**The "watched" rule:** whole numbers everywhere, no printed percentage on any
library surface. The bars remain; `pct` is no longer rendered as text.

---

## 7. Lessons open in order, and nothing points at a dead end

`loadNextStep` read the raw `module` and `course` tables, so "next" could hand an
advisor a module the list hides — the Next button would be the only route to a
screen the library deliberately hides. Both walks now go through
`my_module_progress` / `my_course_progress` with the **same filters** the list
uses. Two surfaces disagreeing about what the next lesson is would be the defect
0143 spent a migration collapsing.

`loadContinuePoint` now requires `total_items > 0`: a card that says "Continue"
must not open something that cannot be finished.

## 8. `captions:sync`, run against production

```
447 published, unretired films carrying a Mux asset
  column BEFORE:  42 true, 405 false/null
  set true: 405   set false: 0   already correct: 42   FAILED: 0
  column AFTER:  447 true, 0 false/null
```

Read back from the column, not reported from intent. The brief's "2 of 141" was
Craft-scoped; the real population is 447.

**The brief said nothing keys on the column. Not quite:** nothing in the loop, no
screen and no notification — but `family_pitch_supply.fully_captioned` (0123,
0125) is a `bool_and` over it, and `scripts/focus-family-acceptance.ts` selects
that column. It asserts nothing on it, so nothing broke. Listed in INGEST.md with
the other re-runnable backfills.

## 9. Proofs

- `supabase db reset --local` — **0001 → 0160 green.** Previously died at 0157.
- `accept:openers` on a production restore with 0159+0160 — **37 passed, 0 failed.**
  Two assertions in it had to move with the rulings, both keyed on labels this PR
  changes: section D found the module by **name** ("4. Raising a Problem Well"),
  now by **the film it holds**; and it asserted `completed_items < total_items`,
  which held only because `total_items` counted cues — restated against
  `all_items`/`cue_items`, which is what it always meant.
- `check:gating` — allowlist consistent, all 6 enum values accounted for.
- `check:nav` — every watched route reachable.
- As an **entitled advisor over RLS** on the migrated restore: 10 tracks offered,
  35 hidden, Start Here absent, 33 empty modules hidden, Walk Around 12 lessons.
- `module_completion` **unchanged at 5**. `content_progress` 96 → 88, every row
  accounted for.
- `npm run build` clean; `tsc --noEmit` and `eslint` clean.

### What I could not prove

- **No screenshots.** The Chrome extension reports "not connected"; ruling 9
  replaced them and is satisfied over PostgREST.
- `repro:start-here` could not obtain a **local** session for
  `ryan+beaumont@` (GoTrue rejected the restored magic-link token). The
  production run earlier covered both accounts; the local post-migration run
  covers `ryan@` only.
- **`content_progress` drifts on a live database** — 97 when I first measured,
  99 an hour later, 96 in the dump. Production is in use; the asserted figures
  are the dump's, and the migration computes its own before/after rather than
  hardcoding any of them.

## 10. Open for Ryan

1. **The three service certifications going inactive** (Differential, Fuel
   System, Lighting). One line to revert to craft-only.
2. The 20 films still unattached and routed — **Coverage is Key is placed**, but
   the two Two Minute Walk-Around films stay in the library by ruling 3, and
   Phones and Tones' opener/closer remain held as Master scope.
3. **Walk Around module 13 (The Handback)** has 4 cues and no film. It is the
   only filmless module left in the track and cannot gate, so the track completes
   at 12 lessons. The attach migration puts its film in when Mitch shoots it.
