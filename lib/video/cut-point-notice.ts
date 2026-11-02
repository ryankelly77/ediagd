/* ============================================================================
   EDIAGD — what to say about a cut point after a replacement
   PURE. No fs, no network, no Mux. The caller reads the plan; this decides the
   words.

   ---------------------------------------------------------------------------
   WHY THIS IS NOT FOUR console.log CALLS INSIDE replace-video.ts
   ---------------------------------------------------------------------------
   Because it is the one new behaviour in "replace:video never trims", and it
   fires at the very END of a run — after the upload, the sync gate, the swap
   and the vertical derive. There is no way to reach it without a real 4K
   upload against production, so inside the script it would be a branch nobody
   could exercise before trusting it.

   Out here it is four inputs and four strings, and the scenarios can prove all
   of them in a second. That is the same reason lib/watch-coverage.ts exists:
   "does a scrub break the gate" became a test rather than a page you had to
   load and drag a scrubber on.
   ============================================================================ */

/** A row of reports/trim-plan.json, narrowed to what this needs. */
export type PlanCutRow = {
  id: string;
  title?: string;
  proposedStart?: number | null;
  proposedEnd?: number | null;
  /** The plan's own judgement of whether it could read the film confidently. */
  confident?: boolean;
};

export type CutPointNotice = {
  /**
   * `cut`      the plan names a cut and the film is live untrimmed
   * `no-cut`   a plan row exists and proposes nothing
   * `no-row`   no row for this film at all
   * `no-plan`  there is no plan file in this checkout
   */
  kind: "cut" | "no-cut" | "no-row" | "no-plan";
  lines: string[];
};

/**
 * What to print, given the plan rows the caller read (or null for no file).
 *
 * EVERY CASE SAYS SOMETHING. A run that ends "Done." over a film the plan says
 * to cut is a silence exactly where the handover is — and "no cut point on
 * file" is a different and useful statement from saying nothing, because on an
 * untrimmed upload it is what tells the operator to go and measure. A check
 * that is silent by default is not a check; the same is true of a handover.
 */
export function cutPointNotice(
  rows: PlanCutRow[] | null,
  contentId: string
): CutPointNotice {
  const cmd = [
    `      npm run trim:apply -- --only=${contentId}            # report`,
    `      npm run trim:apply -- --apply --only=${contentId}    # cut`,
  ];

  if (rows === null) {
    return {
      kind: "no-plan",
      lines: [
        "No reports/trim-plan.json in this checkout, so no cut point could be looked up.",
        "If this film has a spoken slate, measure it:  npm run trim:measure",
      ],
    };
  }

  const hit = rows.find((r) => r.id === contentId);
  if (!hit) {
    return {
      kind: "no-row",
      lines: [
        "No cut point on file for this film. It is live UNTRIMMED.",
        "If it has a spoken slate, measure it first:  npm run trim:measure",
      ],
    };
  }

  const start = hit.proposedStart ?? null;
  const end = hit.proposedEnd ?? null;
  if (start == null && end == null) {
    return {
      kind: "no-cut",
      lines: ["reports/trim-plan.json holds a row for this film with no proposed cut — nothing to apply."],
    };
  }

  return {
    kind: "cut",
    lines: [
      "─────────────────────────────────────────────────────────────────",
      "THIS FILM HAS A CUT POINT ON FILE AND IS LIVE UNTRIMMED.",
      /* BOTH ENDS CARRY THE UNIT. This read `${start}s -> ${end}` and printed
         "10.6s -> 152.32", which is a number with no unit next to one that has
         it — the scenarios caught it. "end" stays unit-less because it is a
         word, not a measurement. */
      `  plan: ${start ?? 0}s -> ${end == null ? "end" : `${end}s`}` +
        /* The plan's own `confident: false` is surfaced rather than smoothed
           over. A cut applied from a row the measurer could not read is the
           thing the sync gate then refuses, and knowing that before running it
           saves a transcode. */
        (hit.confident === false ? "   (plan marks this one NOT confident — read it first)" : ""),
      "",
      "This script does not trim. Cut it from the disk master, behind the",
      "sync gate:",
      ...cmd,
      "─────────────────────────────────────────────────────────────────",
    ],
  };
}
