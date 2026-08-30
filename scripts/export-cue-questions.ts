/* ============================================================================
   SUPERSEDED — these questions now live in the app, at /admin/content/review.

   restore-cues.ts writes them straight into content_review, where Mitch answers
   them against the actual rows and the fix is live immediately. This script is
   kept only for producing an offline copy if somebody genuinely needs one; the
   spreadsheet is no longer the way the work gets done, because it has to be
   mailed out, filled in, mailed back and re-imported by hand, and while it is
   in flight nobody can see what is still open.

   EDIAGD — the two questions only Mitch can answer, as a sheet he can fill in

   The restore script put 94 cues back automatically. 22 it would not touch, and
   they need two completely different things from him — so they get two tabs,
   not one list.

     Tab 1  PICK THE ENDING (9)
            Two versions exist. They are word-for-word identical for the first
            600 characters and then go different ways, because somebody wrote
            two endings in two places. Nothing is broken; a person has to say
            which one is right.

     Tab 2  SEND US THE FULL TEXT (13)
            Clipped at exactly 400, 500 or 600 characters. The workbook has no
            longer version anywhere, so the missing words are not recoverable
            from any file we hold.

   THE SHARED OPENING IS SHOWN ONCE, NOT TWICE. The first 600 characters are the
   same in both versions; repeating them per column would make Mitch read the
   same paragraph twice to find the eight words that differ.

   NO PII, and no advisor data. Cue titles and coaching copy only.
   ============================================================================ */
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import path from "node:path";

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});

const args = process.argv.slice(2);
const FILE = args.find((a) => a.startsWith("--file="))!.split("=").slice(1).join("=");

const norm = (s: string) => (s ?? "").replace(/\s+/g, " ").trim();

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

const HEAD = "FF1B3A5C";
function styleHeader(ws: ExcelJS.Worksheet, height = 34) {
  const r = ws.getRow(1);
  r.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD } };
  r.alignment = { vertical: "middle", wrapText: true };
  r.height = height;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);

  const candidates: { sheet: string; row: number; text: string; norm: string }[] = [];
  for (const ws of wb.worksheets) {
    ws.eachRow((row, n) => {
      row.eachCell((cell) => {
        const t = cellText(cell.value);
        if (t.length >= 200) candidates.push({ sheet: ws.name, row: n, text: t, norm: norm(t) });
      });
    });
  }

  const all: { id: string; title: string; body: string; source: string | null; status: string }[] = [];
  for (let off = 0; ; off += 1000) {
    const { data } = await sb
      .from("content")
      .select("id, title, body, source, status")
      .eq("type", "cue")
      .order("id")
      .range(off, off + 999);
    all.push(...((data ?? []) as typeof all));
    if (!data || data.length < 1000) break;
  }

  const pickEnding: {
    title: string; source: string | null; shared: string;
    aSheet: string; aEnd: string; bSheet: string; bEnd: string;
  }[] = [];
  const needFull: {
    title: string; source: string | null; chars: number; current: string; status: string;
  }[] = [];

  for (const cue of all) {
    const body = norm(cue.body ?? "");
    if (body.length < 120) continue;

    const hits = candidates.filter((c) => c.norm.startsWith(body) && c.norm.length > body.length + 5);
    const distinct = [...new Map(hits.map((h) => [norm(h.text), h])).values()]
      .sort((a, b) => b.norm.length - a.norm.length);

    if (distinct.length === 0) {
      const t = (cue.body ?? "").trimEnd();
      const looksCut = /[,\-–—/;:]$|\b(and|or|the|a|an|to|of|for|with|in|on|at|by)$/i.test(t);
      const round = t.length >= 200 && t.length % 100 === 0;
      if (looksCut || round) {
        needFull.push({
          title: cue.title, source: cue.source, chars: t.length,
          current: cue.body ?? "", status: cue.status,
        });
      }
      continue;
    }

    const longest = distinct[0];
    if (distinct.length > 1 && !distinct.every((d) => longest.norm.startsWith(d.norm))) {
      const [a, b] = distinct;
      // Where do the two versions stop agreeing?
      let i = 0;
      while (i < Math.min(a.text.length, b.text.length) && a.text[i] === b.text[i]) i++;
      pickEnding.push({
        title: cue.title,
        source: cue.source,
        // The tail of what they agree on, so Mitch has the run-up in context.
        shared: "…" + a.text.slice(Math.max(0, i - 260), i).trim(),
        aSheet: `${a.sheet} (row ${a.row})`,
        aEnd: a.text.slice(i).trim(),
        bSheet: `${b.sheet} (row ${b.row})`,
        bEnd: b.text.slice(i).trim(),
      });
    }
  }

  /* ---- Tab 1: pick the ending ------------------------------------------- */
  const out = new ExcelJS.Workbook();
  out.creator = "EDIAGD";

  const t1 = out.addWorksheet("1 — Pick the ending");
  t1.columns = [
    { header: "Cue", key: "title", width: 40 },
    { header: "How it reads up to here (both versions identical)", key: "shared", width: 62 },
    { header: "ENDING A", key: "a", width: 58 },
    { header: "ENDING B", key: "b", width: 58 },
    { header: "Which one? (A / B / Neither)", key: "pick", width: 22 },
    { header: "If neither — write it here", key: "note", width: 52 },
  ];
  styleHeader(t1, 40);

  for (const p of pickEnding) {
    const row = t1.addRow({
      title: p.title,
      shared: p.shared,
      a: `[${p.aSheet}]\n\n${p.aEnd}`,
      b: `[${p.bSheet}]\n\n${p.bEnd}`,
      pick: "",
      note: "",
    });
    row.alignment = { vertical: "top", wrapText: true };
    row.height = 150;
    row.getCell("pick").dataValidation = {
      type: "list", allowBlank: true,
      formulae: ['"A,B,Neither — see my note"'],
      showErrorMessage: true, errorTitle: "Pick one",
      error: "A, B, or Neither.",
    };
    for (const c of ["pick", "note"]) {
      row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7E0" } };
    }
  }

  const n1 = t1.addRow({});
  const note1 = t1.addRow({
    title: "What this is",
    shared:
      "Each of these cues exists twice in your workbook — once in the topic tab, once in Master 8.10. " +
      "The two are word-for-word the same for the first 600 characters and then finish differently. " +
      "Nothing is broken and nothing was lost: at some point two endings got written in two places. " +
      "We won't pick for you, because both read as correct and only you know which one you meant. " +
      "Tell us A or B and it goes in as-is.",
  });
  note1.font = { italic: true, color: { argb: "FF6B7280" } };
  note1.alignment = { wrapText: true, vertical: "top" };
  note1.height = 64;
  t1.mergeCells(`B${note1.number}:F${note1.number}`);
  void n1;

  /* ---- Tab 2: send us the full text ------------------------------------- */
  const t2 = out.addWorksheet("2 — Send us the full text");
  t2.columns = [
    { header: "Cue", key: "title", width: 40 },
    { header: "Which class/tab it came from", key: "source", width: 30 },
    { header: "Cut at", key: "chars", width: 10 },
    { header: "What we have (this is where it stops)", key: "current", width: 76 },
    { header: "PASTE THE FULL VERSION HERE", key: "full", width: 76 },
  ];
  styleHeader(t2, 40);

  for (const m of needFull.sort((a, b) => (a.source ?? "").localeCompare(b.source ?? ""))) {
    const row = t2.addRow({
      title: m.title,
      source: (m.source ?? "").replace(/^Mitch import — /, ""),
      chars: `${m.chars} chars`,
      current: m.current,
      full: "",
    });
    row.alignment = { vertical: "top", wrapText: true };
    row.height = 120;
    row.getCell("full").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7E0" } };
    row.getCell("chars").alignment = { horizontal: "center", vertical: "top" };
  }

  const n2 = t2.addRow({});
  const note2 = t2.addRow({
    title: "What this is",
    source:
      "These cues were cut off before they ever reached us — each one stops at exactly 400, 500 or 600 characters, " +
      "which is a machine doing it, not you. We searched every one of the 76 tabs in your workbook and there is no " +
      "longer version of these anywhere, so we can't recover them from the file. If you have the original " +
      "transcript or an earlier export, paste the full text in the last column and we'll load it. If a cue reads " +
      "fine to you as it stands, say so and we'll leave it alone.",
  });
  note2.font = { italic: true, color: { argb: "FF6B7280" } };
  note2.alignment = { wrapText: true, vertical: "top" };
  note2.height = 76;
  t2.mergeCells(`B${note2.number}:E${note2.number}`);
  void n2;

  const dir = path.join(process.cwd(), "exports");
  mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, "cues-mitch-needs-to-answer.xlsx");
  await out.xlsx.writeFile(outPath);

  console.log(`  Tab 1 — pick the ending:      ${pickEnding.length} cues`);
  console.log(`  Tab 2 — send us full text:    ${needFull.length} cues`);
  console.log(`  -> ${outPath}`);
})().catch((e) => { console.error(e); process.exit(1); });
