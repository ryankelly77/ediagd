import { autoMatch } from "../lib/dms/mapping";
const URL = process.env.SB_URL!, KEY = process.env.SB_KEY!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
async function get(p: string) {
  const out: Record<string, unknown>[] = []; let off = 0;
  for (;;) {
    const r = await fetch(`${URL}/rest/v1/${p}&limit=1000&offset=${off}`, { headers: H });
    const pg = (await r.json()) as Record<string, unknown>[];
    out.push(...pg); if (pg.length < 1000) return out; off += 1000;
  }
}
(async () => {
  const st = await get("sub_category_map?select=status");
  const counts: Record<string, number> = {};
  for (const s of st) counts[String(s.status)] = (counts[String(s.status)] ?? 0) + 1;
  console.log("  sub_category_map:", counts);

  const un = await get("dms_unmapped_sub_category?select=sub_category,rows");
  const agg = new Map<string, number>();
  for (const u of un) agg.set(String(u.sub_category), (agg.get(String(u.sub_category)) ?? 0) + Number(u.rows ?? 0));

  const shouldMatch = [...agg.keys()].filter((k) => autoMatch(k).family);
  console.log(`  unmapped sub-categories: ${agg.size}, rows: ${[...agg.values()].reduce((a,b)=>a+b,0).toLocaleString()}`);
  console.log(`  of those, the rule file WOULD match: ${shouldMatch.length}`);
  if (shouldMatch.length) console.log("   ", shouldMatch.slice(0, 10));
})();
