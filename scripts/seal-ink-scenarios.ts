/* ============================================================================
   EDIAGD — the award art cannot drift from the tokens

     npm run test:seal-ink

   ---------------------------------------------------------------------------
   WHAT THIS IS FOR
   ---------------------------------------------------------------------------
   Fifty-three static SVGs — 34 seals and 19 badges — carry hex literals that no
   cascade reaches. The certification spec names the failure that creates:

       "The seals must not repeat that split: both paths feed from the shared
        brand constants, or the seals drift from the badges the first time a
        token moves."

   The art cannot read a token, so this asserts the equivalence instead. Change
   --ediagd-gold in styles/brand.css without regenerating the art and check 2
   fails, printing both values. That is the difference between a drift somebody
   notices in a screenshot months later and a red suite in the same commit.

   Offline: reads files, talks to nothing.
============================================================================ */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SEAL_INKS, SEAL_PALETTE, TOKEN_MIRRORS, SEAL_FALLBACK } from "../lib/brand-seal-ink";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passed++;
  else failed++;
  if (!ok) failures.push(`${name}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
  console.log(`  ${ok ? "✓" : "✗"} ${name}`);
}

function section(t: string) {
  console.log(`\n${t}`);
}

/* process.cwd(), not __dirname: this file is compiled into .tmp-si/scripts and
   __dirname would resolve inside the build directory. npm run always starts at
   the repo root. */
const ROOT = process.cwd();
const SEALS = join(ROOT, "public/brand/seals");
const BADGES = join(ROOT, "public/brand/badges/svg");

/* ---- 1. The art is all there --------------------------------------------- */

section("1. the art is present");
const sealFiles = existsSync(SEALS)
  ? readdirSync(SEALS).filter((f) => f.endsWith(".svg"))
  : [];
check("34 seal files", sealFiles.length, 34);
check(
  "12 craft",
  sealFiles.filter((f) => f.startsWith("craft_")).length,
  12
);
check(
  "20 service (SERVICE_FAMILIES as they stand, before the Misc/Accessories cut)",
  sealFiles.filter((f) => f.startsWith("service_")).length,
  20
);
check(
  "2 credentials",
  sealFiles.filter((f) => f.startsWith("credential_")).length,
  2
);
check("the fallback seal exists", sealFiles.includes(`${SEAL_FALLBACK}.svg`), true);

/* ---- 2. The tokens have not moved under the art -------------------------- */

section("2. every mirrored ink still equals its CSS token");
const brandCss = readFileSync(join(ROOT, "styles/brand.css"), "utf8");

/** `--ediagd-gold: 232 180 76;` -> #e8b44c */
function tokenHex(token: string): string | null {
  const m = new RegExp(`${token}\\s*:\\s*([0-9]+)\\s+([0-9]+)\\s+([0-9]+)\\s*;`).exec(brandCss);
  if (!m) return null;
  return (
    "#" +
    [m[1], m[2], m[3]]
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("")
      .toLowerCase()
  );
}

for (const { name, hex, token } of TOKEN_MIRRORS) {
  const live = tokenHex(token);
  check(`${name} mirrors ${token}`, live, hex);
}

/* ---- 3. No ink appears in the art that nobody declared ------------------- */

section("3. the art contains only declared inks");
function hexesIn(dir: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  if (!existsSync(dir)) return found;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".svg"))) {
    const body = readFileSync(join(dir, f), "utf8");
    for (const m of body.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      const hex = m[0].toLowerCase();
      if (!found.has(hex)) found.set(hex, []);
      if (!found.get(hex)!.includes(f)) found.get(hex)!.push(f);
    }
  }
  return found;
}

for (const [label, dir] of [
  ["seals", SEALS],
  ["badges", BADGES],
] as const) {
  const found = hexesIn(dir);
  const undeclared = [...found.entries()]
    .filter(([hex]) => !SEAL_PALETTE.has(hex))
    /* Name the first file, because "an undeclared colour exists" is not
       actionable and "service_brakes.svg uses #1a2b3c" is. */
    .map(([hex, files]) => `${hex} (${files[0]}${files.length > 1 ? ` +${files.length - 1}` : ""})`);
  check(`${label}: no undeclared hex`, undeclared, []);
}

/* ---- 4. Nothing declared has fallen out of use --------------------------- */

section("4. every declared ink is actually used");
{
  const all = new Set([...hexesIn(SEALS).keys(), ...hexesIn(BADGES).keys()]);
  const unused = Object.entries(SEAL_INKS)
    .filter(([, i]) => !all.has(i.hex))
    .map(([n]) => n);
  /* A dead entry is not a crash, but it is a lie about what the art contains,
     and the next person reads this file as inventory. */
  check("no declared ink is unused", unused, []);
}

/* ---- Summary ------------------------------------------------------------- */

console.log("\n" + "=".repeat(64));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  ✗ " + f);
  console.log(
    "\n  If a token moved on purpose, the ART must be regenerated to match —\n" +
      "  editing lib/brand-seal-ink.ts alone makes this pass and the seals wrong."
  );
}
console.log("=".repeat(64));
process.exit(failed > 0 ? 1 : 0);
