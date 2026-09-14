/* ============================================================================
   EDIAGD — the certification content punch list

   READ ONLY. Writes nothing, anywhere. Point it at a database and it answers
   the one question phase 1b exists to answer: which certification tracks do
   not have enough content behind them to be worth earning, and how far short
   is each one?

     export SB_URL=... SB_KEY=...   # service role
     npm run report:certifications

   ---------------------------------------------------------------------------
   WHY THIS RE-IMPLEMENTS THE RULE INSTEAD OF READING certification.item_count
   ---------------------------------------------------------------------------
   Because it has to run BEFORE 0116 is applied, and because afterwards a
   second independent implementation is worth more than a convenient one. When
   item_count exists, this cross-checks against it and shouts if the two
   disagree — a disagreement means the SQL and the stated rule have drifted,
   which is exactly the failure a stored derived column invites.

   The count matches `my_module_progress.total_items`: content rows that are
   `published` and carry the module's id. No type filter and no retirement
   filter, because a bar counted differently from the way completion is counted
   could mark a track too thin to offer while the LMS still considered it
   completable.
============================================================================ */
/* The Supabase query builder's filter type is not exported in a form that can
   be named here; same convention lib/certification-server.ts uses. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});

/** PostgREST caps a page at 1000 rows; every count here depends on reading all
    of them, and a silent truncation would understate a track and invent a
    punch-list entry. Explicit paging, and it asserts it reached the end. */
async function all<T>(table: string, select: string, filter?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(table).select(select).range(from, from + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

type Cert = {
  id: string;
  kind: "craft" | "service";
  name: string;
  slug: string;
  service_family: string | null;
  is_core: boolean;
  is_master_track: boolean;
  active: boolean;
  sort: number;
  item_count?: number;
};

async function main() {
  /* The bar. Absent until 0116 lands, in which case report what it WILL be. */
  const { data: gs } = await sb.from("game_settings").select("*").limit(1).single();
  const barApplied = gs != null && "certification_min_items" in gs;
  const bar = barApplied ? (gs as any).certification_min_items : 5;

  const certs = await all<Cert>(
    "certification",
    "id, kind, name, slug, service_family, is_core, is_master_track, active, sort"
  );
  const links = await all<{ certification_id: string; course_id: string }>(
    "certification_course",
    "certification_id, course_id"
  );
  const modules = await all<{ id: string; course_id: string }>("module", "id, course_id");
  const content = await all<{
    id: string;
    module_id: string | null;
    service_family: string | null;
    op_code: string | null;
  }>("content", "id, module_id, service_family, op_code", (q) => q.eq("status", "published"));
  const families = await all<{ code: string; family: string; retired_at: string | null }>(
    "op_code_family",
    "code, family, retired_at"
  );

  /* op_code -> family, matching the SQL's upper(btrim(...)) on both sides and
     its `retired_at is null` filter. */
  const familyOf = new Map<string, string>();
  for (const f of families) {
    if (f.retired_at) continue;
    familyOf.set(f.code.trim().toUpperCase(), f.family);
  }

  const modulesOfCourse = new Map<string, string[]>();
  for (const m of modules) {
    const list = modulesOfCourse.get(m.course_id) ?? [];
    list.push(m.id);
    modulesOfCourse.set(m.course_id, list);
  }
  const contentOfModule = new Map<string, number>();
  for (const c of content) {
    if (!c.module_id) continue;
    contentOfModule.set(c.module_id, (contentOfModule.get(c.module_id) ?? 0) + 1);
  }

  function craftCount(certId: string): number {
    let n = 0;
    for (const l of links) {
      if (l.certification_id !== certId) continue;
      for (const mid of modulesOfCourse.get(l.course_id) ?? []) {
        n += contentOfModule.get(mid) ?? 0;
      }
    }
    return n;
  }

  /* count(DISTINCT id): a row can match both directly and through the op code,
     and counting it twice would float a thin track over the bar. */
  function serviceCount(family: string): number {
    const seen = new Set<string>();
    for (const c of content) {
      const direct = c.service_family === family;
      const viaOp = c.op_code != null && familyOf.get(c.op_code.trim().toUpperCase()) === family;
      if (direct || viaOp) seen.add(c.id);
    }
    return seen.size;
  }

  const rows = certs
    .map((c) => {
      const items = c.kind === "craft" ? craftCount(c.id) : serviceCount(c.service_family ?? "");
      return { ...c, items, willBeActive: items > 0 && items >= bar };
    })
    .sort((a, b) => a.sort - b.sort);

  /* ---- cross-check against the stored column, when there is one ---------- */
  if (barApplied) {
    const stored = await all<Cert>("certification", "slug, item_count");
    const byslug = new Map(stored.map((s) => [s.slug, s.item_count!]));
    const drift = rows.filter((r) => byslug.get(r.slug) !== r.items);
    if (drift.length) {
      console.log("\n!! STORED item_count DISAGREES WITH THE RULE !!");
      for (const d of drift) {
        console.log(`   ${d.slug}: stored ${byslug.get(d.slug)}, computed ${d.items}`);
      }
    } else {
      console.log(`\n✓ stored item_count agrees with the rule on all ${rows.length} tracks`);
    }
  }

  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);

  console.log(`\n${"=".repeat(78)}`);
  console.log(`  MINIMUM CONTENT BAR: ${bar} items${barApplied ? "" : "  (projected — 0116 not applied)"}`);
  console.log("=".repeat(78));

  /* ---- the punch list: ordered by how close each is to clearing ---------- */
  const below = rows
    .filter((r) => !r.willBeActive)
    .sort((a, b) => b.items - a.items || a.name.localeCompare(b.name));

  console.log(`\n--- MITCH'S PUNCH LIST — ${below.length} tracks below the bar -------------------`);
  console.log(`    ordered by how close each is to clearing it\n`);
  console.log(`    ${pad("track", 30)} ${pad("kind", 8)} ${pad("items", 6)} ${pad("short by", 9)} core`);
  console.log(`    ${"-".repeat(66)}`);
  for (const r of below) {
    const short = Math.max(bar - r.items, 0);
    console.log(
      `    ${pad(r.name, 30)} ${pad(r.kind, 8)} ${pad(String(r.items), 6)} ${pad(
        r.items === 0 ? "no content" : `+${short}`,
        9
      )} ${r.is_core ? "CORE" : ""}`
    );
  }

  /* ---- what stays earnable ---------------------------------------------- */
  const above = rows.filter((r) => r.willBeActive);
  console.log(`\n--- ACTIVE AFTER THE BAR — ${above.length} tracks ------------------------------\n`);
  for (const kind of ["craft", "service"] as const) {
    const k = above.filter((r) => r.kind === kind);
    console.log(`    ${kind} (${k.length}):`);
    for (const r of k) {
      console.log(`      ${pad(r.name, 30)} ${String(r.items).padStart(5)} items ${r.is_core ? "CORE" : ""}`);
    }
    console.log("");
  }

  /* ---- what the bar changes --------------------------------------------- */
  const losing = rows.filter((r) => r.active && !r.willBeActive);
  console.log(`--- WHAT THE BAR CHANGES ------------------------------------------------\n`);
  if (losing.length === 0) {
    console.log("    nothing — every currently-active track already clears the bar\n");
  } else {
    console.log(`    ${losing.length} tracks are active today and stop being earnable:\n`);
    for (const r of losing) {
      console.log(`      ${pad(r.name, 30)} ${r.items} items ${r.is_core ? "  [CORE]" : ""}`);
    }
    console.log("");
  }

  /* ---- the credential ---------------------------------------------------- */
  const core = rows.filter((r) => r.is_core);
  const coreReady = core.filter((r) => r.willBeActive);
  console.log(`--- EDIAGD CERTIFIED ----------------------------------------------------\n`);
  console.log(`    ${coreReady.length} of ${core.length} core tracks clear the bar.`);
  if (coreReady.length < core.length) {
    console.log(`    The credential cannot be earned. Blocking:\n`);
    for (const r of core.filter((c) => !c.willBeActive)) {
      console.log(`      ${pad(r.name, 30)} ${r.items === 0 ? "no course/content" : `${r.items} items, needs ${bar}`}`);
    }
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
