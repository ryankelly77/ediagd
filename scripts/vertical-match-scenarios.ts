/* ============================================================================
   EDIAGD — the vertical fidelity gate, against the films it actually judged

   The five fixtures in scripts/fixtures/vertical-gate-transcripts.json are the
   REAL head and tail transcripts of the five films the old gate refused on
   21 November, read from Mux with the same instrument the derive uses. Two of
   those refusals were correct and three were not, and this suite is the thing
   that says which is which — so it fails if the new comparison loosens far
   enough to accept a wrong-cut mezzanine, and fails if it stays tight enough to
   refuse a faithful crop.

   A suite that only proved the three false refusals now pass would be
   satisfied by `return { ok: true }`. The two correct refusals are what stop
   that, and they are the reason the fixtures are real rather than invented.
   ============================================================================ */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  endsMatch,
  normaliseWord,
  tokens,
  type EndsLike,
} from "./vertical-match";

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

type Fixture = {
  title: string;
  expect: "pass" | "refuse";
  master: EndsLike & { note?: string | null };
  vertical: EndsLike & { note?: string | null };
};

const FIXTURES: Fixture[] = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "vertical-gate-transcripts.json"), "utf8")
);

console.log("\n1. normalising — a numeral and its number word are one word");
check("'2' and 'Two' agree", normaliseWord("2") === normaliseWord("Two"), true);
check("'1.' and 'one' agree", normaliseWord("1.") === normaliseWord("one"), true);
check("'Mahalo.' and 'Mahalo!' agree", normaliseWord("Mahalo.") === normaliseWord("Mahalo!"), true);
check("a bare '-' reduces to nothing", normaliseWord("-"), "");
check("and is dropped from a transcript", tokens("find where fee -"), ["find", "where", "fee"]);
check("'two' and 'too' still differ", normaliseWord("two") === normaliseWord("too"), false);

console.log("\n1b. a spoken reduction is the words it stands for");
check("'Outta' becomes out of", tokens("Outta"), ["out", "of"]);
check("and in a phrase", tokens("get the hell outta here"), ["get", "the", "hell", "out", "of", "here"]);
check("'gonna' becomes going to", tokens("gonna"), ["going", "to"]);
/* Not a synonym list: a word that merely MEANS something similar is not in the
   map, because that is what the one substitution is for, under a budget. */
check("'items' is not rewritten to anything", tokens("items"), ["items"]);

console.log("\n2. the five films the old gate judged, from their real transcripts");
for (const f of FIXTURES) {
  const r = endsMatch(f.master, f.vertical);
  check(`${f.title} — ${f.expect}`, r.ok, f.expect === "pass");
  if (r.ok !== (f.expect === "pass")) console.log(`        ${r.detail}`);
  else if (!r.ok) console.log(`        refused on the ${r.which}: ${r.detail.slice(0, 110)}…`);
}

console.log("\n3. the 8 October mezzanine cases, from derive-vertical.ts's header");
/* Measured that day over four films: on two of them the mezzanine "begins about
   five seconds INTO the film and contains no Aloha at all", while the HLS opens
   on it. Those are the words the header records; the rest of each line is the
   film continuing, which is exactly what makes the vertical look plausible. */
const mezz = (head: string, start: number): EndsLike => ({
  headHeard: head, tailHeard: "and that is how you do it mahalo", whisperFirstStart: start,
});
check(
  "Successful vs. Really Successful — mezz opens 'successful', refused",
  endsMatch(
    mezz("Aloha! There is a difference between successful and really successful people", 0.2),
    mezz("successful and really successful people and the difference is this", 0.1)
  ).ok,
  false
);
check(
  "Four Step Close, Part 2 — mezz opens 'and say it', refused",
  endsMatch(
    mezz("Aloha! Step two is to ask for the sale and say it like you mean it", 0.3),
    mezz("and say it like you mean it every single time on every single", 0.1)
  ).ok,
  false
);
check(
  "On the Drive — mezz and hls agree, accepted",
  endsMatch(
    mezz("Aloha! Let's talk about what happens on the drive today", 0.25),
    mezz("Aloha! Let's talk about what happens on the drive today", 0.22)
  ).ok,
  true
);

console.log("\n4. a tail cut short by several seconds of speech");
const fullTail =
  "so remember the three things we talked about today write them down and use them tomorrow mahalo";
const shortTail = "so remember the three things we talked about today";
check(
  "a tail missing a real stretch of the ending is refused",
  endsMatch(
    { headHeard: "Aloha! Here is the thing about today", tailHeard: fullTail, whisperFirstStart: 0.2 },
    { headHeard: "Aloha! Here is the thing about today", tailHeard: shortTail, whisperFirstStart: 0.2 }
  ).ok,
  false
);
check(
  "and it says the TAIL is what failed",
  endsMatch(
    { headHeard: "Aloha! Here is the thing about today", tailHeard: fullTail, whisperFirstStart: 0.2 },
    { headHeard: "Aloha! Here is the thing about today", tailHeard: shortTail, whisperFirstStart: 0.2 }
  ).which,
  "tail"
);
check(
  "one word gained at the boundary is not a refusal",
  endsMatch(
    { headHeard: "Aloha! Here is the thing", tailHeard: "you can reach your full", whisperFirstStart: 0.2 },
    { headHeard: "Aloha! Here is the thing", tailHeard: "you can reach your full position", whisperFirstStart: 0.2 }
  ).ok,
  true
);

console.log("\n5. the head offset, the secondary guard");
check(
  "same words, two seconds of new silence at the front, refused",
  endsMatch(
    { headHeard: "Aloha! Let's talk about the walk around", tailHeard: "and that is it mahalo", whisperFirstStart: 0.2 },
    { headHeard: "Aloha! Let's talk about the walk around", tailHeard: "and that is it mahalo", whisperFirstStart: 2.4 }
  ).which,
  "head-offset"
);
check(
  "a third of a second is not",
  endsMatch(
    { headHeard: "Aloha! Let's talk about the walk around", tailHeard: "and that is it mahalo", whisperFirstStart: 0.06 },
    { headHeard: "Aloha! Let's talk about the walk around", tailHeard: "and that is it mahalo", whisperFirstStart: 0.36 }
  ).ok,
  true
);

console.log("\n6. nothing to compare is not a pass — and not a refusal either");
/* The distinction is the whole point. "Refused" means do not serve this crop;
   "unreadable" means go and read it again, wider. At the Kiosk — Battery
   Replacement and Piggyback — Front Wiper Blades came back with no master
   transcript at all on 25 November while their crops read fine, and recording
   that as a refusal would have been a verdict the read did not earn. */
const SAID: EndsLike = {
  headHeard: "Aloha! Something was said here", tailHeard: "and that is it mahalo", whisperFirstStart: 0.2,
};
const EMPTY: EndsLike = { headHeard: "", tailHeard: "", whisperFirstStart: null };
check("an empty vertical head is not accepted", endsMatch(SAID, EMPTY).ok, false);
check("and is reported as unreadable, not as a refusal", endsMatch(SAID, EMPTY).which, "unreadable");
check("an empty MASTER head is unreadable too", endsMatch(EMPTY, SAID).which, "unreadable");
check("both empty is unreadable", endsMatch(EMPTY, EMPTY).which, "unreadable");
/* So a caller can branch on it. If this ever collapses back to "head" the
   wider-window retry in derive-vertical.ts silently stops happening. */
check(
  "a real head disagreement is still 'head', not 'unreadable'",
  endsMatch(SAID, { ...SAID, headHeard: "something else entirely was said instead here" }).which,
  "head"
);

console.log("\n7. the four false refusals' shapes, as units");
/* The fixtures above carry the real transcripts. These assert the MECHANISM, so
   a failure says which of the three tolerances broke rather than just naming a
   film. */
const pair = (mHead: string, vHead: string, tail = "and that is how you do it mahalo"): [EndsLike, EndsLike] => [
  { headHeard: mHead, tailHeard: tail, whisperFirstStart: 0.2 },
  { headHeard: vHead, tailHeard: tail, whisperFirstStart: 0.2 },
];
check(
  "a compound split one way and not the other passes (walkaround / walk around)",
  endsMatch(...pair("thirty second walkaround part two four goals", "thirty second walk around part two four goals")).ok,
  true
);
check(
  "and the other way round",
  endsMatch(...pair("thirty second walk around part two four goals", "thirty second walkaround part two four goals")).ok,
  true
);
check(
  "one substituted article passes (a nametag / the nametag)",
  endsMatch(...pair("thats whats in a nametag your dealership", "thats whats in the nametag your dealership")).ok,
  true
);
check(
  "one substituted noun in the TAIL passes (materials / items)",
  endsMatch(
    { headHeard: "Aloha! Using the factory recommendations is a solid", tailHeard: "based on any of the materials you need", whisperFirstStart: 3.44 },
    { headHeard: "Aloha! Using the factory recommendations is a solid", tailHeard: "based on any of the items you need", whisperFirstStart: 3.44 }
  ).ok,
  true
);
/* The tail window's leading edge, which is what 30 Second Walk-Around, Part 2
   turned out to be about. Twenty-one words identical and three different where
   the two windows began — judged on the whole of the shorter side, those three
   decided it. */
const EDGE_M = "said that makes you right and being right is how a stranger decides to trust you in less than a minute mahalo";
const EDGE_V = "what you said makes you right and being right is how a stranger decides to trust you in less than a minute mahalo";
check(
  "words that straddle the tail window's start do not decide the verdict",
  endsMatch(
    { headHeard: "thirty second walkaround part two four goals", tailHeard: EDGE_M, whisperFirstStart: 0 },
    { headHeard: "thirty second walk around part two four goals", tailHeard: EDGE_V, whisperFirstStart: 0 }
  ).ok,
  true
);
check(
  "but a difference in the last eight words still refuses",
  endsMatch(
    { headHeard: "thirty second walkaround part two four goals", tailHeard: EDGE_M, whisperFirstStart: 0 },
    { headHeard: "thirty second walk around part two four goals",
      tailHeard: "what you said makes you right and being right is how a stranger decides to trust you in under sixty seconds",
      whisperFirstStart: 0 }
  ).ok,
  false
);
check(
  "a reduction in the TAIL passes (outta / out of)",
  endsMatch(
    { headHeard: "lets set up the multi point inspection", tailHeard: "go to the get the hell outta here speech and get certified", whisperFirstStart: 0.2 },
    { headHeard: "lets set up the multi point inspection", tailHeard: "go to the get the hell out of here speech and get certified", whisperFirstStart: 0.2 }
  ).ok,
  true
);

console.log("\n8. and what deliberately did NOT loosen");
/* These four are the defect itself. If any of them starts passing, the gate has
   stopped being a gate and the sweep that found the false refusals would have
   been better left undone. */
check(
  "a crop missing ONLY its first word is still refused",
  endsMatch(...pair(
    "Aloha! Using the factory recommendations is a solid strategy",
    "Using the factory recommendations is a solid strategy for some"
  )).ok,
  false
);
check(
  "and it is the HEAD that refuses it",
  endsMatch(...pair(
    "Aloha! Using the factory recommendations is a solid strategy",
    "Using the factory recommendations is a solid strategy for some"
  )).which,
  "head"
);
check(
  "TWO substituted words in six is refused — one is an artefact, two is a sentence",
  endsMatch(...pair("thats whats in a nametag your dealership", "thats whats on the nametag your dealership")).ok,
  false
);
check(
  "a crop that starts one second late with otherwise matching text is refused",
  endsMatch(
    { headHeard: "Aloha! Let's talk about the walk around", tailHeard: "and that is it mahalo", whisperFirstStart: 0.2 },
    { headHeard: "Aloha! Let's talk about the walk around", tailHeard: "and that is it mahalo", whisperFirstStart: 1.2 }
  ).ok,
  false
);
check(
  "and it is the offset that refuses it, not the text",
  endsMatch(
    { headHeard: "Aloha! Let's talk about the walk around", tailHeard: "and that is it mahalo", whisperFirstStart: 0.2 },
    { headHeard: "Aloha! Let's talk about the walk around", tailHeard: "and that is it mahalo", whisperFirstStart: 1.2 }
  ).which,
  "head-offset"
);

console.log(`\n${"=".repeat(64)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(64)}\n`);
if (failed) {
  for (const f of failures) console.log(`  FAIL ${f}`);
  process.exit(1);
}
