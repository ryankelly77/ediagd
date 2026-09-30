/* ============================================================================
   EDIAGD — the gating allowlist exists twice; assert the two agree

     npm run check:gating

   ---------------------------------------------------------------------------
   WHY THIS EXISTS
   ---------------------------------------------------------------------------
   "Module complete" is decided in two places and has to be decided the same way:

     gating_content_types()          in the database, used by
                                     my_module_progress.items_done — the library
                                     screens and the quiz-page redirect
     GATING_CONTENT_TYPES            in lib/lms.ts, used by
                                     moduleRequirementsMet — which writes
                                     module_completion, which the credential reads

   If they drift, a module is finished according to the credential and unfinished
   according to the page an advisor is looking at. Nothing would error.

   This is the same shape as `--publish-when-ready`: a list the program kept beside
   itself, with nothing comparing them, so a value could sit there for weeks doing
   nothing. The answer there was to delete the second list. Here the second list is
   unavoidable — the database cannot import TypeScript and the hot path should not
   round-trip for a constant — so the answer is a check that fails.

   IT ALSO FAILS ON AN UNKNOWN ENUM VALUE. The allowlist is a claim about every
   content type; a type that exists and is in neither the allowlist nor the
   known-excluded list is exactly the case this should be loudest about, because
   somebody added a type and nobody decided whether it gates. A check that
   enumerates a fixed list must fail when it meets something the list does not
   mention.
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";

/*
 * READ FROM THE SOURCE FILE, NOT BY IMPORTING IT.
 *
 * `import { GATING_CONTENT_TYPES } from "../lib/lms"` drags in the whole app
 * dependency graph through the @/ alias for one array of strings. Reading the
 * literal is lighter AND a stronger check: it asserts what is written in the file
 * an engineer edits, not what a compiled re-export happens to resolve to.
 *
 * A PARSE FAILURE IS A FAILURE, never a skip. If the declaration is reshaped so
 * this regex misses it, the check must go red rather than quietly comparing the
 * database against an empty list and passing.
 */
function gatingTypesFromSource(): string[] {
  const file = path.join(__dirname, "..", "lib", "lms.ts");
  const src = readFileSync(file, "utf8");
  const m = src.match(
    /export\s+const\s+GATING_CONTENT_TYPES\s*=\s*\[([^\]]*)\]\s*as\s+const/,
  );
  if (!m) {
    console.error(
      "\n  FAIL  could not find GATING_CONTENT_TYPES in lib/lms.ts.\n" +
        "        The declaration was reshaped and this check can no longer read it.\n" +
        "        Refusing rather than comparing against nothing.\n",
    );
    process.exit(1);
  }
  return [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
}

/*
 * Types that exist and deliberately do NOT gate. Naming them is the point: the
 * check can then tell "decided not to gate" from "nobody has looked at this".
 */
const KNOWN_NON_GATING = [
  "cue", //              reinforcement; gating on it turns a lesson into a checklist
  "quote", //            mindset material, served by slot 1, never a module item
  "manager_video", //    different audience
  "joe_the_pro", //      no rows anywhere yet
  "technician_video", // different audience by design — 0091 keys entitlement on type
];

function sb() {
  const url = process.env.SB_URL;
  const key = process.env.SB_KEY;
  if (!url || !key) {
    console.error("\n  SB_URL and SB_KEY are required.\n");
    process.exit(2);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main(): Promise<number> {
  const service = sb();
  let failures = 0;
  const fail = (msg: string) => {
    console.error(`  FAIL  ${msg}`);
    failures += 1;
  };
  const pass = (msg: string) => console.log(`  ok    ${msg}`);

  /* ---- 1. the two allowlists agree -------------------------------------- */
  const { data: dbTypes, error } = await service.rpc("gating_content_types");
  if (error) {
    fail(`could not read gating_content_types(): ${error.message}`);
    return 1;
  }

  const fromDb = [...((dbTypes ?? []) as string[])].sort();
  const fromTs = gatingTypesFromSource().sort();

  if (fromDb.join(",") !== fromTs.join(",")) {
    fail(
      `the allowlists differ.\n` +
        `          database : ${fromDb.join(", ") || "(empty)"}\n` +
        `          lib/lms.ts: ${fromTs.join(", ") || "(empty)"}\n` +
        `          A module would be complete for the credential and incomplete on screen.`,
    );
  } else {
    pass(`allowlist agrees in both places: ${fromTs.join(", ")}`);
  }

  if (fromDb.length === 0) {
    fail("the allowlist is empty — no module could ever complete");
  }

  /* ---- 2. every enum value is accounted for ----------------------------- */
  const { data: enumRows, error: enumErr } = await service
    .from("content")
    .select("type")
    .limit(1);
  if (enumErr) fail(`could not reach content: ${enumErr.message}`);

  /*
   * The enum itself, not the values in use — a type with zero rows today is the
   * one most likely to be attached tomorrow by somebody who has not read this.
   */
  const { data: allTypes, error: tErr } = await service.rpc("content_type_values");
  if (tErr) {
    /*
     * No helper function; fall back to the distinct values present. Reported as a
     * REDUCED SCOPE rather than passed quietly, because "every type in use is
     * accounted for" is a narrower claim than "every type is".
     */
    console.log(
      "  note  content_type_values() not present — checking types IN USE only,\n" +
        "        which is evidence about the rows that exist, not about the enum.",
    );
    const { data: used } = await service.from("content").select("type");
    const seen = [...new Set(((used ?? []) as { type: string }[]).map((r) => r.type))];
    for (const t of seen) {
      if (!fromTs.includes(t) && !KNOWN_NON_GATING.includes(t)) {
        fail(`content type "${t}" is in use and appears in neither list — does it gate?`);
      }
    }
    if (seen.length) pass(`${seen.length} type(s) in use, all accounted for`);
  } else {
    const every = ((allTypes ?? []) as string[]) ?? [];
    for (const t of every) {
      if (!fromTs.includes(t) && !KNOWN_NON_GATING.includes(t)) {
        fail(`content type "${t}" is in neither the allowlist nor KNOWN_NON_GATING`);
      }
    }
    pass(`all ${every.length} enum value(s) accounted for`);
  }

  /* ---- 3. the guard is real: a cue-only module must not read done ------- */
  const { data: cueOnly } = await service
    .from("my_module_progress")
    .select("module_id, total_items, items_done")
    .eq("items_done", true)
    .limit(2000);

  /*
   * Read as the SERVICE ROLE, so auth.uid() is null and no progress rows join —
   * which means items_done can only be true here if the gate is broken. A module
   * with no gating items reading done is the self-certifying credential.
   */
  const wrong = ((cueOnly ?? []) as { module_id: string }[]).length;
  if (wrong > 0) {
    fail(
      `${wrong} module(s) read items_done=true with no completions — ` +
        `the non-empty guard is not holding`,
    );
  } else {
    pass("no module claims items_done without completions");
  }

  console.log(
    `\n  ${failures === 0 ? "gating allowlist is consistent" : `${failures} failure(s)`}\n`,
  );
  return failures === 0 ? 0 : 1;
}

main().then((c) => process.exit(c));
