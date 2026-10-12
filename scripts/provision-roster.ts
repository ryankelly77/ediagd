/* ============================================================================
   EDIAGD — provision a whole store, then invite. One command.

     set -a; source .env.local; set +a
     SB_URL="$NEXT_PUBLIC_SUPABASE_URL" SB_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
       npm run provision:roster -- --file=reports/beaumont-roster.csv
     …                            --file=… --apply
     …                            --file=… --apply --resend

   ---------------------------------------------------------------------------
   WHY THIS EXISTS: THE OTHER TWO ARE BUILT THE WRONG WAY ROUND
   ---------------------------------------------------------------------------
   Ryan, 12 October: "I should provision them first in the system based on what
   they are, then send the invites. I don't want them signing up and waiting on
   me for anything."

   `provision:advisor` and `grant:beaumont-roles` both REFUSE until the auth
   user exists, and both are run one person at a time after that person has
   accepted their invite. So the order today is: invite, wait, chase, provision
   — and for the four Beaumont people with no book there is no way to write
   their rows before they sign in at all. An advisor who accepts an invite
   before their membership exists lands on an app with nothing in it and waits
   for Ryan.

   This inverts it. One pass, one file, per person: make the account, then
   write everything that account needs, before the invite email is read.

   ---------------------------------------------------------------------------
   THE AUTH USER STILL HAS TO COME FIRST, AND THAT IS NOT NEGOTIABLE
   ---------------------------------------------------------------------------
   `app_user.id` IS the auth id — it is the same uuid, and there is no app_user
   row to write until Supabase has minted one. So the order inside a row is
   fixed: invite, then rows.

   WHAT "FIRST" COSTS, MEASURED IN THE ONLY UNIT THAT MATTERS. The gap between
   those two calls is the gap between two statements inside one loop iteration
   — under a second, and not a window anybody can act in. The old gap was the
   hours or days between an invite being sent and a person accepting it, and
   THAT is the one somebody landed in. A person reading their invite email is
   minutes away at best; their rows were written before the email was sent.

   A row that REFUSES sends no invite. Nobody is invited into an account that
   could not be set up — which is the whole point, and is why every check runs
   before `inviteUserByEmail`.

   ---------------------------------------------------------------------------
   IT SENDS THE SAME EMAIL THE DASHBOARD DOES
   ---------------------------------------------------------------------------
   `auth.admin.inviteUserByEmail` is what the Authentication → Users → Invite
   button calls. The Step 1 / Step 2 template Ryan already approved goes out
   unchanged; this does not compose an email and must never start to.

   ---------------------------------------------------------------------------
   THE CHECKS ARE THE OTHER SCRIPTS', NOT A SECOND COPY
   ---------------------------------------------------------------------------
   Every refusal `provision:advisor` has — unknown rooftop, an op code that is
   not a real operator at that rooftop, an op code already held by somebody
   else — and the whose-book read-back, come from `scripts/provisioning.ts`,
   which those scripts now import too. There is one implementation of "is this
   mapping safe", and all three run it.

   Idempotent: an existing row is reported, never duplicated and never
   downgraded; an op code that would be repointed is a refusal, not an update.
   An accepted account is never re-invited. `--resend` re-sends only to accounts
   that have not yet set a password.

   DRY RUN IS THE DEFAULT. Neither flag, or `--dry`, prints the whole plan and
   sends nothing, writes nothing.
   ============================================================================ */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  describeRole,
  ensureAppUser,
  ensureMembership,
  ensureRooftopProduct,
  findAuthUserByEmail,
  opCodeHeldByOthers,
  orgRooftops,
  parseRoles,
  resolveOperator,
  resolveRooftop,
  whoseBook,
  type Rooftop,
  type Sb,
} from "./provisioning";

const URL = process.env.SB_URL!;
const KEY = process.env.SB_KEY!;
if (!URL || !KEY) {
  console.error("\n  SB_URL and SB_KEY are required.\n");
  process.exit(1);
}

const argv = process.argv.slice(2);
const val = (flag: string): string | null => {
  const hit = argv.find((a) => a.startsWith(`--${flag}=`));
  return hit ? hit.slice(flag.length + 3) : null;
};
const FILE = val("file");
const APPLY = argv.includes("--apply");
const RESEND = argv.includes("--resend");
const DRY = !APPLY;

if (!FILE) {
  console.error("\n  --file=<roster.csv> is required.\n");
  process.exit(1);
}
if (APPLY && argv.includes("--dry")) {
  console.error("\n  --apply and --dry together. Pick one.\n");
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } }) as unknown as Sb;

/* ---------------------------------------------------------------------------
   The file
--------------------------------------------------------------------------- */

type RosterRow = { line: number; email: string; name: string; rooftop: string; roles: string };

const DEFAULT_ROOFTOP = "Doggett Ford of Beaumont";

/**
 * A plain-comma CSV with a header. No quoting, no embedded commas — the roles
 * column uses `;` as its own separator precisely so a cell never needs them.
 * If a roster ever needs a comma inside a field, that is the moment to reach
 * for a parser, not the moment to add an escape nobody will remember.
 */
function readRoster(path: string): RosterRow[] {
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (!lines.length) throw new Error(`${path} is empty`);
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const need = ["email", "name", "rooftop", "roles"];
  for (const col of need) {
    if (!header.includes(col)) throw new Error(`${path}: header is missing a "${col}" column`);
  }
  const idx = Object.fromEntries(need.map((c) => [c, header.indexOf(c)]));
  return lines.slice(1).map((line, i) => {
    const cells = line.split(",").map((c) => c.trim());
    return {
      line: i + 2,
      email: (cells[idx.email] ?? "").toLowerCase(),
      name: cells[idx.name] ?? "",
      rooftop: cells[idx.rooftop] || DEFAULT_ROOFTOP,
      roles: cells[idx.roles] ?? "",
    };
  });
}

/**
 * Is this an address we are willing to send a real email to?
 *
 * THE DRAFT ROSTER SHIPS WITH `FILL-IN` IN EVERY EMAIL CELL, and this is what
 * makes that safe: a half-completed roster cannot be applied, because every
 * unfilled row refuses before it reaches the invite. The reserved domains are
 * refused for the same reason — `example.com` and `.invalid` are what somebody
 * types when they are filling a column in rather than naming a person.
 */
const RESERVED = /@(example\.(com|org|net)|test|invalid|localhost)$/i;
function emailUsable(email: string): string | null {
  if (!email) return "no email";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return `${JSON.stringify(email)} is not an email address — the draft roster ships with FILL-IN here`;
  }
  if (RESERVED.test(email)) return `${email} is a reserved test domain`;
  return null;
}

/* ---------------------------------------------------------------------------
   One row
--------------------------------------------------------------------------- */

type Outcome = "refused" | "invited" | "resent" | "already-accepted" | "already-invited";

type Plan = {
  row: RosterRow;
  outcome: Outcome;
  /** Why, when refused. */
  reason?: string;
  hint?: string;
  lines: string[];
};

async function planAndApply(row: RosterRow): Promise<Plan> {
  const lines: string[] = [];
  const fail = (reason: string, hint?: string): Plan => ({ row, outcome: "refused", reason, hint, lines });

  /* ---- 1. The file's own fields ---------------------------------------- */
  const emailProblem = emailUsable(row.email);
  if (emailProblem) return fail(emailProblem);
  if (!row.name) return fail("no name — the invite carries it as the display name");

  const roles = parseRoles(row.roles);
  if (!roles.ok) return fail(roles.reason, roles.hint);

  /* ---- 2. The rooftop --------------------------------------------------- */
  const roof = await resolveRooftop(sb, row.rooftop);
  if (!roof.ok) return fail(roof.reason, roof.hint);

  /* ---- 3. Expand the roles into concrete grants ------------------------- */
  type Grant = { rooftop: Rooftop; role: string; opCode: string | null };
  const grants: Grant[] = [];
  for (const r of roles.value) {
    if (r.kind === "admin" && r.scope === "org") {
      if (!roof.value.orgId) return fail(`${roof.value.name} has no org, so admin:org has no scope`);
      const roofs = await orgRooftops(sb, roof.value.orgId);
      if (!roofs.ok) return fail(roofs.reason, roofs.hint);
      for (const rr of roofs.value) grants.push({ rooftop: rr, role: "admin", opCode: null });
      lines.push(`admin at ${roofs.value.length} rooftop(s) in the org — never is_platform_owner`);
      continue;
    }
    if (r.kind === "admin") {
      grants.push({ rooftop: roof.value, role: "admin", opCode: null });
      continue;
    }
    if (r.kind === "manager") {
      grants.push({ rooftop: roof.value, role: "manager", opCode: null });
      continue;
    }
    grants.push({ rooftop: roof.value, role: "advisor", opCode: r.opCode });
  }

  /* ---- 4. EVERY CHECK BEFORE THE INVITE --------------------------------
     The op code is the dangerous one, so it is resolved and read back before
     a single email goes out. A refusal here must leave no trace at all. */
  const existing = await findAuthUserByEmail(sb, row.email);

  for (const g of grants) {
    if (g.role !== "advisor" || !g.opCode) continue;
    const op = await resolveOperator(sb, g.rooftop, g.opCode);
    if (!op.ok) return fail(op.reason, op.hint);
    const free = await opCodeHeldByOthers(sb, g.opCode, existing?.id ?? null);
    if (!free.ok) return fail(free.reason, free.hint);
    const book = whoseBook(op.value, row.name);
    lines.push(book.line);
  }
  for (const g of grants) {
    if (g.role === "advisor" && !g.opCode) {
      lines.push("no op code — the two-slot morning, by design");
    }
  }

  /*
   * A dry run stops here for a row whose account does not exist yet: the
   * membership checks below need a user id, and inventing one to project
   * against would be a plan of something that cannot happen. The grants are
   * already listed; what a dry run cannot say for a new person is whether a
   * membership already exists, and for a new person it does not.
   */
  const roleSummary = roles.value.map(describeRole).join(" · ");

  /* ---- 5. The invite ---------------------------------------------------- */
  let userId = existing?.id ?? null;
  let outcome: Outcome;

  if (!existing) {
    outcome = "invited";
    if (!DRY) {
      const { data, error } = await sb.auth.admin.inviteUserByEmail(row.email, {
        data: { full_name: row.name },
      });
      if (error) return fail(`invite failed: ${error.message}`);
      userId = data.user?.id ?? null;
      if (!userId) return fail("invite returned no user id");
    }
  } else if (existing.emailConfirmedAt) {
    /* They have set a password. Re-inviting would send them a fresh link for
       an account they already own — confusing at best, and on some templates
       it reads as "your account was reset". */
    outcome = "already-accepted";
  } else if (RESEND) {
    outcome = "resent";
    if (!DRY) {
      const { error } = await sb.auth.admin.inviteUserByEmail(row.email, {
        data: { full_name: row.name },
      });
      if (error) return fail(`re-invite failed: ${error.message}`);
    }
  } else {
    outcome = "already-invited";
    lines.push("invite already sent and not yet accepted — pass --resend to send it again");
  }

  /* ---- 6. The rows ------------------------------------------------------ */
  if (DRY && !userId) {
    lines.push(`would write: app_user, ${grants.length} membership(s), advisor_base on ${roof.value.name}`);
    return { row, outcome, lines: [roleSummary, ...lines] };
  }
  if (!userId) return fail("no user id after the invite step");

  const appUser = await ensureAppUser(sb, userId, row.name, DRY);
  if (!appUser.ok) return fail(appUser.reason, appUser.hint);
  lines.push(`app_user ${appUser.value}`);

  for (const g of grants) {
    const m = await ensureMembership(sb, userId, g.rooftop.id, g.role, g.opCode, DRY);
    if (!m.ok) return fail(m.reason, m.hint);
    lines.push(
      `${m.value.padEnd(7)} ${g.role.padEnd(8)} at ${g.rooftop.name}` +
        (g.opCode ? ` on op ${g.opCode}` : "")
    );
  }

  /* The store must hold the product or every advisor sees an empty library. */
  const prod = await ensureRooftopProduct(sb, roof.value.id, DRY);
  if (!prod.ok) return fail(prod.reason, prod.hint);
  lines.push(`advisor_base ${prod.value} on ${roof.value.name}`);

  return { row, outcome, lines: [roleSummary, ...lines] };
}

/* ---------------------------------------------------------------------------
   The pass
--------------------------------------------------------------------------- */

async function main() {
  const roster = readRoster(FILE!);

  console.log(`\n  provision:roster — ${DRY ? "DRY RUN, nothing sent and nothing written" : "APPLYING"}`);
  console.log(`  file: ${FILE}   rows: ${roster.length}${RESEND ? "   --resend" : ""}\n`);

  /*
   * A duplicated email would invite one person twice and write their rows
   * twice; the second pass would report `exists` and look fine.
   *
   * ONLY AMONG USABLE ADDRESSES, and that ordering is not cosmetic. The draft
   * roster ships with FILL-IN in every email cell, so checking duplicates
   * first reported "fill-in appears on lines 2 and 3" — true, and the wrong
   * answer: the problem is that nobody has filled the column in, and that is
   * a per-row refusal with a per-row explanation. A check that fires first and
   * names the wrong cause is worse than one that fires second.
   */
  const seen = new Map<string, number>();
  for (const r of roster) {
    if (emailUsable(r.email)) continue;
    const prev = seen.get(r.email);
    if (prev) {
      console.error(`\n  REFUSING THE WHOLE FILE — ${r.email} appears on lines ${prev} and ${r.line}.\n`);
      process.exit(1);
    }
    seen.set(r.email, r.line);
  }

  const plans: Plan[] = [];
  for (const row of roster) {
    const plan = await planAndApply(row);
    plans.push(plan);

    const head = `  ${String(row.line).padStart(3)}  ${row.name}  <${row.email}>`;
    if (plan.outcome === "refused") {
      console.log(`${head}\n       REFUSED — ${plan.reason}`);
      if (plan.hint) console.log(`       ${plan.hint}`);
      console.log(`       no invite was sent for this row`);
    } else {
      const label =
        plan.outcome === "invited"
          ? DRY ? "invite: NEW" : "invite: SENT"
          : plan.outcome === "resent"
            ? DRY ? "invite: would RE-SEND" : "invite: RE-SENT"
            : plan.outcome === "already-accepted"
              ? "invite: skipped, account accepted"
              : "invite: skipped, already pending";
      console.log(`${head}\n       ${label}`);
      for (const l of plan.lines) console.log(`       ${l}`);
    }
    console.log("");
  }

  /* ---- The count, derived from what happened --------------------------- */
  const tally = new Map<Outcome, number>();
  for (const p of plans) tally.set(p.outcome, (tally.get(p.outcome) ?? 0) + 1);

  console.log(`  ${"─".repeat(68)}`);
  for (const key of ["invited", "resent", "already-invited", "already-accepted", "refused"] as Outcome[]) {
    const n = tally.get(key) ?? 0;
    if (n) console.log(`  ${String(n).padStart(3)}  ${key}`);
  }
  console.log(`  ${"─".repeat(68)}`);

  const refused = tally.get("refused") ?? 0;
  if (refused) {
    console.log(`\n  ${refused} row(s) refused and sent no invite. Fix the roster and re-run;`);
    console.log(`  the rows that succeeded are idempotent and will report as existing.`);
  }
  if (DRY) console.log(`\n  Re-run with --apply to send the invites and write the rows.`);
  console.log("");

  /* The exit code is a function of the failure count, not a constant. */
  process.exit(refused > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n  FAILED: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
