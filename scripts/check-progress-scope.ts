/* ============================================================================
   EDIAGD — every read of content_progress must name the person it is about

     npm run check:progress-scope

   ---------------------------------------------------------------------------
   WHY THIS EXISTS
   ---------------------------------------------------------------------------
   `content_progress` has no self-read policy. It has `progress_team_read`
   (0027):

       is_platform_owner()
       or user_id = (select auth.uid())
       or rooftop_id in (select managed_rooftops())

   so the CALLER'S OWN CLIENT reads every progress row at every rooftop they
   manage. A read keyed only on `content_id` is therefore not "scoped by RLS to
   me" — it is scoped to my whole store, and for anybody holding manager plus
   advisor at one rooftop (both of Beaumont's managers do, 0166) it will return
   somebody else's row for the same film with no error and no empty state.

   That is what happened on 10 November 2026. `loadModuleItems` read

       .from("content_progress").select(...).in("content_id", ids)

   with no user filter. On `/library/m/06b1b883` it returned advisor 902050's
   completion of Menus module 1's film; Valerie Patterson, manager and advisor
   at the same rooftop, has none. The deck seeded its `done` set from it, drew
   the tick, and `markDone`'s `if (pending || done.has(id)) return` meant she
   could not complete the film at all — ten opens, not one progress row — while
   the header, from `my_module_progress` which names its user, correctly read
   "0 of 1 done".

   `lib/library.ts`'s `loadCompletedIds` carried the same read under the comment
   "content_progress's self-read policy scopes it — there is no user id
   parameter to get wrong". The premise was false and it was written as a
   definition, which is the construction AGENTS.md records as worse than a stale
   comment because it instructs the reader not to look.

   ---------------------------------------------------------------------------
   IT IS A CLASS CHECK, NOT A REGRESSION TEST FOR TWO FUNCTIONS
   ---------------------------------------------------------------------------
   The question the bug was an answer to is "which reads of content_progress do
   not name their user", and that question has to be answered everywhere rather
   than at the two places it was found. So this walks every `.from(
   "content_progress")` in app/, lib/ and components/ and classifies it.

   AND IT FAILS ON ANYTHING IT CANNOT CLASSIFY. A check that enumerates is
   making a claim about coverage; meeting a statement whose shape it does not
   recognise is exactly the case to be loudest about, not quietest. It also
   fails if it finds FEWER sites than it has ever seen, because a regex that
   stops matching passes silently, and it asserts the RLS premise from the
   migration rather than trusting this comment — if `progress_team_read` is ever
   narrowed to self-only, this check should be the thing that says so.
============================================================================ */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..");
const TREES = ["app", "lib", "components"];

/* The number of call sites present when this check was written. A regex that
   quietly stops matching is the failure mode of every static check in this
   repo, and "found 0 sites, all of them scoped" reads exactly like success. */
const SITES_SEEN = 16;

let failures = 0;
const fail = (s: string) => {
  failures += 1;
  console.log(`  \x1b[31mFAIL\x1b[0m  ${s}`);
};
const pass = (s: string) => console.log(`  \x1b[32mok\x1b[0m    ${s}`);

/* ---- 0. The premise, from the migration rather than from this comment ---- */
/*
 * If somebody narrows progress_team_read to own-rows-only, an unscoped read
 * stops being a leak and this check's whole justification changes. Asserting it
 * means the check cannot go on citing a policy that no longer says that.
 */
function assertPolicyStillTeamWide() {
  const dir = path.join(ROOT, "supabase", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let last: { file: string; body: string } | null = null;
  for (const f of files) {
    const src = readFileSync(path.join(dir, f), "utf8");
    /* The LAST migration to create it is the one in force. */
    const re = /create\s+policy\s+progress_team_read\s+on\s+content_progress([\s\S]*?);/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) last = { file: f, body: m[1]! };
  }
  if (!last) {
    fail(
      "could not find `create policy progress_team_read on content_progress` in " +
        "any migration. Refusing rather than asserting a premise this check " +
        "cannot read."
    );
    return;
  }
  const teamWide = /managed_rooftops/.test(last.body);
  const hasSelf = /auth\.uid/.test(last.body);
  if (!hasSelf) {
    fail(`${last.file}: progress_team_read no longer admits auth.uid() — advisors cannot read their own progress`);
  }
  if (teamWide) {
    pass(
      `${last.file}: progress_team_read is self OR managed_rooftops() — an ` +
        `unscoped read leaks the rooftop, so the rule below is live`
    );
  } else {
    fail(
      `${last.file}: progress_team_read no longer mentions managed_rooftops(). ` +
        `The hazard this check cites has changed shape; re-read it before ` +
        `trusting either half.`
    );
  }
}

/* ---- 1. Walk the trees -------------------------------------------------- */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

type Site = {
  file: string;
  line: number;
  statement: string;
  kind: "read" | "write";
  scoped: boolean;
};

/**
 * The whole PostgREST statement a `from("content_progress")` belongs to.
 *
 * Taken from the start of the expression up to the terminating semicolon, so a
 * chain spread over nine lines — which is every interesting one — is read whole.
 * A site with no terminator inside the budget is a PARSE FAILURE and is
 * reported as one; it is never assumed to be fine.
 */
function statementAt(src: string, idx: number): string | null {
  const end = src.indexOf(";", idx);
  if (end === -1 || end - idx > 2000) return null;
  return src.slice(idx, end + 1);
}

const sites: Site[] = [];
const unparsed: { file: string; line: number }[] = [];

for (const tree of TREES) {
  const base = path.join(ROOT, tree);
  try {
    statSync(base);
  } catch {
    fail(`watched tree ${tree}/ does not exist — the list this check enumerates is stale`);
    continue;
  }
  for (const file of walk(base)) {
    const src = readFileSync(file, "utf8");
    const needle = /\.from\(\s*["'`]content_progress["'`]\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = needle.exec(src)) !== null) {
      const line = src.slice(0, m.index).split("\n").length;
      const stmt = statementAt(src, m.index);
      const rel = path.relative(ROOT, file);
      if (stmt == null) {
        unparsed.push({ file: rel, line });
        continue;
      }
      const isWrite = /\.(insert|upsert|update|delete)\s*\(/.test(stmt);
      /* NAMING THE USER, in any of the three forms the codebase uses: a
         user_id equality, a user_id `in` list (the roster reads), or a row
         identity (`.eq("id", progressId)`) which is narrower than a user. */
      const scoped =
        /\.eq\(\s*["'`]user_id["'`]/.test(stmt) ||
        /\.in\(\s*["'`]user_id["'`]/.test(stmt) ||
        /\.eq\(\s*["'`]id["'`]/.test(stmt) ||
        /user_id\s*:/.test(stmt);
      sites.push({ file: rel, line, statement: stmt, kind: isWrite ? "write" : "read", scoped });
    }
  }
}

console.log("\n\x1b[1mcontent_progress: does every read name its person?\x1b[0m");
console.log("─".repeat(52));
assertPolicyStillTeamWide();
console.log("");

/* ---- 2. A parse failure is a failure ----------------------------------- */
for (const u of unparsed) {
  fail(
    `${u.file}:${u.line} — found a content_progress call this check could not ` +
      `read to its terminating semicolon. Refusing rather than passing it.`
  );
}

/* ---- 3. The sites ------------------------------------------------------- */
const reads = sites.filter((s) => s.kind === "read");
const writes = sites.filter((s) => s.kind === "write");

for (const s of reads) {
  if (s.scoped) pass(`${s.file}:${s.line} read names its user`);
  else
    fail(
      `${s.file}:${s.line} reads content_progress WITHOUT naming a user. ` +
        `progress_team_read means this returns every row at any rooftop the ` +
        `caller manages, so a manager-advisor is served a colleague's progress ` +
        `for the same content with no error. Add .eq("user_id", <the viewer>).`
    );
}
for (const s of writes) {
  if (s.scoped) pass(`${s.file}:${s.line} write names its row or its user`);
  else
    fail(
      `${s.file}:${s.line} writes content_progress without naming a user or a ` +
        `row id — it would apply to every row the caller can reach.`
    );
}

/* ---- 4. Prove the check is not vacuous --------------------------------- */
console.log("");
if (sites.length === 0) {
  fail(
    "found NO content_progress call sites at all. The regex has stopped " +
      "matching; 'all scoped' over an empty set is the silent pass this check " +
      "was written to make impossible."
  );
} else if (sites.length < SITES_SEEN) {
  fail(
    `found ${sites.length} call sites, fewer than the ${SITES_SEEN} present when ` +
      `this check was written. Either reads were deleted — update SITES_SEEN and ` +
      `say so — or the matcher is missing some.`
  );
} else {
  pass(`${sites.length} call sites found (${reads.length} read, ${writes.length} write)`);
}

/* THE TWO THAT WERE WRONG, BY NAME. A check that would pass on the original
   defect is not evidence about it. These assert the fix is present at the two
   sites the 10 November report was traced to, so a revert goes red here rather
   than only on the screen. */
for (const want of [
  { file: "lib/lms.ts", fn: "loadModuleItems" },
  { file: "lib/library.ts", fn: "loadCompletedIds" },
]) {
  const found = reads.filter((s) => s.file === want.file);
  if (found.length === 0) {
    fail(`${want.file} has no content_progress read — ${want.fn} was expected to carry one`);
  } else if (found.some((s) => !s.scoped)) {
    fail(`${want.file} still has an unscoped read (${want.fn} is the 10 November defect)`);
  } else {
    pass(`${want.file} — ${want.fn}'s read names its user`);
  }
}

/* And the signature itself: a required parameter is what stops the next caller
   inheriting a scope nobody chose. A default would restore the hole. */
const lms = readFileSync(path.join(ROOT, "lib", "lms.ts"), "utf8");
/* [\s\S] rather than the `s` flag: the project tsconfig targets below es2018 for
   this file's lib check, and a flag that fails to compile makes the whole check
   unrunnable — which is the silent pass it exists to prevent. */
if (!/export\s+async\s+function\s+loadModuleItems\s*\(\s*client:[\s\S]*?userId:\s*string/.test(lms)) {
  fail(
    "loadModuleItems does not take a required `userId: string`. The scoping has " +
      "to be in the signature — a caller that can omit it will."
  );
} else if (/userId:\s*string\s*=/.test(lms)) {
  fail("loadModuleItems gives `userId` a default. A default is the thing a caller takes without deciding.");
} else {
  pass("loadModuleItems takes a required userId — a call site cannot stay silent");
}

console.log("");
if (failures > 0) {
  console.log(`\x1b[31m  ${failures} failure(s)\x1b[0m\n`);
  process.exit(1);
}
console.log("\x1b[32m  every content_progress read names its person\x1b[0m\n");
