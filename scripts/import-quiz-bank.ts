/* ============================================================================
   EDIAGD — import the Master Quiz Bank

     SB_URL=… SB_KEY=… npm run import:quiz            # apply
     SB_URL=… SB_KEY=… npm run import:quiz -- --dry   # report only, write nothing
     … npm run import:quiz -- --file data/other.xlsx  # against a scratch copy

   ---------------------------------------------------------------------------
   THE MASTER IS THE ONLY SOURCE
   ---------------------------------------------------------------------------
   The Vol workbooks are in data/ as the paper trail and are never read here.
   The Master carries every question from them verbatim; importing both would
   produce two rows for one question under two different ids, which is the exact
   failure Mitch's Question ID column exists to prevent. See data/README.md.

   ---------------------------------------------------------------------------
   MATCHED ON EQ ID, NEVER ON ROW POSITION
   ---------------------------------------------------------------------------
   Every row carries EQ0001..EQ0485 and that is the key. Mitch can re-sort the
   sheet, insert a question in the middle, or delete one, and a re-run still
   updates the right rows — where a positional import would silently rewrite
   every question after the insertion point with its neighbour's text.

   ---------------------------------------------------------------------------
   NOTHING IS PUBLISHED
   ---------------------------------------------------------------------------
   Everything lands `status = 'draft'`, like every other content type: Mitch
   reviews and publishes. There is no admin surface for quiz questions yet, so
   UNTIL THERE IS, THIS REPORT IS THE REVIEW SURFACE — it prints what resolved,
   what did not, and why. That is stated plainly rather than papered over by
   building a screen in an import task.

   ---------------------------------------------------------------------------
   WHAT THIS DOES NOT PROTECT
   ---------------------------------------------------------------------------
   quiz_question HAS NO TEXT-VERSION TRIGGER. The 0083 content_text_version
   backstop covers `content` only, so a re-run whose source has edited wording
   overwrites the previous wording with no history — the same hole that cost 15
   cue bodies during the knowledge import, in a table that does not have the
   trigger that recovered them. Flagged, not fixed here.
   ============================================================================ */

import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

const MASTER = "data/EDIAGD_Master_Quiz_Bank.xlsx";
const DECK_MAP = "data/EDIAGD_Doggett_OpCode_Deck_Map (1).xlsx";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const fileArg = args.indexOf("--file");
const SOURCE_FILE = fileArg >= 0 ? args[fileArg + 1] : MASTER;

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});

/* ---------------------------------------------------------------------------
   Reading cells
--------------------------------------------------------------------------- */

type Cell = ExcelJS.CellValue;

/** A cell as trimmed text. Formulas yield their result, never their formula. */
function text(v: Cell): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join("").trim();
    if (o.text != null) return String(o.text).trim();
    if (o.result != null) return String(o.result).trim();
    return "";
  }
  return String(v).trim();
}

/** Null rather than "" — an absent option is not an empty one. See 0087. */
function textOrNull(v: Cell): string | null {
  const s = text(v);
  return s === "" ? null : s;
}

function headerIndex(ws: ExcelJS.Worksheet): Record<string, number> {
  const h: Record<string, number> = {};
  ws.getRow(1).eachCell((cell, i) => {
    const name = text(cell.value);
    if (name) h[name] = i;
  });
  return h;
}

/* ---------------------------------------------------------------------------
   Deck -> op codes, from the deck map's own inventory
--------------------------------------------------------------------------- */

/**
 * Read `Deck Inventory` and keep only codes that exist in op_code_catalog.
 *
 * Mitch's cells hold placeholders as well as codes — "ACO (needs code)", "TIR
 * (needs code)", "Foundational", "MOC-branded", a bare "MNU" where the catalog
 * has MNU-001..011. None of those is an op code and none is an error either;
 * they are the honest state of a mapping that is still being agreed. They are
 * dropped from the resolved list and reported.
 */
async function loadDeckOpCodes(): Promise<{
  byDeck: Map<string, string[]>;
  unresolved: Map<string, string[]>;
}> {
  const { data: catalog } = await sb.from("op_code_catalog").select("code");
  const known = new Set((catalog ?? []).map((r) => String(r.code)));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(DECK_MAP);
  const ws = wb.getWorksheet("Deck Inventory");
  if (!ws) throw new Error(`No "Deck Inventory" sheet in ${DECK_MAP}`);

  const H = headerIndex(ws);
  const byDeck = new Map<string, string[]>();
  const unresolved = new Map<string, string[]>();

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const deck = text(row.getCell(H["Deck Name"]).value);
    if (!deck) continue;

    const raw = text(row.getCell(H["Op Codes Covered"]).value);
    const tokens = raw.split(",").map((t) => t.trim()).filter(Boolean);

    const resolved = tokens.filter((t) => known.has(t));
    const missed = tokens.filter((t) => !known.has(t));

    byDeck.set(deck, resolved);
    if (missed.length) unresolved.set(deck, missed);
  }
  return { byDeck, unresolved };
}

/* ---------------------------------------------------------------------------
   Film -> stage, from mapping_alias
--------------------------------------------------------------------------- */

/**
 * CONFIRMED ALIASES ONLY. A proposed one is visible and inert by design (0066),
 * so a guess sitting in the table awaiting Mitch's answer cannot quietly file
 * 20 questions under a stage he has not agreed to.
 */
async function loadStageAliases(): Promise<Map<string, string>> {
  const { data } = await sb
    .from("mapping_alias")
    .select("alias, canonical")
    .eq("kind", "stage")
    .eq("confirmed", true);

  const m = new Map<string, string>();
  for (const row of data ?? []) m.set(String(row.alias).toLowerCase(), String(row.canonical));
  return m;
}

/* ---------------------------------------------------------------------------
   The rows
--------------------------------------------------------------------------- */

type QuizRow = {
  source_id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string | null;
  option_d: string | null;
  correct: string;
  hint: string | null;
  explanation: string | null;
  question_type: string;
  deck: string;
  film: string;
  stage: string | null;
  op_code: string | null;
  op_codes: string[];
  shared_pool: boolean;
  volume: string | null;
  status: string;
};

const TYPES = new Set([
  "Multiple Choice", "True/False", "Piggyback", "What Do You Say Next",
  "Finish the Track", "Spot the Mistake", "Which Voice", "Put In Order",
]);

async function readMaster(
  deckCodes: Map<string, string[]>,
  stageAliases: Map<string, string>
) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SOURCE_FILE);
  const ws = wb.getWorksheet("Master Quiz Bank");
  if (!ws) throw new Error(`No "Master Quiz Bank" sheet in ${SOURCE_FILE}`);

  const H = headerIndex(ws);
  for (const need of ["Question ID", "Question", "Type", "Correct", "Deck / Category"]) {
    if (!H[need]) throw new Error(`Missing column "${need}" in ${SOURCE_FILE}`);
  }

  const rows: QuizRow[] = [];
  const refusals: string[] = [];
  const unmappedFilms = new Map<string, number>();
  const decksWithoutCode = new Map<string, number>();
  const seen = new Set<string>();

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const g = (name: string) => text(row.getCell(H[name]).value);
    const gn = (name: string) => textOrNull(row.getCell(H[name]).value);

    const sourceId = g("Question ID");
    if (!sourceId) continue;

    if (seen.has(sourceId)) {
      refusals.push(`row ${r}: duplicate Question ID ${sourceId} — refused`);
      continue;
    }
    seen.add(sourceId);

    const question = g("Question");
    if (!question) {
      refusals.push(`row ${r} (${sourceId}): no question text — refused`);
      continue;
    }

    const type = g("Type");
    if (!TYPES.has(type)) {
      refusals.push(`row ${r} (${sourceId}): unknown Type "${type}" — refused`);
      continue;
    }

    /* Mitch writes A-D; the column has taken a-d since 0035. Lowercased rather
       than the constraint widened: one letter case in the database is worth
       more than one fewer transformation here. */
    const correct = g("Correct").toLowerCase();
    if (!["a", "b", "c", "d"].includes(correct)) {
      refusals.push(`row ${r} (${sourceId}): Correct is "${g("Correct")}" — refused`);
      continue;
    }

    const optionA = g("Option A");
    const optionB = g("Option B");
    if (!optionA || !optionB) {
      refusals.push(`row ${r} (${sourceId}): fewer than two options — refused`);
      continue;
    }
    const optionC = gn("Option C");
    const optionD = gn("Option D");

    /* The answer has to point at an option that exists. A True/False row whose
       key says "C" is a typo that would render as an unanswerable question. */
    const options: Record<string, string | null> = {
      a: optionA, b: optionB, c: optionC, d: optionD,
    };
    if (!options[correct]) {
      refusals.push(
        `row ${r} (${sourceId}): answer is ${correct.toUpperCase()} but there is no option ${correct.toUpperCase()} — refused`
      );
      continue;
    }

    const deck = g("Deck / Category");
    const film = g("Film / Stage");
    const sharedPool = g("Source").toLowerCase().includes("shared");

    /* ---- Deck -> op code -------------------------------------------------
     * First resolvable code is primary, the rest are recorded — the same
     * ruling the knowledge import used. A deck with none is foundational
     * (Pre-Write, Sing It, Wrap-Up, Overcoming Objections) or a shared pool
     * category, and null is the correct answer for both. Not an error.
     */
    const codes = deckCodes.get(deck) ?? [];
    if (!sharedPool && codes.length === 0) {
      decksWithoutCode.set(deck, (decksWithoutCode.get(deck) ?? 0) + 1);
    }

    /* ---- Film -> stage ---------------------------------------------------
     * No alias means no stage. Never a guess: the six stages drive which day of
     * a coaching block a thing belongs to, and a wrong one is worse than none.
     */
    const stage = stageAliases.get(film.toLowerCase()) ?? null;
    if (film && !stage) unmappedFilms.set(film, (unmappedFilms.get(film) ?? 0) + 1);

    rows.push({
      source_id: sourceId,
      question,
      option_a: optionA,
      option_b: optionB,
      option_c: optionC,
      option_d: optionD,
      correct,
      hint: gn("Hint"),
      explanation: gn("Explanation"),
      question_type: type,
      deck,
      film,
      stage,
      op_code: codes[0] ?? null,
      op_codes: codes,
      shared_pool: sharedPool,
      volume: gn("Volume"),
      /* DRAFT, ALWAYS. Mitch publishes. */
      status: "draft",
    });
  }

  return { rows, refusals, unmappedFilms, decksWithoutCode };
}

/* ---------------------------------------------------------------------------
   Writing
--------------------------------------------------------------------------- */

/** The fields a re-import may change. Not status: publishing is Mitch's. */
const MUTABLE = [
  "question", "option_a", "option_b", "option_c", "option_d", "correct",
  "hint", "explanation", "question_type", "deck", "film", "stage",
  "op_code", "op_codes", "shared_pool", "volume",
] as const;

function differs(existing: Record<string, unknown>, next: QuizRow): string[] {
  const changed: string[] = [];
  for (const f of MUTABLE) {
    const a = existing[f];
    const b = next[f];
    if (Array.isArray(a) || Array.isArray(b)) {
      if (JSON.stringify(a ?? []) !== JSON.stringify(b ?? [])) changed.push(f);
    } else if ((a ?? null) !== (b ?? null)) {
      changed.push(f);
    }
  }
  return changed;
}

async function main() {
  console.log(`\n  source   ${SOURCE_FILE}`);
  console.log(`  mode     ${DRY ? "DRY RUN — nothing is written" : "apply"}\n`);

  const { byDeck, unresolved } = await loadDeckOpCodes();
  const stageAliases = await loadStageAliases();
  const { rows, refusals, unmappedFilms, decksWithoutCode } = await readMaster(
    byDeck,
    stageAliases
  );

  console.log(`  read ${rows.length} questions, ${refusals.length} refused\n`);

  /* ---- What is already there, by EQ id ---------------------------------- */
  const { data: existingRows, error: readErr } = await sb
    .from("quiz_question")
    .select(`id, source_id, ${MUTABLE.join(", ")}`)
    .not("source_id", "is", null);
  if (readErr) throw new Error(`Reading quiz_question: ${readErr.message}`);

  const existing = new Map<string, Record<string, unknown>>();
  for (const r of (existingRows ?? []) as unknown as Record<string, unknown>[]) {
    existing.set(String(r.source_id), r);
  }

  const inserts: QuizRow[] = [];
  const updates: { row: QuizRow; id: string; changed: string[] }[] = [];
  let unchanged = 0;

  for (const row of rows) {
    const prior = existing.get(row.source_id);
    if (!prior) {
      inserts.push(row);
      continue;
    }
    const changed = differs(prior, row);
    if (changed.length === 0) unchanged++;
    else updates.push({ row, id: String(prior.id), changed });
  }

  console.log(`  ${String(inserts.length).padStart(4)} new`);
  console.log(`  ${String(updates.length).padStart(4)} changed`);
  console.log(`  ${String(unchanged).padStart(4)} unchanged`);

  if (updates.length) {
    console.log("\n  CHANGES");
    for (const u of updates.slice(0, 30)) {
      console.log(`    ${u.row.source_id}  ${u.changed.join(", ")}`);
    }
    if (updates.length > 30) console.log(`    … and ${updates.length - 30} more`);
  }

  /* ---- The review surface ------------------------------------------------ */
  if (refusals.length) {
    console.log("\n  REFUSED — not imported, and why");
    refusals.forEach((r) => console.log(`    ${r}`));
  }

  if (unmappedFilms.size) {
    console.log("\n  FILM NAMES WITH NO CONFIRMED STAGE — imported with stage null");
    [...unmappedFilms.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([film, n]) => console.log(`    ${String(n).padStart(4)}  ${film}`));
    console.log("    Add a confirmed mapping_alias kind='stage' and re-run to fill these in.");
  }

  if (decksWithoutCode.size) {
    console.log("\n  DECKS WITH NO RESOLVABLE OP CODE — imported with op code null");
    [...decksWithoutCode.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([deck, n]) => {
        const why = unresolved.get(deck);
        console.log(`    ${String(n).padStart(4)}  ${deck}${why ? `   (deck map says: ${why.join(", ")})` : "   (not in Deck Inventory)"}`);
      });
    console.log("    Foundational decks are expected here. The rest need an op code slot.");
  }

  /* ---- Counts, against Mitch's own Summary ------------------------------- */
  const tally = (f: (r: QuizRow) => string) => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(f(r), (m.get(f(r)) ?? 0) + 1));
    return m;
  };
  console.log("\n  BY TYPE");
  [...tally((r) => r.question_type).entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([t, n]) => console.log(`    ${String(n).padStart(4)}  ${t}`));
  console.log(`\n  shared pool: ${rows.filter((r) => r.shared_pool).length}`);
  console.log(`  deck-specific: ${rows.filter((r) => !r.shared_pool).length}`);

  if (DRY) {
    console.log("\n  DRY RUN — nothing written.\n");
    return;
  }

  /* ---- Write ------------------------------------------------------------- */
  if (inserts.length) {
    for (let i = 0; i < inserts.length; i += 200) {
      const chunk = inserts.slice(i, i + 200);
      const { error } = await sb.from("quiz_question").insert(chunk);
      if (error) throw new Error(`Insert failed at row ${i}: ${error.message}`);
    }
    console.log(`\n  inserted ${inserts.length}`);
  }

  for (const u of updates) {
    const patch: Record<string, unknown> = {};
    for (const f of MUTABLE) patch[f] = u.row[f];
    patch.updated_at = new Date().toISOString();
    const { error } = await sb.from("quiz_question").update(patch).eq("id", u.id);
    if (error) throw new Error(`Update ${u.row.source_id}: ${error.message}`);
  }
  if (updates.length) console.log(`  updated ${updates.length}`);

  console.log("\n  done.\n");
}

/*
 * NOT ON IMPORT. This module is imported by its own test, and a bare call here
 * would run a full production import the moment anything requires the file —
 * which is exactly how 797 rows were touched and 15 cue bodies truncated during
 * the knowledge import.
 */
if (require.main === module) {
  main().catch((e) => {
    console.error("\n  FAILED:", e instanceof Error ? e.message : e, "\n");
    process.exit(1);
  });
}

export { readMaster, loadDeckOpCodes, loadStageAliases, differs, text, textOrNull };
