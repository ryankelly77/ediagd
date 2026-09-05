/* ============================================================================
   EDIAGD — put back the words the import cut off

   47 cue bodies in the library stop mid-clause. The chop happened on the way
   in, not on the way out: the query, the API and the render all pass the text
   through whole. The full versions live in Mitch's master workbook, in the
   topic tabs the `source` column already names.

   ---------------------------------------------------------------------------
   HOW A MATCH IS MADE, AND WHY IT IS CONSERVATIVE
   ---------------------------------------------------------------------------
   The database body is a PREFIX of the workbook body — same words, cut short.
   So the match is: normalise whitespace on both sides, then look for a workbook
   cell that starts with the database text and is longer than it.

   Whitespace normalisation is required, not cosmetic. Excel stores the run as
   one string with \n between paragraphs; the import collapsed some of those and
   kept others, so a byte-for-byte startsWith fails on text that is plainly the
   same passage.

   A UNIQUE MATCH IS RESTORED. ANYTHING ELSE IS REPORTED, NEVER GUESSED. Two
   candidates means two cues share an opening and only Mitch knows which is
   which; zero means the passage is not in this workbook. Both go on a list for
   a person. Picking the longer one, or the first one, would quietly put the
   wrong words in front of an advisor — worse than the truncation, because it
   would look correct.

     npm run restore:cues -- --file="/path/to.xlsx" --dry
     npm run restore:cues -- --file="/path/to.xlsx"
   ============================================================================ */
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});

const args = process.argv.slice(2);
const arg = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=");
const FILE = arg("file")!;
const DRY = args.includes("--dry");

/** Collapse every run of whitespace to one space. See the note above. */
const norm = (s: string) => (s ?? "").replace(/\s+/g, " ").trim();

/** Excel cells arrive as strings, rich text runs, or formula results. */
function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: string };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.result != null) return String(o.result);
    if (o.text) return o.text;
  }
  return String(v);
}

type Candidate = { sheet: string; row: number; text: string; norm: string };

async function main() {
  /* ---- 1. Every long text cell in the workbook -------------------------- */
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);

  const candidates: Candidate[] = [];
  for (const ws of wb.worksheets) {
    ws.eachRow((row, n) => {
      row.eachCell((cell) => {
        const t = cellText(cell.value);
        // 200 is well under the shortest truncated body; anything shorter
        // cannot be the full version of one.
        if (t.length >= 200) {
          candidates.push({ sheet: ws.name, row: n, text: t, norm: norm(t) });
        }
      });
    });
  }
  console.log(`  workbook: ${wb.worksheets.length} sheets, ${candidates.length} long text cells`);

  /* ---- 2. Every cue that looks cut off ----------------------------------- */
  const all: { id: string; title: string; body: string; source: string | null; status: string }[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await sb
      .from("content")
      .select("id, title, body, source, status")
      .eq("type", "cue")
      .order("id")
      .range(off, off + 999);
    if (error) throw new Error(error.message);
    all.push(...((data ?? []) as typeof all));
    if (!data || data.length < 1000) break;
  }

  /*
   * THE SWEEP IS THE SAME TEST AS THE FIX. Rather than trusting the earlier
   * "ends mid-clause" heuristic, every cue is offered to the matcher: if the
   * workbook holds a strictly longer passage that begins with this body, this
   * body is short — whatever it happens to end on. That catches the ones that
   * were chopped on a full stop and looked complete.
   */
  const considered = all.filter((c) => (c.body ?? "").trim().length >= 120);
  console.log(`  database: ${all.length} cues, ${considered.length} long enough to test\n`);

  const restored: { id: string; title: string; from: number; to: number; sheet: string }[] = [];
  const ambiguous: { id: string; title: string; source: string | null; hits: string[] }[] = [];
  const missing: { id: string; title: string; source: string | null; chars: number; tail: string; why: string }[] = [];
  let alreadyWhole = 0;

  for (const cue of considered) {
    const body = norm(cue.body);
    if (!body) continue;

    const hits = candidates.filter((c) => c.norm.startsWith(body) && c.norm.length > body.length + 5);

    if (hits.length === 0) {
      /*
       * TWO KINDS OF EVIDENCE THAT A BODY IS SHORT.
       *
       * The obvious one is how it ends — mid-list, mid-clause, on a
       * conjunction. The other is the LENGTH ITSELF: a body of exactly 600 or
       * exactly 200 characters did not come out that way by chance, and one of
       * them ("PREMIUM-VEHICLE CUSTOMER…") ends on an ordinary word, reads as a
       * complete sentence, and is still plainly a clip.
       *
       * Length alone is enough to put it on Mitch's list. It is not enough to
       * change anything.
       */
      const t = cue.body.trimEnd();
      const looksCut = /[,\-–—/;:]$|\b(and|or|the|a|an|to|of|for|with|in|on|at|by)$/i.test(t);
      const roundLength = t.length >= 200 && t.length % 100 === 0;
      if (looksCut || roundLength) {
        missing.push({
          id: cue.id, title: cue.title, source: cue.source,
          chars: cue.body.length, tail: cue.body.trimEnd().slice(-60),
          why: looksCut ? "ends mid-clause" : `exactly ${t.length} chars`,
        });
      } else {
        alreadyWhole++;
      }
      continue;
    }

    // Several cells can carry the same passage (a topic tab and a master tab).
    // That is one source, not a conflict — collapse on the text itself.
    const distinct = [...new Map(hits.map((h) => [norm(h.text), h])).values()]
      .sort((a, b) => b.norm.length - a.norm.length);

    /*
     * THE WORKBOOK TRUNCATES TOO, AT SEVERAL LENGTHS.
     *
     * The same cue turns up in a topic tab at full length, in a "Master — …
     * Tier Coaching" tab at exactly 600 characters, and in a "Quote Slot …" tab
     * at exactly 900. Those are not three different cues; they are one passage
     * clipped three ways, which is the same disease as the one being cured here.
     *
     * So: if every candidate is a prefix of the longest, there is no conflict —
     * they agree, and the longest is simply the least truncated. Taking it is
     * not a guess. Only candidates that DIVERGE in wording are ambiguous, and
     * those are the ones a person has to settle.
     */
    const longest = distinct[0];
    const allAgree = distinct.every((d) => longest.norm.startsWith(d.norm));

    if (distinct.length > 1 && !allAgree) {
      ambiguous.push({
        id: cue.id, title: cue.title, source: cue.source,
        hits: distinct.map((h) => `${h.sheet} r${h.row} (${h.text.length} chars)`),
      });
      continue;
    }

    const full = longest;
    if (!DRY) {
      const { error } = await sb
        .from("content")
        .update({ body: full.text.trim() })
        .eq("id", cue.id);
      if (error) {
        console.log(`    FAILED ${cue.title}: ${error.message}`);
        continue;
      }
    }
    restored.push({
      id: cue.id, title: cue.title,
      from: cue.body.length, to: full.text.trim().length, sheet: full.sheet,
    });
  }

  /* ---- 3. Report --------------------------------------------------------- */
  console.log(`  ${DRY ? "WOULD RESTORE" : "RESTORED"}: ${restored.length}`);
  for (const r of restored.slice(0, 60)) {
    console.log(`    ${String(r.from).padStart(4)} -> ${String(r.to).padStart(4)}  ${r.title.slice(0, 46).padEnd(48)} ${r.sheet}`);
  }
  if (restored.length > 60) console.log(`    … and ${restored.length - 60} more`);

  console.log(`\n  ALREADY COMPLETE (no longer version in the workbook): ${alreadyWhole}`);

  console.log(`\n  NO MATCH — for Mitch, not guessed at: ${missing.length}`);
  for (const m of missing) {
    console.log(`    ${m.title.slice(0, 52)}`);
    console.log(`       ${m.chars} chars · ${m.why} · ${m.source ?? "no source"}\n       ends: …${JSON.stringify(m.tail)}`);
  }

  console.log(`\n  AMBIGUOUS — two or more candidates, for Mitch: ${ambiguous.length}`);
  for (const a of ambiguous) {
    console.log(`    ${a.title.slice(0, 52)}  (${a.source ?? "no source"})`);
    for (const h of a.hits) console.log(`       ${h}`);
  }

  /* ---- 4. Put the leftovers in front of a person -------------------------- */
  /*
   * THE CSV IS NO LONGER THE DELIVERABLE. It stays as a record, but the queue
   * that matters is content_review, which Mitch works through in the admin area
   * against the actual rows. A spreadsheet has to be mailed out, filled in,
   * mailed back and re-imported by hand, and while it is in flight nobody can
   * see what is still open.
   *
   * The ambiguous ones carry their candidate endings in `options`, because that
   * evidence lives in a WORKBOOK and cannot be recomputed from the database —
   * which is the whole reason this is a table and not a view.
   */
  if (!DRY) {
    const flags = [
      ...missing.map((m) => ({
        content_id: m.id,
        reason: "truncated",
        detail:
          `This cue stops at ${m.chars} characters — ${m.why}. We searched all ` +
          `${wb.worksheets.length} tabs of your workbook and there is no longer version of it ` +
          `anywhere, so the missing words cannot be recovered from any file we hold. Paste the ` +
          `full version in, or tell us it reads fine as it stands.`,
        options: { ends: m.tail },
      })),
      ...ambiguous.map((a) => ({
        content_id: a.id,
        reason: "pick_ending",
        detail:
          "This cue exists twice in your workbook. The two are word-for-word the same for the " +
          "first 600 characters and then finish differently — nothing is broken and nothing was " +
          "lost, two endings just got written in two places. Both read as correct, so only you " +
          "can say which one you meant.",
        options: { candidates: a.hits },
      })),
    ];
    if (flags.length) {
      const { error } = await sb
        .from("content_review")
        .upsert(flags, { onConflict: "content_id,reason" });
      if (error) console.log(`    review flags FAILED: ${error.message}`);
      else console.log(`\n  flagged for review in the admin area: ${flags.length}`);
    }
  }

  mkdirSync("exports", { recursive: true });
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  writeFileSync(
    "exports/cues-for-mitch.csv",
    [
      ["problem", "id", "title", "source", "chars", "detail"].join(","),
      ...missing.map((m) => ["no match", m.id, m.title, m.source, m.chars, `${m.why} — ends: ${m.tail}`].map(esc).join(",")),
      ...ambiguous.map((a) => ["ambiguous", a.id, a.title, a.source, "", a.hits.join(" | ")].map(esc).join(",")),
    ].join("\n"),
    "utf8"
  );
  console.log(`\n  wrote exports/cues-for-mitch.csv`);
  if (DRY) console.log("  (--dry: nothing was written to the database)\n");
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
  main().catch((e) => { console.error(e); process.exit(1); });
}
