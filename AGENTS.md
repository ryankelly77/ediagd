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
