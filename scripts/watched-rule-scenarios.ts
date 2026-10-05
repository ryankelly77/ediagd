/* ============================================================================
   EDIAGD — ONE WATCHED RULE. Offline; no database, no network.

     npm run test:watched-rule

   ---------------------------------------------------------------------------
   WHAT THIS PROVES, AND WHY IT IS NOT A SCREENSHOT
   ---------------------------------------------------------------------------
   Ryan's ruling of 5 October asks for proof on Walk Around lesson 4 that "no
   percentage appears anywhere on the page, credit lands within two seconds of
   the end and not at 90."

   The second half is a claim about a NUMBER, and a picture cannot settle it: a
   screenshot of a film at 90% shows a film at 90%, not whether credit fired.
   So the arithmetic is asserted against the real duration of the real film —
   "30 Second Walk-Around, Part 1, Before You Go Outside", 221 seconds, read
   from production — and against the real `gateThreshold`, imported rather than
   restated.

   The first half is a claim about SOURCE: a percentage cannot appear on the
   page if nothing renders one. So the two constructs that printed them are
   asserted ABSENT, and the morning's shared line asserted present. That is a
   construction rather than a convention — the unsafe state is not
   representable, not merely avoided.

   BOTH DIRECTIONS, EVERY TIME. A gate that refuses looks like it is working
   whether it is right or wrong, so each refusal below is paired with the
   acceptance that would catch the gate being broken outright.
   ============================================================================ */
import { readFileSync } from "node:fs";
import {
  GATE_TAIL_SEC,
  WATCHED_PCT,
  gateThreshold,
  isWatched,
} from "@/lib/watch-coverage";

let passed = 0;
let failed = 0;
function ok(label: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(t: string) {
  console.log(`\n${t}`);
}

/** Walk Around lesson 4, measured on production 5 October 2026. */
const LESSON_4 = {
  module: "4. Before You Go Outside",
  film: "30 Second Walk-Around, Part 1, Before You Go Outside",
  durationSec: 221,
};

/** The flat bar that used to decide credit, for the contrast. */
const OLD_FLAT_BAR = 90;

const secondsFromEnd = (pct: number, duration: number) =>
  duration - (pct / 100) * duration;

section(`Walk Around lesson 4 — "${LESSON_4.module}" (${LESSON_4.durationSec}s)`);
{
  const bar = gateThreshold(LESSON_4.durationSec);
  const tail = secondsFromEnd(bar, LESSON_4.durationSec);

  ok(
    `the bar is a two-second tail, not a share (${bar.toFixed(3)}% = ${tail.toFixed(2)}s from the end)`,
    Math.abs(tail - GATE_TAIL_SEC) < 0.01,
    `expected ${GATE_TAIL_SEC}s, got ${tail.toFixed(3)}s`
  );

  /* THE REFUSAL. 90% of this film is 22 seconds early. */
  const oldTail = secondsFromEnd(OLD_FLAT_BAR, LESSON_4.durationSec);
  ok(
    `credit does NOT land at ${OLD_FLAT_BAR}% (${oldTail.toFixed(1)}s from the end)`,
    !isWatched(OLD_FLAT_BAR, bar),
    `isWatched(${OLD_FLAT_BAR}, ${bar.toFixed(3)}) was true`
  );
  ok(
    `and the old flat rule WOULD have granted it there — which is the defect`,
    OLD_FLAT_BAR >= OLD_FLAT_BAR
  );

  /* THE ACCEPTANCE, which is the half that gets skipped. If the gate simply
     refused everything, every assertion above would still pass. */
  ok(
    "credit DOES land at the bar itself",
    isWatched(bar, bar),
    `isWatched(${bar.toFixed(3)}, ${bar.toFixed(3)}) was false`
  );
  ok(
    "credit lands at the very end (100%)",
    isWatched(100, bar)
  );
  ok(
    `one second earlier than the tail does NOT count (${(GATE_TAIL_SEC + 1)}s from the end)`,
    !isWatched(
      ((LESSON_4.durationSec - GATE_TAIL_SEC - 1) / LESSON_4.durationSec) * 100,
      bar
    )
  );

  /*
   * Floating point: TimeRanges summation routinely yields 94.999999 for a film
   * plainly finished, and isWatched rounds to two decimals before comparing so
   * that reads as met.
   *
   * THE SCOPE OF THAT PROTECTION, stated rather than assumed — I first asserted
   * it held against a tail-derived bar and it does not. Rounding the MEASUREMENT
   * cannot rescue a comparison against a bar that itself carries more precision
   * than two decimals: round(99.09102) is 99.09, which is still short of
   * 99.095. The rounding exists for the integer floor, which is the case it was
   * written for.
   */
  ok(
    "a float a hair under the 95 floor still counts (the TimeRanges case)",
    isWatched(94.999999, WATCHED_PCT)
  );
  ok(
    "but rounding does NOT loosen a tail-derived bar — it is not a tolerance",
    !isWatched(bar - 0.004, bar)
  );
}

section("The rule behaves differently by length — which is the whole point");
{
  /* A flat 90 is 3 seconds early on a 30-second clip and 31 on a five-minute
     one. The tail is the same two seconds at every length. */
  for (const d of [30, 146, 221, 309]) {
    const bar = gateThreshold(d);
    const tail = secondsFromEnd(bar, d);
    const flatTail = secondsFromEnd(OLD_FLAT_BAR, d);
    const expected = d <= GATE_TAIL_SEC / (1 - WATCHED_PCT / 100) ? null : GATE_TAIL_SEC;
    ok(
      `${d}s: tail ${tail.toFixed(2)}s vs a flat ${OLD_FLAT_BAR}% at ${flatTail.toFixed(1)}s early`,
      expected === null ? bar === WATCHED_PCT : Math.abs(tail - GATE_TAIL_SEC) < 0.01
    );
  }
  ok(
    `the 95% floor holds on a short clip, where two seconds would be looser`,
    gateThreshold(20) === WATCHED_PCT,
    `got ${gateThreshold(20)}`
  );
  ok(
    "an unknown duration falls back to the floor rather than to zero",
    gateThreshold(null) === WATCHED_PCT && gateThreshold(0) === WATCHED_PCT
  );
}

/**
 * Source with its COMMENTS REMOVED.
 *
 * The first version of this suite matched the raw file and failed on four
 * assertions — because the comments explaining the change quote the code it
 * removed. A check that cannot tell prose from rendered output is measuring the
 * wrong population, which is this codebase's own recorded failure one level
 * down: the finding has to be about the thing it names.
 *
 * BLOCK COMMENTS FIRST, AND NO SEPARATE JSX-COMMENT PASS. The first version
 * tried to strip `{/* … *​/}` as its own shape, with
 * `/\{\s*\/\*[\s\S]*?\*\/\s*\}/`. That pattern also matches a TYPE BODY whose
 * first member carries a doc comment and whose last line is a comment — so on
 * this file it swallowed a single 7,043-character span containing `reach`,
 * `handleEnded` and the footer, and every assertion below then passed against
 * a source with the code removed. A check that had deleted the thing it was
 * checking, reporting success: the exact failure this suite exists to catch,
 * one level down.
 *
 * Stripping block comments first makes the JSX pass unnecessary — `{/* … *​/}`
 * reduces to `{}`, which renders nothing and contains no number. The lesson is
 * the general one: prefer the pass that cannot over-match to the one that has
 * to be reasoned about.
 */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

section("No percentage can appear on the lesson page");
{
  const deck = code("components/library/CueDeck.tsx");
  const page = code("app/(app)/library/m/[module]/page.tsx");

  /* The stripper has to actually strip, or every assertion below passes
     vacuously on an empty string. Both halves, as ever. */
  /*
   * THE STRIPPER IS ITSELF ASSERTED, in both directions, because a stripper
   * that removes too much makes every assertion below vacuously true — which is
   * precisely what happened on the first attempt. The code landmarks must
   * survive and the prose must not.
   */
  ok(
    "the stripper keeps the code it must check",
    deck.includes("WatchGateLine") &&
      deck.includes("const reach") &&
      deck.includes("handleEnded"),
    `${deck.length} chars; reach=${deck.includes("const reach")}`
  );
  ok(
    "and removes the prose that quotes the old rule",
    !deck.includes("twenty-two seconds") && !deck.includes("flat 90")
  );

  /* The two constructs that printed numbers. Asserted ABSENT: a percentage
     cannot be shown if nothing renders one. */
  ok(
    'the deck no longer renders "Watched {n}%"',
    !/Watched \{/.test(deck),
    "found a Watched {...} interpolation"
  );
  ok(
    'the deck no longer renders "counts at {n}%"',
    !/counts at/.test(deck),
    'found "counts at"'
  );

  /* And it uses the MORNING'S line rather than a second copy of one — a second
     copy is how the library and the loop came to disagree in the first place. */
  ok(
    "it renders the morning's WatchGateLine",
    /<WatchGateLine\b/.test(deck) &&
      /import \{[^}]*WatchGateLine[^}]*\} from "@\/components\/video\/TrackedVideo"/.test(deck)
  );
  ok(
    'the word "Watched" survives, on its own, for the met state',
    />\s*Watched\s*</.test(deck)
  );

  /* The setting no longer reaches the page or the deck at all. */
  ok(
    "the module page no longer reads game_settings.video_complete_pct",
    !/video_complete_pct/.test(page),
    "the page still reads it"
  );
  ok(
    "the deck takes no videoThreshold prop",
    !/videoThreshold[:=]/.test(deck),
    "a videoThreshold prop survives"
  );

  /*
   * Credit fires on `met` alone — the OR that let a flat 90 decide is gone.
   *
   * SCOPED TO THE CREDIT CONDITION, which took three attempts and is the point
   * worth recording:
   *
   *   "pct >= threshold"   as a literal, caught one SPELLING. A break
   *                        reintroducing `pct >= 90` sailed past it.
   *   a \bpct…>=? pattern  caught the shape and also caught
   *                        `if (pct > furthest.current)` — a legitimate
   *                        furthest-point comparison three lines above — so it
   *                        failed on correct code.
   *
   * Neither was wrong about regexes; both were wrong about the POPULATION. The
   * claim is "credit does not fire on a percentage", so the thing to examine is
   * the credit condition, not the file. It is extracted by name and asserted to
   * contain no comparison and no number at all.
   */
  const creditCond = deck.match(/if\s*\(\s*!fired\.current[^)]*\)/)?.[0] ?? "";
  ok(
    `the credit condition is found and is \`${creditCond.trim()}\``,
    creditCond.length > 0
  );
  ok(
    "it tests `met` and nothing else — no comparison, no number",
    creditCond.includes("isMet") &&
      !/[<>]/.test(creditCond) &&
      !/\d/.test(creditCond),
    `condition was: ${creditCond}`
  );
}

section("The server re-checks against the same function");
{
  const actions = code("lib/library-actions.ts");
  ok(
    "completeLibraryItem imports gateThreshold and isWatched",
    /import \{[^}]*gateThreshold[^}]*\} from "@\/lib\/watch-coverage"/.test(actions)
  );
  ok(
    "it calls gateThreshold(duration_sec)",
    /gateThreshold\(\s*item\.duration_sec/.test(actions)
  );
  ok(
    "it selects duration_sec, so the bar is computable",
    /select\("id, type, service_family, duration_sec"\)/.test(actions)
  );
  ok(
    "it no longer reads video_complete_pct for credit",
    !/select\("[^"]*video_complete_pct/.test(actions),
    "it still selects video_complete_pct"
  );
  /* THE ENUMERATION GUARD. The settings read that remains must not have
     quietly regained the column — a check that is silent about a new reader
     reads identically to passing. */
  const settingsReads = actions.match(/select\("[^"]*sand_lesson[^"]*"\)/g) ?? [];
  ok(
    `the one game_settings read is payment-only (${settingsReads.length} read: ${settingsReads.join(", ")})`,
    settingsReads.length === 1 && !settingsReads[0]!.includes("video_complete_pct")
  );
}

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
