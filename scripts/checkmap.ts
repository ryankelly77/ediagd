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

async function main() {
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

  await checkLedger();

  console.log(failures ? `\n  ${failures} FAILURE(S)\n` : "\n  all checks passed\n");
  if (failures) process.exit(1);
}

/* ---------------------------------------------------------------------------
   The ledger resolves to real events
--------------------------------------------------------------------------- */

/**
 * Every Sand Dollar minted points at something that happened.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS WORTH ASSERTING CONTINUOUSLY
 * ---------------------------------------------------------------------------
 * The ledger is the economy. An entry whose `ref_id` resolves to nothing is
 * currency with no source event behind it — either a mint that should never
 * have happened, or a real one whose event was later deleted without taking
 * the payment with it. Both are indistinguishable afterwards from the entry
 * alone, which is exactly why it has to be caught while the difference is
 * still recoverable.
 *
 * completeDay's rollback deletes ledger rows BY ref_id, so the code path is
 * careful. What is not careful is anything that removes a source event by
 * other means — a direct SQL delete during testing, a future admin screen, a
 * cascade nobody thought about.
 *
 * TWO REASONS LEGITIMATELY HAVE NO REF and are not orphans:
 *   paddle_out_purchase   a spend, not a reward for an event
 *   adjustment            a manual correction, by definition unsourced
 *
 * ---------------------------------------------------------------------------
 * HOW AN ORPHAN IS REPAIRED — Ryan's ruling, and it is not "delete the row"
 * ---------------------------------------------------------------------------
 * DELETING LEDGER ROWS IS NOT THE SANCTIONED REPAIR. A ledger that can be
 * pruned when it embarrasses a check is not a ledger, and the balance it backs
 * stops meaning anything.
 *
 * The repair is an ADJUSTMENT WITH A NOTE: re-reason the entry to `adjustment`,
 * null the dangling ref, and copy what it replaced into the note verbatim —
 * the original reason AND the ref that no longer resolves. The first orphan
 * this check found reads
 *
 *   "was lesson_complete → content_progress 10502b6e-…, source row lost pre-review"
 *
 * so the row documents exactly what it was rather than merely that something
 * changed. The balance is untouched: the person earned it, and only the record
 * of what they earned it for was lost.
 *
 * The one exception is an entry whose SOURCE EVENT was itself removed as
 * never-having-happened — a rolled-back completion. completeDay already deletes
 * those by ref_id in the same transaction, which is why they never reach here.
 */
type Entry = { id: string; user_id: string; amount: number; reason: string; ref_id: string | null };

const REF_TARGET: Record<string, string> = {
  daily_loop: "daily_completion",
  badge: "daily_completion",
  swell_7: "daily_completion",
  swell_30: "daily_completion",
  swell_90: "daily_completion",
  swell_365: "daily_completion",
  lesson_complete: "content_progress",
  module_complete: "module",
};
const NO_REF_EXPECTED = new Set(["paddle_out_purchase", "adjustment"]);

async function checkLedger(): Promise<void> {
  const entries = (await get("sand_dollar_entry?select=id,user_id,amount,reason,ref_id")) as Entry[];
  if (entries.length === 0) {
    console.log("  sand_dollar_entry: no entries");
    return;
  }

  /* One read per referenced table, then set membership — rather than a query
     per entry, which would be 61 round trips today and thousands later. */
  const ids: Record<string, Set<string>> = {};
  for (const table of new Set(Object.values(REF_TARGET))) {
    const rows = (await get(`${table}?select=id`)) as { id: string }[];
    ids[table] = new Set(rows.map((r) => r.id));
  }

  const orphans: Entry[] = [];
  const unknownReason: string[] = [];

  for (const e of entries) {
    if (e.ref_id === null) {
      /* A missing ref is only fine for the two reasons that have no event. */
      if (!NO_REF_EXPECTED.has(e.reason)) orphans.push(e);
      continue;
    }
    const table = REF_TARGET[e.reason];
    if (!table) {
      if (!unknownReason.includes(e.reason)) unknownReason.push(e.reason);
      continue;
    }
    if (!ids[table].has(e.ref_id)) orphans.push(e);
  }

  if (unknownReason.length) {
    /* A new reason with no mapping is a hole in this check, not a pass. */
    fail(
      `sand_dollar_entry: ${unknownReason.length} reason(s) this check does not know how to ` +
        `resolve — ${unknownReason.join(", ")}. Add them to REF_TARGET or NO_REF_EXPECTED.`
    );
  }

  if (orphans.length) {
    const total = orphans.reduce((sum, o) => sum + o.amount, 0);
    fail(
      `sand_dollar_entry: ${orphans.length} entr${orphans.length === 1 ? "y" : "ies"} ` +
        `(${total} Sand) reference a source event that does not exist.`
    );
    for (const o of orphans.slice(0, 10)) {
      console.log(`     ${o.reason} ${o.amount} — ref ${o.ref_id ?? "(null)"} user ${o.user_id}`);
    }
  } else {
    console.log(`  sand_dollar_entry: ${entries.length} entries, every one resolves to its source event`);
  }
}

/*
 * NOT ON IMPORT.
 *
 * A bare IIFE runs the moment anything requires this file — which is how a test
 * that only wanted one helper triggered a full production import and truncated
 * 15 cue bodies. Nothing imports this today; the guard is for the person who
 * first wants to.
 */
if (require.main === module) {
  main();
}
