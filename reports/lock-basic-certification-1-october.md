# Locking the basic certification for 1 October

*30 September 2026. Migrations 0144–0146, the quiz-waiting link, the INGEST
naming addition, and 184 drafts for Mitch. Everything below was validated on a
full local replay of the whole chain AND on a local restore of the production
dump (`pre-0143-20260929-2120.dump`) with the new migrations applied — the
skip path and the build path, both proven.*

Scope was the basic certification only — the nine `is_core` tracks. Master is
October. Chemical Warranty, Phones and Tones, A Day in the Life and the 485
stage-keyed pitch questions were not touched.

---

## The nine core tracks, before and after

Before = the corrected picture as of 29 September (films = published
`advisor_video` in the track's modules). After = measured on the restored
production dump with 0144 and 0145 applied. **Population note:** `modules`
counts every module on the track's course; `filmed` counts modules holding at
least one published film; `item_count` is `recompute_certification_content()`'s
number and counts cues as well as films; `quiz` counts modules with published
questions.

| track | sort | before: filmed/modules · active | after: filmed/modules · items · active | quiz coverage after 0145 |
|---|---|---|---|---|
| Walk Around | 1 | 3/7 · yes | 3/7 · 59 · yes | 7 of 7 modules, 4 q each (28) |
| Setting up the MPI | 2 | 0/1 · **no** | **9/10 · 11 · yes** | 0 — 36 drafts await Mitch |
| Four Step Close | 3 | 0/2 · **no** | **10/12 · 12 · yes** | 10 of 10 lesson modules (32: 8×3 + 2×4) |
| Success Cycle | 4 | 0/7 · yes | **12/19 · 67 · yes** | 0 — 48 drafts await Mitch |
| Overcoming Objections | 5 | 2/5 · yes | **12/15 · 41 · yes** | 2 of 15 (KN1: 5, KN2: 2); 40 drafts on modules 3–12 |
| Power of Positive Language | 6 | 0/7 · yes | 0/7 · 51 · yes | 0 — see item 11, 2-october-list |
| Lasting Impressions | 7 | 12/12 · yes | 12/12 · 12 · yes | 12 of 12 (38: 10×3 + 2×4, Parts 7 and 11 carry 4) |
| Name Tag | 8 | 10/10 · yes | 10/10 · 10 · yes | 2 of 10 (P1: 3, P9: 4); 32 drafts on the other 8 |
| Menus | 9 | 7/7 · yes | **9/9 · 9 · yes** | 0 — 28 drafts on the 7 lesson modules; closers carry no quiz by ruling |

**All nine core tracks are active, by computation** — `item_count` and `active`
come out of `recompute_certification_content()` (bar = 5), which 0144 runs and
then *checks*, refusing if the function's answer differs. The function was also
exercised over PostgREST as the service role (the pg_safeupdate path), not only
as postgres.

Published questions: 28 → **112** (28 Walk Around + 38 Lasting Impressions +
32 Four Step Close + 7 Name Tag + 7 Overcoming Objections). Six questions moved
to `library` with written reasons (three "Fit the Close to the Customer" —
no film exists; three Overcoming Objections deck questions that describe
neither film, judged against fresh whisper transcripts of both). 34 CSI
questions stay in library exactly as 0141 left them.

## What shipped

**0144 — four series find their tracks.** Get the Hell Out of Here 1–9 →
Setting up the MPI (modules named from the spoken slate titles in the unhomed
report, verbatim); Four Step Close 1–10 → Four Step Close (named from the quiz
bank's part titles 1–9 plus "After the Close" for module 10 — the film numbered
Part 10 is the workbook's Part 11, per 0140); Success Cycle 1–12 → Success
Cycle (named from the spoken titles in `content.title`); Selling Skills 10 →
Overcoming Objections modules 3–12 (slate titles; **The Steer Objection is
module 12 by ruling** — it carries no spoken part number, and nothing in Parts
4 or 6 suggests it is the missing Part 5); Menu Wrap-Up 1–2 → Menus modules 8–9
as the **closer worked example** (last module of the track, one film, no quiz).
No film was retitled; every attach is `module_id` + `module_order = 1` +
`placement = 'daily_craft'`; every Knowledge Notes module was **moved** to the
end of its course, never dissolved; `module_completion` count asserted
unchanged.

**0145 — questions meet their modules.** Joins on `content_id` throughout
(the fact 0140 recorded), except the CSI seven and the Overcoming Objections
deck, where the migration documents the ruling and the transcript comparison
that authorized each attach.

**0146 — 184 drafts, nothing published.** See below.

**The quiz-waiting link (WP3).** Shipped the **fallback**, deliberately. The
in-loop quiz (slot 3 on the day a module closes) needs a day-stamp field, a
day-gate leg, an inline grading surface inside DailyFlow's 2,000-line stepped
ritual, and a ruling on whether a loop-morning quiz pays `sand_module` — a
product decision `lib/lms.ts` explicitly records as untaken. None of that
should move the night before sixty advisors meet the loop. What shipped:
`pendingQuiz()` in `lib/loop.ts` — the exact predicate the in-loop build will
use (items done per `gating_content_types()`, published questions, no passing
attempt, not completed, first in track order) — surfaced as a gold-bordered
**"Quiz waiting: Walk Around — 1. The Walk-Around Routine"** link on the
celebration screen and the done-for-today screen, pointing at
`/library/m/<id>/quiz`, which already gives, grades, completes and accrues.
One grading path, reused by reference. The in-loop build is item 20 on the
2 October list.

## Acceptance transcript

`npm run accept:lock-basic`, against local Supabase carrying the restored
production dump + 0144/0145/0146. The advisor is a real advisor-only account
selected **by id** (advisor-only membership at a provisioned rooftop); the
admin is a real admin account. Every check names its viewer.

```
advisor-only account 921e2537-54c8-4398-9d1d-13b93e70cd97 at rooftop e5847ebd-…
admin account        78929620-f92b-416f-80ac-41fcc3a6e3e8

ok    recompute_certification_content() over PostgREST as service role
ok    admin reads 112 published questions (got 112)
ok    every published question carries module_id and content_id (0 missing)
ok    no library question carries a module_id
ok    quiz_question returns nothing to a plain advisor (RLS refusal)
ok    all 12 Lasting Impressions modules show has_quiz to the advisor (got 12)
ok    quiz_question_public serves 38 LI questions, 3-4 per module (got 38)
ok    quiz_question_public refuses a `correct` column
(setup) 59 Walk Around items marked complete for the advisor
ok    pickItem serves GTHOOH Part 1 in "The easiest sell you'll ever make"
      on Setting up the MPI
ok    completing it serves Part 2 in "The speech"
ok    pendingQuiz names "1. The Walk-Around Routine" on Walk Around first
ok    after a pass, pendingQuiz moves to module 2
ok    Setting up the MPI has no published questions (population for the negative)
ok    an items-done module with no published questions is never offered —
      pendingQuiz is quiet (got null)

14 passed, 0 failed
```

One scope note on "as authenticated": `quiz_question` is admin-only under RLS,
so the whole-bank assertion runs as an authenticated **admin** over PostgREST —
the role that can actually see the bank. The **advisor** run proves the other
halves: the base table refuses them (not vacuously — the same session then
reads 38 questions through `quiz_question_public`), and the public view still
exposes no `correct` column.

## The 184 drafts, and where Mitch reviews them

4 questions per module for all 46 empty modules — 36 Setting up the MPI, 48
Success Cycle, 40 Overcoming Objections, 32 Name Tag, 28 Menus. Every one
drafted from the film's own transcript (whisper `small.en`, 30 Sep, from the
published masters), in the bank's existing shapes: two Multiple Choice, one
True/False, one **What Do You Say Next** scenario per module (asserted in
0146). `source = 'ai_generated'`, `status = 'draft'`, `module_id` and
`content_id` set, `deck` = track, `film` = slate title. Drafts gate nothing and
serve nowhere until published.

**Finding: there is no admin screen for reviewing draft quiz questions** —
nothing under `/admin` touches `quiz_question`. Until one exists the review
surface is `reports/quiz-drafts-<track>.md` (five sheets, generated from the
staged rows, keyed answers marked).

## The INGEST.md naming addition

Two title forms added to the naming law: `<Track> — Opener — Mitch Hardt — v1`
and `<Track> — Closer — Mitch Hardt — v1`. An opener's destination is
`certification.entry_film_content_id` (set by migration after Ryan publishes;
the loop already handles it — no code change; eight tracks are NULL today,
Menus has its opener). A closer is the **last module of its track** — one film,
no quiz, sorted after everything — with Menu Wrap-Up 1–2 as the worked example
in 0144. A slate naming a track that doesn't exist by that name is a hold.
**Proposal, not built:** an `exit_film_content_id` mirroring the entry gate
would make the closer a property instead of a sort-order convention; the
convention ships for 1 October because it needs no schema and `trackComplete()`
needs nothing new. If Mitch's closers arrive for tracks whose cue modules still
trail the lessons (all four 0144 tracks), the closer module sorts after those
too — the migration that attaches each closer states its sort explicitly.

## Corrections to things stated earlier

1. **"Success Cycle has 0 videos" was false when written.** The hopper counts
   films *attached to modules*; twelve published Success Cycle films existed
   unattached. Corrected in `reports/unhomed-series-for-mitch.md` (dated note)
   and in item 11 of the 2 October list, which had leaned on it. The hopper
   gains an unattached-films column (item 19).
2. **The production migration ledger stops at 0133.**
   `supabase_migrations.schema_migrations` records nothing after 0133, while
   the *effects* of 0134–0143 are all present (probed individually). The next
   `supabase db push --linked` — which `db:migrate` runs — will try to re-apply
   0134 onward. 0140/0142/0144/0145/0146 are proven re-runnable; the rest of
   the range is not. **Reconcile the ledger before applying 0144** (item 21).
3. **The chain could not replay from 0140 on a fresh local** — 0140 asserted 70
   film joins on a database that has no films, and 0143's proof block refused a
   database with no cue modules. Both are repaired in this PR with
   population-scoped assertions (production behavior unchanged: 0140 takes its
   early return, 0143 still proves both directions wherever there is data).
   Found only because this brief demanded the full replay; the earlier
   validations were run against restored dumps.
4. **`content.source_filename` does not match the disk for the Craft masters.**
   The column reads `… — Mitch Hardt — v1.mov`; the files read
   `… (Mitch Hardt) — v1.mov`. Joined on the on-disk spelling instead
   (instance five of the canonical-versus-source confusion, 2-october-list
   item 5).

## For Ryan

- **Apply order:** reconcile the schema_migrations ledger, then
  `npm run db:migrate` for 0144 → 0145 → 0146. All three are idempotent and
  refuse partial states. After apply: `npm run check:gating`, and the loop
  preview at `/today?preview=` plus one real advisor morning.
- PR opened against `main`; merge is yours. Vercel deploys on merge.
- WP0 note: this work verified 0140–0143's *effects* in production
  individually; `check:gating` green (run twice, service role, against prod).
