# Manager Meetings

A weekly film served to each rooftop's managers, and the screen they run the
meeting from. Built on `ediagd-manager`, in the `~/ediagd-manager` worktree.

## Branch rules

These are the rules for this branch specifically. They exist because
`.env.local` points at production and `main` is the deploy.

### Migrations are written and replayed locally, never applied

A migration on this branch is authored and replayed against **local** Supabase
only. `db:migrate` runs from `main` and from nowhere else — run from here it
would apply a branch migration to production, which is the one thing this
branch must not be able to do.

Migration files are **renumbered at merge time** to follow `main`'s latest.
Until then their numbers are provisional and will collide; that is expected.

### Merge `main` in at least weekly, and always before writing a migration

A migration number is only meaningful against a known latest. Writing one on a
stale base guarantees the renumber is wrong, and a number collision does not
announce itself — it just picks one of the two files.

### Nothing from this branch is cherry-picked to `main`

The branch lands as one reviewed merge or it does not land. A cherry-pick puts
a fragment of this work on the deploy without the review that was supposed to
gate it, and leaves the branch and `main` disagreeing about what shipped.

## Worktree layout

- `~/ediagd` stays on `main`. `db:migrate`, the Drop Zone ingest and the
  nightly sync all run from there.
- `~/ediagd-manager` is this branch. All Manager Meetings work happens here.

`.env.local` is not tracked, so it does not arrive with the worktree. Copy it
in to run anything that talks to Supabase — and note that copying it in is also
what makes the `db:migrate` rule above load-bearing rather than theoretical.
