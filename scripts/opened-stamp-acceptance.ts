/* ============================================================================
   EDIAGD — mark_push_opened, proved over PostgREST as the roles that call it

   ---------------------------------------------------------------------------
   WHY NOT A UNIT TEST, AND WHY NOT psql
   ---------------------------------------------------------------------------
   The defect 0185 fixes was invisible to both.

   The migration applied cleanly in September. `psql` as `postgres` stamped the
   row every time, because superuser bypasses RLS. The function's SQL was
   correct, its predicate matched, and the only context in which it failed was
   the one nobody exercised: an ADVISOR, over PostgREST, with a real JWT. There
   `notification_outbox` has no UPDATE policy, the UPDATE matched zero rows,
   and the function returned `{"stamped": false}` for two months.

   So this suite does the one thing that would have caught it: signs two real
   advisors in, gets real access tokens, and calls the RPC the way the browser
   does. Nothing here reads a function definition — the broken version and the
   fixed one differ by one word and both parse.

   ---------------------------------------------------------------------------
   WHAT IT ASSERTS, AND WHY THE SECOND ONE IS NEW
   ---------------------------------------------------------------------------
     1. an advisor stamps their OWN reminder            -> stamped, row set
     2. the same call leaves ANOTHER advisor's alone    -> still null
     3. anon cannot execute it at all                   -> refused
     4. a second call is a no-op                        -> stamped false

   (2) only started mattering with 0185. While the function was `invoker`, the
   RLS that blocked everything also blocked cross-advisor writes as a side
   effect. `security definer` removes that accident, so `recipient_id =
   auth.uid()` now carries the load alone and gets its own case.

   (4) is the "an open is the first time they came back" rule: re-rendering
   /today must not keep moving the timestamp forward.

     SB_URL=... SB_KEY=<service> SB_ANON_KEY=<anon> npm run accept:opened-stamp
   ============================================================================ */

/*
 * A MODULE, NOT A GLOBAL SCRIPT, AND THE EMPTY EXPORT IS WHY.
 *
 * This file imports nothing — the subject is a database function reached over
 * HTTP. Without at least one import or export TypeScript treats it as a global
 * script, so its top-level `main` collided with `strip-curatorial-nuggets.ts`'s
 * and `tsc --noEmit` over the repo failed with "Duplicate function
 * implementation" in BOTH files. The sibling acceptance suites are modules by
 * accident of having imports; this one has to say so.
 */
export {};

const SB_URL = process.env.SB_URL;
const SB_KEY = process.env.SB_KEY;
const SB_ANON_KEY = process.env.SB_ANON_KEY;

if (!SB_URL || !SB_KEY || !SB_ANON_KEY) {
  console.log("\n  need SB_URL, SB_KEY and SB_ANON_KEY\n");
  process.exit(1);
}

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
    failures.push(
      `${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
    console.log(`  FAIL  ${name}`);
  }
}

type Json = Record<string, unknown>;

async function admin(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SB_URL}${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY!,
      authorization: `Bearer ${SB_KEY}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

/** Service-role SQL-ish helpers, through PostgREST so no psql is needed. */
async function insert(table: string, rows: Json | Json[]): Promise<Json[]> {
  const r = await admin(`/rest/v1/${table}`, {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(rows),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`insert ${table}: ${r.status} ${body}`);
  return JSON.parse(body) as Json[];
}

async function del(table: string, query: string): Promise<void> {
  await admin(`/rest/v1/${table}?${query}`, { method: "DELETE" });
}

async function selectOne(table: string, query: string): Promise<Json | null> {
  const r = await admin(`/rest/v1/${table}?${query}`);
  const rows = (await r.json()) as Json[];
  return rows[0] ?? null;
}

const stamp = Date.now();
const mail = (who: string) => `zz-t67-${who}-${stamp}@example.invalid`;
const PASSWORD = `zz-t67-Aa1!-${stamp}`;

async function makeAdvisor(
  who: string,
  rooftopId: string
): Promise<{ id: string; token: string }> {
  const created = await admin("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: mail(who),
      password: PASSWORD,
      email_confirm: true,
    }),
  });
  const user = (await created.json()) as { id?: string; msg?: string };
  if (!user.id) throw new Error(`createUser ${who}: ${JSON.stringify(user)}`);

  await insert("app_user", { id: user.id, full_name: `ZZ t67 ${who}` });
  await insert("membership", {
    user_id: user.id,
    rooftop_id: rooftopId,
    role: "advisor",
    active: true,
  });

  /* A REAL sign-in, because a hand-made JWT would not prove the claim shape
     PostgREST actually receives. */
  const signin = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SB_ANON_KEY!, "content-type": "application/json" },
    body: JSON.stringify({ email: mail(who), password: PASSWORD }),
  });
  const session = (await signin.json()) as { access_token?: string };
  if (!session.access_token) {
    throw new Error(`sign-in ${who}: ${JSON.stringify(session)}`);
  }
  return { id: user.id, token: session.access_token };
}

/** The RPC, called exactly as the /today render calls it. */
async function markOpened(
  bearer: string,
  kind = "streak_keeper"
): Promise<{ status: number; body: string }> {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/mark_push_opened`, {
    method: "POST",
    headers: {
      apikey: SB_ANON_KEY!,
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ _kind: kind }),
  });
  return { status: r.status, body: (await r.text()).trim() };
}

async function main() {
  console.log("\n  mark_push_opened — AS THE ROLES THAT CALL IT\n");

  const made: string[] = [];
  let rooftopId = "";

  try {
    const org = await selectOne("org", "select=id&limit=1");
    if (!org) throw new Error("no org row to hang a fixture rooftop off");

    const [roof] = await insert("rooftop", {
      org_id: org.id,
      name: `ZZ t67 Rooftop ${stamp}`,
      timezone: "America/Chicago",
    });
    rooftopId = roof.id as string;

    const a = await makeAdvisor("A", rooftopId);
    const b = await makeAdvisor("B", rooftopId);
    made.push(a.id, b.id);

    /* rooftop_today through the service role, so local_date matches what
       my_today() will compute for these advisors. */
    const todayRes = await admin("/rest/v1/rpc/rooftop_today", {
      method: "POST",
      body: JSON.stringify({ _rooftop: rooftopId }),
    });
    const storeToday = (await todayRes.text()).replace(/"/g, "").trim();

    for (const [who, person] of [
      ["A", a],
      ["B", b],
    ] as const) {
      const membership = await selectOne(
        "membership",
        `select=id&user_id=eq.${person.id}`
      );
      await insert("notification_outbox", {
        membership_id: membership!.id,
        recipient_id: person.id,
        rooftop_id: rooftopId,
        kind: "streak_keeper",
        channel: "push",
        status: "sent",
        title: `ZZ t67 ${who}`,
        body: "body",
        deep_link: "/today?opened_via=streak_saver",
        scheduled_for: new Date(Date.now() - 3_600_000).toISOString(),
        local_date: storeToday,
        local_time: "12:00",
        rationale: "ZZ t67 fixture",
        dedup_key: `zz-t67-${who}-${stamp}`,
        sent_at: new Date(Date.now() - 3_600_000).toISOString(),
        device_count: 1,
      });
    }

    const openedOf = async (id: string) =>
      (await selectOne(
        "notification_outbox",
        `select=opened_at&recipient_id=eq.${id}`
      ))?.opened_at ?? null;

    check("fixture: A starts unopened", await openedOf(a.id), null);
    check("fixture: B starts unopened", await openedOf(b.id), null);

    // ---- 1. An advisor stamps their own reminder --------------------------
    const first = await markOpened(a.token);
    check("A's call returns HTTP 200", first.status, 200);
    check(
      "A's own reminder is stamped — the whole point of 0185",
      first.body,
      '{"stamped": true}'
    );
    check("and opened_at is actually set on the row", (await openedOf(a.id)) !== null, true);

    // ---- 2. It does not reach anybody else's row --------------------------
    /* The only guard left once RLS is bypassed. There is no recipient
       parameter, so this is about the WHERE clause, not about input. */
    check(
      "B's reminder is untouched by A's call",
      await openedOf(b.id),
      null
    );

    // ---- 4. Once only -----------------------------------------------------
    const second = await markOpened(a.token);
    check(
      "a second call stamps nothing — an open is the FIRST return",
      second.body,
      '{"stamped": false}'
    );

    // ---- 3. anon may not call it at all -----------------------------------
    /* With the anon key as the bearer, PostgREST runs as `anon`. Before 0185
       the default PUBLIC EXECUTE grant made this reachable; it answered
       {"stamped": false} from the null-uid guard, which looks identical to a
       refusal and is not one. */
    const anon = await markOpened(SB_ANON_KEY!);
    /*
     * ASSERTED ON THE SQLSTATE, NOT ON THE HTTP STATUS.
     *
     * The first version of this check accepted 403 or 404 and failed against a
     * correctly-fixed function, because PostgREST maps a function-privilege
     * refusal to **401**. Pinning the HTTP code was testing PostgREST's
     * translation table; `42501 insufficient_privilege` is the thing actually
     * being claimed — that the refusal comes from the privilege system and not
     * from the `_uid is null` branch, which would answer 200 with
     * {"stamped": false} and look almost identical.
     */
    check(
      "anon is refused by privilege (42501), not by a guard inside the body",
      anon.body.includes('"42501"'),
      true
    );
    check(
      "and that refusal is an HTTP error rather than a 200 with stamped:false",
      anon.status >= 400,
      true
    );
    check("and B is still untouched afterwards", await openedOf(b.id), null);

    // ---- B can still stamp their own ---------------------------------------
    /* The acceptance half for the second advisor: a fix that worked by making
       the function refuse everybody would have passed every case above. */
    const bCall = await markOpened(b.token);
    check(
      "B can stamp their OWN reminder — the fix is not just a refusal",
      bCall.body,
      '{"stamped": true}'
    );
  } catch (error) {
    failed++;
    failures.push(`harness itself — ${error instanceof Error ? error.message : String(error)}`);
    console.log(`  FAIL  harness itself`);
  } finally {
    // ---- Teardown ---------------------------------------------------------
    for (const id of made) {
      await del("notification_outbox", `recipient_id=eq.${id}`);
      await del("user_notification_pref", `user_id=eq.${id}`);
      await del("membership", `user_id=eq.${id}`);
      await del("app_user", `id=eq.${id}`);
      await admin(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
    }
    if (rooftopId) await del("rooftop", `id=eq.${rooftopId}`);

    const strays = await selectOne(
      "app_user",
      `select=id&full_name=like.ZZ t67*`
    );
    if (strays) {
      failed++;
      failures.push("teardown left ZZ t67 rows behind");
      console.log("  FAIL  teardown left ZZ t67 rows behind");
    }
  }

  console.log(`\n  ${passed + failed} checks, ${failed} failed\n`);
  for (const line of failures) console.log(`  * ${line}`);
  if (failures.length) console.log("");
  process.exit(failed === 0 ? 0 : 1);
}

void main();
