/* ============================================================================
   EDIAGD — the Mux dashboard says what the file says

     npm run sync:mux-titles            # report
     npm run sync:mux-titles -- --apply

   ---------------------------------------------------------------------------
   "I SEE 'AT THE KIOSK' LIKE 8 TIMES"
   ---------------------------------------------------------------------------
   The ingest sent Mux the film's TITLE. That is unique for a Mindset quote and
   emphatically not for a pitch film: twelve decks each have an "At the Kiosk",
   so the dashboard listed the same three words over and over with nothing to
   tell them apart.

   The dashboard is where somebody looks when a transcode fails or a video needs
   checking against the master, and it is the one view that is not ours to
   redesign — so the name in it has to carry the whole identity. The canonical
   filename already does: EAF-001 — At the Kiosk — v1 says which deck, which
   film, which take.

   ---------------------------------------------------------------------------
   THE DERIVED 9:16 IS LABELLED AS SUCH
   ---------------------------------------------------------------------------
   Every master has a vertical sibling with its own asset id, and before the
   titles existed at all the dashboard was rows of ids with no way to tell a
   master from its crop. They get the same name with the aspect appended, so the
   pair sorts together and reads as a pair.

   Display only. Nothing reads meta.title back; the app's identity lives in
   content.canonical_filename, which is what this copies FROM.
   ============================================================================ */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

let _sb: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!_sb) {
    _sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
      auth: { persistSession: false },
    });
  }
  return _sb;
}

const auth = (): string =>
  Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString("base64");

async function muxTitle(assetId: string): Promise<string | null> {
  const res = await fetch(`https://api.mux.com/video/v1/assets/${assetId}`, {
    headers: { Authorization: `Basic ${auth()}` },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: { meta?: { title?: string } } };
  return body.data?.meta?.title ?? "";
}

async function setMuxTitle(assetId: string, title: string): Promise<string | null> {
  const res = await fetch(`https://api.mux.com/video/v1/assets/${assetId}`, {
    method: "PATCH",
    headers: { Authorization: `Basic ${auth()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ meta: { title } }),
  });
  if (res.ok) return null;
  return `${res.status} ${(await res.text()).slice(0, 160)}`;
}

type Row = {
  id: string;
  title: string | null;
  canonical_filename: string | null;
  source_filename: string | null;
  mux_asset_id: string | null;
  vertical_asset_id: string | null;
};

/** What the dashboard should read. The canonical name, without its extension. */
function wanted(r: Row): string | null {
  const base = r.canonical_filename ?? r.source_filename;
  if (!base) return r.title ?? null;
  return base.replace(/\.[a-z0-9]+$/i, "");
}

async function main() {
  const rows: Row[] = [];
  for (let off = 0; ; off += 1000) {
    const { data } = await sb()
      .from("content")
      .select("id, title, canonical_filename, source_filename, mux_asset_id, vertical_asset_id")
      .not("mux_asset_id", "is", null)
      .range(off, off + 999);
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < 1000) break;
  }

  console.log(`\n  ${rows.length} content row(s) with a Mux asset\n`);

  let checked = 0;
  let wrong = 0;
  let fixed = 0;
  const failures: string[] = [];

  for (const r of rows) {
    const want = wanted(r);
    if (!want || !r.mux_asset_id) continue;

    const current = await muxTitle(r.mux_asset_id);
    checked++;
    if (current === null) {
      failures.push(`${want}: asset not readable (deleted in Mux?)`);
      continue;
    }
    if (current === want) continue;

    wrong++;
    console.log(`    "${current}"`.padEnd(46) + ` -> "${want}"`);
    if (!APPLY) continue;

    const err = await setMuxTitle(r.mux_asset_id, want);
    if (err) failures.push(`${want}: ${err}`);
    else fixed++;

    /* The 9:16 crop, named as the same film. Without the suffix the pair reads
       as a duplicate; with it, they sort together and explain themselves. */
    if (r.vertical_asset_id) {
      const vErr = await setMuxTitle(r.vertical_asset_id, `${want} (9:16)`);
      if (vErr) failures.push(`${want} (9:16): ${vErr}`);
    }
  }

  console.log(
    `\n  checked ${checked} · ${wrong} did not match` +
      (APPLY ? ` · ${fixed} updated` : " · report only, re-run with --apply")
  );
  if (failures.length) {
    console.log(`\n  ${failures.length} failed:`);
    failures.slice(0, 10).forEach((f) => console.log(`    ${f}`));
  }
  console.log("");
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
  main().catch((e) => {
    console.error("\n  FAILED:", e instanceof Error ? e.message : e, "\n");
    process.exit(1);
  });
}
