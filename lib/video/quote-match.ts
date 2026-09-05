/* ============================================================================
   EDIAGD — the filmed version of a quote we already hold

   PURE. A sibling to transcript-match.ts, not an extension of it. That one
   answers "which deck, which stage" and refuses anything that is not a pitch
   film — correctly: it declined to invent a deck for a Kobe Bryant quote. This
   answers the other question, about the short films that open

       "Aloha, Get Better by Kobe Bryant."
       "Aloha, Confidence by Vince Lombardi."
       "Aloha, the most dangerous person by Bruce Lee."

   ---------------------------------------------------------------------------
   THESE ARE QUOTES WE ALREADY HAVE, FILMED
   ---------------------------------------------------------------------------
   The library holds 436 quotes with ids and voices. A mindset video is one of
   them read to camera — so the video and the quote are two halves of one thing,
   and `artifact_id` is the column that says so. Linking them at ingest is the
   same job we did by hand for the video↔quote pass, done at birth instead of
   archaeologically.

   It matters beyond tidiness: pickQuotesForDay excludes the lifestyle video's
   artifact twin, which is the only thing stopping the same words being served
   twice in one three-minute ritual. An unlinked filmed quote is a duplicate
   waiting to happen.

   ---------------------------------------------------------------------------
   IT PROPOSES THE LINK. IT DOES NOT MAKE IT.
   ---------------------------------------------------------------------------
   Same rule as the twin proposals: a link changes what the day picker serves,
   and "these two say the same thing" is a judgement. The match goes to the
   review queue with its evidence and a person confirms it.
   ============================================================================ */

import { similarity } from "@/lib/video/transcript-match";

/** A quote in the library, as much of it as matching needs. */
export type LibraryQuote = {
  id: string;
  title: string;
  body: string | null;
  voice: string | null;
  quoteKey: string | null;
};

export type Announcement = {
  /** "Get Better" — what he calls it before he performs it. */
  title: string;
  /** "Kobe Bryant", or null when he does not attribute it. */
  voice: string | null;
  /** How the voice was determined, for the report. */
  voiceFrom: "by-attribution" | "his-own" | null;
};

/** Words that take a full stop without ending a sentence. */
const ABBREVIATIONS = new Set(["vs", "mr", "mrs", "ms", "dr", "st", "jr", "sr", "no", "inc", "co"]);

/** Where the first real sentence ends, or -1. */
function sentenceEnd(text: string): number {
  const re = /[.!?]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const before = text.slice(0, m.index).match(/([A-Za-z]+)$/)?.[1] ?? "";
    if (ABBREVIATIONS.has(before.toLowerCase())) continue;
    const after = text.slice(m.index + 1);
    /* End of input, or whitespace then a new sentence. */
    if (/^\s*$/.test(after) || /^\s+\S/.test(after)) return m.index;
  }
  return -1;
}

const clean = (s: string): string =>
  s.replace(/\s+/g, " ").replace(/^[\s,.:;—–-]+|[\s,.:;—–-]+$/g, "").trim();

/** Title Case for a spoken title — "the most dangerous person" reads as a title. */
function titleCase(s: string): string {
  const small = new Set(["a", "an", "the", "of", "in", "on", "to", "vs", "and", "or", "by", "for"]);
  return s
    .split(/\s+/)
    .map((w, i) => {
      /* Punctuation stripped for the lookup: "vs." is the small word "vs"
         wearing a full stop, and comparing the whole token capitalised it. */
      const bare = w.toLowerCase().replace(/[^a-z]/g, "");
      return i > 0 && small.has(bare)
        ? w.toLowerCase()
        : w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

/**
 * Phrases that mean "this one is mine".
 *
 * Mitch attributes other people out loud and himself sideways — "That's one by
 * me", "a Mitch Hardt original". 192 of the library's quotes are his, so this
 * is not an edge case; it is the largest single voice in the corpus.
 */
const HIS_OWN = [
  /\bthat'?s one by me\b/,
  /\bthis one'?s? (is )?mine\b/,
  /\bmitch hardt original\b/,
  /\ba mitch original\b/,
  /\bone of my own\b/,
  /\bby me\b/,
];

/**
 * What the film says it is, from its opening.
 *
 * ---------------------------------------------------------------------------
 * THE ANNOUNCEMENT IS THE WHOLE SIGNAL
 * ---------------------------------------------------------------------------
 * Every one of these opens the same way: greeting, title, attribution. It is a
 * far cleaner signal than the pitch films' — there is no deck vocabulary to
 * weigh and no stage to infer, just a sentence that says what is coming.
 *
 * The "by" is the split. Everything before it is the title and everything after
 * is the voice, up to the first sentence end — which is why "by Chad Wright,
 * Navy SEAL" keeps the rank: it is part of how he credits the man.
 */
export function parseAnnouncement(transcript: string): Announcement | null {
  const text = clean(transcript);
  const body = text.replace(/^aloha[!.,]?\s*/i, "");
  /* The first sentence, and only the first: the performance that follows
     repeats the title and would otherwise be read as more of it.

     THE PERIOD MUST END A SENTENCE, NOT AN ABBREVIATION. "Tomorrow Me vs. Today
     Me" is one title with a full stop inside it, and it defeats the obvious
     rules twice over: splitting on the first period truncates it to "Tomorrow
     Me vs", and requiring a capital afterwards does not help because "Today" is
     capitalised. The only thing that separates them is knowing "vs" is an
     abbreviation. */
  const end = sentenceEnd(body);
  const opening = end === -1 ? body.slice(0, 160) : body.slice(0, end);
  if (!opening) return null;

  const lower = text.toLowerCase();
  const his = HIS_OWN.some((re) => re.test(lower));

  /* "<title> by <voice>". The LAST "by" wins — a title can contain one
     ("Get Better by Getting Better") and the attribution is always last. */
  const by = opening.toLowerCase().lastIndexOf(" by ");
  if (by > 0) {
    const rawTitle = clean(opening.slice(0, by));
    const rawVoice = clean(opening.slice(by + 4));
    /* "by me" is an attribution to Mitch, not a voice called "me". */
    if (/^(me|myself)$/i.test(rawVoice)) {
      return { title: titleCase(rawTitle), voice: "Mitch Hardt", voiceFrom: "his-own" };
    }
    if (rawTitle && rawVoice) {
      return {
        title: titleCase(rawTitle),
        voice: titleCase(primaryVoice(rawVoice)),
        voiceFrom: "by-attribution",
      };
    }
  }

  /* Strip a trailing "a Mitch Hardt original" from the TITLE — it is the
     attribution, not part of the name. Whisper renders it "One focus of Mitch
     Hardt original", which without this became the title verbatim. */
  let bare = clean(opening);
  for (const re of HIS_OWN) {
    bare = clean(bare.replace(new RegExp(`(,|\\bof\\b|\\ba\\b)?\\s*${re.source}`, "i"), ""));
  }
  const title = titleCase(bare || clean(opening));
  if (!title) return null;
  return his
    ? { title, voice: "Mitch Hardt", voiceFrom: "his-own" }
    : { title, voice: null, voiceFrom: null };
}

/**
 * Is this film about the PLATFORM rather than about a quote?
 *
 * ---------------------------------------------------------------------------
 * A THIRD KIND, AND IT LOOKS LIKE THE SECOND
 * ---------------------------------------------------------------------------
 * "Aloha. Thank you so much for being a part of the EDIAGD training platform"
 * opens exactly like a mindset film and is not one — it explains what the app
 * is and what three minutes a day buys. Named as a quote it would go on the
 * Mindset shelf and surface in the daily rotation, which is the wrong shelf
 * for the film that welcomes somebody to the product.
 *
 * THE SIGNAL IS THE OFFER, NOT THE BRAND. The first version of this also
 * matched "name of the app" and "EDIAGD stands for", and Mitch ruled that film
 * (IMG_2289) a mindset piece about attitude — it explains the acronym on the
 * way to making a point about how you show up, which is not the same as telling
 * somebody what the product will do for them.
 *
 * So these are the phrases that describe what the platform PROVIDES. Brand
 * colour is dropped: any film may explain the name, and one that only does that
 * is still a film about its own subject.
 */
const ONBOARDING_SIGNALS = [
  /\btraining platform\b/,
  /\beach day you will be provided\b/,
  /\bwelcome to (the )?ediagd\b/,
  /\bthis platform\b/,
  /\bthree minutes a day\b/,
];

export function onboardingSignals(transcript: string): string[] {
  const text = transcript.toLowerCase();
  return ONBOARDING_SIGNALS.filter((re) => re.test(text)).map((re) => re.source);
}

/** Two signals, for the same reason the production-note guard wants two. */
export const isOnboarding = (transcript: string): boolean =>
  onboardingSignals(transcript).length >= 2;

/* ---- Finding it in the library ------------------------------------------- */

const norm = (s: string | null): string =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * How well a library quote's VOICE agrees with the film's attribution.
 *
 * A film that says "by Kobe Bryant" may only link to a Kobe Bryant quote. This
 * is a gate, not a score: getting the words nearly right and the speaker wrong
 * produces a link that is confidently, visibly false — the app would attribute
 * Vince Lombardi's line to Bruce Lee on an advisor's screen.
 *
 * An UNATTRIBUTED film is not blocked, only unhelped: "Tomorrow Me vs. Today
 * Me. This is an internet quote" names no voice, so any voice may match it on
 * the strength of the words alone.
 */
/**
 * The person, out of a chain of credit.
 *
 * "Mitch Hardt, via Dumois, and John Nash" is Mitch citing his sources, and
 * carrying the whole chain into the voice column makes a film nothing can match
 * and nobody can read. The first name is the voice; the rest is provenance and
 * belongs in the body, not the byline.
 *
 * A comma alone does not trigger this — "Chad Wright, Navy SEAL" is one man
 * with a rank, and truncating that would drop how he is credited.
 */
export function primaryVoice(raw: string): string {
  if (!/\b(via|and)\b/i.test(raw)) return raw;
  const first = raw.split(",")[0];
  return clean(first || raw);
}

function voiceAgrees(filmVoice: string | null, quoteVoice: string | null): boolean {
  if (!filmVoice) return true;
  if (!quoteVoice) return false;
  const a = norm(filmVoice);
  const b = norm(quoteVoice);
  /* "Chad Wright, Navy SEAL" against a library "Chad Wright": one contains the
     other. Not equality, because he credits people at different lengths. */
  return a === b || a.startsWith(b) || b.startsWith(a);
}

export type QuoteMatch = {
  quoteId: string;
  quoteKey: string | null;
  quoteTitle: string;
  quoteVoice: string | null;
  /** 0-1 on the performed words against the quote's body. */
  similarity: number;
  /** Why this one — the reader should not have to take the number on faith. */
  why: string;
};

export type QuoteProposal = {
  announcement: Announcement | null;
  /** MINDSET — Title (Voice) — v1, the name the ingest parses. */
  proposedName: string | null;
  /** The library quote this film performs, if one is clearly it. */
  match: QuoteMatch | null;
  confidence: "high" | "medium" | "low" | "none";
  evidence: string[];
  reason?: string;
};

/*
 * A performance is not a recitation. He reads the quote and then talks around
 * it for a minute, so the film's words CONTAIN the quote rather than equalling
 * it — which is exactly what containment on the shorter side measures.
 *
 * The margin matters as much as the score, for the reason it did with the
 * teleprompter scripts: several quotes by the same voice share vocabulary, and
 * a flat field means the words matched the speaker's habits, not a line.
 */
const MATCH_FLOOR = 0.5;
const MATCH_RATIO = 1.25;

export function matchQuoteVideo(
  transcript: string,
  quotes: LibraryQuote[]
): QuoteProposal {
  const announcement = parseAnnouncement(transcript);
  if (!announcement) {
    return {
      announcement: null,
      proposedName: null,
      match: null,
      confidence: "none",
      evidence: [],
      reason: "no announcement — the film does not open by naming itself",
    };
  }

  const evidence = [
    `opens "${announcement.title}"` +
      (announcement.voice ? ` by ${announcement.voice}` : " (unattributed)"),
  ];

  const eligible = quotes.filter((q) => voiceAgrees(announcement.voice, q.voice));

  const scored = eligible
    .map((q) => {
      const bodyScore = similarity(transcript, q.body ?? "");
      /* The spoken title is the other half. He says the quote's title before he
         performs it, so a title hit is strong evidence on its own — and the
         library titles are long enough that agreeing on one is not chance. */
      const titleHit = norm(q.title).includes(norm(announcement.title)) ||
        norm(announcement.title).includes(norm(q.title));
      /* A TITLE HIT CARRIES THE FLOOR ON ITS OWN.
         These films run thirty to eighty seconds, and similarity() needs ten
         content words on each side before it will score at all — so the
         shortest ones have no body signal whatsoever. Their announced title
         against a distinctive library title, with the voice already agreeing,
         is the evidence. Weighted below to reach the floor unaided. */
      return { q, bodyScore, titleHit, score: bodyScore + (titleHit ? MATCH_FLOOR : 0) };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const next = scored[1];

  const name = announcement.voice
    ? `MINDSET — ${announcement.title} (${announcement.voice}) — v1`
    : `MINDSET — ${announcement.title} — v1`;

  if (!best || best.score < MATCH_FLOOR) {
    return {
      announcement,
      proposedName: name,
      match: null,
      confidence: announcement.voice ? "medium" : "low",
      evidence,
      reason: eligible.length
        ? "no library quote matches the performed words — it may be a new one"
        : `no library quote is attributed to ${announcement.voice}`,
    };
  }

  if (next && next.score > 0 && best.score / next.score < MATCH_RATIO) {
    return {
      announcement,
      proposedName: name,
      match: null,
      confidence: "low",
      evidence: [...evidence, `ambiguous: ${best.q.quoteKey} and ${next.q.quoteKey} score alike`],
      reason: "two library quotes match equally well — linking would be a coin toss",
    };
  }

  return {
    announcement,
    proposedName: name,
    match: {
      quoteId: best.q.id,
      quoteKey: best.q.quoteKey,
      quoteTitle: best.q.title,
      quoteVoice: best.q.voice,
      similarity: Number(best.bodyScore.toFixed(3)),
      why: best.titleHit
        ? "the spoken title matches the quote's title, and the words match its body"
        : "the performed words match the quote's body",
    },
    confidence: best.titleHit && best.bodyScore >= 0.6 ? "high" : "medium",
    evidence: [...evidence, `matches ${best.q.quoteKey ?? best.q.id}: "${best.q.title}"`],
  };
}
