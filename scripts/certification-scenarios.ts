/* ============================================================================
   EDIAGD — certification and credential rules

     npm run test:certification

   Offline. The rules in lib/certification.ts are pure, so every design law the
   spec states can be asserted here without a fixture advisor or a database.

   The acceptance criteria that need a seeded database — accrual through the
   daily loop, the quiz-offer moment, entitlement — are NOT here, because the
   migration has not been applied. What is here is every rule that governs what
   those paths would conclude.
============================================================================ */

import {
  certificationEarned,
  certificationProgress,
  certificationState,
  computeCredential,
  coreProgressLine,
  currencyLine,
  currentThrough,
  isCurrent,
  moduleComplete,
  type CertificationHolding,
  type ModuleProgress,
} from "../lib/certification";
import type { IsoDate } from "../lib/gamification/streak";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passed++;
  else {
    failed++;
    failures.push(`${name}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
  }
  console.log(`  ${ok ? "✓" : "✗"} ${name}`);
}
const section = (t: string) => console.log(`\n${t}`);

const TODAY = "2026-09-13" as IsoDate;
const d = (s: string) => s as IsoDate;

/* ---- 1. Currency --------------------------------------------------------- */

section("1. annual currency");
check("one calendar year", currentThrough(d("2026-09-13")), "2027-09-13");
check("leap day clamps to 28 Feb, not 1 Mar", currentThrough(d("2028-02-29")), "2029-02-28");
check("month end holds", currentThrough(d("2026-01-31")), "2027-01-31");
check("current on the last day", isCurrent(d("2026-09-13"), TODAY), true);
check("lapsed the day after", isCurrent(d("2026-09-12"), TODAY), false);
check("never earned is not current", isCurrent(null, TODAY), false);

/* ---- 2. A single certification ------------------------------------------- */

section("2. lapsed is never revoked");
check("unearned", certificationState({ currentThrough: null }, TODAY), "unearned");
check("current", certificationState({ currentThrough: d("2027-01-01") }, TODAY), "current");
check("lapsed — still a state you HOLD", certificationState({ currentThrough: d("2026-01-01") }, TODAY), "lapsed");
check("copy is never red", currencyLine({ currentThrough: d("2026-01-01") }, TODAY), "Renew to stay current");
check("current says the date", currencyLine({ currentThrough: d("2027-01-01") }, TODAY), "Current through 2027-01-01");
check("unearned says nothing", currencyLine({ currentThrough: null }, TODAY), null);

/* ---- 3. Earning --------------------------------------------------------- */

section("3. earning a certification");
const mod = (contentComplete: boolean, quizPassed: boolean | null): ModuleProgress => ({
  moduleId: "m",
  contentComplete,
  quizPassed,
});
check("content done, no quiz published -> complete (0035's rule)", moduleComplete(mod(true, null)), true);
check("content done, quiz passed", moduleComplete(mod(true, true)), true);
check("content done, quiz FAILED -> not complete", moduleComplete(mod(true, false)), false);
check("quiz passed but content unfinished", moduleComplete(mod(false, true)), false);

check("all modules complete -> earned", certificationEarned([mod(true, null), mod(true, true)]), true);
check("one short -> not earned", certificationEarned([mod(true, null), mod(false, null)]), false);
/* The five craft tracks with no course are exactly this shape. */
check("NO modules -> NOT earned (every() on [] is true)", certificationEarned([]), false);
check("progress on an empty track is 0, not NaN", certificationProgress([]), 0);
check("progress halfway", certificationProgress([mod(true, null), mod(false, null)]), 0.5);

/* ---- 4. The credential --------------------------------------------------- */

section("4. EDIAGD Certified computes, never granted");
const core = (n: number, through: IsoDate | null): CertificationHolding[] =>
  Array.from({ length: n }, (_, i) => ({
    slug: `craft-core-${i + 1}`,
    isCore: true,
    currentThrough: through,
  }));

check("eight current core -> certified", computeCredential(core(8, d("2027-06-01")), TODAY, 8)?.level, "certified");
check("seven of eight -> nothing", computeCredential([...core(7, d("2027-06-01")), ...core(1, null)], TODAY, 8), null);
check("empty catalogue is NOT everyone certified", computeCredential([], TODAY, 8), null);
check(
  "non-core holdings do not count toward it",
  computeCredential(
    [...core(7, d("2027-06-01")), { slug: "service-brakes", isCore: false, currentThrough: d("2027-06-01") }],
    TODAY,
    8
  ),
  null
);

/* The bug this guard exists for: a caller that filtered its query to the ones
   actually held would otherwise certify somebody on seven of eight. */
check(
  "a SHORT core list refuses rather than concluding",
  computeCredential(core(7, d("2027-06-01")), TODAY, 8),
  null
);
check("a core count of zero is never a credential", computeCredential(core(8, d("2027-06-01")), TODAY, 0), null);

section("   the credential is only as current as its weakest part");
{
  const mixed: CertificationHolding[] = [
    ...core(7, d("2027-06-01")),
    { slug: "craft-core-8", isCore: true, currentThrough: d("2026-11-02") },
  ];
  check("current_through is the EARLIEST constituent", computeCredential(mixed, TODAY, 8)?.currentThrough, "2026-11-02");
}

section("   lapse one, the credential stops computing — and nothing is revoked");
{
  const lapsed: CertificationHolding[] = [
    ...core(7, d("2027-06-01")),
    { slug: "craft-core-8", isCore: true, currentThrough: d("2026-01-01") },
  ];
  check("credential does not compute", computeCredential(lapsed, TODAY, 8), null);
  check("but the lapsed one is still HELD", certificationState(lapsed[7], TODAY), "lapsed");

  /* Renewal restores it, because nothing was taken away. */
  const renewed = lapsed.map((h) =>
    h.slug === "craft-core-8" ? { ...h, currentThrough: currentThrough(TODAY) } : h
  );
  check("renew -> credential returns", computeCredential(renewed, TODAY, 8)?.level, "certified");
  check("…dated by the new weakest part", computeCredential(renewed, TODAY, 8)?.currentThrough, "2027-06-01");
}

section("   Master is defined and unreachable");
check(
  "every certification held still yields certified, never master",
  computeCredential(core(12, d("2027-06-01")), TODAY, 12)?.level,
  "certified"
);

/* ---- 5. The rung, stated plainly ---------------------------------------- */

section("5. rung progress");
check(
  "5 of 8",
  coreProgressLine([...core(5, d("2027-06-01")), ...core(3, null)], TODAY, 8),
  "5 of 8 core — 3 from EDIAGD Certified"
);
check("all eight", coreProgressLine(core(8, d("2027-06-01")), TODAY, 8), "8 of 8 core — EDIAGD Certified");
check(
  "a lapsed core does not count toward the rung",
  coreProgressLine([...core(7, d("2027-06-01")), ...core(1, d("2026-01-01"))], TODAY, 8),
  "7 of 8 core — 1 from EDIAGD Certified"
);
check("nothing published yet", coreProgressLine([], TODAY, 0), "The core eight are not published yet");

/* ---- Summary ------------------------------------------------------------- */

console.log("\n" + "=".repeat(64));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  ✗ " + f);
}
console.log("=".repeat(64));
process.exit(failed > 0 ? 1 : 0);
