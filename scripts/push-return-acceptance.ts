/* ============================================================================
   EDIAGD — push_return, proved as acceptances AND refusals

   0165 joins three records that had never been joined: what we decided to send,
   what Apple said about it, and whether the person came back. Two of those are
   about somebody's phone and one is a record ABOUT an advisor kept FOR the
   team, so who may read it is the feature and not a detail — and every claim
   below is asked OVER PostgREST AS THE ROLE THAT REALLY CALLS, never as the
   service role, which bypasses the thing under test.

   ---------------------------------------------------------------------------
   THE ACCEPTANCE HALF COMES FIRST, DELIBERATELY
   ---------------------------------------------------------------------------
   A refusal is not self-verifying. A suite that only asserted "an advisor reads
   nothing" would pass against a missing view, a failed login, a fixture that
   was never written, or a gate that achieved exclusion by making the relation
   unreadable to everybody. So section 1 proves the reads that MUST work and the
   NUMBERS they must produce, and every refusal afterwards is paired with the
   same query succeeding for somebody entitled to it.

   ---------------------------------------------------------------------------
   WHAT IS PROVED
   ---------------------------------------------------------------------------
     1  platform owner, admin and manager read their rooftop's deliveries, and
        the gap and the returned flag are the RIGHT VALUES — 52 minutes, true —
        not merely present
     2  the seven-day window: a return eight days later is null, not 11520
     3  a delivery Apple REFUSED is still a row, with Apple's reason, and is
        never credited with a return
     4  an advisor reads ZERO from push_return and from advisor_reachable,
        including about themselves
     5  a manager at another store reads zero of this one's — and does read
        their own, so the refusal is about scope and not a broken session
     6  THE SERVICE ROLE READS advisor_reachable. This is the branch that would
        silently make the 17:30 Slack post call every advisor unreachable, and
        a definer view gets no help from BYPASSRLS
     7  the token itself is not a column of advisor_reachable — the credential
        cannot be asked for
     8  device_push_token's own-read policy is untouched: an advisor still reads
        their own token row, and a manager still reads none
     9  loadRollcall reports Reachable and Last push correctly, including
        "no — never registered" for a tokenless advisor and the gap in minutes
        for one who came back
    10  the Slack line reads exactly "Pushes today: 1 sent, 1 delivered, 1 back
        within 24 h (100%)." for a real same-day send, is scoped to the store's
        today rather than the thirty-day window, and marks the advisor whose
        push Apple refused. The ZERO branch is proved too — a line that only
        ever printed zeroes would satisfy a test that only ever looked for them

   ---------------------------------------------------------------------------
   RUN IT AGAINST LOCAL. IT WRITES.
   ---------------------------------------------------------------------------
     export SB_URL=http://127.0.0.1:55321 \
            SB_KEY=<local service role> SB_ANON_KEY=<local anon>
     npm run accept:push-return

   PROVEN NON-VACUOUS: the result of running it with push_delivery_team_read
   dropped, and again with push_return made security_invoker = off, is recorded
   in reports/push-return.md. Both make section 1 or section 4 fail.
   ============================================================================ */

import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadRollcall } from "@/lib/rollcall";
import { buildRollcallMessage } from "@/lib/rollcall-message";

const URL = process.env.SB_URL!;
const KEY = process.env.SB_KEY!;
const ANON = process.env.SB_ANON_KEY!;

if (!URL || !KEY || !ANON) {
  console.error("\n  need SB_URL, SB_KEY and SB_ANON_KEY\n");
  process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(URL)) {
  console.error(`REFUSING to run against ${URL} — this suite writes. Local only.`);
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });
const TAG = `pushret-${randomUUID().slice(0, 6)}`;
const PASSWORD = "Fixture-passw0rd!";

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
function section(t: string) {
  console.log(`\n${t}`);
}

const madeUsers: string[] = [];

async function makeUser(
  label: string,
  rooftop: string,
  role: "advisor" | "manager" | "admin",
  options: { platformOwner?: boolean } = {}
): Promise<{ userId: string; membershipId: string }> {
  const email = `${TAG}-${label}@example.com`;
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${label}: ${error.message}`);
  const id = data.user!.id;
  madeUsers.push(id);
  await sb.from("app_user").upsert({
    id,
    full_name: `${TAG} ${label}`,
    is_platform_owner: options.platformOwner ?? false,
  });
  const { data: m, error: mErr } = await sb
    .from("membership")
    .insert({ user_id: id, rooftop_id: rooftop, role, active: true })
    .select("id")
    .single();
  if (mErr) throw new Error(`membership ${label}: ${mErr.message}`);
  return { userId: id, membershipId: m!.id as string };
}

async function signedInAs(userId: string): Promise<SupabaseClient> {
  const { data: u } = await sb.auth.admin.getUserById(userId);
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({
    email: u.user!.email!,
    password: PASSWORD,
  });
  if (error) throw new Error(`signIn: ${error.message}`);
  return client;
}

/** Store-local date, n days back, for a Chicago rooftop. */
function chicagoDate(daysBack = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

const iso = (d: Date) => d.toISOString();
const plusMinutes = (from: Date, m: number) => new Date(from.getTime() + m * 60000);

async function main() {
  /* ---- Fixtures: two rooftops, so "across rooftops" is a real boundary --- */
  const { data: org, error: orgErr } = await sb
    .from("org")
    .insert({ name: `${TAG} Org` })
    .select("id")
    .single();
  if (orgErr) throw new Error(`org: ${orgErr.message}`);

  const mkRooftop = async (n: string) => {
    const { data, error } = await sb
      .from("rooftop")
      .insert({ name: `${TAG} ${n}`, org_id: org!.id, timezone: "America/Chicago" })
      .select("id")
      .single();
    if (error) throw new Error(`rooftop: ${error.message}`);
    return data!.id as string;
  };
  const roofA = await mkRooftop("Store A");
  const roofB = await mkRooftop("Store B");

  const back = await makeUser("back", roofA, "advisor");
  const late = await makeUser("late", roofA, "advisor");
  const refused = await makeUser("refused", roofA, "advisor");
  const quiet = await makeUser("quiet", roofA, "advisor");
  const retired = await makeUser("retired", roofA, "advisor");
  /* A send TODAY, so the Slack line's NON-ZERO branch is exercised as well as
     its zero branch. Without this the suite would only ever have proven the
     "nothing went out" sentence — and the line Ryan asked for is the other one. */
  const todayAdv = await makeUser("today", roofA, "advisor");
  const managerA = await makeUser("managerA", roofA, "manager");
  const adminA = await makeUser("adminA", roofA, "admin");
  const managerB = await makeUser("managerB", roofB, "manager");
  const advisorB = await makeUser("advisorB", roofB, "advisor");
  const owner = await makeUser("owner", roofB, "advisor", { platformOwner: true });

  /* ---- Tokens. EVERY FIXTURE ERROR IS CHECKED --------------------------
     A suite that swallows its own setup errors is testing a state nobody
     established — rollcall-acceptance learned that by writing `mon` instead of
     `works_mon`, ignoring the 400, and then reporting "0 onboarded". */
  const mkToken = async (
    userId: string,
    opts: { retiredReason?: string } = {}
  ) => {
    const { error } = await sb.from("device_push_token").insert({
      user_id: userId,
      platform: "ios",
      token: `${TAG}-tok-${randomUUID()}`,
      retired_at: opts.retiredReason ? new Date().toISOString() : null,
      retired_reason: opts.retiredReason ?? null,
    });
    if (error) throw new Error(`token fixture: ${error.message}`);
  };
  for (const u of [back, late, refused, advisorB, todayAdv]) await mkToken(u.userId);
  await mkToken(retired.userId, { retiredReason: "Unregistered" });
  /* `quiet` gets nothing, on purpose — that is the Reachable: no case. */

  /* ---- The sends. One per advisor per store-day, by the index ------------ */
  const mkSend = async (
    who: { userId: string; membershipId: string },
    rooftopId: string,
    daysBack: number,
    status: "sent" | "skipped",
    skippedReason?: string
  ) => {
    const localDate = chicagoDate(daysBack);
    const { data, error } = await sb
      .from("notification_outbox")
      .insert({
        membership_id: who.membershipId,
        recipient_id: who.userId,
        rooftop_id: rooftopId,
        kind: "return",
        channel: "push",
        status,
        title: "Your Swell is here when you are",
        body: "Brakes is up today. About five minutes.",
        deep_link: "/today?opened_via=return",
        /* 12:00Z is 07:00 Chicago in October. The quiet-hours constraint only
           inspects local_time, which is set to 07:00 below. */
        scheduled_for: `${localDate}T12:00:00Z`,
        local_date: localDate,
        local_time: "07:00",
        rationale: `${TAG} fixture send`,
        dedup_key: `${TAG}:return:${who.userId}:${localDate}`,
        sent_at: status === "sent" ? `${localDate}T12:00:41Z` : null,
        skipped_reason: skippedReason ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(`outbox fixture: ${error.message}`);
    return data!.id as string;
  };

  const mkDelivery = async (
    outboxId: string,
    at: string,
    okFlag: boolean,
    reason?: string
  ) => {
    const { error } = await sb.from("push_delivery").insert({
      outbox_id: outboxId,
      token_tail: "ABC123",
      ok: okFlag,
      apns_status: okFlag ? 200 : 400,
      apns_reason: reason ?? null,
      at,
    });
    if (error) throw new Error(`delivery fixture: ${error.message}`);
  };

  /* --- The headline case: Ryan's question, as data ---------------------
     A return push delivered, and the advisor signs in 52 minutes later. */
  const backDate = chicagoDate(2);
  const backDeliveredAt = new Date(`${backDate}T12:00:41Z`);
  const backOutbox = await mkSend(back, roofA, 2, "sent");
  await mkDelivery(backOutbox, iso(backDeliveredAt), true);
  {
    const { error } = await sb.from("app_event").insert({
      user_id: back.userId,
      rooftop_id: roofA,
      kind: "signed_in",
      meta: { platform: "ios" },
      dedup_key: `${back.userId}:signed_in:${backDate}`,
      at: iso(plusMinutes(backDeliveredAt, 52)),
    });
    if (error) throw new Error(`signed_in fixture: ${error.message}`);
  }

  /* --- The late case: a touch EIGHT DAYS later, which is not a return --- */
  const lateDate = chicagoDate(12);
  const lateDeliveredAt = new Date(`${lateDate}T12:00:41Z`);
  const lateOutbox = await mkSend(late, roofA, 12, "sent");
  await mkDelivery(lateOutbox, iso(lateDeliveredAt), true);
  {
    const eightDaysOn = plusMinutes(lateDeliveredAt, 8 * 1440);
    const { error } = await sb.from("daily_activity").insert({
      user_id: late.userId,
      rooftop_id: roofA,
      activity_date: eightDaysOn.toISOString().slice(0, 10),
      logged_in: true,
      videos_watched: 0,
      created_at: iso(eightDaysOn),
    });
    if (error) throw new Error(`daily_activity fixture: ${error.message}`);
  }

  /* --- The refused case: Apple said no, so there is nothing to credit --- */
  const refusedDate = chicagoDate(2);
  const refusedDeliveredAt = new Date(`${refusedDate}T12:00:41Z`);
  const refusedOutbox = await mkSend(
    refused,
    roofA,
    2,
    "skipped",
    "apns: BadDeviceToken"
  );
  await mkDelivery(refusedOutbox, iso(refusedDeliveredAt), false, "BadDeviceToken");
  /*
   * AND A SIGN-IN AFTERWARDS ANYWAY, which is the trap this fixture exists for.
   * They opened the app 30 minutes later for their own reasons. A view that
   * computed a return for a delivery Apple REFUSED would credit the push with
   * it — the most flattering number the feature could produce, and entirely
   * false. The assertion in section 3 is that this is NOT counted.
   */
  {
    const { error } = await sb.from("app_event").insert({
      user_id: refused.userId,
      rooftop_id: roofA,
      kind: "signed_in",
      meta: { platform: "ios" },
      dedup_key: `${refused.userId}:signed_in:${refusedDate}`,
      at: iso(plusMinutes(refusedDeliveredAt, 30)),
    });
    if (error) throw new Error(`signed_in fixture (refused): ${error.message}`);
  }

  /* --- Today's send, delivered, back in 10 minutes --------------------- */
  const todayDate = chicagoDate(0);
  const todayDeliveredAt = new Date(`${todayDate}T12:00:41Z`);
  const todayOutbox = await mkSend(todayAdv, roofA, 0, "sent");
  await mkDelivery(todayOutbox, iso(todayDeliveredAt), true);
  {
    const { error } = await sb.from("app_event").insert({
      user_id: todayAdv.userId,
      rooftop_id: roofA,
      kind: "signed_in",
      meta: { platform: "ios" },
      dedup_key: `${todayAdv.userId}:signed_in:${todayDate}`,
      at: iso(plusMinutes(todayDeliveredAt, 10)),
    });
    if (error) throw new Error(`signed_in fixture (today): ${error.message}`);
  }

  /* --- The other store, so a cross-rooftop leak has something to leak --- */
  const bDate = chicagoDate(1);
  const bOutbox = await mkSend(advisorB, roofB, 1, "sent");
  await mkDelivery(bOutbox, `${bDate}T12:00:41Z`, true);

  /* ======================================================================
     1. THE ACCEPTANCES, AND THE VALUES — not merely "some rows came back"
     ====================================================================== */
  section("1. The team reads it, and the numbers are right");

  const ownerC = await signedInAs(owner.userId);
  const adminC = await signedInAs(adminA.userId);
  const managerAC = await signedInAs(managerA.userId);
  const managerBC = await signedInAs(managerB.userId);
  const backC = await signedInAs(back.userId);

  type Row = {
    outbox_id: string;
    user_id: string;
    delivered_ok: boolean;
    apns_reason: string | null;
    return_gap_minutes: number | null;
    return_source: string | null;
    returned: boolean;
  };
  const readPushReturn = async (client: SupabaseClient, rooftopId: string) => {
    const { data, error } = await client
      .from("push_return")
      .select(
        "outbox_id, user_id, delivered_ok, apns_reason, return_gap_minutes, return_source, returned"
      )
      .eq("rooftop_id", rooftopId);
    return { rows: (data ?? []) as Row[], error: error?.message ?? null };
  };

  const ownerRows = await readPushReturn(ownerC, roofA);
  ok(
    "platform owner reads all four of rooftop A's deliveries",
    ownerRows.rows.length === 4,
    `got ${ownerRows.rows.length}${ownerRows.error ? ` (${ownerRows.error})` : ""}`
  );

  const adminRows = await readPushReturn(adminC, roofA);
  ok(
    "admin at A reads A's deliveries",
    adminRows.rows.length === 4,
    `got ${adminRows.rows.length}${adminRows.error ? ` (${adminRows.error})` : ""}`
  );

  /*
   * THE MANAGER IS THE ASSERTION THAT MATTERS MOST IN THIS SECTION.
   * push_delivery's only policy before 0165 was `using (is_platform_owner())`,
   * so without the team policy this returns zero — a gate keyed on a role that
   * excludes the viewer the view exists to serve, which is the single most
   * repeated defect in this codebase.
   */
  const mgrRows = await readPushReturn(managerAC, roofA);
  ok(
    "MANAGER at A reads A's deliveries — the view exists for them, and push_delivery was owner-only before 0165",
    mgrRows.rows.length === 4,
    `got ${mgrRows.rows.length}${mgrRows.error ? ` (${mgrRows.error})` : ""}`
  );

  const backRow = mgrRows.rows.find((r) => r.user_id === back.userId);
  ok(
    "the gap is 52 minutes — the value, not just a non-null",
    backRow?.return_gap_minutes === 52,
    `got ${backRow?.return_gap_minutes}`
  );
  ok(
    "and it is attributed to signed_in, which is the earliest of the three records",
    backRow?.return_source === "signed_in",
    `got ${backRow?.return_source}`
  );
  ok(
    "52 minutes is inside 24 hours, so returned is true",
    backRow?.returned === true,
    `got ${backRow?.returned}`
  );

  /* ======================================================================
     2. THE SEVEN-DAY WINDOW
     ====================================================================== */
  section("2. A touch eight days later is not a return");

  const lateRow = mgrRows.rows.find((r) => r.user_id === late.userId);
  ok(
    "delivered, but the only activity is 8 days on — gap is NULL, not 11520",
    lateRow !== undefined &&
      lateRow.delivered_ok === true &&
      lateRow.return_gap_minutes === null,
    `delivered_ok=${lateRow?.delivered_ok} gap=${lateRow?.return_gap_minutes}`
  );
  ok(
    "and returned is false",
    lateRow?.returned === false,
    `got ${lateRow?.returned}`
  );

  /* ======================================================================
     3. A REFUSED DELIVERY IS NEVER CREDITED WITH A RETURN
     ====================================================================== */
  section("3. Apple refused it, and the sign-in 30 min later is not credited");

  const refusedRow = mgrRows.rows.find((r) => r.user_id === refused.userId);
  ok(
    "the refused delivery is STILL A ROW — 'sent but not delivered' must be visible",
    refusedRow !== undefined,
    "the row is missing, so a failed send is invisible on the one screen that asks why nobody came back"
  );
  ok(
    "it carries Apple's own reason",
    refusedRow?.apns_reason === "BadDeviceToken",
    `got ${refusedRow?.apns_reason}`
  );
  ok(
    "the sign-in 30 minutes later is NOT counted — gap null, returned false",
    refusedRow?.return_gap_minutes === null && refusedRow?.returned === false,
    `gap=${refusedRow?.return_gap_minutes} returned=${refusedRow?.returned} — a push Apple refused was credited with a return`
  );

  /* ======================================================================
     4. THE ADVISOR READS NOTHING
     ====================================================================== */
  section("4. An advisor reads nothing, including about themselves");

  const advisorRows = await readPushReturn(backC, roofA);
  ok(
    "advisor reads ZERO of push_return at their own rooftop",
    advisorRows.rows.length === 0,
    `got ${advisorRows.rows.length}`
  );

  const { data: advisorOwn } = await backC
    .from("push_return")
    .select("outbox_id")
    .eq("user_id", back.userId);
  ok(
    "advisor reads ZERO of their OWN delivery asked for by user id",
    (advisorOwn ?? []).length === 0,
    `got ${(advisorOwn ?? []).length}`
  );

  const { data: advisorReach } = await backC
    .from("advisor_reachable")
    .select("user_id, reachable");
  ok(
    "advisor reads ZERO of advisor_reachable",
    (advisorReach ?? []).length === 0,
    `got ${(advisorReach ?? []).length} — the definer view's WHERE clause is not gating`
  );

  /*
   * NON-VACUOUS, AND THIS IS THE PAIR THAT MAKES THE THREE ABOVE MEAN ANYTHING.
   * The same client, signed in, reading something it IS entitled to. If this
   * failed too, the refusals above would only be proving that the login broke.
   */
  const { data: advisorOwnToken, error: aotErr } = await backC
    .from("device_push_token")
    .select("id, platform")
    .eq("user_id", back.userId);
  ok(
    "the same advisor session DOES read their own device_push_token row — so the refusals are about scope, not a dead session",
    (advisorOwnToken ?? []).length === 1,
    `got ${(advisorOwnToken ?? []).length}${aotErr ? ` (${aotErr.message})` : ""}`
  );

  /* ======================================================================
     5. NOBODY READS ACROSS ROOFTOPS
     ====================================================================== */
  section("5. A manager at another store reads none of this one's");

  const mgrBAtA = await readPushReturn(managerBC, roofA);
  ok(
    "manager at B reads ZERO of A's deliveries",
    mgrBAtA.rows.length === 0,
    `got ${mgrBAtA.rows.length}`
  );

  const mgrBAtB = await readPushReturn(managerBC, roofB);
  ok(
    "the same manager DOES read their own store's — scope, not a broken session",
    mgrBAtB.rows.length === 1,
    `got ${mgrBAtB.rows.length}`
  );

  const { data: mgrBReach } = await managerBC
    .from("advisor_reachable")
    .select("user_id")
    .eq("user_id", back.userId);
  ok(
    "manager at B reads nothing about an advisor at A through advisor_reachable",
    (mgrBReach ?? []).length === 0,
    `got ${(mgrBReach ?? []).length}`
  );

  /* ======================================================================
     6. THE SERVICE ROLE. THE BRANCH THAT WOULD BREAK SLACK SILENTLY.
     ====================================================================== */
  section("6. The service role reads both — a definer view gets no help from BYPASSRLS");

  const { data: svcReach, error: svcReachErr } = await sb
    .from("advisor_reachable")
    .select("user_id, reachable, live_platforms")
    .in("user_id", [back.userId, quiet.userId, retired.userId]);
  ok(
    "service_role reads advisor_reachable — without the explicit branch the 17:30 post would call every advisor unreachable",
    (svcReach ?? []).length === 2,
    `got ${(svcReach ?? []).length}${svcReachErr ? ` (${svcReachErr.message})` : ""} — expected 2 rows (back, retired); quiet has no token row at all`
  );
  const svcBack = (svcReach ?? []).find(
    (r) => (r as { user_id: string }).user_id === back.userId
  ) as { reachable: boolean; live_platforms: string[] } | undefined;
  ok(
    "and it says reachable, on ios",
    svcBack?.reachable === true && (svcBack?.live_platforms ?? []).includes("ios"),
    `got reachable=${svcBack?.reachable} platforms=${JSON.stringify(svcBack?.live_platforms)}`
  );

  const { data: svcPush, error: svcPushErr } = await sb
    .from("push_return")
    .select("outbox_id, user_id, return_gap_minutes, returned")
    .eq("rooftop_id", roofA);
  ok(
    "service_role reads push_return — the Slack pushes line depends on it",
    (svcPush ?? []).length === 4,
    `got ${(svcPush ?? []).length}${svcPushErr ? ` (${svcPushErr.message})` : ""}`
  );

  /*
   * ---- THE ASSERTION THAT CAUGHT THE REAL BUG IN THIS MIGRATION ----------
   *
   * The row count above passed on the first version of 0165 and told us
   * nothing: push_return's rows come from push_delivery, which the service role
   * reaches by BYPASSRLS. The RETURN COLUMNS come from first_return_after,
   * which is SECURITY DEFINER — gated by its own WHERE clause, where BYPASSRLS
   * counts for nothing and auth.uid() is null. It returned zero rows for every
   * service-role call, so every gap was NULL.
   *
   * What that ships: the 17:30 post says "0 back within 24 h" every evening,
   * forever, with a 200 and no error, while the same view on the screen shows
   * the real figure. The rows being present is exactly why it would have
   * survived.
   *
   * So the service role must agree with the MANAGER about the same row, value
   * for value. Two routes to one quantity, reconciled — which is the only
   * thing that makes either trustworthy.
   */
  const svcBackRow = (svcPush ?? []).find(
    (r) => (r as { user_id: string }).user_id === back.userId
  ) as { return_gap_minutes: number | null; returned: boolean } | undefined;
  ok(
    "and the service role sees the SAME 52-minute gap the manager sees — not nulls, which is what a definer function with no service_role branch returns",
    svcBackRow?.return_gap_minutes === 52 && svcBackRow?.returned === true,
    `service role got gap=${svcBackRow?.return_gap_minutes} returned=${svcBackRow?.returned}; the manager got gap=${backRow?.return_gap_minutes}`
  );

  /* ======================================================================
     7. THE CREDENTIAL CANNOT BE ASKED FOR
     ====================================================================== */
  section("7. advisor_reachable has no token column");

  const { error: tokenErr } = await adminC
    .from("advisor_reachable")
    .select("user_id, token")
    .limit(1);
  ok(
    "selecting `token` from advisor_reachable is an ERROR — the column does not exist, so no caller can request it",
    tokenErr !== null,
    "the select succeeded, which means the credential is reachable through the view"
  );

  /* The pair: the same client reading the columns that SHOULD be there. A
     refusal proven by a query that was broken anyway proves nothing. */
  const { data: reachOkRows, error: reachOkErr } = await adminC
    .from("advisor_reachable")
    .select("user_id, reachable, live_platforms, last_retired_reason")
    .eq("user_id", retired.userId);
  ok(
    "and the same admin client DOES read the non-credential columns, with the retirement reason",
    (reachOkRows ?? []).length === 1 &&
      (reachOkRows![0] as { reachable: boolean }).reachable === false &&
      (reachOkRows![0] as { last_retired_reason: string }).last_retired_reason ===
        "Unregistered",
    `got ${JSON.stringify(reachOkRows)}${reachOkErr ? ` (${reachOkErr.message})` : ""}`
  );

  /* ======================================================================
     8. 0056's OWN-READ ON THE TOKEN TABLE IS UNTOUCHED
     ====================================================================== */
  section("8. device_push_token did not get wider");

  const { data: mgrTokens } = await managerAC
    .from("device_push_token")
    .select("id")
    .eq("user_id", back.userId);
  ok(
    "a MANAGER still reads none of their advisor's token rows — advisor_reachable exists precisely so this did not have to change",
    (mgrTokens ?? []).length === 0,
    `got ${(mgrTokens ?? []).length} — a team policy was added to device_push_token and the raw token is now exposed`
  );

  /* ======================================================================
     9. loadRollcall — the screen's own numbers
     ====================================================================== */
  section("9. loadRollcall reports Reachable and Last push");

  const rollcall = await loadRollcall(sb, roofA);
  const rowOf = (id: string) => rollcall.rows.find((r) => r.userId === id);

  ok(
    "the roll covers all six advisors at A",
    rollcall.rows.length === 6,
    `got ${rollcall.rows.length}`
  );
  ok(
    "the advisor who came back reads reachable, on ios, with a 52-minute gap on their last push",
    rowOf(back.userId)?.reach?.reachable === true &&
      rowOf(back.userId)?.reach?.livePlatforms.includes("ios") === true &&
      rowOf(back.userId)?.lastPush?.returnGapMinutes === 52 &&
      rowOf(back.userId)?.lastPush?.returned === true,
    JSON.stringify({
      reach: rowOf(back.userId)?.reach,
      lastPush: rowOf(back.userId)?.lastPush,
    })
  );
  ok(
    "the advisor with NO token reads Reachable: no, and has no last push",
    rowOf(quiet.userId)?.reach === null && rowOf(quiet.userId)?.lastPush === null,
    JSON.stringify({ reach: rowOf(quiet.userId)?.reach, lastPush: rowOf(quiet.userId)?.lastPush })
  );
  ok(
    "the advisor whose token was retired reads NOT reachable, with the reason — which is a different problem from never having registered",
    rowOf(retired.userId)?.reach?.reachable === false &&
      rowOf(retired.userId)?.reach?.lastRetiredReason === "Unregistered",
    JSON.stringify(rowOf(retired.userId)?.reach)
  );
  ok(
    "the refused send shows as not delivered, with Apple's reason, and not as a return",
    rowOf(refused.userId)?.lastPush?.deliveredOk === false &&
      rowOf(refused.userId)?.lastPush?.apnsReason === "BadDeviceToken" &&
      rowOf(refused.userId)?.lastPush?.returned === false,
    JSON.stringify(rowOf(refused.userId)?.lastPush)
  );

  /* The tally, at MESSAGE grain. Three sends, two Apple accepted, one came
     back inside 24 h. */
  ok(
    "the Pushes line counts 4 sent, 3 delivered, 2 back — message grain, not device grain",
    rollcall.pushes.sent === 4 &&
      rollcall.pushes.delivered === 3 &&
      rollcall.pushes.returned === 2 &&
      rollcall.pushes.failedDeliveries === 1,
    JSON.stringify(rollcall.pushes)
  );
  ok(
    "the return rate is 2/3 = 67%, over DELIVERED messages and not over the four sent",
    rollcall.pushes.rate !== null && Math.round(rollcall.pushes.rate * 100) === 67,
    `got ${rollcall.pushes.rate}`
  );
  ok(
    "2 of 6 advisors are unreachable — the number that explains a low send count",
    rollcall.unreachable === 2,
    `got ${rollcall.unreachable}`
  );
  ok(
    "nothing leaked from the other store — advisorB's send is not in A's tally",
    !rollcall.rows.some((r) => r.userId === advisorB.userId),
    "the other rooftop's advisor is in the roll"
  );

  /* ======================================================================
     10. THE SLACK LINE
     ====================================================================== */
  section("10. The Slack line");

  const message = buildRollcallMessage({
    rollcall,
    rooftopName: `${TAG} Store A`,
    timezone: "America/Chicago",
    now: new Date(),
    since: null,
    changes: new Map(),
  });

  const lines = message.text.split("\n");
  const pushLine = lines.find((l) => l.startsWith("Pushes today:"));
  ok(
    "there IS a Pushes line",
    pushLine !== undefined,
    `lines:\n${lines.slice(0, 6).join("\n")}`
  );
  /* THE LINE RYAN ASKED FOR, VERBATIM — one send today, Apple accepted it, and
     the advisor was back in ten minutes. This is the acceptance half; the zero
     branch is proved separately below, because a line that only ever printed
     zeroes would pass a test that only ever checked for zeroes. */
  ok(
    'the non-zero line reads "Pushes today: 1 sent, 1 delivered, 1 back within 24 h"',
    pushLine === "Pushes today: 1 sent, 1 delivered, 1 back within 24 h (100%).",
    `got ${JSON.stringify(pushLine)}`
  );
  ok(
    "today's tally is scoped to the store's today — the three older sends are not in it",
    rollcall.pushesToday?.sent === 1 && rollcall.pushesToday?.returned === 1,
    JSON.stringify(rollcall.pushesToday)
  );
  ok(
    "the advisor whose push Apple refused is marked on their line",
    lines.some((l) => l.includes(`${TAG} refused`) && l.includes(":warning:")),
    "no warning marker on the refused advisor's bullet"
  );
  ok(
    "and the reason is on a continuation line, so the six facts keep their fixed positions",
    lines.some((l) => l.trim().startsWith("↳ push failed: BadDeviceToken")),
    `continuations:\n${lines.filter((l) => l.includes("↳")).join("\n")}`
  );
  /* The fixed order is the message's one hard requirement, and the warning
     marker sits BEFORE the facts so it cannot move any of them.

     ASSERTED AS ORDERED POSITIONS rather than as one regex. A regex over six
     fields with five separators fails for reasons that have nothing to do with
     the claim — the first attempt at this rejected a correct line because
     "0 mornings · Certs" has one space where the pattern wanted two — and a
     test that fails on its own punctuation gets relaxed rather than read. */
  const bullets = lines.filter((l) => l.startsWith("• *"));
  const SIX = ["phone ", "pw ", "onboarded ", "morning", "Certs ", "outside the morning"];
  ok(
    "every advisor line carries all six facts in the fixed order, marker or not",
    bullets.length === 6 &&
      bullets.every((line) => {
        let cursor = 0;
        for (const marker of SIX) {
          const at = line.indexOf(marker, cursor);
          if (at === -1) return false;
          cursor = at + marker.length;
        }
        return true;
      }),
    `bullets:\n${bullets.join("\n")}`
  );

  /*
   * ---- AND THE ZERO BRANCH, WHICH IS THE ONE THAT RUNS ON MOST DAYS -------
   *
   * buildRollcallMessage is pure, so the quiet day can be asked for directly
   * instead of waiting for one. Both branches are tested because they are
   * genuinely different sentences and the wrong one shipping is invisible: a
   * line that printed "0 sent" and stopped would read, on a rollout week, as
   * advisors ignoring us rather than as nobody being reachable.
   */
  const quietDay = buildRollcallMessage({
    rollcall: {
      ...rollcall,
      pushesToday: { ...rollcall.pushesToday!, sent: 0, delivered: 0, returned: 0, rate: null },
    },
    rooftopName: `${TAG} Store A`,
    timezone: "America/Chicago",
    now: new Date(),
    since: null,
    changes: new Map(),
  });
  const quietLine = quietDay.text.split("\n").find((l) => l.startsWith("Pushes today:"));
  ok(
    "on a day with no sends the line STILL PRINTS — silence cannot be told apart from the cron not running (0108)",
    quietLine !== undefined,
    "the line vanished when the count was zero"
  );
  ok(
    "and it says how many are reachable instead of stopping at the zero, so '0 sent' is not read as indifference",
    quietLine?.includes("0 sent") === true && quietLine?.includes("reachable") === true,
    `got ${JSON.stringify(quietLine)}`
  );

  console.log(`\n  ---- the quiet-day line ----\n  | ${quietLine}`);
  console.log("\n  ---- the message, as it would be posted ----\n");
  console.log(
    message.text
      .split("\n")
      .map((l) => `  | ${l}`)
      .join("\n")
  );

  /* ======================================================================
     11. THE WHOLE CHAIN: A LAPSE, THE REAL GENERATOR, AND THE GAP ON SCREEN
     ======================================================================

     Everything above builds its outbox rows by hand, which proves the VIEW and
     says nothing about whether a lapsed advisor would ever have one. This
     section drives the real `generate_push_outbox` with the harness clock, so
     the thing under test is the chain Ryan described end to end:

       lapsed advisor  ->  generator selects them  ->  a return row exists
                       ->  Apple accepts it        ->  they sign in
                       ->  the Rollcall row reads the gap in minutes

     ---------------------------------------------------------------------
     THE ONE LINK THAT IS SIMULATED, AND IT IS SAID RATHER THAN HIDDEN
     ---------------------------------------------------------------------
     The APNs call itself. A test cannot reach Apple, and APNS_* is not
     configured locally — the cron's own deliver phase correctly reports "APNs
     not configured — rows queued, nothing sent" here. So the push_delivery row
     is written directly, exactly as app/api/cron/streak-saver/route.ts writes
     it from sendToTokens' result.

     That link is proven in PRODUCTION instead, which is stronger than a
     harness: four real `return` pushes were accepted by Apple at 200 on 5, 7, 9
     and 15 October, and three were followed by a real return. See
     reports/push-return-part-1-audit.md §5. What is proven HERE is everything
     either side of that one call.
     ====================================================================== */
  section("11. A lapse, the real generator, and the gap on the Rollcall row");

  const lapsed = await makeUser("lapsed", roofA, "advisor");
  await mkToken(lapsed.userId);

  /* The rooftop must be ENTITLED, or the Return branch never looks at anybody
     here — which is the first condition the Part 1 audit checks for Beaumont. */
  {
    const { error } = await sb
      .from("rooftop_product")
      .insert({ rooftop_id: roofA, product: "advisor_base", status: "active" });
    if (error) throw new Error(`rooftop_product fixture: ${error.message}`);
  }
  /* MAPPED TO AN OPERATOR. Return requires it, so an unmapped account is never
     re-engaged — and that is one of the two reasons Beaumont is silent. */
  {
    const { error } = await sb
      .from("membership")
      .update({ op_code_id: `${TAG}-op` })
      .eq("id", lapsed.membershipId);
    if (error) throw new Error(`op_code_id fixture: ${error.message}`);
  }
  /* A CONFIRMED SCHEDULE, every day, so the cadence arithmetic is unambiguous.
     Without schedule_set_at they could never lapse at all — check B of the
     Part 1 audit, and the reason five Beaumont advisors are unreachable by
     Return even if they get phones. */
  {
    const { error } = await sb.from("work_schedule").insert({
      user_id: lapsed.userId,
      works_mon: true,
      works_tue: true,
      works_wed: true,
      works_thu: true,
      works_fri: true,
      works_sun: true,
      saturday_mode: "every",
      schedule_set_at: new Date().toISOString(),
    });
    if (error) throw new Error(`work_schedule fixture: ${error.message}`);
  }
  /*
   * THE LAPSE. last_completed_on two days back, so with every day scheduled:
   *   previous_scheduled_day(today) = today - 1
   *   last_completed_on (today - 2) < today - 1       -> lapsed
   *   scheduled_days_since(today-2, today) = 2, minus 1 = miss index 1
   *   return_send_due(1, cadence) -> 1 % 2 = 1        -> due
   * which is the FIRST send of the sequence: "the next scheduled morning after
   * the first missed day", exactly as 0152's ruling states.
   *
   * current_len is left at 3 ON PURPOSE. It is the stale counter — it only
   * moves on a completion — and Return is specified never to trust it. If the
   * generator read it, this fixture would look like a live streak.
   */
  const overrideDate = chicagoDate(0);
  {
    const twoBack = chicagoDate(2);
    /* UPSERT, not insert: a swell row already exists by the time a membership
       does — something upstream creates it, and an insert here fails on the
       primary key. Found by this suite erroring rather than by reading. */
    const { error } = await sb.from("swell").upsert({
      user_id: lapsed.userId,
      current_len: 3,
      longest_len: 3,
      last_completed_on: twoBack,
    });
    if (error) throw new Error(`swell fixture: ${error.message}`);
  }

  /* Everything the generator might queue for OTHER rooftops is cleaned up
     afterwards, so this suite does not leave the local outbox dirty. Snapshot
     first — a delete by timestamp would also catch a concurrent run's rows. */
  const { data: beforeIds } = await sb.from("notification_outbox").select("id");
  const known = new Set(((beforeIds ?? []) as { id: string }[]).map((r) => r.id));

  /* 07:30 Chicago, inside the Return policy's 07:00–08:00 window. CDT in
     October, so -05:00. */
  const { data: generated, error: genErr } = await sb.rpc("generate_push_outbox", {
    _now_override: `${overrideDate}T07:30:00-05:00`,
  });
  ok(
    "generate_push_outbox runs as the service role and reports what it queued",
    genErr === null && generated !== null,
    `${genErr?.message ?? ""} ${JSON.stringify(generated)}`
  );

  const { data: queued, error: qErr } = await sb
    .from("notification_outbox")
    .select("id, kind, status, local_date, local_time, rationale, deep_link")
    .eq("recipient_id", lapsed.userId);
  const queuedRow = ((queued ?? []) as {
    id: string;
    kind: string;
    status: string;
    local_time: string;
    rationale: string;
    deep_link: string;
  }[])[0];

  ok(
    "THE REAL GENERATOR QUEUED A `return` FOR THE LAPSED ADVISOR — not a hand-built row",
    queuedRow?.kind === "return" && queuedRow?.status === "pending",
    `got ${JSON.stringify(queued)}${qErr ? ` (${qErr.message})` : ""}`
  );
  ok(
    "at 07:00 store-local, carrying the deep link whose opened_via tag this PR also fixed",
    queuedRow?.local_time === "07:00:00" &&
      queuedRow?.deep_link === "/today?opened_via=return",
    `local_time=${queuedRow?.local_time} deep_link=${queuedRow?.deep_link}`
  );
  ok(
    "and its rationale names the lapse it was decided from, not the stale current_len of 3",
    queuedRow?.rationale?.includes(chicagoDate(2)) === true &&
      queuedRow?.rationale?.includes("cadence due") === true,
    `got ${JSON.stringify(queuedRow?.rationale)}`
  );

  /* ---- The simulated APNs leg, written the way the cron writes it ------- */
  const lapsedDeliveredAt = new Date(`${overrideDate}T12:30:41Z`);
  await mkDelivery(queuedRow.id, iso(lapsedDeliveredAt), true);
  {
    const { error } = await sb
      .from("notification_outbox")
      .update({ status: "sent", sent_at: iso(lapsedDeliveredAt), device_count: 1 })
      .eq("id", queuedRow.id);
    if (error) throw new Error(`mark sent fixture: ${error.message}`);
  }
  /* And they come back. 41 minutes — a different number from the 52 above, so
     an assertion cannot pass by reading the wrong row. */
  {
    const { error } = await sb.from("app_event").insert({
      user_id: lapsed.userId,
      rooftop_id: roofA,
      kind: "signed_in",
      meta: { platform: "ios" },
      dedup_key: `${lapsed.userId}:signed_in:${overrideDate}`,
      at: iso(plusMinutes(lapsedDeliveredAt, 41)),
    });
    if (error) throw new Error(`signed_in fixture (lapsed): ${error.message}`);
  }

  const after = await loadRollcall(sb, roofA);
  const lapsedRow = after.rows.find((r) => r.userId === lapsed.userId);
  ok(
    "the Rollcall row reads the push and the return, with the gap in minutes",
    lapsedRow?.lastPush?.kind === "return" &&
      lapsedRow?.lastPush?.deliveredOk === true &&
      lapsedRow?.lastPush?.returnGapMinutes === 41 &&
      lapsedRow?.lastPush?.returned === true,
    JSON.stringify(lapsedRow?.lastPush)
  );
  ok(
    "and Reachable says yes, on ios",
    lapsedRow?.reach?.reachable === true &&
      lapsedRow?.reach?.livePlatforms.includes("ios") === true,
    JSON.stringify(lapsedRow?.reach)
  );
  console.log(
    `\n    Rollcall row, as rendered:\n` +
      `      Reachable   Yes · iOS\n` +
      `      Last push   return ${lapsedRow?.lastPush?.storeDate} · back in ${lapsedRow?.lastPush?.returnGapMinutes} min`
  );

  /* Anything the generator queued for rooftops this suite does not own. */
  const { data: afterIds } = await sb.from("notification_outbox").select("id, recipient_id");
  const strays = ((afterIds ?? []) as { id: string; recipient_id: string }[])
    .filter((r) => !known.has(r.id) && !madeUsers.includes(r.recipient_id))
    .map((r) => r.id);
  if (strays.length > 0) {
    await sb.from("notification_outbox").delete().in("id", strays);
    console.log(
      `\n    (cleaned up ${strays.length} row(s) the generator queued for other rooftops)`
    );
  }

  /* ---- Cleanup, unless the fixtures are wanted for a screenshot --------
     KEEP=1 leaves everything in place and prints how to sign in as the owner,
     so the screenshot is taken of the SAME data these assertions just checked
     rather than of a second fixture nobody verified. The teardown is otherwise
     unconditional — a suite that leaves rows behind by default makes the next
     run's numbers somebody else's problem. */
  if (process.env.KEEP === "1") {
    const { data: u } = await sb.auth.admin.getUserById(owner.userId);
    console.log(`
  ---- KEEP=1: fixtures left in place ----
    rooftop A       ${roofA}
    platform owner  ${u.user!.email}  /  ${PASSWORD}
    screen          /admin/engagement?rooftop=${roofA}

    Nothing was deleted. Re-run without KEEP to tear it down, or drop the org:
      delete from org where id = '${org!.id}';
`);
    return;
  }

  await sb.from("push_delivery").delete().eq("outbox_id", queuedRow.id);
  await sb.from("swell").delete().in("user_id", madeUsers);
  await sb.from("work_schedule").delete().in("user_id", madeUsers);
  await sb
    .from("rooftop_product")
    .delete()
    .eq("rooftop_id", roofA)
    .eq("product", "advisor_base");
  await sb
    .from("push_delivery")
    .delete()
    .in("outbox_id", [backOutbox, lateOutbox, refusedOutbox, todayOutbox, bOutbox]);
  await sb.from("notification_outbox").delete().in("recipient_id", madeUsers);
  await sb.from("app_event").delete().in("rooftop_id", [roofA, roofB]);
  await sb.from("daily_activity").delete().in("user_id", madeUsers);
  await sb.from("device_push_token").delete().in("user_id", madeUsers);
  await sb.from("membership").delete().in("user_id", madeUsers);
  await sb.from("app_user").delete().in("id", madeUsers);
  for (const id of madeUsers) await sb.auth.admin.deleteUser(id);
  await sb.from("rooftop").delete().in("id", [roofA, roofB]);
  await sb.from("org").delete().eq("id", org!.id);
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
