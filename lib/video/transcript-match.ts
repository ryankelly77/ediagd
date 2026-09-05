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
 * Spelled exactly as the teleprompter spells them — "FILM 1 · ON THE DRIVE",
 * "FILM 4 · MPI SELLING" — and exactly as the Master Quiz Bank's `Film / Stage`
 * column spells them, because those two already agree and a third spelling here
 * would be the one that has to be reconciled later.
 */
export const STAGES = [
  "On the Drive",
  "At the Kiosk",
  "Set Up the MPI",
  "MPI Selling",
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
  "Set Up the MPI": [
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
  code?: string;
  terms: DeckTerm[];
};

/* ---- Scoring ------------------------------------------------------------- */

const normalise = (s: string): string =>
  s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

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
export function scoreStages(transcript: string): Scored<Stage>[] {
  const text = normalise(transcript);
  return STAGES.map((stage) => {
    let score = 0;
    const hits: string[] = [];
    for (const { phrase, weight } of STAGE_MARKERS[stage]) {
      const n = occurrences(text, phrase);
      if (n > 0) {
        /* Counted ONCE however often it is said. A presenter who says "kiosk"
           nine times is not nine times more at the kiosk, and rewarding
           repetition would let one verbal tic outweigh three distinct
           structural markers. */
        score += weight;
        hits.push(phrase);
      }
    }
    return { value: stage, score, hits };
  }).sort((a, b) => b.score - a.score);
}

/** Every deck, scored, best first. */
export function scoreDecks(
  transcript: string,
  profiles: DeckProfile[]
): Scored<DeckProfile>[] {
  const text = normalise(transcript);
  return profiles
    .map((profile) => {
      let score = 0;
      const hits: string[] = [];
      for (const { term, weight } of profile.terms) {
        if (occurrences(text, term) > 0) {
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
const DECK_MIN_RATIO = 1.6;
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
export function matchTranscript(
  transcript: string,
  profiles: DeckProfile[]
): Proposal {
  const decks = scoreDecks(transcript, profiles);
  const stages = scoreStages(transcript);

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
  const stageOk =
    Boolean(bestStage) &&
    bestStage.score >= STAGE_MIN_SCORE &&
    bestStage.score - (nextStage?.score ?? 0) >= STAGE_MIN_MARGIN;

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

  return {
    deck: bestDeck.value.deck,
    code: bestDeck.value.code ?? null,
    stage: bestStage.value,
    confidence,
    evidence,
    runnerUp,
  };
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
export function proposedName(proposal: Proposal, version = 1): string | null {
  if (!proposal.code || !proposal.stage) return null;
  return `${proposal.code} — ${proposal.stage} — v${version}`;
}
