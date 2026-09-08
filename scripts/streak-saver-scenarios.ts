/* ============================================================================
   EDIAGD — the streak saver's rules, in both halves

   The feature's logic lives in two places and this suite covers both.

   THE SOFT-ASK BUDGET is TypeScript and pure, so it is tested here directly.
   It decides when the iOS permission dialog is allowed to be raised, and iOS
   raises that dialog ONCE per install — an off-by-one that spends a third ask
   costs somebody their notifications permanently, and there is no undo.

   THE FIVE ELIGIBILITY CONDITIONS are SQL — a generator's WHERE clause, two
   predicates and a unique index. A TypeScript mirror of them would be a second
   implementation that passes forever while the real one drifts, so those are
   tested against the REAL generator by streak_saver_acceptance() in migration
   0104, which builds fixtures, runs it, and rolls everything back. This script
   calls that function when it has credentials and says so plainly when it does
   not.

     npm run test:streak-saver
   ============================================================================ */

import {
  DEFAULT_PUSH_PREF,
  SECOND_ASK_STREAK,
  shouldOfferSoftAsk,
  type PushPref,
} from "@/lib/notifications/push-prefs";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    console.log(`  FAIL  ${name}`);
  }
}

const pref = (over: Partial<PushPref> = {}): PushPref => ({
  ...DEFAULT_PUSH_PREF,
  ...over,
});

console.log("\n  THE SOFT-ASK BUDGET\n");

/* Nothing before the app has been useful. An ask on day zero is a stranger
   wanting something. */
check(
  "no ask before the first completed day",
  shouldOfferSoftAsk({ completions: 0, streak: 0, pref: pref() }),
  false
);

check(
  "the first ask lands on the first completed day",
  shouldOfferSoftAsk({ completions: 1, streak: 1, pref: pref() }),
  true
);

/* The second ask needs a NEW argument, and the streak is the only one we have.
   Without this it would simply reappear the next day, which is nagging. */
check(
  "no second ask before the streak gives it a reason",
  shouldOfferSoftAsk({ completions: 3, streak: 3, pref: pref({ softAskCount: 1 }) }),
  false
);

check(
  `the second ask waits for a streak of ${SECOND_ASK_STREAK}`,
  shouldOfferSoftAsk({
    completions: 5,
    streak: SECOND_ASK_STREAK,
    pref: pref({ softAskCount: 1 }),
  }),
  true
);

/* THE BUDGET IS TWO. This is the assertion the whole file exists for. */
check(
  "never a third ask, however long the streak",
  shouldOfferSoftAsk({
    completions: 90,
    streak: 90,
    pref: pref({ softAskCount: 2 }),
  }),
  false
);

/* Somebody who said yes has been through the OS dialog. Whatever they told
   Apple, asking again is either a no-op or an annoyance. */
check(
  "never asked again after saying yes",
  shouldOfferSoftAsk({
    completions: 9,
    streak: 9,
    pref: pref({ softAskCount: 1, softAskAnswer: "yes" }),
  }),
  false
);

/* "Not now" is a real answer to OUR card and costs nothing — Apple's dialog was
   never raised — so the second ask is still available to them. */
check(
  "'not now' still leaves the second ask available",
  shouldOfferSoftAsk({
    completions: 5,
    streak: SECOND_ASK_STREAK,
    pref: pref({ softAskCount: 1, softAskAnswer: "not_now" }),
  }),
  true
);

/* The default for somebody with no row: they have never been asked, and the
   OS dialog is the opt-in, so sends are on once a token exists. */
check("a person with no row has been asked nothing", DEFAULT_PUSH_PREF.softAskCount, 0);
check("and is not opted out by default", DEFAULT_PUSH_PREF.pushEnabled, true);

/* ---- The SQL half -------------------------------------------------------- */

async function acceptance() {
  const url = process.env.SB_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SB_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log("\n  ELIGIBILITY, AGAINST THE REAL GENERATOR\n");

  if (!url || !key) {
    /*
     * Not a failure. This half needs a database and the suite has to stay
     * runnable without one — but it says so rather than printing nothing and
     * letting a green run imply coverage it did not have.
     */
    console.log("  SKIP  no SB_URL / SB_KEY — the SQL half did not run");
    console.log("        (set them to exercise streak_saver_acceptance)");
    return;
  }

  const response = await fetch(`${url}/rest/v1/rpc/streak_saver_acceptance`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: "{}",
  });

  const body = (await response.json()) as
    | { name: string; pass: boolean; detail: string }[]
    | Record<string, unknown>;

  if (!Array.isArray(body)) {
    failed++;
    failures.push(`acceptance rpc — ${JSON.stringify(body).slice(0, 200)}`);
    console.log("  FAIL  streak_saver_acceptance did not return results");
    return;
  }

  for (const t of body) check(t.name, t.pass, true);
}

acceptance().then(() => {
  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("\n  FAILURES");
    failures.forEach((f) => console.log(`    ${f}`));
    process.exit(1);
  }
});
