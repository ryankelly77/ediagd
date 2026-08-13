/* ============================================================================
   EDIAGD — the unmapped sub-category queue, as a sheet Mitch can decide on

       npm run export-queue

   Writes exports/unmapped-sub-categories.xlsx.

   DRIVEN BY THE APP'S OWN RULES. The allowed answers come from
   lib/dms/mapping.ts's SERVICE_FAMILIES, so the dropdown in the sheet and the
   families the importer will accept are the same list by construction. A
   hand-typed list in a spreadsheet is how somebody returns "Brakes" for a
   family called "Brake Service" and nobody notices until the import rejects it.

   THE DECISION COLUMN IS A DROPDOWN, not free text, for the same reason.

   NO PERSON IS IN THIS FILE. Sub-category, money, store count, and the op-code
   descriptions the dealership writes. No advisors, no customers — it is going
   to leave the building and land in somebody's inbox.
   ============================================================================ */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { SERVICE_FAMILIES, AMBIGUOUS, normaliseSubCategory } from "../lib/dms/mapping";

const URL = process.env.SB_URL ?? "";
const KEY = process.env.SB_KEY ?? "";
if (!URL || !KEY) {
  console.error("Set SB_URL and SB_KEY (service-role key).");
  process.exit(1);
}

const NOT_COACHABLE = "Not a coachable service";
const CHOICES = [...SERVICE_FAMILIES, NOT_COACHABLE];

type Row = {
  sub_category: string;
  total_rows: number;
  labor_sales: number;
  ro_lines: number;
  rooftops: number;
  first_seen: string;
  last_seen: string;
  examples: string;
};

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function get(pathAndQuery: string) {
  const out: Record<string, unknown>[] = [];
  let off = 0;
  for (;;) {
    const r = await fetch(`${URL}/rest/v1/${pathAndQuery}&limit=1000&offset=${off}`, {
      headers: H,
    });
    if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 200)}`);
    const page = (await r.json()) as Record<string, unknown>[];
    out.push(...page);
    if (page.length < 1000) return out;
    off += 1000;
  }
}

/**
 * Fallback for a database that has not had 0052 applied yet.
 *
 * The totals come from dms_unmapped_sub_category, which has existed since 0038,
 * and the examples from a bounded per-sub-category read. It exists so the sheet
 * can be produced during the window between shipping this script and running
 * the migration — the alternative was handing somebody a sheet built from
 * whatever database happened to be reachable, and the money column is what sets
 * the order of attention.
 */
async function viaViews(): Promise<Row[]> {
  const raw = await get("dms_unmapped_sub_category?select=sub_category,rows,ro_lines,labor_sales,first_seen,last_seen,rooftop_id");
  const agg = new Map<string, Row & { stores: Set<string> }>();
  for (const r of raw) {
    const k = String(r.sub_category);
    const cur =
      agg.get(k) ??
      ({
        sub_category: k,
        total_rows: 0,
        labor_sales: 0,
        ro_lines: 0,
        rooftops: 0,
        first_seen: String(r.first_seen ?? ""),
        last_seen: String(r.last_seen ?? ""),
        examples: "",
        stores: new Set<string>(),
      } as Row & { stores: Set<string> });
    cur.total_rows += Number(r.rows ?? 0);
    cur.labor_sales += Number(r.labor_sales ?? 0);
    cur.ro_lines += Number(r.ro_lines ?? 0);
    cur.stores.add(String(r.rooftop_id));
    if (String(r.first_seen ?? "") < cur.first_seen) cur.first_seen = String(r.first_seen);
    if (String(r.last_seen ?? "") > cur.last_seen) cur.last_seen = String(r.last_seen);
    agg.set(k, cur);
  }

  const rows: Row[] = [];
  for (const [name, a] of agg) {
    const sample = await get(
      `dms_daily_metric?select=op_code,op_description,labor_sales&sub_category=eq.${encodeURIComponent(name)}&order=labor_sales.desc.nullslast`
    ).then((x) => x.slice(0, 400));
    const byCode = new Map<string, number>();
    const desc = new Map<string, string>();
    for (const s of sample) {
      const d = String(s.op_description ?? "").trim();
      if (!d) continue;
      const code = String(s.op_code);
      byCode.set(code, (byCode.get(code) ?? 0) + Number(s.labor_sales ?? 0));
      desc.set(code, d);
    }
    const examples = [...byCode.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 3)
      .map(([code]) => `${code} — ${desc.get(code)}`)
      .join("\n");
    rows.push({ ...a, rooftops: a.stores.size, examples });
  }
  return rows.sort((x, y) => y.labor_sales - x.labor_sales);
}

async function main() {
  const res = await fetch(`${URL}/rest/v1/rpc/unmapped_decision_sheet`, {
    method: "POST",
    headers: H,
    body: "{}",
  });

  let rows: Row[];
  if (res.ok) {
    rows = (await res.json()) as Row[];
  } else {
    console.log("  (unmapped_decision_sheet not deployed — building from views)");
    rows = await viaViews();
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "EDIAGD";
  const ws = wb.addWorksheet("Decide", {
    views: [{ state: "frozen", ySplit: 3 }],
  });

  ws.mergeCells("A1:H1");
  const title = ws.getCell("A1");
  title.value = "Service sub-categories awaiting a decision";
  title.font = { bold: true, size: 14 };

  ws.mergeCells("A2:H2");
  ws.getCell("A2").value =
    `Pick a service family for each row, or "${NOT_COACHABLE}" if it is not something an advisor sells ` +
    "(state inspections, diagnosis, body work). Rows are ordered by labor dollars — the top of the list " +
    "is where being wrong costs most. Leave a row blank if you are unsure and we will talk it through.";
  ws.getCell("A2").alignment = { wrapText: true, vertical: "top" };
  ws.getRow(2).height = 34;

  const header = [
    "Sub-category",
    "Labor $",
    "RO lines",
    "Rows",
    "Stores",
    "First seen",
    "Last seen",
    "Example op codes (what the store actually writes)",
    "DECISION",
    "Why it was left for you",
  ];
  const hr = ws.addRow(header);
  hr.font = { bold: true };
  hr.alignment = { vertical: "middle", wrapText: true };
  hr.height = 30;
  hr.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F0E4" } };
    c.border = { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } };
  });

  for (const r of rows) {
    const row = ws.addRow([
      r.sub_category,
      Number(r.labor_sales ?? 0),
      Number(r.ro_lines ?? 0),
      Number(r.total_rows ?? 0),
      Number(r.rooftops ?? 0),
      r.first_seen,
      r.last_seen,
      r.examples,
      "",
      AMBIGUOUS[normaliseSubCategory(r.sub_category)] ?? "",
    ]);
    row.getCell(2).numFmt = '"$"#,##0';
    row.getCell(3).numFmt = "#,##0";
    row.getCell(4).numFmt = "#,##0";
    row.getCell(8).alignment = { wrapText: true, vertical: "top" };
    row.getCell(10).alignment = { wrapText: true, vertical: "top" };
    row.height = 46;

    // The decision cell: a dropdown, so the answer is always a family the
    // importer recognises.
    row.getCell(9).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${CHOICES.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "Pick from the list",
      error: "Choose a service family, or 'Not a coachable service'.",
    };
    row.getCell(9).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFF7E0" },
    };
    row.getCell(9).border = {
      left: { style: "thin", color: { argb: "FFE8B44C" } },
      right: { style: "thin", color: { argb: "FFE8B44C" } },
      top: { style: "thin", color: { argb: "FFE8B44C" } },
      bottom: { style: "thin", color: { argb: "FFE8B44C" } },
    };
  }

  ws.columns = [
    { width: 30 },
    { width: 12 },
    { width: 10 },
    { width: 9 },
    { width: 8 },
    { width: 12 },
    { width: 12 },
    { width: 52 },
    { width: 26 },
    { width: 40 },
  ];

  // A second sheet naming the choices, so the sheet explains itself offline.
  const key = wb.addWorksheet("Families");
  key.addRow(["The allowed answers"]).font = { bold: true, size: 12 };
  key.addRow([]);
  for (const f of SERVICE_FAMILIES) key.addRow([f]);
  key.addRow([]);
  key.addRow([NOT_COACHABLE]).font = { bold: true };
  key.addRow([
    "Use this for work an advisor cannot sell: state inspections, diagnosis, body shop, warranty-only.",
  ]);
  key.addRow([
    "These rows stay in the data and are deliberately excluded from attach rates and coaching.",
  ]);
  key.getColumn(1).width = 90;
  key.getColumn(1).alignment = { wrapText: true };

  const dir = path.join(process.cwd(), "exports");
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, "unmapped-sub-categories.xlsx");
  await wb.xlsx.writeFile(out);

  // A CSV twin, for importing into Google Sheets. Sheets drops Excel's data
  // validation on import, so the allowed answers ride along as a trailing
  // column of instructions rather than a dropdown that would silently vanish.
  const csvEsc = (v: string | number) => {
    const t = String(v ?? "");
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const csvRows = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.sub_category,
        Math.round(Number(r.labor_sales ?? 0)),
        Math.round(Number(r.ro_lines ?? 0)),
        Number(r.total_rows ?? 0),
        Number(r.rooftops ?? 0),
        r.first_seen,
        r.last_seen,
        r.examples,
        "",
        AMBIGUOUS[normaliseSubCategory(r.sub_category)] ?? "",
      ].map(csvEsc).join(",")
    ),
  ];
  const csvPath = path.join(dir, "unmapped-sub-categories.csv");
  writeFileSync(csvPath, csvRows.join("\n"), "utf8");

  const money = rows.reduce((n, r) => n + Number(r.labor_sales ?? 0), 0);
  console.log(`\n  ${rows.length} sub-categories awaiting a decision`);
  console.log(`  $${money.toLocaleString("en-US", { maximumFractionDigits: 0 })} of labor across them`);
  console.log(`  ${CHOICES.length} allowed answers (${SERVICE_FAMILIES.length} families + "${NOT_COACHABLE}")`);
  console.log(`\n  wrote ${out}`);
  console.log(`  wrote ${csvPath}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
