/* ============================================================================
   EDIAGD — Mitch's deck map, as PROPOSALS

     SB_URL=… SB_KEY=… npm run import:deck-map            # apply
     SB_URL=… SB_KEY=… npm run import:deck-map -- --dry   # report only

   ---------------------------------------------------------------------------
   PROPOSALS, NOT TRUTH
   ---------------------------------------------------------------------------
   `Doggett to Deck Map` is Mitch reading Doggett's sub-category list and saying
   which EDIAGD op code he thinks each one is. That is a well-informed opinion
   about somebody else's data, and it is not the same kind of fact as a
   confirmed mapping.

   So every row lands in mapping_alias with confirmed = false, which 0066 built
   to mean exactly this: visible and inert. The importers resolve confirmed rows
   only, so nothing here can reroute a single RO until Mitch says yes on the
   Aliases screen.

   NOTHING TOUCHES sub_category_map. That table holds the confirmed
   sub-category -> family decisions the Dealer Codes screen has already
   collected, and overwriting them with a spreadsheet's opinion is the failure
   this whole proposal pattern exists to prevent.

   ---------------------------------------------------------------------------
   THE EVIDENCE COMES WITH IT
   ---------------------------------------------------------------------------
   Each row carries what August actually did: ROs, labor, and how many of the
   eleven stores see the service. A confirmation screen that says
   "Air Filter -> EAF-001, confirm?" is asking Mitch to remember. One that says
   "548 ROs, $17,025 labor, 11 stores" is showing him the reason. 0087 adds the
   columns; this puts the numbers in them.
   ============================================================================ */

import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

const DECK_MAP = "data/EDIAGD_Doggett_OpCode_Deck_Map (1).xlsx";
const PERIOD = "Aug 2026";
const DRY = process.argv.includes("--dry");

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});

function text(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join("").trim();
    if (o.text != null) return String(o.text).trim();
    /* A formula cell's `result` is a number here, never an object — but the
       TOTALS row's results arrive unevaluated, so anything non-primitive is
       treated as absent rather than stringified into "[object Object]". */
    if (o.result != null && typeof o.result !== "object") return String(o.result).trim();
    return "";
  }
  return String(v).trim();
}

function num(v: ExcelJS.CellValue): number | null {
  const s = text(v).replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

type Proposal = {
  kind: "op_code";
  alias: string;
  canonical: string;
  confirmed: false;
  note: string;
  evidence_ros: number | null;
  evidence_labor: number | null;
  evidence_stores: number | null;
  evidence_period: string;
};

async function main() {
  console.log(`\n  source   ${DECK_MAP}`);
  console.log(`  mode     ${DRY ? "DRY RUN — nothing is written" : "apply"}\n`);

  const { data: catalog } = await sb.from("op_code_catalog").select("code");
  const known = new Set((catalog ?? []).map((r) => String(r.code)));

  /* CONFIRMED ROWS ARE UNTOUCHABLE. A confirmed alias is a decision somebody
     already made; a spreadsheet does not get to reopen it silently. */
  const { data: priorRows } = await sb
    .from("mapping_alias")
    .select("alias, canonical, confirmed")
    .eq("kind", "op_code");
  const prior = new Map(
    (priorRows ?? []).map((r) => [String(r.alias), r as { canonical: string; confirmed: boolean }])
  );

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(DECK_MAP);
  const ws = wb.getWorksheet("Doggett to Deck Map");
  if (!ws) throw new Error(`No "Doggett to Deck Map" sheet`);

  const H: Record<string, number> = {};
  ws.getRow(1).eachCell((c, i) => {
    const n = text(c.value);
    if (n) H[n] = i;
  });

  const proposals: Proposal[] = [];
  const skipped: string[] = [];
  const protectedRows: string[] = [];
  const unresolvable = new Map<string, string[]>();

  for (let r = 2; r <= ws.rowCount; r++) {
    const g = (k: string) => text(ws.getRow(r).getCell(H[k]).value);
    const sub = g("Doggett Sub-Category");
    if (!sub) continue;

    /* The sheet's own footer, not a sub-category. */
    if (/^totals?$/i.test(sub)) continue;

    const raw = g("EDIAGD Op Code(s)");
    const status = g("Status");
    const tokens = raw.split("/").map((t) => t.trim()).filter(Boolean);
    const resolved = tokens.filter((t) => known.has(t));
    const missed = tokens.filter((t) => !known.has(t));

    if (resolved.length === 0) {
      /* N/A rows and rows whose codes do not exist yet — the A/C Odor and Tires
         slots among them. Nothing to propose until there is a code to propose. */
      skipped.push(
        `${sub}  [${status || "no status"}]  ${raw ? `no resolvable code in "${raw}"` : "no op code given"}`
      );
      if (missed.length) unresolvable.set(sub, missed);
      continue;
    }

    const existing = prior.get(sub);
    if (existing?.confirmed) {
      protectedRows.push(
        `${sub} -> ${existing.canonical} (confirmed; sheet proposes ${resolved[0]})`
      );
      continue;
    }

    /* Same ruling as the knowledge and quiz imports: first resolvable code is
       the proposal, the rest are recorded rather than discarded. A sub-category
       that genuinely spans four codes is one decision with four parts, not four
       decisions. */
    const extras = resolved.slice(1);
    const noteParts = [
      `Mitch's deck map, ${PERIOD}`,
      status ? `status ${status}` : null,
      g("Deck Name") ? `deck "${g("Deck Name")}"` : null,
      extras.length ? `also covers ${extras.join(", ")}` : null,
      missed.length ? `unresolved in sheet: ${missed.join(", ")}` : null,
    ].filter(Boolean);

    proposals.push({
      kind: "op_code",
      alias: sub,
      canonical: resolved[0],
      confirmed: false,
      note: noteParts.join(" · "),
      evidence_ros: num(ws.getRow(r).getCell(H["Aug 2026 ROs"]).value),
      evidence_labor: num(ws.getRow(r).getCell(H["Aug 2026 Labor"]).value),
      evidence_stores: num(ws.getRow(r).getCell(H["Stores"]).value),
      evidence_period: PERIOD,
    });
  }

  console.log(`  ${String(proposals.length).padStart(4)} proposals (confirmed = false, inert)`);
  console.log(`  ${String(protectedRows.length).padStart(4)} left alone — already confirmed`);
  console.log(`  ${String(skipped.length).padStart(4)} skipped — nothing to propose`);

  if (protectedRows.length) {
    console.log("\n  ALREADY CONFIRMED — not overwritten");
    protectedRows.forEach((p) => console.log(`    ${p}`));
  }

  if (skipped.length) {
    console.log("\n  SKIPPED");
    skipped.forEach((s) => console.log(`    ${s}`));
  }

  if (unresolvable.size) {
    console.log("\n  OP CODES THE SHEET NAMES THAT DO NOT EXIST IN THE CATALOG");
    [...unresolvable.entries()].forEach(([sub, codes]) =>
      console.log(`    ${sub}: ${codes.join(", ")}`)
    );
  }

  if (DRY) {
    console.log("\n  DRY RUN — nothing written.\n");
    return;
  }

  /* Upsert on the natural key from 0066. A re-run refreshes the evidence and
     the note without disturbing anything a human has since confirmed — those
     never reach this point. */
  for (let i = 0; i < proposals.length; i += 100) {
    const chunk = proposals.slice(i, i + 100);
    const { error } = await sb
      .from("mapping_alias")
      .upsert(chunk, { onConflict: "kind,alias" });
    if (error) throw new Error(`Upsert failed at ${i}: ${error.message}`);
  }
  console.log(`\n  wrote ${proposals.length} proposals\n`);
}

/* NOT ON IMPORT — see the note in import-quiz-bank.ts. */
if (require.main === module) {
  main().catch((e) => {
    console.error("\n  FAILED:", e instanceof Error ? e.message : e, "\n");
    process.exit(1);
  });
}

export { text, num };
