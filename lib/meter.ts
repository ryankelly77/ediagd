/* ============================================================================
   EDIAGD — the EDIAGD Certified meter's arithmetic, in one place

   PURE. Two numbers in, a rendering out. No client, no clock, no imports — so
   it can be called from a server component, from the Slack message builder and
   from a test without any of them pulling the others in.

   ---------------------------------------------------------------------------
   WHY THIS IS A MODULE AND NOT TWO PRIVATE FUNCTIONS
   ---------------------------------------------------------------------------
   Ryan, 8 November: managers and admins see the meter on /admin/engagement,
   the same one the evening post carries. "The same one" is a requirement about
   the arithmetic and not about the look: the post prints box-drawing cells
   inside a code fence because Slack only lines columns up in a monospaced font,
   and the screen draws the brand's progress rule because that is what every
   other bar in the app is. Those are two RENDERINGS.

   What must not be two is the number. A percentage computed in a component and
   a percentage computed in the message builder would agree until the day one of
   them was edited, and then Slack and the screen would disagree about one
   advisor with nothing erroring — this codebase's most-repeated defect, with a
   rounding rule standing in for a policy. So the fraction is rounded ONCE,
   here, and both renderings are derived from it.

   ---------------------------------------------------------------------------
   ZERO OF ZERO IS DRAWN EMPTY AND READS 0%, AND THE CALLER MUST NOT SHOW IT
   ---------------------------------------------------------------------------
   That only happens when there is no active core track at all, and an empty bar
   claims "none of this is done" which is false when there is nothing to do.
   Both callers test `gatingTotal > 0` and say it in words instead. Named here
   because the functions themselves cannot refuse — a formatter that threw would
   take a screen down over a catalogue state.
   ============================================================================ */

/** The meter's width in cells. 10 so a cell is a round ten per cent. */
export const METER_CELLS = 10;

/**
 * The completed fraction, 0 to 1. Zero for a zero denominator.
 *
 * Not exported as a percentage on purpose: everything below rounds FROM this,
 * so there is exactly one place where a tenth gets decided.
 */
function fractionOf(done: number, total: number): number {
  return total > 0 ? done / total : 0;
}

/**
 * The rounded whole percent — the number both the post and the screen print.
 *
 * ROUNDED, NOT TRUNCATED, and the same rounding the cells use, so the bar and
 * the number cannot disagree about which side of a tenth the advisor is on.
 */
export function meterPct(done: number, total: number): number {
  return Math.round(100 * fractionOf(done, total));
}

/** "82%", "0%", "100%". */
export function pctText(done: number, total: number): string {
  return `${meterPct(done, total)}%`;
}

/**
 * `▰▰▰▱▱▱▱▱▱▱` — the Slack rendering, fixed width.
 *
 * BOX-DRAWING CHARACTERS BECAUSE THE POST IS A CODE FENCE. Slack does not
 * render emoji in code font, and the columns only line up in a monospaced one.
 * On a web page this would be a ragged row of glyphs in a sans-serif face,
 * which is why the screen uses the brand's ProgressBar over `meterPct` instead.
 */
export function meterCells(done: number, total: number): string {
  const filled = Math.min(
    METER_CELLS,
    Math.max(0, Math.round(METER_CELLS * fractionOf(done, total)))
  );
  return `${"▰".repeat(filled)}${"▱".repeat(METER_CELLS - filled)}`;
}

/** The cells and the number, for a line that is a sentence rather than a row. */
export function meter(done: number, total: number): string {
  return `${meterCells(done, total)} ${pctText(done, total)}`;
}
