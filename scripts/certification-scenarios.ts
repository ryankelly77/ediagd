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
  credentialCurrencyLine,
  credentialState,
  currentThrough,
  earnedLine,
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

section("2. a track, once earned, is held permanently");
check("unearned", certificationState({ earnedOn: null }), "unearned");
check("earned", certificationState({ earnedOn: d("2027-01-01") }), "held");
/* THE POINT: age is irrelevant. A track earned years ago is held exactly as
   much as one earned this morning — there is no third state to fall into. */
check("earned years ago is still just held",
  certificationState({ earnedOn: d("2019-01-01") }), "held");
check("the line names the day the work was done",
  earnedLine({ earnedOn: d("2027-01-01") }), "Earned 2027-01-01");
check("an ancient one says the same thing",
  earnedLine({ earnedOn: d("2019-01-01") }), "Earned 2019-01-01");
check("unearned says nothing", earnedLine({ earnedOn: null }), null);
/* A track must never display a currency date — that is the screen asserting
   something the engine no longer believes. */
check("no track line ever says 'Current through'",
  earnedLine({ earnedOn: d("2019-01-01") })!.includes("Current through"), false);
check("nor 'Renew'",
  earnedLine({ earnedOn: d("2019-01-01") })!.includes("Renew"), false);

section("   the credential is the only thing that can lapse");
check("current", credentialState(d("2027-01-01"), TODAY), "current");
check("lapsed", credentialState(d("2026-01-01"), TODAY), "lapsed");
check("current says the date",
  credentialCurrencyLine(d("2027-01-01"), TODAY), "Current through 2027-01-01");
check("copy is never red",
  credentialCurrencyLine(d("2026-01-01"), TODAY), "Renew to stay current");

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
const core = (n: number, earned: IsoDate | null): CertificationHolding[] =>
  Array.from({ length: n }, (_, i) => ({
    slug: `craft-core-${i + 1}`,
    isCore: true,
    earnedOn: earned,
  }));

check("eight core held -> certified", computeCredential(core(8, d("2027-06-01")), TODAY, 8)?.level, "certified");
check("seven of eight -> nothing", computeCredential([...core(7, d("2027-06-01")), ...core(1, null)], TODAY, 8), null);
check("empty catalogue is NOT everyone certified", computeCredential([], TODAY, 8), null);
check(
  "non-core holdings do not count toward it",
  computeCredential(
    [...core(7, d("2027-06-01")), { slug: "service-brakes", isCore: false, earnedOn: d("2027-06-01") }],
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

section("   THE COLLISION THIS RULE EXISTS TO FIX");
{
  /*
   * The scenario that failed before: an advisor earns the first track, spends
   * more than a year working through the rest, and finishes the eighth. Under
   * annual track currency the first had lapsed and the credential refused —
   * for somebody who had done every single item.
   */
  const longClimb: CertificationHolding[] = [
    { slug: "craft-core-1", isCore: true, earnedOn: d("2025-01-15") }, // over 18 months ago
    ...core(7, d("2026-08-01")).map((h, i) => ({ ...h, slug: `craft-core-${i + 2}` })),
  ];
  check("a track earned eighteen months ago still counts",
    computeCredential(longClimb, TODAY, 8)?.level, "certified");
  check("...and the oldest one is in the audit trail",
    computeCredential(longClimb, TODAY, 8)?.from.includes("craft-core-1"), true);
}

section("   the credential's year starts when the credential does");
{
  const held = core(8, d("2020-01-01")); // all ancient
  check("not the earliest constituent",
    computeCredential(held, TODAY, 8)?.currentThrough, currentThrough(TODAY));
  check("a year from today", computeCredential(held, TODAY, 8)?.currentThrough, "2027-09-13");
}

section("   an unearned core track still refuses");
{
  const missing: CertificationHolding[] = [...core(7, d("2027-06-01")), ...core(1, null)];
  check("seven held and one never earned -> nothing",
    computeCredential(missing, TODAY, 8), null);
  check("and the unearned one reads unearned, not lapsed",
    certificationState(missing[7]), "unearned");
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
/* THE OLD ASSERTION SAID THE OPPOSITE — that a lapsed core track dropped out of
   the rung count. That was the annual-track-currency rule, and it is the reason
   the rung could go backwards while somebody was still climbing. A held track
   counts, however old. */
check(
  "an ancient core track still counts toward the rung",
  coreProgressLine([...core(7, d("2027-06-01")), ...core(1, d("2019-01-01"))], TODAY, 8),
  "8 of 8 core — EDIAGD Certified"
);
check(
  "only an UNEARNED one is missing from it",
  coreProgressLine([...core(7, d("2027-06-01")), ...core(1, null)], TODAY, 8),
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
