/* ============================================================================
   EDIAGD — clamping long copy without leaving a fragment on screen

   WHY THIS EXISTS. 47 cue bodies in the library are truncated mid-clause — 32
   of them at exactly 600 characters — and one of them ends with a dangling "/"
   after a list of vehicle names. The chop is in the DATA: it came in that way
   from an import that no longer exists in this repo, and the missing words
   cannot be recovered from here.

   That is somebody's to re-supply. Until they do, and for any genuinely long
   cue afterwards, the display must not make it worse by chopping again at a
   character count.

   THE RULE: never cut mid-word, mid-list or mid-clause. Cut at a sentence
   boundary at or before the budget, and if there is no sentence boundary to cut
   at, show the whole thing rather than invent a ragged edge. A slightly long
   card is a smaller problem than a sentence that stops making sense.
   ============================================================================ */

/** Characters that reliably end a sentence in this content. */
const SENTENCE_END = /[.!?]["')\]]?\s/g;

export type Clamped = {
  /** What to show when collapsed. */
  head: string;
  /** What "show more" reveals. Empty when nothing was held back. */
  rest: string;
  /** True when the text was long enough to split. */
  clamped: boolean;
  /** True when the SOURCE text looks truncated — a data problem, not a display one. */
  looksTruncated: boolean;
};

/**
 * Split copy at the last sentence boundary at or before `budget`.
 *
 * Returns the whole string as `head` when there is no sensible place to cut,
 * which is the honest outcome for a single long sentence.
 */
export function clampToSentence(text: string, budget = 320): Clamped {
  const clean = (text ?? "").trim();
  const truncated = looksTruncated(clean);

  if (clean.length <= budget) {
    return { head: clean, rest: "", clamped: false, looksTruncated: truncated };
  }

  // Find the last sentence end at or before the budget.
  let cut = -1;
  SENTENCE_END.lastIndex = 0;
  for (let m = SENTENCE_END.exec(clean); m; m = SENTENCE_END.exec(clean)) {
    const end = m.index + m[0].length;
    if (end > budget) break;
    cut = end;
  }

  /* No sentence boundary in range — a long opening sentence. Showing all of it
     beats cutting it somewhere arbitrary. */
  if (cut < 80) {
    return { head: clean, rest: "", clamped: false, looksTruncated: truncated };
  }

  return {
    head: clean.slice(0, cut).trim(),
    rest: clean.slice(cut).trim(),
    clamped: true,
    looksTruncated: truncated,
  };
}

/**
 * Does this text look like it was cut off by a machine rather than finished by
 * a person?
 *
 * Used to decide whether to hide a dangling separator, and to let an admin
 * screen flag rows worth re-supplying. Deliberately conservative: a false
 * positive hides a character, a false negative shows what is already there.
 */
export function looksTruncated(text: string): boolean {
  const t = (text ?? "").trimEnd();
  if (t.length < 120) return false;
  return /[,\-–—/;:]$|\b(and|or|the|a|an|to|of|for|with|in|on|at|by)$/i.test(t);
}

/**
 * Trim a dangling separator off the end of copy that was cut mid-list.
 *
 * "…Silverado EV / Lyriq /" becomes "…Silverado EV / Lyriq". It does not invent
 * the missing item — it just stops the sentence looking like a bug to the
 * advisor reading it.
 */
export function tidyTruncation(text: string): string {
  return (text ?? "").trimEnd().replace(/[\s]*[,\-–—/;:]+$/, "").trimEnd();
}
