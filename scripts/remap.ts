/* One-off: re-apply the auto-mapper to every committed import.
   Uses lib/dms/mapping.ts directly, so the rules cannot drift from the app's. */
import { autoMatch } from "../lib/dms/mapping";

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
  const res = await fetch(`${URL}/rest/v1/dms_import?select=id,file_name,covers_from&status=eq.committed&order=covers_from`, { headers: H });
  const imports = (await res.json()) as { id: string; file_name: string; covers_from: string }[];

  let total = 0;
  for (const imp of imports) {
    const subs = (await rpc("import_sub_categories", { _import_id: imp.id })) as { sub_category: string }[];
    const rules = subs.map((s) => ({
      sub_category: s.sub_category,
      family: autoMatch(s.sub_category).family,
    }));
    const matched = rules.filter((r) => r.family).length;
    const n = await rpc("apply_sub_category_automap", { _import_id: imp.id, _rules: rules });
    total += Number(n ?? 0);
    console.log(
      `  ${imp.covers_from}  ${subs.length} distinct sub-categories, ${matched} rule-matched -> ${n} rows newly mapped   [${imp.file_name.slice(0, 40)}]`
    );
  }
  console.log(`\n  total rows newly mapped: ${total}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
