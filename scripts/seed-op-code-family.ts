/* ============================================================================
   EDIAGD — seed op_code_family from the CSV

   Same pattern as scripts/seed-op-codes.ts: the CSV in data/ is the editable
   artefact, re-running the seed is how a revision lands, and the run is
   idempotent so it can be repeated without thinking about it.

   ---------------------------------------------------------------------------
   VALIDATE BEFORE WRITING, THE WHOLE FILE OR NOTHING
   ---------------------------------------------------------------------------
   Two checks, both of which stop the run rather than skipping a row:

     * every `code` exists in op_code_catalog — a typo here would create a
       family mapping for a service that does not exist, and the foreign key
       would reject it row-by-row leaving a half-seeded table
     * every `family` is one of the canonical names — 'Brake Svc' instead of
       'Brake Service' produces a family nothing queries and no error anywhere

   A partial seed is worse than no seed: the loop would route some codes and
   silently drop others, which reads as a content gap rather than a bad file.

     npm run seed:op-family
     npm run seed:op-family -- --apply
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { SERVICE_FAMILIES } from "../lib/dms/mapping";

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FROM =
  args.find((a) => a.startsWith("--from="))?.split("=").slice(1).join("=") ??
  "data/op_code_family_map.csv";

/** Minimal RFC-4180 reader — the note column is a quoted comma list. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(cell); cell = ""; continue; }
    if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const kept = rows.filter((r) => r.some((v) => v.trim()));
  const [head, ...body] = kept;
  return body.map((r) =>
    Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()]))
  );
}

const clean = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

(async () => {
  const rows = parseCsv(readFileSync(FROM, "utf8"));
  console.log(`\n  ${rows.length} rows in ${FROM.split("/").pop()}`);

  /* ---- 1. Every code must exist in the catalog --------------------------- */
  const { data: catalog, error: catErr } = await sb
    .from("op_code_catalog")
    .select("code, name");
  if (catErr) throw new Error(`op_code_catalog: ${catErr.message}`);
  const known = new Set((catalog ?? []).map((c) => c.code as string));

  const unknownCodes = rows.filter((r) => !known.has(r.code));
  const missingFromCsv = [...known].filter((c) => !rows.some((r) => r.code === c));

  /* ---- 2. Every family must be canonical --------------------------------- */
  const families = new Set<string>([...SERVICE_FAMILIES, "EV & Hybrid"]);
  const unknownFamilies = rows.filter((r) => !families.has(r.family));

  if (unknownCodes.length || unknownFamilies.length) {
    console.error(`\n  STOPPING — nothing written.\n`);
    if (unknownCodes.length) {
      console.error(`  codes not in op_code_catalog: ${unknownCodes.length}`);
      unknownCodes.forEach((r) => console.error(`    ${r.code}`));
    }
    if (unknownFamilies.length) {
      console.error(`  families not in SERVICE_FAMILIES: ${unknownFamilies.length}`);
      unknownFamilies.forEach((r) => console.error(`    ${r.code} -> "${r.family}"`));
    }
    process.exit(1);
  }

  // Not fatal: a catalog code with no mapping is a gap to report, and the
  // loop's content-gating already refuses to coach what it cannot route.
  if (missingFromCsv.length) {
    console.log(`\n  catalog codes with NO mapping row: ${missingFromCsv.length}`);
    missingFromCsv.forEach((c) => console.log(`    ${c}`));
  }

  const byFamily = new Map<string, number>();
  rows.forEach((r) => byFamily.set(r.family, (byFamily.get(r.family) ?? 0) + 1));
  const notCoachable = rows.filter((r) => r.coachable === "false");

  console.log(`\n  ${byFamily.size} families:`);
  [...byFamily.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([f, n]) => console.log(`    ${String(n).padStart(3)}  ${f}`));
  console.log(`\n  mapped but never coached: ${notCoachable.length}`);
  console.log(`    ${notCoachable.map((r) => r.code).join(" ")}`);

  if (!APPLY) {
    console.log(`\n  --dry: nothing written. ${rows.length} row(s) would be upserted.\n`);
    return;
  }

  const payload = rows.map((r) => ({
    code: r.code,
    family: r.family,
    coachable: r.coachable !== "false",
    confidence: ["high", "medium", "ruled"].includes(r.confidence) ? r.confidence : "high",
    note: clean(r.note),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await sb.from("op_code_family").upsert(payload, { onConflict: "code" });
  if (error) throw new Error(error.message);

  const { count } = await sb
    .from("op_code_family")
    .select("code", { count: "exact", head: true });
  console.log(`\n  upserted ${payload.length}; table now holds ${count}.\n`);
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
