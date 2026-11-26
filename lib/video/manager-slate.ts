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

export type SlateMatch =
  | { ok: true; row: SlateRow; line: string; how: "exact" | "folded" }
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
 * Case and punctuation folded, for the second pass only.
 *
 * WHAT IS FOLDED AND WHY EACH ONE. Every rule here exists because a transcriber
 * and a workbook disagree about a character that carries no meaning:
 *
 *   · case            — whisper capitalises sentence-initially
 *   · dashes          — em, en and hyphen are one character to a listener
 *   · quotes          — curly and straight, and whisper prefers curly
 *   · "and" / "&"     — the workbook uses both
 *   · spacing         — around slashes, and runs of whitespace
 *   · trailing stops  — a spoken line ends in a full stop the workbook has not
 *   · "mins"/"minutes"— the line says "10 mins", the column says "10 minutes",
 *                       and a speaker may say either
 *
 * WHAT IS NOT FOLDED: letters and digits. Nothing here can turn one meeting
 * into another, only one SPELLING of a meeting into the same meeting.
 */
export function foldLine(line: string): string {
  return line
    .toLowerCase()
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/\s*&\s*/g, " and ")
    .replace(/\bminutes\b/g, "mins")
    .replace(/\s*\/\s*/g, "/")
    .replace(/[^\p{L}\p{N}/]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
export function matchSlate(transcript: string, rows: SlateRow[]): SlateMatch {
  const read = readSlate(transcript);
  if (!read) {
    return { ok: false, line: null, reason: "no Manager Meetings slate in the opening" };
  }

  const exact = rows.find((r) => r.classification_line === read.line);
  if (exact) return { ok: true, row: exact, line: read.line, how: "exact" };

  const target = foldLine(read.line);
  const folded = rows.filter((r) => foldLine(r.classification_line) === target);
  if (folded.length === 1) {
    return { ok: true, row: folded[0], line: read.line, how: "folded" };
  }
  if (folded.length > 1) {
    return {
      ok: false,
      line: read.line,
      reason:
        `the spoken line folds onto ${folded.length} library rows, so it does ` +
        `not identify one meeting`,
      candidates: folded,
    };
  }

  return {
    ok: false,
    line: read.line,
    reason: "spoken slate is not in the library — HOLD, not a guess",
  };
}
