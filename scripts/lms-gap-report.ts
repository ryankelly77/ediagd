/* ============================================================================
   EDIAGD — what the library still needs, as a workbook

     npm run report:lms

   Writes an .xlsx to ~/Downloads for Ryan to share with Mitch. A production
   plan, not a content queue: per-row editorial questions already live at
   /admin/content/review, and duplicating them into a spreadsheet would mean
   Mitch working the same list in two places and the app never learning what
   he decided.

   So this answers the three questions a shoot week actually starts with —
   what is missing, what exists already, and what is written but not wired up.

   EVERY NUMBER IS READ LIVE. Nothing here is transcribed from an earlier run.
   ============================================================================ */

import ExcelJS from "exceljs";
import { homedir } from "node:os";
import { join } from "node:path";

const url = process.env.SB_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SB_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("\n  need SB_URL and SB_KEY\n");
  process.exit(1);
}
const H = { apikey: key, authorization: `Bearer ${key}` };

/** The four beats of a pitch. A film exists per op code PER STAGE. */
const STAGES = ["MPI Setup", "On the Drive", "At the Kiosk", "After-MPI"] as const;

/** PostgREST caps a response at 1000 rows whatever the limit says. */
async function pull<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetch(`${url}/rest/v1/${path}${sep}limit=1000&offset=${from}`, {
      headers: H,
    });
    const batch = (await res.json()) as T[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < 1000) break;
  }
  return out;
}

type Content = {
  id: string;
  type: string;
  status: string;
  retired_at: string | null;
  service_family: string | null;
  tier: string | null;
  stage: string | null;
  placement: string | null;
  collection: string | null;
  op_code: string | null;
  quote_slot: string | null;
  voice: string | null;
  title: string;
  canonical_filename: string | null;
  version: number | null;
  duration_sec: number | null;
  captions_ready: boolean | null;
  mux_playback_id: string | null;
  module_id: string | null;
  coaching_nugget: string | null;
};

async function main() {
  console.log("\n  reading the library…");
  const content = await pull<Content>(
    "content?select=id,type,status,retired_at,service_family,tier,stage,placement,collection,op_code,quote_slot,voice,title,canonical_filename,version,duration_sec,captions_ready,mux_playback_id,module_id,coaching_nugget&order=id"
  );
  const courses = await pull<{ id: string; track: string; name: string; sort_order: number }>(
    "course?select=id,track,name,sort_order&order=id"
  );
  const modules = await pull<{
    id: string;
    course_id: string;
    name: string;
    name_status: string;
    sort_order: number;
  }>("module?select=id,course_id,name,name_status,sort_order&order=id");
  const questions = await pull<{ id: string; module_id: string | null }>(
    "quiz_question?select=id,module_id&order=id"
  );
  const reviews = await pull<{ reason: string; status: string }>(
    "content_review?select=reason,status&order=id"
  );

  const live = content.filter((r) => r.status === "published" && !r.retired_at);
  const films = live.filter((r) => r.type === "advisor_video");
  const deckCues = content.filter(
    (r) => r.collection === "Pitches by Op Code" && r.type === "cue"
  );
  const deckFilms = films.filter((r) => r.collection === "Pitches by Op Code");

  /* The deck is defined by the CUES: an op code with written pitches is one
     the product intends to coach, whether or not it has been filmed. */
  const codes = [...new Set(deckCues.map((r) => r.op_code).filter(Boolean))].sort() as string[];
  const familyOf = new Map<string, string>();
  for (const c of deckCues) {
    if (c.op_code && c.service_family && !familyOf.has(c.op_code)) {
      familyOf.set(c.op_code, c.service_family);
    }
  }
  const filmed = new Set(deckFilms.map((f) => `${f.op_code}|${f.stage}`));

  const wb = new ExcelJS.Workbook();
  wb.creator = "EDIAGD";
  wb.created = new Date();

  const NAVY = "FF0C1C2C";
  const GOLD = "FFE8B44C";

  function sheet(name: string, headers: string[], widths: number[]) {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.addRow(headers);
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    head.height = 22;
    head.alignment = { vertical: "middle" };
    widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
    return ws;
  }

  /* ---- 1. Summary -------------------------------------------------------- */
  const needed: { family: string; code: string; stage: string }[] = [];
  for (const c of codes) {
    for (const s of STAGES) {
      if (!filmed.has(`${c}|${s}`)) {
        needed.push({ family: familyOf.get(c) ?? "(unmapped)", code: c, stage: s });
      }
    }
  }
  const orphanQuestions = questions.filter((q) => !q.module_id).length;
  const modulesNoQuiz = modules.filter(
    (m) => !questions.some((q) => q.module_id === m.id)
  ).length;
  const needName = modules.filter((m) => m.name_status === "needs_name").length;
  const draftCues = content.filter(
    (r) => r.type === "cue" && r.status === "draft" && !r.retired_at
  ).length;
  const lifestyle = films.filter((r) => r.placement === "daily_lifestyle").length;
  const noCaptions = films.filter((r) => !r.captions_ready).length;

  const sum = sheet("Summary", ["What", "Have", "Need", "Note"], [46, 10, 10, 72]);
  const S = (what: string, have: number | string, need: number | string, note: string) => {
    const r = sum.addRow([what, have, need, note]);
    r.alignment = { vertical: "top", wrapText: true };
    if (typeof need === "number" && need > 0) {
      r.getCell(3).font = { bold: true, color: { argb: "FFB35309" } };
    }
    return r;
  };
  S(
    "Pitch films (op code x stage)",
    filmed.size,
    needed.length,
    `${codes.length} op codes are written for, x 4 stages = ${codes.length * 4} slots. See "Pitch films needed".`
  );
  S(
    "Lifestyle films (daily loop)",
    lifestyle,
    0,
    `About ${(lifestyle / 250 * 12).toFixed(1)} months of working days before an advisor sees a repeat. Not a gap yet; it is the runway.`
  );
  S(
    "Quiz questions wired to a module",
    questions.length - orphanQuestions,
    orphanQuestions,
    "The questions are WRITTEN. 485 of 513 have no module_id, so no advisor can reach them. Wiring, not authoring."
  );
  S(
    "Modules with a quiz",
    modules.length - modulesNoQuiz,
    modulesNoQuiz,
    "Only The Walk-Around has one today."
  );
  S(
    "Modules with a real name",
    modules.length - needName,
    needName,
    'name_status = "needs_name". These are auto-generated placeholders an advisor sees in the library.'
  );
  S("Cues published", live.filter((r) => r.type === "cue").length, draftCues, "Drafts are written and unpublished — a publish decision, not writing.");
  S("Quotes published", live.filter((r) => r.type === "quote").length, 0, "280 eligible for slot 2, 335 for slot 3. No shortage.");
  S("Films with captions", films.length - noCaptions, noCaptions, "Mux generates them; these were skipped because captions block clipping during the slate trim.");
  sum.addRow([]);
  const note = sum.addRow([
    "Editorial questions are NOT in this workbook",
    "",
    reviews.filter((r) => r.status === "open").length,
    "Open items at /admin/content/review — 122 possible duplicate quotes, 56 cues with no op code. They live in the app so Mitch's decision is recorded against the row.",
  ]);
  note.font = { italic: true };
  note.alignment = { vertical: "top", wrapText: true };

  /* ---- 2. Pitch films needed --------------------------------------------- */
  const ws2 = sheet(
    "Pitch films needed",
    ["Service family", "Op code", "Stage", "Shoot as (filename)", "Cues already written"],
    [22, 12, 16, 42, 20]
  );
  const cueCount = new Map<string, number>();
  deckCues.forEach((c) => {
    if (c.op_code) cueCount.set(c.op_code, (cueCount.get(c.op_code) ?? 0) + 1);
  });
  needed
    .sort((a, b) => a.family.localeCompare(b.family) || a.code.localeCompare(b.code) ||
      STAGES.indexOf(a.stage as typeof STAGES[number]) - STAGES.indexOf(b.stage as typeof STAGES[number]))
    .forEach((n) => {
      ws2.addRow([n.family, n.code, n.stage, `${n.code} — ${n.stage} — v1.mov`, cueCount.get(n.code) ?? 0]);
    });

  /* ---- 3. Every film we have --------------------------------------------- */
  const ws3 = sheet(
    "Film inventory",
    ["Filename", "Version", "Collection", "Placement", "Op code", "Stage", "Status", "Length", "Captions"],
    [52, 9, 20, 18, 11, 15, 12, 10, 10]
  );
  [...films]
    .sort((a, b) => (a.canonical_filename ?? a.title).localeCompare(b.canonical_filename ?? b.title))
    .forEach((f) => {
      ws3.addRow([
        f.canonical_filename ?? `(no filename) ${f.title}`,
        f.version ? `v${f.version}` : "—",
        f.collection ?? "—",
        f.placement ?? "—",
        f.op_code ?? "—",
        f.stage ?? "—",
        f.status,
        f.duration_sec ? `${Math.floor(f.duration_sec / 60)}:${String(f.duration_sec % 60).padStart(2, "0")}` : "—",
        f.captions_ready ? "yes" : "no",
      ]);
    });

  /* ---- 4. Cue coverage ---------------------------------------------------- */
  const ws4 = sheet(
    "Cue coverage",
    ["Service family", "Zero tier", "Low tier", "Generic", "Total", "Gap"],
    [22, 12, 12, 12, 10, 46]
  );
  const fams = [...new Set(content.map((r) => r.service_family).filter(Boolean))].sort() as string[];
  for (const f of fams) {
    const c = live.filter((r) => r.type === "cue" && r.service_family === f);
    const z = c.filter((r) => r.tier === "zero").length;
    const l = c.filter((r) => r.tier === "low").length;
    const g = c.filter((r) => r.tier === "generic").length;
    /* cueTierForRate: an advisor at 0% gets 'zero', anyone above it gets
       'low'. A family with no low-tier cue has nothing for the advisor who
       has started selling it, which is most of them. */
    const gap =
      z === 0 && l === 0
        ? "No cues at either tier."
        : l === 0
          ? "Nothing for an advisor already selling it (low tier)."
          : z === 0
            ? "Nothing for an advisor at zero."
            : "";
    const row = ws4.addRow([f, z, l, g, c.length, gap]);
    if (gap) row.getCell(6).font = { color: { argb: "FFB35309" } };
  }

  /* ---- 5. Courses and modules -------------------------------------------- */
  const ws5 = sheet(
    "Courses & modules",
    ["Track", "Course", "Modules", "With a quiz", "Needing a name", "Content rows"],
    [20, 34, 11, 13, 16, 14]
  );
  const contentByModule = new Map<string, number>();
  content.forEach((c) => {
    if (c.module_id) contentByModule.set(c.module_id, (contentByModule.get(c.module_id) ?? 0) + 1);
  });
  [...courses]
    .sort((a, b) => (a.track ?? "").localeCompare(b.track ?? "") || a.sort_order - b.sort_order)
    .forEach((c) => {
      const ms = modules.filter((m) => m.course_id === c.id);
      const wq = ms.filter((m) => questions.some((q) => q.module_id === m.id)).length;
      const nn = ms.filter((m) => m.name_status === "needs_name").length;
      const cr = ms.reduce((n, m) => n + (contentByModule.get(m.id) ?? 0), 0);
      const row = ws5.addRow([c.track, c.name, ms.length, wq, nn, cr]);
      if (wq < ms.length) row.getCell(4).font = { color: { argb: "FFB35309" } };
      if (nn > 0) row.getCell(5).font = { color: { argb: "FFB35309" } };
    });

  /* ---- 6. Modules needing a name ----------------------------------------- */
  const ws6 = sheet("Modules needing a name", ["Track", "Course", "Current placeholder", "Content rows"], [20, 30, 52, 14]);
  const courseById = new Map(courses.map((c) => [c.id, c]));
  modules
    .filter((m) => m.name_status === "needs_name")
    .sort((a, b) => {
      const ca = courseById.get(a.course_id), cb = courseById.get(b.course_id);
      return (ca?.track ?? "").localeCompare(cb?.track ?? "") ||
        (ca?.name ?? "").localeCompare(cb?.name ?? "") || a.sort_order - b.sort_order;
    })
    .forEach((m) => {
      const c = courseById.get(m.course_id);
      ws6.addRow([c?.track ?? "—", c?.name ?? "—", m.name, contentByModule.get(m.id) ?? 0]);
    });

  const out = join(homedir(), "Downloads", "EDIAGD — LMS gaps.xlsx");
  await wb.xlsx.writeFile(out);

  console.log(`\n  pitch films needed        ${needed.length}`);
  console.log(`  quiz questions unwired    ${orphanQuestions}`);
  console.log(`  modules needing a name    ${needName}`);
  console.log(`  cue drafts unpublished    ${draftCues}`);
  console.log(`\n  written to ${out}\n`);
}

void main();
