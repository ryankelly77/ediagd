/* ============================================================================
   EDIAGD — what a working name parses to

   Mitch was promised he types a quick name and ingest sorts it out. That
   promise lives in one regex-heavy function, and the failure mode is silent:
   a name that parses slightly wrong files a video on the wrong shelf, under the
   wrong voice, and nothing errors.

   No database, no Mux, no Drop Zone — parseName is pure and this proves it.

     npm run test:names
   ============================================================================ */

import { parseName, ROUTES } from "./ingest-videos";

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
const section = (t: string) => console.log(`\n${t}`);

const shape = (file: string) => {
  const p = parseName(file);
  return p ? { collection: p.collection, title: p.title, voice: p.voice, version: p.version } : null;
};

/* ---- 1 · The technician fixture ------------------------------------------ */
section("1 · The technician add-on's first working name");

/*
 * THE ACCEPTANCE FIXTURE. It puts the voice in a third dash-delimited segment
 * rather than in parentheses, which the parser did not understand: the whole
 * "Torque Spec Basics — Mitch Hardt" became the title and the voice was null.
 */
check(
  "TECH — Torque Spec Basics — Mitch Hardt — v1.mov",
  shape("TECH — Torque Spec Basics — Mitch Hardt — v1.mov"),
  { collection: "TECH", title: "Torque Spec Basics", voice: "Mitch Hardt", version: 1 }
);
check(
  "and TECH routes to the technician shelf, type and placement",
  ROUTES["TECH"],
  {
    placement: "technician_daily",
    collection: "Technician Training",
    craftSeries: null,
    contentType: "technician_video",
  }
);

/* ---- 2 · The dash-voice form is safe ------------------------------------- */
section("2 · A dash before a KNOWN voice, and nothing else");

/*
 * The rule that makes it safe: a trailing segment is a voice only if it is a
 * voice the library already knows. A heuristic like "two capitalised words is a
 * name" would eat this real title.
 */
check(
  "a real title containing a dash survives intact",
  shape("CRAFT — Watch First — The Walk-Around — v1.mov"),
  { collection: "CRAFT", title: "Watch First — The Walk-Around", voice: null, version: 1 }
);
check(
  "an unknown name stays in the title rather than being guessed at",
  shape("MINDSET — Something True — Someone Nobody Filmed — v1.mov"),
  {
    collection: "MINDSET",
    title: "Something True — Someone Nobody Filmed",
    voice: null,
    version: 1,
  }
);
check(
  "a caller can widen the known set",
  (() => {
    const p = parseName("MINDSET — Something True — Someone Nobody Filmed — v1.mov", [
      "Someone Nobody Filmed",
    ]);
    return p ? { title: p.title, voice: p.voice } : null;
  })(),
  { title: "Something True", voice: "Someone Nobody Filmed" }
);

/* ---- 3 · The established forms still parse ------------------------------- */
section("3 · Nothing that worked before stopped working");

check(
  "parenthesised voice, the shape the library actually uses",
  shape("MINDSET — You Are Not Tired (Kobe Bryant) — v1.mov"),
  { collection: "MINDSET", title: "You Are Not Tired", voice: "Kobe Bryant", version: 1 }
);
check(
  "no voice at all — ingest defaults it to Mitch downstream",
  shape("MINDSET — Where Are You Living? — v1.mov"),
  { collection: "MINDSET", title: "Where Are You Living?", voice: null, version: 1 }
);
check(
  "a missing version is a first take",
  shape("ONBOARDING - Welcome from Mitch.MOV"),
  { collection: "ONBOARDING", title: "Welcome from Mitch", voice: null, version: 1 }
);
check(
  "a later take, in brackets, any case",
  shape("craft — The Close (V3).mp4"),
  { collection: "CRAFT", title: "The Close", voice: null, version: 3 }
);
check(
  "a name with no recognisable prefix is refused rather than filed",
  shape("049.  Decide what do with the time given.MOV"),
  null
);

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\n  FAILURES");
  failures.forEach((f) => console.log(`    ${f}`));
  process.exit(1);
}
