# Two DMS op codes ruled by a click — 3 Sep 2026

## What happened

Ryan clicked the gold **"Rule it…"** button on two rows in section 2 of Dealer
Codes. Both were ruled instantly: no dialog, no preview, no choice of value.

    19:58:23–24   100     11 rows   canonical NULL   status no_match
    19:58:26–27   MISC    11 rows   canonical NULL   status no_match

Eleven rows each — one per Doggett rooftop — `origin admin`, `matched_by human`,
`effective_from 2000-01-01`, `updated_by` Ryan Kelly.

## Where the value came from

**Neither Mitch's proposal nor the automatic.** It came from an empty text box.

The row rendered `<input name="canonical" defaultValue={r.canonical ??
r.suggestion?.code ?? ""} placeholder="no match">` above a submit button. `100`
and `MISC` are Doggett's catch-all buckets — the two biggest by labor, and no
catalog name scored high enough to suggest anything — so both fields defaulted
to `""`. `ruleOpCode` read `""` as the deliberate ruling *"no code we have
fits"*, and stamped `matched_by: 'human'` because there was no suggestion.

**The placeholder became the ruling.** The outcome happens to be defensible —
nothing in our catalog does fit a bucket called `MISC` — but nobody chose it.

## Did any measured number move

**No, and it was checked rather than assumed.** `dms_op_code_map` is read by
nothing: `select count(*) from pg_views where definition ilike
'%dms_op_code_map%'` returns 0 outside its own `_live` view, and 0093 says so in
its comment. Snapshotting `advisor_family_attach_all` around the revert inside a
transaction: **16,379 rows before, 16,379 after, zero rows differing in either
direction.**

## The revert

The 22 versions were **retired, not deleted** — `retired_at = effective_from`,
which collapses each to an empty interval. That is what a correction means here:
*no period should ever have been measured under any of these*. The keys return
to having no live row, i.e. unruled, and the rows survive as evidence that the
write happened.

    dms_op_code_map_live          0 rows
    retired versions              11 for 100, 11 for MISC
    advisor_family_attach_all     16,379 rows, checksum 217,789.4
    checkmap                      all checks passed

## How it passed acceptance

The acceptance had two lines, and only one of them asked for a preview:

> *"confirm a deck-map proposal with one tap (preview shown), map an unmapped
> sub-category"* — **section 1**
>
> *"confirming one writes an effective-dated row that nothing else consumes"* —
> **section 2**

Section 2's line says nothing about a preview, and what I built satisfies it
exactly. So the gap was in the acceptance and I did not question it: I gave
section 2 a one-tap write from the first commit, and verified the thing I was
asked to verify.

It became dangerous three commits later. The "three weights" pass applied
section 1's vocabulary — gold, *"Rule it…"* — to section 2's form **without
re-examining whether one tap was legitimate on a row with nothing to confirm**.
Section 1's "Rule it…" is a `<Link>`; section 2's was a submit button. They
looked identical and did opposite things.

**Scope: the preview was skipped only on this path.** Section 1's unruled rows
navigate to the confirm screen (verified: `page.tsx` renders `<Link
href={reviewHref}>`), and its confirmable rows write exactly the family shown.

## The fix

`opCodeRowAction()` / `subCategoryRowAction()` in `lib/mapping/dealer-codes.ts`
decide navigate-or-write for both grains, holding one rule:

> A one-tap write is only legitimate when the value shown on the row is exactly
> the value recorded.

`scripts/dealer-row-scenarios.ts` asserts it over every state either grain can
be in, including that an unruled row of either kind can never produce a write.
The editable text box is gone from the row; `""` no longer means anything, and
"nothing fits" is an explicit option on the ruling screen.
