/* ============================================================================
   EDIAGD — which rooftop does this record count against

   One definition, because there were two and they disagreed.

   `completeDayAction` preferred an advisor membership, then a manager one, then
   whatever came first. `completeLibraryItem` took

       membership … eq("active", true) … limit(1)

   with NO ordering and a comment saying "any active membership will do; the
   entitlement question was already settled by the read above". The entitlement
   question was indeed settled. A DIFFERENT question was not: the rooftop on a
   content_progress row is what `team_videos_completed` filters on, so a
   completion stamped with the wrong one of a person's two rooftops is invisible
   on their manager's Team screen — silently, with no error, which is this
   codebase's named worst failure.

   The case that found it was a manager who is also an advisor. Valerie
   Patterson holds both memberships at Beaumont — 0166 records that both of
   Beaumont's managers do — and reported on 10 November that the Team tab said
   "No videos completed today" for her on a day she had been paid Sand Dollars
   for.

   ---------------------------------------------------------------------------
   AND `limit(1)` WITH NO ORDER BY IS NOT A CHOICE, IT IS A COIN
   ---------------------------------------------------------------------------
   Postgres may return either row, and nothing requires it to return the same
   one twice. So the old library path could stamp this morning's lesson with one
   rooftop and this afternoon's with the other — and `memberships[0]` in the
   daily path has the same hole behind its role preference. Both are closed
   here: the tie-break is a stable sort on the rooftop id, so two reads of the
   same memberships always choose the same rooftop.

   ---------------------------------------------------------------------------
   WHAT THIS IS NOT
   ---------------------------------------------------------------------------
   NOT an entitlement check, and it must never be mistaken for one. It answers
   "which of this person's rooftops owns this record" and assumes the caller has
   already established that they may create it at all. The daily path's refusal
   of a technician-only account stays where it is, in the action, because it is
   a statement about who has a daily loop and not about rooftops.
============================================================================ */

/** One row of `membership`, narrowed to what the choice reads. */
export type RooftopCandidate = {
  rooftop_id: string;
  role: string;
};

/**
 * The rooftop a record belongs to, from this person's ACTIVE memberships.
 *
 * ADVISOR FIRST. An advisor membership is the one that carries an op code, a
 * DMS book and a performance record, so it is the rooftop every number about
 * this person is already keyed to. A manager membership is a permission to read
 * other people's rows; stamping somebody's own lesson with it files their work
 * under the store they supervise rather than the store they work.
 *
 * Returns null when the list is empty. The caller says what that means to it —
 * "You're not on a rooftop yet" in the library, a named refusal in the daily
 * action — because the two surfaces owe the advisor different sentences.
 *
 * THE CALLER PASSES ONLY ACTIVE MEMBERSHIPS. This function does not filter, on
 * purpose: an `active` column it read would be a second place for that rule to
 * live, and the query that fetches the rows is where it belongs.
 */
export function chooseRooftop(
  memberships: readonly RooftopCandidate[]
): string | null {
  if (memberships.length === 0) return null;

  /* STABLE BEFORE PREFERRED. Sorting first means the fallback arm — and the
     advisor arm, for somebody with advisor memberships at two rooftops — picks
     the same row every time rather than whichever Postgres felt like. The id is
     an arbitrary tie-break and says so; what matters is that it is the SAME
     arbitrary tie-break on every read. */
  const ordered = [...memberships].sort((a, b) =>
    a.rooftop_id.localeCompare(b.rooftop_id)
  );

  return (
    ordered.find((m) => m.role === "advisor")?.rooftop_id ??
    ordered.find((m) => m.role === "manager")?.rooftop_id ??
    /* THE TECHNICIAN ARM IS HERE FOR THE SITES THAT HAVE NOT ADOPTED THIS YET.
       No current caller needs it — `completeDayAction` refuses a
       technician-only account by name before it gets here. But three sites that
       should eventually use this function prefer technician over the fallback
       today (recordGateMetAction, /today and /), and a helper WITHOUT the arm
       would silently change which rooftop their watch gate is filed at and
       which screen they are routed to on the day somebody adopts it. Carrying
       the arm makes adoption a no-op for them; dropping it later is a decision
       somebody has to make out loud. */
    ordered.find((m) => m.role === "technician")?.rooftop_id ??
    ordered[0].rooftop_id
  );
}
