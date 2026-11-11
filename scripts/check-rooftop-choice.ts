/* ============================================================================
   EDIAGD — the rooftop rule exists twice; assert the two agree

     SB_URL=http://127.0.0.1:55321 SB_KEY=<local service role> \
     SB_ANON_KEY=<local anon> npm run check:rooftop-choice

   ---------------------------------------------------------------------------
   WHY THIS EXISTS
   ---------------------------------------------------------------------------
   "Which rooftop does this record count against" is now decided in two places
   and has to be decided the same way:

     chooseRooftop()        lib/rooftop-choice.ts — completeLibraryItem and
                            completeDayAction, i.e. the COMPLETION
     choose_rooftop(uuid)   0181 — record_watch_progress, i.e. the WATCH PING
                            that precedes that completion by seconds

   If they drift, the row the player writes while a film is playing and the row
   the completion writes a moment later carry different rooftops for the same
   person on the same film. `team_videos_completed` filters on
   `content_progress.rooftop_id`, so one of the two becomes invisible on a
   manager's Team screen — no error, no empty state. That is the shape of the
   10 November report, one layer down.

   This is the same answer `check:gating` gives for `gating_content_types()` and
   `GATING_CONTENT_TYPES`, and its shape is borrowed here: the second copy is
   unavoidable — the database cannot import TypeScript and a hot-path upsert
   should not round-trip to Node for a constant — so the answer is a check that
   fails.

   ---------------------------------------------------------------------------
   EXERCISED AS `authenticated`, OVER PostgREST, NOT AS THE OWNER
   ---------------------------------------------------------------------------
   `choose_rooftop` is SECURITY DEFINER, so calling it over psql as `postgres`
   would test it in the one context where its privileges cannot fail — and
   `record_watch_progress` is SECURITY INVOKER, so the real caller is a
   signed-in advisor whose EXECUTE grant and whose RLS are both live. Every call
   below is therefore made by a real auth user over PostgREST, which also means
   a missing grant fails this check rather than production.

   ---------------------------------------------------------------------------
   SCOPE, STATED BEFORE THE FINDING
   ---------------------------------------------------------------------------
   `membership.role` is the enum `member_role`: advisor, manager, technician,
   admin — and NOTHING ELSE. `scripts/rooftop-choice-scenarios.ts` exercises the
   fallback arm with 'platform_owner', which is a legal argument to the
   TypeScript function (it takes `role: string`) and is NOT a value this column
   can hold. So the fallback arm is covered here with `admin`, the only role in
   the enum outside the three preference arms, and that difference is a fact
   about the two domains rather than a gap: a case the database cannot represent
   cannot disagree in the database.

   LOCAL ONLY. IT WRITES.
============================================================================ */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { chooseRooftop, type RooftopCandidate } from "@/lib/rooftop-choice";

const URL_ = process.env.SB_URL!;
const KEY = process.env.SB_KEY!;
const ANON = process.env.SB_ANON_KEY!;

if (!URL_ || !KEY || !ANON) {
  console.error("\n  need SB_URL, SB_KEY and SB_ANON_KEY\n");
  process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(URL_)) {
  console.error(`\n  REFUSING to run against ${URL_} — this writes. Local only.\n`);
  process.exit(1);
}

const sb = createClient(URL_, KEY, { auth: { persistSession: false } });
const TAG = `rfc-${randomUUID().slice(0, 6)}`;
const PASSWORD = "Fixture-passw0rd!";

let failures = 0;
const failed: string[] = [];
function ok(label: string, cond: boolean, detail?: string) {
  if (cond) console.log(`    \x1b[32mok\x1b[0m   ${label}`);
  else {
    failures++;
    failed.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`    \x1b[31mFAIL\x1b[0m ${label}${detail ? `  — ${detail}` : ""}`);
  }
}
const section = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`);
function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  if (r.data == null) throw new Error(`${what}: no row came back`);
  return r.data;
}

/* ---- Rooftop ids chosen to make the ordering do work -------------------- */
/*
 * THE TIE-BREAK IS A STRING COMPARISON ON ONE SIDE AND A uuid COMPARISON ON
 * THE OTHER, and that is a real place for two copies to part company:
 * `localeCompare` is locale-sensitive, Postgres orders uuids by their bytes.
 * For canonical lowercase uuids the two agree — but "they agree" is a claim, so
 * the ids below straddle the one boundary where a collation could disagree,
 * the digit/letter run ('9…' against 'a…'), as well as the ordinary case.
 * BEAUMONT deliberately sorts LAST, so a rule that is merely stable rather than
 * advisor-first answers wrongly and is caught.
 */
const ALPHA = "0a111111-1111-4111-8111-111111111111";
const NINE = "99999999-9999-4999-8999-999999999999";
const AAAA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BEAUMONT = "f0000000-0000-4000-8000-00000000000b";
const ROOFTOP_IDS = [ALPHA, NINE, AAAA, BEAUMONT];
const shortId = (id: string | null) =>
  id === null ? "null" : `${id.slice(0, 8)}…`;

type Role = "advisor" | "manager" | "technician" | "admin";
type Case = {
  name: string;
  /** In creation order — the FIRST is the oldest, which is what 0057 picked. */
  memberships: { rooftop: string; role: Role; active?: boolean }[];
  expected: string | null;
};

/*
 * Every shape rooftop-choice-scenarios.ts covers, in the database's own terms,
 * plus the two the database can get wrong on its own: an INACTIVE membership
 * (the TypeScript never sees one — the caller filters — but the SQL does its
 * own filtering and could forget) and the ordering boundary above.
 */
const CASES: Case[] = [
  {
    name: "advisor + manager at one rooftop → that rooftop",
    memberships: [
      { rooftop: BEAUMONT, role: "manager" },
      { rooftop: BEAUMONT, role: "advisor" },
    ],
    expected: BEAUMONT,
  },
  {
    name: "advisor at Beaumont, manager elsewhere → Beaumont (not the id-first one)",
    memberships: [
      { rooftop: ALPHA, role: "manager" },
      { rooftop: BEAUMONT, role: "advisor" },
    ],
    expected: BEAUMONT,
  },
  {
    name: "an advisor at two rooftops → the id-stable one, not whichever row came back",
    memberships: [
      { rooftop: BEAUMONT, role: "advisor" },
      { rooftop: ALPHA, role: "advisor" },
    ],
    expected: ALPHA,
  },
  {
    name: "two managers and a technician → the stable manager",
    memberships: [
      { rooftop: BEAUMONT, role: "manager" },
      { rooftop: NINE, role: "technician" },
      { rooftop: AAAA, role: "manager" },
    ],
    expected: AAAA,
  },
  {
    name: "manager only → that rooftop",
    memberships: [{ rooftop: BEAUMONT, role: "manager" }],
    expected: BEAUMONT,
  },
  {
    name: "technician + manager → the manager's rooftop",
    memberships: [
      { rooftop: ALPHA, role: "technician" },
      { rooftop: BEAUMONT, role: "manager" },
    ],
    expected: BEAUMONT,
  },
  {
    name: "technician beats the fallback (admin)",
    memberships: [
      { rooftop: ALPHA, role: "admin" },
      { rooftop: BEAUMONT, role: "technician" },
    ],
    expected: BEAUMONT,
  },
  {
    name: "two fallback-role memberships → the id-stable one",
    memberships: [
      { rooftop: BEAUMONT, role: "admin" },
      { rooftop: ALPHA, role: "admin" },
    ],
    expected: ALPHA,
  },
  {
    /* The digit/letter boundary, in the arm where the tie-break is the ONLY
       thing deciding. '9…' must come before 'a…' on both sides. */
    name: "tie-break across the digit/letter boundary: 9… before a…",
    memberships: [
      { rooftop: AAAA, role: "admin" },
      { rooftop: NINE, role: "admin" },
    ],
    expected: NINE,
  },
  {
    /* And the same boundary inside a preference arm, so a collation
       disagreement cannot hide behind the role ranking. */
    name: "tie-break across the boundary inside the advisor arm",
    memberships: [
      { rooftop: AAAA, role: "advisor" },
      { rooftop: NINE, role: "advisor" },
    ],
    expected: NINE,
  },
  {
    /* ONLY THE SQL CAN GET THIS WRONG, which is why it is here. The TypeScript
       never sees an inactive row — `the caller passes only active memberships`
       is its stated contract — so the two functions are NOT equivalent over
       this input and the comparison is against the ACTIVE subset. */
    name: "an inactive advisor membership is not chosen",
    memberships: [
      { rooftop: ALPHA, role: "advisor", active: false },
      { rooftop: BEAUMONT, role: "manager" },
    ],
    expected: BEAUMONT,
  },
  {
    name: "no active memberships at all → null",
    memberships: [{ rooftop: ALPHA, role: "advisor", active: false }],
    expected: null,
  },
  {
    name: "no memberships at all → null",
    memberships: [],
    expected: null,
  },
];

/* ---- A real signed-in caller ------------------------------------------- */

async function makeUser(label: string): Promise<{ id: string; client: SupabaseClient }> {
  const email = `${TAG}-${label}@example.com`;
  const created = await sb.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error) throw new Error(`createUser ${label}: ${created.error.message}`);
  const id = created.data.user!.id;
  must(
    await sb.from("app_user").upsert({ id, full_name: `${TAG} ${label}` }).select("id").single(),
    `app_user ${label}`
  );
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`signIn ${label}: ${error.message}`);
  const who = (await client.auth.getUser()).data.user?.id;
  if (who !== id) throw new Error(`session for ${label} is ${who}, not ${id}`);
  return { id, client };
}

async function cleanup() {
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 1000 });
  for (const u of users?.users ?? []) {
    if (!u.email?.startsWith(TAG)) continue;
    await sb.from("content_progress").delete().eq("user_id", u.id);
    await sb.from("membership").delete().eq("user_id", u.id);
    await sb.from("app_user").delete().eq("id", u.id);
    await sb.auth.admin.deleteUser(u.id);
  }
  await sb.from("content").delete().like("title", `${TAG}%`);
  for (const r of ROOFTOP_IDS) {
    await sb.from("rooftop_product").delete().eq("rooftop_id", r);
    await sb.from("rooftop").delete().eq("id", r);
  }
  await sb.from("org").delete().like("name", `${TAG}%`);
}

/* ======================================================================== */

async function main() {
  console.log(`\n\x1b[1mchoose_rooftop(uuid) vs chooseRooftop()\x1b[0m   tag ${TAG}`);
  console.log(`  ${URL_}`);

  /* ---- The stores ------------------------------------------------------ */
  const org = must(await sb.from("org").insert({ name: `${TAG} Org` }).select("id").single(), "org") as any;
  for (const id of ROOFTOP_IDS) {
    must(
      await sb
        .from("rooftop")
        .insert({ id, name: `${TAG} ${id.slice(0, 4)}`, org_id: org.id, timezone: "America/Chicago" })
        .select("id")
        .single(),
      `rooftop ${id}`
    );
    must(
      await sb
        .from("rooftop_product")
        .insert({ rooftop_id: id, product: "advisor_base", status: "active" })
        .select("rooftop_id")
        .single(),
      `rooftop_product ${id}`
    );
  }

  /* ---- Both sides, on the same rows ------------------------------------ */
  section("1 · the same membership rows through both copies of the rule");

  let compared = 0;
  for (const [i, c] of CASES.entries()) {
    const { id: uid, client } = await makeUser(`c${i}`);
    /* Created in listed order so `created_at` ascends with it — which is what
       0057's rule read, and what case 2 below needs in order to differ. */
    for (const m of c.memberships) {
      must(
        await sb
          .from("membership")
          .insert({
            user_id: uid,
            rooftop_id: m.rooftop,
            role: m.role,
            active: m.active ?? true,
          })
          .select("id")
          .single(),
        `membership ${c.name}`
      );
    }

    /* THE TYPESCRIPT SIDE, on the rows the caller would hand it: active only,
       which is that function's stated contract. */
    const tsRows: RooftopCandidate[] = c.memberships
      .filter((m) => m.active !== false)
      .map((m) => ({ rooftop_id: m.rooftop, role: m.role }));
    const tsAnswer = chooseRooftop(tsRows);

    /* THE SQL SIDE, as the signed-in user over PostgREST. */
    const { data: sqlRaw, error: sqlErr } = await client.rpc("choose_rooftop", { _user: uid });
    if (sqlErr) {
      ok(c.name, false, `choose_rooftop could not be evaluated as the user: ${sqlErr.message}`);
      continue;
    }
    const sqlAnswer = (sqlRaw as string | null) ?? null;

    compared++;
    ok(
      `${c.name}`,
      sqlAnswer === tsAnswer && tsAnswer === c.expected,
      `sql=${shortId(sqlAnswer)} ts=${shortId(tsAnswer)} expected=${shortId(c.expected)}`
    );
  }

  /* NOT VACUOUS. "All agreed" over zero comparisons reads exactly like success,
     and an RPC that errored for every case would produce it. */
  ok(
    `${compared} of ${CASES.length} cases were actually evaluated on both sides`,
    compared === CASES.length,
    "a case that could not be evaluated is not a case that agreed"
  );

  /* ---- The acceptance half: the ping really files there ---------------- */
  section("2 · record_watch_progress files the ping where the completion would");
  /*
   * A REFUSAL IS NOT SELF-VERIFYING AND NEITHER IS AN AGREEMENT. Section 1
   * proves the two rules return the same uuid; it does not prove
   * record_watch_progress USES it. This drives the real RPC and reads the row
   * back — and it is built on the one shape where the old rule and the new rule
   * DISAGREE, so it cannot pass by accident.
   */
  const { id: uid, client } = await makeUser("ping");
  /* Manager at ALPHA first, so ALPHA is the oldest membership and 0057's
     `order by created_at limit 1` would have chosen it. The advisor membership
     at BEAUMONT comes second, and advisor-first is what should win. */
  for (const m of [
    { rooftop: ALPHA, role: "manager" as Role },
    { rooftop: BEAUMONT, role: "advisor" as Role },
  ]) {
    must(
      await sb
        .from("membership")
        .insert({ user_id: uid, rooftop_id: m.rooftop, role: m.role, active: true })
        .select("id")
        .single(),
      `ping membership ${m.role}`
    );
  }

  const oldRuleWouldPick = ALPHA; // oldest created_at
  const newRuleShouldPick = chooseRooftop([
    { rooftop_id: ALPHA, role: "manager" },
    { rooftop_id: BEAUMONT, role: "advisor" },
  ]);
  ok(
    "the fixture discriminates: the old rule and the new one differ here",
    oldRuleWouldPick !== newRuleShouldPick,
    `both would pick ${shortId(oldRuleWouldPick)} — this case proves nothing`
  );

  const film = must(
    await sb
      .from("content")
      .insert({
        type: "advisor_video",
        status: "published",
        title: `${TAG} a film to ping`,
        duration_sec: 167,
        mux_playback_id: `fx-${randomUUID().slice(0, 10)}`,
        mux_playback_policy: "signed",
      })
      .select("id")
      .single(),
    "film"
  ) as any;

  const { error: rpcErr } = await client.rpc("record_watch_progress", {
    _content_id: film.id,
    _pct: 42,
    _position: 70,
  });
  if (rpcErr) {
    ok("record_watch_progress succeeded as the advisor", false, rpcErr.message);
  } else {
    ok("record_watch_progress succeeded as the advisor", true);
    const row = (
      await sb
        .from("content_progress")
        .select("rooftop_id, watched_pct, position_sec, completed_at")
        .eq("user_id", uid)
        .eq("content_id", film.id)
        .maybeSingle()
    ).data as any;
    ok(
      "the ping was filed at chooseRooftop's rooftop, not the oldest membership's",
      row?.rooftop_id === newRuleShouldPick,
      `row=${shortId(row?.rooftop_id ?? null)} want=${shortId(newRuleShouldPick)} ` +
        `old-rule=${shortId(oldRuleWouldPick)}`
    );
    /* The rest of 0057 is supposed to be untouched; a copy-with-one-line-changed
       that quietly dropped the clamp or the position would pass every test
       above. */
    ok("the monotonic clamp and position survived the rewrite", row?.watched_pct === 42 && row?.position_sec === 70,
      JSON.stringify(row));
    const { error: backErr } = await client.rpc("record_watch_progress", {
      _content_id: film.id,
      _pct: 5,
      _position: 9,
    });
    const after = (
      await sb
        .from("content_progress")
        .select("watched_pct")
        .eq("user_id", uid)
        .eq("content_id", film.id)
        .maybeSingle()
    ).data as any;
    ok(
      "a lower percentage cannot walk progress backwards",
      !backErr && after?.watched_pct === 42,
      `watched_pct=${after?.watched_pct}${backErr ? ` err=${backErr.message}` : ""}`
    );
    ok("completion is still not set here", row?.completed_at == null);
  }

  /* ---- And the refusal, which is also 0057's and must still work ------- */
  section("3 · a caller with no active membership is still refused");
  const { id: lonelyId, client: lonely } = await makeUser("lonely");
  void lonelyId;
  const { error: lonelyErr } = await lonely.rpc("record_watch_progress", {
    _content_id: film.id,
    _pct: 50,
    _position: 1,
  });
  ok(
    "record_watch_progress raises for a user with no memberships",
    Boolean(lonelyErr) && /no active membership/.test(lonelyErr?.message ?? ""),
    lonelyErr ? lonelyErr.message : "it succeeded, which means a row was filed at a null rooftop"
  );
}

main()
  .then(async () => {
    await cleanup();
    console.log("");
    if (failures > 0) {
      console.log(`\x1b[31m  ${failures} failure(s)\x1b[0m`);
      for (const f of failed) console.log(`    ${f}`);
      console.log("");
      process.exit(1);
    }
    console.log("\x1b[32m  the SQL rule and the TypeScript rule agree\x1b[0m\n");
    process.exit(0);
  })
  .catch(async (e) => {
    console.error("\n", e);
    await cleanup().catch(() => {});
    process.exit(1);
  });
