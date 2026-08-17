/* Re-apply the mapping rules to every committed import.
   Uses lib/dms/mapping.ts directly, so the rules cannot drift from the app's.

   THREE THINGS, IN ORDER, AND THE ORDER MATTERS:

     1. Push OP_TEXT_RULES into op_text_rule. rebuild_dms_periods reads that
        table, so it has to be current before anything is rebuilt.
     2. Apply the sub-category rules — families AND Mitch's not-coachable
        rulings — to every committed import.
     3. Tell the caller to rebuild. The op-code text verdict is computed during
        the rebuild and stored on advisor_op_metric, so a rule edited here does
        nothing at all until rebuild_dms_periods(null, null) runs.

   Step 3 is deliberately NOT automatic: rebuilding every period is minutes of
   work across the whole network, and it belongs to whoever is watching. */
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

async function main() {
  // ---- 1. The op-code text rules -------------------------------------------
  const opRules = OP_TEXT_RULES.map((r) => ({
    sub_category: r.subCategory,
    family: r.family,
    include_pattern: r.include,
    exclude_pattern: r.exclude,
    priority: 100,
    note: r.note,
  }));
  const seeded = await rpc("set_op_text_rules", { _rules: opRules });
  console.log(`  op_text_rule: ${seeded} rules seeded from the rule file`);
  for (const r of OP_TEXT_RULES) {
    console.log(`     ${r.subCategory.padEnd(28)} -> ${r.family}`);
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
