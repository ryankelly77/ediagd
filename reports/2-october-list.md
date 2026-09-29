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

## 4 · Two cue measurements, which gate the module collapse

0132 deliberately did **not** collapse Walk Around 7→3 or Overcoming Objections
5→2, and it cannot until these are answered:

- **Does `contentComplete` count cues, or only videos?** If cues count, repointing
  ~19 cues into each surviving module means an advisor ticks nineteen cues to
  finish one module — the model the video-is-the-curriculum ruling exists to end.
- **Can the loop reach a cue by any path other than `module_id`?** If not,
  archiving a module silently removes its cues from circulation.

`module_completion_module_id_fkey` is `ON DELETE CASCADE` and five completion rows
exist, so this is not a change to make on an assumption.

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

## 9 · The five held reshoots

`reports/five-reshoots-held.md`. All five are audibly fixed and all five drop
teaching that exists nowhere else, including the nine-part speech series. Needs
Mitch, not a migration.

## 10 · Three Walk-Around spellings

`The Four Minute Walk-Around`, `30 Second Walk-Around`, `2 Minute Walk-Around` —
plus Mitch's list of 26 against 29 in the catalog. Never reconciled.
