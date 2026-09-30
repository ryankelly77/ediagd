/* ============================================================================
   EDIAGD — Beaumont-first: F3 and F6, proven as their viewers

     export SB_URL=http://127.0.0.1:55321 \
            SB_KEY=<local service role> SB_ANON_KEY=<local anon>
     npm run accept:beaumont

   Local Supabase carrying the production restore with 0147-0149 applied.
   It writes (a scratch swell/schedule/closure fixture, removed after) and
   refuses any non-local URL.

   F3 — the "whose book is this" disclosure:
     1  a MAPPED advisor (op 400025), over PostgREST as `authenticated`, gets
        the roster name back from my_book_owner() — the disclosure can now
        render for the one role it exists to protect
     2  an UNMAPPED account (manager-only) gets null — nothing invented
     3  the same advisor still cannot read dms_advisor itself: zero rows, and
        the page no longer swallows that refusal as "no roster row"

   F6 — the last surface reading current_len raw:
     4  a lapsed advisor whose gap is entirely STORE CLOSURES reads as ALIVE
        through loadAdvisorDetails — the quick fix would have called this
        live streak dead, which is why the plan said do it properly
     5  the same advisor with the closures REMOVED reads 0 while the stored
        row still says 7 — the corpse no longer renders
   ============================================================================ */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadAdvisorDetails } from "@/lib/admin-advisor-detail";
import type { IsoDate } from "@/lib/gamification/streak";

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
  const password = `bmt-${userId.slice(0, 8)}-scratch`;
  await service.auth.admin.updateUserById(userId, { password, email_confirm: true });
  const { data: u } = await service.auth.admin.getUserById(userId);
  if (!u.user?.email) throw new Error("no email");
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email: u.user.email, password });
  if (error) throw new Error(`signIn: ${error.message}`);
  return client;
}

const MAPPED_ADVISOR = "921e2537-54c8-4398-9d1d-13b93e70cd97"; // advisor, op 400025
const MANAGER_ONLY = "7323cabd-ff2e-4c39-aa74-0db4a634495f"; // no advisor membership
const ADMIN = "78929620-f92b-416f-80ac-41fcc3a6e3e8"; // admin at CDJR
const CDJR = "e5847ebd-4e03-4dba-b39e-b857fe58978c";
const F6_USER = "645a4739-d5b4-41b5-9413-4e3495e1fb67"; // scratch fixture target

const iso = (d: Date): IsoDate => d.toISOString().slice(0, 10) as IsoDate;
const daysAgo = (n: number): IsoDate => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return iso(d);
};

async function main() {
  /* ---- F3 ---------------------------------------------------------------- */
  {
    const asAdvisor = await signedInAs(MAPPED_ADVISOR);
    const { data: owner, error } = await asAdvisor.rpc("my_book_owner");
    assert(
      !error && typeof owner === "string" && owner.includes("Hill"),
      `mapped advisor gets the book owner's roster name over PostgREST (got "${owner ?? error?.message}")`
    );

    const { data: direct } = await asAdvisor.from("dms_advisor").select("display_name").limit(5);
    assert(
      (direct ?? []).length === 0,
      "the advisor still cannot read dms_advisor itself — the function is the only door"
    );

    const asManager = await signedInAs(MANAGER_ONLY);
    const { data: none, error: noneErr } = await asManager.rpc("my_book_owner");
    assert(
      !noneErr && (none === null || none === ""),
      `an unmapped account gets nothing back — no name is invented (got "${none ?? noneErr?.message}")`
    );
  }

  /* ---- F6 ---------------------------------------------------------------- */
  {
    /* The fixture: a 7-day streak that last completed four days ago, a
       seven-day work week (so every day since is a scheduled work day), and
       the store shut on ALL the gap days including today. Alive by closure,
       dead the instant the closures vanish — the sharpest possible split. */
    const gapDays = [daysAgo(3), daysAgo(2), daysAgo(1), daysAgo(0)];

    const { data: origSwell } = await service
      .from("swell")
      .select("*")
      .eq("user_id", F6_USER)
      .maybeSingle();
    const { data: origSchedule } = await service
      .from("work_schedule")
      .select("*")
      .eq("user_id", F6_USER)
      .maybeSingle();

    await service.from("swell").upsert(
      {
        user_id: F6_USER,
        current_len: 7,
        longest_len: 7,
        last_completed_on: daysAgo(4),
        paddle_out_available: 0,
        paddle_out_last_granted: null,
      },
      { onConflict: "user_id" }
    );
    await service.from("work_schedule").upsert(
      {
        user_id: F6_USER,
        works_mon: true,
        works_tue: true,
        works_wed: true,
        works_thu: true,
        works_fri: true,
        works_sun: true,
        saturday_mode: "every",
      },
      { onConflict: "user_id" }
    );
    await service
      .from("rooftop_closed_day")
      .delete()
      .eq("rooftop_id", CDJR)
      .eq("label", "F6 acceptance");
    for (const day of gapDays) {
      /* A confirmed closure must be STAMPED — closed_day_confirmed_is_stamped
         refuses an unstamped one, which is how this fixture's first version
         silently failed. Errors are checked now: an acceptance whose setup
         can fail silently is a check that cannot fail honestly. */
      const { error: closeErr } = await service.from("rooftop_closed_day").insert({
        rooftop_id: CDJR,
        closed_on: day,
        label: "F6 acceptance",
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
      });
      if (closeErr) throw new Error(`closure fixture: ${closeErr.message}`);
    }

    try {
      const asAdmin = await signedInAs(ADMIN);
      const today = daysAgo(0);

      const withClosures = await loadAdvisorDetails(
        asAdmin as never,
        [F6_USER],
        today,
        CDJR
      );
      assert(
        withClosures.get(F6_USER)?.swell?.current === 7,
        `a streak bridged by store closures reads ALIVE at 7 (got ${withClosures.get(F6_USER)?.swell?.current})`
      );

      await service
        .from("rooftop_closed_day")
        .delete()
        .eq("rooftop_id", CDJR)
        .eq("label", "F6 acceptance");

      const withoutClosures = await loadAdvisorDetails(
        asAdmin as never,
        [F6_USER],
        today,
        CDJR
      );
      assert(
        withoutClosures.get(F6_USER)?.swell?.current === 0,
        `the same gap with no closures reads 0 while the stored row still says 7 (got ${withoutClosures.get(F6_USER)?.swell?.current})`
      );
      const { data: storedNow } = await service
        .from("swell")
        .select("current_len")
        .eq("user_id", F6_USER)
        .maybeSingle();
      assert(
        Number(storedNow?.current_len) === 7,
        "the stored number was never touched — display moved, the ledger did not"
      );
    } finally {
      await service
        .from("rooftop_closed_day")
        .delete()
        .eq("rooftop_id", CDJR)
        .eq("label", "F6 acceptance");
      if (origSwell) await service.from("swell").upsert(origSwell, { onConflict: "user_id" });
      else await service.from("swell").delete().eq("user_id", F6_USER);
      if (origSchedule)
        await service.from("work_schedule").upsert(origSchedule, { onConflict: "user_id" });
      else await service.from("work_schedule").delete().eq("user_id", F6_USER);
      console.log("\n  (teardown) F6 fixture removed\n");
    }
  }

  console.log(`  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`\n  acceptance crashed: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
