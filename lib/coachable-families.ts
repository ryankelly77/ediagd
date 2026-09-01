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
 * Families with ENOUGH published cues to fill a block without repeating.
 *
 * ---------------------------------------------------------------------------
 * THE THRESHOLD IS THE BLOCK LENGTH, AND THAT IS THE WHOLE POINT
 * ---------------------------------------------------------------------------
 * This used to be "at least one". The knowledge re-import showed why that was
 * the wrong number: it published a single Oil Change cue, which flipped the
 * family ON and would have given an advisor a six-day block with one cue behind
 * it — the same passage every morning for a week, which reads worse than the
 * honest empty card the gate exists to prevent.
 *
 * A block is `coaching_block_days` days long and serves one cue per day, so the
 * bar is that many distinct cues. Read from the SAME setting the block length
 * comes from, deliberately: two numbers that have to agree and are stored
 * separately are two numbers that will disagree the first time one is edited.
 *
 * A family that falls short is not broken, it is unfinished — and the shortfall
 * is a number Mitch can act on ("Oil Change: 1 of 6") rather than a name on a
 * list. `npm run preview:day` prints exactly that.
 *
 * Returns an EMPTY SET on failure, deliberately. The gate fails closed: a
 * database hiccup leaves the content-gated families uncoached for a page load,
 * which is invisible. Failing open would ship empty families to every advisor.
 * The seven always-on families in COACHABLE_FAMILIES do not read this at all,
 * so a hiccup can never blank Eddie's Pick entirely — see lib/advisor.ts.
 */
export async function loadFamiliesWithCues(
  client: Client
): Promise<ReadonlySet<string>> {
  const [{ data, error }, { data: settings }] = await Promise.all([
    client.from("service_family_cue_count").select("family, published_cues"),
    client.from("game_settings").select("coaching_block_days").limit(1).maybeSingle(),
  ]);

  if (error || !data) return new Set<string>();

  // Same fallback as loadBlockDays: the migration's default, not a magic number
  // invented here. Zero would turn the gate off entirely, which is the one
  // outcome a missing setting must not produce.
  const minCues = Number(settings?.coaching_block_days ?? 0) || 6;

  return new Set(
    (data as { family: string; published_cues: number }[])
      .filter((r) => Number(r.published_cues ?? 0) >= minCues)
      .map((r) => String(r.family))
  );
}

/**
 * Published cue count per family, for reporting the shortfall.
 *
 * Separate from the gate above because a caller that wants to SHOW the gap is
 * not the same as one deciding whether to coach, and folding both into one
 * return value would tempt a screen into re-deriving the threshold itself.
 */
export async function loadCueCounts(
  client: Client
): Promise<{ counts: Map<string, number>; minCues: number }> {
  const [{ data }, { data: settings }] = await Promise.all([
    client.from("service_family_cue_count").select("family, published_cues"),
    client.from("game_settings").select("coaching_block_days").limit(1).maybeSingle(),
  ]);
  return {
    counts: new Map(
      (data ?? []).map((r: { family: string; published_cues: number }) => [
        String(r.family),
        Number(r.published_cues ?? 0),
      ])
    ),
    minCues: Number(settings?.coaching_block_days ?? 0) || 6,
  };
}
