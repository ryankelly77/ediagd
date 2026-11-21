/* ============================================================================
   EDIAGD — does this vertical reproduce the cut its master plays?

   Pure. No Mux, no ffmpeg, no database — so vertical-match-scenarios.ts can run
   the real transcripts of the five films this was written for, offline, and
   prove which way each one goes.

   ---------------------------------------------------------------------------
   WHAT THIS REPLACES, AND WHY IT HAD TO
   ---------------------------------------------------------------------------
   The gate compared ONE word at each end, after a strip that keeps only a-z:

       strip(master.firstWord) === strip(vertical.firstWord) &&
       strip(master.lastWord)  === strip(vertical.lastWord)

   Run against the five films it refused on 21 November, three of those
   refusals were wrong and the transcripts say so plainly:

     Two Minute Walk-Around, Part 1
       master    "2 minute walk around part 1. Pop the hood. Aloha. Now..."
       vertical  "Two minute walk around part one pop the hood Aloha now..."
       The same words. strip("2") is "" and strip("Two") is "two", so a
       numeral can never equal its own number word.

     Never Lose Money
       master    tail "...Find where fee -"
       vertical  tail "...Find where fee..."
       The film ends mid-phrase in BOTH. Whisper tokenised the trailing
       fragment two different ways.

     Your Toughest Opponent Is Staring at You
       master    tail "...before you can reach your full..."
       vertical  tail "...before you can reach your full position."
       The vertical caught one more word at the boundary than the master did.

   One word is too small a sample to carry a refusal. A transcript is not.

   ---------------------------------------------------------------------------
   THE TWO ENDS ARE NOT THE SAME QUESTION, SO THEY GET DIFFERENT RULES
   ---------------------------------------------------------------------------
   THE HEAD IS STRICT, because the head is where the real defect lives. Two of
   the five refusals were correct, and both look like this:

     Brave Enough
       master    "Aloha! Brave Enough by Sarah Bahada. Let's be honest, the
                  service drive can feel like a relentless machine..."
       vertical  "The service drive can feel like a relentless machine..."

   The mezzanine the crop is cut from begins four or five seconds into the
   film — a defect derive-vertical.ts's own header measured on 8 October and
   could not explain. The durations agree to a quarter second, which is what
   hid it. A vertical that starts late is the one thing this gate exists to
   catch: a phone would play a film that opens four seconds after the desktop's.

   So the master's opening words must appear AT THE START of the vertical.
   Not somewhere in it — at the start.

   THE TAIL IS TOLERANT, because the tail is where the instrument is weakest
   and the stakes are lowest. Both sides read a ten-second window whose start
   is derived from a duration the two sources round differently, so the last
   token is routinely a fragment, a different fragment, or one word more. None
   of that is a film that ends early. A tail that genuinely stops short of the
   ending is a different shape — a whole stretch of words missing — and that
   still refuses.
   ============================================================================ */

/* ---------------------------------------------------------------------------
   NORMALISING
--------------------------------------------------------------------------- */

/**
 * Numerals and number words are the same word.
 *
 * Whisper picks one or the other per pass and the choice is not stable between
 * two reads of the same audio — it wrote "2 minute walk around part 1" for a
 * master and "Two minute walk around part one" for a crop of that same master.
 * Only the small ones matter: a film title says "Part 1", never "Part 147".
 */
const NUMBER_WORD: Record<string, string> = {
  "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five",
  "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten",
  "11": "eleven", "12": "twelve", "13": "thirteen", "14": "fourteen",
  "15": "fifteen", "16": "sixteen", "17": "seventeen", "18": "eighteen",
  "19": "nineteen", "20": "twenty", "30": "thirty", "40": "forty",
  "50": "fifty", "60": "sixty", "70": "seventy", "80": "eighty", "90": "ninety",
  "100": "hundred", "1000": "thousand",
};

/**
 * One spoken word, reduced to what two transcripts of the same audio agree on.
 *
 * Punctuation goes because "Mahalo." and "Mahalo!" are the same word. Digits
 * become their number word. A token that holds no letters or digits at all —
 * a bare "-", which is what whisper returned for the last token of Never Lose
 * Money's master — reduces to nothing and is dropped by `tokens()` below,
 * because an empty token cannot agree or disagree with anything.
 */
export function normaliseWord(raw: string): string {
  const bare = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!bare) return "";
  return NUMBER_WORD[bare] ?? bare;
}

/** A transcript as the sequence of words it actually asserts. */
export function tokens(transcript: string): string[] {
  return transcript
    .split(/\s+/)
    .map(normaliseWord)
    .filter((w) => w.length > 0);
}

/* ---------------------------------------------------------------------------
   THE COMPARISON
--------------------------------------------------------------------------- */

/** How many opening words have to line up. */
export const HEAD_WORDS = 6;

/**
 * How far the vertical's first word may sit from the master's.
 *
 * A SECONDARY GUARD, and worth saying why it cannot be the primary one: a
 * vertical cut from a mezzanine that starts four seconds late has its own
 * timeline, so its first word still begins at ~0.1 s. The offset catches a
 * crop that gained or lost silence at the front; the word comparison catches a
 * crop that starts somewhere else entirely. Only the second was the bug.
 */
export const MAX_FIRST_WORD_OFFSET = 1.0;

/** Tokens of slack at the very end, on either side. Two, measured: the worst
 *  real case gained exactly one ("full" -> "full position"). */
export const TAIL_SLACK = 2;

/** Below this many tokens a "suffix match" is not evidence of anything. */
export const MIN_TAIL_OVERLAP = 4;

export type EndsLike = {
  headHeard: string;
  tailHeard: string;
  whisperFirstStart: number | null;
};

export type MatchResult = {
  ok: boolean;
  /** Which end decided it. `null` when both passed. */
  which: "head" | "tail" | "head-offset" | null;
  /** One line, naming the end and showing both sides. */
  detail: string;
};

/** Does `hay` begin with `needle`? */
function startsWith(hay: string[], needle: string[]): boolean {
  if (needle.length === 0) return false;
  if (hay.length < needle.length) return false;
  return needle.every((w, i) => hay[i] === w);
}

/**
 * Do these two tails end in the same place, allowing slack at the boundary?
 *
 * Trims up to TAIL_SLACK tokens from the end of either side and asks whether
 * one is then a suffix of the other. That accepts a fragment read two ways and
 * a word gained at the window edge, and refuses a tail that is short by a real
 * stretch of speech — because dropping two tokens cannot rescue a sequence
 * that diverges five words earlier.
 */
function tailsAgree(master: string[], vertical: string[]): boolean {
  for (let a = 0; a <= TAIL_SLACK; a++) {
    for (let b = 0; b <= TAIL_SLACK; b++) {
      const m = master.slice(0, master.length - a);
      const v = vertical.slice(0, vertical.length - b);
      if (m.length < MIN_TAIL_OVERLAP || v.length < MIN_TAIL_OVERLAP) continue;
      const n = Math.min(m.length, v.length);
      if (n < MIN_TAIL_OVERLAP) continue;
      const ms = m.slice(m.length - n);
      const vs = v.slice(v.length - n);
      if (ms.every((w, i) => w === vs[i])) return true;
    }
  }
  return false;
}

const snippet = (t: string[], n = 10, from: "start" | "end" = "start") =>
  (from === "start" ? t.slice(0, n) : t.slice(Math.max(0, t.length - n))).join(" ") || "(nothing)";

/**
 * Is this vertical the same cut as its master?
 *
 * The caller supplies both reads. This decides, and says which end decided.
 */
export function endsMatch(master: EndsLike, vertical: EndsLike): MatchResult {
  const mHead = tokens(master.headHeard ?? "");
  const vHead = tokens(vertical.headHeard ?? "");
  const mTail = tokens(master.tailHeard ?? "");
  const vTail = tokens(vertical.tailHeard ?? "");

  /* Nothing to compare is not a pass. The old gate's silent fall-through to a
     refusal at least got this right; it is explicit here. */
  if (mHead.length === 0 || vHead.length === 0) {
    return {
      ok: false,
      which: "head",
      detail: `no head transcript to compare — master "${snippet(mHead)}" vs vertical "${snippet(vHead)}"`,
    };
  }

  const want = mHead.slice(0, Math.min(HEAD_WORDS, mHead.length));
  if (!startsWith(vHead, want)) {
    return {
      ok: false,
      which: "head",
      detail:
        `HEAD: the vertical does not open on the master's first ${want.length} words. ` +
        `master "${snippet(mHead)}…" vs vertical "${snippet(vHead)}…"`,
    };
  }

  const mStart = master.whisperFirstStart;
  const vStart = vertical.whisperFirstStart;
  if (mStart != null && vStart != null && Math.abs(vStart - mStart) > MAX_FIRST_WORD_OFFSET) {
    return {
      ok: false,
      which: "head-offset",
      detail:
        `HEAD: the words line up but the vertical's first word starts ` +
        `${(vStart - mStart).toFixed(2)}s from the master's (limit ${MAX_FIRST_WORD_OFFSET}s)`,
    };
  }

  if (mTail.length === 0 && vTail.length === 0) {
    return { ok: true, which: null, detail: "head matches; neither side read a tail" };
  }
  if (!tailsAgree(mTail, vTail)) {
    return {
      ok: false,
      which: "tail",
      detail:
        `TAIL: the endings diverge by more than ${TAIL_SLACK} words. ` +
        `master "…${snippet(mTail, 10, "end")}" vs vertical "…${snippet(vTail, 10, "end")}"`,
    };
  }

  return { ok: true, which: null, detail: "head and tail both match the master" };
}
