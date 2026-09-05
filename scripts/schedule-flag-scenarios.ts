/* ============================================================================
   EDIAGD — schedules that pass every check and mean nothing

   Mitch's row: every weekday false, saturday_mode 'alternating', anchor set.
   validateDraft is satisfied — one day is picked and the anchor is a real
   Saturday — so it saved without a murmur. As far as the engine is concerned he
   works every other Saturday and nothing else: /today renders a rest card six
   days a week and his Swell counts almost nothing. Nobody would have found it
   until he asked why his streak never moved.

   These are the rules that catch it, and the ones that keep them from catching
   people who are fine:

     1. A FLAG IS NEVER A BLOCK. validateDraft still decides what saves. A
        two-day part-timer is a real person at a real dealership, and refusing
        their week would be the app telling them their job is wrong.

     2. THE SAME RULES BOTH ENDS. The advisor's confirm screen runs them on the
        draft; the admin's onboarding list runs them on what was saved. One
        module, so the question a GM sees is the question its owner was asked.

     npm run test:schedule-flags
   ============================================================================ */

import {
  draftWarning,
  flagLine,
  isWeekendOnly,
  scheduleFlags,
  workDaysPerWeek,
} from "../lib/schedule-flags";
import { validateDraft, scheduleToDraft } from "../lib/work-schedule";
import type { WorkSchedule } from "../lib/gamification/streak";

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

const base: WorkSchedule = {
  mon: false, tue: false, wed: false, thu: false, fri: false, sun: false,
  saturdayMode: "none", saturdayAnchor: null,
};

const MON_FRI: WorkSchedule = { ...base, mon: true, tue: true, wed: true, thu: true, fri: true };
const MON_SAT_ALT: WorkSchedule = { ...MON_FRI, saturdayMode: "alternating", saturdayAnchor: "2026-09-05" };
/* The row that started this. */
const MITCH: WorkSchedule = { ...base, saturdayMode: "alternating", saturdayAnchor: "2026-09-05" };
const TWO_DAY: WorkSchedule = { ...base, mon: true, tue: true };
const THREE_DAY: WorkSchedule = { ...base, mon: true, wed: true, fri: true };
const WEEKENDS: WorkSchedule = { ...base, sun: true, saturdayMode: "every" };

console.log("\n  COUNTING A WEEK\n");

check("Mon–Fri is five days", workDaysPerWeek(MON_FRI), 5);
check("plus alternating Saturdays is six", workDaysPerWeek(MON_SAT_ALT), 6);
check("alternating Saturdays alone is one", workDaysPerWeek(MITCH), 1);
check("no schedule at all is zero", workDaysPerWeek(null), 0);

console.log("\n  WHAT GETS FLAGGED\n");

check("an ordinary Mon–Fri week is clean", scheduleFlags(MON_FRI), []);
check("Mon–Sat alternating is clean", scheduleFlags(MON_SAT_ALT), []);
check("three days is clean — the threshold is 'fewer than three'", scheduleFlags(THREE_DAY), []);

check(
  "Mitch's week is flagged as weekends-only",
  scheduleFlags(MITCH).map((f) => f.code),
  ["weekend-only"]
);
check("and it IS weekend-only by the predicate", isWeekendOnly(MITCH), true);
check(
  "a two-day week is flagged, quietly, as few days",
  scheduleFlags(TWO_DAY).map((f) => f.code),
  ["few-days"]
);
check(
  "Sat + Sun is weekend-only, not two separate complaints",
  scheduleFlags(WEEKENDS).map((f) => f.code),
  ["weekend-only"]
);

console.log("\n  AN UNCONFIRMED SCHEDULE\n");

check(
  "a fresh sign-in with nothing confirmed is not yet overdue",
  scheduleFlags(MON_FRI, { confirmed: false, daysSinceFirstLogin: 3 }).map((f) => f.code),
  []
);
check(
  "past the grace window it is",
  scheduleFlags(MON_FRI, { confirmed: false, daysSinceFirstLogin: 8 }).map((f) => f.code),
  ["confirm-overdue"]
);
check(
  "somebody who has never signed in is not overdue — nobody has opened the account",
  scheduleFlags(MON_FRI, { confirmed: false, daysSinceFirstLogin: null }).map((f) => f.code),
  []
);
check(
  "an unusual week AND an overdue confirmation raise both",
  scheduleFlags(MITCH, { confirmed: false, daysSinceFirstLogin: 30 }).map((f) => f.code),
  ["weekend-only", "confirm-overdue"]
);

console.log("\n  A FLAG IS NEVER A BLOCK\n");

/* The whole doctrine in one assertion: everything flagged above still saves. */
let refused = 0;
for (const s of [MITCH, TWO_DAY, WEEKENDS]) {
  if (validateDraft(scheduleToDraft(s)) !== null) refused++;
}
check("no flagged schedule is refused by validateDraft", refused, 0);

console.log("\n  THE WORDS\n");

check("a clean week says nothing at all", flagLine(scheduleFlags(MON_FRI)), "");
check("a clean week warns nobody on the confirm screen", draftWarning(MON_FRI), "");
check(
  "the admin line names the reason",
  flagLine(scheduleFlags(MITCH)),
  "Unusual schedule — worth a look: weekends only — no weekday is selected."
);
check(
  "the advisor is asked about their own week, in the second person",
  draftWarning(MITCH),
  "This looks unusual — you haven't picked a single weekday. Are you sure that's your week?"
);
check(
  "and a short week is asked about by its number",
  draftWarning(TWO_DAY),
  "This looks unusual — 2 days a week. Are you sure that's your week?"
);

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\n  FAILURES");
  failures.forEach((f) => console.log(`    ${f}`));
  process.exit(1);
}
