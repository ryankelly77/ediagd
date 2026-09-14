/* ============================================================================
   EDIAGD — the certificate, rendered and inspected

   Server-renders the REAL <Certificate> to static HTML and asserts what is on
   it. No browser, no database, no screenshots — so it runs in CI and fails the
   day somebody drops a field off the paper.

     npm run test:certificate

   ---------------------------------------------------------------------------
   WHY RENDER IT RATHER THAN TEST THE STRINGS
   ---------------------------------------------------------------------------
   lib/certificate.ts is already asserted by test:certification, and that covers
   what the words ARE. This covers whether they made it onto the document — the
   two failures that matter here are a field computed correctly and never
   rendered, and a field rendered from the wrong source. Both look fine in a
   pure test.
============================================================================ */
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Certificate } from "@/components/certificate/Certificate";
import type { CertificateFacts } from "@/lib/certificate";
import type { IsoDate } from "@/lib/gamification/streak";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  ✗ ${label}\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`);
  }
}
function section(t: string) {
  console.log(`\n${t}`);
}

const APP = "https://app.ediagd.ai";

function render(facts: CertificateFacts, hasSignature = true): string {
  return renderToStaticMarkup(
    createElement(Certificate, { facts, appUrl: APP, hasSignature })
  );
}

/** The text inside the element carrying a given data-testid. */
function testid(html: string, id: string): string | null {
  const m = html.match(new RegExp(`data-testid="${id}"[^>]*>([\\s\\S]*?)<\\/`));
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

const CERTIFIED: CertificateFacts = {
  name: "Tracie Alvarez",
  level: "certified",
  certificateId: "EDG-C-2026-04817",
  earnedOn: "2027-03-14" as IsoDate,
  currentThrough: "2028-03-14" as IsoDate,
  foundingClass: true,
};

section("1. the Certified certificate carries every field");
{
  const html = render(CERTIFIED);
  check("the holder's name", testid(html, "certificate-name"), "Tracie Alvarez");
  check("the title", testid(html, "certificate-title"), "EDIAGD Certified Service Advisor");
  check("the certificate number", testid(html, "certificate-id"), "EDG-C-2026-04817");
  check("the issue date, as a person says it", testid(html, "certificate-earned"), "14 March 2027");
  check("the current-through date", testid(html, "certificate-through"), "Current through 14 March 2028");
  /* THE VERIFY URL IS ON THE FACE. A certificate whose verification lives
     somewhere you have to be told about is one nobody checks. */
  check("the verify URL, printed", testid(html, "certificate-verify"),
    "Verify at app.ediagd.ai/verify/EDG-C-2026-04817");
  check("the Founding Class mark", testid(html, "certificate-founding"), "FOUNDING CLASS · 2027");
  check("the signature is placed", html.includes('data-testid="certificate-signature"'), true);
  check("and the founder's role beneath it", html.includes("FOUNDER, EDIAGD"), true);
  check("sized in inches, not pixels", html.includes("11in") && html.includes("8.5in"), true);
}

section("2. Founding Class is absent, not greyed out");
{
  const html = render({ ...CERTIFIED, foundingClass: false });
  check("no mark element at all", testid(html, "certificate-founding"), null);
  check("and the words never appear", html.includes("FOUNDING CLASS"), false);
  /* A certificate is not a progress screen. An absent mark is the correct
     rendering of not being in the founding class — a greyed one would print a
     thing somebody does not have. */
  check("everything else still renders", testid(html, "certificate-name"), "Tracie Alvarez");
}

section("3. the Master certificate — built, never seen against real data");
{
  const html = render({
    ...CERTIFIED,
    level: "master",
    certificateId: "EDG-M-2027-00001",
    earnedOn: "2027-11-02" as IsoDate,
    currentThrough: "2028-11-02" as IsoDate,
  });
  check("the Master title", testid(html, "certificate-title"), "EDIAGD Master Service Advisor");
  check("the Master number", testid(html, "certificate-id"), "EDG-M-2027-00001");
  check("its own verify URL", testid(html, "certificate-verify"),
    "Verify at app.ediagd.ai/verify/EDG-M-2027-00001");
  /* Navy ground and a heavier frame are what make it outrank the other across
     a room — the one thing the spec asks the Master template to do. */
  check("navy ground", html.includes("background:#0C2739"), true);
  check("a heavier gold frame than Certified", html.includes("3pt solid #E8A317"), true);
}

section("4. a missing signature does not print a broken image");
{
  const html = render(CERTIFIED, false);
  check("no img is emitted", html.includes('data-testid="certificate-signature"'), false);
  check("the space is held so the footer does not jump",
    html.includes('data-testid="certificate-signature-missing"'), true);
  check("the rule and the role still print", html.includes("FOUNDER, EDIAGD"), true);
}

section("5. no surf vocabulary reaches the paper");
{
  const html = render(CERTIFIED) + render({ ...CERTIFIED, level: "master" });
  const text = html.replace(/<[^>]+>/g, " ").toLowerCase();
  for (const word of ["swell", "sand dollar", "paddle", "island time", "streak"]) {
    check(`no "${word}"`, text.includes(word), false);
  }
}

console.log("\n" + "=".repeat(64));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  ✗ " + f);
}
console.log("=".repeat(64));
process.exit(failed > 0 ? 1 : 0);
