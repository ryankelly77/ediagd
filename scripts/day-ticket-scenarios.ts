/* ============================================================================
   EDIAGD — the day stamp and the watch ticket

   Both are HMACs the client carries and cannot alter, and both are worth
   proving offline rather than by clicking: a signature that verifies something
   slightly different from what you believe it verifies looks identical from the
   outside until somebody forges it.

     npm run test:day-ticket
   ============================================================================ */

process.env.WATCH_TICKET_SECRET ||= "test-secret-not-a-real-key";

import { mintDayStamp, readDayStamp, type ServedDay } from "../lib/day-stamp";
import {
  mintWatchTicket,
  readWatchTicket,
  ticketTtlMs,
  watchTicketRef,
} from "../lib/watch-ticket";
import { watchIsPlausible } from "../lib/watch-coverage";

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
const section = (t: string) => console.log(`\n${t}`);

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const DAY = "2026-09-02";
const CUE = "aaaaaaaa-0000-0000-0000-000000000001";
const VIDEO = "bbbbbbbb-0000-0000-0000-000000000002";

const served: ServedDay = {
  u: USER, d: DAY, b: "block-1",
  q1: "q-1", q2: "q-2", cue: CUE, vid: VIDEO, pitch: null,
  skipped: null, match: "family", tier: "low",
};

/* ---- 1 · The day stamp ---------------------------------------------------- */
section("1 · The day that was served cannot be edited on the way back");

const stamp = mintDayStamp(served);
const round = readDayStamp(stamp, USER, DAY);
check("a good stamp verifies", round.ok, true);
check(
  "and returns the day it was minted for",
  round.ok ? round.day : null,
  served
);
check(
  "another user's session cannot spend it",
  readDayStamp(stamp, OTHER, DAY),
  { ok: false, reason: "day stamp belongs to another user" }
);
check(
  "and neither can another day",
  readDayStamp(stamp, USER, "2026-09-03"),
  { ok: false, reason: "day stamp is from another day" }
);
check("a missing stamp is refused", readDayStamp(null, USER, DAY).ok, false);
check(
  "a truncated stamp is refused, not crashed on",
  readDayStamp("garbage", USER, DAY).ok,
  false
);

/*
 * THE FORGERY THE WHOLE STAMP EXISTS FOR. impact_coaching joins
 * daily_completion.cue_content_id to content.service_family to decide whether an
 * advisor was coached on a family, and that feeds the dealer's ROI figure. Swap
 * the cue id and the signature has to fail.
 */
const forged = mintDayStamp({ ...served, cue: "cccccccc-0000-0000-0000-000000000003" });
const tampered = `${forged.split(".")[0]}.${stamp.split(".")[1]}`;
check(
  "a swapped cue id under the original signature is refused",
  readDayStamp(tampered, USER, DAY),
  { ok: false, reason: "bad day stamp signature" }
);
check(
  "and a re-signed one is a different stamp, not this day's",
  readDayStamp(forged, USER, DAY).ok && (readDayStamp(forged, USER, DAY) as { day: ServedDay }).day.cue,
  "cccccccc-0000-0000-0000-000000000003"
);

/* ---- 2 · The watch ticket ------------------------------------------------- */
section("2 · The ticket times the video, not the page");

const THREE_MIN = 180;
const opened = 1_000_000_000_000;
const ticket = mintWatchTicket(USER, VIDEO, DAY, opened)!;

check(
  "a ticket read at the moment of opening has no elapsed time",
  readWatchTicket(ticket, USER, VIDEO, DAY, THREE_MIN, opened),
  { ok: true, openedAt: opened, elapsedSec: 0 }
);
check(
  "another user's ticket is refused",
  readWatchTicket(ticket, OTHER, VIDEO, DAY, THREE_MIN, opened).ok,
  false
);
check(
  "a ticket for another video is refused",
  readWatchTicket(ticket, USER, CUE, DAY, THREE_MIN, opened),
  { ok: false, reason: "watch ticket is for another video", code: "wrong-content" }
);
check(
  "and one carried across midnight is refused",
  readWatchTicket(ticket, USER, VIDEO, "2026-09-03", THREE_MIN, opened),
  { ok: false, reason: "watch ticket is from another day", code: "wrong-day" }
);

/*
 * THE TTL. Three times the asset plus five minutes: generous to a service drive
 * that pauses to serve a customer, and far short of the twelve hours that let a
 * ticket be minted at the morning meeting and spent after lunch.
 */
check("a three-minute video's ticket lives 14 minutes", ticketTtlMs(THREE_MIN), 840_000);
check(
  "still valid ten minutes after opening",
  readWatchTicket(ticket, USER, VIDEO, DAY, THREE_MIN, opened + 600_000).ok,
  true
);
check(
  "expired after fifteen",
  readWatchTicket(ticket, USER, VIDEO, DAY, THREE_MIN, opened + 900_000),
  {
    ok: false,
    reason: "watch ticket expired — open the video again",
    code: "expired",
  }
);
check(
  "and the twelve-hour window the old ticket allowed is long gone",
  readWatchTicket(ticket, USER, VIDEO, DAY, THREE_MIN, opened + 12 * 3_600_000).ok,
  false
);

/* ---- 3 · The wall-clock test, from open rather than render ---------------- */
section("3 · Five minutes of page-open no longer buys a full watch");

/*
 * The exact attack from the review: /today renders, the advisor waits five
 * minutes doing nothing, then posts watchPct 100 on a three-minute video. Under
 * the old ticket the elapsed window started at render, so 300s > 0.9 × 180s and
 * it passed. Now the window starts when the PLAYER opens, so an unopened video
 * has no ticket at all and an opened one has to have been open the length of
 * the video.
 */
check(
  "two minutes open is not enough for a three-minute video",
  watchIsPlausible(100, THREE_MIN, 120),
  false
);
check("but the video's own length is", watchIsPlausible(100, THREE_MIN, 162), true);
check(
  "a partial claim is never challenged — an honest 40% is not a forgery",
  watchIsPlausible(40, THREE_MIN, 1),
  true
);
check(
  "and an unknown duration cannot be tested, so it is not refused",
  watchIsPlausible(100, null, 1),
  true
);

/* ---- 4 · Single use ------------------------------------------------------- */
section("4 · A ticket is spent once");

check("the stored reference is a hash, never the ticket", watchTicketRef(ticket).includes("."), false);
check("32 hex characters", watchTicketRef(ticket).length, 32);
check("the same ticket always hashes the same", watchTicketRef(ticket), watchTicketRef(ticket));
check(
  "a different ticket hashes differently",
  watchTicketRef(ticket) === watchTicketRef(mintWatchTicket(USER, VIDEO, DAY, opened + 1)!),
  false
);


/* ---- 5 · Minting is unlimited; spending is once --------------------------- */
section("5 · A refresh must always be able to mint another ticket");

/*
 * THE LOCKOUT THIS RULES OUT. If minting refused a second ticket for the same
 * (user, content, day) once one had been issued, then a viewer who opened the
 * player and then reloaded the page — for any reason, including the resume-point
 * bug that started all this — would have no way to prove a watch for the rest of
 * the day. The gate could never be satisfied again.
 *
 * So minting is free and repeatable. Single use is enforced at CONSUMPTION, in
 * completeDay, against the ticket hashes already sitting on daily_completion —
 * which is the only place a ticket is ever actually spent.
 */
const first = mintWatchTicket(USER, VIDEO, DAY, opened)!;
const second = mintWatchTicket(USER, VIDEO, DAY, opened + 30_000)!;

check("a second ticket for the same video, same day, is issued", typeof second, "string");
check("and it is a different ticket", first === second, false);
check(
  "the first still verifies",
  readWatchTicket(first, USER, VIDEO, DAY, THREE_MIN, opened + 30_000).ok,
  true
);
check(
  "and so does the second",
  readWatchTicket(second, USER, VIDEO, DAY, THREE_MIN, opened + 30_000).ok,
  true
);
check(
  "they hash differently, so consuming one cannot consume the other",
  watchTicketRef(first) === watchTicketRef(second),
  false
);

/*
 * A ticket minted after a reload measures from the RELOAD, which is the point.
 * The window starts when this player opened, not when some earlier one did.
 */
check(
  "the fresh ticket's window starts at its own minting",
  readWatchTicket(second, USER, VIDEO, DAY, THREE_MIN, opened + 30_000),
  { ok: true, openedAt: opened + 30_000, elapsedSec: 0 }
);

/* ---- 6 · Expired is not forged ------------------------------------------- */
section("6 · Stale and made-up are told apart, because they end differently");

/*
 * completeDay branches on the CODE, not the sentence: an expired ticket lets the
 * day save uncredited, and a forged one is refused. Matching on wording would
 * have survived exactly until somebody improved the wording, and the failure
 * would have been a locked day.
 */
check(
  "a stale ticket reports expired",
  readWatchTicket(first, USER, VIDEO, DAY, THREE_MIN, opened + 900_000).ok ||
    (readWatchTicket(first, USER, VIDEO, DAY, THREE_MIN, opened + 900_000) as { code: string }).code,
  "expired"
);
check(
  "a tampered one reports forged",
  (readWatchTicket(
    `${mintWatchTicket(USER, CUE, DAY, opened)!.split(".").slice(0, 4).join(".")}.${first.split(".")[4]}`,
    USER,
    CUE,
    DAY,
    THREE_MIN,
    opened
  ) as { code: string }).code,
  "forged"
);
check(
  "another user's reports wrong-user, which is also a refusal",
  (readWatchTicket(first, OTHER, VIDEO, DAY, THREE_MIN, opened) as { code: string }).code,
  "wrong-user"
);
check(
  "a missing one reports missing",
  (readWatchTicket(null, USER, VIDEO, DAY, THREE_MIN, opened) as { code: string }).code,
  "missing"
);
check(
  "and garbage reports malformed, not a crash",
  (readWatchTicket("garbage", USER, VIDEO, DAY, THREE_MIN, opened) as { code: string }).code,
  "malformed"
);

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\n  FAILURES");
  failures.forEach((f) => console.log(`    ${f}`));
  process.exit(1);
}
