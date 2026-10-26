/* ============================================================================
   EDIAGD — the Rollcall cron, driven for real

   `npm run test:rollcall-schedule` proves the RULE: a pure function over a date
   and a closure row. It proves nothing whatsoever about whether the route ever
   calls it, reads the right row, writes a heartbeat, or leaves `posted_at`
   alone — and those are the four things that decide whether Ryan's ask actually
   works.

   So this hits the REAL route over HTTP, with the real CRON_SECRET, against a
   real rooftop with a real closure row, and then asks the database what it saw.

   ---------------------------------------------------------------------------
   IT MUST NOT POST TO #ediagd, AND HERE IS HOW THAT IS ENSURED
   ---------------------------------------------------------------------------
   Two independent guards, because one would be a promise:

     1  The dev server is launched with SLACK_ROLLCALL_WEBHOOK EMPTY, so
        postToSlack returns `no_url` and never opens a socket. The run command
        below does this and the script refuses to start unless its OWN
        environment has it empty too — same shell, same mistake caught early.
     2  Every case names a FIXTURE rooftop with ?rooftop=, never
        ROLLCALL_ROOFTOP_ID. If a message somehow escaped it would describe a
        store called "rollcron-xxxxxx Store", which is unmistakable.

   And the acceptance case ASSERTS it got `no_url`. If it ever sees
   `posted: true` the suite fails loudly and says a real message just went out,
   because silently passing there would mean the guard had stopped working and
   nobody would know until the next run.

   ---------------------------------------------------------------------------
   WHAT IS PROVED
   ---------------------------------------------------------------------------
     1  a working day with no closure is NOT skipped — it reaches the Slack
        step. THE ACCEPTANCE HALF, and it comes first: "it skipped" is
        compatible with a gate that skips everything.
     2  the SAME day with a CONFIRMED closure IS skipped, returns 200, and
        never reaches Slack. The two cases differ by one row.
     3  the skip writes a heartbeat — ran_at moves — so a quiet Saturday is
        distinguishable from a cron that stopped running (0108).
     4  the skip leaves `posted_at` UNCHANGED, which is what makes Monday's
        post cover the weekend.
     5  a DISMISSED closure does not suppress anything — 0101 keeps the row.
     6  an UNRULED proposal does not suppress the post, and lands on the
        heartbeat as `unruled_closure` so the hole is visible.
     7  ?preview_at reports a Saturday as skipped and writes NOTHING — ran_at
        does not move, so a preview cannot corrupt the window.
     8  storeDateOf() and SQL's rooftop_today() agree about the store's date.
        Two systems, one quantity, reconciled rather than assumed.

   ---------------------------------------------------------------------------
   RUN IT AGAINST LOCAL. IT WRITES, AND IT NEEDS A DEV SERVER.
   ---------------------------------------------------------------------------
     NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321 \
     NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon> \
     SUPABASE_SERVICE_ROLE_KEY=<local service> \
     CRON_SECRET=local-test-secret SLACK_ROLLCALL_WEBHOOK= npm run dev

     SB_URL=http://127.0.0.1:55321 SB_KEY=<local service> \
     APP_URL=http://127.0.0.1:3000 CRON_SECRET=local-test-secret \
     SLACK_ROLLCALL_WEBHOOK= npm run accept:rollcall-cron
   ============================================================================ */

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { storeDateOf, weekdayName, isWeekend } from "@/lib/store-day";

const URL_ = process.env.SB_URL!;
const KEY = process.env.SB_KEY!;
const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
const SECRET = process.env.CRON_SECRET!;

if (!URL_ || !KEY || !SECRET) {
  console.error("\n  need SB_URL, SB_KEY and CRON_SECRET\n");
  process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(URL_) || !/127\.0\.0\.1|localhost/.test(APP)) {
  console.error("REFUSING to run against anything but local — this writes.");
  process.exit(1);
}
/* Guard 1. Same shell launches the dev server, so catching it here catches it
   there — and the alternative is finding out from the #ediagd channel. */
if (process.env.SLACK_ROLLCALL_WEBHOOK) {
  console.error(
    "\n  REFUSING: SLACK_ROLLCALL_WEBHOOK is set in this shell.\n" +
      "  Launch the dev server and this suite with SLACK_ROLLCALL_WEBHOOK= so a\n" +
      "  test run cannot post into the real channel.\n"
  );
  process.exit(1);
}

const sb = createClient(URL_, KEY, { auth: { persistSession: false } });
const TAG = `rollcron-${randomUUID().slice(0, 6)}`;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(label: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`    ✓ ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? `\n        ${detail}` : ""}`);
    console.log(`    ✗ ${label}${detail ? `  — ${detail}` : ""}`);
  }
}
const section = (t: string) => console.log(`\n${t}`);

type RouteBody = Record<string, unknown>;

async function hit(params: string): Promise<{ status: number; body: RouteBody }> {
  const res = await fetch(`${APP}/api/cron/rollcall?${params}`, {
    headers: { authorization: `Bearer ${SECRET}` },
  });
  return { status: res.status, body: (await res.json()) as RouteBody };
}

async function heartbeat(): Promise<{ ran_at: string; detail: RouteBody } | null> {
  const { data } = await sb
    .from("cron_heartbeat")
    .select("ran_at, detail")
    .eq("job", "rollcall")
    .maybeSingle();
  return (data as { ran_at: string; detail: RouteBody } | null) ?? null;
}

const madeUsers: string[] = [];

async function main() {
  /* ---- Fixtures ---------------------------------------------------------- */
  const { data: org, error: orgErr } = await sb
    .from("org")
    .insert({ name: `${TAG} Org` })
    .select("id")
    .single();
  if (orgErr) throw new Error(`org: ${orgErr.message}`);

  const { data: roof, error: roofErr } = await sb
    .from("rooftop")
    .insert({ name: `${TAG} Store`, org_id: org!.id, timezone: "America/Chicago" })
    .select("id")
    .single();
  if (roofErr) throw new Error(`rooftop: ${roofErr.message}`);
  const rooftopId = roof!.id as string;

  /* One advisor, so the message has something to say and the roll is not the
     degenerate empty case. */
  {
    const email = `${TAG}-advisor@example.com`;
    const { data, error } = await sb.auth.admin.createUser({
      email,
      password: "Fixture-passw0rd!",
      email_confirm: true,
    });
    if (error) throw new Error(`createUser: ${error.message}`);
    const id = data.user!.id;
    madeUsers.push(id);
    await sb.from("app_user").upsert({ id, full_name: `${TAG} advisor` });
    const { error: mErr } = await sb
      .from("membership")
      .insert({ user_id: id, rooftop_id: rooftopId, role: "advisor", active: true });
    if (mErr) throw new Error(`membership: ${mErr.message}`);
  }

  /* ---- The store's today, by BOTH routes -------------------------------- */
  section("0. The store's date, from two systems");

  const localDate = storeDateOf(new Date(), "America/Chicago");
  const { data: sqlToday, error: todayErr } = await sb.rpc("rooftop_today", {
    _rooftop: rooftopId,
  });
  if (todayErr) throw new Error(`rooftop_today: ${todayErr.message}`);

  /*
   * THE RECONCILIATION lib/store-day.ts's header promises.
   *
   * `rooftop_closed_day.closed_on` is defined against rooftop_today() — 0101
   * says so — and the route looks the row up with a date computed in
   * TypeScript. Two systems, one quantity. If they ever disagreed the route
   * would look up the wrong day's closure and post on a holiday, with nothing
   * erroring, which is this codebase's most expensive shape of bug.
   */
  ok(
    `storeDateOf and SQL rooftop_today agree: ${localDate}`,
    localDate === sqlToday,
    `TypeScript says ${localDate}, Postgres says ${sqlToday}`
  );

  /*
   * A WEEKEND RUN WOULD MAKE CASES 1-2 MEANINGLESS, so it fails rather than
   * passing quietly. The weekend rule itself is covered by
   * test:rollcall-schedule and by the preview case below, neither of which
   * needs today to be anything in particular.
   */
  if (isWeekend(localDate)) {
    console.error(
      `\n  REFUSING: today is ${weekdayName(localDate)} at the store.\n` +
        `  Cases 1-2 need a working day — the weekday rule would skip them both\n` +
        `  and the suite would go green having tested nothing. Run on a weekday.\n`
    );
    process.exit(1);
  }
  console.log(`    (today at the store is ${weekdayName(localDate)} ${localDate})`);

  /* A known posted_at to watch. Seeded directly so the assertions below are
     about a value this suite chose rather than whatever a previous run left. */
  const SEEDED_POSTED_AT = "2026-01-02T22:30:00.000Z";
  await sb.rpc("note_cron_run", {
    _job: "rollcall",
    _detail: { posted: true, posted_at: SEEDED_POSTED_AT, seeded_by: TAG },
  });

  /* ======================================================================
     1. THE ACCEPTANCE. A working day with no closure is NOT skipped.
     ====================================================================== */
  section("1. A working day with no closure posts — the acceptance half, first");

  const before1 = await heartbeat();
  const open = await hit(`rooftop=${rooftopId}`);

  /* Guard 2's assertion. If this is ever true a real message went out. */
  ok(
    "it did NOT post — the webhook is empty, so nothing reached Slack",
    open.body.posted === false,
    "posted: true — A MESSAGE WAS SENT. Relaunch the dev server with SLACK_ROLLCALL_WEBHOOK= before re-running."
  );
  ok(
    "and it was NOT skipped: it got all the way to the Slack step and reported no_url",
    open.body.skipped === undefined && open.body.reason === "no_url",
    `status=${open.status} body=${JSON.stringify(open.body)}`
  );
  ok(
    "the heartbeat records the store's date and weekday it judged",
    open.body.local_date === localDate && open.body.weekday === weekdayName(localDate),
    `${open.body.local_date} ${open.body.weekday}`
  );
  ok(
    "no closure, so nothing is flagged as unruled",
    open.body.unruled_closure === null,
    JSON.stringify(open.body.unruled_closure)
  );
  ok(
    "and posted_at is still the seeded value, because Slack refused",
    (await heartbeat())?.detail.posted_at === SEEDED_POSTED_AT,
    `${(await heartbeat())?.detail.posted_at}`
  );
  void before1;

  /* ======================================================================
     2. THE REFUSAL. The same day, one row different.
     ====================================================================== */
  section("2. A CONFIRMED closure on that same day skips it");

  {
    const { error } = await sb.from("rooftop_closed_day").insert({
      rooftop_id: rooftopId,
      closed_on: localDate,
      label: "Fixture Holiday",
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    });
    if (error) throw new Error(`closure fixture: ${error.message}`);
  }

  const beforeSkip = await heartbeat();
  const closed = await hit(`rooftop=${rooftopId}`);

  ok(
    "200, not 502 — the job ran and correctly declined; it is not a failure",
    closed.status === 200,
    `status ${closed.status}`
  );
  ok(
    "skipped: closed",
    closed.body.posted === false && closed.body.skipped === "closed",
    JSON.stringify(closed.body)
  );
  ok(
    "the reason names the holiday, so the channel's silence is explicable",
    String(closed.body.reason).includes("Fixture Holiday"),
    String(closed.body.reason)
  );
  ok(
    "it never reached Slack — the reason is the decision, not `no_url`",
    closed.body.reason !== "no_url",
    String(closed.body.reason)
  );

  const afterSkip = await heartbeat();
  ok(
    "a heartbeat WAS written — ran_at moved, so a quiet day is not a dead cron (0108)",
    afterSkip !== null &&
      beforeSkip !== null &&
      new Date(afterSkip.ran_at).getTime() > new Date(beforeSkip.ran_at).getTime(),
    `before=${beforeSkip?.ran_at} after=${afterSkip?.ran_at}`
  );
  ok(
    "and posted_at was NOT moved — this is what makes Monday's post cover the weekend",
    afterSkip?.detail.posted_at === SEEDED_POSTED_AT,
    `${afterSkip?.detail.posted_at} (expected the seeded ${SEEDED_POSTED_AT})`
  );
  ok(
    "`since` on the skip is the seeded instant, so the unreported window is carried forward",
    afterSkip?.detail.since === SEEDED_POSTED_AT,
    `${afterSkip?.detail.since}`
  );

  /* ======================================================================
     3. A DISMISSED closure is a decision the other way
     ====================================================================== */
  section("3. A dismissed closure suppresses nothing");

  {
    const { error } = await sb
      .from("rooftop_closed_day")
      .update({
        status: "proposed",
        confirmed_at: null,
        dismissed_at: new Date().toISOString(),
      })
      .eq("rooftop_id", rooftopId)
      .eq("closed_on", localDate);
    if (error) throw new Error(`dismiss fixture: ${error.message}`);
  }

  const dismissed = await hit(`rooftop=${rooftopId}`);
  ok(
    "the row is still there but dismissed, and the post is NOT skipped",
    dismissed.body.skipped === undefined && dismissed.body.reason === "no_url",
    JSON.stringify(dismissed.body)
  );
  ok(
    "nor is it flagged as unruled — somebody DID rule on it, by saying no",
    dismissed.body.unruled_closure === null,
    JSON.stringify(dismissed.body.unruled_closure)
  );

  /* ======================================================================
     4. An unruled proposal: posts, and says so
     ====================================================================== */
  section("4. An UNRULED proposal posts, and the hole is recorded");

  {
    const { error } = await sb
      .from("rooftop_closed_day")
      .update({ status: "proposed", confirmed_at: null, dismissed_at: null })
      .eq("rooftop_id", rooftopId)
      .eq("closed_on", localDate);
    if (error) throw new Error(`proposal fixture: ${error.message}`);
  }

  const unruled = await hit(`rooftop=${rooftopId}`);
  ok(
    "a proposal nobody confirmed does NOT suppress the post — a proposal is a question",
    unruled.body.skipped === undefined && unruled.body.reason === "no_url",
    JSON.stringify(unruled.body)
  );
  ok(
    "and the heartbeat carries unruled_closure, naming the day somebody has to rule on",
    (unruled.body.unruled_closure as { label?: string } | null)?.label === "Fixture Holiday",
    JSON.stringify(unruled.body.unruled_closure)
  );

  /* ======================================================================
     5. preview_at — answers, changes nothing
     ====================================================================== */
  section("5. ?preview_at reports a Saturday and writes nothing");

  const beforePreview = await heartbeat();
  /* 24 October 2026 is a Saturday. 18:00Z is the afternoon in Chicago, so the
     store's date is unambiguously that Saturday and not a midnight edge. */
  const preview = await hit(`rooftop=${rooftopId}&preview_at=2026-10-24T18:00:00Z`);

  ok(
    "it reports the Saturday as skipped, without waiting for one",
    preview.body.preview === true &&
      preview.body.due === false &&
      preview.body.skip === "weekend" &&
      preview.body.weekday === "Sat",
    JSON.stringify(preview.body)
  );
  ok(
    "and a weekday preview on the same rooftop reports due — so the preview is not a stuck 'no'",
    (await hit(`rooftop=${rooftopId}&preview_at=2026-10-23T18:00:00Z`)).body.due === true,
    "a Friday preview did not report due"
  );

  const afterPreview = await heartbeat();
  ok(
    "the preview wrote NOTHING — ran_at is untouched, so it cannot corrupt the window",
    afterPreview?.ran_at === beforePreview?.ran_at,
    `before=${beforePreview?.ran_at} after=${afterPreview?.ran_at}`
  );

  ok(
    "a malformed preview_at is refused without writing a heartbeat either",
    (await hit(`rooftop=${rooftopId}&preview_at=not-a-date`)).status === 400 &&
      (await heartbeat())?.ran_at === beforePreview?.ran_at,
    "a bad parameter moved the heartbeat"
  );

  /* ---- Cleanup --------------------------------------------------------- */
  await sb.from("rooftop_closed_day").delete().eq("rooftop_id", rooftopId);
  await sb.from("membership").delete().in("user_id", madeUsers);
  await sb.from("app_user").delete().in("id", madeUsers);
  for (const id of madeUsers) await sb.auth.admin.deleteUser(id);
  await sb.from("rooftop").delete().eq("id", rooftopId);
  await sb.from("org").delete().eq("id", org!.id);
  /* The heartbeat is shared state this suite overwrote. Put it back to
     something honest rather than leaving a fixture's posted_at behind. */
  await sb.rpc("note_cron_run", {
    _job: "rollcall",
    _detail: { posted: false, reason: `reset after ${TAG}`, posted_at: null },
  });
}

main()
  .then(() => {
    console.log("\n" + "=".repeat(64));
    console.log(`  ${passed} passed, ${failed} failed`);
    if (failed) {
      console.log("\nFailures:");
      for (const f of failures) console.log("  ✗ " + f);
    }
    console.log("=".repeat(64));
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error("\nSUITE ERROR:", e.message);
    process.exit(1);
  });
