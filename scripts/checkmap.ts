/* What is still unmapped, and whether the rule file would have caught it.

   Also checks the things that can silently rot after Mitch's triage: whether
   op_text_rule in the database still matches the rule file, whether the
   resolved_family verdict has actually been rebuilt into advisor_op_metric, and
   — added in 0055 — whether any attach rate has escaped above 100%.

   EXITS NON-ZERO on a real failure, so this can gate a deploy. A rate above 100
   is arithmetically impossible and must never reach a screen; the clamp in 0055
   makes it impossible, and this is what notices if the clamp is ever removed. */
import { autoMatch, OP_TEXT_RULES, normaliseSubCategory, NOT_COACHABLE } from "../lib/dms/mapping";

let failures = 0;
const fail = (msg: string) => { failures++; console.log(`  FAIL — ${msg}`); };

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

  // Neither of the next two groups is debt, and both used to be counted as if
  // they were. The arithmetic should always come out exact: every unmapped
  // label is either a PARTIAL/SPLIT resolved per op-code line, or one Mitch
  // ruled not coachable. Anything left over is a label nobody has ruled on —
  // a NEW sub-category that arrived with a later import — and that is the only
  // number here that means work.
  const opKeys = new Set(OP_TEXT_RULES.map((r) => r.subCategory));
  const ncKeys = new Set(Object.keys(NOT_COACHABLE));
  const byOpRule = [...agg.keys()].filter((k) => opKeys.has(normaliseSubCategory(k)));
  const byNotCoachable = [...agg.keys()].filter((k) => ncKeys.has(normaliseSubCategory(k)));
  const unruled = [...agg.keys()].filter(
    (k) => !opKeys.has(normaliseSubCategory(k)) && !ncKeys.has(normaliseSubCategory(k))
  );

  console.log(
    `  ${agg.size} unmapped = ${byOpRule.length} PARTIAL/SPLIT ` +
    `+ ${byNotCoachable.length} ruled not coachable + ${unruled.length} unruled`
  );
  if (unruled.length) {
    console.log("  NEW SUB-CATEGORIES NOBODY HAS RULED ON — these belong on Mitch's next sheet:");
    for (const k of unruled) console.log(`     ${k}  (${agg.get(k)?.toLocaleString()} rows)`);
  }

  if (byOpRule.length) {
    console.log(`  ${byOpRule.length} of them are PARTIAL/SPLIT, resolved per op-code line (expected):`);
    console.log("   ", byOpRule);
  }

  // ---- Has the rule file drifted from the database? -------------------------
  // LIVE ROWS ONLY (0074). The table keeps every historical version now, and
  // comparing those against the file would report each retired version as
  // "in the database, not in the rule file" — drift that is really history.
  const dbRules = await get(
    "op_text_rule?select=sub_category,family,include_pattern,exclude_pattern&retired_at=is.null"
  );
  const fileBy = new Map(OP_TEXT_RULES.map((r) => [r.subCategory, r]));
  const dbBy = new Map(dbRules.map((r) => [String(r.sub_category), r]));
  const drift: string[] = [];
  for (const [k, f] of fileBy) {
    const d = dbBy.get(k);
    if (!d) { drift.push(`${k}: in the rule file, not in the database`); continue; }
    if (d.family !== f.family) drift.push(`${k}: family ${d.family} vs ${f.family}`);
    if (d.include_pattern !== f.include) drift.push(`${k}: include pattern differs`);
    if ((d.exclude_pattern ?? null) !== f.exclude) drift.push(`${k}: exclude pattern differs`);
  }
  for (const k of dbBy.keys()) if (!fileBy.has(k)) drift.push(`${k}: in the database, not in the rule file`);
  console.log(`\n  op_text_rule: ${dbRules.length} in database, ${OP_TEXT_RULES.length} in rule file`);
  if (drift.length) {
    /*
     * SINCE 0071 THE DATABASE WINS. This used to say "run npm run remap", which
     * would have wiped the table back to the file — destroying the very edits
     * it was reporting. A difference is now information, not a fault.
     */
    console.log("  DIFFERS FROM THE RULE FILE (the database is authoritative since 0071):");
    for (const d of drift) console.log(`     ${d}`);
  } else {
    console.log("  in sync");
  }

  // ---- Has the verdict been rebuilt into the metrics? -----------------------
  const r = await fetch(
    `${URL}/rest/v1/advisor_op_metric?select=resolved_family&resolved_family=not.is.null&limit=1`,
    { headers: { ...H, Prefer: "count=exact" } }
  );
  const range = r.headers.get("content-range") ?? "";
  const resolved = Number(range.split("/")[1] ?? 0);
  console.log(`\n  advisor_op_metric rows carrying a resolved_family: ${resolved.toLocaleString()}`);
  if (dbRules.length && resolved === 0) {
    fail("rules are seeded but nothing is resolved — run rebuild_dms_periods(null, null).");
  }

  // ---- THE CEILING ----------------------------------------------------------
  // An attach rate is "what share of this advisor's ROs got this service". It
  // cannot exceed 100%, and until 0055 it could: the numerator counts ROs per
  // op code and the denominator counts distinct ROs, so an RO carrying two op
  // codes in one family was counted twice on top and once underneath.
  //
  // 0055 clamps the rendered rate. This check is the tripwire for the clamp
  // being removed or a new view forgetting it — it is a hard failure, because
  // the alternative is an impossible number on an advisor's screen.
  const over = await get("advisor_family_attach?select=rooftop_id,family,attach_rate_pct&attach_rate_pct=gt.100");
  if (over.length) {
    fail(`${over.length} attach rate(s) above 100% — the clamp in 0055 is not doing its job:`);
    for (const o of over.slice(0, 10)) {
      console.log(`     ${o.family} ${o.attach_rate_pct}%  rooftop ${String(o.rooftop_id).slice(0, 8)}`);
    }
  } else {
    console.log("\n  attach rates above 100%: none");
  }

  // ---- What the clamp is hiding ---------------------------------------------
  // NOT a failure. The overflow is expected while dms_daily_metric arrives
  // pre-aggregated with no repair-order identifiers to deduplicate by. It is
  // printed so the size of the distortion stays visible instead of being
  // silently absorbed by the clamp — see the header of 0055.
  const ovf = await get("attach_rate_overflow?select=rooftop_name,family,fam_ros_raw,advisor_ros,ros_overflow,uncapped_pct&order=uncapped_pct.desc");
  console.log(`\n  rows whose raw numerator outran the denominator: ${ovf.length}`);
  if (ovf.length) {
    console.log("  (clamped on render; the feed has no RO ids to dedupe by)");
    for (const o of ovf.slice(0, 8)) {
      console.log(
        `     ${String(o.rooftop_name).slice(0, 28).padEnd(30)} ${String(o.family).padEnd(18)}` +
        ` ${o.fam_ros_raw}/${o.advisor_ros} = ${o.uncapped_pct}% -> capped at 100%`
      );
    }
  }

  // ---- EXACTLY ONE LIVE ROW PER KEY -----------------------------------------
  /*
   * The partial unique indexes 0074 created stop a key having TWO live rows.
   * Nothing stopped it having NONE, and that is the state a crash between a
   * retire and an insert used to leave behind: the key vanishes from
   * <table>_live, loadCoachableCodes stops offering the code, and the advisor's
   * block quietly drops to family grain. No error, no row, nothing to notice.
   *
   * 0078 made the retire and the insert one statement, so this should now be
   * unreachable. That is exactly why it is worth asserting — a guarantee nobody
   * checks is a guarantee until the day it isn't. A HARD FAILURE, because a
   * mapping with no current version is a hole in the measurement.
   */
  const liveness: { table: string; key: (r: Record<string, unknown>) => string }[] = [
    { table: "sub_category_map", key: (r) => `${r.rooftop_id}|${r.sub_category}` },
    { table: "op_text_rule", key: (r) => String(r.sub_category) },
    { table: "op_code_family", key: (r) => String(r.code) },
  ];
  console.log("");
  for (const { table, key } of liveness) {
    const cols =
      table === "sub_category_map"
        ? "rooftop_id,sub_category,retired_at"
        : table === "op_text_rule"
          ? "sub_category,retired_at"
          : "code,retired_at";
    const rows = await get(`${table}?select=${cols}`);
    const live = new Map<string, number>();
    const keys = new Set<string>();
    for (const r of rows) {
      const k = key(r);
      keys.add(k);
      if (r.retired_at == null) live.set(k, (live.get(k) ?? 0) + 1);
    }
    const orphaned = [...keys].filter((k) => (live.get(k) ?? 0) === 0);
    if (orphaned.length) {
      fail(
        `${table}: ${orphaned.length} key(s) have every version retired and no live row — ` +
          `they have fallen out of ${table}_live entirely.`
      );
      for (const k of orphaned.slice(0, 10)) console.log(`     ${k}`);
    } else {
      console.log(
        `  ${table}: ${keys.size} keys, one live row each (${rows.length} versions total)`
      );
    }
  }

  console.log(failures ? `\n  ${failures} FAILURE(S)\n` : "\n  all checks passed\n");
  if (failures) process.exit(1);
})();
