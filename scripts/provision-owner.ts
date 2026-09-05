/* ============================================================================
   EDIAGD — grant platform ownership, and wire the advisor view

   THE INTENDED PATH, WRITTEN DOWN. 0015 models platform ownership as a USER
   property (app_user.is_platform_owner), not a membership role, and guards it
   with a BEFORE trigger: anyone whose auth.uid() is not null must already be an
   owner to set it. The service role and the SQL editor both have a NULL
   auth.uid(), which is how the first owner ever gets made — so this script runs
   with the service key, server-side, and never in a browser.

   That trigger is the reason this exists as a script rather than a note in
   somebody's head. There is no provisioning function in any migration; Ryan was
   granted by hand-SQL, and the next owner would have been too.

   ---------------------------------------------------------------------------
   WHAT --advisor DOES, AND WHAT IT DOES NOT SHARE
   ---------------------------------------------------------------------------
   An owner has no advisor rows of their own, so /today and /advisor have
   nothing to show them. Both Ryan and Mitch look at the advisor experience
   through a real advisor's numbers, which is a membership carrying that
   advisor's op_code_id.

   THE OP CODE IS THE ONLY THING SHARED. It selects which rows of
   advisor_op_metric feed the screens — attach rates, Eddie's Pick, the focus
   service. Everything personal is keyed on user_id and stays separate:
   work_schedule, swell (the streak), daily_completion, saved_content and
   content_progress are all per-user. Two owners pointed at one op code see the
   same NUMBERS and keep their own streak, their own saves and their own
   progress. Worth knowing before assuming a shared login's worth of state.

     npm run provision:owner -- --email=someone@example.com --name="A Person" --dry
     npm run provision:owner -- --email=someone@example.com
     npm run provision:owner -- --email=someone@example.com --advisor-like=ryan@pearanalytics.com
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});

const args = process.argv.slice(2);
const arg = (k: string) =>
  args.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=");
const EMAIL = arg("email");
/** Copy this user's memberships (roles, rooftop, op_code) onto the new owner. */
const LIKE = arg("advisor-like");
/**
 * Display name. Without one the app_user row falls back to the email, and the
 * app greets people by it — "Aloha, someone@example.com" — because firstName()
 * splits on whitespace and an address has none. It also lands in the manager
 * roster's name map, so it is not only the greeting that reads wrong.
 */
const NAME = arg("name");
const DRY = args.includes("--dry");

/*
 * CHECKED INSIDE main(), not at module level.
 *
 * A module-level `process.exit` narrowed this for the old IIFE, because an IIFE
 * is an expression evaluated in place. A function DECLARATION is hoisted, so
 * TypeScript can no longer assume the check ran first — and it is right to
 * refuse.
 */
function requireEmail(): string {
  if (!EMAIL) {
    console.error("  --email= is required.\n");
    process.exit(1);
  }
  return EMAIL;
}

/** Page the auth list; there is no server-side email filter on listUsers. */
async function findByEmail(email: string) {
  const wanted = email.trim().toLowerCase();
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === wanted);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
  }
}

async function main() {
  /* ---- 1. The auth user must already exist ------------------------------- */
  /*
   * THIS SCRIPT DOES NOT CREATE ACCOUNTS OR TOUCH PASSWORDS. The invite is sent
   * from Supabase Auth, the person sets their own credential, and this only
   * grants what that account may see. Minting a user here would mean this
   * script deciding who exists, which is a bigger power than it needs.
   */
  const user = await findByEmail(requireEmail());
  if (!user) {
    console.error(`  No auth user for ${requireEmail()}.`);
    console.error("  Invite them from Supabase Auth first, then re-run this.\n");
    process.exit(1);
  }

  const confirmed = Boolean(user.email_confirmed_at);
  console.log(`  auth user: ${user.email}  id=${user.id}`);
  console.log(
    `  invite ${confirmed ? "accepted" : "STILL PENDING — the grant lands anyway and applies at first sign-in"}`
  );

  /* ---- 2. app_user row --------------------------------------------------- */
  // The row is normally created on first sign-in; an invited user who has not
  // signed in yet may not have one, and the flag lives on it.
  const { data: existing } = await sb
    .from("app_user")
    .select("id, full_name, is_platform_owner")
    .eq("id", user.id)
    .maybeSingle();

  if (!existing) {
    console.log("  app_user: none yet — creating it so the flag has a home");
    if (!DRY) {
      const { error } = await sb
        .from("app_user")
        .insert({ id: user.id, full_name: NAME ?? user.email });
      if (error) throw new Error(`app_user insert: ${error.message}`);
    }
  } else {
    console.log(
      `  app_user: exists (${JSON.stringify(existing.full_name)}), owner=${existing.is_platform_owner}`
    );
  }

  /* ---- 3. The grant ------------------------------------------------------ */
  if (!DRY) {
    const { error } = await sb
      .from("app_user")
      .update({
        is_platform_owner: true,
        // Only when given, so a re-run never overwrites a name somebody has
        // since set on their own profile.
        ...(NAME ? { full_name: NAME } : {}),
      })
      .eq("id", user.id);
    // 42501 is guard_platform_owner_flag() refusing. It should never fire for
    // the service role — if it does, SB_KEY is not the service key.
    if (error) {
      throw new Error(
        error.code === "42501"
          ? `refused by the 0015 guard — SB_KEY is not the service role key: ${error.message}`
          : `grant: ${error.message}`
      );
    }
  }
  console.log(`  ${DRY ? "WOULD GRANT" : "GRANTED"} is_platform_owner`);

  /* ---- 4. Optionally mirror another account's memberships ---------------- */
  if (LIKE) {
    const model = await findByEmail(LIKE);
    if (!model) throw new Error(`--advisor-like: no auth user for ${LIKE}`);

    const { data: rows, error } = await sb
      .from("membership")
      .select("rooftop_id, role, op_code_id, active")
      .eq("user_id", model.id)
      .eq("active", true);
    if (error) throw new Error(`read model memberships: ${error.message}`);
    if (!rows?.length) throw new Error(`--advisor-like: ${LIKE} has no active memberships`);

    console.log(`\n  mirroring ${rows.length} membership(s) from ${LIKE}:`);
    for (const r of rows) {
      console.log(
        `    ${r.role.padEnd(8)} rooftop=${r.rooftop_id} op_code=${r.op_code_id ?? "—"}`
      );
    }

    /*
     * ONE ROW AT A TIME, because one of them can legitimately fail and the
     * others must still land.
     *
     * 0049 puts a partial unique index on (rooftop_id, op_code_id) where the
     * membership is active: AN OPERATOR ID BELONGS TO ONE PERSON. Mirroring an
     * account that holds an op_code therefore cannot copy that row — two
     * claimants would both be told the same book is theirs, which is the exact
     * failure 0049 exists to prevent, and it fails silently in every screen
     * that keys on advisor_op_id alone.
     *
     * A single batched upsert made the whole mirror all-or-nothing, so the
     * admin and manager rows — which carry no op_code and collide with nothing
     * — were rolled back along with the advisor row. The roles that CAN be
     * granted are granted, and the one that cannot is reported as the decision
     * it actually is.
     */
    const skipped: { role: string; opCode: string }[] = [];
    if (!DRY) {
      for (const r of rows) {
        // Idempotent: (user_id, rooftop_id, role) is the natural key, so a
        // re-run updates the op_code rather than stacking duplicate rows.
        const { error: upsertError } = await sb.from("membership").upsert(
          {
            user_id: user.id,
            rooftop_id: r.rooftop_id,
            role: r.role,
            op_code_id: r.op_code_id,
            active: true,
          },
          { onConflict: "user_id,rooftop_id,role" }
        );
        if (!upsertError) continue;
        if (upsertError.message.includes("membership_op_code_one_claimant")) {
          skipped.push({ role: r.role, opCode: String(r.op_code_id) });
          continue;
        }
        throw new Error(`membership upsert (${r.role}): ${upsertError.message}`);
      }
    }
    console.log(`  ${DRY ? "WOULD MIRROR" : "MIRRORED"} ${rows.length - skipped.length} of ${rows.length}`);

    for (const sk of skipped) {
      console.log(
        `\n  NOT GRANTED — ${sk.role}, operator id ${sk.opCode}\n` +
          `    Already claimed by ${LIKE}, and 0049 allows one active claimant per\n` +
          `    operator id. Two would both be shown the same book as their own.\n` +
          `    Pick an unclaimed id from advisor_op_code_claims and pass it, or hand\n` +
          `    this one over with claim_advisor_op_code(), which deactivates the old\n` +
          `    membership and creates the new one atomically.`
      );
    }

    console.log(
      "\n  NOTE: an op_code shares the advisor's NUMBERS only.\n" +
        "        Streak, saves, progress and schedule are keyed on user_id, so two\n" +
        "        accounts never share those even when they share an operator id."
    );
  }

  /* ---- 5. Read it back --------------------------------------------------- */
  if (!DRY) {
    const { data: after } = await sb
      .from("app_user")
      .select("id, full_name, is_platform_owner")
      .eq("id", user.id)
      .maybeSingle();
    const { data: mem } = await sb
      .from("membership")
      .select("role, rooftop_id, op_code_id, active")
      .eq("user_id", user.id);

    console.log("\n  VERIFIED FROM THE DATABASE, not assumed:");
    console.log(`    is_platform_owner = ${after?.is_platform_owner}`);
    for (const m of mem ?? []) {
      console.log(
        `    ${m.role.padEnd(8)} rooftop=${m.rooftop_id} op_code=${m.op_code_id ?? "—"} active=${m.active}`
      );
    }
  }
  if (DRY) console.log("\n  (--dry: nothing was written)\n");
}

/*
 * NOT ON IMPORT.
 *
 * A bare IIFE runs the moment anything requires this file — which is how a test
 * that only wanted one helper triggered a full production import and truncated
 * 15 cue bodies. Nothing imports this today; the guard is for the person who
 * first wants to.
 */
if (require.main === module) {
  main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
}
