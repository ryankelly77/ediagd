/* ============================================================================
   EDIAGD — Phase 0: what the twelve knowledge tabs hold, and how they line up

   REPORT ONLY. Reads the v2 master workbook and the 450 draft cues and answers
   the five questions before anything is written.

   The 450 arrived as 60-character stumps with every column but the title
   dropped. The source rows are five-column records — Fact, Why It Matters,
   Tier Application, Op Code / Pairs With, Special Notes — and the servable cue
   is a quoted one-liner buried inside the Tier Application prose. So this is
   not a re-parse of what we have; it is a read of what we never took.

     npm run report:tabs
   ============================================================================ */
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});

const BOOK =
  process.argv.find((a) => a.startsWith("--book="))?.split("=").slice(1).join("=") ??
  `${process.env.HOME}/Downloads/Ediagd_master_2026_08_17_v2.xlsx`;

/* ---- Cell reading ---------------------------------------------------------
 * ExcelJS hands back a rich-text object when a cell carries mixed formatting,
 * which every bolded Fact does. Reading `.value` as a string would give
 * "[object Object]" on exactly the rows that matter most. */
function cell(row: ExcelJS.Row, i: number): string {
  const v = row.getCell(i).value as unknown;
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; text?: string; result?: unknown };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.text) return String(o.text);
    if (o.result != null) return String(o.result);
    return "";
  }
  return String(v);
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const stripStars = (s: string) => s.replace(/\*\*/g, "");

/** Same normalization the other passes use, so they agree about "same words". */
const norm = (s: string) =>
  (s ?? "").toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();

/* ---- Op codes -------------------------------------------------------------
 * Codes look like ABC-123. The surrounding text is prose Mitch wrote —
 * "ACR-047 AC Recharge · ACS-048 AC System Check" — so the codes are extracted
 * by shape rather than by splitting on a separator that varies per tab. */
const CODE = /\b([A-Z]{2,4}-\d{2,3})\b/g;
const codesIn = (s: string) => [...new Set((s ?? "").match(CODE) ?? [])];

/*
 * VEHICLE MODELS LOOK EXACTLY LIKE OP CODES.
 *
 * CX-90, CX-50, CX-70, MX-30, FL-22 are Mazda; the shape ABC-123 cannot tell
 * them apart from ACR-047, and the catalog itself holds two-letter codes
 * (FF-003, OF-008), so tightening the pattern would not help either. The
 * separator is what distinguishes them: a real op code appears in the tab's
 * `Op Codes:` header line, and a model name only ever turns up in row prose.
 *
 * So an unresolved token is reported as a CODE if the tab declared it, and as
 * PROSE otherwise. Nothing is guessed and nothing is silently dropped — the
 * two lists just go to Mitch with different questions attached.
 */

/** The quoted one-liner in a Tier Application clause — the servable cue. */
function zeroLowLine(tierText: string): string | null {
  const t = tierText ?? "";
  // The clause runs from "Zero/Low:" to the end or to the next Tier label.
  // [\s\S] rather than the /s flag: the repo's tsconfig target predates dotAll,
  // and a Tier Application clause runs across line breaks.
  const m = t.match(/zero\s*\/?\s*low\s*:?\s*([\s\S]+?)(?=(strong\s*\/?\s*elite\s*:)|(all\s+tiers\s*:)|$)/i);
  if (!m) return null;
  const clause = m[1].trim();
  // Prefer what is inside the quotes; Mitch quotes the words to be said.
  const q = clause.match(/['"“”‘’]([\s\S]+?)['"“”‘’]\s*\.?\s*$/) ?? clause.match(/['"“”‘’]([\s\S]+?)['"“”‘’]/);
  return squash(stripStars(q ? q[1] : clause)) || null;
}

/** The first sentence of the Fact, for a title that is not a 60-char stump. */
function firstSentence(s: string): string {
  const t = squash(stripStars(s));
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : t).trim();
}

type SourceRow = {
  tab: string;
  row: number;
  part: string | null;
  fact: string;
  why: string;
  tier: string;
  opRaw: string;
  notes: string;
};

/* The tabs the 450 came from. `MOC Warranty`, `The 4-Step Close`,
   `Engine & Perf`, `Belts & Hoses` and `Wipers` are draft SOURCE LABELS with no
   tab of that name — resolving them is question 4. */
const WANTED = [
  "Service Knowledge — AC HVAC",
  "Service Knowledge — EV Hybrid",
  "Product Knowledge — Hoses",
  "Product Knowledge — Headlights",
  "Product Knowledge — Timing Belt",
  "Product Knowledge — Belts",
  "Product Knowledge — Wipers",
  "MOC Warranty",
  "The 4-Step Close",
];

/* The 4-Step Close is a different record entirely — Nugget Title · Full
   Coaching Nugget · Direct Quote — so its header row is found by a different
   first cell. Everything else in the walk is the same. */
const HEADER_START = /^(fact\s*\/\s*talking point|nugget title)/i;

/**
 * Is this draft row a 60-character stump, or a cue somebody actually wrote?
 *
 * THE 450 ARE NOT ONE THING. Roughly half carry a title cut mid-word at 60
 * characters with markdown asterisks still attached — those are the import
 * casualties. The rest have short deliberate titles ("Arctic Blast") and whole
 * sentences in the body. Telling them apart is the difference between fixing a
 * bad import and deleting Mitch's writing.
 */
const isStump = (title: string) => title.length >= 58 || /^\*\*/.test(title);

function readTab(ws: ExcelJS.Worksheet): { rows: SourceRow[]; headerCodes: string[]; title: string } {
  const rows: SourceRow[] = [];
  let headerCodes: string[] = [];
  let title = "";
  let part: string | null = null;
  let started = false;

  for (let i = 1; i <= ws.rowCount; i++) {
    const r = ws.getRow(i);
    const c1 = squash(cell(r, 1));
    if (!c1) continue;

    if (i === 1) { title = c1; continue; }
    if (/^op codes\s*:/i.test(c1)) { headerCodes = codesIn(c1); continue; }
    /*
     * A PART banner names the section and nothing else. It does NOT re-open a
     * header: `Fact / Talking Point` appears once per tab, above PART A, and
     * every later section just continues under it. Treating the banner as a
     * reset dropped every row after PART A — 86 rows found in A/C HVAC where
     * there are 119, and a match rate that looked like bad data rather than a
     * bad walk.
     */
    if (/^\s*part\s+[A-Z]\b/i.test(c1)) { part = c1; continue; }
    if (HEADER_START.test(c1)) { started = true; continue; }
    if (!started) continue;

    /* A banner row repeats the same text across all five columns; a data row
       does not. Cheaper and more reliable than guessing from merge ranges. */
    const c2 = squash(cell(r, 2));
    if (!c2 || c2 === c1) continue;

    rows.push({
      tab: ws.name, row: i, part,
      fact: cell(r, 1), why: cell(r, 2), tier: cell(r, 3),
      opRaw: cell(r, 4), notes: cell(r, 5),
    });
  }
  return { rows, headerCodes, title };
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(BOOK);

  /* ---- The database side -------------------------------------------------- */
  const drafts: { id: string; title: string; body: string; source: string; tier: string }[] = [];
  for (let o = 0; ; o += 1000) {
    const { data, error } = await sb
      .from("content")
      .select("id, title, body, source, tier")
      .eq("type", "cue").eq("status", "draft")
      .order("id").range(o, o + 999);
    if (error) throw new Error(error.message);
    drafts.push(...((data ?? []) as unknown as typeof drafts));
    if (!data || data.length < 1000) break;
  }

  // Question 2: is service_family actually the publish gate?
  let pubTotal = 0;
  let pubNullFamily = 0;
  for (let o = 0; ; o += 1000) {
    const { data, error } = await sb
      .from("content")
      .select("id, service_family")
      .eq("type", "cue").eq("status", "published")
      .order("id").range(o, o + 999);
    if (error) throw new Error(error.message);
    pubTotal += (data ?? []).length;
    pubNullFamily += (data ?? []).filter((r) => !r.service_family).length;
    if (!data || data.length < 1000) break;
  }

  const { data: catalog } = await sb.from("op_code_catalog").select("code, category, name");
  const known = new Set((catalog ?? []).map((c) => c.code as string));

  /* ---- The workbook side -------------------------------------------------- */
  const parsed = new Map<string, ReturnType<typeof readTab>>();
  for (const name of WANTED) {
    const ws = wb.getWorksheet(name);
    if (!ws) { console.log(`  !! tab missing: ${name}`); continue; }
    parsed.set(name, readTab(ws));
  }

  /* ---- Question 3: matching ----------------------------------------------- */
  const draftBySource = new Map<string, typeof drafts>();
  drafts.forEach((d) => {
    const tab = (d.source ?? "").replace(/^Mitch import — /, "");
    const l = draftBySource.get(tab) ?? [];
    l.push(d);
    draftBySource.set(tab, l);
  });

  const lines: string[] = [];
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  lines.push(["tab", "src_row", "matched_id", "stump_title", "new_title", "new_body", "tier", "codes_raw", "codes_resolved", "codes_unknown"].join(","));

  console.log(`\n  workbook: ${BOOK.split("/").pop()}`);
  console.log(`  ${drafts.length} draft cues in the database\n`);

  console.log(`  ---- Q2  the publish gate ----`);
  console.log(`  published cues                : ${pubTotal}`);
  console.log(`  published with null service_family: ${pubNullFamily}`);
  console.log(`  draft cues with null service_family: ${drafts.length}  (all of them)\n`);

  console.log(`  ---- Q3  what the 450 actually are, and what matches ----`);
  console.log(`  ${"tab".padEnd(32)} src  drafts  stump  written  matched  unmatched-stumps`);
  let totalRows = 0, totalMatched = 0, totalStump = 0, totalWritten = 0, orphanStumps = 0;
  const unknownCodes = new Map<string, Set<string>>();
  const unknownProse = new Map<string, Set<string>>();

  for (const [tab, { rows, headerCodes }] of parsed) {
    const mine = draftBySource.get(tab) ?? [];
    const stump = mine.filter((d) => isStump(d.title ?? ""));
    const written = mine.filter((d) => !isStump(d.title ?? ""));

    /*
     * MEASURE FROM THE STUMP SIDE, NOT THE SOURCE SIDE.
     *
     * The question is "does every stump have a source row to be repaired
     * from", not "does every source row have a stump" — the tabs legitimately
     * hold hundreds of rows that were never imported at all. Keying a map by
     * stump prefix and looking up source rows also silently loses stumps that
     * share a 40-character prefix, which read as unmatched when they were only
     * overwritten. Counting the other way reported 28 of 59 for A/C HVAC where
     * the true figure is 57.
     */
    const sourceKeys = new Set(rows.map((r) => norm(stripStars(r.fact)).slice(0, 40)));
    const byPrefix = new Map<string, string>();
    stump.forEach((s) => byPrefix.set(norm(s.title).slice(0, 40), s.id));

    const codeSet = new Set<string>();
    const proseSet = new Set<string>();
    headerCodes.filter((c) => !known.has(c)).forEach((c) => codeSet.add(c));
    const headerDeclared = new Set(headerCodes);

    const matchedIds = new Set<string>();
    for (const r of rows) {
      const key = norm(stripStars(r.fact)).slice(0, 40);
      const hit = byPrefix.get(key) ?? null;
      if (hit) matchedIds.add(hit);

      const raw = codesIn(r.opRaw);
      raw.filter((c) => !known.has(c)).forEach((c) =>
        (headerDeclared.has(c) ? codeSet : proseSet).add(c)
      );

      lines.push([
        tab, r.row, hit ?? "", stump.find((s) => s.id === hit)?.title ?? "",
        firstSentence(r.fact).slice(0, 120),
        zeroLowLine(r.tier) ?? "(first sentence of the fact)",
        /all tiers/i.test(r.tier) ? "generic" : "zero",
        raw.join(" "), raw.filter((c) => known.has(c)).join(" "),
        raw.filter((c) => !known.has(c)).join(" "),
      ].map(esc).join(","));
    }

    unknownCodes.set(tab, codeSet);
    unknownProse.set(tab, proseSet);
    void matchedIds;
    const repairable = stump.filter((s) => sourceKeys.has(norm(s.title).slice(0, 40)));
    const unmatchedStumps = stump.length - repairable.length;
    totalRows += rows.length; totalMatched += repairable.length;
    totalStump += stump.length; totalWritten += written.length;
    orphanStumps += unmatchedStumps;

    console.log(
      `  ${tab.padEnd(32)} ${String(rows.length).padStart(3)}  ${String(mine.length).padStart(6)}` +
      `  ${String(stump.length).padStart(5)}  ${String(written.length).padStart(7)}` +
      `  ${String(repairable.length).padStart(7)}  ${String(unmatchedStumps).padStart(16)}`
    );
  }

  console.log(
    `\n  source rows ${totalRows}` +
    `   stumps ${totalStump} of which ${totalMatched} match (${totalStump ? Math.round((totalMatched / totalStump) * 100) : 0}%)` +
    `   written-not-stump ${totalWritten}`
  );
  console.log(`  stumps with no source row: ${orphanStumps}\n`);

  console.log(`  ---- Q5  codes that do not resolve ----`);
  console.log(`  DECLARED IN THE TAB HEADER — real op codes, need a translation:`);
  for (const [tab, set] of unknownCodes) {
    if (set.size) console.log(`    ${tab.padEnd(32)} ${[...set].sort().join(" ")}`);
  }
  console.log(`  ONLY IN ROW PROSE — almost certainly vehicle models, confirm and ignore:`);
  for (const [tab, set] of unknownProse) {
    if (set.size) console.log(`    ${tab.padEnd(32)} ${[...set].sort().join(" ")}`);
  }

  console.log(`\n  ---- Q4  draft sources with no tab of that name ----`);
  const tabNames = new Set(wb.worksheets.map((w) => w.name));
  for (const [src, list] of [...draftBySource.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const has = tabNames.has(src);
    const s = list.filter((d) => isStump(d.title ?? "")).length;
    console.log(
      `  ${String(list.length).padStart(4)}  ${has ? "tab exists  " : "NO SUCH TAB "} ` +
      `${String(s).padStart(3)} stump / ${String(list.length - s).padStart(3)} written   ${src}`
    );
  }

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/knowledge-tabs.csv", lines.join("\n") + "\n");
  console.log(`\n  wrote reports/knowledge-tabs.csv — nothing was written to the database.\n`);
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
  main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
}
