/* ============================================================================
   EDIAGD — the light track, against a real database

     export SB_URL=http://127.0.0.1:55321 \
            SB_KEY=<local service role> SB_ANON_KEY=<local anon>
     npm run accept:light-track

   Runs against a LOCAL Supabase carrying a restore of the production dump
   with 0147 applied. It writes (a test membership is repointed and restored,
   a synthetic period is seeded and removed) and refuses any non-local URL.

   WHAT IT PROVES, each check as the role that will really meet it:

     1  a THIN advisor — a real test account repointed onto Martin's operator
        747 at Doggett Ford of Beaumont (6 ROs in the latest complete period)
        — gets the two-slot morning, with the light reason RECORDED and
        readable by the advisor over PostgREST as `authenticated`
     2  a REAL advisor (op 400025, 82 ROs) gets three slots and a derived
        family — and loadLightMode is FALSE for them, so the light copy can
        never render beside a derived family
     3  the thin advisor whose NEXT period clears the floor is re-derived on
        that period and gets a pitch — never sooner, never by hand
     4  a MANAGER override on a thin advisor produces a pitch regardless
     5  the negative: an advisor with NO op code is unchanged — null
        assignment, and no light row is written for missing mapping
   ============================================================================ */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { assembleMorning } from "@/lib/loop";
import { loadLightMode, loadLightUsers } from "@/lib/service-family";

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

/* Films shape to null without Mux signing keys, and a suite where every pitch
   is null asserts nothing. Borrowed from .env.local; local HMAC, no request. */
for (const [k, v] of Object.entries(loadEnvFile())) {
  if (k.startsWith("MUX_") && !process.env[k]) process.env[k] = v;
}
if (!process.env.MUX_SIGNING_KEY_ID || !process.env.MUX_SIGNING_KEY_PRIVATE) {
  console.error("\n  MUX keys not set and not in .env.local — pitch checks would be vacuous.\n");
  process.exit(1);
}

function loadEnvFile(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(`${process.cwd()}/.env.local`, "utf8")
        .split("\n")
        .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
        })
    );
  } catch {
    return {};
  }
}

const service = createClient(URL, KEY, { auth: { persistSession: false } });

let passed = 0;
let failed = 0;
function assert(cond: boolean, label: string) {
  if (cond) {
    passed += 1;
    console.log(`  ok    ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}`);
  }
}

async function signedInAs(userId: string): Promise<SupabaseClient> {
  const password = `lta-${userId.slice(0, 8)}-scratch`;
  const { error: up } = await service.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
  });
  if (up) throw new Error(`set password: ${up.message}`);
  const { data: u } = await service.auth.admin.getUserById(userId);
  if (!u.user?.email) throw new Error("no email");
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email: u.user.email, password });
  if (error) throw new Error(`signIn: ${error.message}`);
  return client;
}

/* The cast, by id — never by name. */
const THIN_USER = "645a4739-d5b4-41b5-9413-4e3495e1fb67"; // advisor-only test account
const REAL_USER = "921e2537-54c8-4398-9d1d-13b93e70cd97"; // advisor-only, op 400025
const REAL_ROOFTOP = "e5847ebd-4e03-4dba-b39e-b857fe58978c"; // CDJR (provisioned)
const BEAUMONT_FORD = "84bef302-ebd2-4536-ba9f-693c535f10d4";
const MARTIN_OP = "747"; // 6 ROs in the latest complete period — genuinely thin
const TEST_PERIOD = "11111111-2222-3333-4444-555555555555";
const today = new Date().toISOString().slice(0, 10) as never;

async function morningFor(userId: string, rooftopId: string) {
  const client = await signedInAs(userId);
  return {
    client,
    morning: await assembleMorning(client as never, service as never, userId, rooftopId, today),
  };
}

async function main() {
  /* ---- setup: repoint the test account onto Martin's thin operator -------
     Saved first, restored last. Local scratch data; the membership is the
     test account's own. Beaumont Ford also gets advisor_base so a pitch is
     REPRESENTABLE there — without entitlement every film read is empty and
     checks 3 and 4 would pass for the wrong reason. */
  const { data: origMembership } = await service
    .from("membership")
    .select("id, rooftop_id, op_code_id")
    .eq("user_id", THIN_USER)
    .eq("role", "advisor")
    .limit(1)
    .maybeSingle();
  if (!origMembership) throw new Error("thin test account has no advisor membership");

  await service.from("rooftop_product").upsert(
    { rooftop_id: BEAUMONT_FORD, product: "advisor_base", status: "active" },
    { onConflict: "rooftop_id,product" }
  );
  await service
    .from("membership")
    .update({ rooftop_id: BEAUMONT_FORD, op_code_id: MARTIN_OP })
    .eq("id", origMembership.id);
  /* a clean derivation history for the test account */
  await service.from("advisor_focus_family").delete().eq("user_id", THIN_USER);
  /* and no leftover synthetic period from a previous run */
  await service.from("advisor_op_metric").delete().eq("period_id", TEST_PERIOD);
  await service.from("advisor_period_total_src").delete().eq("period_id", TEST_PERIOD);
  await service.from("perf_period").delete().eq("id", TEST_PERIOD);
  console.log(`\n  (setup) test account ${THIN_USER.slice(0, 8)}… repointed to op ${MARTIN_OP} at Beaumont Ford\n`);

  try {
    /* ---- 1 · thin: two slots, reason recorded, advisor can read it ------- */
    {
      const { client, morning } = await morningFor(THIN_USER, BEAUMONT_FORD);
      assert(
        morning.kind === "two_slot" && morning.pitch === null,
        `thin advisor (op ${MARTIN_OP}): the light morning is the two-slot morning (got ${morning.kind})`
      );

      const { data: rows } = await client
        .from("advisor_focus_family")
        .select("source, family, note")
        .eq("user_id", THIN_USER)
        .is("ended_on", null);
      const row = (rows ?? [])[0] as { source: string; family: string | null; note: string | null } | undefined;
      assert(
        row?.source === "light" && row.family === null,
        `the light row is recorded and the ADVISOR reads it over PostgREST (got ${row?.source})`
      );
      assert(
        /6 ROs.*floor 20/.test(row?.note ?? "") && /floor 5/.test(row?.note ?? ""),
        `the reason names both measurements against both floors ("${row?.note}")`
      );
      assert(
        (await loadLightMode(client as never, THIN_USER)) === true,
        "loadLightMode is true for the thin advisor — the copy line renders"
      );
    }

    /* ---- 2 · real: three slots, derived family, and no light copy -------- */
    {
      const { client, morning } = await morningFor(REAL_USER, REAL_ROOFTOP);
      assert(
        morning.kind === "normal" && morning.pitch !== null && Boolean(morning.pitch?.family),
        `real advisor (op 400025): three slots, family "${morning.pitch?.family ?? "—"}" (got ${morning.kind})`
      );
      assert(
        (await loadLightMode(client as never, REAL_USER)) === false,
        "loadLightMode is false for a derived advisor — the light copy can never render beside a family"
      );
    }

    /* ---- 3 · the next period clears the floor: re-derived, pitch on ------ */
    {
      /* September lands at Beaumont Ford: op 747 writes 40 ROs, 10 of them
         Filters, against a colleague at 30 — above both floors, with a real
         gap. The same shape the DMS import produces, in the same tables. */
      await service.from("perf_period").insert({
        id: TEST_PERIOD,
        rooftop_id: BEAUMONT_FORD,
        starts_on: "2026-09-01",
        ends_on: "2026-09-30",
        label: "September 2026 (acceptance)",
        source_file: "light-track-acceptance",
        is_partial: false,
      });
      await service.from("advisor_op_metric").insert([
        { period_id: TEST_PERIOD, rooftop_id: BEAUMONT_FORD, advisor_op_id: MARTIN_OP, op_code: "21D", ros: 10, resolved_family: "Filters" },
        { period_id: TEST_PERIOD, rooftop_id: BEAUMONT_FORD, advisor_op_id: "902050", op_code: "21D", ros: 30, resolved_family: "Filters" },
      ]);
      await service.from("advisor_period_total_src").insert([
        { period_id: TEST_PERIOD, rooftop_id: BEAUMONT_FORD, advisor_op_id: MARTIN_OP, total_ros: 40 },
        { period_id: TEST_PERIOD, rooftop_id: BEAUMONT_FORD, advisor_op_id: "902050", total_ros: 40 },
      ]);

      const { client, morning } = await morningFor(THIN_USER, BEAUMONT_FORD);
      assert(
        morning.kind === "normal" && morning.pitch?.family === "Filters",
        `the first period that clears the floor re-derives: pitch on, family "${morning.pitch?.family ?? "—"}" (got ${morning.kind})`
      );
      const { data: hist } = await client
        .from("advisor_focus_family")
        .select("source, ended_on")
        .eq("user_id", THIN_USER)
        .order("created_at", { ascending: true });
      const h = (hist ?? []) as { source: string; ended_on: string | null }[];
      assert(
        h.length === 2 && h[0]!.source === "light" && h[0]!.ended_on !== null && h[1]!.source === "derived",
        `the crossing is history, not an overwrite: light ended, derived active (got ${JSON.stringify(h.map((x) => x.source))})`
      );
      assert(
        (await loadLightMode(client as never, THIN_USER)) === false,
        "loadLightMode turns itself off — nobody touched a setting"
      );
    }

    /* ---- 4 · a manager override on a thin advisor pitches regardless ----- */
    {
      /* Back below the floor: remove September, clear history. */
      await service.from("advisor_op_metric").delete().eq("period_id", TEST_PERIOD);
      await service.from("advisor_period_total_src").delete().eq("period_id", TEST_PERIOD);
      await service.from("perf_period").delete().eq("id", TEST_PERIOD);
      await service.from("advisor_focus_family").delete().eq("user_id", THIN_USER);

      /* The ruling, as the schema records one: source='manager', assigned_by. */
      const { error } = await service.from("advisor_focus_family").insert({
        user_id: THIN_USER,
        rooftop_id: BEAUMONT_FORD,
        family: "Filters",
        source: "manager",
        assigned_by: REAL_USER,
        note: "acceptance: a manager who assigns a family to a thin advisor has ruled",
      });
      if (error) throw new Error(`manager override insert: ${error.message}`);

      const { client, morning } = await morningFor(THIN_USER, BEAUMONT_FORD);
      assert(
        morning.kind === "normal" && morning.pitch?.family === "Filters",
        `manager override on a thin advisor produces a pitch regardless (got ${morning.kind}, ${morning.pitch?.family ?? "—"})`
      );
      assert(
        (await loadLightMode(client as never, THIN_USER)) === false,
        "an overridden advisor is not light — the ruling stands, no light row beside it"
      );
    }

    /* ---- 5 · the negative: no op code is unchanged ------------------------ */
    {
      await service.from("advisor_focus_family").delete().eq("user_id", THIN_USER);
      await service.from("membership").update({ op_code_id: null }).eq("id", origMembership.id);

      const { morning } = await morningFor(THIN_USER, BEAUMONT_FORD);
      assert(
        morning.kind === "two_slot" && morning.assignment === null,
        `no op code: two slots and NO assignment, exactly as today (got ${morning.kind})`
      );
      const { count } = await service
        .from("advisor_focus_family")
        .select("id", { count: "exact", head: true })
        .eq("user_id", THIN_USER);
      assert(
        Number(count ?? 0) === 0,
        "no light row is written for missing mapping — thin data and no data stay distinguishable"
      );

      /* And the roster helper sees nobody: light is about the light source,
         never about absence. */
      const lights = await loadLightUsers(service as never, [THIN_USER, REAL_USER]);
      assert(lights.size === 0, "loadLightUsers marks neither the unmapped nor the derived advisor");
    }
  } finally {
    /* ---- restore: the test account exactly as the dump had it ------------ */
    await service.from("advisor_op_metric").delete().eq("period_id", TEST_PERIOD);
    await service.from("advisor_period_total_src").delete().eq("period_id", TEST_PERIOD);
    await service.from("perf_period").delete().eq("id", TEST_PERIOD);
    await service.from("advisor_focus_family").delete().eq("user_id", THIN_USER);
    await service
      .from("membership")
      .update({ rooftop_id: origMembership.rooftop_id, op_code_id: origMembership.op_code_id })
      .eq("id", origMembership.id);
    await service
      .from("rooftop_product")
      .delete()
      .eq("rooftop_id", BEAUMONT_FORD)
      .eq("product", "advisor_base");
    console.log("\n  (teardown) membership, entitlement and synthetic period restored\n");
  }

  console.log(`  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`\n  acceptance crashed: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
