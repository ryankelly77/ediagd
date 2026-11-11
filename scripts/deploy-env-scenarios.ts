/* ============================================================================
   EDIAGD — the Preview write guard, both arms

   PURE. The rule is a function over one environment variable, so every case is
   cheap and there is no reason to test only the half that is convenient.

     npm run test:deploy-env

   ---------------------------------------------------------------------------
   THE ACCEPTANCE ARM IS THE ONE THAT CATCHES THE REAL BUG
   ---------------------------------------------------------------------------
   AGENTS.md: "A refusal is not self-verifying. A gate that refuses looks like
   it is working whether it is right or wrong." A guard that threw on
   EVERYTHING would pass every refusal test written for it, and would then
   break production, the cron and every local acceptance run — so the cases
   below prove the no-op arm for production, for an absent value and for
   development explicitly, and prove them one value at a time rather than
   trusting "anything that is not preview".

   `db:migrate` paid for this exact lesson in the other direction: it refused
   its own good production dump and named ten present tables as missing, and a
   false refusal survived review because it wore the costume of care.

   ---------------------------------------------------------------------------
   WHY THE VARIABLE IS SAVED AND RESTORED
   ---------------------------------------------------------------------------
   This process may itself be running somewhere with VERCEL_ENV set. A test
   that assigned the variable and left it would be reporting on a world it had
   altered, and the LAST case would be the only honest one. Each case sets it,
   asserts, and puts the original back — including the `delete` case, which has
   to distinguish "unset" from "empty string".
============================================================================ */

import {
  deployEnv,
  isPreviewDeploy,
  refuseWriteOnPreview,
} from "@/lib/deploy-env";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(label: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`    ✓ ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? `\n        ${detail}` : ""}`);
    console.log(`    ✗ ${label}${detail ? `  — ${detail}` : ""}`);
  }
}
const section = (t: string) => console.log(`\n${t}`);

/** Set VERCEL_ENV to a value (or unset it), run f, then restore exactly. */
function withEnv<T>(value: string | undefined, f: () => T): T {
  const had = Object.prototype.hasOwnProperty.call(process.env, "VERCEL_ENV");
  const original = process.env.VERCEL_ENV;
  try {
    if (value === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = value;
    return f();
  } finally {
    if (had) process.env.VERCEL_ENV = original;
    else delete process.env.VERCEL_ENV;
  }
}

/** Did calling the guard throw? Returns the message, or null if it did not. */
function threw(value: string | undefined): string | null {
  return withEnv(value, () => {
    try {
      refuseWriteOnPreview("seed the fixture");
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  });
}

/* ------------------------------------------------------------------------- */
console.log("\nThe Preview write guard — refuseWriteOnPreview()");

section("1. It refuses on Preview, which is the whole point");

{
  const msg = threw("preview");
  ok("VERCEL_ENV=preview throws", msg !== null);
  ok(
    "and the message names the operation that was refused",
    msg !== null && msg.includes("seed the fixture"),
    msg ?? "(did not throw)"
  );
  /* The error is what a future reader of a log will have. If it does not say
     why, somebody will "fix" the guard rather than the write path. */
  ok(
    "and says why, not just that it refused",
    msg !== null && /PRODUCTION Supabase/.test(msg) && /service-role/.test(msg),
    msg ?? "(did not throw)"
  );
  ok(
    "and points at the document carrying the rule",
    msg !== null && msg.includes("MANAGER_MEETINGS.md"),
    msg ?? "(did not throw)"
  );
  ok("isPreviewDeploy() agrees", withEnv("preview", isPreviewDeploy) === true);
}

section("2. It is a no-op everywhere else — the arm that gets skipped");

{
  /* Named one at a time rather than as "not preview", because the failure this
     guards against is a guard that throws on everything. */
  ok("VERCEL_ENV=production does not throw", threw("production") === null);
  ok("VERCEL_ENV=development does not throw", threw("development") === null);
  ok(
    "VERCEL_ENV unset does not throw — local is where the proofs run",
    threw(undefined) === null
  );
  ok("VERCEL_ENV='' does not throw", threw("") === null);

  ok(
    "isPreviewDeploy() is false on production",
    withEnv("production", isPreviewDeploy) === false
  );
  ok(
    "isPreviewDeploy() is false when unset",
    withEnv(undefined, isPreviewDeploy) === false
  );
}

section("3. Only the exact string 'preview' refuses");

{
  /* Vercel sets exactly 'preview'. These assert the match is not a substring
     or case-insensitive test, because a loose match would refuse a future
     environment nobody has thought of yet — and silently. */
  ok("'Preview' (capitalised) does not throw", threw("Preview") === null);
  ok("'PREVIEW' does not throw", threw("PREVIEW") === null);
  ok("'preview-branch' does not throw", threw("preview-branch") === null);
  ok("'not-preview' does not throw", threw("not-preview") === null);
}

section("4. deployEnv() reports what is there, and nothing more");

{
  ok("it reads the variable through", withEnv("preview", deployEnv) === "preview");
  ok(
    "it returns undefined rather than a sentinel when unset",
    withEnv(undefined, deployEnv) === undefined
  );
  /* A guard that defaulted to 'production' when unset would be claiming to
     know something it cannot observe. */
  ok(
    "and does not invent a default",
    withEnv(undefined, deployEnv) !== "production"
  );
}

section("5. The environment this process started in is unchanged");

{
  /* The suite altered a global. If it did not put it back, every assertion
     above is evidence about a world that no longer exists. */
  const had = Object.prototype.hasOwnProperty.call(process.env, "VERCEL_ENV");
  ok(
    "VERCEL_ENV is restored (still unset, as it was)",
    had === false || process.env.VERCEL_ENV !== undefined,
    `hasOwnProperty=${had} value=${String(process.env.VERCEL_ENV)}`
  );
}

console.log("\n" + "=".repeat(64));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  ✗ " + f);
}
console.log("=".repeat(64));
process.exit(failed > 0 ? 1 : 0);
