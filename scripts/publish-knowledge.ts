/* ============================================================================
   EDIAGD — Phase 2: publish the re-imported knowledge, one tab at a time

     npm run publish:knowledge -- --dry
     npm run publish:knowledge -- --tab="Product Knowledge — Wipers"
     npm run publish:knowledge

   ---------------------------------------------------------------------------
   PER TAB, BECAUSE PUBLISHING IS THE ONLY STEP ADVISORS CAN SEE
   ---------------------------------------------------------------------------
   Phase 1 wrote 798 rows as DRAFT, which changed nothing for anybody. This is
   the step that turns them on, and the effect is not evenly spread: four
   families that are currently content-gated OFF — Belts & Cooling, Wipers,
   HVAC, Lighting — come alive the moment their tab publishes, and Eddie's Pick
   redistributes across every advisor at every store the same day.

   So it goes a tab at a time and reports what each one turns on, rather than
   flipping 798 rows in a single statement nobody can read afterwards.

   ---------------------------------------------------------------------------
   TWO THINGS ARE NEVER PUBLISHED
   ---------------------------------------------------------------------------
   1  ROWS WITH AN OPEN REVIEW ITEM. 124 rows are waiting on Mitch — 120 for an
      op code, 4 for missing words. Publishing a row whose open question is
      "which op code is this about?" ships a cue nothing can route: it has no
      family and no code, so no ladder rung reaches it and it sits in the
      library being counted as coverage it does not provide.

   2  RETIRED ROWS. The 85 duplicates carry retired_at and must stay withdrawn;
      `status` alone would put them back in every pool.
   ============================================================================ */

import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const ONLY = args.find((a) => a.startsWith("--tab="))?.split("=").slice(1).join("=");

const pad = (n: number, w = 4) => String(n).padStart(w);

(async () => {
  console.log(`\n  ${DRY ? "DRY RUN — nothing will be published" : "PUBLISHING"}\n`);

  /* Every row this import created or repaired, by tab. */
  const rows: { id: string; source_tab: string; service_family: string | null; op_code: string | null; collection: string | null }[] = [];
  for (let o = 0; ; o += 1000) {
    const { data, error } = await sb
      .from("content")
      .select("id, source_tab, service_family, op_code, collection")
      .eq("type", "cue")
      .eq("status", "draft")
      .not("source_tab", "is", null)
      .is("retired_at", null)
      .order("id")
      .range(o, o + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []) as typeof rows);
    if (!data || data.length < 1000) break;
  }

  /* Anything Mitch still owns a question on. */
  const blocked = new Set<string>();
  for (let o = 0; ; o += 1000) {
    const { data, error } = await sb
      .from("content_review")
      .select("content_id")
      .eq("status", "open")
      .order("id")
      .range(o, o + 999);
    if (error) throw new Error(error.message);
    (data ?? []).forEach((r) => blocked.add(r.content_id as string));
    if (!data || data.length < 1000) break;
  }

  const tabs = [...new Set(rows.map((r) => r.source_tab))].sort();
  const targets = ONLY ? tabs.filter((t) => t === ONLY) : tabs;
  if (ONLY && targets.length === 0) {
    console.log(`  no draft rows for tab ${JSON.stringify(ONLY)}. Tabs available:`);
    tabs.forEach((t) => console.log(`    ${t}`));
    return;
  }

  let totalPublished = 0, totalHeld = 0;
  const familyGain = new Map<string, number>();

  for (const tab of targets) {
    const mine = rows.filter((r) => r.source_tab === tab);
    const held = mine.filter((r) => blocked.has(r.id));
    const go = mine.filter((r) => !blocked.has(r.id));

    const fams = new Map<string, number>();
    go.forEach((r) => {
      const f = r.service_family ?? "(no family)";
      fams.set(f, (fams.get(f) ?? 0) + 1);
      if (r.service_family) familyGain.set(r.service_family, (familyGain.get(r.service_family) ?? 0) + 1);
    });

    console.log(`  ${tab}`);
    console.log(`    ${pad(go.length)} publish   ${pad(held.length)} held for review`);
    [...fams].sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(`      ${pad(n)}  ${f}`));

    if (!DRY && go.length) {
      for (let i = 0; i < go.length; i += 200) {
        const batch = go.slice(i, i + 200).map((r) => r.id);
        const { error } = await sb
          .from("content")
          .update({ status: "published", updated_at: new Date().toISOString() })
          .in("id", batch);
        if (error) throw new Error(`publish ${tab} batch ${i}: ${error.message}`);
      }
    }
    totalPublished += go.length;
    totalHeld += held.length;
    console.log("");
  }

  console.log(`  ${DRY ? "would publish" : "published"} ${totalPublished}, held ${totalHeld}\n`);

  /*
   * The gate reads service_family_cue_count, so this is the list that decides
   * which families stop being suppressed. Printed after the fact from the live
   * view rather than from the plan, because the view is what isCoachable sees.
   */
  const { data: counts } = await sb
    .from("service_family_cue_count")
    .select("family, published_cues");
  const STARVED = ["HVAC", "Belts & Cooling", "Wipers", "Lighting", "Suspension", "Inspections", "Oil Change", "Alignment"];
  console.log(`  CONTENT-GATED FAMILIES, as the gate now sees them:`);
  for (const f of STARVED) {
    const n = Number((counts ?? []).find((c) => c.family === f)?.published_cues ?? 0);
    console.log(`    ${n > 0 ? "ON " : "off"}  ${pad(n)}  ${f}`);
  }
  console.log("");
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
