/* ============================================================================
   EDIAGD — checkEntitlement, proved to ACCEPT as well as refuse

     export SB_URL=http://127.0.0.1:55321 \
            SB_KEY=<local service role> SB_ANON_KEY=<local anon>
     npm run accept:entitlement

   ---------------------------------------------------------------------------
   WHY THIS EXISTS, AND IT IS THE WHOLE OF THE REASON
   ---------------------------------------------------------------------------
   `checkEntitlement` returned `entitled: false` for every caller and every
   product, on production, for as long as it has existed. It embedded
   `membership → rooftop_product!inner(...)`, which PostgREST cannot resolve —
   the two tables are siblings under `rooftop`, not parent and child — and the
   caller never destructured `error`, so a failed query became `data: null`,
   then `[]`, then "not entitled".

   Nothing caught it because both products it gates were unbought. A correct
   refusal and a broken one print the same screen, and no test ever asked it to
   say YES.

   So this suite's FIRST assertion is the acceptance. A gate that is only ever
   asked to refuse has been tested in the one direction that cannot fail.

   It runs the real function, through a real `authenticated` session over
   PostgREST — not the service role, which bypasses the RLS that the function's
   two reads are subject to.
   ============================================================================ */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { checkEntitlement } from "@/lib/entitlements";

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
const TAG = `ent-acc-${randomUUID().slice(0, 6)}`;
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
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`    ✗ ${label}${detail ? `  — ${detail}` : ""}`);
  }
}

const madeUsers: string[] = [];

async function makeUser(label: string, rooftop: string, role: string): Promise<string> {
  const email = `${TAG}-${label}@example.com`;
  const { data, error } = await sb.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
  if (error) throw new Error(`createUser ${label}: ${error.message}`);
  const id = data.user!.id;
  madeUsers.push(id);
  await sb.from("app_user").upsert({ id, full_name: `${TAG} ${label}` });
  const { error: mErr } = await sb
    .from("membership")
    .insert({ user_id: id, rooftop_id: rooftop, role, active: true });
  if (mErr) throw new Error(`membership ${label}: ${mErr.message}`);
  return id;
}

async function asUser(userId: string): Promise<SupabaseClient> {
  const { data: u } = await sb.auth.admin.getUserById(userId);
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({
    email: u.user!.email!, password: PASSWORD,
  });
  if (error) throw new Error(`signIn: ${error.message}`);
  return client;
}

async function main() {
  const { data: org, error: orgErr } = await sb
    .from("org").insert({ name: `${TAG} Org` }).select("id").single();
  if (orgErr) throw new Error(`org: ${orgErr.message}`);

  const mkRoof = async (n: string) => {
    const { data, error } = await sb
      .from("rooftop")
      .insert({ name: `${TAG} ${n}`, org_id: org!.id, timezone: "America/Chicago" })
      .select("id").single();
    if (error) throw new Error(`rooftop: ${error.message}`);
    return data!.id as string;
  };

  /* Store A bought Manager Meetings; store B bought only the base product. */
  const roofA = await mkRoof("Bought It");
  const roofB = await mkRoof("Did Not");
  for (const [roof, products] of [
    [roofA, ["advisor_base", "manager_meetings"]],
    [roofB, ["advisor_base"]],
  ] as const) {
    for (const p of products) {
      const { error } = await sb
        .from("rooftop_product")
        .insert({ rooftop_id: roof, product: p, status: "active" });
      if (error) throw new Error(`rooftop_product ${p}: ${error.message}`);
    }
  }

  const managerA = await makeUser("managerA", roofA, "manager");
  const managerB = await makeUser("managerB", roofB, "manager");
  const advisorA = await makeUser("advisorA", roofA, "advisor");

  /* ====================================================================
     1. THE ACCEPTANCE, FIRST. This is the assertion that was missing.
     ==================================================================== */
  console.log("\n1. It says YES when it should");
  const cA = await asUser(managerA);
  const yes = await checkEntitlement(cA as never, managerA, ["manager"], "manager_meetings");
  ok(
    "a manager at a rooftop that bought manager_meetings is ENTITLED",
    yes.entitled === true,
    `got ${JSON.stringify(yes)} — this is the assertion whose absence hid a total failure`
  );
  ok(
    "and it names the rooftop",
    yes.rooftopIds.length === 1 && yes.rooftopIds[0] === roofA,
    `got ${JSON.stringify(yes.rooftopIds)}`
  );
  ok("hasRole is true", yes.hasRole === true);

  /* ====================================================================
     2. THE REFUSALS — each distinguishable from the other
     ==================================================================== */
  console.log("\n2. It says NO for the two different reasons, and tells them apart");
  const cB = await asUser(managerB);
  const notBought = await checkEntitlement(cB as never, managerB, ["manager"], "manager_meetings");
  ok(
    "a manager at a rooftop that did NOT buy it is not entitled",
    notBought.entitled === false,
    JSON.stringify(notBought)
  );
  ok(
    "but hasRole stays TRUE — 'your store hasn't bought it', not 'not for you'",
    notBought.hasRole === true,
    "this is the difference between a useful empty state and a dead end"
  );

  const cAdv = await asUser(advisorA);
  const wrongRole = await checkEntitlement(cAdv as never, advisorA, ["manager"], "manager_meetings");
  ok(
    "an ADVISOR at the rooftop that bought it is not entitled",
    wrongRole.entitled === false,
    JSON.stringify(wrongRole)
  );
  ok(
    "and hasRole is FALSE — the other reason, reported differently",
    wrongRole.hasRole === false
  );

  /* ====================================================================
     3. A PRODUCT NOBODY BOUGHT
     ==================================================================== */
  console.log("\n3. An unbought add-on");
  const joe = await checkEntitlement(cA as never, managerA, ["advisor", "manager"], "joe_the_pro");
  ok("joe_the_pro is not entitled anywhere in this fixture", joe.entitled === false,
    JSON.stringify(joe));
  ok("…and hasRole is still true, so the screen can explain itself", joe.hasRole === true);

  /* ====================================================================
     4. THE FAILURE MODE IS A THROW, NOT A QUIET FALSE
     ==================================================================== */
  console.log("\n4. A failed read refuses loudly rather than answering 'not entitled'");
  const broken = {
    from: () => ({
      select: () => ({
        eq: function () { return this; },
        in: function () { return this; },
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: null, error: { message: "simulated read failure" } }),
      }),
    }),
  };
  let threw = false;
  try {
    await checkEntitlement(broken as never, managerA, ["manager"], "manager_meetings");
  } catch {
    threw = true;
  }
  ok(
    "a read error THROWS instead of returning entitled:false",
    threw,
    "'we could not find out' and 'they may not have it' are different answers; " +
      "answering the second quietly is exactly how this was broken for weeks"
  );

  /* ---- Cleanup --------------------------------------------------------- */
  await sb.from("membership").delete().in("user_id", madeUsers);
  await sb.from("app_user").delete().in("id", madeUsers);
  for (const id of madeUsers) await sb.auth.admin.deleteUser(id);
  await sb.from("rooftop_product").delete().in("rooftop_id", [roofA, roofB]);
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
