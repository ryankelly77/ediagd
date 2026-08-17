/* ============================================================================
   Mitch's round two — the op-code lines the PARTIAL/SPLIT rules did not claim.

   His triage ruled nine sub-categories PARTIAL or SPLIT: "the coachable service
   is in here, and so is repair". The rules in lib/dms/mapping.ts capture the
   part that can be identified from the store's own op-code text — $442,505 of
   $3,346,405. This is the other $2.9M, one row per distinct op-code
   description, sorted by labor dollars.

   MOST OF IT SHOULD STAY UNCLAIMED. Engine repair, transmission replacement and
   rack-and-pinion work are not coachable sales and the rules are right to skip
   them. The sheet exists so Mitch can find the exceptions — a service his stores
   book under a repair label — not so he can classify all 1,800 rows.

   NO PERSON APPEARS IN THIS OUTPUT. Sub-category, op code, the description the
   dealership typed, money and reach. It is a document about work, and it is
   going to leave the building.
   ============================================================================ */
import ExcelJS from "exceljs";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { OP_TEXT_RULES, SERVICE_FAMILIES } from "../lib/dms/mapping";

const URL = process.env.SB_URL!;
const KEY = process.env.SB_KEY!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const NOT_COACHABLE = "Not a coachable service";
const CHOICES = [...SERVICE_FAMILIES, NOT_COACHABLE];

type Row = {
  sub_category: string;
  op_code: string;
  op_description: string;
  labor_sales: number;
  ro_lines: number;
  lines: number;
  rooftops: number;
};

async function main() {
  const res = await fetch(`${URL}/rest/v1/rpc/op_text_residue`, {
    method: "POST", headers: H, body: "{}",
  });
  if (!res.ok) throw new Error(`op_text_residue: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const rows = (await res.json()) as Row[];

  const totalMoney = rows.reduce((s, r) => s + Number(r.labor_sales ?? 0), 0);
  const totalLines = rows.reduce((s, r) => s + Number(r.lines ?? 0), 0);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Round Two");

  ws.columns = [
    { header: "Sub-category", key: "sc", width: 28 },
    { header: "Store Op Code", key: "code", width: 14 },
    { header: "Op Code Description", key: "desc", width: 72 },
    { header: "Labor $", key: "money", width: 13 },
    { header: "RO Lines", key: "ro", width: 10 },
    { header: "Rows", key: "lines", width: 8 },
    { header: "Stores", key: "tops", width: 8 },
    { header: "Coachable? (pick one)", key: "answer", width: 26 },
    { header: "Mitch's Note", key: "note", width: 46 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const r of rows) {
    const row = ws.addRow({
      sc: r.sub_category,
      code: r.op_code,
      desc: r.op_description,
      money: Number(r.labor_sales ?? 0),
      ro: Number(r.ro_lines ?? 0),
      lines: Number(r.lines ?? 0),
      tops: Number(r.rooftops ?? 0),
      answer: "",
      note: "",
    });

    // Same closed answer list as the first decision sheet, so the two
    // round-trips speak the same vocabulary and nothing needs interpreting on
    // the way back.
    row.getCell(8).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${CHOICES.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "Pick from the list",
      error: "Use one of the EDIAGD families, or 'Not a coachable service'.",
    };
    row.getCell(8).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFF7E0" },
    };
  }
  ws.getColumn("money").numFmt = '"$"#,##0';
  ws.getColumn("ro").numFmt = "#,##0.0";

  // ---- What the rules already took, so the sheet is not read as the whole job
  const ctx = wb.addWorksheet("What the rules took");
  ctx.columns = [
    { header: "Sub-category", key: "sc", width: 30 },
    { header: "Family", key: "fam", width: 18 },
    { header: "Captured $", key: "m", width: 14 },
    { header: "Left here $", key: "r", width: 14 },
    { header: "Captured %", key: "p", width: 12 },
    { header: "Why", key: "note", width: 90 },
  ];
  ctx.getRow(1).font = { bold: true };
  for (const r of OP_TEXT_RULES) {
    const tot = r.matched + r.residue;
    ctx.addRow({
      sc: r.subCategory,
      fam: r.family,
      m: r.matched,
      r: r.residue,
      p: tot > 0 ? r.matched / tot : 0,
      note: r.note,
    });
  }
  ctx.getColumn("m").numFmt = '"$"#,##0';
  ctx.getColumn("r").numFmt = '"$"#,##0';
  ctx.getColumn("p").numFmt = "0%";

  const dir = path.join(process.cwd(), "exports");
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, "op-code-residue-round-two.xlsx");
  await wb.xlsx.writeFile(out);

  // CSV alongside, because the last sheet reached Mitch as a Google Sheet and
  // an import wants a flat file.
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    ["Sub-category", "Store Op Code", "Op Code Description", "Labor $", "RO Lines", "Rows", "Stores", "Coachable? (pick one)", "Mitch's Note"].join(","),
    ...rows.map((r) => [
      r.sub_category, r.op_code, r.op_description,
      Number(r.labor_sales ?? 0).toFixed(2), Number(r.ro_lines ?? 0),
      r.lines, r.rooftops, "", "",
    ].map(esc).join(",")),
  ];
  const csvPath = path.join(dir, "op-code-residue-round-two.csv");
  writeFileSync(csvPath, csv.join("\n"), "utf8");

  console.log(`  ${rows.length.toLocaleString()} residue rows, $${Math.round(totalMoney).toLocaleString()} labor, ${totalLines.toLocaleString()} daily lines`);
  console.log(`  ${CHOICES.length} allowed answers (${SERVICE_FAMILIES.length} families + "${NOT_COACHABLE}")`);
  console.log(`  xlsx -> ${out}`);
  console.log(`  csv  -> ${csvPath}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
