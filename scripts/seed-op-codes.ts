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

/*
 * ---- WHAT A PERSON HAS EDITED IS NOT THE FILE'S TO OVERWRITE (0073) --------
 *
 * This used to upsert every row on `code`, which was right while this script
 * was the only writer. The Mapping screens changed that: an upsert now reverts
 * whatever an admin edited, silently, the next time somebody re-seeds from the
 * CSV — the same trap 0071 closed on op_text_rule.
 *
 * So rows an admin has touched (origin='admin') are dropped from the payload
 * and NAMED. Being told "3 rows kept their edits" is the difference between a
 * seeder you can run without thinking and one that quietly costs somebody
 * their afternoon.
 */
async function dropAdminEdited<T extends { code: string }>(
  table: string,
  payload: T[]
): Promise<T[]> {
  const { data, error } = await sb.from(table).select("code, origin");
  if (error) throw new Error(`${table} origin read: ${error.message}`);
  const edited = new Set(
    ((data ?? []) as { code: string; origin: string }[])
      .filter((r) => r.origin === "admin")
      .map((r) => r.code)
  );
  if (edited.size === 0) return payload;

  const kept = payload.filter((p) => !edited.has(p.code));
  console.log(
    `\n  ${edited.size} row(s) edited in the app are LEFT ALONE: ` +
      `${[...edited].sort().join(", ")}`
  );
  console.log(`  (clear origin to 'file' on one you want the CSV to own again)`);
  return kept;
}

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

  const writable = await dropAdminEdited("op_code_catalog", payload);
  if (writable.length === 0) {
    console.log("\n  nothing to write — every row is admin-owned.\n");
    return;
  }
  const { error } = await sb.from("op_code_catalog").upsert(writable, { onConflict: "code" });
  if (error) throw new Error(`upsert: ${error.message}`);

  const { count } = await sb
    .from("op_code_catalog")
    .select("code", { count: "exact", head: true });
  console.log(`\n  seeded ${writable.length}. op_code_catalog now holds ${count} codes.`);

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
