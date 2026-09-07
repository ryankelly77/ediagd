"use strict";
/* ============================================================================
   EDIAGD — closures only ever add rest

   The acceptance this file holds down, in the order it matters:

     1. A CONFIRMED CLOSURE IS A REST DAY, and the streak refuses to count it —
        the card and countMissedWorkDays read one derivation, so the screen
        cannot promise "your streak is safe" on a day the engine charges for.
     2. A PROPOSAL CHANGES NOTHING. Anywhere. That is what makes seeding
        eleven dates per rooftop safe to run unattended.
     3. A ROOFTOP WITH NO CLOSURES BEHAVES EXACTLY AS IT DID BEFORE 0101.

     npm run test:closures
   ============================================================================ */
Object.defineProperty(exports, "__esModule", { value: true });
const closures_1 = require("../lib/closures");
const work_schedule_1 = require("../lib/work-schedule");
const streak_1 = require("../lib/gamification/streak");
let passed = 0;
let failed = 0;
const failures = [];
function check(label, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
        passed++;
        console.log(`    ✓ ${label}`);
    }
    else {
        failed++;
        failures.push(`${label}\n        expected ${e}\n        actual   ${a}`);
        console.log(`    ✗ ${label}`);
    }
}
const MON_FRI = {
    mon: true, tue: true, wed: true, thu: true, fri: true, sun: false,
    saturdayMode: "none", saturdayAnchor: null,
};
/* Labor Day 2026 is Monday 7 September — the fixture the brief names. */
const LABOR_DAY = "2026-09-07";
const TUE_AFTER = "2026-09-08";
const FRI_BEFORE = "2026-09-04";
const ctx = (over = {}) => ({
    schedule: MON_FRI,
    islandTime: [],
    closures: [],
    ...over,
});
const CLOSED = [{ date: LABOR_DAY, label: "Labor Day" }];
console.log("\n  The federal list\n");
check("Labor Day 2026 is the first Monday in September", (0, closures_1.federalHolidays)(2026).find((h) => h.label === "Labor Day")?.date, LABOR_DAY);
check("Thanksgiving 2026 is the fourth Thursday", (0, closures_1.federalHolidays)(2026).find((h) => h.label === "Thanksgiving")?.date, "2026-11-26");
check("Memorial Day 2026 is the LAST Monday in May", (0, closures_1.federalHolidays)(2026).find((h) => h.label === "Memorial Day")?.date, "2026-05-25");
check("MLK Day 2027 is the third Monday in January", (0, closures_1.federalHolidays)(2027).find((h) => h.label === "MLK Day")?.date, "2027-01-18");
check("eleven of them", (0, closures_1.federalHolidays)(2026).length, 11);
/* Actual dates, not observed: 4 July 2026 is a Saturday and stays there. */
check("Independence Day is not shifted off its Saturday", (0, closures_1.federalHolidays)(2026).find((h) => h.label === "Independence Day")?.date, "2026-07-04");
console.log("\n  Seeding is idempotent and never re-asks\n");
check("seeds this year and next", (0, closures_1.yearsToSeed)("2026-09-07"), [2026, 2027]);
check("seeds next January's year in December too", (0, closures_1.yearsToSeed)("2026-12-31"), [2026, 2027]);
check("nothing missing when every date has a row", (0, closures_1.missingProposals)([2026], (0, closures_1.federalHolidays)(2026).map((h) => h.date)).length, 0);
check("a DISMISSED date is never proposed again", (0, closures_1.missingProposals)([2026], [LABOR_DAY]).some((p) => p.date === LABOR_DAY), false);
check("a year with no rows proposes all eleven", (0, closures_1.missingProposals)([2026], []).length, 11);
console.log("\n  A confirmed closure is a rest day\n");
check("Labor Day becomes a store closure card", (0, work_schedule_1.restDayFor)(LABOR_DAY, ctx({ closures: CLOSED })), { kind: "store_closed", label: "Labor Day" });
check("the surrounding Tuesday is untouched", (0, work_schedule_1.restDayFor)(TUE_AFTER, ctx({ closures: CLOSED })), null);
check("the streak does not count it", (0, streak_1.scheduledOn)(LABOR_DAY, ctx({ closures: CLOSED })), false);
check("nor is it a gap between the Friday and the Tuesday", (0, streak_1.countMissedWorkDays)(FRI_BEFORE, TUE_AFTER, ctx({ closures: CLOSED })), 0);
check("without the closure that Monday IS a missed work day", (0, streak_1.countMissedWorkDays)(FRI_BEFORE, TUE_AFTER, ctx()), 1);
check("and the card names the Tuesday as their next day", (0, work_schedule_1.nextScheduledDayLabel)(LABOR_DAY, ctx({ closures: CLOSED })), "Tuesday");
console.log("\n  A proposal changes nothing\n");
/* The loader only ever selects status='confirmed', so an unconfirmed row is
   absent from the context entirely. This is that absence, asserted. */
check("an unconfirmed date is not a rest day", (0, work_schedule_1.restDayFor)(LABOR_DAY, ctx()), null);
check("an unconfirmed date is still owed", (0, streak_1.scheduledOn)(LABOR_DAY, ctx()), true);
check("and still counts as missed", (0, streak_1.countMissedWorkDays)(FRI_BEFORE, TUE_AFTER, ctx()), 1);
console.log("\n  No closures is the pre-0101 world\n");
check("a rooftop with no calendar has no rest days added", (0, work_schedule_1.restDayFor)(LABOR_DAY, { schedule: MON_FRI, islandTime: [] }), null);
check("and no gap changes", (0, streak_1.countMissedWorkDays)(FRI_BEFORE, TUE_AFTER, { schedule: MON_FRI, islandTime: [] }), 1);
check("an undefined closures list is not a crash", (0, work_schedule_1.restDayFor)(LABOR_DAY, { schedule: MON_FRI }), null);
console.log("\n  Precedence between the three rest reasons\n");
/* A closure on a Saturday is still just a day off — the truer thing to say. */
check("a day off outranks a closure", (0, work_schedule_1.restDayFor)("2026-09-05", ctx({ closures: [{ date: "2026-09-05", label: "Labor Day" }] })), { kind: "day_off" });
/* The store being shut is true for everyone; the booking is true for them. */
check("a closure outranks Island Time", (0, work_schedule_1.restDayFor)(LABOR_DAY, ctx({ closures: CLOSED, islandTime: [{ start: LABOR_DAY, end: LABOR_DAY }] })), { kind: "store_closed", label: "Labor Day" });
check("no schedule on file still means no card", (0, work_schedule_1.restDayFor)(LABOR_DAY, { schedule: null, closures: CLOSED }), null);
console.log("\n  Readiness\n");
const settled = (rows) => (0, closures_1.calendarSettledThroughYearEnd)("2026-09-01", rows);
check("an open proposal before year-end is not settled", settled([{ date: LABOR_DAY, status: "proposed", dismissed: false }]), false);
check("confirming it settles the calendar", settled([{ date: LABOR_DAY, status: "confirmed", dismissed: false }]), true);
check("DISMISSING it settles it too — the question was answered", settled([{ date: LABOR_DAY, status: "proposed", dismissed: true }]), true);
check("a rooftop nobody has seeded reads as not settled", settled([]), false);
check("a proposal in NEXT year does not hold this year open", settled([
    { date: LABOR_DAY, status: "confirmed", dismissed: false },
    { date: "2027-01-01", status: "proposed", dismissed: false },
]), true);
check("a proposal already in the past does not hold it open either", settled([
    { date: "2026-01-01", status: "proposed", dismissed: false },
    { date: LABOR_DAY, status: "confirmed", dismissed: false },
]), true);
check("the open count is what the line reports", (0, closures_1.openProposalCount)("2026-09-01", [
    { date: LABOR_DAY, status: "proposed", dismissed: false },
    { date: "2026-11-26", status: "proposed", dismissed: false },
    { date: "2026-12-25", status: "confirmed", dismissed: false },
]), 2);
console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failures.length) {
    failures.forEach((f) => console.log(`    ${f}\n`));
    process.exit(1);
}
