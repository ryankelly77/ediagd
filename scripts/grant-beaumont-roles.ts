/* ============================================================================
   EDIAGD — the Beaumont role grants that provision:advisor cannot write

     set -a; source .env.local; set +a
     SB_URL="$NEXT_PUBLIC_SUPABASE_URL" SB_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
     npm run grant:beaumont-roles -- --as=<who> --user-id=<app_user uuid> [--dry]

   WHY A SCRIPT AND NOT A MIGRATION. Every row here is keyed on an app_user id
   that exists only after that person accepts their auth invite, and
   provisioning scripts never mint users. A migration cannot take the id as a
   parameter and must not guess one, so this is the same shape as
   provision:advisor — run per person, after their invite, with a dry run
   that reads back exactly what will be written.

   WHO IT KNOWS HOW TO GRANT (the 30 September roster, Ryan's confirmation is
   the F4 baseline; anyone else is a REFUSAL, not a fallthrough):

     --as=lance      admin at EVERY rooftop in the Doggett Automotive Group
                     org (eleven today; the org is the source, not a list
                     that goes stale). NEVER is_platform_owner — that flag is
                     Ryan and Mitch and sees every customer on the platform.
     --as=patterson  manager AND advisor-on-500570 at Doggett Ford of
                     Beaumont (two membership rows; the unique key is
                     user, rooftop, role).
     --as=reck       manager AND advisor with NO op code. 530029 is a dead
                     book (2 ROs, departed) and is never mapped. Managers do
                     the same nine core tracks; no book means the two-slot
                     morning, by design.
     --as=sztaba     advisor with NO op code — 831000 is not in the DMS data
                     through August. One provision:advisor run maps her when
                     a September period carries it. Never borrow another
                     operator's id to fill the slot.
     --as=pinder     advisor with NO op code (Reck's ruling: training, the
                     light morning). Once the light-track floor is live in
                     production, one provision:advisor run maps her to
                     500573 and the floor keeps her light until her ROs
                     cross it.

   Idempotent: an existing row is reported, never duplicated and never
   downgraded. Prints a read-back of every row it wrote or found.
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import { ensureMembership, orgRooftops, type Sb } from "./provisioning";

const URL = process.env.SB_URL!;
const KEY = process.env.SB_KEY!;
if (!URL || !KEY) {
  console.error("\n  SB_URL and SB_KEY are required.\n");
  process.exit(1);
}

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const val = (flag: string): string | null => {
  const hit = args.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : null;
};

const WHO = val("--as");
const USER_ID = val("--user-id");

const BEAUMONT_FORD = "84bef302-ebd2-4536-ba9f-693c535f10d4";
const DOGGETT_ORG = "b94af976-2ad3-42a2-abd3-19b716f56851";

type Grant = { rooftopId: string; role: string; opCodeId: string | null };

function refuse(msg: string): never {
  console.error(`\n  REFUSING — ${msg}\n`);
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

async function main() {
  if (!WHO || !USER_ID) refuse("need --as=<who> and --user-id=<uuid>");
  if (!/^[0-9a-f-]{36}$/.test(USER_ID)) refuse(`"${USER_ID}" is not a uuid`);

  /* The id must be a real, invited person — this script writes memberships,
     never users. */
  const { data: person, error: personErr } = await sb
    .from("app_user")
    .select("id, full_name")
    .eq("id", USER_ID)
    .maybeSingle();
  if (personErr) refuse(`app_user read failed: ${personErr.message}`);
  if (!person) refuse(`no app_user ${USER_ID} — has the invite been accepted?`);

  let grants: Grant[] = [];
  switch (WHO) {
    case "lance": {
      const roofs = await orgRooftops(sb as unknown as Sb, DOGGETT_ORG);
      if (!roofs.ok) refuse(roofs.reason);
      grants = roofs.value.map((r) => ({ rooftopId: r.id, role: "admin", opCodeId: null }));
      console.log(`\n  lance: admin at ${roofs.value.length} Doggett rooftop(s). NEVER is_platform_owner.`);
      break;
    }
    case "patterson":
      grants = [
        { rooftopId: BEAUMONT_FORD, role: "manager", opCodeId: null },
        { rooftopId: BEAUMONT_FORD, role: "advisor", opCodeId: "500570" },
      ];
      break;
    case "reck":
      grants = [
        { rooftopId: BEAUMONT_FORD, role: "manager", opCodeId: null },
        /* No op code, ever: 530029 is a dead book. Two-slot mornings by design. */
        { rooftopId: BEAUMONT_FORD, role: "advisor", opCodeId: null },
      ];
      break;
    case "sztaba":
    case "pinder":
      grants = [{ rooftopId: BEAUMONT_FORD, role: "advisor", opCodeId: null }];
      break;
    default:
      refuse(
        `--as=${WHO} is not on the 30 September roster. This script grants ` +
          `lance, patterson, reck, sztaba or pinder; the six mapped advisors ` +
          `go through provision:advisor, which reads back whose book they get.`
      );
  }

  console.log(`\n  ${DRY ? "DRY RUN — " : ""}granting for ${person.full_name ?? USER_ID}:\n`);

  /*
   * CHECK EVERYTHING, THEN WRITE ANYTHING. The first version wrote row by
   * row and refused mid-list, which left the manager row written and the
   * advisor row refused — a refusal that had already done half the work.
   * All refusals fire before the first insert; a run either applies its
   * whole grant or none of it.
   */
  const planned: { g: Grant; label: string; exists: boolean }[] = [];
  for (const g of grants) {
    const { data: roof } = await sb
      .from("rooftop")
      .select("name")
      .eq("id", g.rooftopId)
      .maybeSingle();
    const label = `${g.role.padEnd(8)} at ${roof?.name ?? g.rooftopId}${
      g.opCodeId
        ? ` on op ${g.opCodeId}`
        : g.role === "advisor"
          ? " (no op code — two-slot morning by design)"
          : ""
    }`;

    /* dry:true — this is the CHECK half. ensureMembership refuses an existing
       row carrying a different op code, which is this script's "never repoints
       a book" rule, now shared with provision:roster rather than written twice. */
    const probe = await ensureMembership(
      sb as unknown as Sb, USER_ID!, g.rooftopId, g.role, g.opCodeId, true
    );
    if (!probe.ok) refuse(`${label}: ${probe.reason} Nothing was written.`);
    planned.push({ g, label, exists: probe.value === "exists" });
  }

  for (const p of planned) {
    if (p.exists) {
      console.log(`  exists  ${p.label}`);
      continue;
    }
    if (DRY) {
      console.log(`  would   ${p.label}`);
      continue;
    }
    const wrote = await ensureMembership(
      sb as unknown as Sb, USER_ID!, p.g.rooftopId, p.g.role, p.g.opCodeId, false
    );
    if (!wrote.ok) {
      refuse(`${p.label}: ${wrote.reason} — earlier rows in this run WERE written; re-run to see current state`);
    }
    console.log(`  wrote   ${p.label}`);
  }

  /* Read back from the table, never from intent. */
  const { data: after } = await sb
    .from("membership")
    .select("role, rooftop_id, op_code_id, active")
    .eq("user_id", USER_ID)
    .eq("active", true)
    .order("role");
  console.log(
    `\n  ${person.full_name ?? USER_ID} now holds ${(after ?? []).length} active membership(s).`
  );
  if (DRY) console.log("  Re-run without --dry to apply.\n");
  else console.log("  Keep this read-back in reports/beaumont-provisioning-<date>.md — the F4 baseline.\n");
}

main().catch((e) => {
  console.error(`\n  failed: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
