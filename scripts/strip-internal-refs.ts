/* ============================================================================
   EDIAGD — take Mitch's notes-to-himself off the advisor's screen

     npm run strip:refs                  # report, change nothing
     npm run strip:refs -- --apply

   ---------------------------------------------------------------------------
   WHAT THESE ARE
   ---------------------------------------------------------------------------
   Mitch builds a cue by carrying a fact across from somewhere else in his
   master workbook, and he writes down where it came from so HE can find it
   again:

     Strategy 6: The Brake Fluid Still Required Conversation
     (preserved from Service Knowledge — Brake Fluid R12).

     **THE 8-FOOT / 13-FOOT STOPPING DISTANCE STAT**
     (Mitch's anchor stat from existing Brakes R9 Strong nugget). Independent…

   That parenthetical is a bookmark into a spreadsheet the advisor has never
   seen and cannot open. It sits in `title`, which the daily loop renders at the
   top of the coaching card, so an advisor reading their one cue for the day
   reads a row reference first. Ryan's ruling: "advisors don't need to read
   that."

   28 occurrences, 16 of them published.

   ---------------------------------------------------------------------------
   IT REMOVES A BOOKMARK, NOT A SENTENCE
   ---------------------------------------------------------------------------
   The pattern is deliberately narrow: a parenthetical that opens with
   "preserved from" or "from existing", or names a source tab and an R-number.
   A parenthetical Mitch wrote for the ADVISOR — "(PN 0618, 64 oz, Amber)",
   "(vs 50-60% on traditional drain-and-fill)" — does not match and is not
   touched. Anything the pattern is unsure of stays.

   Removing text from the middle of a sentence leaves debris — " ." where the
   parenthetical used to sit, or a double space. Those get tidied, and the
   tidying is shown in the dry run beside the original so the result can be read
   as a sentence before it is written.

   ---------------------------------------------------------------------------
   REVERSIBLE
   ---------------------------------------------------------------------------
   Every original is written to backups/ before anything is patched, keyed by
   id and field, so a bad call here is one script away from being undone.
   ============================================================================ */

import { writeFileSync, mkdirSync } from "node:fs";

/**
 * A provenance bookmark, and nothing else.
 *
 * Anchored on the phrasing Mitch actually uses. The trailing [^)]* cannot cross
 * a closing paren, so a nested "(PN 0618)" inside a longer note will not let
 * the match run away to the end of the paragraph.
 */
const REF =
  /\s*\((?:[^()]*?\b(?:preserved from|from existing)\b[^()]*?|[^()]*?\b(?:Service Knowledge|Product Knowledge|Success Cycle Speech|Fluid Exchanges|Engine & Perf)\b[^()]*?\bR\d+[^()]*?)\)/gi;

/** Fields an advisor can actually read. */
const FIELDS = ["title", "body", "coaching_nugget"] as const;

const APPLY = process.argv.slice(2).includes("--apply");

const url = process.env.SB_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SB_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("\n  need SB_URL and SB_KEY\n");
  process.exit(1);
}
const H = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };

type Row = Record<string, string | null> & { id: string; type: string; status: string };

/**
 * Close the gap the bookmark left.
 *
 * Order matters: strip first, then pull punctuation back onto the word before
 * it, then collapse the doubled space that a mid-sentence removal leaves. The
 * last rule catches "FACT** ." -> "FACT**." which is the shape that appears
 * when the reference sat between a bolded heading and the sentence after it.
 */
function tidy(text: string): string {
  return text
    .replace(REF, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\.\s*\./g, ".")
    .trim();
}

async function main() {
  let all: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(
      `${url}/rest/v1/content?select=id,type,status,title,body,coaching_nugget&order=id&limit=1000&offset=${from}`,
      { headers: H }
    );
    const batch = (await res.json()) as Row[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    all = all.concat(batch);
    if (batch.length < 1000) break;
  }

  const edits: { id: string; field: string; before: string; after: string; status: string }[] = [];
  for (const r of all) {
    for (const f of FIELDS) {
      const v = r[f];
      if (!v) continue;
      REF.lastIndex = 0;
      if (!REF.test(v)) continue;
      const after = tidy(v);
      if (after !== v) edits.push({ id: r.id, field: f, before: v, after, status: r.status });
    }
  }

  console.log(`\n  ${edits.length} fields carry an internal reference`);
  console.log(`    published: ${edits.filter((e) => e.status === "published").length}`);
  console.log(`    draft    : ${edits.filter((e) => e.status !== "published").length}\n`);

  for (const e of edits) {
    /* Show the sentence around the change, not the whole paragraph. */
    const head = e.after.slice(0, 150);
    console.log(`  ── ${e.id} [${e.status}] .${e.field}`);
    console.log(`     was: ${JSON.stringify(e.before.slice(0, 150))}`);
    console.log(`     now: ${JSON.stringify(head)}`);
  }

  if (edits.length === 0) return;

  if (!APPLY) {
    console.log(`\n  --apply to write. Nothing changed.\n`);
    return;
  }

  mkdirSync("backups", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `backups/internal-refs-pre-strip-${stamp}.json`;
  writeFileSync(backup, JSON.stringify(edits, null, 1));
  console.log(`\n  originals saved to ${backup}`);

  /* One PATCH per row, not per field, so a row with two affected fields is a
     single write and cannot end up half-done. */
  const byRow = new Map<string, Record<string, string>>();
  for (const e of edits) {
    if (!byRow.has(e.id)) byRow.set(e.id, {});
    byRow.get(e.id)![e.field] = e.after;
  }

  let done = 0;
  const failed: { id: string; error: string }[] = [];
  for (const [id, patch] of byRow) {
    const res = await fetch(`${url}/rest/v1/content?id=eq.${id}`, {
      method: "PATCH",
      headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    });
    if (res.ok) done++;
    else failed.push({ id, error: `${res.status} ${(await res.text()).slice(0, 120)}` });
  }

  console.log(`\n  cleaned ${done} rows, failed ${failed.length}`);
  for (const x of failed) console.log(`    ${x.id}: ${x.error}`);
  console.log("");
}

void main();
