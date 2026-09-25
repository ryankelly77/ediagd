<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Standing rules

<!-- Kept below the generated block above on purpose: that section is
     machine-managed and regenerating it must not take these with it. -->

## A migration applying cleanly is not evidence that a function works

A function shipped in a migration must be exercised **by the role and the path
that will actually call it**, or it is untested.

`recompute_certification_content()` ended with a `WHERE`-less `UPDATE`. The
migration applied without complaint, `supabase db reset` was green, and the
function threw `UPDATE requires a WHERE clause` for every caller — because
Supabase runs pg_safeupdate for the API roles and `psql` as `postgres` does not.
It was caught only by a suite that called it over PostgREST the way the
application does. "The migration succeeded" measured the wrong thing.

The same rule covers privileges, RLS and `search_path`: a `SECURITY DEFINER`
function tested as its owner, or an RLS policy tested as the service role, has
been tested in the one context where the thing it guards cannot fail.

**In practice:** after writing a DB function or policy, call it as `authenticated`
through PostgREST — and where it is meant to refuse, assert the refusal. See
`npm run accept:certification`, which does both, and which proves it is not
vacuous by failing when the policy is reverted.

This is the same failure as trusting a ledger that records what a script
intended rather than what it did, and as trusting a document's version label
over its contents. The evidence has to come from the thing itself, under the
conditions it will really meet.

## Architecture of record

`TWO_LADDERS.md` describes the daily loop and how it walks the certification —
the two morning types, why the pitch slot is derived and the item slot is not,
track films as entry gates, and the naming the schema must follow. Read it
before touching `/today`, the loop's selection logic, or anything that decides
what a module or a track contains.

`PHASE_3_PLAN.md` sequences the build against it and says which phase is in
hand. A phase is worked one at a time; scope named as a later phase is not
picked up early, and scope marked proposed is not built at all.

Where a prompt and these documents disagree, say so in the report rather than
picking one. Two documents disagreeing about the same fact is the bug.

## A label is not evidence of what is behind it

A thing that names what it shows must be checked against what it actually shows,
**for the viewer who will really use it** — not for the author, and not for the
role that happens to be convenient at the console.

Five instances inside a fortnight, all the same shape and all green the whole way:

- `has_performance_surface()` keyed on `auth.uid()`, so the gate written to
  exclude technicians also excluded the backend. The derivation would have
  returned null for every advisor forever.
- The Daily Loop preview walked the real morning as an admin, who has no DMS
  book, and so served a two-slot morning every time. The one screen the phase
  existed to show was unreachable from the menu claiming to show it.
- A sync reported `dateModified` as its cursor while resuming from another
  field. The runner watched it, saw it unchanged, and announced success with ten
  months missing.
- A backfill described as catching up was walking away from its target.
- `check:nav` would have passed while checking nothing, because `/service` sat
  outside its watched trees — the exact failure its own comment records.

None of these raised an error. Each returned a confident wrong answer, which is
worse than a crash because nothing looks for it.

**One sub-pattern has now appeared three times and has earned its own name: a
gate keyed on a role that excludes the viewer it exists to protect.**

- `has_performance_surface()` keyed on `auth.uid()`. Written to exclude
  technicians, it also excluded the **service role** — so every server-side read
  of the store benchmark returned a 200 with nothing in it, and
  `derive_focus_family` would have returned null for every advisor forever.
- `op_code_family` is admin-scoped, so `pickPitch` read the code list **as the
  advisor**, got zero rows and no error, and served a two-slot morning to
  everybody.
- `dms_advisor_read` grants select to platform owner, admin and manager.
  `/advisor` uses it to say **whose book these numbers are** when the roster name
  differs from the viewer's — the one safeguard against reading your figures over
  a colleague's. **Advisor is not on that list**, so the disclosure renders for
  admins and is silent for the only people it protects.

Each time, the gate was correct about who it excluded and wrong about who it
therefore served. **Name the roles that will really call it — including
`service_role` and including the least-privileged one — and check the answer for
each.** A permission written as "not X" has decided something about every role
that is not X, and one of them is usually the caller.

## A defect you find is a class, not an instance

Rule two says check the label against what is behind it. This is the other half:
**once you have found one, go and ask where else the same question is asked.**

0102 wrote this down, in a comment, and it is exactly right:

> *"`swell.current_len` is only recomputed when somebody COMPLETES a day, so an
> advisor who ran a 3-day streak and then missed a work day still reads
> `current_len = 3` until their next completion. Sending them 'Day 3 is on the
> line' would be a lie about a streak that is already gone."*

The bug was identified, understood, and correctly defended against — with
`previous_scheduled_day()`, in the **notification layer only**. Twenty-four
migrations later the screens were still reading the same number raw, and the app
told a lapsed advisor "Day 7 holds today. Three minutes on Monday makes it Day
8" before resetting them to Day 1 for doing it.

Nobody was careless. The fix went exactly where the bug was found. **What nobody
did was ask who else reads `current_len`** — which is one `grep`, and would have
found the answer two years earlier.

**In practice:** when you fix something, write down the *question* the bug was an
answer to — "who reads this value raw", "which roles does this gate exclude",
"what else pages without an ORDER BY" — and then answer it everywhere before you
close the work. If the sweep is too large for the change in hand, say so and
record the question; an unasked question is the thing that survives.

And be suspicious of a fix that lands in one layer. A value read in one place is
rare; the same value is usually read by a screen, a notification, an export and a
report, and only one of them was in front of you.

## A sample is evidence about the sample

A check is evidence about **the thing it checked** — no wider. State the scope
before the finding, because a scoped measurement reported as a general one is a
confident wrong answer, which this file already says is worse than a crash.

Four instances, all of them mine:

- A trim verifier iterated the *rename* set and counted 51 never-uploaded MENU
  films as "not checkable" rather than "not applicable". `72 + 52 = 124`, and the
  upload set was 73. The table described a population that was not the one it
  named.
- Reporting `CANONICAL_STAGES` as the four values **in use** rather than the six
  that exist. Objections is canonical; the sample said otherwise and a ruling was
  made on it.
- `xcodebuild` for the **simulator** succeeding, recorded as "the iOS shell
  builds". Device archiving needed a platform component that was not installed,
  and the error even misattributed itself — "SDK not installed" while the SDK was
  demonstrably installed.
- Counting non-core items through `certification_course → module → content` and
  writing *"the only non-core certification with content is Chemical Warranty"*.
  That was true of the path walked and false of the library: **42 via the
  certification path, 1,582 via `service_family_content`.** A path-scoped count
  stated as a fact about the subject.

**In practice:** say what was measured, over what population, by which path,
*before* saying what it means. If the number could be reached by a second route,
measure both and reconcile them — the reconciliation is the proof. Yesterday's
cue dump and today's differed by exactly the films published in between, and that
is what made both numbers trustworthy.

## Join on what was observed, not on what was derived

Two records agree when they are keyed on something both of them **saw**. A
normalised, reformatted or re-derived form of a key is a second definition, and
it will match nothing on the day the derivation changes.

`scripts/trim-slates.ts` compared the plan against `content.canonical_filename`
— a form the ingest *invents*, moving the voice into parentheses. The plan holds
the name the file has **on disk**, which is also what `content.source_filename`
records. Measured on the batch: **0 of 73 matched on `canonical_filename`, 73 of
73 on `source_filename`.** It then skipped all 73 silently and reported success.

**In practice:** when joining two systems, pick the field each one *observed*
rather than computed. If only a derived key is available, assert the match count
before acting on it, and refuse rather than continue on zero.

## Removing an impossibility inherits the other side's lessons

When a change makes something possible that used to be structurally impossible,
every safeguard the codebase never needed becomes required at once — and the
lesson has usually already been paid for somewhere else in the same file.

`content.module_id` is a single FK, so one film belongs to one module and craft
`item_count` can safely be `count(*)`. Attaching one film to several modules —
which is what *"Part 2 covers topics 2, 3, 4 and 6"* means — removes that
guarantee and the count inflates threefold. `certification.item_count` gates
`certification.active` and is the number the credential claims.

**The fix is already twenty lines below, on the service branch:**
`count(distinct sfc.content_id)`, with the comment *"because a row reachable both
ways must not be counted twice."* The service side learned it in 0116; the craft
side never had to.

**In practice:** before removing a constraint, ask what the constraint was
silently guaranteeing, then grep for the code that relies on that guarantee —
starting with whichever part of the system never had it.

## A definition that was only true when it was written

`service_family_content` carried this, and it was correct on the day it was
typed:

```sql
true as coachable   -- A DIRECTLY TAGGED ROW IS COACHABLE BY DEFINITION
```

It was a fact about **who was doing the tagging** — at that moment, only a human
hand-tagging a family for coaching — recorded as a property of **the data**. Then
it sat there looking like a definition long after the thing it described had
changed, and 0128 had to add reference content that is tagged with a family
precisely so a shelf can group it and explicitly not so the loop can serve it.

**An assumption wearing a definition's clothes is worse than a stale comment,
because it actively instructs the reader not to look.** "By definition" and "of
course" are the two phrases that end an investigation, and both of them were
load-bearing here: the arm said `true` unconditionally, so a menu film carrying
its family would have arrived in the pitch slot announcing itself coachable, past
a `coachable` filter looking the other way.

**In practice:** when a comment says something is true *by definition*, ask what
would have to change for it to become false — and if the answer is "somebody
starts creating rows a different way", it is an invariant that needs enforcing
rather than a definition that needs stating. Write the condition, not the claim.

This is the same failure as [a label not being evidence of what is behind
it](#a-label-is-not-evidence-of-what-is-behind-it), one level more dangerous,
because the label is asserting it does not need checking.

## Never identify a person by name

**Ids only** — in fixtures, in scripts, in production paths, everywhere. Names
collide, and a query that matches on one will happily return the wrong person
without erroring.

Two instances, one layer apart:

- A screenshot fixture looked an advisor up by `app_user.full_name`, got the
  wrong one of two rows sharing that name, and **backfilled progress onto a user
  who was not the browser session** — then reported a state that belonged to
  nobody on screen.
- `membership.op_code_id` pointed four app accounts at other people's DMS books,
  which is the same defect in production: **reading from the wrong person's
  record because the identifier was human-readable rather than unique.** One of
  them showed an advisor a colleague's attach rates labelled "Your".

Derive the id from the thing you actually mean — the session, the row you just
inserted, the membership you are acting on — and carry the id. A name is for
printing, never for matching. If a lookup must start from a name, assert it
returned exactly one row before using it.

**In practice:** when you write or touch anything that reports, previews,
labels, counts, or claims a state — a menu entry, a badge, a cursor, a progress
number, a check — name the viewer it will really have and exercise it as them.
If the answer differs from the label, the label is the bug. If a check cannot
fail, it is not a check.

## "Do not commit" means nothing reaches `main` without Ryan

The rule has always been about the **gate**, not about whether a commit object
exists. Ryan sees the work before it reaches production. A branch is not
production; a PR is the review artifact; the merge is Ryan's act.

- **You may** commit to a working branch and push that branch.
- **You may** open a pull request against `main`.
- **You may not** commit to `main`, merge your own PR, or route around a merge
  that is refused.

The permission stays where it is. If a merge is declined, that is the answer —
not a problem to solve from another direction.

**This matters more than it looks, because `main` *is* the deploy.** Vercel
builds on merge, so a commit to `main` deploys itself before anyone has read it.
For the same reason there is **one deploy path and it is `main`**: do not link
the Vercel CLI or deploy a working tree. A second path means git-deploy and
CLI-deploy can disagree about what is live, and nobody finds out until they do —
which is this file's other standing rule wearing an infrastructure costume.

*Written after the rule's wording stopped a deploy mid-phase. The instinct to
stop was right; the ambiguity was the bug, so it is fixed here rather than
answered once.*

## The Drop Zone ingest pipeline

`INGEST.md` is the ingest procedure — the seven phases from Mitch's raw uploads to draft
content in Mux, the naming law, and the trim doctrine. It carries the hard-won parts:
reshoots replace in place rather than creating rows, whisper mangles attributions so a
quote's author comes from the Quote Master and never from the transcript, and the quote
matcher assigns greedily over a shared pool so matches are refused by the voice gate
rather than ruled out one at a time.

**Read it before touching anything in the Drop Zone**, and before running the ingest,
slate, trim or replace scripts.

Two gates in it are absolute: nothing is renamed and nothing is uploaded without Ryan
confirming the exact proposal shown, and a trim is verified from durations rather than
from the ledger — `replace:video` trims inline without writing a ledger row, so the
ledger is incomplete by construction and a double-trim is invisible.

It carries YAML frontmatter because it is also the source for the `/ingest` skill. To
make the slash command live without a second copy that can drift:

```
mkdir -p .claude/skills/ingest
ln -s ../../../INGEST.md .claude/skills/ingest/SKILL.md
```
