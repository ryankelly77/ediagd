/* ============================================================================
   EDIAGD — seed the service op-code catalog from Mitch's list

   A SCRIPT, NOT INLINED SQL. Mitch will revise this list, and re-running the
   seed is how a revision lands. Seventy-three INSERTs pasted into a migration
   would freeze the list at today's version and make every correction a new
   migration.

   IDEMPOTENT: `on conflict (code) do update` refreshes the mutable fields and
   leaves the key alone, so a re-run is a diff rather than a duplicate.

   ---------------------------------------------------------------------------
   IT WRITES TO op_code_catalog, NOT op_code
   ---------------------------------------------------------------------------
   `op_code` is the DMS OPERATOR-ID registry — 35122 is David Esparza, and
   membership.op_code_id points at it. Putting service codes there would leave
   every advisor foreign-keyed to a catalog of engine air filters. See 0062.

     npm run seed:op-codes -- --file=data/op_code_seed.csv --dry
     npm run seed:op-codes -- --file=data/op_code_seed.csv
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});

const args = process.argv.slice(2);
const FILE = args.find((a) => a.startsWith("--file="))?.split("=").slice(1).join("=");
const DRY = args.includes("--dry");

if (!FILE) {
  console.error("  --file= is required (op_code_seed.csv).\n");
  process.exit(1);
}

/** Minimal RFC-4180 reader: the piggyback columns are quoted comma lists. */
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

  const [head, ...body] = rows.filter((r) => r.some((v) => v.trim()));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

const clean = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

(async () => {
  const rows = parseCsv(readFileSync(FILE, "utf8"));
  console.log(`  ${rows.length} rows in ${FILE.split("/").pop()}`);

  const codes = new Set(rows.map((r) => r.code));
  if (codes.size !== rows.length) {
    throw new Error(`duplicate codes: ${rows.length} rows, ${codes.size} distinct`);
  }

  /*
   * VALIDATE BEFORE WRITING. Every piggyback_partners entry must resolve to a
   * real code in this same file — that is the whole reason the unresolved ones
   * live in their own column. A partner that does not resolve means either the
   * file is wrong or a code was renamed, and neither should be discovered later
   * as a broken link on the detail screen.
   */
  const dangling = new Set<string>();
  for (const r of rows) {
    for (const p of (r.piggyback_partners ?? "").split(",")) {
      const t = p.trim();
      if (t && !codes.has(t)) dangling.add(`${r.code} -> ${t}`);
    }
  }
  if (dangling.size) {
    console.error("\n  STOPPING — piggyback_partners that do not resolve:");
    [...dangling].forEach((d) => console.error(`    ${d}`));
    console.error("  Move them to piggyback_unresolved, or add the missing code.\n");
    process.exit(1);
  }

  const cats = new Map<string, number>();
  rows.forEach((r) => cats.set(r.category, (cats.get(r.category) ?? 0) + 1));
  console.log(`  ${codes.size} distinct codes across ${cats.size} categories`);
  for (const [c, n] of [...cats].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(3)}  ${c}`);
  }

  const unresolved = new Set<string>();
  rows.forEach((r) =>
    (r.piggyback_unresolved ?? "").split(",").forEach((u) => u.trim() && unresolved.add(u.trim()))
  );
  if (unresolved.size) {
    console.log(`\n  REFS FOR MITCH — written to him, never foreign-keyed: ${unresolved.size}`);
    console.log(`    ${[...unresolved].sort().join(", ")}`);
  }

  const payload = rows.map((r) => ({
    code: r.code,
    sort_order: Number(r.sort_order),
    category: r.category,
    name: r.name,
    piggyback_partners: clean(r.piggyback_partners),
    piggyback_unresolved: clean(r.piggyback_unresolved),
    piggyback_note: clean(r.piggyback_note),
    notes: clean(r.notes),
    updated_at: new Date().toISOString(),
  }));

  if (DRY) {
    console.log(`\n  --dry: nothing written. Would upsert ${payload.length} codes.\n`);
    return;
  }

  const { error } = await sb.from("op_code_catalog").upsert(payload, { onConflict: "code" });
  if (error) throw new Error(`upsert: ${error.message}`);

  const { count } = await sb
    .from("op_code_catalog")
    .select("code", { count: "exact", head: true });
  console.log(`\n  seeded. op_code_catalog now holds ${count} codes.`);

  /*
   * Codes the catalog does not cover but content already claims. Zero today —
   * content.op_code is null everywhere — but a later revision that DROPS a code
   * would orphan any content tagged with it, and the FK's `on delete set null`
   * would silently untag those rows.
   */
  const { data: orphans } = await sb
    .from("content")
    .select("title, op_code")
    .not("op_code", "is", null)
    .not("op_code", "in", `(${[...codes].join(",")})`);
  if (orphans?.length) {
    console.log(`\n  WARNING — content tagged with codes not in this file: ${orphans.length}`);
    orphans.slice(0, 10).forEach((o) => console.log(`    ${o.op_code}  ${o.title}`));
  }
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
