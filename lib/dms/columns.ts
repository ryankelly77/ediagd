/* ============================================================================
   EDIAGD — work out which column is which, instead of assuming

   PURE. Takes header text and a sample of rows; returns a column map or a
   refusal. No ExcelJS, no database, so every rule here is asserted in
   test:dms-columns without a workbook.

   ---------------------------------------------------------------------------
   THE BUG THIS REPLACES
   ---------------------------------------------------------------------------
   parse.ts carried `const COL = { dealer: 1, advisor: 2, subCategory: 3, ... }`
   under a comment reading "from the row-1 header". A person read the header
   once and froze it into constants; the file's own header row was never
   consulted again. So when the August 2026 export arrived with dealer and
   sub-category the other way round, the parser read position 1 as the dealer,
   filed 11,058 rows under service categories named LOF and Air Filter, and
   reported no warning — because from its point of view nothing was wrong.

   A fixed column map is a promise about somebody else's file format. We do not
   control that format, we are not told when it changes, and the failure is
   silent in exactly the way that matters: the numbers still add up, they are
   just filed against the wrong thing.

   ---------------------------------------------------------------------------
   HOW A COLUMN IS IDENTIFIED — TWO INDEPENDENT SIGNALS
   ---------------------------------------------------------------------------
   1. THE HEADER. Normalised hard (lowercased, punctuation and spaces stripped)
      and matched against aliases, so "Sub Category", "sub-category" and
      "SubCategory" are one thing.

   2. THE CONTENT. The four identity columns can be recognised by what is IN
      them: the dealer column holds rooftop names we already have on file, the
      op-code column holds codes from the catalogue. This is what makes the
      mapping robust to a header nobody has seen before.

   When both agree, the column is certain. When the header is unrecognised but
   the content is unmistakable, the content wins and the mapping says so. When
   they CONTRADICT each other — a column headed "Dealer" full of sub-category
   values — nothing is guessed: the parse refuses and names the conflict, which
   is the case that silently produced 77 rooftops called Air Filter.

   ---------------------------------------------------------------------------
   AND WHEN IT CANNOT TELL
   ---------------------------------------------------------------------------
   It refuses, listing the headers it actually saw. A refusal an admin can read
   and forward to the DMS vendor is worth more than a confident import of the
   wrong columns — which is the trade this whole file exists to make.
============================================================================ */

/** Every column the importer needs, and whether it can proceed without it. */
export const FIELDS = {
  dealer: { required: true, aliases: ["dealer", "dealership", "store", "rooftop", "location"] },
  advisor: { required: true, aliases: ["advisor", "serviceadvisor", "writer", "servicewriter", "advisorname"] },
  subCategory: { required: true, aliases: ["subcategory", "subcat", "category", "servicecategory"] },
  opCode: { required: true, aliases: ["opcode", "code", "operationcode", "op"] },
  /*
   * A DIMENSION, NOT A VALUE. Nothing from this column is stored — it is read
   * only to recognise the "All Departments" rollup, which the August 2026
   * export introduced and which duplicated every line. So its ABSENCE loses
   * nothing, and warning that it "imports empty" is a false alarm: it fired on
   * every monthly workbook we have ever imported successfully, May 2025
   * included, because that report has never had the column.
   */
  dept: { required: false, stored: false, aliases: ["dept", "department"] },
  opDescription: { required: false, aliases: ["opdescription", "description", "opdesc", "operation"] },
  cpRos: { required: false, aliases: ["cpros", "cpro", "customerpayros"] },
  /* "Sales %" is what "% Of Total (1)" was renamed to somewhere between the
     May 2025 and September 2026 exports. Same column, same position, same
     values — a rename the unmapped warning caught before it imported as null. */
  pctOfTotal: { required: false, aliases: ["oftotal", "pctoftotal", "percentoftotal", "salespct"] },
  frhs: { required: false, aliases: ["frhs", "flagratehours", "frh"] },
  frhsPerRo: { required: false, aliases: ["frhsro", "frhsperro"] },
  laborSales: { required: false, aliases: ["laborsales", "laboursales"] },
  laborPerRo: { required: false, aliases: ["lbrro", "laborro", "laborperro", "labourro"] },
  laborGpPct: { required: false, aliases: ["lbrgppct", "laborgppct", "labourgppct"] },
  totPerRo: { required: false, aliases: ["totro", "totalro", "totperro"] },
  elr: { required: false, aliases: ["elr", "effectivelaborrate"] },
  numRos: { required: false, aliases: ["numofros", "numros", "numberofros", "rocount"] },
  laborGp: { required: false, aliases: ["lbrgp", "laborgp"] },
  partsGp: { required: false, aliases: ["ptsgp", "partsgp"] },
  gp: { required: false, aliases: ["gp", "grossprofit"] },
  gpPct: { required: false, aliases: ["gppct", "gp%", "grossprofitpct"] },
} as const;

export type FieldName = keyof typeof FIELDS;

export type ColumnMap = Partial<Record<FieldName, number>>;

export type Detection = {
  map: ColumnMap;
  /** How each resolved column was decided — the audit trail for a mis-import. */
  how: Partial<Record<FieldName, "header" | "content" | "header+content">>;
  problems: string[];
  /** Optional columns nothing matched — these import as null. Never silent. */
  unmapped: FieldName[];
  /** True when the file must not be staged. */
  refused: boolean;
};

/**
 * Collapse a header to its letters and digits.
 *
 * "Labor GP %", "labor_gp_pct" and "LaborGP%" are the same column with three
 * spellings, and a DMS export changes the spelling far more often than it
 * changes the meaning. `%` is kept because it distinguishes "GP" from "GP %",
 * which are different columns.
 */
export function normalizeHeader(raw: string): string {
  return raw.toLowerCase().replace(/%/g, "pct").replace(/[^a-z0-9]/g, "");
}

/**
 * Two header rows, merged.
 *
 * Row 1 names the columns and row 2 splits "Op Code" into Code and Description,
 * so a column's real name is sometimes the pair. Taking row 2 when it is
 * present is what makes "Op Code / Description" resolve to opDescription rather
 * than to a second opCode.
 */
export function mergeHeaderRows(row1: string[], row2: string[]): string[] {
  const width = Math.max(row1.length, row2.length);
  const out: string[] = [];
  for (let i = 0; i < width; i++) {
    const a = (row1[i] ?? "").trim();
    const b = (row2[i] ?? "").trim();
    out.push(b ? (a && normalizeHeader(a) !== normalizeHeader(b) ? `${a} ${b}` : b) : a);
  }
  return out;
}

function headerMatches(header: string, field: FieldName): boolean {
  const h = normalizeHeader(header);
  if (!h) return false;
  const aliases = FIELDS[field].aliases as readonly string[];
  /* Exact first, then containment — "dealername" contains "dealer", but
     "dealer" must not swallow a column called "dealergroup" ahead of a real
     "dealer" column, which is why exact wins outright. */
  if (aliases.includes(h)) return true;
  return aliases.some((a) => h === a || h.startsWith(a) || h.endsWith(a));
}

/* ---------------------------------------------------------------------------
   CONTENT SIGNALS
--------------------------------------------------------------------------- */

const norm = (s: string) => s.trim().toLowerCase();

/** Non-blank cells a column must have before its content is evidence at all. */
const MIN_SAMPLE = 5;

export type ContentHints = {
  /** Rooftop names already on file. */
  rooftops: string[];
  /** Op codes from the catalogue. */
  opCodes: string[];
};

/** What fraction of a column's sample values are in `vocabulary`. */
export function vocabularyShare(values: string[], vocabulary: string[]): number {
  const vocab = new Set(vocabulary.map(norm));
  const seen = values.map(norm).filter(Boolean);
  /*
   * A NEARLY-EMPTY COLUMN PROVES NOTHING.
   *
   * Without this floor, a column with two non-blank cells one of which happens
   * to read "100" scored 0.5 against the op-code catalogue and outranked the
   * real Op Code column — which refused a perfectly good August tab with a
   * confident, wrong explanation. A wrong refusal costs the same trust as a
   * wrong import.
   */
  if (seen.length < MIN_SAMPLE || vocab.size === 0) return 0;
  return seen.filter((v) => vocab.has(v)).length / seen.length;
}

/** An advisor cell reads "Surname, First (123456)" — the id is the giveaway. */
export function advisorShare(values: string[]): number {
  const seen = values.map((v) => v.trim()).filter(Boolean);
  if (seen.length < MIN_SAMPLE) return 0;
  return seen.filter((v) => /\(\s*\d{3,}\s*\)\s*$/.test(v)).length / seen.length;
}

const STRONG = 0.6;

/**
 * Decide the column map from headers, then check it against the data.
 *
 * `sample` is column-major: sample[i] is a handful of values from column i.
 */
export function detectColumns(
  headers: string[],
  sample: string[][],
  hints: ContentHints
): Detection {
  const map: ColumnMap = {};
  const how: Detection["how"] = {};
  const problems: string[] = [];
  const unmapped: FieldName[] = [];

  // ---- 1. headers ---------------------------------------------------------
  const claimedBy = new Map<number, FieldName>();
  for (const field of Object.keys(FIELDS) as FieldName[]) {
    const idx = headers.findIndex((h, i) => !claimedBy.has(i) && headerMatches(h, field));
    if (idx >= 0) {
      map[field] = idx;
      how[field] = "header";
      claimedBy.set(idx, field);
    }
  }

  // ---- 2. what the data says ---------------------------------------------
  const dealerLike = sample.map((vals) => vocabularyShare(vals, hints.rooftops));
  const opCodeLike = sample.map((vals) => vocabularyShare(vals, hints.opCodes));
  const advisorLike = sample.map((vals) => advisorShare(vals));

  const bestOf = (scores: number[]): { idx: number; score: number } => {
    let idx = -1;
    let score = 0;
    scores.forEach((s, i) => {
      if (s > score) {
        score = s;
        idx = i;
      }
    });
    return { idx, score };
  };

  const contentFor: Partial<Record<FieldName, { idx: number; score: number }>> = {
    dealer: bestOf(dealerLike),
    opCode: bestOf(opCodeLike),
    advisor: bestOf(advisorLike),
  };

  for (const field of ["dealer", "opCode", "advisor"] as const) {
    const found = contentFor[field];
    if (!found || found.idx < 0 || found.score < STRONG) continue;

    if (map[field] === undefined) {
      /* The header was unrecognised but the column is unmistakable. Take it —
         this is the case a new export format lands in. */
      map[field] = found.idx;
      how[field] = "content";
      claimedBy.set(found.idx, field);
    } else if (map[field] === found.idx) {
      how[field] = "header+content";
    } else {
      /*
       * THE AUGUST FAILURE, CAUGHT.
       *
       * The header says this column is the dealer and the data says a different
       * column is. One of them is wrong and there is no safe way to choose, so
       * nothing is guessed.
       */
      problems.push(
        `Column ${map[field]! + 1} is headed "${headers[map[field]!] ?? "?"}" so it should be the ` +
          `${field}, but column ${found.idx + 1} ("${headers[found.idx] ?? "?"}") is the one that ` +
          `actually contains ${field === "opCode" ? "op codes" : field === "advisor" ? "advisor names" : "rooftop names"}. ` +
          `The columns are not in the order this file's header claims.`
      );
    }
  }

  // ---- 3. anything still missing -----------------------------------------
  for (const field of Object.keys(FIELDS) as FieldName[]) {
    if (map[field] !== undefined) continue;
    if (FIELDS[field].required) {
      problems.push(
        `No column found for "${field}". Headers in this file: ` +
          headers.map((h, i) => `${i + 1}:${h || "(blank)"}`).join(", ")
      );
    } else {
      /*
       * AN UNMATCHED OPTIONAL COLUMN IS NOT HARMLESS.
       *
       * It imports as null, which is silent data loss of exactly the kind this
       * file exists to stop: Labor GP quietly absent reads downstream as a
       * store that made none. It does not refuse — a report genuinely without
       * the column must still import — but it is never passed over in silence.
       *
       * Unless nothing is stored from it. A warning that cannot indicate data
       * loss is noise, and noise is what stops anyone reading the warnings that
       * can.
       */
      if ((FIELDS[field] as { stored?: boolean }).stored !== false) unmapped.push(field);
    }
  }

  return { map, how, problems, unmapped, refused: problems.length > 0 };
}
