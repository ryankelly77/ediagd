/* ============================================================================
   EDIAGD — a day nobody asked them to work

   A Mon–Fri advisor opening the app on a Saturday used to meet the full ritual:
   five steps, a coaching cue about an attach rate, and nothing anywhere saying
   their Swell was safe. It always was — countMissedWorkDays has skipped days off
   since 0025 — but the app had never said so, so the advisor either worked their
   day off or guessed.

   Worse, the render WROTE. ensureBlockForToday inserts, so glancing at the app
   on a Saturday could start a six-day coaching commitment dated to a day nobody
   was on the drive.

   The two rules this file holds down:

     1. A REST DAY IS EXACTLY THE DAY THE STREAK ENGINE REFUSES TO COUNT.
        The card and countMissedWorkDays read one derivation. A card promising
        "your streak is safe" on a day the engine would hold against them is the
        worst failure available here, so it is the first thing tested.

     2. AN UNSCHEDULED RENDER WRITES NOTHING. Not the insert, not the tidy-up
        that closes a finished block.

     npm run test:rest-day
   ============================================================================ */

import { restDayFor } from "../lib/work-schedule";
import {
  countMissedWorkDays,
  type IsoDate,
  type ScheduleContext,
  type WorkSchedule,
} from "../lib/gamification/streak";
import { ensureBlockForToday } from "../lib/coaching-block";

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

/* ---- The calendar these tests are written against ------------------------
   2026-09-05 is a Saturday. Every date below is spelled with its weekday in
   the label so a wrong assumption shows up as a wrong label rather than a
   mysterious failure. */
const MON: IsoDate = "2026-09-07";
const FRI: IsoDate = "2026-09-04";
const SAT: IsoDate = "2026-09-05";
const SUN: IsoDate = "2026-09-06";
const NEXT_SAT: IsoDate = "2026-09-12";

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

const ctx = (over: Partial<ScheduleContext> = {}): ScheduleContext => ({
  schedule: MON_FRI,
  islandTime: [],
  ...over,
});

console.log("\n  REST DAYS — which days are they, and do they match the engine\n");

check("Saturday is a scheduled day off", restDayFor(SAT, ctx()), { kind: "day_off" });
check("Sunday is too", restDayFor(SUN, ctx()), { kind: "day_off" });
check("Monday is a work day — no card", restDayFor(MON, ctx()), null);
check("Friday is a work day — no card", restDayFor(FRI, ctx()), null);

check(
  "no schedule on file is treated as scheduled, like the engine",
  restDayFor(SAT, { schedule: null, islandTime: [] }),
  null
);

check(
  "Island Time on a work day gets Island Time copy",
  restDayFor(MON, ctx({ islandTime: [{ start: MON, end: MON }] })),
  { kind: "island_time" }
);

check(
  "a Saturday inside a booked week is still a day off, not Island Time",
  restDayFor(SAT, ctx({ islandTime: [{ start: FRI, end: SUN }] })),
  { kind: "day_off" }
);

/* Alternating Saturdays: the anchor is a Saturday they DO work, and parity runs
   in whole fortnights from it. */
const ALT: WorkSchedule = { ...MON_FRI, saturdayMode: "alternating", saturdayAnchor: SAT };
check("an alternating advisor's working Saturday gets no card", restDayFor(SAT, ctx({ schedule: ALT })), null);
check(
  "their off Saturday does",
  restDayFor(NEXT_SAT, ctx({ schedule: ALT })),
  { kind: "day_off" }
);

const EVERY_SAT: WorkSchedule = { ...MON_FRI, saturdayMode: "every" };
check(
  "somebody who works every Saturday never sees the card on one",
  restDayFor(SAT, ctx({ schedule: EVERY_SAT })),
  null
);

/* ---- The rule that matters most ----------------------------------------- */
console.log("\n  THE CARD AND THE ENGINE AGREE\n");

/*
 * For every day across a fortnight, a day the card calls a rest day must be a
 * day countMissedWorkDays refuses to count. Measured as the engine does it:
 * completing the day before and the day after, and asking whether the day in
 * between produced a gap.
 */
let disagreements = 0;
const start = new Date("2026-09-01T00:00:00Z");
for (let i = 0; i < 21; i++) {
  const d = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10) as IsoDate;
  const dayBefore = new Date(start.getTime() + (i - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10) as IsoDate;
  const dayAfter = new Date(start.getTime() + (i + 1) * 86_400_000)
    .toISOString()
    .slice(0, 10) as IsoDate;

  const c = ctx({ islandTime: [{ start: "2026-09-16", end: "2026-09-18" }] });
  const isRest = restDayFor(d, c) !== null;
  const costsAGap = countMissedWorkDays(dayBefore, dayAfter, c) > 0;

  if (isRest === costsAGap) disagreements++;
}
check("no day is shown as safe while the engine would count it", disagreements, 0);

/* ---- An unscheduled render writes nothing -------------------------------- */
console.log("\n  A DAY OFF OPENS NOTHING AND CLOSES NOTHING\n");

type Write = { table: string; op: string };

/**
 * The thinnest Supabase stand-in that can catch a write.
 *
 * Every mutating verb records itself and every read answers from `blocks`. A
 * paraphrase of ensureBlockForToday would prove nothing about the function the
 * page actually calls, so the real one runs against this.
 */
function fakeClient(open: { id: string; served: number; lengthDays: number } | null) {
  const writes: Write[] = [];

  const from = (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api: any = {};
    const self = () => api;

    api.select = self;
    api.eq = self;
    api.is = self;
    api.in = self;
    api.order = self;
    api.limit = self;

    api.insert = () => {
      writes.push({ table, op: "insert" });
      return api;
    };
    api.update = () => {
      writes.push({ table, op: "update" });
      return api;
    };
    api.delete = () => {
      writes.push({ table, op: "delete" });
      return api;
    };

    api.maybeSingle = async () =>
      table === "coaching_block" && open
        ? {
            data: {
              id: open.id,
              family: "Brake Service",
              op_code: "BPR-029",
              tier: "low",
              started_on: "2026-09-01",
              length_days: open.lengthDays,
            },
            error: null,
          }
        : { data: null, error: null };

    /* Thenable, because readOpenBlock awaits the builder itself for the
       head-count that gives it `served`. */
    api.then = (resolve: (v: unknown) => void) =>
      resolve({ count: open?.served ?? 0, data: [], error: null });

    return api;
  };

  return { client: { from }, writes };
}

const PICK = { family: "Brake Service", tier: "low" as const };

async function run() {
  {
    const { client, writes } = fakeClient(null);
    const block = await ensureBlockForToday(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "user-1",
      "rooftop-1",
      SAT,
      PICK,
      6,
      false,
      /* scheduledToday */ false
    );
    check("a Saturday load with no open block opens none", block, null);
    check("and writes nothing at all", writes, []);
  }

  {
    const { client, writes } = fakeClient({ id: "b1", served: 2, lengthDays: 6 });
    const block = await ensureBlockForToday(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "user-1",
      "rooftop-1",
      SAT,
      PICK,
      6,
      false,
      false
    );
    check("an open, unfinished block still serves on a day off", block?.id ?? null, "b1");
    check("and still writes nothing", writes, []);
  }

  {
    const { client, writes } = fakeClient({ id: "b2", served: 6, lengthDays: 6 });
    const block = await ensureBlockForToday(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "user-1",
      "rooftop-1",
      SAT,
      PICK,
      6,
      false,
      false
    );
    check("a FINISHED block is not served on a day off", block, null);
    /* The close is a write, and ended_on would read as "the day this coaching
       finished" — a Saturday nobody worked is the wrong answer. The next
       scheduled render closes it. */
    check("and is not closed either — no ended_on dated to a day off", writes, []);
  }

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("\n  FAILURES");
    failures.forEach((f) => console.log(`    ${f}`));
    process.exit(1);
  }
}

void run();
