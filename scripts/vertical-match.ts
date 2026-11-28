/* ============================================================================
   EDIAGD — does this vertical reproduce the cut its master plays?

   Pure. No Mux, no ffmpeg, no database — so vertical-match-scenarios.ts can run
   the real transcripts of the films this was written for, offline, and prove
   which way each one goes.

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
   AND THEN THE WHOLE LIBRARY WAS SWEPT, WHICH IS WHAT FOUND THE REST
   ---------------------------------------------------------------------------
   The transcript comparison above ran over all 479 films on 25 November. It
   refused SEVEN, and they fall into three groups rather than one:

     4  REFUSED WRONGLY — the four below. The crops are faithful.
     1  REFUSED RIGHTLY — Lasting Impressions, Part 8, whose crop really does
        begin five seconds in. It still refuses, and a test holds that.
     2  NOT A VERDICT AT ALL — At the Kiosk — Battery Replacement and Piggyback
        — Front Wiper Blades, whose MASTER returned no transcript while their
        crops read fine. Those are now `unreadable`; see the bottom of this
        comment.

   The four wrong ones are all the SAME defect in the instrument rather than in
   any film: **two reads of one piece of audio do not tokenise it the same way.**

     30 Second Walk-Around, Part 2        a compound, split one way and not the other
       master    "thirty second walkaround part two four goals two words aloha"
       vertical  "thirty second walk around part two four goals two words"

     MPI Setup — AC Evaporator Cleaning   a spoken reduction, spelled two ways
       master    tail "...the Get the Hell Outta Here Speech and get certified"
       vertical  tail "...the get the hell out of here speech and get certified"

     Name Tag — Closer                    one article heard differently
       master    "that's what's in A nametag. Your dealership, your brand..."
       vertical  "that's what's in THE nametag. Your dealership, your brand..."

     Dealer Upsell Menus and Interval Charts — Opener    one noun heard differently
       master    tail "...services based on any of the MATERIALS you need"
       vertical  tail "...services based on any of the ITEMS you need"

   Note what these are NOT. Not one of them is a film that starts or ends in the
   wrong place — the four crops are faithful and a phone should have been playing
   them. The gate was measuring the transcriber and reporting it as a property of
   the video, which is this project's oldest mistake wearing new clothes: a label
   checked against the wrong thing.

   Measured rate: **four false refusals in 479 films, 0.8%** — and the cost of
   each is a film that serves landscape to every phone until somebody notices.

   ---------------------------------------------------------------------------
   SO THE COMPARISON IS NOW ABOUT WORDS SPOKEN, NOT TOKENS EMITTED
   ---------------------------------------------------------------------------
   Three changes, each answering one of the shapes above, and each kept as tight
   as the evidence allows:

   1. COMPOUNDS COLLAPSE. "walkaround" and "walk around" are one word spoken
      two ways, so the aligner may merge adjacent tokens on either side to meet
      a single token on the other. This costs nothing: two tokens that join to
      spell the third are the third.

   2. SPOKEN REDUCTIONS EXPAND. "outta" is "out of" said quickly, and whisper
      picks a spelling per pass. The map below is deliberately short and holds
      only the reduced forms of a word plus a preposition or auxiliary.

   3. ONE SUBSTITUTED WORD IS SURVIVABLE, AT EITHER END. "a" for "the",
      "materials" for "items". One, not two — a second substitution in six words
      is no longer a transcription artefact, it is a different sentence.

   WHAT DELIBERATELY DID NOT LOOSEN, because these are the defect itself:

   - A MISSING WORD AT THE FRONT IS STILL A REFUSAL. The master's first word must
     be matched at the START of the vertical. The aligner has no insertion and no
     deletion, only substitution, so a crop that drops a word shifts every word
     after it and exhausts the budget immediately. A crop missing nothing but
     "Aloha" refuses, and there is a test that holds that.
   - THE START-TIME OFFSET IS A HARD REFUSAL whatever the text says. A crop can
     have every word of the master and still begin a second late, and a second is
     visible. No amount of textual agreement buys it.
   - A TAIL SHORT BY A REAL STRETCH OF SPEECH IS STILL A REFUSAL. One word may be
     substituted; a sentence may not go missing.

   ---------------------------------------------------------------------------
   THE TWO ENDS ARE NOT THE SAME QUESTION, SO THEY GET DIFFERENT RULES
   ---------------------------------------------------------------------------
   THE HEAD IS STRICT, because the head is where the real defect lives. Two of
   the five 21 November refusals were correct, and both look like this:

     Brave Enough (the crop cut on 21 November)
       master    "Aloha! Brave Enough by Sarah Bahada. Let's be honest, the
                  service drive can feel like a relentless machine..."
       vertical  "The service drive can feel like a relentless machine..."

   The source that crop was cut from begins about five seconds into the film — a
   defect derive-vertical.ts's own header measured on 8 October and could not
   explain. The durations agree to a quarter second, which is what hid it. A
   vertical that starts late is the one thing this gate exists to catch: a phone
   would play a film that opens five seconds after the desktop's.

   So the master's opening words must appear AT THE START of the vertical. Not
   somewhere in it — at the start.

   THE TAIL IS TOLERANT, because the tail is where the instrument is weakest and
   the stakes are lowest. Both sides read a ten-second window whose start is
   derived from a duration the two sources round differently, so the last token
   is routinely a fragment, a different fragment, or one word more. None of that
   is a film that ends early.

   ---------------------------------------------------------------------------
   AND "NOTHING TO COMPARE" IS ITS OWN ANSWER, NOT A REFUSAL
   ---------------------------------------------------------------------------
   An empty transcript is still not a pass. But calling it a refusal reports a
   fact about the FILM when what happened was a fact about the READ — and the two
   demand opposite responses: a refusal means do not serve this crop, an
   unreadable means go and read it again, wider. `which: "unreadable"` keeps them
   apart so a caller can retry instead of recording a verdict it did not earn.
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
 * Spoken reductions, written out.
 *
 * `MPI Setup — AC Evaporator Cleaning` is the measured case: Mitch says *"the
 * Get the Hell Outta Here speech"*, whisper wrote **"Outta"** reading the master
 * and **"out of"** reading the crop of that same master. The audio did not
 * change; the spelling did.
 *
 * ONLY THE REDUCED FORM OF A WORD PLUS A PREPOSITION OR AUXILIARY goes in here,
 * and every entry expands to the words that were actually said. This is not a
 * place for synonyms or for anything a speaker might or might not have meant —
 * a substitution is what covers that, once, and under a budget. Keeping the map
 * to one shape is what stops it becoming the thing that accepts a wrong cut.
 */
const REDUCTION: Record<string, string[]> = {
  outta: ["out", "of"],
  gonna: ["going", "to"],
  wanna: ["want", "to"],
  gotta: ["got", "to"],
  oughta: ["ought", "to"],
  kinda: ["kind", "of"],
  sorta: ["sort", "of"],
  lotta: ["lot", "of"],
  coulda: ["could", "have"],
  shoulda: ["should", "have"],
  woulda: ["would", "have"],
  lemme: ["let", "me"],
  gimme: ["give", "me"],
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

/**
 * A transcript as the sequence of words it actually asserts.
 *
 * A reduction becomes the several words it stands for, so the two spellings of
 * one utterance produce the same sequence and the aligner never has to know
 * about it.
 */
export function tokens(transcript: string): string[] {
  const out: string[] = [];
  for (const raw of transcript.split(/\s+/)) {
    const w = normaliseWord(raw);
    if (!w) continue;
    const expanded = REDUCTION[w];
    if (expanded) out.push(...expanded);
    else out.push(w);
  }
  return out;
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
 * vertical cut from a source that starts four seconds late has its own
 * timeline, so its first word still begins at ~0.1 s. The offset catches a crop
 * that gained or lost silence at the front; the word comparison catches a crop
 * that starts somewhere else entirely. Only the second was the bug.
 *
 * A FULL SECOND REFUSES — the comparison is `>=`, not `>`. A second of silence
 * before the first word is visible to the person watching, and "a second late
 * but the words match" is exactly the case this guard exists for, so the
 * boundary belongs on the refusing side of it.
 */
export const MAX_FIRST_WORD_OFFSET = 1.0;

/** Tokens of slack at the very end, on either side. Two, measured: the worst
 *  real case gained exactly one ("full" -> "full position"). */
export const TAIL_SLACK = 2;

/** Below this many tokens a "suffix match" is not evidence of anything. */
export const MIN_TAIL_OVERLAP = 4;

/**
 * How many words at the very end the tail comparison actually judges.
 *
 * ---------------------------------------------------------------------------
 * THE TAIL WINDOW'S LEADING EDGE IS NOT EVIDENCE, AND IT USED TO BE TREATED AS
 * ---------------------------------------------------------------------------
 * Both sides read a ten-second window starting at `duration - 10`, and the two
 * sources round their duration differently — so the two windows do not begin at
 * the same instant, and the first words of a tail are a different slice of
 * speech on each side. Measured on 30 Second Walk-Around, Part 2:
 *
 *   master    "said, that makes you right. And being right is how a stranger
 *              decides to trust you in less than a minute. Mahalo."
 *   vertical  "What you said makes you right. And being right is how a stranger
 *              decides to trust you in less than a minute. Mahalo."
 *
 * Twenty-one words identical, and they diverge only in the three that straddle
 * the window boundary. Comparing the whole of the shorter side made those three
 * words decide the verdict, and they are an artefact of where the window landed.
 * The old one-word gate refused this film on its head and would have refused it
 * on its tail as well, so this is a weakness the sweep exposed rather than one
 * it introduced.
 *
 * So the tail question is "does this crop END in the same place", and it is
 * asked of the last eight words — roughly three seconds, comfortably inside the
 * window and clear of its unreliable start. A tail that genuinely stops short of
 * the ending has different words there, which is the case this must still
 * refuse, and does.
 *
 * WHAT THIS DOES NOT CLAIM: that the whole ending is identical. Neither end of
 * this comparison looks at the middle of a film, and it never did — the head
 * proves where it starts, the tail proves where it stops, and a crop that
 * diverges only in between would pass both. Saying so here because an untrue
 * reading of what a check covers is how the last four of these were missed.
 */
export const TAIL_COMPARE = 8;

/**
 * Substituted words allowed, per end. One.
 *
 * Measured: the worst real case at each end is exactly one word — "a" for "the"
 * in a head, "materials" for "items" in a tail. Two substitutions inside six
 * words is not a transcription artefact.
 */
export const MAX_SUBSTITUTIONS = 1;

/** How many tokens on one side may be merged to meet one on the other. */
const MAX_MERGE = 3;

export type EndsLike = {
  headHeard: string;
  tailHeard: string;
  whisperFirstStart: number | null;
};

export type MatchResult = {
  ok: boolean;
  /**
   * Which end decided it. `null` when both passed.
   *
   * `unreadable` is NOT a refusal — it says the instrument came back empty and
   * the question is unanswered. A caller should read again, wider, before
   * recording anything.
   */
  which: "head" | "tail" | "head-offset" | "unreadable" | null;
  /** One line, naming the end and showing both sides. */
  detail: string;
};

/**
 * Does `have` begin with the words of `want`?
 *
 * Alignment with three moves and no fourth:
 *
 *   MATCH      the tokens are the same word
 *   MERGE      several tokens on one side spell the single token on the other,
 *              which is a compound split one way and not the other
 *   SUBSTITUTE one word stands where another was heard — budgeted, `budget`
 *
 * THERE IS NO INSERT AND NO DELETE, and that absence is the load-bearing part.
 * A crop that is missing a word cannot skip it: the word has to be consumed as
 * a substitution, which shifts every following word by one and burns the budget
 * on the next token. That is why "missing only Aloha" still refuses while "a for
 * the" passes, with the same single unit of tolerance.
 *
 * `join` composes merged tokens. The tail reads its words in reverse, where the
 * pieces of a compound arrive back-to-front, so it passes the reversing join.
 */
function alignsFromStart(
  want: string[],
  have: string[],
  budget: number,
  join: (parts: string[]) => string
): boolean {
  if (want.length === 0) return false;
  /* best[j] = the most budget still unspent having matched want[0..i) against
     have[0..j). Explored breadth-first over i so each step is one word. */
  let frontier = new Map<number, number>([[0, budget]]);
  for (let i = 0; i < want.length; i++) {
    const next = new Map<number, number>();
    const offer = (j: number, left: number) => {
      const seen = next.get(j);
      if (seen === undefined || seen < left) next.set(j, left);
    };
    for (const [j, left] of frontier) {
      if (j >= have.length) continue;

      /* MATCH */
      if (have[j] === want[i]) offer(j + 1, left);

      /* MERGE on the vertical's side: have[j..j+k) spells want[i] */
      for (let k = 2; k <= MAX_MERGE && j + k <= have.length; k++) {
        if (join(have.slice(j, j + k)) === want[i]) offer(j + k, left);
      }

      /* MERGE on the master's side: want[i..i+k) spells have[j]. Consumes
         several want tokens at once, so it jumps i — handled by recursing on
         the remainder, which keeps this loop one-word-at-a-time. */
      for (let k = 2; k <= MAX_MERGE && i + k <= want.length; k++) {
        if (join(want.slice(i, i + k)) === have[j]) {
          if (alignsFromStart(want.slice(i + k), have.slice(j + 1), left, join)) return true;
          if (i + k === want.length) return true;
        }
      }

      /* SUBSTITUTE */
      if (left > 0 && have[j] !== want[i]) offer(j + 1, left - 1);
    }
    if (next.size === 0) return false;
    frontier = next;
  }
  return frontier.size > 0;
}

const joinForward = (parts: string[]) => parts.join("");
const joinReverse = (parts: string[]) => [...parts].reverse().join("");

/**
 * Do these two tails end in the same place?
 *
 * Trims up to TAIL_SLACK tokens from the end of either side, then compares the
 * two endings backwards with the same aligner the head uses — so a compound and
 * one substituted word are survivable here too. Reading backwards is what makes
 * "the shorter one's whole ending must be present" the question, which is the
 * one that matters: a tail short by a real stretch of speech diverges on its
 * second or third word and cannot be rescued by one substitution.
 */
function tailsAgree(master: string[], vertical: string[]): boolean {
  for (let a = 0; a <= TAIL_SLACK; a++) {
    for (let b = 0; b <= TAIL_SLACK; b++) {
      const m = master.slice(0, master.length - a);
      const v = vertical.slice(0, vertical.length - b);
      if (m.length < MIN_TAIL_OVERLAP || v.length < MIN_TAIL_OVERLAP) continue;
      /* The last few words of each, and no more — see TAIL_COMPARE. */
      const k = Math.min(TAIL_COMPARE, m.length, v.length);
      if (k < MIN_TAIL_OVERLAP) continue;
      const mr = m.slice(m.length - k).reverse();
      const vr = v.slice(v.length - k).reverse();
      if (alignsFromStart(mr, vr, MAX_SUBSTITUTIONS, joinReverse)) return true;
      /* Both directions, because a compound merge consumes a different number
         of tokens on each side and `k` was counted in tokens. */
      if (alignsFromStart(vr, mr, MAX_SUBSTITUTIONS, joinReverse)) return true;
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

  /* Nothing to compare is not a pass — and not a refusal either. The read came
     back empty, so there is no verdict to record yet; say so in `which` and let
     the caller read again with a wider window. */
  if (mHead.length === 0 || vHead.length === 0) {
    const side =
      mHead.length === 0 && vHead.length === 0 ? "neither side"
      : mHead.length === 0 ? "the master" : "the vertical";
    return {
      ok: false,
      which: "unreadable",
      detail:
        `UNREADABLE: ${side} returned no head transcript, so the cut is unjudged — ` +
        `read again with a wider window before recording a verdict. ` +
        `master "${snippet(mHead)}" vs vertical "${snippet(vHead)}"`,
    };
  }

  const want = mHead.slice(0, Math.min(HEAD_WORDS, mHead.length));
  if (!alignsFromStart(want, vHead, MAX_SUBSTITUTIONS, joinForward)) {
    return {
      ok: false,
      which: "head",
      detail:
        `HEAD: the vertical does not open on the master's first ${want.length} words ` +
        `(compounds collapsed, ${MAX_SUBSTITUTIONS} substitution allowed). ` +
        `master "${snippet(mHead)}…" vs vertical "${snippet(vHead)}…"`,
    };
  }

  /*
   * THE OFFSET IS CHECKED EVEN THOUGH THE WORDS AGREED, and that ordering is
   * the point: this is the case where the text cannot help. Every word of the
   * master, a second of new silence in front of it, and a phone that starts
   * late. No textual tolerance applies to it.
   */
  const mStart = master.whisperFirstStart;
  const vStart = vertical.whisperFirstStart;
  if (mStart != null && vStart != null && Math.abs(vStart - mStart) >= MAX_FIRST_WORD_OFFSET) {
    return {
      ok: false,
      which: "head-offset",
      detail:
        `HEAD: the words line up but the vertical's first word starts ` +
        `${(vStart - mStart).toFixed(2)}s from the master's (limit under ${MAX_FIRST_WORD_OFFSET}s) — ` +
        `a hard refusal regardless of the text`,
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
        `TAIL: the endings diverge by more than ${TAIL_SLACK} words of slack and ` +
        `${MAX_SUBSTITUTIONS} substitution. ` +
        `master "…${snippet(mTail, 10, "end")}" vs vertical "…${snippet(vTail, 10, "end")}"`,
    };
  }

  return { ok: true, which: null, detail: "head and tail both match the master" };
}
