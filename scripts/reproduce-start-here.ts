/* ============================================================================
   EDIAGD — WHAT START HERE ACTUALLY RETURNS, PER ACCOUNT, OVER PostgREST

   READ ONLY. Writes nothing.

     export SB_URL=... SB_KEY=<service role> SB_ANON_KEY=<anon>
     npm run repro:start-here

   ---------------------------------------------------------------------------
   WHY THIS EXISTS RATHER THAN A SCREENSHOT
   ---------------------------------------------------------------------------
   The 5 October audit concluded "25 cues render" from the POLICY TEXT plus the
   loader source. Ryan sees Start Here empty on his phone. One of those is wrong
   for his account, and a picture would not say which — so this calls the REAL
   `loadCourses` and `loadModuleItems` (imported, not reimplemented) with a
   session for each account in turn, which is the only way the answer comes from
   the thing itself under the conditions it will really meet.

   AGENTS.md: a function must be exercised by the role and the path that will
   actually call it. The audit's first pass measured the policy; this measures
   the answer.

   It also re-proves the audit's own claim in the direction that could embarrass
   it: if the service role sees 25 rows and an advisor session sees 0, the
   audit was wrong and this says so.

   ---------------------------------------------------------------------------
   HOW THE SESSION IS OBTAINED, AND WHAT IT IS NOT
   ---------------------------------------------------------------------------
   `auth.admin.generateLink` mints a one-time token with the service role and
   returns it instead of mailing it; `verifyOtp` exchanges it for a session. No
   password is read, typed or stored, and nothing is emailed.

   ACCOUNTS ARE AN EXPLICIT ALLOWLIST, and it holds only the two Ryan named.
   Minting a session for somebody else's account to look around their library is
   not a diagnostic, so the list is not derived from a query and a name that is
   not in it cannot be reached by this script.
   ============================================================================ */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { loadCourses, loadModuleItems, loadModules } from "@/lib/lms";

const URL = process.env.SB_URL!;
const SERVICE = process.env.SB_KEY!;
const ANON = process.env.SB_ANON_KEY!;

/** The two accounts Ryan named, and nothing else. */
const ACCOUNTS = [
  "ryan@pearanalytics.com",
  "ryan+beaumont@pearanalytics.com",
] as const;

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

async function sessionFor(email: string) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) throw new Error(`generateLink(${email}): ${error.message}`);
  const hashed = (data as any)?.properties?.hashed_token;
  if (!hashed) throw new Error(`generateLink(${email}): no hashed_token returned`);

  const user = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: v, error: e2 } = await user.auth.verifyOtp({
    token_hash: hashed,
    type: "magiclink",
  });
  if (e2) throw new Error(`verifyOtp(${email}): ${e2.message}`);
  if (!v.session) throw new Error(`verifyOtp(${email}): no session`);
  return { client: user, userId: v.user!.id };
}

const main = async () => {
  /* The subject, resolved once with the service role so both sessions are asked
     about the SAME module id rather than each finding its own. */
  const { data: course } = await admin
    .from("course")
    .select("id, name, slug")
    .eq("name", "Start Here")
    .maybeSingle();
  if (!course) throw new Error("no course named Start Here");

  const { data: mods } = await admin
    .from("module")
    .select("id, name, sort_order")
    .eq("course_id", course.id)
    .order("sort_order");
  const m1 = (mods ?? [])[0] as any;

  const { count: trueRows } = await admin
    .from("content")
    .select("id", { count: "exact", head: true })
    .eq("module_id", m1.id)
    .eq("status", "published")
    .is("retired_at", null);

  console.log(`Start Here — course ${course.id}  slug "${course.slug}"`);
  console.log(`  module 1 "${m1.name}"  id ${m1.id}`);
  console.log(`  SERVICE ROLE sees ${trueRows} published rows in module 1 — the true count.\n`);

  /* Roles and entitlement per account, so a difference has a cause beside it. */
  for (const email of ACCOUNTS) {
    console.log("=".repeat(76));
    let s: Awaited<ReturnType<typeof sessionFor>>;
    try {
      s = await sessionFor(email);
    } catch (e) {
      console.log(`${email}\n  COULD NOT OBTAIN A SESSION: ${(e as Error).message}`);
      continue;
    }
    const { client, userId } = s;
    console.log(`${email}\n  user id ${userId}`);

    const { data: mem } = await admin
      .from("membership")
      .select("rooftop_id, role, active")
      .eq("user_id", userId)
      .eq("active", true);
    const { data: prods } = await admin.from("rooftop_product").select("rooftop_id, product, status");
    const live = new Set(
      (prods ?? [])
        .filter((p: any) => ["active", "trialing"].includes(p.status))
        .map((p: any) => `${p.rooftop_id}|${p.product}`)
    );
    for (const m of (mem ?? []) as any[]) {
      console.log(
        `    membership role=${m.role} rooftop=${m.rooftop_id} advisor_base=${live.has(`${m.rooftop_id}|advisor_base`)}`
      );
    }

    /* ---- the two loaders the screens actually call ------------------------ */
    const courses = await loadCourses(client as any);
    const sh = courses.find((c) => c.slug === course.slug);
    console.log(`\n  loadCourses: ${courses.length} courses visible`);
    console.log(
      sh
        ? `    Start Here -> totalModules=${sh.totalModules} totalItems=${sh.totalItems} completedItems=${sh.completedItems} pct=${sh.pct}`
        : `    Start Here NOT RETURNED`
    );

    const mp = await loadModules(client as any, course.id);
    console.log(`  loadModules: ${mp.length} modules for Start Here`);
    for (const m of mp)
      console.log(`    ${m.sortOrder}. ${m.name} — totalItems=${m.totalItems} completedItems=${m.completedItems} pct=${m.pct} itemsDone=${m.itemsDone} hasQuiz=${m.hasQuiz}`);

    const { items, total } = await loadModuleItems(client as any, m1.id, 100);
    console.log(`\n  loadModuleItems("${m1.name}"): total=${total}, items returned=${items.length}`);
    for (const it of items)
      console.log(`    [${it.type}] "${it.title}" body=${it.body ? `${it.body.length} chars` : "NULL"} isVideo=${it.isVideo}`);
    if (items.length === 0)
      console.log(`    NOTHING RETURNED — the deck renders the film placeholder and no cards.`);

    const verdict =
      items.length === trueRows
        ? "sees every row"
        : items.length === 0
          ? "SEES NOTHING"
          : `sees ${items.length} of ${trueRows}`;
    console.log(`\n  VERDICT: ${verdict}`);
    await client.auth.signOut();
  }
  console.log("=".repeat(76));
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
