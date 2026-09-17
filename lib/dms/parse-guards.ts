/* ============================================================================
   EDIAGD — refuse a DMS workbook that cannot be what it claims to be

   PURE. No database, no ExcelJS. Takes the parsed rows and the rooftop names
   already on file, and answers one question: is this file safe to stage?

   ---------------------------------------------------------------------------
   WHY THIS EXISTS
   ---------------------------------------------------------------------------
   The August 2026 export arrived with dealer and sub-category the other way
   round. Every layer did its job with what it was handed:

     the parser   read the columns it was told to read, and warned about nothing
     the preview  reported 77 new rooftops named LOF, Air Filter and Alignments
     the commit   hit dms_daily_metric_pkey and rolled the whole thing back

   So nothing was corrupted — the primary key caught it. But the admin staged
   18,764 rows, read a confident summary, clicked Commit, and got "An error
   occurred in the Server Components render", which is not a sentence anybody
   can act on. The file was unimportable from the moment it was parsed and we
   said so at the last possible moment, in the least useful words.

   ---------------------------------------------------------------------------
   WHAT IS CHECKED, AND WHY EACH IS SAFE TO REFUSE ON
   ---------------------------------------------------------------------------
   These do NOT encode "dealer and sub-category were swapped". That was one
   incident; the next export will break differently. They encode invariants that
   are true of any correct file, so a column order nobody has thought of yet
   still fails them.

     collides   Two detail rows that land on the same live primary key. The
                commit is one transaction, so this is not a partial-import risk
                — it is a guaranteed, total failure. Knowing it before staging
                costs one pass over the rows.

     inverted   Sub-category values that are the NAMES OF ROOFTOPS. A service
                sub-category is never called "Doggett Ford"; when a quarter of
                them are, the columns are not what the parser thinks.

   And one that warns without refusing:

     newcomers  A flood of unrecognised dealers. Seventy-seven at once is never
                a real onboarding — but five might be, and a brand-new customer
                legitimately matches nothing at all, so this must never be the
                thing that blocks their first import.
============================================================================ */

export type GuardRow = {
  reportDate: string;
  dealerName: string;
  advisorOpId: string;
  subCategory: string;
  opCode: string;
};

export type GuardFinding = {
  code: "collides" | "inverted" | "newcomers";
  /** A refusal stops the import before anything is staged. */
  severity: "refuse" | "warn";
  /** One sentence an admin can act on, naming the file's own values. */
  message: string;
};

export type GuardResult = {
  findings: GuardFinding[];
  /** True when nothing may be staged. */
  refused: boolean;
};

const norm = (s: string) => s.trim().toLowerCase();

/**
 * How many rows share a live primary key with another row in the same file.
 *
 * The key is (rooftop, date, advisor, sub-category, op code) — dealer NAME
 * stands in for rooftop here because the rows have not been resolved to ids
 * yet, and a name maps to at most one rooftop, so the grouping is the same.
 */
export function collidingRows(rows: GuardRow[]): { groups: number; rows: number; example: string | null } {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const key = [norm(r.dealerName), r.reportDate, norm(r.advisorOpId), norm(r.subCategory), norm(r.opCode)].join("|");
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  let groups = 0;
  let total = 0;
  let example: string | null = null;
  for (const [key, n] of seen) {
    if (n <= 1) continue;
    groups++;
    total += n;
    if (!example) {
      const [dealer, date, advisor, sub, op] = key.split("|");
      example = `${dealer} · ${date} · advisor ${advisor} · ${sub} · ${op} (${n} rows)`;
    }
  }
  return { groups, rows: total, example };
}

/**
 * The share of distinct sub-category values that are actually rooftop names.
 *
 * Compared against the rooftops ALREADY ON FILE rather than against the file's
 * own dealer column — otherwise a workbook with both columns wrong would agree
 * with itself and pass.
 */
export function invertedShare(
  rows: GuardRow[],
  knownRooftopNames: string[]
): { share: number; matched: string[]; distinct: number } {
  const known = new Set(knownRooftopNames.map(norm));
  const subs = new Set(rows.map((r) => norm(r.subCategory)).filter(Boolean));
  const matched = [...subs].filter((s) => known.has(s));
  return {
    share: subs.size === 0 ? 0 : matched.length / subs.size,
    matched: matched.slice(0, 6),
    distinct: subs.size,
  };
}

/* One collision is enough to guarantee the commit fails, so the threshold is
   not a tolerance — it is zero. The others are judgement calls. */
const INVERTED_SHARE = 0.2;
const NEWCOMER_MIN = 6;
const NEWCOMER_SHARE = 0.5;

export function guardWorkbook(
  rows: GuardRow[],
  knownRooftopNames: string[]
): GuardResult {
  const findings: GuardFinding[] = [];

  const collide = collidingRows(rows);
  if (collide.groups > 0) {
    findings.push({
      code: "collides",
      severity: "refuse",
      message:
        `${collide.rows.toLocaleString()} rows in this file share a key with another row ` +
        `(${collide.groups.toLocaleString()} duplicated keys). The import would fail on ` +
        `dms_daily_metric's primary key and nothing would be saved. This almost always ` +
        `means two columns are not the ones we expect — first collision: ${collide.example}.`,
    });
  }

  const inv = invertedShare(rows, knownRooftopNames);
  if (inv.share >= INVERTED_SHARE) {
    findings.push({
      code: "inverted",
      severity: "refuse",
      message:
        `${Math.round(inv.share * 100)}% of the sub-categories in this file are the names of ` +
        `rooftops (${inv.matched.join(", ")}). Dealer and sub-category look swapped — check the ` +
        `column order against the last file that imported cleanly.`,
    });
  }

  const known = new Set(knownRooftopNames.map(norm));
  const dealers = [...new Set(rows.map((r) => norm(r.dealerName)).filter(Boolean))];
  const newcomers = dealers.filter((d) => !known.has(d));
  if (
    dealers.length > 0 &&
    newcomers.length >= NEWCOMER_MIN &&
    newcomers.length / dealers.length >= NEWCOMER_SHARE &&
    known.size > 0 // a first-ever import matches nothing, and that is correct
  ) {
    findings.push({
      code: "newcomers",
      severity: "warn",
      message:
        `${newcomers.length} of ${dealers.length} dealers in this file are not rooftops we know. ` +
        `Committing creates one rooftop for each. Worth a look before you do.`,
    });
  }

  return { findings, refused: findings.some((f) => f.severity === "refuse") };
}
