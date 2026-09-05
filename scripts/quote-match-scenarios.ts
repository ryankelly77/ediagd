/* ============================================================================
   EDIAGD — a filmed quote knows which quote it is

   Batch 2 of the Drop Zone brought a kind of film the pitch matcher had never
   seen: thirty-to-eighty-second pieces that open "Aloha, Get Better by Kobe
   Bryant". It refused all of them, correctly — there is no deck and no stage in
   a Kobe Bryant quote, and inventing one would have been the failure that
   module exists to avoid.

   They are not new content. The library holds 436 quotes with ids and voices,
   and these are those quotes read to camera. So the job is two things: the name
   the ingest can route, and the artifact_id link that says the video and the
   quote are one thing.

     1. THE ANNOUNCEMENT IS THE SIGNAL. Greeting, title, "by", voice.
     2. THE VOICE IS A GATE, NOT A SCORE. Right words and wrong speaker puts
        Lombardi's line under Bruce Lee's name on an advisor's screen.
     3. AMBIGUOUS PROPOSES NO LINK. Same rule as everywhere else here.

     npm run test:quote-match
   ============================================================================ */

import {
  matchQuoteVideo,
  parseAnnouncement,
  type LibraryQuote,
} from "../lib/video/quote-match";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`    ✓ ${label}`);
  } else {
    failed++;
    failures.push(`${label}\n        expected ${e}\n        actual   ${a}`);
    console.log(`    ✗ ${label}  expected ${e}, got ${a}`);
  }
}

console.log("\n  THE ANNOUNCEMENT\n");

/* Real openings, from the Drop Zone transcripts. */
const KOBE = "Aloha, Get Better by Kobe Bryant. Another Kobe one, Get Better. Get Better on Monday, then Get Better on Tuesday.";
const LOMBARDI = "Aloha, Confidence by Vince Lombardi. Confidence is contagious. So is the lack of confidence.";
const LEE = "Aloha, the most dangerous person by Bruce Lee. The most dangerous person listens, thinks, observes, and adapts.";
const SEAL = "Aloha, three things in a teammate, dependable, skilled, selfless, by Chad Wright, Navy SEAL. Dependability, you've got to be where you say.";
const MINE = "Aloha. The one thing you can control every day is your attitude. That's one by me. Having the right attitude is essential.";
const ORIGINAL = "Aloha! One focus, a Mitch Hardt original. Choosing a daily mantra can be powerful if you're disciplined.";
const INTERNET = "Aloha. Tomorrow Me vs. Today Me. This is an internet quote. Tomorrow Me wants it more than Today Me.";

check("title and voice split on 'by'", parseAnnouncement(KOBE), {
  title: "Get Better",
  voice: "Kobe Bryant",
  voiceFrom: "by-attribution",
});
check("a one-word title", parseAnnouncement(LOMBARDI), {
  title: "Confidence",
  voice: "Vince Lombardi",
  voiceFrom: "by-attribution",
});
check("a spoken title is title-cased", parseAnnouncement(LEE), {
  title: "The Most Dangerous Person",
  voice: "Bruce Lee",
  voiceFrom: "by-attribution",
});
check("a rank stays with the name, capitals and all", parseAnnouncement(SEAL)?.voice, "Chad Wright, Navy SEAL");
check("'that's one by me' is Mitch", parseAnnouncement(MINE)?.voice, "Mitch Hardt");
check("and so is 'a Mitch Hardt original'", parseAnnouncement(ORIGINAL)?.voice, "Mitch Hardt");
check("an unattributed quote has no voice", parseAnnouncement(INTERNET)?.voice, null);
/* The full stop in "vs." is not a sentence end — splitting on the first period
   truncated this title to "Tomorrow Me vs". */
check("an abbreviation inside a title does not truncate it", parseAnnouncement(INTERNET)?.title, "Tomorrow Me vs. Today Me");
check("no announcement at all", parseAnnouncement(""), null);

console.log("\n  FINDING IT IN THE LIBRARY\n");

const library: LibraryQuote[] = [
  {
    id: "q-kobe-1",
    quoteKey: "Q0094",
    title: "Get Better — Monday, Tuesday, Every Day",
    body: "Get Better on Monday, then Get Better on Tuesday. Every day you're trying to become better — it's a constant, infinite quest.",
    voice: "Kobe Bryant",
  },
  {
    id: "q-kobe-2",
    quoteKey: "Q0095",
    title: "The Mamba Mentality",
    body: "The Mamba Mentality simply means trying to be the best version of yourself, every single day, without exception or excuse.",
    voice: "Kobe Bryant",
  },
  {
    id: "q-lombardi",
    quoteKey: "Q0210",
    title: "Confidence Is Contagious",
    body: "Confidence is contagious. So is the lack of confidence. As a manager you set the tone for your whole drive.",
    voice: "Vince Lombardi",
  },
  {
    id: "q-mitch",
    quoteKey: "Q0321",
    title: "The One Thing You Control",
    body: "The one thing you can control every day is your attitude. Having the right attitude is essential for your success.",
    voice: "Mitch Hardt",
  },
];

const kobe = matchQuoteVideo(KOBE, library);
check("the Kobe film finds the Kobe quote", kobe.match?.quoteKey, "Q0094");
check("and not the other Kobe quote", kobe.match?.quoteId, "q-kobe-1");
check("and proposes the ingest's name", kobe.proposedName, "MINDSET — Get Better (Kobe Bryant) — v1");

const lom = matchQuoteVideo(LOMBARDI, library);
check("the Lombardi film finds its quote", lom.match?.quoteKey, "Q0210");

const mine = matchQuoteVideo(MINE, library);
check("a Mitch original links to a Mitch quote", mine.match?.quoteKey, "Q0321");
check("and is named with his voice", mine.proposedName, "MINDSET — The One Thing You Can Control Every Day Is Your Attitude (Mitch Hardt) — v1");

console.log("\n  THE VOICE IS A GATE\n");

/* The words are Lombardi's; the film says Bruce Lee. Linking on the words alone
   would put one man's line under another's name on an advisor's screen. */
const WRONG_VOICE =
  "Aloha, Confidence by Bruce Lee. Confidence is contagious. So is the lack of confidence. As a manager you set the tone for your whole drive.";
const wrong = matchQuoteVideo(WRONG_VOICE, library);
check("a voice with no library quotes proposes no link", wrong.match, null);
check("and says why", wrong.reason, "no library quote is attributed to Bruce Lee");
check("but the film is still named", wrong.proposedName, "MINDSET — Confidence (Bruce Lee) — v1");

/* A film whose quote simply is not in the library yet. */
const NEW_ONE =
  "Aloha, Compounding by Warren Buffett. Somebody's sitting in the shade today because somebody planted a tree a long time ago.";
const fresh = matchQuoteVideo(NEW_ONE, library);
check("an unknown quote proposes no link", fresh.match, null);
check("and is still nameable", fresh.proposedName, "MINDSET — Compounding (Warren Buffett) — v1");

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\n  FAILURES");
  failures.forEach((f) => console.log(`    ${f}`));
  process.exit(1);
}
