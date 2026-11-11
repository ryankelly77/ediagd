/* ============================================================================
   EDIAGD — which deployment this code is running on, and what it may write

   Vercel Preview resolves the PRODUCTION Supabase project
   (`kpbholbgfccwbzggcvbb`): there is one `NEXT_PUBLIC_SUPABASE_URL` scoped to
   both Production and Preview with no branch override, and
   `SUPABASE_SERVICE_ROLE_KEY` is scoped to Preview as well. So a Preview build
   of any branch holds service-role write access to live rooftops, past RLS.

   A separate staging database and the Vercel variables that point at it are
   owned elsewhere, on their own branch. Until that lands, the Manager Meetings
   branch rule is:

     Nothing seeds, runs a cron, or writes to the database from a Preview
     deploy.

   ---------------------------------------------------------------------------
   BY CONSTRUCTION, NOT BY MEMORY — AND WHY THAT PHRASE IS EARNED HERE
   ---------------------------------------------------------------------------
   AGENTS.md: "prefer a construction where the unsafe state cannot be
   represented over one where it is merely avoided." A rule written in a
   document is a thing every future write path has to remember; a call that
   throws is a thing it cannot forget, because the failure arrives the first
   time anybody exercises the path on Preview.

   This is deliberately NOT a silent no-op on Preview. A write that quietly
   does nothing is the confident wrong answer this project keeps paying for —
   the caller would report success, the row would be absent, and the two would
   never be reconciled. A throw is loud at the only moment anybody is looking.

   ---------------------------------------------------------------------------
   WHAT THIS GUARD IS NOT
   ---------------------------------------------------------------------------
   It is not a security boundary and must not be read as one. The service-role
   key is genuinely present in a Preview build, so anything running there CAN
   write; this stops our own code from doing it by accident. The boundary is
   the Vercel environment scoping, and fixing that is the staging branch's work
   and explicitly not this branch's.

   It also says nothing about local development. `VERCEL_ENV` is undefined on a
   developer machine and on a local `next build`, and local is exactly where
   this branch's write-path proofs are supposed to run — against a throwaway
   rooftop the test creates and deletes. So an absent value is a pass, not a
   refusal, and `scripts/focus-family-acceptance.ts` keeps its own separate
   localhost assertion because that one IS about the database being addressed
   rather than about which deployment is addressing it. Two different
   questions, two different guards; neither substitutes for the other.
============================================================================ */

/**
 * The Vercel deployment environment, as Vercel sets it.
 *
 * `VERCEL_ENV` is read NOWHERE ELSE in this codebase — verified by grep across
 * `main` before this file was written — so this module is the only definition
 * of "which deployment am I", and there is no second one to drift from it.
 *
 * Read through a function rather than captured at module load, because a
 * module-level constant would be baked in at build time and could not be
 * exercised by a test that varies it. The cost is a `process.env` lookup per
 * call, on a path that is about to do database I/O.
 */
export function deployEnv(): string | undefined {
  return process.env.VERCEL_ENV;
}

/** True only on a Vercel Preview deployment. */
export function isPreviewDeploy(): boolean {
  return deployEnv() === "preview";
}

/**
 * Refuse to proceed if this is a Vercel Preview deployment.
 *
 * Call this FIRST in any path that writes to the database — a seed, a cron
 * route, a server action that inserts or updates. On Preview it throws; on
 * production, on a developer machine, and anywhere `VERCEL_ENV` is unset it
 * does nothing at all.
 *
 * @param what names the operation in the error, so a thrown guard in a log
 *             says which write was refused rather than only that one was.
 * @throws Error when running on a Vercel Preview deployment.
 */
export function refuseWriteOnPreview(what: string): void {
  if (!isPreviewDeploy()) return;

  throw new Error(
    `Refusing to ${what} from a Vercel Preview deploy. ` +
      `Preview resolves the PRODUCTION Supabase project and carries a ` +
      `service-role key, so this would write to live rooftops past RLS. ` +
      `Preview is read-only on this branch: run write-path proofs locally ` +
      `against a throwaway rooftop instead. See MANAGER_MEETINGS.md.`
  );
}
