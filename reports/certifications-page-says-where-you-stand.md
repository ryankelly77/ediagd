# The certifications page says where you stand

*30 September 2026. UI and lib only — no migration. Branch
`certifications-says-where-you-stand`, stacked on `lock-basic-certification`
(it uses `pendingQuizzes()` from that branch); re-target the PR base to `main`
after #28 merges, per the AGENTS.md stacked-PR rule.*

## Screenshots (phone width, 390×844, the advisor account by id)

- `reports/screenshots/certifications-phone.png` — the wall: credential card
  ("EDIAGD Certified · 0 of 9 core tracks complete", bar "1 of 101 modules
  across the nine tracks"), the Master line, nine core rows each with modules
  and a next line, the Master section (Phones and Tones active with "Master
  track · 0 of 12 modules"; Chemical Warranty and A Day in the Life as Master
  coming-soon), the service ladder with "derived from your numbers", and the
  empty families under Service — never one mixed bucket.
- `reports/screenshots/track-walk-around-phone.png` — the track page: "1 of 3
  lessons complete", module 1 "Complete · quiz passed", module 2 "Lesson, then
  its quiz", modules 4–7 "Reinforcement · doesn't gate the track", and the
  Good News Story card at the bottom linking to the existing form.

Taken headless against a local restore of the production dump with 0144–0146
applied, signed in as the advisor-only account `921e2537-…` (never by name).

## The ruling, recorded

`TWO_LADDERS.md` §"No equivalent card on the craft side" now carries the dated
note: **the daily loop is the drip, and an advisor may work ahead through the
library at any time. The quiz gate, not the drip, is what makes the credential
mean something.** The old sentence no longer stands beside the new behavior —
the section states which half of the original rule survives (where craft
progress is *shown*) and which half is superseded (whether an advisor may move
faster than the morning).

## Which numbers changed meaning

**The tile: items → modules.** An advisor who saw **"30 of 59 items"** on Walk
Around yesterday sees **"0 of 7 modules · Next: 1. The Walk-Around Routine"**
today (or "1 of 7 · Next: 2. What the Vehicle Tells You" once module 1 is
done). The old number counted cues — which gate nothing since 0143 — so an
advisor at 58 of 59 items and 0 of 7 modules read as nearly finished while
holding nothing. The new number is `done_modules of total_modules` from
`my_certification_progress`, the same population `craftComplete()` requires.

**Three bars, three named populations:**

| surface | numerator / denominator | why |
|---|---|---|
| credential card bar | module_completion / ALL modules on the nine core tracks (today: 101) | matches `craftComplete()` exactly — the bar can never read full while the credential refuses |
| core tile line | done / total modules per track (e.g. "1 of 7") | the view's numbers, as the brief specifies |
| track page bar | complete / GATING lessons (e.g. "1 of 3") | cue-only modules cannot complete under 0143 and are labeled "Reinforcement · doesn't gate the track" — they never sit in a denominator the advisor is measured against |

The tile's 7 and the track bar's 3 coexist on screen because the track page
*lists* all seven and marks four as reinforcement — the two numbers describe
the same page, labeled.

## What was built

- **`lib/loop.ts`** — `pendingQuizzes()` (every pending quiz, track order),
  with `pendingQuiz()` now its first element. One predicate, one ordering; the
  page reads the answers and decides nothing.
- **`lib/certifications.ts`** — `loadCertificationsOverview()` (the wall) and
  `loadTrackDetail()` (one track). Both read exclusively through the
  RLS-filtered advisor client; there is no service-role read anywhere on these
  pages. Module states derive from `my_module_progress` — the same predicates
  `moduleRequirementsMet` uses — plus one new distinction: a module with no
  published film is reinforcement.
- **`app/(app)/certifications/page.tsx`** — rebuilt per the brief: credential
  first, core rows in `certification.sort` order linking to the track pages,
  Master and Service under their own headings, coming-soon split.
- **`app/(app)/certifications/[slug]/page.tsx`** — new. Entry film state at
  the top when `entry_film_content_id` is set, every module in
  `certification_course.sort` → `module.sort_order` with one of the four
  states, every module linked to `/library/m/[id]` (the acceleration), the
  story leg at the bottom, the gating-lessons bar. Inactive tracks and
  service certifications get an explainer body with no modules, no progress,
  no links. Closers need nothing special — they are ordinary last lessons.

Master is shown, never computed: the page prints "Master Certification opens
after EDIAGD Certified" and lists Master tracks with their own progress;
`computeCredential` is untouched.

## Proven as the viewer

`npm run accept:certifications-page` (new, committed) against the local
prod-restore, as the real advisor-only account over PostgREST as
`authenticated` — **17 passed, 0 failed**:

```
fresh: 0 of 9 core tracks · credential bar 0 · Walk Around 0 of 7 modules
fresh: next line names module 1's lesson · every tile 0 · sort order = loop order
films watched: next line becomes "Next: quiz for 1. The Walk-Around Routine"
  (from pendingQuizzes(), not a second predicate) · track page quiz_waiting
gradeAttempt passes with the keyed answers (the REAL grading path)
completeModuleIfReady writes the completion row
tile reads 1 of 7 modules · credential bar counts 1
track page: module 1 complete, module 2 not_started
four cue-only modules are reinforcement · track bar 1 of 3, never of 7
negative: inactive Master track (Chemical Warranty) — comingSoon, no modules,
  no progress, no links
```

`npm run check:nav`: **43 routes across 8 trees, every watched route
reachable** — `/certifications/[slug]` now appears in the enumerated set,
covered under the registered `/certifications` (the `certifications` tree has
been in WATCHED since the wall shipped, so the new route cannot be orphaned
silently; the suite hard-fails on any tree it doesn't know). `next build`
green; eslint and `tsc --noEmit` clean.

## Notes for Ryan

- One honest oddity the page now surfaces rather than hides: Overcoming
  Objections' next line reads "Next: Knowledge Notes 1", because that module
  holds the track's first film (Overcoming Objections, Part 1). The name is
  the module's, and renaming cue-container modules is Mitch's call — the
  October cue-interleaving (2-october-list item 15) dissolves the oddity.
- The local Supabase is left carrying the restored production data with
  0144–0146 applied, so you can open the page yourself against real content
  (`npx next dev` with the local env; the advisor account's scratch password
  is set by the acceptance run). `supabase db reset --local` returns it to
  seeded dev state whenever you want.
