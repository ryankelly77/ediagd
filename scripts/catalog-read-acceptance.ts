/* ============================================================================
   EDIAGD — the op code catalog read, as the roles that will really call it

   THE TEST 0182 EXISTS TO PASS. AGENTS.md: "A migration applying cleanly is not
   evidence that a function works. A function shipped in a migration must be
   exercised BY THE ROLE AND THE PATH THAT WILL ACTUALLY CALL IT, or it is
   untested." The same goes double for an RLS policy, because a policy CANNOT be
   observed as `postgres` — BYPASSRLS means it never runs, so every count comes
   back complete and a broken policy looks perfect.

   So every assertion below goes over PostgREST, signed in as a real auth user:

     manager-only   reads the catalog. THE POINT OF 0182.
     technician     reads zero. The refusal.
     advisor        reads zero. The other refusal.
     admin          reads the catalog. The ACCEPTANCE of a known-good input —
                    this was already true before 0182 and must stay true, and
                    it is the half that catches a migration which "fixed" the
                    read by breaking it for everybody.

     export SB_URL=http://127.0.0.1:55321 \
            SB_KEY=<local service role> SB_ANON_KEY=<local anon>
     npm run accept:catalog-read

   ---------------------------------------------------------------------------
   THE FIXTURE MANAGER HOLDS `manager` AND NOTHING ELSE, AND THAT IS THE SLICE
   ---------------------------------------------------------------------------
   Beaumont's two real managers may well also hold `admin`. A suite that signed
   in as them would read the catalog through `op_code_catalog_admin` — which has
   granted admins everything since 0062 — and would pass identically whether or
   not 0182 was ever applied. It would be testing the one context in which this
   gate cannot fail.

   Every fixture user below therefore gets exactly ONE membership row, and the
   suite asserts that before it asserts anything else. If the manager fixture
   ever acquires a second role, the role-count check fails loudly rather than
   the suite passing for the wrong reason.

   ---------------------------------------------------------------------------
   RUN IT AGAINST LOCAL. IT WRITES.
   ---------------------------------------------------------------------------
   Same posture as focus-family-acceptance: it creates an org, a rooftop, auth
   users and catalog codes, and removes them again. It refuses any SB_URL that
   is not localhost — this branch's rule is that no write-path proof runs
   anywhere but local, because Vercel Preview resolves the PRODUCTION Supabase
   project and carries a service-role key.
============================================================================ */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

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

/* ---- harness -------------------------------------------------------------- */
let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? `\n      ${detail}` : ""}`);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
const section = (t: string) => console.log(`\n${t}`);
function need<T>(v: T | null | undefined, what: string): T {
  if (v == null) throw new Error(`fixture expected ${what}, got nothing`);
  return v;
}

/* ---- fixtures ------------------------------------------------------------- */
const TAG = `cat-${randomUUID().slice(0, 8)}`;
const madeUsers: string[] = [];
const madeCodes: string[] = [];
let orgId = "";
let rooftopId = "";

const PASSWORD = "Fixture-passw0rd!";
type Role = "advisor" | "manager" | "technician" | "admin";

/** Ids, never names — AGENTS.md: a name is for printing, never for matching. */
async function makeUser(role: Role, rooftop: string): Promise<string> {
  const email = `${TAG}-${role}-${randomUUID().slice(0, 6)}@example.test`;
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${role}): ${error.message}`);
  const id = data.user!.id;
  madeUsers.push(id);
  await sb.from("app_user").upsert({ id, full_name: `${TAG} ${role}` });
  const { error: mErr } = await sb.from("membership").insert({
    user_id: id,
    rooftop_id: rooftop,
    role,
    active: true,
  });
  if (mErr) throw new Error(`membership(${role}): ${mErr.message}`);
  return id;
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

/** How many catalog rows can this client actually see? */
async function catalogCount(c: SupabaseClient): Promise<number> {
  const { count, error } = await c
    .from("op_code_catalog")
    .select("code", { count: "exact", head: true });
  if (error) throw new Error(`op_code_catalog select: ${error.message}`);
  return count ?? 0;
}

const FIXTURE_CODES = [`${TAG}-A`, `${TAG}-B`, `${TAG}-C`];

async function setup() {
  const { data: o, error: oErr } = await sb
    .from("org")
    .insert({ name: `${TAG} Org` })
    .select("id")
    .single();
  if (oErr) throw new Error(`org: ${oErr.message}`);
  orgId = o.id;

  const { data: r, error: rErr } = await sb
    .from("rooftop")
    .insert({ org_id: orgId, name: `${TAG} Store`, timezone: "America/Chicago" })
    .select("id")
    .single();
  if (rErr) throw new Error(`rooftop: ${rErr.message}`);
  rooftopId = r.id;

  /* The local catalog may be empty (it was, at 0180), so the suite seeds its
     own rows. A count-based assertion against a table that happened to be
     empty would read "manager sees 0" as a refusal when it is really an absent
     fixture — the suite would pass for the wrong reason, in the wrong
     direction. Seeding makes "0 rows" unambiguous. */
  for (const [i, code] of FIXTURE_CODES.entries()) {
    const { error } = await sb.from("op_code_catalog").insert({
      code,
      name: `${TAG} fixture code ${i}`,
      category: "Fixture",
      sort_order: 9000 + i,
    });
    if (error) throw new Error(`op_code_catalog(${code}): ${error.message}`);
    madeCodes.push(code);
  }
}

async function teardown() {
  for (const code of madeCodes) {
    await sb.from("op_code_catalog").delete().eq("code", code);
  }
  for (const id of madeUsers) {
    await sb.from("membership").delete().eq("user_id", id);
    await sb.from("app_user").delete().eq("id", id);
    await sb.auth.admin.deleteUser(id);
  }
  if (rooftopId) await sb.from("rooftop").delete().eq("id", rooftopId);
  if (orgId) await sb.from("org").delete().eq("id", orgId);
}

/* ---- the suite ------------------------------------------------------------ */
async function main() {
  console.log(`\nop_code_catalog read — 0182, fixture tag ${TAG}`);
  await setup();

  const managerId = await makeUser("manager", rooftopId);
  const technicianId = await makeUser("technician", rooftopId);
  const advisorId = await makeUser("advisor", rooftopId);
  const adminId = await makeUser("admin", rooftopId);

  const asManager = await signedInAs(managerId);
  const asTechnician = await signedInAs(technicianId);
  const asAdvisor = await signedInAs(advisorId);
  const asAdmin = await signedInAs(adminId);

  /* ---------------------------------------------------------------------- */
  section("0. The fixtures are what they claim to be");
  {
    /* Asserted FIRST, because every finding below is a claim about a role and
       is worthless if the user holds a second one. This is the check that
       stops the suite passing through op_code_catalog_admin. */
    for (const [label, id, role] of [
      ["manager", managerId, "manager"],
      ["technician", technicianId, "technician"],
      ["advisor", advisorId, "advisor"],
      ["admin", adminId, "admin"],
    ] as const) {
      const { data } = await sb
        .from("membership")
        .select("role")
        .eq("user_id", id);
      const roles = (data ?? []).map((m) => m.role);
      ok(
        `the ${label} fixture holds exactly one membership, role = '${role}'`,
        roles.length === 1 && roles[0] === role,
        `holds [${roles.join(", ")}]`
      );
    }

    const seeded = await catalogCount(sb);
    ok(
      `the service client sees the ${FIXTURE_CODES.length} seeded codes (and any real ones)`,
      seeded >= FIXTURE_CODES.length,
      `saw ${seeded}`
    );
  }

  /* ---------------------------------------------------------------------- */
  section("1. A manager reads the catalog — the point of 0182");
  {
    const n = await catalogCount(asManager);
    ok(
      "a manager-only user reads the catalog over PostgREST",
      n > 0,
      `read ${n} rows. BEFORE 0182 this is 0: op_code_catalog_read gates on ` +
        `admin_rooftops(), which excludes manager — zero rows and no error.`
    );
    /* Not just "some rows": the rows this suite put there. A count that
       happened to be non-zero because of unrelated data would be evidence
       about the database, not about the policy. */
    const { data } = await asManager
      .from("op_code_catalog")
      .select("code")
      .in("code", FIXTURE_CODES);
    ok(
      "and reads the specific fixture codes, not merely a non-zero count",
      (data ?? []).length === FIXTURE_CODES.length,
      `saw ${(data ?? []).length} of ${FIXTURE_CODES.length}`
    );
    /* The thing the meeting screen actually needs: the NAME behind the code. */
    const { data: named } = await asManager
      .from("op_code_catalog")
      .select("code, name")
      .eq("code", FIXTURE_CODES[0])
      .maybeSingle();
    ok(
      "and can read the op code's NAME, which is what the screen needs",
      !!named?.name && named.name.includes(TAG),
      `got ${JSON.stringify(named)}`
    );
  }

  /* ---------------------------------------------------------------------- */
  section("2. The refusals still refuse");
  {
    const t = await catalogCount(asTechnician);
    ok("a technician reads zero catalog rows", t === 0, `read ${t}`);

    const a = await catalogCount(asAdvisor);
    ok("an advisor reads zero catalog rows", a === 0, `read ${a}`);

    /* A refusal that returns an ERROR and a refusal that returns an empty set
       are different facts. RLS does the latter, and the screen has to handle
       it — so this asserts the shape as well as the count. */
    const { error } = await asTechnician.from("op_code_catalog").select("code");
    ok(
      "and the refusal is an empty set rather than an error, as RLS does it",
      !error,
      `error: ${error?.message}`
    );
  }

  /* ---------------------------------------------------------------------- */
  section("3. The known-good input is still accepted — the skipped half");
  {
    /* AGENTS.md: "every gate gets both tests ... The acceptance test is the one
       that gets skipped, and it is the one that catches this." A migration that
       widened the read by breaking the predicate for everybody would pass every
       assertion in section 2. */
    const n = await catalogCount(asAdmin);
    ok(
      "an admin still reads the catalog",
      n > 0,
      `read ${n} — if this is 0, 0182 broke the read for admins too`
    );
  }

  /* ---------------------------------------------------------------------- */
  section("4. The READ widened and the WRITE did not");
  {
    /* The safety claim of 0182. op_code_catalog_admin (0062) is FOR ALL and
       keyed on role = 'admin'; a manager must gain no write from a read
       widening. A manager who could rename a code would silently re-point
       every surface that joins on it. */
    const { error: insErr } = await asManager.from("op_code_catalog").insert({
      code: `${TAG}-MGR-WRITE`,
      name: "should never exist",
      category: "Fixture",
      sort_order: 9999,
    });
    ok(
      "a manager cannot INSERT into the catalog",
      !!insErr,
      insErr ? `refused: ${insErr.code}` : "THE INSERT SUCCEEDED"
    );

    const { error: updErr } = await asManager
      .from("op_code_catalog")
      .update({ name: "renamed by a manager" })
      .eq("code", FIXTURE_CODES[0]);
    /* An UPDATE matching no permitted row is not an error in PostgREST — it
       reports success having changed nothing. So this is verified by READING
       THE ROW BACK as the service client rather than by trusting the status. */
    const { data: after } = await sb
      .from("op_code_catalog")
      .select("name")
      .eq("code", FIXTURE_CODES[0])
      .maybeSingle();
    ok(
      "a manager cannot UPDATE a catalog name (verified by reading the row back)",
      after?.name !== "renamed by a manager",
      `name is now ${JSON.stringify(after?.name)}; update error: ${updErr?.code ?? "none"}`
    );

    const { error: delErr } = await asManager
      .from("op_code_catalog")
      .delete()
      .eq("code", FIXTURE_CODES[1]);
    const { count: stillThere } = await sb
      .from("op_code_catalog")
      .select("code", { count: "exact", head: true })
      .eq("code", FIXTURE_CODES[1]);
    ok(
      "a manager cannot DELETE a catalog row (verified by counting it after)",
      stillThere === 1,
      `rows remaining: ${stillThere}; delete error: ${delErr?.code ?? "none"}`
    );

    /* And the write policy's own acceptance half: an admin CAN still write,
       so "nobody can write" is not how the three refusals above were achieved. */
    const probe = `${TAG}-ADMIN-WRITE`;
    const { error: adminInsErr } = await asAdmin.from("op_code_catalog").insert({
      code: probe,
      name: `${TAG} admin probe`,
      category: "Fixture",
      sort_order: 9998,
    });
    if (!adminInsErr) madeCodes.push(probe);
    ok(
      "an admin CAN still write the catalog — the refusals above are not universal",
      !adminInsErr,
      adminInsErr ? `refused: ${adminInsErr.message}` : undefined
    );
  }

  /* ---------------------------------------------------------------------- */
  section("5. Only op_code_catalog widened — the sibling is untouched");
  {
    /* The plan says op_code_family stays admin-scoped: under family grain the
       screen reads `family` as plain text off advisor_family_attach and never
       needs the mapping. The two policies are adjacent and identical in 0081,
       so over-widening is the easy mistake. */
    const { count, error } = await asManager
      .from("op_code_family")
      .select("code", { count: "exact", head: true });
    ok(
      "a manager still reads zero rows from op_code_family",
      !error && (count ?? 0) === 0,
      `read ${count}${error ? `, error ${error.message}` : ""}`
    );
  }

  /* ---------------------------------------------------------------------- */
  console.log("\n" + "=".repeat(68));
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed) {
    console.log("\nFailures:");
    for (const f of failures) console.log("  ✗ " + f);
  }
  console.log("=".repeat(68));
}

main()
  .catch((e) => {
    console.error(`\nFIXTURE ERROR: ${e instanceof Error ? e.message : e}`);
    failed++;
  })
  .finally(async () => {
    await teardown();
    console.log(`  (fixtures ${TAG} removed)`);
    /* The exit code is a FUNCTION OF THE FAILURE COUNT, never a literal —
       AGENTS.md: "a summary is not an observation, and neither is an exit
       code." */
    process.exit(failed > 0 ? 1 : 0);
  });
