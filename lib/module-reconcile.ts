/* ============================================================================
   EDIAGD — a lesson that became finished while nobody was looking
   SERVER ONLY.

   ---------------------------------------------------------------------------
   THE GAP
   ---------------------------------------------------------------------------
   module_completion is written by exactly one function, completeModuleIfReady,
   and it is reached from exactly three places: the library deck, the quiz
   grader, and the morning loop. Every one of them is the moment a film or a
   quiz FINISHED.

   So a module whose requirements become met for any other reason is never
   written. A gating film unpublished, retired or swapped out; a quiz pulled; a
   content row re-pointed at another module. Each of those can make a module met
   after the fact, and nothing notices, because nothing finished. The advisor is
   then looking at a lesson every part of which reads complete, and a track that
   counts it as outstanding — a correct refusal with no visible reason, which is
   the failure this codebase calls worse than a crash.

   ---------------------------------------------------------------------------
   MEASURED BEFORE BUILT: ZERO INSTANCES TODAY
   ---------------------------------------------------------------------------
   14 advisors x 116 gating modules in production, 2 November: 13 complete, 22
   quiz-waiting, 0 met-without-a-row. Reconciled two ways — the pairs with every
   gating film done (35) equal complete + quiz-waiting + met-without-a-row.

   That number is the point of saying it. This is a STANDING GUARD, not a
   repair, and the one-time backfill that ships with it writes nothing today.
   An empty run is the correct result, not a broken script.

   ---------------------------------------------------------------------------
   TWO ROLES, AND EACH DOES THE HALF IT IS ENTITLED TO
   ---------------------------------------------------------------------------
   THE ADVISOR NOMINATES. Candidates come from my_module_progress through the
   advisor's own client, so entitlement decides what is even considered and the
   page cannot reconcile a module the advisor cannot see.

   THE SERVICE ROLE DECIDES. completeModuleIfReadyById re-asks
   moduleRequirementsMet as the service role, which is the authority on
   completion and the only thing that may write. A candidate that does not
   survive that check writes nothing. So this function cannot complete a module
   on easier terms than the quiz grader does — it is the same rule, asked again.
   ============================================================================ */

import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { completeModuleIfReadyById } from "@/lib/lms";

/* Structural, matching lib/daily.ts and lib/watch-gate.ts: these helpers only
   ever call `from`, and they are handed both the request-scoped client and the
   service client. */
type Client = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

/**
 * How many modules one page read will reconcile.
 *
 * A page read is not a batch job. The expected number is zero and the realistic
 * number after a content change is a handful, so a bound of twenty keeps a
 * pathological case from turning /certifications into twenty round trips —
 * and anything dropped is LOGGED rather than silently truncated, because a cap
 * nobody is told about reads as "there was nothing else".
 */
const PER_READ = 20;

export type ReconcileResult = {
  /** Modules this call wrote a completion row for. */
  written: string[];
  /** Candidates it found, before the cap. */
  found: number;
};

/**
 * Write the completion row for any lesson of this advisor's that is finished
 * and has no row.
 *
 * Returns what it wrote so the caller can read AFTER it and see the result.
 * Never throws: a reconcile that fails must not take down the page it was
 * tidying — the screen then shows the same thing it showed yesterday, which is
 * wrong but not broken, and the next read tries again.
 */
export async function reconcileModuleCompletions(
  client: Client,
  userId: string,
  rooftopId: string | null
): Promise<ReconcileResult> {
  const empty: ReconcileResult = { written: [], found: 0 };
  /* No rooftop, nothing to file against — module_completion.rooftop_id is NOT
     NULL, and inventing one would file a lesson at a store the advisor does not
     work at. */
  if (!rooftopId) return empty;

  try {
    /*
     * THE CANDIDATE PREDICATE, AND WHY IT IS NOT "met".
     *
     * items_done AND no completion row AND the quiz is not outstanding. A
     * module with a quiz the advisor has not passed is the OTHER bucket — it is
     * genuinely unfinished, the screens now say "Quiz waiting", and writing a
     * row for it would hand out a lesson nobody sat.
     *
     * `has_quiz` is only trustworthy here as of 0170: it used to read
     * quiz_question, which an advisor cannot select, so it was false for
     * everybody and this predicate would have nominated every quiz-waiting
     * module in the catalogue. The service-role check would have refused all of
     * them — so the bug would have been invisible and expensive rather than
     * wrong. Worth knowing before this predicate is ever relaxed.
     */
    const { data } = await client
      .from("my_module_progress")
      .select("module_id, items_done, has_quiz, quiz_passed, completed_at, total_items")
      .eq("items_done", true)
      .is("completed_at", null)
      .limit(200);

    const candidates = ((data ?? []) as {
      module_id: string;
      has_quiz: boolean;
      quiz_passed: boolean;
      total_items: number;
    }[]).filter((m) => Number(m.total_items ?? 0) > 0 && (!m.has_quiz || m.quiz_passed));

    if (candidates.length === 0) return empty;

    const take = candidates.slice(0, PER_READ);
    if (candidates.length > take.length) {
      console.warn(
        `[module-reconcile] ${userId}: ${candidates.length} lessons finished with no completion row; ` +
          `writing ${take.length} this read, ${candidates.length - take.length} left for the next. ` +
          `Run \`npm run backfill:modules\` to clear them in one pass.`
      );
    }

    const service = createServiceClient();
    const written: string[] = [];
    for (const m of take) {
      /* THE ONE WRITER. It re-checks the rule as the service role and refuses
         anything that does not hold; the primary key refuses a duplicate. */
      const r = await completeModuleIfReadyById(
        service as unknown as Client,
        userId,
        m.module_id,
        rooftopId,
        /* NO BONUS. The library pays sand_module when an advisor finishes a
           lesson; this is a row that should already have existed, and paying
           for it would mint currency on a page read. */
        0
      );
      if (r) written.push(r.moduleId);
    }
    return { written, found: candidates.length };
  } catch {
    /* Deliberately silent to the viewer — see the note above. */
    return empty;
  }
}
