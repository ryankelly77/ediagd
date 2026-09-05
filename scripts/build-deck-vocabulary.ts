/* ============================================================================
   EDIAGD — what each deck sounds like

     npm run build:deck-vocab

   Reads data/EDIAGD_Master_Quiz_Bank.xlsx and writes data/deck-vocabulary.json:
   for every deck, the words that appear in ITS questions and hardly anywhere
   else. That file is what lib/video/transcript-match.ts scores a transcript
   against.

   ---------------------------------------------------------------------------
   DERIVED, NOT TYPED OUT
   ---------------------------------------------------------------------------
   The obvious version of this is a hand-written list — "airbox, throttle body"
   for Engine Air Filter, "reservoir, moisture" for Brake Fluid. That works for
   two decks and rots at thirty-three: somebody adds a deck, forgets the list,
   and the matcher silently answers with the closest deck it happens to know.
   Mitch's 485 questions already say what each deck is about, in his words, so
   the vocabulary comes from there and a new deck brings its own.

   ---------------------------------------------------------------------------
   TWO KINDS OF "DECK", AND THEY MUST NOT COMPETE
   ---------------------------------------------------------------------------
   The workbook's `Deck / Category` column mixes op-code decks (Engine Air
   Filter, Brake Fluid Exchange) with foundational modules (Sing It, The close,
   Selling speech, Four voices). Every op-code film is full of selling language,
   so scoring them in one pool has the foundational modules tie — and beat — the
   real answer: a transcript scoring "brake, fluid, moisture, feet, trucks" lost
   to "Sing It" on the first real run.

   The deck map's `Deck Inventory` sheet settles it: `Op Codes Covered` reads
   "Foundational" for a module and a real code list for a deck. Stage labels
   alone were not enough — "Setup speech" and "Selling speech" are foundational
   modules whose questions are filed under the film stages they teach, so they
   classified as op-code decks and then beat the real deck on a transcript.

   THE OP CODE COMES FROM THERE TOO, and that matters more than the split does.
   The first version of this hand-typed the deck-to-code map into the script and
   got a third of it wrong — CLE-010 for Coolant Exchange when the map says
   CLF-010, DFF-005 for Differential when it says DFF-014, SPK-037 for Spark
   Plugs when it says SPK-043. Those are the names films would have been renamed
   to. The exact failure this file's header warns about, committed in the file
   that reads it.

   ---------------------------------------------------------------------------
   WHY DISTINCTIVENESS AND NOT FREQUENCY
   ---------------------------------------------------------------------------
   The most common words in the Engine Air Filter questions are "customer",
   "filter", "the" — and "customer" is the most common word in every other deck
   too, so it identifies nothing. A term earns its place by how much MORE it
   appears here than elsewhere. That is why "flush" is a strong Brake Fluid
   signal (Mitch bans the word specifically, on that deck) while "close" is
   worth nothing anywhere.
   ============================================================================ */

import ExcelJS from "exceljs";
import { writeFileSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { createClient } from "@supabase/supabase-js";

const SOURCE = "data/EDIAGD_Master_Quiz_Bank.xlsx";
const DECK_MAP = "data/EDIAGD_Doggett_OpCode_Deck_Map (1).xlsx";
const OUT = "data/deck-vocabulary.json";
const PROMPT_OUT = "data/whisper-prompt.txt";
const TELEPROMPTER = "data/EDIAGD_Teleprompter_Vol2.docx";
const FILMS_OUT = "data/teleprompter-films.json";

/* Words that carry no deck signal. Deliberately short — this is a corpus of
   485 sentences, not the web, and an aggressive stop list here would throw away
   the domain words that do the work. */
const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "at", "by",
  "for", "with", "is", "are", "was", "were", "be", "been", "it", "its", "that",
  "this", "you", "your", "i", "me", "my", "we", "us", "our", "as", "so", "do",
  "does", "did", "not", "no", "yes", "what", "which", "when", "why", "how",
  "who", "true", "false", "customer", "customers", "advisor", "advisors",
  "them", "they", "their", "he", "she", "his", "her", "one", "two", "three",
  "can", "will", "would", "should", "could", "have", "has", "had", "get",
  "got", "go", "goes", "say", "says", "said", "tell", "told", "ask", "asked",
  "there", "here", "then", "than", "from", "about", "out", "up", "off", "into",
  "every", "all", "any", "some", "more", "most", "other", "same", "just",
  "only", "also", "because", "before", "after", "right", "wrong", "good",
  "bad", "first", "next", "last", "time", "times", "thing", "things", "way",
]);

const words = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

type DeckDoc = { deck: string; terms: Map<string, number>; total: number };

type Inventory = { kind: "op_code" | "foundational"; code: string | null; films: number | null };

/**
 * Deck -> what it is and which op code it carries, from the deck map.
 *
 * The FIRST code of a multi-code deck is the one a film is named for: Engine
 * Air Filter covers "EAF-001, TBC-044" and its four films are EAF-001 films —
 * the second code is a piggyback the deck also touches. "ACO (needs code)" and
 * "TIR (needs code)" are Mitch's own note that no code exists yet, and they
 * yield null rather than a code invented here.
 */
async function loadInventory(): Promise<Map<string, Inventory>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(DECK_MAP);
  const ws = wb.getWorksheet("Deck Inventory");
  const out = new Map<string, Inventory>();
  if (!ws) throw new Error(`no 'Deck Inventory' sheet in ${DECK_MAP}`);

  const hdr = ((ws.getRow(1).values as unknown[]).slice(1) as unknown[]).map((v) =>
    String(v ?? "")
  );
  const iName = hdr.indexOf("Deck Name");
  const iCodes = hdr.indexOf("Op Codes Covered");
  const iFilms = hdr.indexOf("Films");

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = (ws.getRow(r).values as unknown[]).slice(1);
    const name = String(row[iName] ?? "").trim();
    if (!name) continue;
    const codes = String(row[iCodes] ?? "").trim();
    const films = Number(row[iFilms] ?? 0) || null;

    if (/^foundational$/i.test(codes)) {
      out.set(name, { kind: "foundational", code: null, films });
      continue;
    }
    const firstCode = codes.split(",")[0]?.trim() ?? "";
    const code = /^[A-Z]{2,4}-\d{2,3}$/.test(firstCode) ? firstCode : null;
    out.set(name, { kind: "op_code", code, films });
  }
  return out;
}

/**
 * Fill the deck map's gaps from op_code_catalog, which is the actual authority.
 *
 * The map was issued before some codes were ruled and still says "ACO (needs
 * code)" for A/C Odor Treatment — a deck whose code has since been minted as
 * ACO-055. Left alone, three finished films sit unnameable behind a note that
 * stopped being true.
 *
 * NOT AN OVERRIDE LIST IN THIS FILE. Typing "A/C Odor Treatment: ACO-055" here
 * is exactly what put CLE-010 and DFF-005 and SPK-037 into the last version,
 * and there is no reason to believe a fourth hand-typed table would be the
 * accurate one. The catalog knows; ask it.
 *
 * OPTIONAL. Without credentials this is skipped and the decks keep whatever the
 * map gave them — the vocabulary is still correct, and a missing code shows up
 * as a hold rather than a wrong name.
 */
async function fillCodesFromCatalog(inventory: Map<string, Inventory>): Promise<number> {
  const url = process.env.SB_URL;
  const key = process.env.SB_KEY;
  if (!url || !key) {
    console.log("  (no SB_URL/SB_KEY — deck map codes used as-is)");
    return 0;
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await sb
    .from("op_code_catalog")
    .select("code, name")
    .is("retired_at", null);

  /* "AC Odor Treatment" in the catalog, "A/C Odor Treatment" in the map. */
  const key0 = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const byName = new Map(
    ((data ?? []) as { code: string; name: string }[]).map((r) => [key0(r.name), r.code])
  );

  let filled = 0;
  for (const [deck, entry] of inventory) {
    if (entry.kind !== "op_code" || entry.code) continue;
    const found = byName.get(key0(deck));
    if (found) {
      inventory.set(deck, { ...entry, code: found });
      console.log(`  deck map had no code for ${deck} — catalog says ${found}`);
      filled++;
    }
  }
  return filled;
}

/**
 * The film scripts themselves, from the teleprompter document.
 *
 * ---------------------------------------------------------------------------
 * GROUND TRUTH, WHERE IT EXISTS
 * ---------------------------------------------------------------------------
 * Volume 2 carries the actual words for twenty films across five decks —
 * "OP CODE — ARCTIC BLAST · ABT-054", then "FILM 1 · ON THE DRIVE" and the
 * script under it. A transcript that matches one of those is not a guess about
 * what the film might be; it is the film, because the script is what Mitch read
 * to camera.
 *
 * That distinction is worth keeping in the report: a film can be identified
 * because it DECLARED itself, or because it MATCHES A KNOWN SCRIPT. Both are
 * certain; only the second can be checked against a document.
 *
 * Volume 1 — Engine Air Filter through A/C Recharge — is not in data/. Getting
 * it would extend this from five decks to most of the library.
 */
function loadTeleprompterFilms(): { deck: string; code: string | null; stage: string; text: string }[] {
  if (!existsSync(TELEPROMPTER)) return [];
  /* A .docx is a ZIP container and word/document.xml is the text. Node has no
     zip reader and zlib only does raw deflate, so this shells out rather than
     adding a dependency to read one file in a build script. */
  let doc: string;
  try {
    doc = execFileSync("unzip", ["-p", TELEPROMPTER, "word/document.xml"], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    console.log(`  (could not read ${TELEPROMPTER} — no film scripts)`);
    return [];
  }

  const paragraphs = (doc.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).map((p) =>
    (p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? [])
      .map((t) => t.replace(/<[^>]+>/g, ""))
      .join("")
      .trim()
  );

  const films: { deck: string; code: string | null; stage: string; text: string }[] = [];
  let deck: string | null = null;
  let code: string | null = null;
  let stage: string | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (deck && stage && buf.length) {
      films.push({ deck, code, stage, text: buf.join(" ") });
    }
    buf = [];
  };

  for (const line of paragraphs) {
    const op = line.match(/^OP CODE\s*[—–-]\s*(.+?)\s*·\s*([A-Z]{2,4}-\d{2,3})/);
    if (op) {
      flush();
      deck = op[1].trim();
      code = op[2];
      stage = null;
      continue;
    }
    const film = line.match(/^FILM\s*\d+\s*·\s*(.+)$/);
    if (film) {
      flush();
      /* "SET UP THE MPI" in the document; "MPI Setup" is the canonical
         vocabulary Ryan ruled. Title-cased here and mapped by the matcher. */
      stage = film[1].trim();
      continue;
    }
    if (/^OP CODE DECKS$|^FOUNDATIONAL MODULES$/.test(line)) {
      flush();
      deck = null;
      stage = null;
      continue;
    }
    if (stage && line.length > 40) buf.push(line);
  }
  flush();
  return films;
}

async function main() {
  const inventory = await loadInventory();
  await fillCodesFromCatalog(inventory);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SOURCE);
  const ws = wb.worksheets[0];

  const header = ws.getRow(1).values as unknown[];
  const hdr = (header.slice(1) as unknown[]).map((v) => String(v ?? ""));
  const col = (name: string) => hdr.indexOf(name);
  const iDeck = col("Deck / Category");
  const iStage = col("Film / Stage");
  const fields = ["Question", "Option A", "Option B", "Option C", "Option D", "Hint", "Explanation"]
    .map(col)
    .filter((i) => i >= 0);

  if (iDeck < 0) throw new Error("no 'Deck / Category' column — has the workbook changed?");

  const docs = new Map<string, DeckDoc>();
  const documentFrequency = new Map<string, number>();
  const stagesSeen = new Map<string, Set<string>>();

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = (ws.getRow(r).values as unknown[]).slice(1);
    const deck = String(row[iDeck] ?? "").trim();
    if (!deck) continue;

    const stage = String(row[iStage] ?? "").trim();
    if (stage) {
      const set = stagesSeen.get(deck) ?? new Set<string>();
      set.add(stage);
      stagesSeen.set(deck, set);
    }

    const text = fields.map((i) => String(row[i] ?? "")).join(" ");
    const doc = docs.get(deck) ?? { deck, terms: new Map(), total: 0 };
    for (const w of words(text)) {
      doc.terms.set(w, (doc.terms.get(w) ?? 0) + 1);
      doc.total++;
    }
    docs.set(deck, doc);
  }

  /* How many DECKS use each term. A word in one deck is a fingerprint; a word
     in twenty is furniture. */
  for (const doc of docs.values()) {
    for (const term of doc.terms.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const deckCount = docs.size;
  const out = [...docs.values()]
    .map((doc) => {
      const scored = [...doc.terms.entries()]
        .filter(([, n]) => n >= 2) // said once is an accident of phrasing
        /* A FINGERPRINT, OR NOTHING. A term four or more decks use is not
           evidence about which deck this is, however well TF-IDF scores it —
           and the tail of a 40-term profile is exactly where those live. Left
           in, they gave Battery a flat 0.29 against every transcript in the
           Drop Zone and destroyed the margin the real deck needed to win. */
        .filter(([term]) => (documentFrequency.get(term) ?? 99) <= 3)
        .map(([term, n]) => {
          const df = documentFrequency.get(term) ?? 1;
          /* Plain TF-IDF. The weight is what the matcher adds up, so a term
             this deck uses six times and nobody else uses at all outranks one
             it uses twice and four other decks use as well. */
          const weight = (n / doc.total) * Math.log(deckCount / df);
          return { term, n, df, weight: Number(weight.toFixed(6)) };
        })
        .filter((t) => t.weight > 0)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 30);

      /* RAW WEIGHTS, NOT NORMALISED — and this was got wrong once in each
         direction. Scaling every profile to sum to 1 was meant to stop a short
         deck outscoring a long one; it did the opposite. A profile left with
         four terms after the fingerprint filter carries 0.25 per term while a
         rich one carries 0.03, so Battery won every film in the Drop Zone on a
         single incidental word. Summing raw TF-IDF rewards matching MANY
         distinctive terms, which is the thing that actually distinguishes the
         right deck from a coincidence. */
      const terms = scored;

      const stages = [...(stagesSeen.get(doc.deck) ?? [])].sort();
      /* Not in the deck map at all — "Lines", "Vocabulary", "Four voices" and
         the other speech modules. Foundational by default, because a deck the
         map does not list is not a deck with an op code. */
      const known = inventory.get(doc.deck);
      return {
        deck: doc.deck,
        kind: known?.kind ?? "foundational",
        code: known?.code ?? null,
        films: known?.films ?? null,
        stages,
        terms,
      };
    })
    .sort((a, b) => a.deck.localeCompare(b.deck));

  writeFileSync(OUT, `${JSON.stringify({ source: SOURCE, decks: out }, null, 1)}\n`);

  /* ---- The whisper prompt ------------------------------------------------
     An initial_prompt biases decoding toward words it contains, and the base
     model needed it: "pre-writes" came back as "pre-rights", "pre-orites" and
     "pre-ride", "Arctic Blast" as "Arctic Glass", "engine air filter" as
     "engineer filters", "cowl" as "cow". Every one of those is a word the
     matcher reads.

     DECK NAMES FIRST, because they are what identifies a film — the matcher's
     strongest signal is the service being named in the opening, so those are
     the words that must survive transcription intact.

     WHISPER TRUNCATES THE PROMPT at 224 tokens and silently drops the tail, so
     this is deliberately short and ordered by value rather than being every
     term in the corpus. */
  const spoken = [
    ...out.map((d) => d.deck),
    ...out.filter((d) => d.code).map((d) => d.code as string),
  ];
  const prompt =
    `EDIAGD service advisor training with Mitch Hardt. Aloha and mahalo. ` +
    `Decks: ${spoken.slice(0, out.length).join(", ")}. ` +
    `Terms: pre-write, pre-writes, multi-point inspection, MPI, kiosk, walk-around, ` +
    `BTM based on time and mileage, green yellow red, Hector, cowl, airbox, ` +
    `throttle body, op code, piggyback, deferred, declined, Swell, Paddle Back Out.`;
  writeFileSync(PROMPT_OUT, `${prompt}\n`);

  const films = loadTeleprompterFilms();
  writeFileSync(FILMS_OUT, `${JSON.stringify({ source: TELEPROMPTER, films }, null, 1)}\n`);
  console.log(`  ${films.length} teleprompter film scripts -> ${FILMS_OUT}`);
  console.log(`  whisper prompt -> ${PROMPT_OUT} (${prompt.split(/\s+/).length} words)`);

  console.log(`\n  ${out.length} decks -> ${OUT}\n`);
  for (const d of out.slice(0, 40)) {
    console.log(
      `  ${d.kind === "op_code" ? "deck  " : "module"} ${(d.code ?? "—").padEnd(9)} ` +
        `${d.deck.padEnd(30)} ${d.terms.slice(0, 4).map((t) => t.term).join(", ")}`
    );
  }
  console.log("");
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
    console.error("\n  FAILED:", e instanceof Error ? e.message : e, "\n");
    process.exit(1);
  });
}
