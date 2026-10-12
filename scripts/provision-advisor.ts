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
import {
  ensureAppUser,
  ensureMembership,
  ensureRooftopProduct,
  findAuthUserByEmail,
  opCodeHeldByOthers,
  resolveOperator,
  resolveRooftop,
  whoseBook,
  type Result,
  type Sb,
} from "./provisioning";

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

/*
 * findByEmail, resolveRooftop, the op-code checks and the whose-book read-back
 * now live in ./provisioning.ts, which scripts/provision-roster.ts imports too.
 * They were lifted rather than copied: one implementation of "is this mapping
 * safe", run by every script that provisions anybody.
 *
 * The shared versions RETURN a refusal instead of exiting, because the roster
 * runner has eight more people to report on. This script's contract is
 * unchanged — it still dies on the first one, through die() below.
 */
function must<T>(r: Result<T>): T {
  if (r.ok) return r.value;
  die(r.reason, r.hint);
}

async function main() {
  const { email, rooftop, op } = required();
  console.log(`\n  ${DRY ? "DRY RUN — nothing will be written" : "APPLYING"}\n`);

  /* ---- 1. The auth user must already exist ------------------------------ */
  const user = await findAuthUserByEmail(sb as unknown as Sb, email);
  if (!user) {
    die(
      `no auth user for ${email}`,
      "Invite them from Supabase Auth first (Authentication → Users → Invite), then re-run."
    );
  }
  const pending = !user.emailConfirmedAt;
  console.log(`  auth user     ${user.email}  id=${user.id}`);
  console.log(
    `  invite        ${pending ? "PENDING — the grant lands anyway and applies at first sign-in" : "accepted"}`
  );

  /* ---- 2. The rooftop --------------------------------------------------- */
  const roof = must(await resolveRooftop(sb as unknown as Sb, rooftop));
  console.log(`  rooftop       ${roof.name}  id=${roof.id}`);

  /* ---- 3. The op code, which is the dangerous one ----------------------- */
  const operator = must(await resolveOperator(sb as unknown as Sb, roof, op));
  must(await opCodeHeldByOthers(sb as unknown as Sb, op, user.id));

  /* ---- 4. app_user ------------------------------------------------------ */
  const appUserOutcome = must(
    await ensureAppUser(sb as unknown as Sb, user.id, NAME ?? user.email, DRY)
  );
  console.log(
    appUserOutcome === "exists"
      ? `  app_user      exists`
      : `  app_user      creating (${NAME ?? user.email})`
  );

  /* ---- 5. membership ---------------------------------------------------- */
  /*
   * ---- ONE TIGHTENING, AND IT IS NARROWER THAN IT FIRST WAS ---------------
   *
   * The lifted ensureMembership() still MAPS a book onto a membership that has
   * none — which is this script's documented job for Sztaba and Pinder — and
   * still reports an unchanged mapping as `exists`. What it no longer does is
   * silently move somebody from one operator's numbers to ANOTHER's, which
   * this script used to do on any re-run with a different --op-code.
   *
   * To genuinely repoint a book, clear the membership first, deliberately.
   */
  const memberOutcome = must(
    await ensureMembership(sb as unknown as Sb, user.id, roof.id, ROLE, op, DRY)
  );
  console.log(
    memberOutcome === "exists"
      ? `  membership    exists  role=${ROLE}  op_code=${op}`
      : `  membership    ${memberOutcome}  role=${ROLE}  op_code=${op}`
  );

  /* ---- 6. rooftop entitlement ------------------------------------------ */
  const prodOutcome = must(await ensureRooftopProduct(sb as unknown as Sb, roof.id, DRY));
  console.log(
    prodOutcome === "exists"
      ? `  entitlement   advisor_base already on ${roof.name}`
      : `  entitlement   creating advisor_base for ${roof.name}`
  );

  if (KEEP) console.log(`  retention     flagged --do-not-delete (see the note printed below)`);

  /* ======================================================================
     THE READ-BACK — what this advisor will actually see
     ====================================================================== */
  console.log(`\n  ${"─".repeat(70)}`);
  console.log(`  WHAT THEY WILL SEE${DRY ? "  (projected — nothing was written)" : ""}`);
  console.log(`  ${"─".repeat(70)}`);

  const book = whoseBook(operator, NAME ?? null);
  console.log(`\n  WHOSE BOOK`);
  console.log(`    op code ${op}  =  ${operator.displayName}`);
  console.log(`    last seen in the DMS feed: ${operator.lastSeen ?? "never"}`);
  console.log(
    `    ${book.nameMatches ? "matches the account name" : "DOES NOT match the account name — deliberate borrow, or a mistake?"}`
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
