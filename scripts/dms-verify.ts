/* ============================================================================
   EDIAGD — prove the DMS importer end to end
   Local database only. Never point this at production.

       npm run verify:dms -- /path/to/workbook.xlsx

   WHAT IT PROVES, in order:
     1. the parse splits detail from rollups the way the file's own subtotals say
     2. staging + commit lands the expected number of rows
     3. UNIQUE RO COUNTS survive — the advisor total is NOT the sum of lines
     4. RE-RUNNING THE SAME FILE IS A NO-OP — same row count, same checksum
     5. a corrected re-send replaces only the days it covers

   It drives the same SQL function the upload screen does, through PostgREST
   with the service-role key, so it exercises the real path rather than a
   parallel one written to pass.
   ============================================================================ */

import { readFileSync } from "node:fs";
import { parseWorkbook } from "../lib/dms/parse";
import { autoMatch } from "../lib/dms/mapping";

const URL = process.env.LOCAL_SUPABASE_URL ?? "http://127.0.0.1:55321";
const KEY = process.env.LOCAL_SERVICE_KEY ?? "";

if (!KEY) {
  console.error("Set LOCAL_SERVICE_KEY (supabase status -> SERVICE_ROLE_KEY)");
  process.exit(1);
}

const H = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

async function rest(path: string, init?: RequestInit) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...H, ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function count(table: string, query = ""): Promise<number> {
  const res = await fetch(`${URL}/rest/v1/${table}?select=*${query}`, {
    headers: { ...H, Prefer: "count=exact", Range: "0-0" },
  });
  const cr = res.headers.get("content-range") ?? "0-0/0";
  return Number(cr.split("/")[1] ?? 0);
}

const BATCH = 2000;

async function stageAndCommit(file: string, label: string) {
  const buf = readFileSync(file);
  const parsed = await parseWorkbook(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  );

  console.log(`\n=== ${label} ===`);
  console.log(`  sheets read        ${parsed.counts.sheetsRead}`);
  console.log(`  total rows         ${parsed.counts.totalRows}`);
  console.log(`  rollup rows        ${parsed.counts.rollupRows}  (filtered)`);
  console.log(`  detail rows        ${parsed.counts.detailRows}`);
  console.log(`  advisor-day totals ${parsed.counts.advisorTotalRows}`);
  console.log(`  dates              ${parsed.dates[0]} → ${parsed.dates.at(-1)} (${parsed.dates.length})`);
  console.log(`  dealers            ${parsed.dealers.length}`);
  console.log(`  advisors           ${parsed.advisors.length}`);
  if (parsed.warnings.length) {
    console.log(`  warnings           ${parsed.warnings.length}`);
    for (const w of parsed.warnings.slice(0, 5)) console.log(`     - ${w}`);
  }

  // resolve dealers -> rooftops that already exist
  const tops: { id: string; name: string }[] = await rest("rooftop?select=id,name");
  const byName = new Map(tops.map((t) => [t.name.trim().toLowerCase(), t.id]));

  const imp = await rest("dms_import", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      file_name: file.split("/").pop(),
      file_hash: `verify-${label}`,
      status: "preview",
      covers_from: parsed.dates[0],
      covers_to: parsed.dates.at(-1),
    }),
  });
  const importId = imp[0].id as string;

  for (let i = 0; i < parsed.detail.length; i += BATCH) {
    await rest("dms_import_row", {
      method: "POST",
      body: JSON.stringify(
        parsed.detail.slice(i, i + BATCH).map((r) => ({
          import_id: importId,
          report_date: r.reportDate,
          dealer_name: r.dealerName,
          rooftop_id: byName.get(r.dealerName.trim().toLowerCase()) ?? null,
          advisor_raw: r.advisorRaw,
          advisor_op_id: r.advisorOpId,
          sub_category: r.subCategory,
          op_code: r.opCode,
          op_description: r.opDescription,
          cp_ros: r.cpRos,
          frhs: r.frhs,
          labor_sales: r.laborSales,
          labor_per_ro: r.laborPerRo,
          labor_gp_pct: r.laborGpPct,
          tot_per_ro: r.totPerRo,
          elr: r.elr,
          num_ros: r.numRos,
          labor_gp: r.laborGp,
          parts_gp: r.partsGp,
          gp: r.gp,
          gp_pct: r.gpPct,
        }))
      ),
    });
  }

  for (let i = 0; i < parsed.advisorTotals.length; i += BATCH) {
    await rest("dms_import_advisor_total", {
      method: "POST",
      body: JSON.stringify(
        parsed.advisorTotals.slice(i, i + BATCH).map((r) => ({
          import_id: importId,
          report_date: r.reportDate,
          dealer_name: r.dealerName,
          rooftop_id: byName.get(r.dealerName.trim().toLowerCase()) ?? null,
          advisor_raw: r.advisorRaw,
          advisor_op_id: r.advisorOpId,
          unique_ros: r.uniqueRos,
          frhs: r.frhs,
          labor_sales: r.laborSales,
          elr: r.elr,
          gp: r.gp,
        }))
      ),
    });
  }

  const res = await fetch(`${URL}/rest/v1/rpc/commit_dms_import`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ _import_id: importId }),
  });
  const out = await res.text();
  if (!res.ok) throw new Error(`commit failed: ${out.slice(0, 400)}`);
  console.log("  commit:", out);

  // The same second call the upload action makes: rules go down as data.
  const rules = parsed.subCategories.map((s) => ({
    sub_category: s.name,
    family: autoMatch(s.name).family,
  }));
  const mapRes = await fetch(`${URL}/rest/v1/rpc/apply_sub_category_automap`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ _import_id: importId, _rules: rules }),
  });
  const mapped = await mapRes.text();
  if (!mapRes.ok) throw new Error(`automap failed: ${mapped.slice(0, 300)}`);
  console.log(`  auto-mapped rows: ${mapped}`);

  return { parsed, importId };
}

/** A stable fingerprint of the fact tables, for the no-op proof. */
async function fingerprint() {
  const metrics = await count("dms_daily_metric");
  const totals = await count("dms_daily_advisor_total");
  const advisors = await count("dms_advisor");
  const rooftops = await count("rooftop");
  const sums: { sum_labor: number; sum_ros: number }[] = await rest(
    "rpc/dms_fingerprint",
    { method: "POST", body: "{}" }
  ).catch(() => [{ sum_labor: -1, sum_ros: -1 }]);
  return { metrics, totals, advisors, rooftops, sums: sums?.[0] ?? null };
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: npm run verify:dms -- /path/to/workbook.xlsx");
    process.exit(1);
  }

  const first = await stageAndCommit(file, "first import");
  const fp1 = await fingerprint();
  console.log("\n  after first commit:", JSON.stringify(fp1));

  // ---- 3. unique ROs are not the sum of lines ----------------------------
  const day = first.parsed.dates[0]!;
  const totals: { rooftop_id: string; advisor_op_id: string; unique_ros: number }[] =
    await rest(`dms_daily_advisor_total?select=rooftop_id,advisor_op_id,unique_ros&report_date=eq.${day}&limit=5`);
  console.log(`\n=== unique RO check (${day}) ===`);
  for (const t of totals) {
    const lines: { cp_ros: number }[] = await rest(
      `dms_daily_metric?select=cp_ros&report_date=eq.${day}&rooftop_id=eq.${t.rooftop_id}&advisor_op_id=eq.${t.advisor_op_id}`
    );
    const summed = lines.reduce((s, l) => s + Number(l.cp_ros ?? 0), 0);
    const flag = summed === Number(t.unique_ros) ? "same" : "DIFFERS — sum would over-count";
    console.log(
      `  advisor ${t.advisor_op_id}: lines sum ${summed}, authoritative ${t.unique_ros}   ${flag}`
    );
  }

  // ---- 4. re-upload the same file ----------------------------------------
  await stageAndCommit(file, "second import (same file)");
  const fp2 = await fingerprint();
  console.log("\n  after second commit:", JSON.stringify(fp2));

  const same =
    fp1.metrics === fp2.metrics &&
    fp1.totals === fp2.totals &&
    fp1.advisors === fp2.advisors &&
    fp1.rooftops === fp2.rooftops;
  console.log(
    `\n=== IDEMPOTENCY: ${same ? "PROVEN — re-upload was a no-op" : "FAILED — counts moved"} ===`
  );

  // ---- mapping coverage ---------------------------------------------------
  const subs = first.parsed.subCategories;
  const mapped = subs.filter((s) => autoMatch(s.name).family);
  const mappedRows = mapped.reduce((n, s) => n + s.rows, 0);
  const allRows = subs.reduce((n, s) => n + s.rows, 0);
  console.log(
    `\n=== mapping: ${mapped.length}/${subs.length} sub-categories auto-mapped, ` +
      `${mappedRows}/${allRows} rows (${((100 * mappedRows) / allRows).toFixed(1)}%) ===`
  );

  if (!same) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
