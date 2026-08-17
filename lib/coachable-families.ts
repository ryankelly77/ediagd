/* ============================================================================
   EDIAGD — which families have something to coach with

   Mitch's August 2026 triage added six families (HVAC, Belts & Cooling, Wipers,
   Lighting, Suspension, Inspections) because his rulings routed real money at
   families that did not exist. None of them has a cue yet.

   A family with no cues must map and report but must not coach: putting a gap
   on an advisor's screen that opens onto an empty library is worse than not
   showing the gap. This resolves the "has cues" half of that gate — the
   "intended to be coached" half is COACHABLE_PENDING_CONTENT in lib/advisor.ts,
   and both must pass.

   Reads a view that aggregates in SQL. The obvious version — select the cues and
   group them here — reads 1,257 rows through a 1,000-row cap and comes back
   claiming several families have nothing, which is indistinguishable from the
   gate working.
   ============================================================================ */

/** Structural, matching the loose client type lib/advisor-data.ts already uses. */
type Client = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

/**
 * Families with at least one published cue.
 *
 * Returns an EMPTY SET on failure, deliberately. The gate fails closed: a
 * database hiccup leaves the six new families uncoached for a page load, which
 * is invisible. Failing open would ship empty families to every advisor.
 */
export async function loadFamiliesWithCues(
  client: Client
): Promise<ReadonlySet<string>> {
  const { data, error } = await client
    .from("service_family_cue_count")
    .select("family, published_cues");

  if (error || !data) return new Set<string>();

  return new Set(
    (data as { family: string; published_cues: number }[])
      .filter((r) => Number(r.published_cues ?? 0) > 0)
      .map((r) => String(r.family))
  );
}
