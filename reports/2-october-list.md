# The 2 October list

Work deferred past the 1 October Doggett pilot launch, with the evidence that
put it here. Nothing on this list is a guess about what might be wrong; each item
is something that was measured and then deliberately not fixed.

---

## 1 · The identity key includes the voice, and 84 live films have none

**The exposure.** `identityOf()` strips only the version suffix, so the voice is
part of a film's identity. **84 of 321 live films carry no parenthesised voice;
43 of those have an op code** — ABT-054, ACO-055, ACR-047, BFF-012, CAF-002,
CLF-010, CLH-042, DFF-014, EAF-001, PSF-013, SRP-038, TMB-039, TRF-011. A reshoot
named with the voice does not match them, so it lands as a second live film at the
same stage instead of replacing one.

**Measured twice, not argued.**

- The 67-film dry run reported `0 would REPLACE` including `TMB-039 — MPI Setup`,
  which was demonstrably Mitch's reshoot. 0135 had to retire the v1 by hand.
- A three-film MINDSET batch: `All for One` was seen as a REPLACE, `Success Is a
  Choice` and `Tomorrow Me` came up "new". **Two of three**, because those two
  live rows carry no voice. 0137 had to close both.

**The three tests any new key must pass** — and if one fails, report the
collisions rather than tuning the key until the number goes green:

1. every live published film produces exactly one identity
2. the ten pairs retired in 0129 resolve **as pairs**
3. `SRP-038 — On the Drive` (320s) and `On the Drive, Part 1` (88s) do **not**
   match — a collision there would have destroyed 232 seconds

## 2 · A duplicate is evidence about vocabulary — harvest the Archive

**The idea, and it is better than the bug that produced it.**

`IMG_2593`'s spoken slate reads *"Serpentine Belt, Multi-Point Inspection,
Selling"* — a phrase matching no canonical stage, which had it held once as
"stage unclear". It turned out **byte-identical to `SRP-038 — After-MPI (Mitch
Hardt) — v2`**. That proves the phrase *is* how Mitch says After-MPI. It then
resolved `IMG_3063` — same phrasing, different op code — with no ruling at all.

> **Two byte-identical files where one carries a canonical name and the other
> carries a raw slate are a translation, for free.**

**There are 99 files in `04 - Archive`.** Some number of those pairs are slate
phrases nobody has mapped. Harvesting them would teach the matcher how Mitch
actually talks, which is what has cost the most hand-holding.

**And it is the argument for reading Archive before emptying it.** The folder is
currently treated as a bin; it is a bilingual corpus.

## 3 · The mileage shelf needs a second axis

15 films — MENU Seasonal (5), EV Series (4), Diesel (6) — are published as
`placement = 'reference'` with `mileage_rung` NULL, and **0136 asserts they carry
no rung on purpose.** A seasonal menu has no mileage.

The shelf is indexed by rung (`lib/mileage.ts` filters `.not("mileage_rung","is",
null)`), so these are live and invisible. That was accepted knowingly — published
and invisible beats sitting in a folder — but the shelf needs a category axis
before those 15 reach anybody.

## 4 · ANSWERED 29 September — the two cue measurements

Both questions from 0132 are now measured, and the answers are in `AGENTS.md` and
0143 rather than here.

**Does `contentComplete` count cues?** It did. `moduleRequirementsMet` selected
every published item in a module with no type filter, so Walk Around demanded
eleven completions to close one module, three of them film. **0143 fixed it** — an
allowlist of `advisor_video`, mirrored in `gating_content_types()` so the SQL view
and the TypeScript cannot drift, with `npm run check:gating` asserting they agree.

**Can the loop reach a cue other than by `module_id`?** In code yes — three paths,
by `op_code`, by `service_family`, and as a generic passage by `tier`. **In this
data, no:** of the 197 cues in certification tracks, **195 have neither
`service_family` nor `op_code`**, and library-wide **408 cues are reachable by
`module_id` and nothing else**. So 0132's fear was right and **detaching a cue
would strand it**. The escape route exists in the code and not in the data.

**What still waits:** the module collapse itself (Walk Around 7→3, Overcoming
Objections 5→2) is now unblocked by 0143 — cues no longer gate, so repointing them
costs an advisor nothing. But `module_completion_module_id_fkey` is still
`ON DELETE CASCADE` with rows behind it, so dissolving a module still deletes
completions. **Repoint, never dissolve.**

## 5 · The canonical-versus-source confusion, now four instances

Worth writing up as a worked example because it keeps recurring in new disguises:

1. `scripts/trim-slates.ts` matched 0 of 73 on `canonical_filename`, 73 of 73 on
   `source_filename`, and skipped all 73 while reporting success
2. a flagged-films join matched 1 of 30 for the same reason
3. "37 NOT FOUND" when all 37 were correctly placed
4. **0135's first predicate** used the on-disk spelling `TMB-039 — MPI Setup —
   Mitch Hardt — v2.mov`; the row reads `(Mitch Hardt) — v2.mov`. It would have
   matched nothing, taken the quiet "reshoot not present" path, and left both
   takes live — the exact outcome the migration exists to prevent

Related and now in `AGENTS.md`: two numbers with the same name from different
systems are not the same measurement. `duration_sec` is the trimmed Mux asset;
`ffprobe` is the untrimmed file. Eighteen files differed by a consistent ~5s and
that consistency is what made the wrong conclusion credible.

## 6 · Four `anon` views still unchecked

0133 revoked `anon` on `dealer_op_code_volume` and `dealer_sub_category_volume`
after confirming both returned customer row-level figures over PostgREST. Four
were checked and left alone — `family_pitch_supply`, `service_family_cue_count`,
`public_content_stats`, `quiz_question_public`. **The rest of the view catalog has
not been enumerated**, and a check that examines a hand-picked six is evidence
about six.

`quiz_question_public` exposes Mitch's question text with no `correct` column —
a product question rather than a security one, but it is a decision nobody has
made explicitly.

## 7 · Master-track names disagree with the architecture

`TWO_LADDERS.md` names three Master tracks; the database holds **Chemical
Warranty, Phones and Tones, A Day in the Life**. Two documents disagreeing about
the same fact is the bug, and it is not mine to resolve by picking one.

Bearing on this now: **Phones and Tones has 12 published films waiting** and
**Chemical Warranty is the likely home of Coverage is Key's 10** — see
`reports/unhomed-series-for-mitch.md`.

## 8 · Constraints and checks that are conventions rather than properties

- **`advisor_video` must have a placement** — currently a convention. A
  type-scoped constraint would make the unsafe state unrepresentable rather than
  merely avoided. 0128's NULL-placement hole is the worked example: a gate keyed
  on `placement = 'reference'` was correct and inert because 51 rows never
  acquired the value.
- **Enumeration derivation with an exhaustiveness test** — `CANONICAL_STAGES` was
  reported as the four values in use rather than the six that exist, and a ruling
  was made on that.
- **Adopt-the-view migration** — several readers still build their own copy of
  "what belongs to family F" rather than asking the one view.

## 9 · Make the quiz constitutive

Today the predicate is deliberately asymmetric, and it is written into `lib/lms.ts`
where the decision is made:

> **The film clause refuses on an empty set. The quiz clause passes on one.** A
> module with no film has nothing to complete. A module with no quiz has a lesson
> that was watched.

**Why it was not tightened on 29 September.** 250 of 257 module-bearing modules have
no published quiz. Making the quiz constitutive would have made every currently
completable module uncompletable at once — Walk Around, Menus, Overcoming
Objections, Name Tag, Lasting Impressions, Phones and Tones — on launch morning, in
front of sixty advisors, and it would have read like a correctness improvement.

**Why it is debt.** The settled rhythm is lesson plus quiz, and the site sells
knowledge gates rather than performance gates. **A module with no quiz is not a
knowledge gate.** 250 modules need questions before the clause can tighten, and 485
unplaced questions are sitting in the bank — which makes this a sequencing problem,
not a correctness one.

**The sequence:** route the 485 (they are pitch-deck questions keyed to op code and
stage, see item 12), author or place questions for the craft modules, then tighten.

## 10 · The 485 are pitch questions, not craft questions

Measured 29 September. They are already grouped — **107 groups, average 4.5, and 80
groups are exactly 5** — and the grouping is in `deck` and `film`, not in row order.
`id` is a random UUID and `created_at` has four distinct values across 513 rows, so
there is no insertion order to recover and none is needed.

`film` holds a **stage** — On the Drive, MPI Selling, At the Kiosk, Set Up the MPI —
and `deck` holds a service subject. **Their home is destination 4, op code plus
stage**, the same routing the 118 pitch films already use. They were never waiting
on craft modules.

**9 of 33 decks match an op-code name exactly.** The rest split into ~13 op-code
subjects under a different spelling (`A/C Odor Treatment`, `Wiper Blades`, `Brake
Fluid Exchange`) and ~11 genuinely craft decks (`Four voices`, `Lines`, `Sing It`,
`Vocabulary`, `The close`, `Wrap-Up`, `Pre-Write`, `The Big Ticket Visit`,
`Overcoming Objections`, `Selling speech`, `Setup speech`). An alias per subject
resolves the first group. Nothing is hand-mapped.

Also: **87 of them use `MPI Selling`**, which the naming law forbids in favour of
`After-MPI`.

## 11 · Is Power of Positive Language a track at all?

51 cues, **zero films in any state**, and its seven modules are named **Knowledge
Notes 1–6** and **Closing Strategies** — cue containers, not lesson names. It was
never structured to hold a film, which is the best explanation anybody has produced
for why nothing Mitch delivered was ever for it.

**So do not put six Positive Language films on a shoot list.** The prior question is
whether it is a track, the skill library's first resident, or a cue theme that runs
across every track. Ryan's, and a better question than when to shoot six films.

It stays **active and visible** meanwhile — Master ladder, eleven months of runway.

The two films that teach vocabulary — `Success Cycle, Part 2, Vocabulary That Sails`
and `Part 3, More Vocabulary` — are slated Success Cycle, published, unattached, and
**stay where the slate puts them** until Mitch says otherwise.

## 12 · Two modules show completed_at with items_done false

A narrow, honest inconsistency created by 0143 and left alone deliberately.

User `78929620` completed two **cue-only** modules under the old rule — `Brake
Fluid / Closing Strategies 6` and `The Walk-Around / 4. Raising a Problem Well` —
and both keep their `module_completion` row, because a row earned is not deleted.
Under the new predicate those modules have **no gating item**, so `items_done` is
now false while `completed_at` remains set.

Both statements are true and they describe different things: the module *was*
completed, and the items that now gate it are not done. Conflating them would make
`items_done` a lie.

The one visible edge: `library/m/[module]/quiz/page.tsx` redirects when
`!itemsDone`, so that user cannot reach the quiz for a module they already
completed. It affects one internal account, not a pilot advisor, and no credential
is lost — `craftComplete` reads `module_completion`, which is intact.

## 13 · The five held reshoots

`reports/five-reshoots-held.md`. All five are audibly fixed and all five drop
teaching that exists nowhere else, including the nine-part speech series. Needs
Mitch, not a migration.

## 14 · Three Walk-Around spellings

`The Four Minute Walk-Around`, `30 Second Walk-Around`, `2 Minute Walk-Around` —
plus Mitch's list of 26 against 29 in the catalog. Never reconciled.
