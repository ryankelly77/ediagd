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

/**
 * Drop markdown emphasis that has nowhere to render.
 *
 * Mitch writes his master in a sheet, and he bolds the opening phrase of a
 * fact with **asterisks** the way anyone would. Nothing downstream of the
 * import speaks markdown — Prose renders plain text — so those asterisks reach
 * the advisor as literal punctuation: "**THE BOAT-LAUNCHING / WATER-EXPOSURE
 * FACT**". 149 published cues do this today.
 *
 * Removing the markers loses the emphasis, which is a real loss. Showing them
 * loses the reader, which is a bigger one, and the emphasis is usually on the
 * opening phrase that splitCueHeading is about to promote to a heading anyway.
 */
export function stripEmphasis(text: string): string {
  /* [\s\S] rather than the `s` flag: the build targets below es2018. */
  return (text ?? "").replace(/\*\*([\s\S]+?)\*\*/g, "$1").replace(/\*\*/g, "");
}

export type CueHeading = {
  /** The opening phrase, to set bold. Null when there isn't an honest one. */
  heading: string | null;
  /** Everything else, as paragraphs. */
  rest: string;
};

/**
 * Split a cue title into a heading and the teaching that follows it.
 *
 * WHY A TITLE NEEDS SPLITTING AT ALL. The knowledge import put Mitch's whole
 * teaching paragraph into `title` and the short takeaway line into `body`. So
 * `title` routinely runs 400–700 characters, and the daily loop set all of it
 * in bold as though it were a heading — a wall of emphasised text with no
 * entry point, which is what Ryan was looking at when he said he could not
 * tell what was happening.
 *
 * The structure is already in the writing, twice over: the fact-style rows open
 * with a bolded phrase ("**THE 8-FOOT / 13-FOOT STOPPING DISTANCE STAT**") and
 * the strategy-style rows open with a short labelled sentence ("Strategy 2: The
 * Boat-Launching / Water-Exposure Trigger."). Either is a heading. This finds
 * whichever is there and leaves the rest as prose.
 *
 * WHEN IT FINDS NEITHER IT RETURNS NULL rather than cutting at a word count.
 * A heading invented by truncation is exactly the thing being fixed here, and a
 * paragraph with no heading reads fine — a paragraph with half a sentence in
 * bold on top of it does not.
 */
export function splitCueHeading(title: string): CueHeading {
  const t = (title ?? "").trim();
  if (!t) return { heading: null, rest: "" };

  /* A leading **bold span** is an explicit heading — take it as written. */
  const bold = t.match(/^\*\*([\s\S]+?)\*\*\s*/);
  if (bold) {
    const heading = bold[1].trim().replace(/[.:;,\s]+$/, "");
    return { heading, rest: stripEmphasis(t.slice(bold[0].length)).trim() };
  }

  /* Otherwise the first sentence, but only if it is short enough to BE a
     heading. Past this it is just the first sentence of a paragraph, and
     promoting it would put a random clause in bold. */
  const HEADING_MAX = 90;
  const end = t.search(/[.!?]["')\]]?(\s|$)/);
  if (end > 0 && end < HEADING_MAX) {
    const heading = t.slice(0, end).trim();
    const rest = t.slice(end + 1).trim();
    /* A heading with nothing under it is not a heading, it is the whole cue. */
    if (rest) return { heading: stripEmphasis(heading), rest: stripEmphasis(rest) };
  }

  return { heading: null, rest: stripEmphasis(t) };
}
