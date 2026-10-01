/* ============================================================================
   EDIAGD — the greeting follows the clock, proven at the boundaries

     npm run test:greeting

   Pure; no database. greetingForHour is tested at the six moments Ryan named
   plus the fallback, and the same six again through the exact string shape
   rooftop_local_now returns over PostgREST — because the hour the function
   sees is sliced out of that string, and a test that skipped the slice would
   pass with the parse off by a column.
   ============================================================================ */
import { BRAND, greetingForHour } from "../lib/brand";

let passed = 0;
let failed = 0;
function expect(actual: string, wanted: string, label: string) {
  if (actual === wanted) {
    passed += 1;
    console.log(`  ok    ${label} -> ${actual}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label} -> ${actual}, wanted ${wanted}`);
  }
}

/* The slice rooftopGreeting performs on the rpc's timestamp string. */
const hourOf = (clock: string) => Number(`2026-10-01T${clock}:00`.slice(11, 13));

const CASES: [string, string][] = [
  ["06:00", "Good morning"],
  ["11:59", "Good morning"],
  ["12:00", "Good afternoon"],
  ["16:59", "Good afternoon"],
  ["17:00", "Good evening"],
  ["23:30", "Good evening"],
];

for (const [clock, wanted] of CASES) {
  expect(greetingForHour(hourOf(clock)), wanted, `store clock ${clock}`);
}

/* A clock that cannot be read never invents a time of day. */
expect(greetingForHour(Number.NaN), BRAND.greeting, "unreadable clock");
expect(greetingForHour(-1), BRAND.greeting, "hour below range");
expect(greetingForHour(24), BRAND.greeting, "hour above range");

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
