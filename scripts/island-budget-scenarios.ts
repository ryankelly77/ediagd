/* ============================================================================
   EDIAGD — how much Island Time a year holds

   Island Time makes days stop counting against a Swell. Until the cap there was
   no limit on how many days an advisor could book, so the honest description of
   the feature was "an unlimited streak freeze with a friendly label". These are
   the rules that close it, and the ones that keep it fair while doing so:

     1. WORK DAYS ONLY. A Saturday inside a booked fortnight costs a Mon–Fri
        advisor nothing, because the Swell never counted it in the first place.
        Charging for it would give the six-day advisor less real time off than
        the five-day one out of the same budget.

     2. A DAY IS CHARGED ONCE. Ranges may overlap — 0025 says so, because the
        engine only asks "is this date inside ANY range". Usage is a set of
        dates, never a sum of lengths.

     3. A RANGE SPANNING NEW YEAR IS CHARGED TO BOTH YEARS. Rolling it into the
        year it starts in would let somebody spend next year's allowance in
        December and then spend it again in January.

     4. NOTHING IS EVER TRUNCATED. A range that does not fit is refused with the
        number remaining. Silently shortening somebody's holiday means they find
        out in January, when the Swell breaks on a day they thought was covered.

     npm run test:island-budget
   ============================================================================ */

import {
  bookedDays,
  chargeableDays,
  quoteRange,
  quoteSentence,
  refusalSentence,
  usageForYear,
} from "../lib/island-budget";
import type { IslandTime, IsoDate, WorkSchedule } from "../lib/gamification/streak";

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

const MON_FRI: WorkSchedule = {
  mon: true,
  tue: true,
  wed: true,
  thu: true,
  fri: true,
  sun: false,
  saturdayMode: "none",
  saturdayAnchor: null,
};

const SIX_DAY: WorkSchedule = { ...MON_FRI, saturdayMode: "every" };

const range = (start: string, end: string): IslandTime => ({
  start: start as IsoDate,
  end: end as IsoDate,
});

/* 2026-09-07 is a Monday. A fortnight from it runs Mon 7th to Sun 20th. */
const FORTNIGHT = range("2026-09-07", "2026-09-20");

console.log("\n  WHAT A RANGE COSTS\n");

check(
  "a fortnight costs a Mon–Fri advisor ten days, not fourteen",
  chargeableDays(FORTNIGHT.start, FORTNIGHT.end, MON_FRI).length,
  10
);
check(
  "the same fortnight costs a six-day advisor twelve",
  chargeableDays(FORTNIGHT.start, FORTNIGHT.end, SIX_DAY).length,
  12
);
check(
  "a lone Saturday costs a Mon–Fri advisor nothing",
  chargeableDays("2026-09-05" as IsoDate, "2026-09-05" as IsoDate, MON_FRI).length,
  0
);
check(
  "no schedule on file charges every day, like the engine counts every day",
  chargeableDays(FORTNIGHT.start, FORTNIGHT.end, null).length,
  14
);
check(
  "an end before the start costs nothing rather than looping",
  chargeableDays("2026-09-20" as IsoDate, "2026-09-07" as IsoDate, MON_FRI).length,
  0
);

console.log("\n  A DAY IS CHARGED ONCE\n");

check(
  "two overlapping weeks are not two weeks of budget",
  bookedDays([range("2026-09-07", "2026-09-11"), range("2026-09-09", "2026-09-15")], MON_FRI)
    .size,
  7
);
check(
  "re-booking days already covered costs nothing",
  quoteRange("2026-09-07" as IsoDate, "2026-09-11" as IsoDate, [FORTNIGHT], MON_FRI, 15).cost,
  0
);
check(
  "and says so in plain words",
  quoteSentence(
    quoteRange("2026-09-07" as IsoDate, "2026-09-11" as IsoDate, [FORTNIGHT], MON_FRI, 15),
    2026
  ),
  "These days are already booked as Island Time — this adds nothing."
);

console.log("\n  THE YEAR'S BUDGET\n");

check("nothing booked, nothing used", usageForYear([], MON_FRI, 2026, 15), {
  year: 2026,
  cap: 15,
  used: 0,
  remaining: 15,
});

check("a booked fortnight uses ten", usageForYear([FORTNIGHT], MON_FRI, 2026, 15), {
  year: 2026,
  cap: 15,
  used: 10,
  remaining: 5,
});

check(
  "last year's absence doesn't spend this year's budget",
  usageForYear([range("2025-09-07", "2025-09-20")], MON_FRI, 2026, 15),
  { year: 2026, cap: 15, used: 0, remaining: 15 }
);

/* Grandfathered ranges can start somebody over the cap on day one. `used` must
   report the truth; `remaining` must not go negative. */
const OVER = [range("2026-03-02", "2026-03-27")]; // 20 work days
check(
  "a range booked before the rule can exceed the cap, and is reported honestly",
  usageForYear(OVER, MON_FRI, 2026, 15),
  { year: 2026, cap: 15, used: 20, remaining: 0 }
);

console.log("\n  NEW YEAR\n");

/* 2026-12-28 is a Monday; the range runs into Friday 2027-01-01. */
const NEW_YEAR = quoteRange(
  "2026-12-28" as IsoDate,
  "2027-01-01" as IsoDate,
  [],
  MON_FRI,
  15
);
check("a range spanning New Year is charged to both years", NEW_YEAR.years.length, 2);
check(
  "2026 gets its four days and 2027 its one",
  NEW_YEAR.years.map((y) => [y.year, y.cost]),
  [
    [2026, 4],
    [2027, 1],
  ]
);
check("and the total is the sum", NEW_YEAR.cost, 5);
check(
  "each year is measured against its own budget",
  NEW_YEAR.years.map((y) => y.remainingAfter),
  [11, 14]
);

console.log("\n  REFUSED, NEVER TRUNCATED\n");

const NEARLY_SPENT = [range("2026-06-01", "2026-06-19")]; // 15 work days — the lot
const TOO_BIG = quoteRange("2026-09-07" as IsoDate, "2026-09-11" as IsoDate, NEARLY_SPENT, MON_FRI, 15);

check("a range that doesn't fit is not affordable", TOO_BIG.affordable, false);
check("its cost is still reported in full, not clipped to what's left", TOO_BIG.cost, 5);
check(
  "and the refusal names the number remaining",
  refusalSentence(TOO_BIG, 2026),
  "That needs 5 days and you have 0 left this year — you've used 15 of your 15 Island Time days. Shorten it, or ask your manager."
);

const FITS = quoteRange("2026-09-07" as IsoDate, "2026-09-10" as IsoDate, [], MON_FRI, 15);
check("a range that fits is affordable", FITS.affordable, true);
check(
  "and the preview shows the arithmetic",
  quoteSentence(FITS, 2026),
  "This uses 4 of your 15 Island Time days this year — 11 left after."
);

/* Exactly to the day is allowed: the cap is a limit, not a margin. */
const EXACT = quoteRange("2026-09-07" as IsoDate, "2026-09-11" as IsoDate, [range("2026-06-01", "2026-06-12")], MON_FRI, 15);
check("spending the last day of the budget is allowed", EXACT.affordable, true);
check("and leaves nothing", EXACT.years[0].remainingAfter, 0);

/* A cap of zero switches the feature off — and must refuse rather than crash. */
const OFF = quoteRange("2026-09-07" as IsoDate, "2026-09-07" as IsoDate, [], MON_FRI, 0);
check("a cap of zero refuses everything", OFF.affordable, false);

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\n  FAILURES");
  failures.forEach((f) => console.log(`    ${f}`));
  process.exit(1);
}
