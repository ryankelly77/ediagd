/* ============================================================================
   EDIAGD — can the words tell the films apart?

   Forty-eight camera-roll files are in the Drop Zone. Same presenter, same
   setting, same framing, sequential numbers, nothing on screen that says which
   is which. The only thing that distinguishes them is what is said, so this is
   the test of the only signal available.

   THE FIXTURES ARE REAL WORDS, not paraphrases. The stage fixtures are lifted
   from data/EDIAGD_Teleprompter_Vol2.docx — the document Mitch reads to camera,
   so they are as close to a transcript as anything that exists before the
   transcripts do. The deck fixtures come from the Master Quiz Bank's own
   explanations for those decks. Inventing plausible-sounding fixtures would
   have tested my idea of how Mitch talks.

   THE ONE THAT MUST FAIL. A generic opening that names no service and no stage
   has to return no proposal. Ten of these files are expected to be spare takes
   and any of them could be something nobody mentioned — a matcher that always
   answers would turn "we filmed something else that day" into a confidently
   misnamed film, ingested and served as the wrong stage of the wrong deck.

     npm run test:transcript-match
   ============================================================================ */

import {
  findTakes,
  matchTranscript,
  proposedName,
  scoreStages,
  similarity,
  type DeckProfile,
} from "../lib/video/transcript-match";
import vocabulary from "../data/deck-vocabulary.json";

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

/* The op codes this task names. The quiz bank knows deck NAMES; codes come from
   the caller, exactly as the module's DeckProfile.code documents. */
const CODES: Record<string, string> = {
  "Engine Air Filter": "EAF-001",
  "Brake Fluid Exchange": "BFF-012",
};

const profiles: DeckProfile[] = (
  vocabulary.decks as { deck: string; terms: { term: string; weight: number }[] }[]
).map((d) => ({ deck: d.deck, code: CODES[d.deck], terms: d.terms }));

/* ---- Stage fixtures, from the teleprompter ------------------------------- */

const ON_THE_DRIVE = `
Step five of your walk-around. Hit the windshield washer fluid. Most advisors
treat that step as a fluid-level check. It isn't. That's the wiper sale, and it
happens in three seconds on every single car that pulls in. You just made those
blades run across wet glass with the customer sitting right there watching.
This is the 30-second walk-around, and when you pop the hood it becomes the
two minute version.`;

const AT_THE_KIOSK = `
The drive is where you ask the question. The kiosk is where you show them the
whole picture. Now we're at the desk doing the write-up, and I start with a
review of your history. Based on time and mileage, this is where BTM does the
work. Are you familiar with what we do here? Then price, then the time — I can
have you out by 2:30 — and then I ask them to authorize it.`;

const SET_UP_THE_MPI = `
Quick lane setup, and this op code has a wrinkle worth naming. There's nothing
on the multi-point that says needs this service. Hector grades 27 items. None
of them is a reading, a measurement, a yellow or red that points at it. On a
scale of green, yellow and red, the quickest way to get your vehicle back is
selecting the green approve button. Do you mind if I give you a quick call?
You'll get a 90-second highlight video with it.`;

const MPI_SELLING = `
OK. You didn't do pre-writes. You never hit the washer fluid. No menus, no
kiosk time. But you set up the multi-point well and now we're going to
capitalize. Focus on what can be done instead of what cannot be done. Thank
them for the mileage they put on it. Two greens before you name the red —
that's what Hector recommends, and the piggyback comes right after. Reward
action when a customer has done the right thing.`;

const PRE_WRITE = `
If you are doing everything you can to be successful, you are building a
pre-write packet for every customer on your schedule. Deferred items from last
time. Things based on time and mileage this time. Recalls and campaigns tied to
the VIN. Previous history. Special instruction notes. Do it before the customer
arrives.`;

const OBJECTIONS = `
Let's talk about overcoming objections. When they say no, most advisors either
argue or fold. I don't drive much is the one you hear on this service. It's too
expensive is another. I need to think about it. None of those is a door
closing. Every objection has a root, and your job is to find it before you
answer the pushback.`;

console.log("\n  EVERY STAGE IS RECOGNISED FROM ITS OWN SCRIPT\n");

const stageOf = (t: string) => scoreStages(t)[0].value;
check("the walk-around is On the Drive", stageOf(ON_THE_DRIVE), "On the Drive");
check("the write-up desk is At the Kiosk", stageOf(AT_THE_KIOSK), "At the Kiosk");
check("green/yellow/red is MPI Setup", stageOf(SET_UP_THE_MPI), "MPI Setup");
check("two greens before the red is MPI Selling", stageOf(MPI_SELLING), "MPI Selling");
check("the packet is Pre-Write", stageOf(PRE_WRITE), "Pre-Write");
check("saying no is Objections", stageOf(OBJECTIONS), "Objections");

/* ---- Deck fixtures, both decks in this task ------------------------------ */

const EAF_DRIVE = `
Popping the hood is where you go from the 30-second walk-around to the more
robust two minute version. That's where the airbox becomes available. Pull the
engine air filter and show them the old filter — it did its job. Never say
dirty, bad, broken or shot. Don't bang it against the tire. Some come out in
seconds, some need a tool, and some stores don't want advisors opening the
airbox on the drive at all.`;

const BFF_KIOSK = `
At the kiosk, the objection on brake fluid is I don't drive much, and it's the
one you're built to win. Brake fluid absorbs moisture out of the air whether
the car sits in a garage or runs all day. A review of your history matters here
because the last exchange date is the sale. Most manufacturers land in a
two-to-three-year window. We say exchange, every time — never flush. Based on
time, mileage and condition.`;

console.log("\n  BOTH DECKS ARE TOLD APART\n");

const eaf = matchTranscript(EAF_DRIVE, profiles);
check("the airbox film is Engine Air Filter", eaf.deck, "Engine Air Filter");
check("and it is the drive film", eaf.stage, "On the Drive");
check("and it carries its op code", eaf.code, "EAF-001");
check(
  "and it proposes the name the ingest expects",
  proposedName(eaf),
  "EAF-001 — On the Drive — v1"
);

const bff = matchTranscript(BFF_KIOSK, profiles);
check("the moisture film is Brake Fluid Exchange", bff.deck, "Brake Fluid Exchange");
check("and it is the kiosk film", bff.stage, "At the Kiosk");
check("and it carries its op code", bff.code, "BFF-012");

/* The two decks must not be confusable with each other — the whole task is
   telling these two apart. */
check("brake fluid is not proposed for the air filter film", eaf.deck !== "Brake Fluid Exchange", true);
check("the air filter is not proposed for the brake fluid film", bff.deck !== "Engine Air Filter", true);

/* ---- The one that must refuse -------------------------------------------- */

console.log("\n  AMBIGUOUS MEANS NO PROPOSAL\n");

/* Real EDIAGD language, and it identifies nothing: no service is named and no
   stage marker appears. This is what a spare take of an intro looks like. */
const AMBIGUOUS = `
Aloha. Today I want to talk about the way you carry yourself with a customer.
Be positive. Be upbeat. Use positive language. If you fail to plan, you plan to
fail — you've heard me say it. Take the word track, learn it until you're not
thinking about it anymore, and then go out and mean it. Mahalo.`;

const amb = matchTranscript(AMBIGUOUS, profiles);
check("nothing is proposed", amb.deck, null);
check("no stage either", amb.stage, null);
check("confidence says so", amb.confidence, "none");
check("and it says which half failed", typeof amb.reason === "string" && amb.reason.length > 0, true);

/* An empty transcript is the degenerate case — a file whose audio failed. */
const empty = matchTranscript("", profiles);
check("an empty transcript proposes nothing rather than throwing", empty.confidence, "none");

/* ---- Two takes of one film ----------------------------------------------- */

console.log("\n  TAKES OF THE SAME FILM\n");

/* A retake: the same script, restarted, a few words different. */
const EAF_DRIVE_TAKE_2 = `
Popping the hood is where you go from the 30-second walk-around to the more
robust two minute version. That's where the airbox becomes available. Pull the
engine air filter and show them the old filter — it did its job. Never say
dirty, bad, broken or shot. Don't bang it against the tire. Some come out in
seconds and some need a tool.`;

const items = [
  { id: "IMG_2161", transcript: EAF_DRIVE },
  { id: "IMG_2162", transcript: EAF_DRIVE_TAKE_2 },
  { id: "IMG_2164", transcript: BFF_KIOSK },
  { id: "IMG_2165", transcript: MPI_SELLING },
];

const takes = findTakes(items);
check("one pair of takes is found", takes.length, 1);
check("and it is the right pair", [takes[0]?.a.id, takes[0]?.b.id], ["IMG_2161", "IMG_2162"]);

/* Two DIFFERENT films of the same deck share the presenter, the op code and a
   lot of boilerplate. They must not read as takes. */
check(
  "two different films are not takes of each other",
  similarity(EAF_DRIVE, MPI_SELLING) < 0.82,
  true
);
check(
  "nor are two films from different decks",
  similarity(EAF_DRIVE, BFF_KIOSK) < 0.82,
  true
);

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\n  FAILURES");
  failures.forEach((f) => console.log(`    ${f}`));
  process.exit(1);
}
