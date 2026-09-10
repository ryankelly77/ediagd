/* ============================================================================
   EDIAGD — take the librarian's voice out of the coaching

     npm run strip:nuggets
     npm run strip:nuggets -- --apply

   ---------------------------------------------------------------------------
   WHAT THESE ARE
   ---------------------------------------------------------------------------
   Under the Henry Ford quote of the day, an advisor reads:

     "Mitch's fourth founder anchor quote — the choice-before-the-day-starts
     pole, paired with the Wooden scoreboard quote (internal standard), the
     Lombardi individual commitment quote (commitment to the collective), and
     the Holtz win/loss quote (immune to external swings)."

   That is Mitch talking to himself about the SHAPE OF HIS COLLECTION. It is
   how a curator keeps four hundred quotes straight, and it is genuinely
   useful — to the curator. The advisor has never seen the Wooden quote, does
   not know there are four founder anchors, and cannot open the Goals & Goal
   Setting tab. Same class as the 42 provenance parentheticals Ryan already
   ruled on: "advisors don't need to read that."

   ---------------------------------------------------------------------------
   IT REMOVES WHOLE SENTENCES, WHICH IS A BIGGER KNIFE THAN LAST TIME
   ---------------------------------------------------------------------------
   The provenance strip cut parentheticals — a bracketed aside comes out and
   the sentence around it still stands. These are complete sentences, so this
   deletes rather than trims, and the thing that makes it safe is how cleanly
   they separate: across 34 rows it is almost always exactly ONE sentence of
   six to fifteen, and that sentence is a cross-reference and nothing else.
   "Pairs with Stay Good (Saban), Talent Fame Conceit (Wooden)." carries no
   coaching that survives its own removal.

   Anything where the curatorial clause is welded to real coaching is reported
   and left alone — see KEEPS below. A sentence that teaches something is not
   this script's to take, whatever else it also mentions.
   ============================================================================ */

/*
 * ---------------------------------------------------------------------------
 * WHY THIS ONLY TAKES PURE INDEX ENTRIES
 * ---------------------------------------------------------------------------
 * The first version of this used two signals — "does the sentence mention the
 * collection" and "is it long or second-person, so probably coaching". Run
 * against the Henry Ford nugget Ryan reported, it dropped the sentence
 * carrying the actual coaching ("the choice that gets made before the first
 * RO, before the first customer, before the first offer") and KEPT the one he
 * objected to ("Mitch's fourth founder anchor quote — the
 * choice-before-the-day-starts pole, paired with the Wooden scoreboard
 * quote…"), because that one is long and long looked like coaching.
 *
 * It is not. In this library the curatorial sentences are the LONG ones —
 * Mitch explaining to himself how four hundred quotes hang together. Length
 * is worse than useless as a proxy here; it is inverted.
 *
 * So the bar moved: a sentence goes only if it is a pure cross-reference and
 * nothing else. That means it opens with "Pairs with", it names other quotes,
 * and it never turns into an argument — no em-dash elaboration, no colon, no
 * second person. "Pairs with Stay Good (Saban), Talent Fame Conceit (Wooden)."
 * is an index entry and loses nothing by going.
 *
 * Everything else — including both sentences of the Ford one — is reported
 * for Mitch. Deciding which half of his own paragraph is coaching and which
 * is filing is an editorial judgement, and the first attempt at automating it
 * proved the point by getting the flagship case exactly backwards.
 */
const PURE_INDEX_ENTRY = /^Pairs? with\b[^—:]*\.$/i;

/** Mentions the collection at all — enough to flag, not enough to cut. */
const CURATORIAL: RegExp[] = [
  /\bpairs? with\b/i,
  /\banchor quote\b|\bfounder anchor\b/i,
  /\bthe [A-Z][a-z]+(?:'s)? (?:scoreboard|individual commitment|win\/loss) quote\b/i,
  /\bR\d{1,3}\b/,
  /\btab\b/i,
  /\bthe platform\b|\bwhy it's the quote\b/i,
];

/**
 * Rows where a person read the whole nugget and named the sentences to drop.
 *
 * The Henry Ford quote is the one Ryan reported, and it is the case the
 * pattern above deliberately will not touch: its curation is spread across
 * four sentences, one of which ("This is the same energy as Mitch's own
 * Success Is A Choice quote in the Goals & Goal Setting tab — the choice that
 * gets made before the first RO…") carries real coaching in its second half.
 *
 * DELETION ONLY, NEVER REWORDING. The tempting fix for sentence 9 is to keep
 * the good half and drop the tab reference, but that means writing a new
 * sentence in Mitch's voice, and inventing his words is a different act from
 * removing his filing notes. So the whole sentence goes and the flourish goes
 * with it. What is left is entirely his:
 *
 *     "The choice. Whether you think you can or you think you can't — both
 *      decisions create their own evidence. The advisor who walks onto the
 *      drive thinking 'today is going to be a great day for selling brake
 *      fluid' will sell brake fluid. …Both are right. Make the choice."
 *
 * Sentence numbers are 1-based, matching how they print in the dry run.
 */
const RULINGS: Record<string, number[]> = {
  // Henry Ford — "Whether you think that you can, or that you can't…"
  //   1  "Mitch's fourth founder anchor quote — …paired with the Wooden…"
  //   2  "Henry Ford names what comes BEFORE all three of those."  (dangles once 1 goes)
  //   9  "This is the same energy as Mitch's own Success Is A Choice quote in the … tab"
  //  10  "Ford said it earlier and broader."                        (refers to 9)
  "9f6e5db0-6dc9-4741-906b-93e1f04c3f3c": [1, 2, 9, 10],
};

const APPLY = process.argv.slice(2).includes("--apply");

const url = process.env.SB_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SB_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("\n  need SB_URL and SB_KEY\n");
  process.exit(1);
}
const H = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };

type Row = {
  id: string;
  voice: string | null;
  status: string;
  coaching_nugget: string | null;
};

/** Split on sentence ends, keeping the punctuation with its sentence. */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
}

function tidy(text: string): string {
  return text.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
}

async function main() {
  let all: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(
      `${url}/rest/v1/content?select=id,voice,status,coaching_nugget&type=eq.quote&order=id&limit=1000&offset=${from}`,
      { headers: H }
    );
    const batch = (await res.json()) as Row[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    all = all.concat(batch);
    if (batch.length < 1000) break;
  }

  const edits: { row: Row; before: string; after: string; dropped: string[] }[] = [];
  const keeps: { row: Row; sentence: string }[] = [];

  for (const r of all) {
    const nugget = r.coaching_nugget;
    if (!nugget) continue;

    const kept: string[] = [];
    const dropped: string[] = [];
    const ruled = RULINGS[r.id];
    const parts = sentences(nugget);
    for (let i = 0; i < parts.length; i++) {
      const s = parts[i]!;
      const trimmed = s.trim();
      /* A person's ruling on this row beats every pattern below it. */
      if (ruled && ruled.includes(i + 1)) {
        dropped.push(trimmed);
        continue;
      }
      if (PURE_INDEX_ENTRY.test(trimmed) && !/\byou\b|\byour\b/i.test(trimmed)) {
        dropped.push(trimmed);
        continue;
      }
      if (CURATORIAL.some((re) => re.test(trimmed))) keeps.push({ row: r, sentence: trimmed });
      kept.push(s);
    }
    if (dropped.length === 0) continue;

    const after = tidy(kept.join(" "));
    /* Never leave a quote with no coaching at all. If every sentence was an
       index entry, that is a row for a person to rewrite, not for this to
       empty out. */
    if (after.length < 40) {
      keeps.push({ row: r, sentence: "(whole nugget is curatorial — left for review)" });
      continue;
    }
    edits.push({ row: r, before: nugget, after, dropped });
  }

  console.log(`\n  ${all.length} quotes examined`);
  console.log(`  ${edits.length} nuggets lose a sentence  (${edits.filter((e) => e.row.status === "published").length} published)`);
  console.log(`  ${edits.reduce((n, e) => n + e.dropped.length, 0)} sentences removed in total`);
  console.log(`  ${keeps.length} left alone — the clause is welded to coaching\n`);

  for (const e of edits) {
    console.log(`  ── ${e.row.id} [${e.row.status}] ${e.row.voice ?? "—"}`);
    for (const d of e.dropped) console.log(`     DROP: ${d.slice(0, 150)}`);
    console.log(`     KEEP: ${e.after.slice(0, 150)}${e.after.length > 150 ? "…" : ""}`);
  }

  if (keeps.length) {
    console.log(`\n  LEFT ALONE:`);
    for (const k of keeps) console.log(`     ${k.row.voice ?? "—"}: ${k.sentence.slice(0, 140)}`);
  }

  if (!APPLY) {
    console.log(`\n  --apply to write. Nothing changed.\n`);
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `backups/quote-nuggets-pre-strip-${stamp}.json`;
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync("backups", { recursive: true });
  writeFileSync(
    backup,
    JSON.stringify(edits.map((e) => ({ id: e.row.id, coaching_nugget: e.before })), null, 1)
  );
  console.log(`\n  originals saved to ${backup}`);

  let done = 0;
  const failed: string[] = [];
  for (const e of edits) {
    const res = await fetch(`${url}/rest/v1/content?id=eq.${e.row.id}`, {
      method: "PATCH",
      headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify({ coaching_nugget: e.after }),
    });
    if (res.ok) done++;
    else failed.push(`${e.row.id}: ${res.status}`);
  }
  console.log(`\n  rewrote ${done}, failed ${failed.length}`);
  for (const f of failed) console.log(`    ${f}`);
  console.log("");
}

void main();
