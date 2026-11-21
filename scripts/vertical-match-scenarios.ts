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

console.log("\n6. nothing to compare is not a pass");
check(
  "an empty vertical head is refused, not accepted",
  endsMatch(
    { headHeard: "Aloha! Something was said here", tailHeard: "mahalo", whisperFirstStart: 0.2 },
    { headHeard: "", tailHeard: "", whisperFirstStart: null }
  ).ok,
  false
);

console.log(`\n${"=".repeat(64)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(64)}\n`);
if (failed) {
  for (const f of failures) console.log(`  FAIL ${f}`);
  process.exit(1);
}
