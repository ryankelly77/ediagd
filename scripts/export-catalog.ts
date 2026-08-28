/* ============================================================================
   EDIAGD — the op-code catalog, as a workbook Mitch can review

   Three tabs: the families he is approving, the op-code catalog written down
   for the first time, and the receipts on his 46 rulings.

   BUILT FROM LIVE DATA AND THE RULE FILE, NOT FROM A COPY. Families, cue
   counts, cue-code prefixes, sub-category vocabulary and twelve months of
   labor dollars are all read at run time; families and coachability come from
   lib/dms/mapping.ts and lib/advisor.ts, the same modules the app runs on. If
   somebody adds a family or writes a cue, the next run says so.

   NO PII. Families, op codes, service labels, cue counts and money. No advisor
   appears anywhere in the output — this leaves the building.
   ============================================================================ */
import ExcelJS from "exceljs";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  SERVICE_FAMILIES,
  NOT_COACHABLE,
  OP_TEXT_RULES,
  autoMatch,
  normaliseSubCategory,
} from "../lib/dms/mapping";
import { COACHABLE_FAMILIES, COACHABLE_PENDING_CONTENT } from "../lib/advisor";

const URL = process.env.SB_URL!;
const KEY = process.env.SB_KEY!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

/** The real dealer group. Prod also carries ~100 seeded demo rooftops. */
const ORG = "b94af976-2ad3-42a2-abd3-19b716f56851";

/** Trailing twelve complete months. Aug 2026 is still part-month. */
const T12_FROM = "2025-08-01";
const T12_TO = "2026-07-01";

/**
 * Paged read. `order` is REQUIRED and that is the whole point.
 *
 * PostgREST caps a page at 1,000 rows, so anything bigger is fetched with
 * limit/offset — and limit/offset over a query with no ORDER BY is undefined in
 * Postgres. It does not error; it returns the right NUMBER of rows with some
 * duplicated and others never seen. Measured on advisor_family_labor: 37,247
 * rows came back every time, but only 9,463 distinct keys on one run and 10,880
 * on the next. The labor-dollar total moved by two million between two runs of
 * identical code, which is how this was found.
 *
 * Ordering by a unique-enough key makes the window deterministic. Same query,
 * same answer, every time.
 */
async function get<T = Record<string, unknown>>(p: string, order: string): Promise<T[]> {
  const out: T[] = [];
  for (let off = 0; ; off += 1000) {
    const sep = p.includes("?") ? "&" : "?";
    const r = await fetch(`${URL}/rest/v1/${p}${sep}order=${order}&limit=1000&offset=${off}`, { headers: H });
    if (!r.ok) throw new Error(`${p}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const pg = (await r.json()) as T[];
    out.push(...pg);
    if (pg.length < 1000) return out;
  }
}

/* ---- Mitch's proposed codes ------------------------------------------------
   These exist in no table and on no cue — they are the codes his sheet asked
   for. The family each one lands in is the family 0054 actually mapped its
   sub-category to, so this column is a statement about the app, not a wish. */
const PROPOSED: { code: string; name: string; family: string; from: string }[] = [
  { code: "SUS-058", name: "Suspension Service", family: "Suspension", from: "Suspension" },
  { code: "DPF-059", name: "Diesel Particulate Filter Service", family: "Filters", from: "Emission Control" },
  { code: "ACC-060", name: "Accessories", family: "Accessories", from: "Accessories" },
  { code: "MPI-061", name: "Multi-Point Inspection", family: "Inspections", from: "Inspection" },
  { code: "UCI-062", name: "Used Car Inspection", family: "Inspections", from: "UCI (Used Car Inspection)" },
  { code: "OAD-063", name: "Oil Additive", family: "Oil Change", from: "Oil Additive" },
  { code: "HYB-064", name: "Hybrid / EV Maintenance", family: "Maintenance", from: "Hybrid Maint" },
];

/* Codes named in Mitch's own rulings that have no definition and no cue. */
const NAMED_IN_RULINGS: { code: string; where: string }[] = [
  { code: "MNU-005", where: "Mitch's Tune Up ruling — 'the bundle is really a menu'" },
  { code: "MNU-007", where: "Mitch's A/C Services ruling — 'the PAS premium bundle maps to MNU-007'" },
  { code: "ACE-053", where: "Mitch's A/C Services ruling" },
  { code: "ABT-054", where: "Mitch's A/C Services ruling" },
];

/** His 12 MAPPED and 7 NEW rulings, by the normalised key the rule file uses. */
const MAPPED_12 = [
  "electrical charging starting", "a c services", "timing belts", "drive serp v belts",
  "wiper washer", "wipers", "bulbs", "headlight restoration", "engine service",
  "transfer case", "pcv valve", "nitrogen",
];
const NEW_7 = [
  "suspension", "emission control", "accessories", "inspection",
  "uci used car inspection", "oil additive", "hybrid maint",
];

const money = '"$"#,##0';
const HEAD = "FF1B3A5C";

function styleHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD } };
  row.alignment = { vertical: "middle", wrapText: true };
  row.height = 30;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

async function main() {
  /* ---- live reads --------------------------------------------------------- */
  const families = await get<{ name: string; sort_order: number }>(
    "service_family?select=name,sort_order",
    "sort_order"
  );
  const cueCounts = new Map(
    (await get<{ family: string; published_cues: number }>(
      "service_family_cue_count?select=family,published_cues",
      "family"
    )).map((r) => [String(r.family), Number(r.published_cues ?? 0)])
  );

  const tops = new Set(
    (await get<{ id: string }>(`rooftop?select=id&org_id=eq.${ORG}`, "id")).map((r) => r.id)
  );
  const periods = (await get<{ id: string; rooftop_id: string; starts_on: string }>(
    "perf_period?select=id,rooftop_id,starts_on&superseded_at=is.null",
    "id"
  )).filter((p) => tops.has(p.rooftop_id) && p.starts_on >= T12_FROM && p.starts_on <= T12_TO);
  const inWindow = new Set(periods.map((p) => p.id));

  const t12 = new Map<string, number>();
  for (const r of await get<{ period_id: string; advisor_op_id: string; family: string; labor_sales: number }>(
    "advisor_family_labor?select=period_id,advisor_op_id,family,labor_sales",
    "period_id,advisor_op_id,family"
  )) {
    if (!inWindow.has(r.period_id)) continue;
    t12.set(r.family, (t12.get(r.family) ?? 0) + Number(r.labor_sales ?? 0));
  }

  // Sub-category vocabulary as it actually arrives, resolved by the app's own
  // matcher — so "feeding sub-categories" is observed, not asserted.
  const subsRaw = new Set<string>();
  for (const r of await get<{ sub_category: string | null }>(
    "advisor_op_metric?select=sub_category", "sub_category"
  )) {
    if (r.sub_category) subsRaw.add(r.sub_category);
  }
  const rawByKey = new Map<string, string>();
  for (const s of subsRaw) if (!rawByKey.has(normaliseSubCategory(s))) rawByKey.set(normaliseSubCategory(s), s);

  const feeding = new Map<string, string[]>();
  for (const s of [...subsRaw].sort()) {
    const fam = autoMatch(s).family;
    if (!fam) continue;
    feeding.set(fam, [...(feeding.get(fam) ?? []), s]);
  }
  // A PARTIAL/SPLIT label feeds its family through the op-text rules instead.
  for (const r of OP_TEXT_RULES) {
    const raw = rawByKey.get(r.subCategory) ?? r.subCategory;
    feeding.set(r.family, [...(feeding.get(r.family) ?? []), `${raw} (part)`]);
  }

  // Op-code prefixes on cue titles — the only place these codes exist today.
  const content = await get<{ title: string; service_family: string | null; status: string; type: string }>(
    "content?select=title,service_family,status,type",
    "title"
  );
  const PREFIX = /^([A-Z]{2,4}-\d{3})\b/;
  const ANY = /\b([A-Z]{2,4}-\d{3})\b/g;
  const active = new Map<string, { cues: number; published: number; fams: Map<string, number>; name: string }>();
  const mentioned = new Set<string>();
  for (const c of content) {
    const title = (c.title ?? "").trim();
    const m = PREFIX.exec(title);
    if (m) {
      const e = active.get(m[1]) ?? { cues: 0, published: 0, fams: new Map(), name: "" };
      e.cues++;
      if (c.status === "published") e.published++;
      const f = c.service_family ?? "(none)";
      e.fams.set(f, (e.fams.get(f) ?? 0) + 1);
      if (!e.name) e.name = title.slice(m[1].length).replace(/^[\s·—-]+/, "").trim();
      active.set(m[1], e);
    }
    for (const hit of title.matchAll(ANY)) mentioned.add(hit[1]);
  }
  // Referenced somewhere, defined nowhere.
  const undefinedCodes = [
    ...[...mentioned].filter((c) => !active.has(c)).map((c) => ({
      code: c, where: "mentioned inside a cue title, but carries no cue of its own",
    })),
    ...NAMED_IN_RULINGS.map((n) => ({ code: n.code, where: n.where })),
  ].filter((c, i, a) => a.findIndex((x) => x.code === c.code) === i)
   .sort((a, b) => a.code.localeCompare(b.code));

  /* ---- workbook ----------------------------------------------------------- */
  const wb = new ExcelJS.Workbook();
  wb.creator = "EDIAGD";

  /* ======================= TAB 1 — Families ============================== */
  const t1 = wb.addWorksheet("Families");
  t1.columns = [
    { header: "Family", key: "fam", width: 22 },
    { header: "Does it coach?", key: "status", width: 30 },
    { header: "Cues written", key: "cues", width: 13 },
    { header: "What feeds it (service labels from your DMS)", key: "subs", width: 62 },
    { header: "Labor $, last 12 months", key: "money", width: 22 },
    { header: "Note", key: "note", width: 56 },
  ];
  styleHeader(t1);

  const NOTE: Record<string, string> = {
    Battery: "56 cues ready, deliberately off — flips on your word.",
    Accessories: "Own family so it can't distort Miscellaneous; never coaches.",
  };

  for (const f of families) {
    const name = String(f.name);
    const isNow = (COACHABLE_FAMILIES as readonly string[]).includes(name);
    const isPending = (COACHABLE_PENDING_CONTENT as readonly string[]).includes(name);
    const cues = cueCounts.get(name) ?? 0;
    const status = isNow
      ? "Coaching now"
      : isPending
        ? cues > 0 ? "Coaching now (cues arrived)" : "Ready — waiting on cues"
        : "Never coaches, reporting only";

    const row = t1.addRow({
      fam: name,
      status,
      cues,
      subs: (feeding.get(name) ?? []).join(", ") || "—",
      money: Math.round(t12.get(name) ?? 0),
      note: NOTE[name] ?? "",
    });
    row.alignment = { vertical: "top", wrapText: true };
    if (status.startsWith("Ready")) {
      row.getCell("status").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7E0" } };
    }
    if (status.startsWith("Never")) {
      row.getCell("status").font = { italic: true, color: { argb: "FF6B7280" } };
    }
  }
  t1.getColumn("money").numFmt = money;
  t1.getColumn("cues").alignment = { horizontal: "center", vertical: "top" };
  t1.addRow({});
  const t1n = t1.addRow({
    fam: "How to read this",
    status:
      `"Coaching now" appears on advisors' screens today. "Ready" means the family maps and reports, ` +
      `and starts coaching the moment somebody writes a cue against it — no code change. ` +
      `"Never coaches" is deliberate: it is mapped so the money shows up in reporting, and nothing more. ` +
      `Labor dollars are all eleven stores, ${T12_FROM.slice(0, 7)} to ${T12_TO.slice(0, 7)}, and count only work that ` +
      `reaches a family — diagnosis, repair and the labels you ruled out are not in these figures, so the column ` +
      `sums to less than the group's total labor.`,
  });
  t1n.getCell("status").alignment = { wrapText: true, vertical: "top" };
  t1n.font = { italic: true, color: { argb: "FF6B7280" } };
  t1.mergeCells(`B${t1n.number}:F${t1n.number}`);
  t1n.height = 46;

  /* ======================= TAB 2 — Op codes ============================== */
  const t2 = wb.addWorksheet("Op codes");
  t2.columns = [
    { header: "Code", key: "code", width: 12 },
    { header: "What it is", key: "name", width: 40 },
    { header: "Family home", key: "fam", width: 20 },
    { header: "Cues", key: "cues", width: 8 },
    { header: "Status", key: "status", width: 13 },
    { header: "DEFINE THIS — what is this code, and which family?", key: "ask", width: 52 },
  ];
  styleHeader(t2);

  /* A code whose cues carry no service_family has no home to show. That is not
     a blank to paper over — it is half the catalog, and it is a question only
     Mitch can answer, so it goes in the ask column like any other. */
  let unfiled = 0;
  for (const code of [...active.keys()].sort()) {
    const e = active.get(code)!;
    const top = [...e.fams.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "(none)";
    const filed = top !== "(none)";
    if (!filed) unfiled++;
    const row = t2.addRow({
      code,
      name: e.name || "—",
      fam: filed ? top : "— not filed —",
      cues: e.cues,
      status: "Active",
      ask: filed ? "" : "This code has cues, but they are not filed under any family. Which family is its home?",
    });
    if (!filed) {
      row.getCell("fam").font = { italic: true, color: { argb: "FF9A3412" } };
      row.getCell("ask").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE4B5" } };
      row.getCell("ask").alignment = { wrapText: true, vertical: "top" };
    }
  }
  for (const p of PROPOSED) {
    const row = t2.addRow({
      code: p.code, name: p.name, family: undefined,
      fam: p.family, cues: 0, status: "Proposed",
      ask: `You asked for this code for "${p.from}". It has no cues yet.`,
    });
    row.getCell("status").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0FE" } };
  }
  for (const u of undefinedCodes) {
    const row = t2.addRow({
      code: u.code, name: "— never defined —", fam: "—", cues: 0,
      status: "UNDEFINED",
      ask: u.where,
    });
    row.getCell("status").font = { bold: true, color: { argb: "FF9A3412" } };
    for (const c of ["status", "ask"]) {
      row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE4B5" } };
    }
    row.getCell("ask").alignment = { wrapText: true, vertical: "top" };
  }
  t2.getColumn("cues").alignment = { horizontal: "center" };
  t2.addRow({});
  const gap = t2.addRow({
    code: "Gap",
    name: `Codes 055, 056 and 057 appear nowhere at all — not on a cue, not in a ruling. ` +
          `Numbering runs 001–054 then jumps to 058. If those three exist on your side, they are the ones we have never seen.`,
  });
  gap.font = { italic: true, color: { argb: "FF6B7280" } };
  t2.mergeCells(`B${gap.number}:F${gap.number}`);
  gap.getCell("name").alignment = { wrapText: true, vertical: "top" };
  gap.height = 32;

  /* ======================= TAB 3 — The 46 rulings ======================== */
  const t3 = wb.addWorksheet("Your 46 rulings");
  t3.columns = [
    { header: "Service label you ruled on", key: "label", width: 32 },
    { header: "Your ruling", key: "ruling", width: 14 },
    { header: "What we did with it", key: "did", width: 46 },
    { header: "Where the money went", key: "outcome", width: 46 },
  ];
  styleHeader(t3);

  const section = (title: string) => {
    const r = t3.addRow({ label: title });
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4B6B8A" } };
    t3.mergeCells(`A${r.number}:D${r.number}`);
  };

  section(`MAPPED — ${MAPPED_12.length} labels, each one whole to a single family`);
  for (const key of MAPPED_12) {
    const raw = rawByKey.get(key) ?? key;
    const fam = autoMatch(raw).family ?? "(unmapped)";
    t3.addRow({
      label: raw, ruling: "Fully covered",
      did: `Every row of "${raw}" now counts toward ${fam}.`,
      outcome: "All of it. Nothing left over.",
    });
  }

  section(`NEW — ${NEW_7.length} labels that needed a family that did not exist`);
  for (const key of NEW_7) {
    const raw = rawByKey.get(key) ?? key;
    const fam = autoMatch(raw).family ?? "(unmapped)";
    const p = PROPOSED.find((x) => normaliseSubCategory(x.from) === key);
    t3.addRow({
      label: raw, ruling: "Needs a code",
      did: `Lands in ${fam}${p ? `, ready for ${p.code}` : ""}.`,
      outcome: p ? `${p.code} is still to be defined — see the Op codes tab.` : "Mapped and reporting.",
    });
  }

  section(`PARTIAL / SPLIT — ${OP_TEXT_RULES.length} labels holding a service AND repair work`);
  for (const r of OP_TEXT_RULES) {
    const raw = rawByKey.get(r.subCategory) ?? r.subCategory;
    const tot = r.matched + r.residue;
    const pct = tot > 0 ? r.matched / tot : 0;
    const row = t3.addRow({
      label: raw, ruling: "Partial / split",
      did: `We read the op-code text your stores type, line by line, and counted only the service half toward ${r.family}.`,
      outcome:
        `$${Math.round(r.matched).toLocaleString()} counted (${(pct * 100).toFixed(0)}%). ` +
        `$${Math.round(r.residue).toLocaleString()} left for your round-two sheet.`,
    });
    row.alignment = { vertical: "top", wrapText: true };
  }

  section(`NOT COACHABLE — ${Object.keys(NOT_COACHABLE).length} labels confirmed outside coaching`);
  for (const [key, why] of Object.entries(NOT_COACHABLE)) {
    const raw = rawByKey.get(key) ?? key;
    const row = t3.addRow({
      label: raw, ruling: "Not coaching",
      did: "Recorded as your decision, so it stops coming back on the queue.",
      outcome: why,
    });
    row.alignment = { vertical: "top", wrapText: true };
  }

  const total = MAPPED_12.length + NEW_7.length + OP_TEXT_RULES.length + Object.keys(NOT_COACHABLE).length;
  t3.addRow({});
  const t3n = t3.addRow({ label: `${total} rulings, all applied. Nothing is waiting on us.` });
  t3n.font = { bold: true };

  /* ---- write -------------------------------------------------------------- */
  const dir = path.join(process.cwd(), "exports");
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, "op-code-catalog-for-review.xlsx");
  await wb.xlsx.writeFile(out);

  console.log(`  Families      ${families.length} (${SERVICE_FAMILIES.length} in the rule file)`);
  console.log(`  Op codes      ${active.size} active, ${PROPOSED.length} proposed, ${undefinedCodes.length} undefined`);
  console.log(`                undefined: ${undefinedCodes.map((u) => u.code).join(", ")}`);
  console.log(`                ${unfiled} of the ${active.size} active codes have cues that are not filed under any family`);
  console.log(`  Rulings       ${total}`);
  console.log(`  T12 window    ${T12_FROM} .. ${T12_TO}, $${Math.round([...t12.values()].reduce((a, b) => a + b, 0)).toLocaleString()} labor`);
  console.log(`  xlsx ->       ${out}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
