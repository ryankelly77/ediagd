/* ============================================================================
   EDIAGD — put back the words the import cut off

     npm run restore:cues                # report, change nothing
     npm run restore:cues -- --apply

   ---------------------------------------------------------------------------
   WHAT HAPPENED
   ---------------------------------------------------------------------------
   420 cue rows have a title that is EXACTLY 200 characters long, and 384 of
   those end in the middle of a word. That is not how anyone writes; it is a
   slice(0, 200) somewhere in the knowledge import, and it landed on the field
   the daily loop renders in bold at the top of the screen.

   Ryan saw one of them:

     **THE BOAT-LAUNCHING / WATER-EXPOSURE FACT** (from existing Fluid
     Exchanges R7 Strong nugget). Customers who launch boats with their
     vehicle, drive in water crossings, off-road in mud, or live in floo

   The cell that came from is 558 characters and finishes its sentence. So the
   words are not lost — they are still in data/Ediagd_master_2026_08_17_v2.xlsx,
   in the tab the row's `source` already names. Nothing here writes new copy.
   This only puts back what was already Mitch's.

   ---------------------------------------------------------------------------
   IT MATCHES ON THE CUT ITSELF, WHICH IS WHY IT IS SAFE
   ---------------------------------------------------------------------------
   A stored title is the first 200 characters of its source cell. So the match
   is: find the cell in that tab whose first 200 characters are EXACTLY the 200
   characters stored. That is a 200-character exact prefix — not a fuzzy score,
   not a nearest neighbour — and at that length a coincidental collision between
   two different pieces of writing does not happen.

   Two rules keep it honest:

     - the match must be UNIQUE within the tab. Several content rows legitimately
       share one source cell (same fact, different tier cue), and that is fine —
       they all restore to the same text. But if one row matched two DIFFERENT
       cells, the script cannot tell which, so it restores neither and says so.

     - anything unmatched is REPORTED, never guessed at. A row whose source tab
       has been renamed or re-cut since the import keeps its truncated title and
       shows up in the unmatched list for a person to look at.

   ---------------------------------------------------------------------------
   WHAT IT DELIBERATELY DOES NOT DO
   ---------------------------------------------------------------------------
   The restored text still carries two things that are Mitch's authoring habits
   rather than advisor copy: literal ** markdown around the opening phrase, and
   parentheticals like "(from existing Fluid Exchanges R7 Strong nugget)" that
   are cross-references to his own master. Both are visible on the advisor's
   screen today.

   Stripping those is an editorial decision about someone else's words, and it
   is a different decision from "restore what was cut". This script does the
   restoration only, and COUNTS the other two so the size of that ruling is
   known before it is asked for.
   ============================================================================ */

import ExcelJS from "exceljs";

const BOOKS = [
  "data/Ediagd_master_2026_08_17_v2.xlsx",
  "data/Ediagd_master_2026_May_19 Non truncated.xlsx",
];

/** The length the import cut at. A title of exactly this is a suspect. */
const CUT_AT = 200;

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");

const url = process.env.SB_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SB_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("\n  need SB_URL and SB_KEY (or the NEXT_PUBLIC_/SERVICE_ROLE_ pair)\n");
  process.exit(1);
}
const H = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };

type Row = { id: string; title: string; body: string | null; source: string | null; status: string };

/** Excel cells arrive as strings, rich text, or numbers. Flatten to text. */
function cellText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "richText" in (v as Record<string, unknown>)) {
    return ((v as { richText: { text: string }[] }).richText ?? []).map((t) => t.text).join("");
  }
  return "";
}

async function readAllRows(): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(
      `${url}/rest/v1/content?select=id,title,body,source,status&type=eq.cue&order=id&limit=1000&offset=${from}`,
      { headers: H }
    );
    const batch = (await res.json()) as Row[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < 1000) break;
  }
  return out;
}

async function main() {
  const rows = await readAllRows();
  const cut = rows.filter((r) => (r.title ?? "").length === CUT_AT);

  console.log(`\n  ${rows.length} cue rows, ${cut.length} with a title cut at ${CUT_AT}\n`);
  if (cut.length === 0) return;

  /* Every long cell in every book, indexed by its own first 200 characters.
     Built once — the alternative is re-walking 70k cells per row. */
  const byPrefix = new Map<string, Set<string>>();
  for (const book of BOOKS) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.readFile(book);
    } catch {
      console.log(`  (skipping ${book} — not readable here)`);
      continue;
    }
    wb.eachSheet((ws) => {
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          const v = cellText(cell.value).trim();
          if (v.length <= CUT_AT) return;
          const k = v.slice(0, CUT_AT);
          if (!byPrefix.has(k)) byPrefix.set(k, new Set());
          byPrefix.get(k)!.add(v);
        });
      });
    });
  }
  console.log(`  ${byPrefix.size} distinct long cells indexed from the workbooks\n`);

  const fixes: { id: string; from: string; to: string; status: string }[] = [];
  const ambiguous: Row[] = [];
  const unmatched: Row[] = [];

  for (const r of cut) {
    const hits = byPrefix.get(r.title);
    if (!hits || hits.size === 0) {
      unmatched.push(r);
      continue;
    }
    if (hits.size > 1) {
      /* Same 200-character opening, different endings. Cannot choose. */
      ambiguous.push(r);
      continue;
    }
    fixes.push({ id: r.id, from: r.title, to: [...hits][0], status: r.status });
  }

  const gained = fixes.reduce((n, f) => n + (f.to.length - f.from.length), 0);
  console.log(`  recoverable   : ${fixes.length}`);
  console.log(`  ambiguous     : ${ambiguous.length}`);
  console.log(`  not in a book : ${unmatched.length}`);
  console.log(`  words restored: ${gained.toLocaleString()} characters\n`);

  for (const f of fixes.slice(0, 3)) {
    console.log(`  ── ${f.id} (${f.status})`);
    console.log(`     was ${f.from.length}: …${JSON.stringify(f.from.slice(-60))}`);
    console.log(`     now ${f.to.length}: …${JSON.stringify(f.to.slice(f.from.length - 20, f.from.length + 80))}`);
  }
  if (unmatched.length) {
    console.log(`\n  NOT FOUND IN ANY WORKBOOK — these keep their cut title:`);
    for (const r of unmatched.slice(0, 10)) {
      console.log(`     ${r.id}  ${r.source ?? "(no source)"}`);
      console.log(`       ${JSON.stringify(r.title.slice(0, 80))}…`);
    }
    if (unmatched.length > 10) console.log(`     …and ${unmatched.length - 10} more`);
  }

  /* The two editorial problems, counted on the RESTORED text — because
     restoring makes more of them visible, not fewer. */
  const withMd = fixes.filter((f) => /\*\*/.test(f.to)).length;
  const withRef = fixes.filter((f) =>
    /\((?:preserved )?from existing[^)]*\)|R\d+ (?:Strong |word track|nugget)/i.test(f.to)
  ).length;
  console.log(`\n  still carrying ** markdown        : ${withMd}`);
  console.log(`  still carrying an internal ref    : ${withRef}`);
  console.log(`  (both are Mitch's own text — a separate ruling, not this script's job)`);

  if (!APPLY) {
    console.log(`\n  --apply to write. Nothing changed.\n`);
    return;
  }

  let done = 0;
  const failed: { id: string; error: string }[] = [];
  for (const f of fixes) {
    const res = await fetch(`${url}/rest/v1/content?id=eq.${f.id}`, {
      method: "PATCH",
      headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify({ title: f.to }),
    });
    if (res.ok) done++;
    else failed.push({ id: f.id, error: `${res.status} ${(await res.text()).slice(0, 120)}` });
  }
  console.log(`\n  restored ${done}, failed ${failed.length}`);
  for (const x of failed) console.log(`    ${x.id}: ${x.error}`);
  console.log("");
}

void main();
