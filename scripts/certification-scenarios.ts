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
  coreBuildLine,
  coreProgressLine,
  currencyLine,
  currentThrough,
  isCurrent,
  moduleComplete,
  type CertificationHolding,
  type ModuleProgress,
} from "../lib/certification";
import {
  certificateCopy,
  currencyStatement,
  formatCertificateDate,
  foundingClassMark,
  verifyUrl,
} from "../lib/certificate";
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

section("6. the headline says why 8 and 4 differ");
/* The screen read "0 of 8 core" above a Craft section listing 4, and looked
   like it was arguing with itself. Both numbers are right — these assert the
   sentence that explains the gap, and that it vanishes once content lands. */
check(
  "today's real shape — four core tracks unbuilt",
  coreBuildLine(8, 4),
  "4 of the 8 are still being built."
);
check("one short", coreBuildLine(8, 1), "1 of the 8 are still being built.");
check(
  "every core track unbuilt reads as all, not as 8 of the 8",
  coreBuildLine(8, 8),
  "All 8 are still being built."
);
check("nothing unbuilt says nothing at all", coreBuildLine(8, 0), null);
check("an empty catalogue says nothing either", coreBuildLine(0, 0), null);
check(
  "more unbuilt than the core can hold still reads as all",
  coreBuildLine(8, 9),
  "All 8 are still being built."
);

section("7. what the certificate says");

/* The paper is the artefact that leaves the building, so every string on it is
   asserted here rather than trusted to a component. */
check("a date reads the way a person says it", formatCertificateDate("2027-03-14" as IsoDate), "14 March 2027");
check("single digits are not zero-padded", formatCertificateDate("2028-01-02" as IsoDate), "2 January 2028");
check("December is not off by one", formatCertificateDate("2026-12-31" as IsoDate), "31 December 2026");
check("a malformed date returns itself rather than Invalid Date",
  formatCertificateDate("not-a-date" as IsoDate), "not-a-date");

check("the founding mark carries the year earned",
  foundingClassMark("2026-11-02" as IsoDate), "FOUNDING CLASS \u00b7 2026");

check("certified title", certificateCopy("certified").title, "EDIAGD Certified Service Advisor");
check("master title", certificateCopy("master").title, "EDIAGD Master Service Advisor");
/* Master is not a louder Certified — the citation has to say the contribution,
   or the two read as tiers of the same accumulation. */
check("master's citation is about giving the craft back, not about volume",
  certificateCopy("master").body[1], "and has given that craft back to the advisors alongside them");

/* NO SURF VOCABULARY ON THE PAPER. A hiring manager does not know what a Swell
   is, and a certificate needing the product's private language proves nothing
   to anybody outside it. */
const paperWords = [
  ...certificateCopy("certified").body, certificateCopy("certified").title,
  ...certificateCopy("master").body, certificateCopy("master").title,
].join(" ").toLowerCase();
check("no Swell on the paper", paperWords.includes("swell"), false);
check("no Sand Dollars on the paper", paperWords.includes("sand dollar"), false);
check("no Paddle Out on the paper", paperWords.includes("paddle"), false);
check("no Island Time on the paper", paperWords.includes("island"), false);

const v = verifyUrl("EDG-C-2026-04817", "https://app.ediagd.ai");
check("the printed URL drops the scheme", v.display, "app.ediagd.ai/verify/EDG-C-2026-04817");
check("the link keeps it", v.href, "https://app.ediagd.ai/verify/EDG-C-2026-04817");
check("a trailing slash on the base does not double up",
  verifyUrl("EDG-C-2026-04817", "https://app.ediagd.ai/").href,
  "https://app.ediagd.ai/verify/EDG-C-2026-04817");

/* Lapsed is stated, never shamed — design law 3 on the one surface a stranger
   sees. "Expired" and "no longer valid" both describe a withdrawal that did not
   happen. */
check("current reads plainly", currencyStatement("2028-03-14" as IsoDate, true), "Current through 14 March 2028");
check("lapsed says was, not expired",
  currencyStatement("2027-03-14" as IsoDate, false), "Lapsed \u2014 was current through 14 March 2027");
check("the word expired never appears",
  currencyStatement("2027-03-14" as IsoDate, false).toLowerCase().includes("expired"), false);
check("nor invalid",
  currencyStatement("2027-03-14" as IsoDate, false).toLowerCase().includes("invalid"), false);

/* ---- Summary ------------------------------------------------------------- */

console.log("\n" + "=".repeat(64));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  ✗ " + f);
}
console.log("=".repeat(64));
process.exit(failed > 0 ? 1 : 0);
