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
