/* ============================================================================
   EDIAGD — provision one advisor, and say whose numbers they will see

     npm run provision:advisor -- --email=a@b.com --name="A Person" \
       --rooftop="Doggett Ford" --op-code=500032 --dry
     npm run provision:advisor -- --email=… --name=… --rooftop=… --op-code=…

   ---------------------------------------------------------------------------
   WHY THIS EXISTS
   ---------------------------------------------------------------------------
   Nothing in the product creates an advisor. There is no invite flow, no
   trigger on auth.users, and no app-side insert into app_user or membership —
   every account so far was made by hand. That is four writes per advisor, and
   sixty advisors is two hundred and forty chances to point somebody at the
   wrong person's book.

   ---------------------------------------------------------------------------
   THE READ-BACK IS THE POINT, NOT THE WRITES
   ---------------------------------------------------------------------------
   The failure this is built for is not a write that fails. It is a write that
   SUCCEEDS and silently binds an advisor to a stranger's DMS book. Every one of
   the four accounts that existed before this script is in exactly that state,
   and nothing in the product would ever surface it: a mis-mapped advisor is
   indistinguishable from a deliberate test account.

   So this ends by naming the operator whose numbers the advisor will see, and
   by saying which of the three morning slots will actually fill. A provisioning
   tool that cannot answer "whose book is this" has not solved the problem — it
   has industrialised it. Ryan reads sixty of those lines and spots the wrong
   one; nothing else in the system can.

   THE NAME IS FOR THE CONSOLE, NEVER FOR A SCREEN. Product copy identifies
   nobody by name — see AGENTS.md. This is an operator report.

   ---------------------------------------------------------------------------
   IT DOES NOT CREATE ACCOUNTS OR TOUCH PASSWORDS
   ---------------------------------------------------------------------------
   Same posture as provision-owner.ts, for the same reason: the invite is sent
   from Supabase Auth, the person sets their own credential, and this only
   grants what that account may see. Minting users here would make this script
   the thing that decides who exists.

   ---------------------------------------------------------------------------
   IT REFUSES RATHER THAN GUESSES
   ---------------------------------------------------------------------------
   No auth user, unknown rooftop, an op code that is not a real operator at that
   rooftop, or an op code already held by somebody else — each is a hard stop
   with a non-zero exit. A guess here is a person reading a colleague's numbers
   for months.
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});

const args = process.argv.slice(2);
const arg = (k: string) =>
  args.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=");
const EMAIL = arg("email");
const NAME = arg("name");
const ROOFTOP = arg("rooftop");
const OP = arg("op-code");
const ROLE = (arg("role") ?? "advisor") as "advisor" | "manager";
const DRY = args.includes("--dry");
/** Survives cleanup sweeps — used for the Apple review account. */
const KEEP = args.includes("--do-not-delete");

const MIN_ROS_FALLBACK = 20;

function die(msg: string, hint?: string): never {
  console.error(`\n  REFUSING — ${msg}`);
  if (hint) console.error(`  ${hint}`);
  console.error("");
  process.exit(1);
}

function required(): { email: string; rooftop: string; op: string } {
  if (!EMAIL) die("--email= is required");
  if (!ROOFTOP) die("--rooftop= is required");
  if (!OP) die("--op-code= is required", "Pick one with a live book — see reports/dumps.");
  return { email: EMAIL, rooftop: ROOFTOP, op: OP };
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
  const { email, rooftop, op } = required();
  console.log(`\n  ${DRY ? "DRY RUN — nothing will be written" : "APPLYING"}\n`);

  /* ---- 1. The auth user must already exist ------------------------------ */
  const user = await findByEmail(email);
  if (!user) {
    die(
      `no auth user for ${email}`,
      "Invite them from Supabase Auth first (Authentication → Users → Invite), then re-run."
    );
  }
  const pending = !user.email_confirmed_at;
  console.log(`  auth user     ${user.email}  id=${user.id}`);
  console.log(
    `  invite        ${pending ? "PENDING — the grant lands anyway and applies at first sign-in" : "accepted"}`
  );

  /* ---- 2. The rooftop --------------------------------------------------- */
  const { data: roofs, error: roofErr } = await sb
    .from("rooftop")
    .select("id, name")
    .eq("name", rooftop);
  if (roofErr) throw new Error(`rooftop: ${roofErr.message}`);
  if (!roofs?.length) die(`no rooftop named ${JSON.stringify(rooftop)}`);
  if (roofs.length > 1) die(`${roofs.length} rooftops named ${JSON.stringify(rooftop)}`);
  const roof = roofs[0];
  console.log(`  rooftop       ${roof.name}  id=${roof.id}`);

  /* ---- 3. The op code, which is the dangerous one ----------------------- */
  const { data: operator, error: opErr } = await sb
    .from("dms_advisor")
    .select("advisor_op_id, display_name, last_seen, departed_on")
    .eq("rooftop_id", roof.id)
    .eq("advisor_op_id", op)
    .maybeSingle();
  if (opErr) throw new Error(`dms_advisor: ${opErr.message}`);
  if (!operator) {
    die(
      `op code ${op} is not an operator at ${roof.name}`,
      "An op code from another rooftop resolves to nothing and the pitch slot stays empty forever."
    );
  }
  if (operator.departed_on) {
    die(`op code ${op} (${operator.display_name}) departed on ${operator.departed_on}`);
  }

  /* Already held by somebody else? */
  const { data: held, error: heldErr } = await sb
    .from("membership")
    .select("user_id, app_user:user_id(full_name)")
    .eq("op_code_id", op)
    .eq("active", true);
  if (heldErr) throw new Error(`membership check: ${heldErr.message}`);
  const others = (held ?? []).filter((h) => h.user_id !== user.id);
  if (others.length) {
    const who = others
      .map((h) => (h.app_user as { full_name?: string } | null)?.full_name ?? h.user_id.slice(0, 8))
      .join(", ");
    die(
      `op code ${op} is already held by ${who}`,
      "Two accounts on one book is legitimate for owners, but say so explicitly rather than by accident."
    );
  }

  /* ---- 4. app_user ------------------------------------------------------ */
  const { data: appUser } = await sb
    .from("app_user")
    .select("id, full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!appUser) {
    console.log(`  app_user      creating (${NAME ?? user.email})`);
    if (!DRY) {
      const { error } = await sb
        .from("app_user")
        .insert({ id: user.id, full_name: NAME ?? user.email });
      if (error) throw new Error(`app_user insert: ${error.message}`);
    }
  } else {
    console.log(`  app_user      exists (${JSON.stringify(appUser.full_name)})`);
  }

  /* ---- 5. membership ---------------------------------------------------- */
  const { data: mine } = await sb
    .from("membership")
    .select("id, rooftop_id, role, op_code_id, active")
    .eq("user_id", user.id)
    .eq("rooftop_id", roof.id)
    .eq("role", ROLE)
    .maybeSingle();
  if (mine) {
    console.log(`  membership    exists — op_code ${mine.op_code_id ?? "(none)"} -> ${op}`);
    if (!DRY) {
      const { error } = await sb
        .from("membership")
        .update({ op_code_id: op, active: true })
        .eq("id", mine.id);
      if (error) throw new Error(`membership update: ${error.message}`);
    }
  } else {
    console.log(`  membership    creating  role=${ROLE}  op_code=${op}`);
    if (!DRY) {
      const { error } = await sb.from("membership").insert({
        user_id: user.id,
        rooftop_id: roof.id,
        role: ROLE,
        active: true,
        op_code_id: op,
      });
      if (error) throw new Error(`membership insert: ${error.message}`);
    }
  }

  /* ---- 6. rooftop entitlement ------------------------------------------ */
  const { data: prod } = await sb
    .from("rooftop_product")
    .select("product")
    .eq("rooftop_id", roof.id)
    .eq("product", "advisor_base")
    .maybeSingle();
  if (!prod) {
    console.log(`  entitlement   creating advisor_base for ${roof.name}`);
    if (!DRY) {
      const { error } = await sb
        .from("rooftop_product")
        .insert({ rooftop_id: roof.id, product: "advisor_base" });
      if (error) throw new Error(`rooftop_product insert: ${error.message}`);
    }
  } else {
    console.log(`  entitlement   advisor_base already on ${roof.name}`);
  }

  if (KEEP) console.log(`  retention     flagged --do-not-delete (see the note printed below)`);

  /* ======================================================================
     THE READ-BACK — what this advisor will actually see
     ====================================================================== */
  console.log(`\n  ${"─".repeat(70)}`);
  console.log(`  WHAT THEY WILL SEE${DRY ? "  (projected — nothing was written)" : ""}`);
  console.log(`  ${"─".repeat(70)}`);

  console.log(`\n  WHOSE BOOK`);
  console.log(`    op code ${op}  =  ${operator.display_name}`);
  console.log(`    last seen in the DMS feed: ${operator.last_seen ?? "never"}`);
  const nameMatches =
    (NAME ?? "").toLowerCase().split(/\s+/).some((w) => w.length > 2 &&
      (operator.display_name ?? "").toLowerCase().includes(w));
  console.log(
    `    ${nameMatches ? "matches the account name" : "DOES NOT match the account name — deliberate borrow, or a mistake?"}`
  );

  /* The latest period for this rooftop, and the floor the loop applies. */
  const { data: periods } = await sb
    .from("perf_period")
    .select("id, starts_on, ends_on")
    .eq("rooftop_id", roof.id)
    .order("starts_on", { ascending: false })
    .limit(1);
  const period = periods?.[0];
  if (!period) {
    console.log(`\n  NO PERFORMANCE PERIOD for this rooftop — the pitch slot will be EMPTY.`);
  } else {
    const { data: floorRaw } = await sb.rpc("min_ros_for_coaching");
    const floor = Number(floorRaw ?? MIN_ROS_FALLBACK);
    const { data: attach } = await sb
      .from("advisor_family_attach")
      .select("family, advisor_ros, attach_rate_pct")
      .eq("period_id", period.id)
      .eq("rooftop_id", roof.id)
      .eq("advisor_op_id", op);
    const { data: bench } = await sb
      .from("family_store_benchmark")
      .select("family, store_avg_pct")
      .eq("period_id", period.id)
      .eq("rooftop_id", roof.id);
    const { data: supply } = await sb
      .from("family_pitch_supply")
      .select("family, film_count");

    const avg = new Map((bench ?? []).map((b) => [b.family, Number(b.store_avg_pct)]));
    const films = new Map((supply ?? []).map((s) => [s.family, Number(s.film_count)]));
    const ros = Math.max(0, ...(attach ?? []).map((a) => Number(a.advisor_ros ?? 0)));

    console.log(`\n  THE BOOK  (period ${period.starts_on} → ${period.ends_on})`);
    console.log(`    repair orders      ${ros}`);
    console.log(
      `    coaching floor     ${floor}  — ${ros >= floor ? "PASSES" : "BELOW: no family derives, pitch slot EMPTY"}`
    );

    const ranked = (attach ?? [])
      .filter((a) => Number(a.advisor_ros ?? 0) >= floor)
      .filter((a) => films.has(a.family))
      .map((a) => {
        const gap = Math.max((avg.get(a.family) ?? 0) - Number(a.attach_rate_pct ?? 0), 0);
        return { family: a.family, missed: (gap / 100) * Number(a.advisor_ros ?? 0), gap };
      })
      .filter((r) => r.missed > 0)
      .sort((a, b) => b.missed - a.missed);

    console.log(`\n  RANKED FAMILIES  (how the loop picks the focus)`);
    if (!ranked.length) {
      console.log(`    none — nothing rankable, the pitch slot will be EMPTY`);
    } else {
      ranked.slice(0, 5).forEach((r, i) => {
        console.log(
          `    ${i === 0 ? "->" : "  "} ${r.family.padEnd(20)} ${r.missed.toFixed(2)} missed ROs` +
            `   ${r.gap.toFixed(1)}pp   ${films.get(r.family)} films`
        );
      });
      if (ranked.length > 5) console.log(`       … and ${ranked.length - 5} more`);
    }

    /* ---- the three slots --------------------------------------------- */
    const { count: mindset } = await sb
      .from("content")
      .select("id", { count: "exact", head: true })
      .eq("type", "advisor_video")
      .eq("placement", "daily_lifestyle")
      .eq("collection", "Mindset")
      .eq("status", "published")
      .is("retired_at", null)
      .not("mux_playback_id", "is", null);
    const { count: items } = await sb
      .from("certification")
      .select("id", { count: "exact", head: true })
      .eq("is_core", true)
      .eq("active", true);

    const top = ranked[0];
    const pitchFilms = top ? (films.get(top.family) ?? 0) : 0;
    const slot1 = Number(mindset ?? 0) > 0;
    const slot2 = Boolean(top) && pitchFilms > 0;
    const slot3 = Number(items ?? 0) > 0;

    console.log(`\n  THE MORNING`);
    console.log(`    1 mindset   ${slot1 ? "FILLS" : "EMPTY"}   ${mindset ?? 0} films in the pool`);
    console.log(
      `    2 pitch     ${slot2 ? "FILLS" : "EMPTY"}   ${top ? `${top.family}, ${pitchFilms} films` : "no family derives"}`
    );
    console.log(`    3 item      ${slot3 ? "FILLS" : "EMPTY"}   ${items ?? 0} active core tracks`);

    const kind = slot2 ? "normal (three slots)" : "two_slot — mindset and item only";
    console.log(`\n    => ${kind}`);
    if (!slot2) {
      console.log(
        `\n    THE PITCH SLOT WILL BE EMPTY. That is the difference between a\n` +
          `    working product and one that looks thin. Fix the book before inviting.`
      );
    }
  }

  console.log(
    `\n  ${DRY ? "Re-run without --dry to apply." : "Done. They set their schedule at first sign-in; nothing else is needed."}`
  );
  if (KEEP && !DRY) {
    console.log(
      `\n  DO NOT DELETE: this account is referenced outside the product\n` +
        `  (App Store review). Removing it breaks a submission, not a test.`
    );
  }
  console.log("");
}

main().catch((e) => {
  console.error(`\n  FAILED: ${e.message}\n`);
  process.exit(1);
});
