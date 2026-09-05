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
import { writeFileSync } from "fs";

const SOURCE = "data/EDIAGD_Master_Quiz_Bank.xlsx";
const OUT = "data/deck-vocabulary.json";

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

async function main() {
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
        .slice(0, 40);

      return {
        deck: doc.deck,
        stages: [...(stagesSeen.get(doc.deck) ?? [])].sort(),
        terms: scored,
      };
    })
    .sort((a, b) => a.deck.localeCompare(b.deck));

  writeFileSync(OUT, `${JSON.stringify({ source: SOURCE, decks: out }, null, 1)}\n`);

  console.log(`\n  ${out.length} decks -> ${OUT}\n`);
  for (const d of out.slice(0, 40)) {
    console.log(`  ${d.deck.padEnd(30)} ${d.terms.slice(0, 6).map((t) => t.term).join(", ")}`);
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
