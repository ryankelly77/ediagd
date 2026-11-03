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

### Nothing on this branch writes from a Preview deploy

Vercel Preview points at the **production** Supabase project
(`kpbholbgfccwbzggcvbb`), and `SUPABASE_SERVICE_ROLE_KEY` is scoped to Preview
as well as Production — so a Preview build of this branch holds service-role
write access to live rooftops, past RLS. A separate Preview database is its own
task, landing this week. Until it does:

> **Nothing on this branch seeds, runs a cron, or writes to the database from a
> Preview deploy.**

**Preview is verified read-only.** Open the screens, read the numbers, check the
gates as each role. Nothing more.

**Any write-path proof runs locally, against a throwaway rooftop the same script
creates and deletes.** `scripts/focus-family-acceptance.ts` is the shape to
copy: it creates a rooftop, auth users, a period, DMS metrics, op codes and
films, exercises each path *as the role that will really call it*, removes
everything, and refuses any `SB_URL` that is not localhost.

The refusal is **by construction, not by convention.** `VERCEL_ENV` is read
nowhere in this codebase today; this branch adds one guard that every new write
path calls, so a write from Preview is a thrown error rather than a thing
somebody has to remember not to do. And no cron entry goes into `vercel.json`
until the branch ships — Vercel runs crons only on the Production deployment, so
that entry is inert on Preview and live the moment it merges, which makes it the
last slice rather than the first.

## Worktree layout

- `~/ediagd` stays on `main`. `db:migrate`, the Drop Zone ingest and the
  nightly sync all run from there.
- `~/ediagd-manager` is this branch. All Manager Meetings work happens here.

`.env.local` is not tracked, so it does not arrive with the worktree. Copy it
in to run anything that talks to Supabase — and note that copying it in is also
what makes the `db:migrate` rule above load-bearing rather than theoretical.
