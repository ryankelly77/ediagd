/* Re-apply the mapping rules to every committed import.
   Uses lib/dms/mapping.ts directly, so the rules cannot drift from the app's.

   THREE THINGS, IN ORDER, AND THE ORDER MATTERS:

     1. REPORT how op_text_rule differs from the rule file. It no longer WRITES
        it — see below.
     2. Apply the sub-category rules — families AND Mitch's not-coachable
        rulings — to every committed import.
     3. Tell the caller to rebuild. The op-code text verdict is computed during
        the rebuild and stored on advisor_op_metric, so a rule edited here does
        nothing at all until rebuild_dms_periods(null, null) runs.

   Step 3 is deliberately NOT automatic: rebuilding every period is minutes of
   work across the whole network, and it belongs to whoever is watching.

   ---------------------------------------------------------------------------
   STEP 1 USED TO OVERWRITE op_text_rule, AND THAT WAS THE SHARPEST EDGE IN THE
   SYSTEM (0071)
   ---------------------------------------------------------------------------
   It called set_op_text_rules(), which deletes every row and re-inserts the
   nine from lib/dms/mapping.ts. The table was a cache the file stamped on.

   Which was fine while the file was the only way to author a rule, and became
   a trap the moment an admin screen existed: the first `npm run remap` after
   Mitch edits an op-text rule reverted him silently — no warning, no log — and
   the rule went back to classifying revenue the old way. Nobody would have
   connected the two events.

   So the table is authoritative now and this only DIFFS against it. Drift is
   not an error here: a rule the file does not have is usually somebody's
   deliberate edit, which is the point.

   `--seed-rules` adds rules the table is MISSING, for a fresh environment. It
   is additive — seed_op_text_rules() cannot overwrite or delete — so running
   it on a live database is safe and usually a no-op. */
import { autoMatch, OP_TEXT_RULES } from "../lib/dms/mapping";

const URL = process.env.SB_URL!;
const KEY = process.env.SB_KEY!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rpc(fn: string, body: unknown) {
  const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: "POST", headers: H, body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const SEED = process.argv.includes("--seed-rules");

async function get(path: string) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: H });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as Record<string, unknown>[];
}

async function main() {
  // ---- 1. The op-code text rules: READ, DIFF, DO NOT OVERWRITE -------------
  const opRules = OP_TEXT_RULES.map((r) => ({
    sub_category: r.subCategory,
    family: r.family,
    include_pattern: r.include,
    exclude_pattern: r.exclude,
    priority: 100,
    note: r.note,
  }));

  if (SEED) {
    const added = await rpc("seed_op_text_rules", { _rules: opRules });
    console.log(
      `  op_text_rule: ${added} rule(s) added from the file` +
      `${Number(added) === 0 ? " — nothing was missing" : ""}`
    );
  }

  const dbRules = (await get(
    "op_text_rule?select=sub_category,family,include_pattern,exclude_pattern,origin"
  )) as unknown as {
    sub_category: string; family: string;
    include_pattern: string; exclude_pattern: string | null; origin: string;
  }[];

  const fileBy = new Map(OP_TEXT_RULES.map((r) => [r.subCategory, r]));
  const dbBy = new Map(dbRules.map((r) => [r.sub_category, r]));
  const edited = dbRules.filter((r) => r.origin === "admin");

  console.log(
    `  op_text_rule: ${dbRules.length} in the database, ${OP_TEXT_RULES.length} in the rule file` +
    `${edited.length ? `, ${edited.length} edited by hand` : ""}`
  );

  const drift: string[] = [];
  for (const [k, f] of fileBy) {
    const d = dbBy.get(k);
    if (!d) { drift.push(`${k}: in the file, NOT in the database — run with --seed-rules`); continue; }
    if (d.family !== f.family) drift.push(`${k}: family ${d.family} (db) vs ${f.family} (file)`);
    if (d.include_pattern !== f.include) drift.push(`${k}: include pattern differs`);
    if ((d.exclude_pattern ?? null) !== f.exclude) drift.push(`${k}: exclude pattern differs`);
  }
  for (const k of dbBy.keys()) if (!fileBy.has(k)) drift.push(`${k}: in the database only`);

  if (drift.length === 0) {
    console.log("  in sync with the rule file");
  } else {
    /*
     * NOT AN ERROR, AND THE WORDING MATTERS. Before 0071 this said "run npm run
     * remap" — advice that would have destroyed exactly the edits it was
     * reporting. The database is authoritative; a difference is information.
     */
    console.log("  DIFFERS FROM THE RULE FILE (the database wins — this is a report, not a fault):");
    for (const d of drift) console.log(`     ${d}`);
  }
  for (const r of dbRules) {
    console.log(
      `     ${r.sub_category.padEnd(28)} -> ${r.family}` +
      `${r.origin === "admin" ? "   [edited by hand]" : ""}`
    );
  }

  // ---- 2. The sub-category rules -------------------------------------------
  const res = await fetch(
    `${URL}/rest/v1/dms_import?select=id,file_name,covers_from&status=eq.committed&order=covers_from`,
    { headers: H }
  );
  const imports = (await res.json()) as { id: string; file_name: string; covers_from: string }[];

  let total = 0;
  let totalFamily = 0;
  let totalNotCoachable = 0;

  for (const imp of imports) {
    const subs = (await rpc("import_sub_categories", { _import_id: imp.id })) as
      { sub_category: string }[];

    const rules = subs.map((s) => {
      const m = autoMatch(s.sub_category);
      return {
        sub_category: s.sub_category,
        family: m.family,
        not_coachable: m.notCoachable,
      };
    });

    const fam = rules.filter((r) => r.family).length;
    const nc = rules.filter((r) => r.not_coachable).length;
    const n = await rpc("apply_sub_category_automap", { _import_id: imp.id, _rules: rules });
    total += Number(n ?? 0);
    totalFamily += fam;
    totalNotCoachable += nc;

    console.log(
      `  ${imp.covers_from}  ${subs.length} distinct sub-categories, ` +
      `${fam} to a family + ${nc} not coachable -> ${n} rows newly written   ` +
      `[${imp.file_name.slice(0, 40)}]`
    );
  }

  console.log(`\n  total rows newly written: ${total}`);
  console.log(`  (rule-matched per import: ${totalFamily} family, ${totalNotCoachable} not coachable)`);
  console.log(
    `\n  NEXT: the op-code text verdict is stored, not computed at read time.\n` +
    `  Run rebuild_dms_periods(null, null) or nothing above takes effect.`
  );
}
main().catch((e) => { console.error(e); process.exit(1); });
