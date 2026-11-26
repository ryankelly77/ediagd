/* ============================================================================
   EDIAGD — reading the Manager Meetings slate off a transcript

   Mitch speaks a Classification line before the Aloha on every Manager Meetings
   film:

       Manager Meetings/<Topic>/<length>/<Title>

   That line IS the meeting's identity — it is what `content.classification_line`
   stores (0183) and what the loader keys on. So identification for this track is
   not a matcher at all: it is a lookup. The film says what it is.

   PURE ON PURPOSE. No database, no filesystem, no network — the caller hands in
   the rows it read. That is what lets the fixture test cover an exact match, a
   folded match and a miss without a stack running.

   ---------------------------------------------------------------------------
   WHY THIS IS A DIFFERENT MECHANISM FROM EVERY OTHER TRACK
   ---------------------------------------------------------------------------
   `lib/video/transcript-match.ts` infers a film from what it talks ABOUT,
   because the advisor and craft films have no slate and never did. That matcher
   is evidence-weighing and it is allowed to be wrong and say so.

   This is not that. A slate is a declaration, so there is nothing to weigh:
   either the spoken line is in the library or it is not. A near-miss is a HOLD,
   never a best guess — AGENTS.md, "a slate names the shoot, not the
   curriculum": the slate is evidence about which shoot a file came from, and
   when it does not resolve, the answer is to stop rather than to pick the
   closest title.

   ---------------------------------------------------------------------------
   THE TITLE MAY CONTAIN A SLASH, SO THE LINE IS NOT SPLIT ON SLASHES
   ---------------------------------------------------------------------------
   Four A/C titles contain a literal "/" — "A/C Recharge Boost Meeting" and its
   neighbours — so `line.split("/")` yields FIVE parts for them, not four.
   Measured on the 18 November workbook; three of the four keep their slash after
   Ryan's ruling 5 renamed the fourth.

   So the parser takes the first three segments and leaves the REST as the title,
   and the value that gets looked up is the line as spoken, verbatim. Nothing is
   ever rebuilt from the parts — that is the trim-slates.ts lesson, which matched
   0 of 73 on a name the ingest invented where the observed name matched 73 of 73.
============================================================================ */

/* ---------------------------------------------------------------------------
   WHISPER DOES NOT SPEAK SLASHES, AND THIS FILE USED TO REQUIRE THEM
   ---------------------------------------------------------------------------
   Measured on the first six clips of the 26 November batch: the as-shipped
   parser read **0 of 6** slates, because the regex below wanted literal `/`
   characters and a transcriber hears a pause. What Mitch actually says comes
   back as

       "Manager meetings leading yourself, 5-15 minutes, Teach Mode vs.
        Preach Mode. Aloha!"

   — a comma, a full stop, or nothing at all where the workbook has a slash.

   ALL 27 ASSERTIONS PASSED THROUGHOUT, because every fixture transcript was
   hand-typed WITH the slashes in. That is the workbook's spelling fed in as
   though it were a transcript, so the suite was evidence about a string the
   parser will never be handed — AGENTS.md, "a sample is evidence about the
   sample", and the sample was not the population.

   It is also the `trim-slates.ts` defect again: that joined on
   `canonical_filename`, a form the ingest INVENTS, and matched 0 of 73 where
   the observed name matched 73 of 73. The separator is a derived detail of how
   the line is WRITTEN; the words are what was SPOKEN. So the words are the key.

   WHAT MAKES THE WIDENING SAFE IS THAT IT WAS MEASURED, NOT ARGUED.
   Folded across all 213 library rows, both ways, the fold produces
   **0 exact collisions and 0 prefix collisions** — so no two meetings can
   become one. And where it is ambiguous anyway it still HOLDS and names the
   candidates, so the widening cannot return a confident wrong answer; it can
   only return a hold.
--------------------------------------------------------------------------- */

/** A row of the library, as the caller read it. */
export type SlateRow = {
  id: string;
  classification_line: string;
  title?: string | null;
};

export type SlateRead = {
  /** The line exactly as spoken, trimmed of surrounding whitespace only. */
  line: string;
  topic: string;
  length: string;
  title: string;
};

/**
 * How the spoken line was reconciled with the library.
 *
 * Reported rather than collapsed, because "this needed the parenthetical
 * stripped" is a different quality of evidence from "this was verbatim" and a
 * person reading the run should see which.
 */
export type SlateHow = "exact" | "folded" | "folded-prefix" | "folded-parenthetical";

export type SlateMatch =
  | { ok: true; row: SlateRow; line: string; how: SlateHow }
  | { ok: false; line: string | null; reason: string; candidates?: SlateRow[] };

/** How far into the transcript a slate may begin and still count as "opens with". */
const OPENS_WITHIN = 240;

/**
 * The head of the transcript — everything before the Aloha.
 *
 * The slate is spoken BEFORE the Aloha, so the Aloha is the natural right-hand
 * boundary and using it means a Classification line quoted later in the body
 * (Mitch does read the card aloud in some films) cannot be mistaken for the
 * slate of the film it is inside.
 *
 * When there is no Aloha at all the head is the opening window instead. That is
 * deliberately not a refusal: `aloha_at` is unreliable enough to have its own
 * standing note — the transcript's value is a segment start and can BE the
 * slate — so a missing Aloha is a transcription artefact, not evidence that the
 * film has no slate.
 */
export function slateHead(transcript: string): string {
  const text = transcript.replace(/\s+/g, " ").trim();
  const aloha = text.search(/\baloha\b/i);
  return aloha === -1 ? text.slice(0, OPENS_WITHIN) : text.slice(0, aloha);
}

/**
 * The Classification line, if the transcript opens with one.
 *
 * Returns null rather than throwing: "this is not a Manager Meetings film" is
 * the common case, and every other track must pass through here untouched.
 */
export function readSlate(transcript: string): SlateRead | null {
  if (!transcript) return null;
  const head = slateHead(transcript);

  /* `Manager Meetings/` then three or more segments. The title is whatever
     remains, slashes included, so the four A/C titles survive. Whisper
     sometimes renders the separator with spaces around it.

     THE TITLE RUNS TO THE END OF THE HEAD, and that is a correction. It first
     stopped at the first `.`, which truncated "Teach Mode vs. Preach Mode" to
     "Teach Mode vs" — an internal abbreviation read as the end of the line. The
     fixture test caught it.

     Running to the end is safe because the head is already bounded by the
     Aloha, so in the normal case the head IS the slate and nothing follows it.
     When there is no Aloha the head is a fixed window of prose instead, the
     title comes out too long, and the lookup therefore HOLDS — which is the
     right outcome for a transcript nobody can read the slate off. */
  const m = head.match(
    /Manager\s+Meetings\s*\/\s*([^/]+?)\s*\/\s*([^/]+?)\s*\/\s*(.+)$/i
  );
  if (!m) return null;
  if (m.index !== undefined && m.index > OPENS_WITHIN) return null;

  const [, topic, length, rawTitle] = m;
  /* One trailing full stop, which is how a spoken line ends and how the
     workbook does not. Only one, and only at the very end, so "vs." keeps its
     period when it is inside the title. */
  const title = rawTitle.replace(/\s*[.。]\s*$/, "");
  if (!topic.trim() || !length.trim() || !title.trim()) return null;

  return {
    line: `Manager Meetings/${topic.trim()}/${length.trim()}/${title.trim()}`,
    topic: topic.trim(),
    length: length.trim(),
    title: title.trim(),
  };
}

/**
 * Cardinal number words only, and the omission of ordinals is deliberate.
 *
 * "second" is an ordinal AND a unit of time, and this library has
 * `The Thirty-Second Coaching Session` and `The 73-Second Pitch`. Folding
 * ordinals would turn "thirty-second" into "30 2" and break the two films the
 * rule was supposed to help. Cardinals cannot do that.
 *
 * COMPOUNDS DO NOT FOLD — "seventy-three" becomes "70 3", not "73". That is a
 * MISS, which HOLDS, which is the safe direction: the rule buys back the
 * films whose numbers are simple and declines the ones that are not.
 */
const NUMERALS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6",
  seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12",
  thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16",
  seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20", thirty: "30",
  forty: "40", fifty: "50", sixty: "60", seventy: "70", eighty: "80",
  ninety: "90", hundred: "100", thousand: "1000",
};

/**
 * Case and punctuation folded, for the second pass only.
 *
 * WHAT IS FOLDED AND WHY EACH ONE. Every rule here exists because a transcriber
 * and a workbook disagree about a character that carries no meaning:
 *
 *   · case            — whisper capitalises sentence-initially
 *   · dashes          — em, en and hyphen are one character to a listener
 *   · quotes          — curly and straight, and whisper prefers curly
 *   · "and" / "&"     — the workbook uses both
 *   · spacing         — around separators, and runs of whitespace
 *   · trailing stops  — a spoken line ends in a full stop the workbook has not
 *   · "mins"/"minutes"— the line says "10 mins", the column says "10 minutes",
 *                       and a speaker may say either
 *   · SEPARATORS      — slash, comma, full stop and nothing are one thing,
 *                       because the slash is how the line is WRITTEN and the
 *                       pause is how it is SPOKEN. This is the 26 November fix.
 *   · "A/C"           — three library titles carry a literal slash in the
 *                       product name; whisper writes "AC" or "A.C.".
 *   · numbers         — "The Six Checks" against a transcribed "the 6 checks".
 *
 * WHAT IS NOT FOLDED: letters, and the VALUE of a number. Nothing here can
 * turn one meeting into another, only one SPELLING of a meeting into the same
 * meeting — "Ten and Five" and "Nine and Five" stay apart, asserted below.
 */
export function foldLine(line: string): string {
  const folded = line
    .toLowerCase()
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/\s*&\s*/g, " and ")
    .replace(/\bminutes\b/g, "mins")
    /* Before the separators collapse, or "a/c" becomes "a c" and the spoken
       "AC" no longer reaches it. */
    .replace(/\ba\s*[/.]\s*c\b/g, "ac")
    /* THE SEPARATOR GOES THE SAME WAY AS EVERY OTHER PUNCTUATION MARK. The
       slash is no longer preserved — that is the whole of the fix. */
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    /* And the same product name spelled "A.C." or "A C", now that the stops
       have become spaces. */
    .replace(/\ba c\b/g, "ac");

  return folded
    .split(" ")
    .map((w) => NUMERALS[w] ?? w)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The track's name, as the only thing in the line whose SPELLING may vary.
 *
 * Whisper renders "Manager Meetings" as "Manage your meetings" more often than
 * not — five of the first six clips. That is one phrase, transcribed two ways,
 * and it is the anchor rather than a discriminator: it chooses no film, it only
 * says which track is speaking. So it folds, and nothing downstream of it does.
 *
 * NARROW ON PURPOSE. `Manager Bank Account, deposit number four` is the other
 * manager series' slate shape and must not be claimed — ruling 6, asserted in
 * the suite. "manager bank account" matches none of these.
 */
const ANCHOR = /\b(?:manager meetings?|manage your meetings?)\b/;

/** How much leading filler may precede the anchor and still count as "opens with". */
const ANCHOR_WITHIN = 24;

/**
 * Fold a line and take off its leading anchor, so what is left is the part that
 * identifies the MEETING rather than the track.
 *
 * ONE DEFINITION, USED BOTH WAYS. `claimed` answers "is this a Manager Meetings
 * film at all" and `rest` is the comparison key — and they must agree about
 * where the anchor ends or the jurisdiction test and the lookup would disagree
 * about the same string. Two implementations of that is how one of them drifts.
 *
 * LEADING ONLY. A bare `.replace(ANCHOR, "")` eats the phrase from the middle of
 * a title too, which is how a normaliser quietly becomes a different function
 * from the one its name claims.
 */
function splitAnchor(line: string): { claimed: boolean; rest: string } {
  const folded = foldLine(line);
  const m = folded.match(ANCHOR);
  if (!m || m.index === undefined || m.index > ANCHOR_WITHIN) {
    return { claimed: false, rest: folded };
  }
  return { claimed: true, rest: folded.slice(m.index + m[0].length).trim() };
}

/** A trailing `(Solo)`-style annotation, which the workbook carries and nobody reads aloud. */
function withoutTrailingParenthetical(line: string): string {
  return line.replace(/\s*\([^()]*\)\s*$/, "").trim();
}

const anchorless = (line: string) => splitAnchor(line).rest;

/**
 * Look the spoken line up in the library: exact first, then folded.
 *
 * AN AMBIGUOUS FOLD IS A HOLD. If folding makes the spoken line match two
 * library rows, this refuses and names both. Folding is a widening, and a
 * widening that returns several answers has not identified anything — picking
 * the first would be a confident wrong answer with no error, which is the thing
 * this codebase keeps paying for. Exact matching cannot be ambiguous:
 * `content_classification_line_idx` is unique.
 */
/*
 * A CLAIMED TRACK NEVER FALLS THROUGH TO THE ADVISOR MATCHER.
 *
 * This is the half of the 26 November fix that matters more than the matching,
 * and it is the dangerous half of the old behaviour. When the parser could not
 * read the slate it returned `line: null`, which identify-videos.ts reads as
 * "not a manager film" — so the clip went to `transcript-match.ts`, which
 * weighs service keywords, and a leadership meeting came back named after
 * whichever service it happened to mention. Measured on the six:
 *
 *   IMG_3655  ->  TRF-011 — On the Drive — v2     (a Tire Repair RESHOOT)
 *   IMG_3656  ->  FND — Objections — v1           at MEDIUM confidence
 *   IMG_3658  ->  FND — Sing It — v1              at MEDIUM confidence
 *
 * Medium is not held, so `--apply` would have renamed two of them, and the
 * first would have been ingested as a v2 REPLACEMENT — swapping a live advisor
 * pitch film's master for a manager meeting. A confident wrong answer with no
 * error anywhere, which AGENTS.md calls worse than a crash.
 *
 * So the anchor decides jurisdiction, and the lookup decides identity. Once a
 * transcript says "manager meetings" in any spelling, the ONLY two outcomes
 * are a library row or a hold — never another track's guess.
 */
export function matchSlate(transcript: string, rows: SlateRow[]): SlateMatch {
  const head = slateHead(transcript);
  const { claimed, rest: spoken } = splitAnchor(head);
  if (!claimed) {
    return { ok: false, line: null, reason: "no Manager Meetings slate in the opening" };
  }

  /* What gets quoted in the report. The slashed form is preferred when it is
     there, because it is the richer evidence; otherwise it is the head exactly
     as spoken, minus the full stop a sentence ends with. Folding must never
     rewrite the evidence — a reader checks this against the audio. */
  const read = readSlate(transcript);
  const line =
    read?.line ?? head.replace(/\s+/g, " ").trim().replace(/\s*[.。!?]+\s*$/, "");

  /* Arm 1 — verbatim. Cannot be ambiguous: the index is unique. */
  const exact = rows.find((r) => r.classification_line === line);
  if (exact) return { ok: true, row: exact, line, how: "exact" };

  /*
   * Arms 2-4, each tried only when the one before it found nothing, and each
   * refusing rather than choosing when it finds several.
   *
   * The comparison drops the anchor from BOTH sides, because that is the one
   * phrase whose spelling varies, and compares what is left word for word. A
   * library line that is a word-PREFIX of the head is accepted because whisper
   * sometimes runs the first words of the film onto the slate; measured over
   * all 213 rows, no library line is a prefix of another, so this arm cannot
   * be ambiguous through the library's own shape.
   */
  const arms: { how: SlateHow; hit: (target: string) => boolean; of: (l: string) => string }[] = [
    { how: "folded", of: anchorless, hit: (t) => spoken === t },
    { how: "folded-prefix", of: anchorless, hit: (t) => spoken.startsWith(`${t} `) },
    {
      how: "folded-parenthetical",
      of: (l) => anchorless(withoutTrailingParenthetical(l)),
      hit: (t) => spoken === t,
    },
  ];

  for (const arm of arms) {
    const hits = rows.filter((r) => {
      const target = arm.of(r.classification_line);
      return Boolean(target) && arm.hit(target);
    });
    if (hits.length === 1) return { ok: true, row: hits[0], line, how: arm.how };
    if (hits.length > 1) {
      return {
        ok: false,
        line,
        reason:
          `the spoken line folds onto ${hits.length} library rows, so it does ` +
          `not identify one meeting`,
        candidates: hits,
      };
    }
  }

  return {
    ok: false,
    line,
    reason: "spoken slate is not in the library — HOLD, not a guess",
  };
}
