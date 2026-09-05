/* ============================================================================
   EDIAGD — telling ten identical-looking films apart by what is said in them

   PURE. No client, no filesystem, no server-only. Ten camera-roll files came in
   as IMG_2161…IMG_2174: same presenter, same setting, same framing. Nothing on
   screen says which is which. The identity is entirely in the words, so this
   takes a transcript and proposes which deck and which stage it is.

   ---------------------------------------------------------------------------
   WRITTEN ONCE, FOR TWO CALLERS
   ---------------------------------------------------------------------------
   Today: scripts/identify-videos.ts, against local whisper transcripts of files
   nobody has named yet. Next: the self-naming ingest, against the transcripts
   Mux generates on upload. Same function, same thresholds — the second caller
   must not get a second opinion, because then a film named at ingest and the
   same film named by the one-off would disagree and both would look right.

   ---------------------------------------------------------------------------
   IT PROPOSES. IT NEVER DECIDES.
   ---------------------------------------------------------------------------
   Every return carries its evidence and a confidence, and `none` is a real
   answer. A wrong name on a film is worse than an unnamed one: an unnamed file
   sits in the Drop Zone until somebody looks, and a misnamed one gets ingested,
   served to advisors as the wrong stage of the wrong deck, and is only found
   when somebody watches all four films of a deck in order and one is about
   brake fluid.
   ============================================================================ */

/* ---- Stages -------------------------------------------------------------- */

/**
 * The four films of an op-code deck, plus the foundational modules.
 *
 * CANONICAL VOCABULARY, WHICH IS NOT WHAT MITCH SAYS. Ryan's ruling: the third
 * film is "MPI Setup". The teleprompter writes "FILM 3 · SET UP THE MPI" and the
 * quiz bank writes "Set Up the MPI"; both are his phrasing and both still match,
 * because the markers below read what he says while this list decides what gets
 * written down. One name in the library, however many ways it is spoken.
 *
 * PART 1 / PART 2 ARE REAL FILM NAMES, not a fallback. The deck map's "4 films"
 * is approximate — A/C Recharge splits a film in two and the quiz bank's
 * `Film / Stage` column carries "Part 1" and "Part 2" as its own values. The
 * quiz bank is the authority on a deck's internal structure.
 */
export const STAGES = [
  "On the Drive",
  "At the Kiosk",
  "MPI Setup",
  "MPI Selling",
  "Part 1",
  "Part 2",
  "Pre-Write",
  "Objections",
  "Wrap-Up",
] as const;

export type Stage = (typeof STAGES)[number];

/**
 * Phrases that place a transcript in a stage, with what each is worth.
 *
 * STRUCTURAL, NOT TOPICAL. Every one of these appears in the same stage of
 * every deck, which is the whole point: they identify WHERE in the pitch a film
 * sits without knowing what it is selling. The deck vocabulary answers the
 * other half.
 *
 * Weights are coarse on purpose — 3 for a phrase that only ever occurs in one
 * stage, 2 for a strong hint, 1 for a supporting word. Fine-grained weights
 * would imply a precision this has no way to earn from seven fixtures.
 */
const STAGE_MARKERS: Record<Stage, { phrase: string; weight: number }[]> = {
  "On the Drive": [
    { phrase: "walk-around", weight: 3 },
    { phrase: "walk around", weight: 3 },
    { phrase: "on the drive", weight: 3 },
    { phrase: "pop the hood", weight: 3 },
    { phrase: "popping the hood", weight: 3 },
    { phrase: "under the hood", weight: 2 },
    { phrase: "30-second", weight: 2 },
    { phrase: "thirty second", weight: 2 },
    { phrase: "2-minute", weight: 2 },
    { phrase: "two minute", weight: 2 },
    { phrase: "greet", weight: 1 },
    { phrase: "meet the customer", weight: 2 },
    { phrase: "at the car", weight: 1 },
  ],
  "At the Kiosk": [
    { phrase: "kiosk", weight: 3 },
    { phrase: "write-up", weight: 2 },
    { phrase: "write up", weight: 2 },
    { phrase: "at the desk", weight: 2 },
    { phrase: "review of your history", weight: 3 },
    { phrase: "based on time", weight: 2 },
    { phrase: "btm", weight: 2 },
    { phrase: "authorize", weight: 1 },
    { phrase: "authorization", weight: 1 },
    { phrase: "by 2:30", weight: 2 },
    { phrase: "are you familiar with", weight: 2 },
  ],
  "MPI Setup": [
    { phrase: "let's set up", weight: 4 },
    { phrase: "lets set up", weight: 4 },
    { phrase: "set up that multi-point", weight: 4 },
    { phrase: "set that", weight: 1 },
    { phrase: "multi-point", weight: 3 },
    { phrase: "multi point", weight: 3 },
    { phrase: "multipoint", weight: 3 },
    { phrase: "set up the mpi", weight: 3 },
    { phrase: "green yellow", weight: 3 },
    { phrase: "green, yellow", weight: 3 },
    { phrase: "yellow and red", weight: 3 },
    { phrase: "approve button", weight: 3 },
    { phrase: "green approve", weight: 3 },
    { phrase: "quick call", weight: 2 },
    { phrase: "90-second", weight: 2 },
    { phrase: "ninety second", weight: 2 },
    { phrase: "highlight video", weight: 2 },
    { phrase: "scale of", weight: 1 },
  ],
  "MPI Selling": [
    /* The opening declaration, and the only phrase that separates the selling
       film from the setup film — both are full of multi-point language. */
    { phrase: "after the multi-point", weight: 4 },
    { phrase: "after that multi-point", weight: 4 },
    { phrase: "after your multi-point", weight: 4 },
    { phrase: "after our multi-point", weight: 4 },
    { phrase: "came back from the multi-point", weight: 4 },
    { phrase: "inspection is back", weight: 3 },
    { phrase: "two greens", weight: 3 },
    { phrase: "greens before", weight: 3 },
    { phrase: "before you name the red", weight: 3 },
    { phrase: "hector recommends", weight: 3 },
    { phrase: "came back from hector", weight: 3 },
    { phrase: "piggyback", weight: 2 },
    { phrase: "reward action", weight: 2 },
    { phrase: "thank them", weight: 1 },
    { phrase: "what can be done", weight: 2 },
    { phrase: "mileage", weight: 1 },
  ],
  "Part 1": [{ phrase: "part one", weight: 1 }],
  "Part 2": [
    { phrase: "in part one", weight: 4 },
    { phrase: "part one, we covered", weight: 4 },
    { phrase: "we covered", weight: 1 },
  ],
  "Pre-Write": [
    { phrase: "pre-write", weight: 3 },
    { phrase: "pre write", weight: 3 },
    { phrase: "prewrite", weight: 3 },
    { phrase: "packet", weight: 3 },
    { phrase: "deferred", weight: 2 },
    { phrase: "declined", weight: 1 },
    { phrase: "recalls and campaigns", weight: 3 },
    { phrase: "before the customer arrives", weight: 2 },
    { phrase: "special instruction", weight: 2 },
  ],
  Objections: [
    { phrase: "objection", weight: 3 },
    { phrase: "overcoming objections", weight: 3 },
    { phrase: "when they say no", weight: 3 },
    { phrase: "too expensive", weight: 2 },
    { phrase: "i don't drive much", weight: 2 },
    { phrase: "think about it", weight: 2 },
    { phrase: "push back", weight: 2 },
    { phrase: "pushback", weight: 2 },
  ],
  "Wrap-Up": [
    { phrase: "wrap-up", weight: 3 },
    { phrase: "wrap up", weight: 2 },
    { phrase: "active delivery", weight: 3 },
    { phrase: "next visit", weight: 2 },
    { phrase: "walk them to the car", weight: 2 },
  ],
};

/* ---- Decks --------------------------------------------------------------- */

export type DeckTerm = { term: string; weight: number };

/**
 * One deck's fingerprint, as produced by scripts/build-deck-vocabulary.ts from
 * the 485 questions in the Master Quiz Bank.
 *
 * `code` is optional because the quiz bank names decks and does not carry op
 * codes; the caller supplies the mapping it knows about. A profile with no code
 * still matches — it just proposes a deck name rather than a filename prefix.
 */
export type DeckProfile = {
  deck: string;
  code?: string | null;
  terms: DeckTerm[];
  /**
   * An op-code deck (four films about one service) or a foundational module
   * (Pre-Write, Sing It, Wrap-Up — filmed once, applies to every op code).
   *
   * SCORED IN SEPARATE POOLS, and this is not a refinement — it is the fix for
   * the way the first version failed on every real transcript. Every op-code
   * film is full of selling language, so the modules that TEACH selling tie
   * with the deck that is actually being sold: a transcript scoring "brake,
   * fluid, moisture, feet, trucks" was refused because "Sing It" scored level
   * with it. A module can no longer outrank a deck; it only answers when no
   * deck does.
   */
  kind?: "op_code" | "foundational";
};

/* ---- Scoring ------------------------------------------------------------- */

const normalise = (s: string): string =>
  s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

/**
 * Drop the clauses that say a stage did NOT happen.
 *
 * ---------------------------------------------------------------------------
 * MITCH OPENS EVERY FILM BY LISTING WHAT YOU DIDN'T DO
 * ---------------------------------------------------------------------------
 *   "You didn't do pre-writes. You didn't pop the hood. You didn't have a menu.
 *    You didn't get kiosk time — but you did set up that multi-point."
 *
 * Every one of those is a stage marker for a stage the film is not about. Left
 * in, they beat the real signal: IMG_2174 is an MPI Selling film that scored
 * "At the Kiosk" on the strength of the words "you didn't get kiosk time".
 *
 * The negation is formulaic enough to remove exactly — "didn't <anything up to
 * the next clause boundary>" — which is the only reason a rule this blunt is
 * safe. It runs on the STAGE pass only: the deck words in those clauses are
 * still about this film's own service.
 */
export function stripNegated(text: string): string {
  return normalise(text).replace(/\b(?:did ?n't|didnt|do ?n't|dont|never)\b[^.,;!?]*/g, " ");
}

/** Word-boundary containment, so "close" does not match inside "closest". */
function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const boundaryStart = /^[a-z0-9]/.test(needle) ? "\\b" : "";
  const boundaryEnd = /[a-z0-9]$/.test(needle) ? "\\b" : "";
  const re = new RegExp(`${boundaryStart}${escaped}${boundaryEnd}`, "g");
  return (haystack.match(re) ?? []).length;
}

export type Scored<T> = { value: T; score: number; hits: string[] };

/** Every stage, scored, best first. Exported so a caller can show the runner-up. */
/**
 * How far into a transcript the film announces itself.
 *
 * Every one of these opens the same way — "Let's offer that brake fluid
 * exchange right there on the drive", "Let's sell some engine air filters
 * after the multi-point inspection". The declaration is in the first sentence
 * or two and everything after it is the pitch, which naturally mentions every
 * other stage. Markers found in the opening are worth double.
 */
export function scoreStages(transcript: string): Scored<Stage>[] {
  const text = stripNegated(transcript);
  const opening = stripNegated(transcript.slice(0, OPENING_CHARS));

  return STAGES.map((stage) => {
    let score = 0;
    const hits: string[] = [];

    for (const d of DECLARATIONS) {
      if (d.stage === stage && occurrences(opening, d.phrase) > 0) {
        score += DECLARATION_WEIGHT;
        hits.unshift(`opens with "${d.phrase}"`);
      }
    }

    /*
     * THE OVERLAP IS ONE-WAY, SO THE TIEBREAK IS TOO.
     *
     * A selling film's opening contains both declarations — "Now that brake
     * fluid... but you did set up that multi-point" — while a setup film never
     * says "let's sell" or "now that". So when both fire, the selling phrase is
     * the one that carries information and the setup phrase is the recap.
     * Docking the setup claim rather than boosting the selling one keeps a
     * genuine setup film, which triggers only one of them, exactly where it was.
     */
    if (stage === "MPI Setup") {
      const sells = DECLARATIONS.some(
        (d) => d.stage === "MPI Selling" && occurrences(opening, d.phrase) > 0
      );
      if (sells) score -= DECLARATION_WEIGHT;
    }

    for (const { phrase, weight } of STAGE_MARKERS[stage]) {
      /* Counted ONCE however often it is said. A presenter who says "kiosk"
         nine times is not nine times more at the kiosk, and rewarding
         repetition would let one verbal tic outweigh three distinct
         structural markers. */
      if (occurrences(text, phrase) > 0) {
        score += weight;
        hits.push(phrase);
      }
      /* ...but saying it in the opening line is the film naming itself. */
      if (occurrences(opening, phrase) > 0) score += weight;
    }
    return { value: stage, score, hits };
  }).sort((a, b) => b.score - a.score);
}

/**
 * Every deck, scored, best first.
 *
 * ---------------------------------------------------------------------------
 * THE OPENING NAMES THE SERVICE; THE BODY NAMES THE WHOLE INSPECTION
 * ---------------------------------------------------------------------------
 * Every film in this corpus declares itself in its first sentence — "Let's set
 * up that engine air filter multi-point inspection", "Let's offer that brake
 * fluid exchange right there on the drive". After that it recaps the
 * multi-point, and the multi-point grades the battery, the tyres, the brakes
 * and the filters on every single car.
 *
 * So the body of EVERY film mentions half the decks. Scored flat, "Battery"
 * came out top on all forty-eight with an identical 0.163, because Hector
 * checks the battery whatever the film is about. Weighting the declaration
 * above the recap is not a tuning knob — it is the difference between reading
 * what the film is and reading what an inspection covers.
 */
const OPENING_CHARS = 220;

/**
 * The film's declaration: the first real sentence, past the greeting.
 *
 * Every one of these opens "Aloha!" or "Aloha," and then says what it is. The
 * greeting is skipped rather than counted as the sentence.
 */
export function firstSentence(text: string): string {
  const body = text.replace(/^\s*aloha[!.,]?\s*/i, "").trim();
  const end = body.search(/[.!?]/);
  return end === -1 ? body.slice(0, 160) : body.slice(0, end + 1);
}

/**
 * How the film announces itself, scored on the OPENING ALONE.
 *
 * ---------------------------------------------------------------------------
 * THE SELLING FILM RECAPS THE SETUP FILM
 * ---------------------------------------------------------------------------
 * "Let's sell some engine air filters after the multi-point inspection. You
 * didn't do pre-writes, you didn't pop the hood... but you DID set up that
 * multi-point." Every fourth film says "set up that multi-point" in its recap,
 * and every fourth film was therefore named "Set Up the MPI" — the same wrong
 * answer on seven decks in a row.
 *
 * The recap is in the body; the declaration is in the first sentence. These
 * phrases are only ever counted in the opening, and they outweigh everything
 * the body can say. Nothing here is a tuning constant: it is the one sentence
 * where Mitch says what the film is.
 */
const DECLARATIONS: { phrase: string; stage: Stage }[] = [
  { phrase: "let's set up", stage: "MPI Setup" },
  { phrase: "lets set up", stage: "MPI Setup" },
  { phrase: "set up that", stage: "MPI Setup" },
  { phrase: "set that", stage: "MPI Setup" },
  { phrase: "let's sell", stage: "MPI Selling" },
  { phrase: "lets sell", stage: "MPI Selling" },
  { phrase: "sell some", stage: "MPI Selling" },
  /* "after the / that / your / our multi-point" — he uses all four, and
     matching only "the" left two selling films reading as setup films. */
  { phrase: "after the multi-point", stage: "MPI Selling" },
  { phrase: "after that multi-point", stage: "MPI Selling" },
  { phrase: "after your multi-point", stage: "MPI Selling" },
  { phrase: "after our multi-point", stage: "MPI Selling" },
  { phrase: "after a multi-point", stage: "MPI Selling" },
  { phrase: "now that", stage: "MPI Selling" },
  /* "In part one, we covered..." is this film saying it is part two. Both
     multi-part films in the Drop Zone open exactly that way. */
  { phrase: "in part one", stage: "Part 2" },
  { phrase: "in part 1", stage: "Part 2" },
  { phrase: "part one, we covered", stage: "Part 2" },
  { phrase: "on the drive", stage: "On the Drive" },
  { phrase: "walk around", stage: "On the Drive" },
  { phrase: "walk-around", stage: "On the Drive" },
  { phrase: "at the kiosk", stage: "At the Kiosk" },
  { phrase: "pre-write", stage: "Pre-Write" },
  { phrase: "wrap", stage: "Wrap-Up" },
  { phrase: "objection", stage: "Objections" },
];

/** Decisive: a declaration outweighs anything the body can accumulate. */
const DECLARATION_WEIGHT = 12;
const DECK_OPENING_WEIGHT = 4;

/**
 * Does the film say the deck's NAME in its opening?
 *
 * ---------------------------------------------------------------------------
 * THE STRONGEST SIGNAL, AND THE ONE I BUILT LAST
 * ---------------------------------------------------------------------------
 * Three rounds of TF-IDF tuning were spent trying to make a vocabulary model
 * out-argue the fact that every film recaps a multi-point inspection which
 * grades the battery. None of it was necessary: Mitch opens every single film
 * by naming the service. "Let's offer that brake fluid exchange right there on
 * the drive." "Let's set up that engine air filter multi-point inspection."
 * The deck name IS in the transcript, spoken, in the first sentence.
 *
 * PREFIX-STEMMED, BECAUSE WHISPER MANGLES IT. "Engine air filter" comes back as
 * "engineer filters" often enough to matter, and "engine"/"engineer" and
 * "filter"/"filters" only match if a shared four-character prefix counts as a
 * match. Exact matching found neither and sent the film to the vocabulary
 * model, which is what put Battery on top of it.
 */
const NAME_STOP = new Set(["the", "and", "of", "a"]);

function stems(text: string): string[] {
  return normalise(text)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

/** True when two words share a four-character prefix — "filter"/"filters". */
const sameStem = (a: string, b: string): boolean =>
  a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b.slice(0, 4)) && (a.startsWith(b) || b.startsWith(a))));

/**
 * How much of the deck's name is present in the opening, 0-1.
 *
 * EVERY WORD OF THE NAME COUNTS. Dropping the shared ones — "fluid",
 * "exchange", "service" — looked like removing noise and instead collapsed
 * distinct decks onto each other: "Brake Fluid Exchange" and "Brake Service"
 * both reduce to "brake", scored 1.0 against the same film, and the tie
 * refused it. Kept whole, a film that says "brake fluid" scores 2/3 for the
 * exchange and 1/2 for the service, which is the right order and a real
 * margin.
 */
export function nameMatch(deckName: string, opening: string): number {
  const want = stems(deckName).filter((w) => !NAME_STOP.has(w));
  if (want.length === 0) return 0;
  const have = stems(opening);
  let hit = 0;
  for (const w of want) if (have.some((h) => sameStem(h, w))) hit++;
  return hit / want.length;
}

/** What a full name match in the opening is worth, against TF-IDF's ~0.1 scale. */
const NAME_WEIGHT = 1.0;

export function scoreDecks(
  transcript: string,
  profiles: DeckProfile[]
): Scored<DeckProfile>[] {
  const text = normalise(transcript);
  /* See the note in matchTranscript: "you didn't do pre-writes" is not this
     film being about pre-writes. */
  const opening = stripNegated(transcript.slice(0, OPENING_CHARS));

  return profiles
    .map((profile) => {
      /* The deck saying its own name in the opening outweighs the entire
         vocabulary model, deliberately — see nameMatch. A partial name match
         scores proportionally, so "Coolant Hoses" against a film that says
         "coolant" alone gets half and loses to "Coolant Exchange" if that one
         says its name in full. */
      const named = nameMatch(profile.deck, opening);
      let score = named * NAME_WEIGHT;
      const hits: string[] = named > 0 ? [`"${profile.deck}" named in the opening`] : [];

      for (const { term, weight } of profile.terms) {
        const inOpening = occurrences(opening, term) > 0;
        if (inOpening) {
          score += weight * DECK_OPENING_WEIGHT;
          hits.push(term);
        } else if (occurrences(text, term) > 0) {
          score += weight;
          hits.push(term);
        }
      }
      return { value: profile, score, hits };
    })
    .sort((a, b) => b.score - a.score);
}

/* ---- The proposal -------------------------------------------------------- */

export type Confidence = "high" | "medium" | "low" | "none";

export type Proposal = {
  deck: string | null;
  code: string | null;
  stage: Stage | null;
  /**
   * What goes between the dashes. The stage for a deck's film ("On the Drive",
   * "Part 2"); the module's own name for a foundational one ("Pre-Write", "The
   * Big Ticket Visit, Part 2").
   */
  title: string | null;
  /**
   * How it was identified. `declared` — the film says what it is in its opening.
   * `teleprompter` — the words match a known script, which is at least as
   * certain and is the reason the distinction is worth keeping: one can be
   * checked against a document, the other cannot.
   */
  source: "declared" | "teleprompter" | null;
  confidence: Confidence;
  /** Why, in the transcript's own words. Always populated, even at `none`. */
  evidence: string[];
  /** What it nearly was. The reason a `low` is low. */
  runnerUp: { deck: string | null; stage: Stage | null };
  /** Set when nothing was proposed, saying which half failed. */
  reason?: string;
};

/*
 * The bars.
 *
 * A DECK NEEDS BOTH AN ABSOLUTE SCORE AND A MARGIN. Absolute alone would name
 * every transcript that mentions a filter; margin alone would confidently pick
 * between two decks that each scored almost nothing. Cabin Air Filter and
 * Engine Air Filter share "filter", "airflow" and "evaporator" — that pair is
 * exactly what the margin is for, and it is why the ratio is generous rather
 * than a hair over 1.
 */
const DECK_MIN_SCORE = 0.02;
/*
 * Lowered from 1.6 once the deck's own NAME became the dominant signal. At 1.6
 * it was refusing correct answers with a clear winner — "Brake Fluid Exchange"
 * at 0.67 over "Brake Service" at 0.5 is not an ambiguity, it is two decks that
 * share a word. The vocabulary score breaks the remaining ties in the same
 * direction, because the body of a brake-fluid film says moisture and burned
 * and the body of a brake-service film says pads and rotors.
 */
const DECK_MIN_RATIO = 1.25;
const STAGE_MIN_SCORE = 3;
const STAGE_MIN_MARGIN = 2;

/**
 * What this transcript most likely is.
 *
 * ---------------------------------------------------------------------------
 * NO PROPOSAL IS A RESULT, NOT A FAILURE
 * ---------------------------------------------------------------------------
 * Ten files, two decks of four, so two are expected to be spare takes and any
 * of them could be something nobody mentioned. Forcing every transcript into
 * the nearest deck would turn "we filmed something else that day" into a
 * confidently mislabelled film. When either half is short of its bar the answer
 * is null and `reason` says which half.
 */
/**
 * Signals that this is a production note, not a film.
 *
 * ---------------------------------------------------------------------------
 * IMG_2241 IS MITCH TALKING TO RYAN
 * ---------------------------------------------------------------------------
 *   "So Ryan, this is an edit. I'm going to put this as part three. We need to
 *    take out that AC recharge where I said mahalo, the teleprompter stopped."
 *
 * Two minutes of it, in the Drop Zone, alongside the films. It is full of deck
 * vocabulary — A/C recharge, Arctic Blast, cabin filter — because he is talking
 * ABOUT the films, so the matcher named it "ACR-047 — MPI Setup — v1" with
 * medium confidence. That is the worst thing this module can do: a confident
 * wrong name on something that should never be ingested at all.
 *
 * A film is addressed to an advisor and never to Ryan, never mentions the
 * teleprompter as an object, and never discusses what to cut. TWO signals are
 * required, because any one of them could appear in a real film as an aside.
 */
const PRODUCTION_NOTE = [
  /\bso,? ryan\b/,
  /\bryan,? (this|i|we|can|could|let)\b/,
  /\bthis is an edit\b/,
  /\bwe need to (take out|cut|remove)\b/,
  /\bthe teleprompter (stopped|thought|died|froze)\b/,
  /\bput this as part\b/,
  /\bstart (that|this) over\b/,
];

export function productionNoteSignals(transcript: string): string[] {
  const text = normalise(transcript);
  return PRODUCTION_NOTE.filter((re) => re.test(text)).map((re) => re.source);
}

export function matchTranscript(
  transcript: string,
  profiles: DeckProfile[],
  scripts: FilmScript[] = []
): Proposal {
  /* Checked before anything else: a note that mentions six decks would
     otherwise be scored as a film about one of them. */
  const noteSignals = productionNoteSignals(transcript);
  if (noteSignals.length >= 2) {
    return {
      deck: null,
      code: null,
      stage: null,
      title: null,
      source: null,
      confidence: "none",
      evidence: noteSignals,
      runnerUp: { deck: null, stage: null },
      /* Held, not condemned. Mitch says "I'm going to put this as part three"
         inside it, so where it belongs is a real question with a real answer —
         it is simply not a question this can settle from the words. */
      reason: /\bpart (three|3)\b/.test(normalise(transcript))
        ? "speaks to Ryan about an edit and says it is meant as part three — held until somebody says which film it joins"
        : "speaks to Ryan about an edit rather than to an advisor — not a film on its own",
    };
  }

  /*
   * THE SCRIPT FIRST, WHEN THERE IS ONE. A word-for-word match to a known film
   * is the only signal here that can be checked against a document, so it is
   * not overruled by anything the vocabulary model thinks.
   */
  const scripted = matchScript(transcript, scripts);
  if (scripted) {
    return {
      deck: scripted.script.deck,
      code: scripted.script.code,
      stage: scripted.stage,
      title: scripted.stage,
      source: "teleprompter",
      confidence: "high",
      evidence: [
        `matches the teleprompter script for ${scripted.script.deck} · ${scripted.stage}` +
          ` (${Math.round(scripted.similarity * 100)}% of its words)`,
      ],
      runnerUp: { deck: null, stage: null },
    };
  }

  /*
   * OP-CODE DECKS FIRST, ALONE. A foundational module is only consulted when no
   * deck clears its bar — see DeckProfile.kind. Profiles with no `kind` are
   * treated as op-code decks, so a caller that supplies a plain list still
   * behaves the way it reads.
   */
  const deckPool = profiles.filter((p) => (p.kind ?? "op_code") === "op_code");
  const modulePool = profiles.filter((p) => p.kind === "foundational");

  const stages = scoreStages(transcript);
  let decks = scoreDecks(transcript, deckPool);

  const clears = (list: Scored<DeckProfile>[]) =>
    list[0] &&
    list[0].score >= DECK_MIN_SCORE &&
    (!list[1] || list[1].score === 0 || list[0].score / list[1].score >= DECK_MIN_RATIO);

  /*
   * A MODULE NAMES ITSELF TOO, and the pool order was hiding it.
   *
   * "Sing it. I'm gonna hand you a lot of word tracks" is the Sing It module
   * saying so in three words, and "when we have that big ticket item" is The
   * Big Ticket Visit. Consulting modules only when no DECK cleared meant a
   * deck that matched on incidental vocabulary — Tire Repair, on a film about
   * a big-ticket repair visit — beat a module that had named itself outright.
   *
   * So the name is compared across both pools first, and only if neither names
   * itself does the original deck-then-module order apply.
   */
  /*
   * A MODULE MUST NAME ITSELF IN THE FIRST SENTENCE.
   *
   * Not the first 220 characters — the first sentence. Mitch's second sentence
   * is always the list of what you did or didn't do first, and it names other
   * films constantly: "whether you did pre-writes or pre-selling" is not a
   * negation, so stripping cannot help, and the Pre-Write module won a
   * differential film on it.
   *
   * Sentence one is the declaration and nothing else: "Let's talk big ticket
   * items." "Sing it." "Today we're talking pre-writes." That is the whole
   * signal, and reading one word further is what kept breaking this.
   */
  const opening = stripNegated(firstSentence(transcript));
  const bestNamed = (pool: DeckProfile[]) =>
    pool
      .map((p) => ({ profile: p, named: nameMatch(p.deck, opening) }))
      .sort((a, b) => b.named - a.named)[0];

  const namedDeck = bestNamed(deckPool);
  const namedModule = bestNamed(modulePool);
  const NAME_CLEAR = 0.6;

  let moduleNamedItself = false;
  if (
    namedModule &&
    namedModule.named >= NAME_CLEAR &&
    namedModule.named > (namedDeck?.named ?? 0)
  ) {
    decks = scoreDecks(transcript, modulePool);
    moduleNamedItself = true;
  } else if (!clears(decks) && modulePool.length > 0) {
    const modules = scoreDecks(transcript, modulePool);
    if (clears(modules)) decks = modules;
  }

  const bestDeck = decks[0];
  const nextDeck = decks[1];
  const bestStage = stages[0];
  const nextStage = stages[1];

  const deckRatio =
    bestDeck && nextDeck && nextDeck.score > 0
      ? bestDeck.score / nextDeck.score
      : Infinity;

  const deckOk =
    Boolean(bestDeck) && bestDeck.score >= DECK_MIN_SCORE && deckRatio >= DECK_MIN_RATIO;
  /*
   * A FOUNDATIONAL MODULE IS ITS OWN STAGE. "Pre-Write" is not a film of a
   * four-film deck, it is the whole module — so requiring it to also win a
   * stage contest against the four film stages would refuse every module film.
   */
  /*
   * A FOUNDATIONAL STAGE CANNOT BELONG TO AN OP-CODE DECK.
   *
   * Pre-Write, Wrap-Up and Objections are filmed once and apply to every op
   * code — there is no "PSF-013 Pre-Write". The pre-write film names power
   * steering while listing what a packet contains, which was enough for the
   * deck model to attach a code to it. A film that declares itself one of the
   * three modules is a module, whatever service it happens to mention.
   */
  const FOUNDATIONAL_STAGES: Stage[] = ["Pre-Write", "Wrap-Up", "Objections"];
  /*
   * ONLY WHEN NOTHING NAMED ITSELF. The Big Ticket Visit, Part 2 talks about
   * the pre-write packet at length, which scored the Pre-Write STAGE high
   * enough to overrule the module that had already identified itself by name in
   * sentence one. A stage-derived module is the fallback, not the override.
   */
  const declaresModule =
    !moduleNamedItself &&
    bestStage &&
    FOUNDATIONAL_STAGES.includes(bestStage.value) &&
    bestStage.score >= STAGE_MIN_SCORE;

  const isModule = bestDeck?.value.kind === "foundational" || Boolean(declaresModule);
  const stageOk =
    isModule ||
    (Boolean(bestStage) &&
      bestStage.score >= STAGE_MIN_SCORE &&
      bestStage.score - (nextStage?.score ?? 0) >= STAGE_MIN_MARGIN);

  const evidence = [
    ...(bestDeck?.hits.slice(0, 6) ?? []),
    ...(bestStage?.hits.slice(0, 4) ?? []),
  ];

  const runnerUp = {
    deck: nextDeck?.value.deck ?? null,
    stage: nextStage?.value ?? null,
  };

  if (!deckOk || !stageOk) {
    return {
      deck: null,
      code: null,
      stage: null,
      title: null,
      source: null,
      confidence: "none",
      evidence,
      runnerUp,
      reason: !deckOk
        ? bestDeck && bestDeck.score < DECK_MIN_SCORE
          ? "no deck vocabulary matched"
          : `deck is ambiguous between ${bestDeck?.value.deck} and ${nextDeck?.value.deck}`
        : bestStage && bestStage.score < STAGE_MIN_SCORE
          ? "no stage language matched"
          : `stage is ambiguous between ${bestStage?.value} and ${nextStage?.value}`,
    };
  }

  /* HIGH needs both halves to be clear of their bar with room, because the two
     signals are independent: a transcript that is unmistakably brake fluid AND
     unmistakably the kiosk film is a different kind of sure from one that is
     merely past both thresholds. */
  const confidence: Confidence =
    deckRatio >= 2.5 && bestStage.score >= STAGE_MIN_SCORE + 3
      ? "high"
      : deckRatio >= 2 || bestStage.score >= STAGE_MIN_SCORE + 2
        ? "medium"
        : "low";

  /*
   * A MODULE'S TITLE IS ITS OWN NAME, a deck film's is its stage.
   *
   * "FND — Pre-Write — v1", not "FND — Foundational — v1"; "ACR-047 — Part 2 —
   * v1", not "ACR-047 — A/C Recharge — v1". And a module that is itself split
   * carries the part in its title: "FND — The Big Ticket Visit, Part 2 — v1".
   */
  const moduleName = declaresModule ? bestStage.value : bestDeck.value.deck;
  const part = bestStage?.value === "Part 2" ? ", Part 2" : "";
  const title = isModule
    ? `${moduleName}${part}`
    : bestStage
      ? bestStage.value
      : null;

  return {
    deck: declaresModule ? bestStage.value : bestDeck.value.deck,
    code: isModule ? FOUNDATIONAL_CODE : bestDeck.value.code ?? null,
    title,
    source: "declared",
    /* A module's "stage" is the module. Its four-film siblings have one; it
       does not, and naming a Pre-Write film "On the Drive" because the words
       walk-around appeared in it would be worse than leaving it blank. */
    stage: isModule && !declaresModule ? null : bestStage?.value ?? null,
    confidence,
    evidence,
    runnerUp,
  };
}

/* ---- Ground truth: the scripts he read ----------------------------------- */

export type FilmScript = {
  deck: string;
  code: string | null;
  /** As the teleprompter writes it — "SET UP THE MPI". Mapped below. */
  stage: string;
  text: string;
};

/** The teleprompter's spelling of a film, in canonical vocabulary. */
function canonicalStage(raw: string): Stage | null {
  const k = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (k === "onthedrive") return "On the Drive";
  if (k === "atthekiosk") return "At the Kiosk";
  if (k === "setupthempi" || k === "mpisetup" || k === "setupmpi") return "MPI Setup";
  if (k === "mpiselling") return "MPI Selling";
  return null;
}

/**
 * A transcript that IS one of the known scripts.
 *
 * ---------------------------------------------------------------------------
 * READING THE SCRIPT IS A DECLARATION
 * ---------------------------------------------------------------------------
 * Ryan's ruling, and it settles the one film that identified nothing about
 * itself: IMG_2250 opens "Aloha, let's talk Arctic Blast. Now, quick lane, this
 * one's easy, and it starts with a question your customer has probably never
 * been asked in their life" — which is the teleprompter's Arctic Blast Film 1,
 * word for word. Refusing to name it would be modesty past the point of
 * accuracy: the script is what he is reading.
 *
 * ---------------------------------------------------------------------------
 * THE MARGIN IS THE EVIDENCE, NOT THE SCORE
 * ---------------------------------------------------------------------------
 * Measured against the twenty known scripts, an absolute threshold cannot do
 * this. IMG_2250 matches its own script at 0.708 and IMG_2166 matches a script
 * it has nothing to do with at 0.709 — every EDIAGD film shares the presenter,
 * the structure and most of the selling vocabulary, so a floor high enough to
 * exclude the false one excludes the true one too.
 *
 * What separates them is the runner-up. A film against its own script leaves
 * the field behind: 0.708 over 0.458, 0.725 over 0.498. A film with no script
 * in the set scores flat across all of them — 0.709, 0.674, 0.670 — because it
 * is matching the house style, not a document.
 *
 * Volume 1 is missing from data/, which is why the flat case exists at all:
 * Engine Air Filter and Brake Fluid have no scripts here to match against.
 */
export const SCRIPT_THRESHOLD = 0.62;
export const SCRIPT_MIN_RATIO = 1.35;

export function matchScript(
  transcript: string,
  scripts: FilmScript[]
): { script: FilmScript; stage: Stage; similarity: number } | null {
  const scored = scripts
    .map((script) => ({ script, stage: canonicalStage(script.stage), s: similarity(transcript, script.text) }))
    .filter((x): x is { script: FilmScript; stage: Stage; s: number } => x.stage !== null)
    .sort((a, b) => b.s - a.s);

  const best = scored[0];
  const next = scored[1];
  if (!best || best.s < SCRIPT_THRESHOLD) return null;
  if (next && next.s > 0 && best.s / next.s < SCRIPT_MIN_RATIO) return null;

  return { script: best.script, stage: best.stage, similarity: Number(best.s.toFixed(3)) };
}

/* ---- Two takes of the same film ------------------------------------------ */

const CONTENT_WORD = /^[a-z0-9']{3,}$/;

function contentTokens(text: string): Set<string> {
  return new Set(
    normalise(text)
      .replace(/[^a-z0-9'\s]/g, " ")
      .split(/\s+/)
      .filter((w) => CONTENT_WORD.test(w))
  );
}

/**
 * |A ∩ B| / |A| on the SHORTER side.
 *
 * The same scorer the quote matcher and the dealer-code matcher use, for the
 * same reason: a shortened second take is nearly a subset of the first, and
 * dividing by the union would score a true pair of takes at 0.6 and miss it.
 */
export function similarity(a: string, b: string): number {
  const ta = contentTokens(a);
  const tb = contentTokens(b);
  if (ta.size < 10 || tb.size < 10) return 0;
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  let hit = 0;
  for (const t of small) if (large.has(t)) hit++;
  return hit / small.size;
}

/**
 * Two takes of one film read as near-copies of each other. A pair scoring this
 * high is the same script twice.
 *
 * Set well above the incidental overlap between two DIFFERENT films of the same
 * deck — those share the presenter's habits, the op code and a fair amount of
 * boilerplate, and run around 0.4–0.6. It is a threshold for "the same words",
 * not "the same subject".
 */
export const TAKE_THRESHOLD = 0.82;

export type TakePair<T> = { a: T; b: T; similarity: number };

/**
 * Pairs that are takes of the same film.
 *
 * PROPOSES A KEEPER, DOES NOT DISCARD. The longer transcript is offered because
 * a retake is usually the one where he got all the way through — but a longer
 * take can equally be the one with the fluff, so nothing here deletes, renames
 * or excludes. The report shows the pair and a person picks.
 */
export function findTakes<T extends { id: string; transcript: string }>(
  items: T[]
): TakePair<T>[] {
  const pairs: TakePair<T>[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const s = similarity(items[i].transcript, items[j].transcript);
      if (s >= TAKE_THRESHOLD) {
        pairs.push({ a: items[i], b: items[j], similarity: Number(s.toFixed(3)) });
      }
    }
  }
  return pairs.sort((x, y) => y.similarity - x.similarity);
}

/** Of two takes, the one to propose keeping. Longer transcript wins. */
export function proposedKeeper<T extends { id: string; transcript: string }>(
  pair: TakePair<T>
): T {
  return pair.a.transcript.length >= pair.b.transcript.length ? pair.a : pair.b;
}

/* ---- The name it would get ----------------------------------------------- */

/**
 * The canonical filename the ingest expects: `CODE — Title — v1`.
 *
 * Em dashes and the v-suffix match scripts/ingest-videos.ts's parseName, which
 * is the thing that has to read this back. Returns null without a code, because
 * a filename with no op code is not a name the ingest can do anything with.
 */
/**
 * The prefix every foundational module is filed under.
 *
 * Ryan's ruling. A module is filmed once and applies to every op code, so it
 * has no op code of its own — and a film with no prefix is a film the ingest
 * cannot route. FND is the shelf; the module's own name is the title, which is
 * why "FND — Pre-Write — v1" and not "FND — Foundational — v1".
 */
export const FOUNDATIONAL_CODE = "FND";

export function proposedName(proposal: Proposal, version = 1): string | null {
  if (!proposal.code || !proposal.title) return null;
  return `${proposal.code} — ${proposal.title} — v${version}`;
}
