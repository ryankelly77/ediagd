/* ============================================================================
   EDIAGD — reading Doggett's monthly workbook
   SERVER ONLY. Never import this into a client component: it pulls in exceljs.

   SHAPE OF THE FILE. An Index sheet listing one tab per report date, two
   pre-aggregated sheets we ignore, and 34 daily tabs. Each daily tab has TWO
   header rows — row 1 names the columns, row 2 splits "Op Code" into Code and
   Description — so data starts at row 3.

   WHY THE PRE-AGGREGATED SHEETS ARE IGNORED. "Op Code Frequency" and "Advisor
   Summary" are the report's own rollups over the whole period. Reading them
   would mean trusting somebody else's arithmetic over a date range we did not
   choose, and it is exactly the arithmetic we need to control: attach rates
   depend on the RO denominator, and that denominator is the thing most easily
   got wrong. Everything is recomputed from the daily tabs.

   THE FOUR ROLLUP MARKERS. Any row whose Dealer, Advisor, Sub Category or Op
   Code is the literal "All ..." string is a subtotal. 11,142 of 21,671 rows in
   the first file are one of these. They are dropped — EXCEPT the one that
   carries information found nowhere else, see below.

   THE ONE ROLLUP WE KEEP. A row that is real dealer + real advisor + "All Sub
   Categories" + "All Op Codes" is that advisor's day: it holds the count of
   UNIQUE repair orders. That number cannot be derived from the detail rows,
   because one RO carries op codes in several sub-categories and summing the
   lines over-counts it. Measured on Jul 01: three lines summing to 3, against
   a true count of 2.
   ============================================================================ */

// No `server-only` guard package in this project's dependency tree; the file
// header is the contract. Importing exceljs into a client bundle would fail
// loudly at build time anyway.
import ExcelJS from "exceljs";
import { autoMatch } from "./mapping";

const SKIP_SHEETS = new Set(["Index", "Op Code Frequency", "Advisor Summary"]);
const ROLLUP_MARKERS = new Set([
  "all advisors",
  "all sub categories",
  "all op codes",
  "all dealers",
]);

/** Column positions on a daily tab, 1-based, from the row-1 header. */
const COL = {
  dealer: 1,
  advisor: 2,
  subCategory: 3,
  opCode: 4,
  opDescription: 5,
  cpRos: 6,
  pctOfTotal: 7,
  frhs: 8,
  frhsPerRo: 9,
  laborSales: 10,
  laborPerRo: 11,
  laborGpPct: 12,
  totPerRo: 13,
  elr: 14,
  numRos: 15,
  laborGp: 16,
  partsGp: 17,
  gp: 18,
  gpPct: 19,
} as const;

export type DetailRow = {
  reportDate: string; // ISO date
  dealerName: string;
  advisorRaw: string;
  advisorOpId: string;
  subCategory: string;
  opCode: string;
  opDescription: string | null;
  cpRos: number | null;
  pctOfTotal: number | null;
  frhs: number | null;
  frhsPerRo: number | null;
  laborSales: number | null;
  laborPerRo: number | null;
  laborGpPct: number | null;
  totPerRo: number | null;
  elr: number | null;
  numRos: number | null;
  laborGp: number | null;
  partsGp: number | null;
  gp: number | null;
  gpPct: number | null;
};

export type AdvisorTotalRow = {
  reportDate: string;
  dealerName: string;
  advisorRaw: string;
  advisorOpId: string;
  uniqueRos: number | null;
  frhs: number | null;
  laborSales: number | null;
  laborPerRo: number | null;
  elr: number | null;
  gp: number | null;
  gpPct: number | null;
};

export type ParseResult = {
  detail: DetailRow[];
  advisorTotals: AdvisorTotalRow[];
  dates: string[];
  dealers: string[];
  advisors: { opId: string; name: string; dealer: string }[];
  subCategories: { name: string; rows: number }[];
  counts: {
    sheetsRead: number;
    totalRows: number;
    rollupRows: number;
    detailRows: number;
    advisorTotalRows: number;
  };
  /** Anything that would silently lose data if ignored. */
  warnings: string[];
};

function text(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object" && "richText" in v) {
    return (v.richText as { text: string }[]).map((r) => r.text).join("");
  }
  if (typeof v === "object" && "text" in v) return String(v.text);
  if (typeof v === "object" && "result" in v) return String(v.result ?? "");
  return String(v).trim();
}

function num(v: ExcelJS.CellValue): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "object" && "result" in v) {
    const r = (v as { result?: unknown }).result;
    return typeof r === "number" && Number.isFinite(r) ? r : null;
  }
  // The export writes some numerics as strings, with $ and % decoration.
  const cleaned = String(v).replace(/[$,%\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const isRollup = (s: string) => ROLLUP_MARKERS.has(s.trim().toLowerCase());

/**
 * "Esparza, David (35122)" → "35122".
 *
 * The operator id is the join to everything else — membership.op_code_id, and
 * every fact table's advisor_op_id. A row whose advisor carries no id cannot
 * be attributed to anybody, so it is reported rather than imported under a
 * guessed key. All 72 advisors in the first file parse cleanly.
 */
export function advisorOpId(raw: string): string | null {
  const m = raw.match(/\((\w+)\)\s*$/);
  return m ? m[1]! : null;
}

const MONTH_ABBR = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * ISO date from an Index cell, or from a tab name like "Jul 01".
 *
 * ---------------------------------------------------------------------------
 * NOTHING ROUND-TRIPS THROUGH new Date(string).toISOString()
 * ---------------------------------------------------------------------------
 * That pair is a timezone conversion wearing a date parser's clothes.
 * `new Date("Jul 1, 2026")` is LOCAL midnight and `.toISOString()` renders in
 * UTC, so the day survives only while the machine sits at or behind UTC — which
 * Vercel and a Central-time laptop both do, and which is exactly why it has
 * never misfired and would misfire silently the first time it ran anywhere
 * else. report_date decides which month a row's revenue lands in, so an
 * off-by-one at a month boundary moves a whole day of a store's numbers into
 * the wrong period.
 *
 * Every branch below reads the parts and formats them. The Date branch uses the
 * UTC accessors because that is how ExcelJS materialises a date cell — at UTC
 * midnight — so the parts are the ones the spreadsheet holds.
 *
 * `fallbackYear` is NULLABLE now, and null means "the file never said". A tab
 * called "Jul 01" carries no year, and inventing one from the clock is how a
 * December workbook imported in January files twelve months into the wrong one.
 * Returning null makes the caller refuse and name the tab.
 */
function isoDate(
  value: ExcelJS.CellValue,
  fallbackYear: number | null
): string | null {
  if (value instanceof Date) {
    return iso(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }

  const s = text(value);
  if (!s) return null;

  // Already ISO: take the parts as written.
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return iso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  // US-style, which is what a hand-typed Index cell looks like.
  const usMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (usMatch) {
    return iso(Number(usMatch[3]), Number(usMatch[1]), Number(usMatch[2]));
  }

  // A tab name: "Jul 01", "Jul 1". Needs a year from somewhere that is not the
  // clock.
  const tabMatch = s.match(/^([A-Za-z]{3})\s*(\d{1,2})$/);
  if (tabMatch) {
    if (fallbackYear == null) return null;
    const month = MONTH_ABBR.indexOf(tabMatch[1].toLowerCase()) + 1;
    if (month === 0) return null;
    return iso(fallbackYear, month, Number(tabMatch[2]));
  }

  return null;
}

export async function parseWorkbook(buffer: ArrayBuffer): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const warnings: string[] = [];

  // ---- The Index tells us which tab is which date -------------------------
  // Falls back to the tab name, because a workbook assembled by hand one month
  // with a missing Index row must not silently drop that whole day.
  const dateByTab = new Map<string, string>();
  const index = wb.getWorksheet("Index");
  /*
   * THE YEAR COMES FROM THE FILE OR IT DOES NOT COME.
   *
   * This was `new Date().getUTCFullYear()` — the year the import happened to
   * run. A tab called "Jul 01" carries no year, so a December 2025 workbook
   * imported in January 2026 resolved every tab to 2026: twelve months of a
   * store's revenue filed under months that do not exist, December left empty,
   * and nothing in the output saying a year had been guessed.
   *
   * Null until an Index row supplies one. If no tab can be dated, the parse
   * refuses and names the tabs rather than importing a plausible fiction.
   */
  let year: number | null = null;
  if (index) {
    index.eachRow((row) => {
      const d = row.getCell(1).value;
      const tab = text(row.getCell(2).value);
      if (!tab) return;
      const resolved = isoDate(d, year);
      if (resolved) {
        dateByTab.set(tab, resolved);
        year = Number(resolved.slice(0, 4));
      }
    });
  } else {
    warnings.push("No Index sheet — dates were read from tab names.");
  }

  const detail: DetailRow[] = [];
  const advisorTotals: AdvisorTotalRow[] = [];
  const dates = new Set<string>();
  const dealers = new Set<string>();
  const advisors = new Map<string, { opId: string; name: string; dealer: string }>();
  const subCategories = new Map<string, number>();

  let totalRows = 0;
  let rollupRows = 0;
  let sheetsRead = 0;

  /* Tabs whose name IS a date but which have no year to attach it to. Collected
     rather than skipped: see the refusal after the loop. */
  const yearless: string[] = [];

  for (const ws of wb.worksheets) {
    if (SKIP_SHEETS.has(ws.name)) continue;
    const reportDate = dateByTab.get(ws.name) ?? isoDate(ws.name, year);
    if (!reportDate) {
      if (year == null && /^[A-Za-z]{3}\s*\d{1,2}$/.test(ws.name.trim())) {
        yearless.push(ws.name);
        continue;
      }
      warnings.push(`Tab "${ws.name}" has no readable date — skipped entirely.`);
      continue;
    }
    sheetsRead++;
    dates.add(reportDate);

    ws.eachRow((row, rowNumber) => {
      if (rowNumber < 3) return; // two header rows
      const dealer = text(row.getCell(COL.dealer).value);
      if (!dealer) return;

      const advisorRaw = text(row.getCell(COL.advisor).value);
      const subCategory = text(row.getCell(COL.subCategory).value);
      const opCode = text(row.getCell(COL.opCode).value);
      totalRows++;

      const dealerRollup = isRollup(dealer);
      const advisorRollup = isRollup(advisorRaw);
      const subRollup = isRollup(subCategory);
      const opRollup = isRollup(opCode);

      // ---- the one rollup worth keeping ---------------------------------
      if (!dealerRollup && !advisorRollup && subRollup && opRollup) {
        rollupRows++;
        const opId = advisorOpId(advisorRaw);
        if (!opId) return;
        advisorTotals.push({
          reportDate,
          dealerName: dealer,
          advisorRaw,
          advisorOpId: opId,
          uniqueRos: num(row.getCell(COL.cpRos).value),
          frhs: num(row.getCell(COL.frhs).value),
          laborSales: num(row.getCell(COL.laborSales).value),
          laborPerRo: num(row.getCell(COL.laborPerRo).value),
          elr: num(row.getCell(COL.elr).value),
          gp: num(row.getCell(COL.gp).value),
          gpPct: num(row.getCell(COL.gpPct).value),
        });
        return;
      }

      if (dealerRollup || advisorRollup || subRollup || opRollup) {
        rollupRows++;
        return;
      }

      // ---- a detail line ---------------------------------------------------
      const opId = advisorOpId(advisorRaw);
      if (!opId) {
        warnings.push(
          `${reportDate} ${dealer}: advisor "${advisorRaw}" carries no operator id — row skipped.`
        );
        return;
      }

      dealers.add(dealer);
      advisors.set(`${dealer}|${opId}`, { opId, name: advisorRaw, dealer });
      subCategories.set(subCategory, (subCategories.get(subCategory) ?? 0) + 1);

      detail.push({
        reportDate,
        dealerName: dealer,
        advisorRaw,
        advisorOpId: opId,
        subCategory,
        opCode,
        opDescription: text(row.getCell(COL.opDescription).value) || null,
        cpRos: num(row.getCell(COL.cpRos).value),
        pctOfTotal: num(row.getCell(COL.pctOfTotal).value),
        frhs: num(row.getCell(COL.frhs).value),
        frhsPerRo: num(row.getCell(COL.frhsPerRo).value),
        laborSales: num(row.getCell(COL.laborSales).value),
        laborPerRo: num(row.getCell(COL.laborPerRo).value),
        laborGpPct: num(row.getCell(COL.laborGpPct).value),
        totPerRo: num(row.getCell(COL.totPerRo).value),
        elr: num(row.getCell(COL.elr).value),
        numRos: num(row.getCell(COL.numRos).value),
        laborGp: num(row.getCell(COL.laborGp).value),
        partsGp: num(row.getCell(COL.partsGp).value),
        gp: num(row.getCell(COL.gp).value),
        gpPct: num(row.getCell(COL.gpPct).value),
      });
    });
  }

  /*
   * ---- REFUSE RATHER THAN GUESS THE YEAR ----------------------------------
   *
   * These tabs are named like dates — "Jul 01" — and the workbook never said
   * which year. The old code answered with the year the import happened to run,
   * which is right almost always and catastrophically wrong at the turn of one:
   * a December file imported in January lands twelve months of revenue in the
   * wrong year, creates perf_periods for months that do not exist, and leaves
   * the real month empty. Nothing about the output looks unusual.
   *
   * A whole-file refusal rather than skipping the tabs, because a partial
   * import of a monthly report is a month with days missing from it — and that
   * silently changes every attach rate for the month.
   */
  if (yearless.length > 0) {
    throw new Error(
      `This workbook has no Index sheet, and ${yearless.length} tab(s) are named ` +
        `with a month and day but no year: ${yearless.slice(0, 8).join(", ")}` +
        `${yearless.length > 8 ? ", …" : ""}. ` +
        `Nothing was imported. Add the Index sheet, or rename the tabs to include ` +
        `the year — the year is not something this importer will guess from the ` +
        `date it happens to run.`
    );
  }

  // A day with detail but no advisor totals means unique RO counts are missing
  // for it, and every attach rate on that day would silently use a stale
  // denominator. Worth saying out loud.
  const totalDays = new Set(advisorTotals.map((t) => t.reportDate));
  for (const d of dates) {
    if (!totalDays.has(d)) {
      warnings.push(
        `${d}: no advisor rollup rows — unique RO counts are unavailable for that day.`
      );
    }
  }

  return {
    detail,
    advisorTotals,
    dates: [...dates].sort(),
    dealers: [...dealers].sort(),
    advisors: [...advisors.values()].sort((a, b) => a.opId.localeCompare(b.opId)),
    subCategories: [...subCategories.entries()]
      .map(([name, rows]) => ({ name, rows }))
      .sort((a, b) => b.rows - a.rows),
    counts: {
      sheetsRead,
      totalRows,
      rollupRows,
      detailRows: detail.length,
      advisorTotalRows: advisorTotals.length,
    },
    warnings: [...new Set(warnings)].slice(0, 40),
  };
}

/** Auto-mapping verdicts for everything the file mentioned. */
export function mapSubCategories(parsed: ParseResult) {
  return parsed.subCategories.map((s) => ({ ...s, ...autoMatch(s.name) }));
}
