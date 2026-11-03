# Manager Meetings

A weekly film served to each rooftop's managers, and the screen they run the
meeting from. Built on `ediagd-manager`, in the `~/ediagd-manager` worktree.

## Branch rules

These are the rules for this branch specifically. They exist because
`.env.local` points at production and `main` is the deploy.

### Migrations are written and replayed locally, and applied by nobody here

A migration on this branch is authored and replayed against **local** Supabase
only. It is **applied only from the `~/ediagd` main checkout, by that
checkout's owner, at Ryan's instruction** — never from here. `db:migrate`
requires the main checkout anyway, and run from this worktree it would apply a
branch migration straight to production, which is the one thing this branch
must not be able to do.

**The number is taken when the PR is opened**, as the next free one after
current `origin/main`, and **checked again immediately before Ryan merges** —
because another branch can land a migration in between, and a collision does
not announce itself. It silently picks one of the two files.

That has already happened once on this branch: `0173` landed on `main` from
another branch while this plan was being written, so the next free number here
is `0174` rather than `0173`. Re-checking is not a formality.

### Merge `main` in at least weekly, and always before writing a migration

A migration number is only meaningful against a known latest. Writing one on a
stale base guarantees the number is wrong by the time it lands.

When a pull brings in somebody else's change to a file this branch also
touches, **take `main`'s version and re-apply only this branch's change on top.**
Never resolve a conflict by reverting their side.

### Nothing from this branch is cherry-picked to `main`

The branch lands as one reviewed merge or it does not land. A cherry-pick puts
a fragment of this work on the deploy without the review that was supposed to
gate it, and leaves the branch and `main` disagreeing about what shipped.

### Nothing on this branch writes from a Preview deploy

Vercel Preview points at the **production** Supabase project
(`kpbholbgfccwbzggcvbb`), and `SUPABASE_SERVICE_ROLE_KEY` is scoped to Preview
as well as Production — so a Preview build of this branch holds service-role
write access to live rooftops, past RLS.

**Fixing that is not this branch's work.** A separate staging database and the
Vercel environment variables that point at it are owned elsewhere, on their own
branch. This branch does not change Vercel environment scoping, and must not:
two agents editing the same environment is how the two deploy paths in
`AGENTS.md` come to disagree about what is live. Until that work lands:

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
somebody has to remember not to do.

### `vercel.json` is not this branch's file to edit

The serving cron needs one entry in `vercel.json`, and **this branch does not
add it.** Another branch has a pending one-line schedule change to the same
file, and a file with two editors at once is how one of them quietly loses.

So the last slice writes the route, the secret check and the Monday-and-store-date
rule, and then **asks** for the `vercel.json` line rather than committing it.
That is the right shape anyway: Vercel runs crons only on the Production
deployment, so the entry is inert on Preview and live the moment it merges —
which is exactly why it is somebody's deliberate act and not a side effect of
this branch landing.

## Worktree layout

**One agent per checkout, and this branch's is `~/ediagd-manager`.** Nothing
here runs git, a script or an edit in another checkout — not even a read-only
`git checkout`.

- `~/ediagd-manager` — this branch. All Manager Meetings work happens here.
- `~/ediagd` — the main checkout, somebody else's. Migrations are applied from
  there, by its owner, at Ryan's instruction.

`.env.local` is not tracked, so it does not arrive with a new worktree. It has
to be placed here directly to run anything that talks to Supabase; it is not
fetched out of another checkout. And because placing it here is what makes this
worktree able to reach production at all, it is also what makes the migration
rule above load-bearing rather than theoretical.
