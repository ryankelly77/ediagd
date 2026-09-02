/* ============================================================================
   EDIAGD — Phase 1: the knowledge re-import

   Reads the nine knowledge tabs of data/Ediagd_master_2026_08_17_v2.xlsx and
   repairs the 223 stumps in place, then inserts the ~560 source rows the
   original import never took. Phase 0's report (reports/knowledge-tabs.md) is
   the spec; the rulings it was waiting on are all applied here.

     npm run import:knowledge -- --dry     counts, writes nothing
     npm run import:knowledge

   ---------------------------------------------------------------------------
   THE RULINGS, APPLIED
   ---------------------------------------------------------------------------
   1  ONLY STUMPS ARE ELIGIBLE for update-or-retire. A row is a stump when its
      title is >= 58 characters (the 60-char cut) or begins with '**'. The 169
      rows that are Mitch's own finished writing have no source row BY
      DEFINITION — they never came from a knowledge tab — and the original
      Phase 1 rule ("no source match -> retire") would have withdrawn every one
      of them. They are not read, not updated, not retired, not touched.

   2  THE THREE ORPHAN STUMPS go to Mitch's review queue as `truncated`, which
      is exactly what that reason means: the text stops mid-thought and no
      fuller version exists in any file we hold. Two in Lasting Impressions,
      one in Nametag Skills. There is no v2 tab to recover them from, so it is
      his to supply, not ours to guess.

   3  ACO-010 IS INERT BY DESIGN. mapping_alias (0066) carries it with
      confirmed=false, and this importer resolves confirmed aliases only. Rows
      whose only op code is ACO-010 import as draft with no code and land in
      review as `needs_op_code`, waiting on Mitch's one-line confirmation.

   ---------------------------------------------------------------------------
   TWO DECISIONS THE PHASE 0 SPEC GOT WRONG, AND WHY THESE DIFFER
   ---------------------------------------------------------------------------
   A  IT SETS service_family, WHICH THE SPEC SAID WOULD BE NULL.
      The content gate reads `service_family_cue_count`, and that view requires
      `service_family is not null`. Import 783 rows carrying only an op code and
      the four starved families they belong to stay suppressed — the import
      would land and change nothing any advisor ever sees. op_code_family (0066)
      is the bridge and this is what it is for. Every row's codes resolve to
      exactly ONE family (checked: zero ambiguous rows across all 783), so the
      derivation is mechanical rather than a judgement.

   B  IT DOES NOT SET collection = 'Pitches by Op Code'.
      These are product and service KNOWLEDGE rows, not pitches. 0063 requires
      an op code for that collection, and rows carrying several codes get none
      (see below) — so the spec's value would have failed the constraint on the
      rows it was most meant for. The collection is for the pitch VIDEOS that
      answer "how do I sell THIS", and those do not exist yet. Left null.

   ---------------------------------------------------------------------------
   AND ONE THING THE SOURCE SIMPLY DOES NOT HAVE
   ---------------------------------------------------------------------------
   NO STAGE. Not one of the nine tabs carries a stage column, and neither do the
   class-transcript tabs — checked all 76 sheets. So every imported row has
   stage = null, and rungs 1 and 2 of the cue ladder (op_code+stage+tier,
   op_code+stage) cannot fire on this content no matter how much of it lands.
   The best the Brakes acceptance test can reach after this import is rung 3,
   `op_code`, and only if the two BFF-012 rows publish. Stage arrives with the
   pitch videos, not with the knowledge tabs.
   ============================================================================ */

import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const BOOK =
  args.find((a) => a.startsWith("--book="))?.split("=").slice(1).join("=") ??
  "data/Ediagd_master_2026_08_17_v2.xlsx";

/* ---- Cell reading (same as the Phase 0 report) --------------------------- */

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
const norm = (s: string) =>
  (s ?? "").toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();

const CODE = /\b([A-Z]{2,4}-\d{2,3})\b/g;
const codesIn = (s: string) => [...new Set((s ?? "").match(CODE) ?? [])];

/** The quoted one-liner in a Tier Application clause — the servable cue. */
function zeroLowLine(tierText: string): string | null {
  const m = (tierText ?? "").match(
    /zero\s*\/?\s*low\s*:?\s*([\s\S]+?)(?=(strong\s*\/?\s*elite\s*:)|(all\s+tiers\s*:)|$)/i
  );
  if (!m) return null;
  const clause = m[1].trim();
  const q =
    clause.match(/['"“”‘’]([\s\S]+?)['"“”‘’]\s*\.?\s*$/) ??
    clause.match(/['"“”‘’]([\s\S]+?)['"“”‘’]/);
  return squash(stripStars(q ? q[1] : clause)) || null;
}

/** The first sentence of the Fact. A TITLE, NEVER A TRUNCATION — that is the
    whole bug being repaired, and re-committing it would be unforgivable. */
function firstSentence(s: string): string {
  const t = squash(stripStars(s));
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : t).trim();
}

const isStump = (title: string) => title.length >= 58 || /^\*\*/.test(title);

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
  "MPI Setup & GYR System",
];

/*
 * PROCESS TABS, NOT PRODUCT KNOWLEDGE.
 *
 * These two are class-transcript sheets — Nugget Title · Full Coaching Nugget ·
 * Direct Quote / Word Track — and their subject is HOW THE ADVISOR WORKS rather
 * than what a part does. 'MPI Setup & GYR System' is the green/yellow/red
 * grading system; 'The 4-Step Close' is what · how much · time · authorization.
 *
 * So they file as Craft and carry no op code: there is no op code that "sell at
 * yellow, not at red" is about, and inventing one to satisfy a collection
 * constraint would put process coaching on a parts shelf. Their `Best Applied
 * To` column names op codes in prose ("BPF-028 Brakes · TRO-022 Tires") and that
 * is a list of examples, not a subject.
 *
 * 'MPI Setup & GYR System' was outside the original nine. Three of the six
 * orphan stumps came from it — words that exist in the workbook, which is a
 * better answer than asking Mitch to retype them.
 */
const PROCESS_TABS = new Set(["The 4-Step Close", "MPI Setup & GYR System"]);

const HEADER_START = /^(fact\s*\/\s*talking point|nugget title)/i;

type SourceRow = {
  tab: string; row: number;
  fact: string; why: string; tier: string; opRaw: string; notes: string;
};

function readTab(ws: ExcelJS.Worksheet): { rows: SourceRow[]; headerCodes: string[] } {
  const rows: SourceRow[] = [];
  let headerCodes: string[] = [];
  let started = false;

  for (let i = 1; i <= ws.rowCount; i++) {
    const r = ws.getRow(i);
    const c1 = squash(cell(r, 1));
    if (!c1) continue;
    if (i === 1) continue;
    if (/^op codes\s*:/i.test(c1)) { headerCodes = codesIn(c1); continue; }
    // A PART banner names a section; it does NOT re-open the header. Treating
    // it as a reset dropped every row after PART A in the first Phase 0 walk.
    if (/^\s*part\s+[A-Z]\b/i.test(c1)) continue;
    if (HEADER_START.test(c1)) { started = true; continue; }
    if (!started) continue;

    const c2 = squash(cell(r, 2));
    if (!c2 || c2 === c1) continue;

    rows.push({
      tab: ws.name, row: i,
      fact: cell(r, 1), why: cell(r, 2), tier: cell(r, 3),
      opRaw: cell(r, 4), notes: cell(r, 5),
    });
  }
  return { rows, headerCodes };
}

/* ---- Reporting ----------------------------------------------------------- */

const pad = (n: number, w = 5) => String(n).padStart(w);
function table(title: string, rows: [string, number][]) {
  console.log(`\n  ${title}`);
  rows.forEach(([k, v]) => console.log(`   ${pad(v)}  ${k}`));
}

/**
 * What is the incoming text, relative to what is already stored?
 *
 * ---------------------------------------------------------------------------
 * CONTAINMENT IS NOT SYMMETRIC, AND TREATING IT AS THOUGH IT WERE COST US 15 ROWS
 * ---------------------------------------------------------------------------
 * The first version of this guard passed a row whenever either string was a
 * prefix of the other. One of those directions is the repair this importer
 * exists to do; the other is the damage it exists to prevent.
 *
 *   stored is a prefix of incoming   a 60-character stump growing into the full
 *                                    Fact. This is the repair. Apply it.
 *
 *   incoming is a prefix of stored   the WORKBOOK knows less than the app does.
 *                                    That is never a revision — nobody edits a
 *                                    Fact by deleting its second half and
 *                                    leaving the first half byte-identical.
 *
 * The second is exactly what the accidental run in Round D did to 15 cue
 * bodies: "DISCLOSE THE WAITING PERIOD UP FRONT  (60 days AND 750 Mile Waiting
 * Period)…" became "DISCLOSE THE WAITING PERIOD UP FRONT". Those rows were
 * restored from content_text_version, so the master and the database now
 * disagree in precisely the direction the old guard called benign — meaning the
 * next DELIBERATE import would have truncated the same 15 again, quietly.
 */
export type RowVerdict =
  /** Apply it: same row, and the incoming text is not poorer. */
  | "revision"
  /** Skip: the workbook is behind the app. Never overwrite words with fewer. */
  | "master-behind"
  /** Skip: this looks like a different row that slid into the position. */
  | "moved";

export function classifyIncoming(stored: string, incoming: string): RowVerdict {
  const a = (stored ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const b = (incoming ?? "").replace(/\s+/g, " ").trim().toLowerCase();

  /* Nothing stored: there is nothing to lose and a blank to fill. */
  if (!a) return "revision";
  /* Nothing incoming, something stored: the master has lost the words. */
  if (!b) return "master-behind";
  if (a === b) return "revision";

  /* The two containment directions, before any fuzzy test can blur them. */
  if (a.startsWith(b)) return "master-behind";
  if (b.startsWith(a)) return "revision";

  /*
   * Neither contains the other. Are these the same row at all?
   */
  const wordsA = new Set(a.split(" ").filter((w) => w.length > 3));
  const wordsB = new Set(b.split(" ").filter((w) => w.length > 3));
  let shared = 0;
  for (const w of wordsA) if (wordsB.has(w)) shared++;
  const related =
    a.slice(0, 40) === b.slice(0, 40) ||
    wordsA.size === 0 ||
    wordsB.size === 0 ||
    shared / Math.min(wordsA.size, wordsB.size) >= 0.34;

  if (!related) return "moved";

  /*
   * ---- SAME ROW, AND THE WORKBOOK HAS MUCH LESS OF IT ---------------------
   *
   * A strict prefix is the clean case and is caught above. The messy one is a
   * master that lost the body AND changed something small in the opening — a
   * straight quote for a curly one, "…CLOSE" where the app has "…At active
   * Delivery". Four of the fifteen rows Round D truncated look like this: the
   * first characters differ, so no prefix test sees them, and they are 22-30%
   * the length of what is stored.
   *
   * The asymmetry decides the threshold. A false "master-behind" costs a
   * skipped row and a line in a report somebody reads. A false "revision"
   * silently deletes two thirds of a Fact. So a related row under 60% the
   * length of what is stored is refused, and a genuine tightening edit of that
   * severity is something Mitch can wave through by pasting it back.
   */
  if (b.length < a.length * 0.6) return "master-behind";
  return "revision";
}

/**
 * Kept as the plain question the tab-abort arithmetic asks: is this row one the
 * importer may write? Both refusals answer no, and only "moved" counts toward
 * the shift threshold — a stale master is not a shifted tab, and aborting the
 * whole tab for it would block the rows that ARE revisions.
 */
export function looksLikeSameRow(stored: string, incoming: string): boolean {
  return classifyIncoming(stored, incoming) === "revision";
}

/**
 * One refusal is a rewrite somebody made deliberately. Several in one tab is
 * the signature of an insertion, because an insertion shifts every row below it
 * — so the tab is dropped whole rather than half-applied.
 */
export const REFUSALS_PER_TAB_BEFORE_ABORT = 5;

export function countByTab(rows: { tab: string }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.tab, (m.get(r.tab) ?? 0) + 1);
  return m;
}

export function tabsToAbort(
  refusalsByTab: Map<string, number>,
  threshold = REFUSALS_PER_TAB_BEFORE_ABORT
): Set<string> {
  return new Set(
    [...refusalsByTab.entries()].filter(([, n]) => n >= threshold).map(([t]) => t)
  );
}

/*
 * ---- THIS FILE DOES ITS WORK ON IMPORT, AND THAT WAS A LOADED GUN ---------
 *
 * The body below used to be a bare IIFE, so `import { … } from
 * "./import-knowledge"` RAN A FULL IMPORT against whatever SB_URL pointed at.
 * That is exactly what happened the first time a test reached in for the
 * refusal helpers: 797 rows updated, 15 cue bodies truncated to their first
 * line, against production. content_text_version (0083) is the only reason the
 * words came back.
 *
 * `require.main === module` makes importing this file inert: it runs when it is
 * the entry point and does nothing when something merely reads a function out
 * of it.
 */
const RUN_AS_SCRIPT = require.main === module;

(async () => {
  if (!RUN_AS_SCRIPT) return;
  console.log(`\n  ${DRY ? "DRY RUN — nothing will be written" : "APPLYING"}`);
  console.log(`  book: ${BOOK}\n`);

  /* ---- Reference data --------------------------------------------------- */
  const { data: catalogRows, error: catErr } = await sb
    .from("op_code_catalog")
    .select("code");
  if (catErr) throw new Error(`op_code_catalog: ${catErr.message}`);
  const known = new Set((catalogRows ?? []).map((c) => c.code as string));

  const { data: famRows, error: famErr } = await sb
    // Live view (0074): the table is append-only, this reader wants today.
    .from("op_code_family_live")
    .select("code, family");
  if (famErr) throw new Error(`op_code_family: ${famErr.message}`);
  const familyOf = new Map((famRows ?? []).map((r) => [r.code as string, r.family as string]));

  /*
   * CONFIRMED ALIASES ONLY. mapping_alias holds ACO-010 -> ACE-053 with
   * confirmed=false: visible and inert. Resolving it here would quietly reroute
   * five rows of A/C content on a guess while it waits for Mitch, which is the
   * exact failure the confirmed flag exists to prevent.
   */
  const { data: aliasRows, error: aliasErr } = await sb
    .from("mapping_alias")
    .select("alias, canonical, confirmed")
    .eq("kind", "op_code")
    .eq("confirmed", true);
  if (aliasErr) throw new Error(`mapping_alias: ${aliasErr.message}`);
  const alias = new Map((aliasRows ?? []).map((r) => [r.alias as string, r.canonical as string]));
  console.log(`  ${known.size} catalog codes · ${familyOf.size} mapped to families · ${alias.size} confirmed aliases`);

  /* ---- The existing drafts ---------------------------------------------- */
  const drafts: { id: string; title: string; source: string | null; source_tab: string | null }[] = [];
  for (let o = 0; ; o += 1000) {
    const { data, error } = await sb
      .from("content")
      .select("id, title, source, source_tab")
      // Retired rows are excluded: the 85 duplicates a previous run withdrew
      // must not be reconsidered as stumps and retired a second time.
      .eq("type", "cue").eq("status", "draft").is("retired_at", null)
      .order("id").range(o, o + 999);
    if (error) throw new Error(error.message);
    drafts.push(...((data ?? []) as typeof drafts));
    if (!data || data.length < 1000) break;
  }
  const stumps = drafts.filter((d) => isStump(d.title));
  const written = drafts.filter((d) => !isStump(d.title));
  console.log(`  ${drafts.length} draft cues: ${stumps.length} stumps, ${written.length} written (untouched)\n`);

  /*
   * ---- Rows a previous run already wrote ---------------------------------
   *
   * THIS IS WHAT MAKES THE IMPORTER RE-RUNNABLE, WHICH IS THE WHOLE POINT.
   * Mitch will revise the workbook and a re-run is how a revision lands. The
   * unique index in 0068 turns a second blind INSERT into an error rather than
   * a doubled library — but erroring is not the goal, updating is. Rows are
   * matched on (source_tab, source_row), which is the only key that survives
   * the text changing, since changed text is exactly what a re-import brings.
   *
   * Published rows are included on purpose: a correction to a live cue has to
   * reach the live cue. `status` is never written here, so a re-run cannot
   * un-publish anything.
   */
  const existing = new Map<string, { id: string; body: string }>();
  for (let o = 0; ; o += 1000) {
    const { data, error } = await sb
      .from("content")
      .select("id, source_tab, source_row, body")
      .not("source_tab", "is", null)
      .is("retired_at", null)
      .order("id").range(o, o + 999);
    if (error) throw new Error(error.message);
    (data ?? []).forEach((r) =>
      existing.set(`${r.source_tab} ${r.source_row}`, {
        id: r.id as string,
        body: (r.body as string | null) ?? "",
      })
    );
    if (!data || data.length < 1000) break;
  }
  console.log(`  ${existing.size} rows already carry a (source_tab, source_row) — a re-run updates these\n`);

  /* ---- The workbook ------------------------------------------------------ */
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(BOOK);


  type Planned = {
    tab: string; row: number; id: string | null; normFact: string;
    title: string; body: string; detail: string;
    tier: string; opCode: string | null; family: string | null;
    collection: string | null; needsOpCode: boolean; unconfirmed: boolean;
    inherited: boolean;
  };

  const planned: Planned[] = [];
  const matchedIds = new Set<string>();

  for (const name of WANTED) {
    const ws = wb.getWorksheet(name);
    if (!ws) { console.log(`  !! tab missing: ${name}`); continue; }
    const { rows, headerCodes } = readTab(ws);

    for (const r of rows) {
      /*
       * A real op code is DECLARED in the tab's `Op Codes:` header. A token of
       * the same shape found only in row prose is a vehicle model — CX-90,
       * MX-30, FL-22 are Mazda, and the catalog itself holds two-letter codes
       * (FF-003, OF-008), so the pattern cannot tell them apart. Where they
       * appear can.
       */
      const declared = new Set(headerCodes);
      const raw = codesIn(`${r.opRaw} ${r.notes}`).filter((c) => declared.has(c) || known.has(c));

      const resolved: string[] = [];
      let sawUnconfirmed = false;
      for (const c of raw) {
        const canonical = known.has(c) ? c : alias.get(c);
        if (canonical && known.has(canonical)) resolved.push(canonical);
        else sawUnconfirmed = true;
      }
      const uniq = [...new Set(resolved)];

      const title = firstSentence(r.fact);
      const body = zeroLowLine(r.tier) ?? title;
      const detail = squash(stripStars(r.fact));
      const tier = zeroLowLine(r.tier) ? "zero" : "generic";

      const process = PROCESS_TABS.has(name);

      /*
       * THE PRIMARY IS THE FIRST RESOLVABLE CODE IN THE ROW, IN DOCUMENT ORDER.
       *
       * `op_code` is a single column and the `Op Code / Pairs With` cell often
       * names several — the first is the subject and the rest are what it is
       * sold alongside. Mitch writes them in that order.
       *
       * THE EXTRAS HAVE NOWHERE TO GO, AND DO NOT NEED ONE. There is no pairs
       * column on `content`, and adding one would be a second copy of something
       * that already exists: op_code_catalog.piggyback_partners records which
       * codes pair with which, for all 73, and it is the seed file's own column.
       * A per-row copy would drift from it the first time Mitch revised either.
       */
      /*
       * AND WHEN THE CELL IS PROSE, THE TAB IS THE DECLARATION.
       *
       * 117 rows write notes where a code belongs — "All EV op codes",
       * "Tesla 8yr/100-150K", "Ford EV POE CRITICAL". The tab they sit in DOES
       * declare real codes in its `Op Codes:` header, and a row inside the EV
       * Hybrid tab is an EV Hybrid row whatever its own cell says. The cell is
       * a note; the header is the declaration.
       *
       * Inheriting is an inference, so it is recorded as one — `op_code_inherited`
       * (0069) marks every row routed this way, because a row routed by its own
       * code and a row routed by the tab it happened to sit in are not equally
       * trustworthy and the difference vanishes once both just carry `op_code`.
       */
      const inherited = uniq.length === 0 && !process;
      const fromTab = headerCodes.filter((c) => known.has(c) || alias.has(c))
        .map((c) => (known.has(c) ? c : alias.get(c)!))
        .filter((c) => known.has(c));
      const effective = uniq.length > 0 ? uniq : fromTab;

      const opCode = process ? null : (effective[0] ?? null);

      planned.push({
        tab: name, row: r.row, id: null, normFact: norm(r.fact),
        title, body, detail, tier,
        opCode,
        // Every row's codes resolve to exactly one family or none — verified
        // across all 783 before this was written. No tie to break.
        /*
         * THE FAMILY FOLLOWS THE PRIMARY CODE, NOT THE WHOLE SET.
         *
         * Deriving it from every code on the row returns null whenever they
         * span two families — and the EV Hybrid tab declares CPC-051, RDD-052
         * AND BAT-033, so its header spans EV & Hybrid and Battery and every
         * inherited row came out unrouted. The row is about its primary code;
         * the rest are what it is sold alongside. One subject, one family.
         */
        family: opCode ? (familyOf.get(opCode) ?? null) : null,
        /*
         * Craft for process, 'Pitches by Op Code' for a knowledge row that has
         * a subject, null for one that does not. The last case is what keeps
         * 0063 satisfied: that collection REQUIRES an op code, so a row without
         * one cannot claim it — and a row without one is going to review anyway.
         */
        inherited: inherited && Boolean(opCode),
        collection: process ? "Craft" : opCode ? "Pitches by Op Code" : null,
        // Only rows whose OWN cell and whose TAB both fail to name a code are
        // still a question for Mitch. That is the handful, not the 117.
        needsOpCode: !process && effective.length === 0,
        /*
         * Two different asks, and Mitch should not get the same card for both.
         * `sawUnconfirmed` means the row DID name a code and it is sitting in
         * mapping_alias unconfirmed — ACO-010, one line from him and it
         * resolves. Without it, the row simply never named a code.
         */
        unconfirmed: sawUnconfirmed,
      });
    }
  }

  /* ---- Match each STUMP to its source row --------------------------------
   *
   * DIRECTION MATTERS, AND GETTING IT WRONG IS SILENT.
   *
   * The obvious implementation keys a map on the stump's first 40 normalized
   * characters and looks each source row up in it. That undercounts badly and
   * says nothing: 229 stumps collapse to about 137 distinct 40-character keys,
   * because Mitch's Facts often open with the same phrase ("Practical guidance
   * summary. (1) Identify refrigerant type…"). Map.set keeps the last one, the
   * other 85 are never found, and they present as stumps Mitch has to rewrite
   * by hand. The Phase 0 report hit this exact bug and its CSV still carries
   * the wrong 138; only its summary table was corrected.
   *
   * So it runs the other way, and on the WHOLE stump rather than a prefix of
   * it. A stump is ~60 characters of the Fact, which is specific enough to be
   * unambiguous; the last word is dropped because the cut lands mid-word.
   */
  /*
   * ---- THE POSITIONAL KEY, AND THE THING IT CANNOT SURVIVE ----------------
   *
   * (source_tab, source_row) is the only key that survives the TEXT changing,
   * which is what a re-import brings — so it is the right key for a revision
   * and the wrong one for an INSERTION. Insert a row at position 50 of a
   * 200-row tab and every key below it shifts by one: row 50 overwrites the old
   * row 50 with the new row's words, 51 takes 50's, and 151 published cues each
   * receive their neighbour's text. Nothing is deleted, nothing errors, and the
   * run reports "updated 151" — indistinguishable from a normal revision.
   *
   * The real fix is a stable id column in the workbook's knowledge tabs and in
   * the intake template, and that is waiting on Mitch. Until then the failure
   * stops being silent: a row whose stored text and incoming text have nothing
   * in common is NOT updated. It goes to the report as a question.
   *
   * AND A TAB WITH SEVERAL OF THEM IS NOT UPDATED AT ALL. One refusal is a
   * rewrite somebody made deliberately. Five in one tab is the signature of an
   * insertion, and applying the four rows above the shift while refusing the
   * rest would leave the tab half-migrated — worse than not touching it, and
   * harder to unpick.
   */
  const suspect: { tab: string; row: number; stored: string; incoming: string }[] = [];
  const masterBehind: { tab: string; row: number; stored: string; incoming: string }[] = [];
  for (const p of planned) {
    const prior = existing.get(`${p.tab} ${p.row}`);
    if (!prior) continue;
    const verdict = classifyIncoming(prior.body, p.body);
    if (verdict === "moved") {
      suspect.push({ tab: p.tab, row: p.row, stored: prior.body, incoming: p.body });
      continue;
    }
    if (verdict === "master-behind") {
      masterBehind.push({ tab: p.tab, row: p.row, stored: prior.body, incoming: p.body });
      continue;
    }
    p.id = prior.id;
    matchedIds.add(prior.id);
  }

  /* Tabs over the threshold are dropped entirely — every row of them, update
     and insert alike, because an insertion shifts the whole tab. ONLY "moved"
     rows count: a master that is behind on fifteen rows is a stale workbook,
     not a shifted tab, and aborting the tab for it would block the rows that
     really are revisions. */
  const refusalsByTab = countByTab(suspect);
  const abortedTabs = tabsToAbort(refusalsByTab);

  const byTab = new Map<string, Planned[]>();
  planned.forEach((p) => {
    const l = byTab.get(p.tab) ?? [];
    l.push(p);
    byTab.set(p.tab, l);
  });

  let ambiguous = 0;
  let dbg = 0;
  for (const d of stumps) {
    // Already repaired by a previous run — it carries the pair now, and the
    // loop above has already claimed it.
    if (d.source_tab) { matchedIds.add(d.id); continue; }
    const tab = (d.source ?? "").replace(/^Mitch import — /, "");
    const candidates = byTab.get(tab);
    if (!candidates) continue; // source label has no tab in scope — an orphan

    const words = norm(d.title).split(" ");
    // The 60-character cut lands mid-word, so the final token is unreliable.
    const prefix = words.slice(0, Math.max(1, words.length - 1)).join(" ");

    /*
     * ONLY UNCLAIMED CANDIDATES, AND THAT IS NOT A DETAIL.
     *
     * Two stumps cut from two different Facts can both start with the same
     * words, so their candidate sets overlap. Taking the best hit and skipping
     * when it is already claimed loses the SECOND stump entirely — it reports
     * as an orphan Mitch has to rewrite, when its own source row was sitting
     * one place further down the list. That cost 85 stumps and looked exactly
     * like a content problem rather than a bookkeeping one.
     */
    const free = candidates.filter((c) => !c.id && c.normFact.startsWith(prefix));
    if (free.length === 0) {
      if (process.env.DEBUG_MATCH && dbg++ < 5) {
        const near = candidates.filter((c) => c.normFact.slice(0, 40) === norm(d.title).slice(0, 40));
        console.log(`\n  MISS ${tab} | candidates=${candidates.length} near40=${near.length} claimed=${near.filter((n)=>n.id).length}`);
        console.log(`    prefixLen=${prefix.length} prefix=${JSON.stringify(prefix.slice(0, 70))}`);
        if (near[0]) {
          const nf = near[0].normFact;
          let i = 0; while (i < Math.min(nf.length, prefix.length) && nf[i] === prefix[i]) i++;
          console.log(`    fact  =${JSON.stringify(nf.slice(0, 70))}`);
          console.log(`    diverge@${i} prefix:${JSON.stringify(prefix.slice(i, i+30))} fact:${JSON.stringify(nf.slice(i, i+30))}`);
        }
      }
      continue;
    }
    if (free.length > 1) ambiguous++;
    // Shortest Fact first: where one Fact is a prefix of a longer one, the
    // stump was cut from the shorter.
    const best = free.sort((a, b) => a.normFact.length - b.normFact.length)[0];
    best.id = d.id;
    matchedIds.add(d.id);
  }

  /* ---- What the plan does ------------------------------------------------ */
  /*
   * A REFUSED ROW IS NOT A NEW ROW.
   *
   * Refusing to update leaves `p.id` unset, and without this it would fall
   * straight into `inserts` — asking the database to create a second content
   * row for a (source_tab, source_row) that already has one. 0068's unique
   * index turns that into a mid-run error rather than a duplicate, which is the
   * right failure and still the wrong outcome: the refusal is meant to leave
   * the row exactly as it is, not to take the import down.
   */
  const refusedKeys = new Set(
    [...suspect, ...masterBehind].map((r) => `${r.tab} ${r.row}`)
  );
  const updates = planned.filter((p) => p.id && !abortedTabs.has(p.tab));
  const inserts = planned.filter(
    (p) => !p.id && !abortedTabs.has(p.tab) && !refusedKeys.has(`${p.tab} ${p.row}`)
  );
  /*
   * THE UNMATCHED STUMPS ARE TWO DIFFERENT PROBLEMS, AND CONFLATING THEM WOULD
   * HAVE SENT 85 ROWS TO MITCH THAT HE DOES NOT NEED TO LOOK AT.
   *
   * 229 stumps carry only 143 distinct (source, opening-40) keys: the same
   * stump was imported up to four times, and 83 of the 84 duplicate groups are
   * byte-identical titles. So a stump with no free source row is almost always
   * a SECOND COPY of a stump that just claimed one — its words are being
   * repaired on the other row, and the honest action is to retire it.
   *
   * A genuine orphan is a stump whose source label has no tab in this import at
   * all. There are six, not the three the Phase 0 report predicted: it counted
   * Lasting Impressions (2) and Nametag Skills (1) and missed three from
   * 'MPI Setup & GYR System' — a tab that DOES exist in the workbook but is a
   * class-transcript sheet outside the nine knowledge tabs.
   */
  const inScope = new Set(WANTED);
  const unmatched = stumps.filter((d) => !matchedIds.has(d.id));
  const orphans = unmatched.filter(
    (d) => !inScope.has((d.source ?? "").replace(/^Mitch import — /, ""))
  );
  const duplicates = unmatched.filter(
    (d) => inScope.has((d.source ?? "").replace(/^Mitch import — /, ""))
  );

  /*
   * WHICH ROW SURVIVES EACH DUPLICATE — needed before anything is retired.
   *
   * A duplicate's words are being repaired on the stump that claimed the source
   * row, so anything ATTACHED to the duplicate has to move there first. Right
   * now that means the review queue: 44 open items sit on draft cues, and
   * retiring one out from under an open question would delete Mitch's question
   * along with the row, silently. The unique index cannot catch that and
   * nothing would ever report it.
   */
  const survivorOf = new Map<string, string>();
  for (const d of duplicates) {
    const tab = (d.source ?? "").replace(/^Mitch import — /, "");
    const words = norm(d.title).split(" ");
    const prefix = words.slice(0, Math.max(1, words.length - 1)).join(" ");
    const hit = (byTab.get(tab) ?? []).find((c) => c.id && c.normFact.startsWith(prefix));
    if (hit?.id) survivorOf.set(d.id, hit.id);
  }

  console.log(`  ${planned.length} source rows planned`);
  table("UPDATE in place (stump repaired, id preserved)", [["rows", updates.length]]);
  table("INSERT as draft", [["rows", inserts.length]]);

  /* ---- Rows the positional key could not vouch for ----------------------- */
  if (suspect.length) {
    console.log(
      `\n  ROW MOVED? — NEEDS A HUMAN: ${suspect.length} row(s) whose stored text and` +
        ` incoming text have nothing in common. NOT updated.`
    );
    for (const sIt of suspect.slice(0, 12)) {
      console.log(`    ${sIt.tab} row ${sIt.row}`);
      console.log(`      stored:   ${sIt.stored.replace(/\s+/g, " ").slice(0, 96)}`);
      console.log(`      incoming: ${sIt.incoming.replace(/\s+/g, " ").slice(0, 96)}`);
    }
    if (suspect.length > 12) console.log(`    …and ${suspect.length - 12} more`);
  }
  if (masterBehind.length) {
    console.log(
      `\n  MASTER IS MISSING WORDS THE APP HAS: ${masterBehind.length} row(s).` +
        ` NOT updated — the workbook has materially less text than the app does.`
    );
    for (const m of masterBehind.slice(0, 20)) {
      console.log(`    ${m.tab} row ${m.row}`);
      console.log(`      app has:  ${m.stored.replace(/\s+/g, " ").slice(0, 104)}`);
      console.log(`      workbook: ${m.incoming.replace(/\s+/g, " ").slice(0, 104)}`);
    }
    if (masterBehind.length > 20) console.log(`    …and ${masterBehind.length - 20} more`);
    console.log(
      `    Nobody edits a Fact by deleting its second half. Update the master` +
        ` from the app, or paste the app's text back into these cells.`
    );
  }
  if (abortedTabs.size) {
    console.log(
      `\n  TABS NOT APPLIED — their rows appear to have SHIFTED: ${abortedTabs.size}`
    );
    for (const t of abortedTabs) {
      console.log(`    ${t} — ${refusalsByTab.get(t)} refusals; no changes applied to this tab`);
    }
    console.log(
      `    An insertion mid-tab moves every row below it. Add a stable id column` +
        ` to the workbook, or re-export the tab, and run again.`
    );
  }

  /*
   * ---- Rows in the library that this workbook no longer contains ----------
   *
   * COUNTED, NOT PRUNED AND NOT FLAGGED. The importer only ever visits rows the
   * workbook holds, so an absent row is untouched — which is the safe direction
   * and stays that way. But "untouched" and "nobody noticed it went" are the
   * same thing without a number, and a row that quietly left the master is
   * exactly what somebody should look at.
   */
  const inWorkbook = new Set(planned.map((p) => `${p.tab} ${p.row}`));
  const absent = [...existing.keys()].filter((k) => !inWorkbook.has(k));
  console.log(
    `\n  in the library but not in this workbook: ${absent.length} row(s) — left alone, not pruned`
  );
  if (absent.length) {
    for (const k of absent.slice(0, 10)) console.log(`    ${k}`);
    if (absent.length > 10) console.log(`    …and ${absent.length - 10} more`);
  }
  console.log(`\n  ${ambiguous} stumps had more than one candidate source row` +
    ` (shortest Fact wins — a longer Fact that merely opens the same way is not the source).`);
  /*
   * A DUPLICATE WITH NO IDENTIFIED SURVIVOR IS NOT A DUPLICATE — it is a stump
   * whose source row this pass could not name, and retiring it would withdraw
   * words that exist nowhere else. One row falls here. It goes to Mitch with
   * the genuine orphans rather than into the retire batch, because "probably a
   * copy" is not good enough to withdraw content on.
   */
  const retiring = duplicates.filter((d) => survivorOf.has(d.id));
  const unsure = duplicates.filter((d) => !survivorOf.has(d.id));

  table("DUPLICATE STUMPS -> retire (their words are repaired on another row)", [
    ["rows", retiring.length],
  ]);
  table("DUPLICATE-LOOKING, NO SURVIVOR FOUND -> review, not retired", [["rows", unsure.length]]);
  unsure.forEach((o) => console.log(`         ${o.source ?? "?"} — ${o.title.slice(0, 58)}`));
  table("ORPHAN STUMPS -> review queue as 'truncated'", [["rows", orphans.length]]);
  orphans.forEach((o) => console.log(`         ${o.source ?? "?"} — ${o.title.slice(0, 58)}`));
  table("UNTOUCHED (Mitch's finished writing)", [["rows", written.length]]);

  const byFamily = new Map<string, number>();
  planned.forEach((p) => byFamily.set(p.family ?? "(none)", (byFamily.get(p.family ?? "(none)") ?? 0) + 1));
  table("service_family assigned", [...byFamily].sort((a, b) => b[1] - a[1]));

  const withCode = planned.filter((p) => p.opCode).length;
  const review = planned.filter((p) => p.needsOpCode);
  const craft = planned.filter((p) => p.collection === "Craft");
  table("op_code assigned", [
    ["rows with exactly one code", withCode],
    ["rows with none or several", planned.length - withCode],
  ]);
  table("op_code INHERITED from the tab header (an inference, flagged)", [
    ["rows", planned.filter((p) => p.inherited).length],
  ]);
  table("CRAFT (process tabs — no op code by design)", [["rows", craft.length]]);
  table("-> review as 'needs_op_code'", [
    ["named ACO-010, unconfirmed alias", review.filter((r) => r.unconfirmed).length],
    ["never named a resolvable code", review.filter((r) => !r.unconfirmed).length],
  ]);

  const starved = ["HVAC", "Belts & Cooling", "Wipers", "Lighting", "Suspension", "Inspections", "Oil Change", "Alignment"];
  table(
    "STARVED FAMILIES THIS UN-SUPPRESSES (once published in Phase 2)",
    starved.map((f) => [f, planned.filter((p) => p.family === f).length] as [string, number])
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
  );

  console.log(`\n  stage set on any row: 0 — the source carries no stage column.`);
  console.log(`  Brake Service rows: ${planned.filter((p) => p.family === "Brake Service").length}` +
    `  (with an op_code: ${planned.filter((p) => p.family === "Brake Service" && p.opCode).length})`);

  /*
   * THE REPORT CSV IS REGENERATED FROM THIS PLAN, NOT MAINTAINED ALONGSIDE IT.
   *
   * reports/knowledge-tabs.csv was written by the Phase 0 pass and carried a
   * `matched_id` column produced by the map-direction bug — 138 matches where
   * the report's own summary table said 223. A report that contradicts its own
   * prose is a trap for whoever reads it next, and the durable fix is not to
   * correct the number by hand but to stop having two sources for it. This is
   * the same plan the importer applies, so they cannot drift again.
   */
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    ["tab", "src_row", "action", "matched_id", "title", "body", "tier", "op_code", "service_family", "collection", "needs_review"].join(","),
    ...planned.map((p) =>
      [
        p.tab, p.row, p.id ? "update" : "insert", p.id ?? "",
        p.title, p.body, p.tier, p.opCode ?? "", p.family ?? "", p.collection ?? "",
        p.needsOpCode ? (p.unconfirmed ? "needs_op_code:ACO-010" : "needs_op_code:prose") : "",
      ].map(esc).join(",")
    ),
  ].join("\n");
  writeFileSync("reports/knowledge-tabs.csv", csv + "\n");
  console.log(`\n  rewrote reports/knowledge-tabs.csv — ${planned.length} rows, ${updates.length} marked update`);

  if (DRY) {
    console.log(`  --dry: nothing written to the database.\n`);
    return;
  }

  /* ---- Write ------------------------------------------------------------- */
  let updated = 0, inserted = 0, flagged = 0;

  for (const p of updates) {
    const { error } = await sb
      .from("content")
      .update({
        title: p.title, body: p.body, detail: p.detail, tier: p.tier,
        service_family: p.family, op_code: p.opCode, collection: p.collection,
        op_code_inherited: p.inherited,
        source_tab: p.tab, source_row: p.row,
        updated_at: new Date().toISOString(),
      })
      .eq("id", p.id!);
    if (error) throw new Error(`update ${p.tab}:${p.row}: ${error.message}`);
    updated++;
  }
  console.log(`\n  updated ${updated}`);

  /*
   * Inserted in batches, and NOT upserted on (source_tab, source_row): the
   * unique index in 0068 is meant to raise on a double import rather than
   * quietly overwrite, so a second run that finds rows already there should
   * stop and be looked at.
   */
  for (let i = 0; i < inserts.length; i += 200) {
    const batch = inserts.slice(i, i + 200).map((p) => ({
      type: "cue", status: "draft", format: "cue",
      title: p.title, body: p.body, detail: p.detail, tier: p.tier,
      service_family: p.family, op_code: p.opCode, collection: p.collection,
      op_code_inherited: p.inherited,
      source: `Mitch import — ${p.tab}`,
      source_tab: p.tab, source_row: p.row,
    }));
    const { data, error } = await sb.from("content").insert(batch).select("id");
    if (error) throw new Error(`insert batch ${i}: ${error.message}`);
    inserted += (data ?? []).length;
  }
  console.log(`  inserted ${inserted}`);

  /* ---- Retire the duplicates, moving anything attached to them first ----- */
  /*
   * ORDER MATTERS. The review items move BEFORE the retire, so a failure
   * between the two leaves a question on a live row rather than on a withdrawn
   * one. content_review has `unique (content_id, reason)`, so a move onto a row
   * that already carries the same question would collide — those are dropped
   * rather than duplicated, because the surviving row already asks it.
   */
  const { data: openReviews } = await sb
    .from("content_review")
    .select("id, content_id, reason")
    .in("content_id", retiring.map((d) => d.id));

  let moved = 0, dropped = 0;
  for (const rv of openReviews ?? []) {
    const survivor = survivorOf.get(rv.content_id as string);
    if (!survivor) continue;
    const { error } = await sb
      .from("content_review")
      .update({ content_id: survivor })
      .eq("id", rv.id);
    // 23505 = the survivor already carries this question. Nothing is lost.
    if (error) {
      if ((error as { code?: string }).code === "23505") { dropped++; continue; }
      throw new Error(`move review ${rv.id}: ${error.message}`);
    }
    moved++;
  }
  if ((openReviews ?? []).length) {
    console.log(`  moved ${moved} review items off duplicates (${dropped} already asked on the survivor)`);
  }

  /*
   * RETIRED, NOT DELETED. 0062's retired_at is a soft delete precisely so
   * lesson credit, saves, view history and completed-day records survive
   * somebody tidying the CMS. These rows stay draft — they were never published
   * — and a retired row is recoverable, which is what makes retiring 85 of them
   * a safe action rather than an irreversible one.
   */
  let retired = 0;
  for (let i = 0; i < retiring.length; i += 200) {
    const batch = retiring.slice(i, i + 200).map((d) => d.id);
    const { error } = await sb
      .from("content")
      .update({ retired_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in("id", batch);
    if (error) throw new Error(`retire batch ${i}: ${error.message}`);
    retired += batch.length;
  }
  console.log(`  retired ${retired} duplicates`);

  /* ---- The review queue -------------------------------------------------- */
  for (const o of [...orphans, ...unsure]) {
    const { error } = await sb.from("content_review").upsert(
      {
        content_id: o.id,
        reason: "truncated",
        detail:
          "This cue was cut short on import and no row in the v2 workbook could " +
          "be matched to it, so there is nothing to repair it from automatically. " +
          "Please supply the missing words.",
      },
      { onConflict: "content_id,reason" }
    );
    if (error) throw new Error(`review ${o.id}: ${error.message}`);
    flagged++;
  }

  if (review.length) {
    const { data: ids } = await sb
      .from("content")
      .select("id, source_tab, source_row, body")
      .in("source_tab", [...new Set(review.map((r) => r.tab))]);
    const byKey = new Map(
      (ids ?? []).map((r) => [`${r.source_tab} ${r.source_row}`, r.id as string])
    );
    for (const r of review) {
      const id = byKey.get(`${r.tab} ${r.row}`);
      if (!id) continue;
      const { error } = await sb.from("content_review").upsert(
        {
          content_id: id,
          reason: "needs_op_code",
          detail: r.unconfirmed
            ? "This row's only op code is ACO-010 (A/C Odor), which is not in " +
              "the catalog. Evaporator cleaning IS the odor service, so ACE-053 " +
              "is proposed — one line from you confirms it and the row resolves."
            : "This row's Op Code column is prose rather than a code (\"All EV " +
              "op codes\", \"Tesla 8yr/100-150K\"), so nothing routes it. Which " +
              "op code is it about?",
        },
        { onConflict: "content_id,reason" }
      );
      if (error) throw new Error(`review op_code ${id}: ${error.message}`);
      flagged++;
    }
  }
  /*
   * THE QUESTIONS THIS RUN ANSWERED CLOSE THEMSELVES.
   *
   * There is no resolve pass here, and there was one for about ten minutes.
   * `content_review_autoclose()` (0061) is an AFTER UPDATE trigger on content
   * that already resolves a `needs_op_code` item the moment op_code changes to
   * a non-null value — so tab inheritance closed 64 cards before this script
   * could look at them, and a second implementation would only be able to
   * disagree with the first.
   *
   * Worth stating rather than deleting silently: the count below reads 0 not
   * because nothing was answered but because the database answered it.
   */

  console.log(`  flagged ${flagged} for review (needs_op_code items close via the 0061 trigger)\n`);
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
