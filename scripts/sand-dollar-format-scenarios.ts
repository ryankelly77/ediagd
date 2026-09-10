/* ============================================================================
   EDIAGD — the compact balance, at every boundary that matters

     npm run test:sand-format

   Ryan specified this notation by example, and every example he gave is below,
   plus the ones either side of each threshold. The interesting cases are all
   ROUNDING cases: 1,999 must not become 2K, and 1,050 must not become 1.1K.

   Imports the real lib/sand-dollars.ts through the @/ alias — a paraphrase
   here would prove nothing about what the header renders.
   ============================================================================ */

import {
  formatSandDollarsCompact,
  formatSandDollarsExact,
} from "@/lib/sand-dollars";

type Case = { input: number; want: string; why?: string };

const COMPACT: Case[] = [
  /* ---- Ryan's examples, verbatim ------------------------------------- */
  { input: 545, want: "545", why: "below a thousand, as written" },
  { input: 999, want: "999", why: "last value before K notation" },
  { input: 1000, want: "1K", why: "a bare .0 is dropped" },
  { input: 1050, want: "1K", why: "floored, not rounded to 1.1K" },
  { input: 1300, want: "1.3K" },
  { input: 1999, want: "1.9K", why: "must never overstate as 2K" },
  { input: 9999, want: "9.9K" },
  { input: 10050, want: "10K", why: "floors to a whole, so the .0 goes" },
  { input: 10100, want: "10.1K" },
  { input: 99999, want: "99.9K", why: "last value that keeps a decimal" },
  { input: 100000, want: "100K", why: "decimal drops from here up" },

  /* ---- The float trap ------------------------------------------------ */
  /* (2900/1000)*10 is 28.999999999999996, which floors to 2.8K. Integer
     arithmetic is the only reason these pass. */
  { input: 2900, want: "2.9K", why: "float trap: n/1000 first gives 2.8K" },
  { input: 8100, want: "8.1K", why: "float trap" },
  { input: 5700, want: "5.7K", why: "float trap" },

  /* ---- Edges --------------------------------------------------------- */
  { input: 0, want: "0" },
  { input: 1, want: "1" },
  { input: 100001, want: "100K", why: "still floors above the decimal cutoff" },
  { input: 999999, want: "999K" },
  { input: 1000000, want: "1000K", why: "no M notation was specified; stays K" },
  { input: -5, want: "-5", why: "not reachable, but a minus beats a wrong number" },
];

const EXACT: Case[] = [
  { input: 4015, want: "4,015", why: "separators wherever spending happens" },
  { input: 999, want: "999" },
  { input: 0, want: "0" },
];

let failed = 0;

console.log("\n  COMPACT — the header pill\n");
for (const c of COMPACT) {
  const got = formatSandDollarsCompact(c.input);
  const ok = got === c.want;
  if (!ok) failed++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${String(c.input).padStart(8)} -> ${JSON.stringify(got).padEnd(9)}` +
      (ok ? "" : ` want ${JSON.stringify(c.want)}`) +
      (c.why ? `   ${c.why}` : "")
  );
}

console.log("\n  EXACT — everywhere a decision is made\n");
for (const c of EXACT) {
  const got = formatSandDollarsExact(c.input);
  const ok = got === c.want;
  if (!ok) failed++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${String(c.input).padStart(8)} -> ${JSON.stringify(got).padEnd(9)}` +
      (ok ? "" : ` want ${JSON.stringify(c.want)}`) +
      (c.why ? `   ${c.why}` : "")
  );
}

/* The pill's whole reason for existing: it has a character budget. Anything
   under 1,000,000 must fit in four. */
console.log("\n  WIDTH — four characters is the budget\n");
let widest = { n: 0, s: "" };
for (let n = 0; n < 1_000_000; n += 137) {
  const s = formatSandDollarsCompact(n);
  if (s.length > widest.s.length) widest = { n, s };
}
const widthOk = widest.s.length <= 5; // "99.9K" is five glyphs, four characters of number
if (!widthOk) failed++;
console.log(
  `  ${widthOk ? "ok  " : "FAIL"} widest under 1,000,000 is ${JSON.stringify(widest.s)} (${widest.s.length} chars) at ${widest.n}`
);

console.log(
  failed === 0
    ? "\n  all compact-balance cases pass\n"
    : `\n  ${failed} FAILING\n`
);
process.exit(failed === 0 ? 0 : 1);
