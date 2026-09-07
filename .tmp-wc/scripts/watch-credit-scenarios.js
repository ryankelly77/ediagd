"use strict";
/* ============================================================================
   EDIAGD — the same video is never demanded twice in one day

   From Ryan's first TestFlight session: on a rest day the card's video played,
   the gate row was written, and then "Take today's rep anyway" served the SAME
   video in the gated step and demanded a full rewatch.

   The write was fine. Both players read `initialMet` from a server prop fetched
   at page load, and the reveal is deliberately a state change with no round
   trip — so step 4 held the null the server sent before the advisor pressed
   play. What was missing was the client reading back its own write.

   This drives the REAL creditedGate and gateFromWatch through the two orders
   the bug report names, plus the cases that must NOT credit.

     npm run test:watch-credit
   ============================================================================ */
Object.defineProperty(exports, "__esModule", { value: true });
const watch_credit_1 = require("../lib/watch-credit");
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
/**
 * The one piece of DailyFlow state this turns on, modelled exactly as the
 * component holds it: a server record fixed at page load, and a session record
 * that any player can set when its gate opens.
 */
class Visit {
    server;
    session = null;
    constructor(server = null) {
        this.server = server;
    }
    /** What a player mounting right now is handed as `initialMet`. */
    seenByPlayer() {
        return (0, watch_credit_1.creditedGate)(this.server, this.session);
    }
    /** A player crossed the threshold (or its failure valve opened). */
    gateOpened(state) {
        this.session = (0, watch_credit_1.gateFromWatch)(state);
    }
    /** Would this mount make the advisor watch the video again? */
    demandsAWatch() {
        return this.seenByPlayer() === null;
    }
}
console.log("\n  Rest-day card and the gated step share one watch\n");
/* ---- The reported bug, in order --------------------------------------- */
{
    const visit = new Visit(null); // nothing watched when the page loaded
    check("rest card opens un-watched", visit.demandsAWatch(), true);
    visit.gateOpened({ pct: 97, error: false }); // played to threshold on the card
    check("card records the gate", visit.seenByPlayer(), { pct: 97, error: false });
    // The reveal is a state change, not a reload: the server prop is still null.
    check("revealed loop arrives satisfied", visit.demandsAWatch(), false);
    check("loop sees the percentage the card measured", visit.seenByPlayer()?.pct, 97);
}
/* ---- The reverse order, which the brief also names --------------------- */
{
    const visit = new Visit(null);
    visit.gateOpened({ pct: 96, error: false }); // watched in the loop first
    check("backing out to the card finds it watched", visit.demandsAWatch(), false);
    check("card shows the loop's measurement", visit.seenByPlayer(), {
        pct: 96,
        error: false,
    });
}
/* ---- A gate the server already knew about ------------------------------ */
{
    const visit = new Visit({ pct: 99, error: false }); // met earlier, then reloaded
    check("a reload starts satisfied", visit.demandsAWatch(), false);
    check("server record is used as-is", visit.seenByPlayer(), { pct: 99, error: false });
}
/* ---- The session record is the newer fact ------------------------------ */
{
    const visit = new Visit({ pct: 95, error: false });
    visit.gateOpened({ pct: 100, error: false });
    check("a gate opened in this visit wins over the page-load record", visit.seenByPlayer(), { pct: 100, error: false });
}
/* ---- The failure valve carries too ------------------------------------- */
{
    const visit = new Visit(null);
    visit.gateOpened({ pct: 12, error: true });
    check("a broken player writes no percentage", visit.seenByPlayer(), { pct: null, error: true });
    check("and the second mount does not re-demand the watch", visit.demandsAWatch(), false);
}
/* ---- PARTIAL COVERAGE MUST NOT CREDIT ----------------------------------
   The decision this file pins down. A half-watch on the card does not open
   anything, so the loop starts at zero — TrackedVideo never calls onGateMet
   below the threshold, and nothing here may invent a record for it. */
{
    const visit = new Visit(null);
    // No gateOpened(): the threshold was never crossed, so no player reported one.
    check("a half-watch on the card credits nothing", visit.seenByPlayer(), null);
    check("and the loop still asks for the watch", visit.demandsAWatch(), true);
}
/* ---- Two different videos do not credit each other --------------------- */
{
    const lifestyle = new Visit(null);
    const pitch = new Visit(null);
    lifestyle.gateOpened({ pct: 98, error: false });
    check("the pitch video is untouched by the lifestyle watch", pitch.demandsAWatch(), true);
    check("and the lifestyle one is credited", lifestyle.demandsAWatch(), false);
}
console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failures.length) {
    failures.forEach((f) => console.log(`    ${f}\n`));
    process.exit(1);
}
