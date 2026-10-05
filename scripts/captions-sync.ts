/* ============================================================================
   EDIAGD — captions:sync. Make content.captions_ready describe Mux.

     export SB_URL=... SB_KEY=<service role>
     export MUX_TOKEN_ID=... MUX_TOKEN_SECRET=...
     npm run captions:sync -- --dry-run     # report, write nothing
     npm run captions:sync                  # report and write

   ---------------------------------------------------------------------------
   WHY THE COLUMN IS WRONG, WHICH IS THE WHOLE REASON THIS EXISTS
   ---------------------------------------------------------------------------
   `captions_ready` is written in exactly ONE place — the `asset.ready` webhook
   (app/api/mux/webhook/route.ts) — and never refreshed afterwards. Mux generates
   English subtitles asynchronously, so for most films the track arrives AFTER
   the asset was ready, after the only writer has run. The column therefore
   records "did this asset have captions at the instant it finished
   transcoding", while its NAME claims "does this film have captions".

   Measured on production before this script existed: the column said 2 of 141
   published Craft films were captioned. Mux held a ready English text track for
   all 141.

   That is a label that is not evidence of what is behind it, and the fix is not
   a one-off backfill — a backfill is a promise, and the same drift starts again
   the next morning. This is re-runnable and is listed in INGEST.md with the
   other re-runnable backfills.

   ---------------------------------------------------------------------------
   IT SYNCS BOTH DIRECTIONS, AND THAT IS DELIBERATE
   ---------------------------------------------------------------------------
   A script that only ever sets the column TRUE would be a second writer with
   the same defect as the first: it could never record a track being deleted or
   a reshoot arriving without one. So the column is set to whatever Mux says,
   true or false, and both counts are reported.

   ---------------------------------------------------------------------------
   THE SUMMARY IS COMPUTED, AND SO IS THE EXIT CODE
   ---------------------------------------------------------------------------
   ingest-videos.ts once printed "Mux is transcoding" over 102 failures and
   exited 0. Every line below is derived from a counter this run incremented,
   and the exit code is a function of the failure count.
   ============================================================================ */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import Mux from "@mux/mux-node";

const DRY = process.argv.includes("--dry-run");

const SB_URL = process.env.SB_URL;
const SB_KEY = process.env.SB_KEY;
if (!SB_URL || !SB_KEY) {
  console.error("captions:sync — SB_URL and SB_KEY (service role) are required.");
  process.exit(1);
}
const tokenId = process.env.MUX_TOKEN_ID;
const tokenSecret = process.env.MUX_TOKEN_SECRET;
if (!tokenId || !tokenSecret) {
  console.error("captions:sync — MUX_TOKEN_ID and MUX_TOKEN_SECRET are required.");
  process.exit(1);
}

const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
const mux = new Mux({ tokenId, tokenSecret });

type Row = {
  id: string;
  title: string | null;
  collection: string | null;
  mux_asset_id: string | null;
  captions_ready: boolean | null;
};

async function allFilms(): Promise<Row[]> {
  const out: Row[] = [];
  for (let page = 0; page < 50; page++) {
    const { data, error } = await sb
      .from("content")
      .select("id, title, collection, mux_asset_id, captions_ready")
      .eq("status", "published")
      .is("retired_at", null)
      .not("mux_asset_id", "is", null)
      .order("id", { ascending: true })
      .range(page * 500, page * 500 + 499);
    if (error) throw new Error(`content: ${error.message}`);
    out.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 500) return out;
  }
  throw new Error("content: more than 50 pages");
}

/**
 * Does Mux hold a usable subtitle track for this asset?
 *
 * A track that exists but is `errored` or still `preparing` is not a caption an
 * advisor can switch on, so `status === 'ready'` is part of the question rather
 * than a detail. Returns null when the asset could not be read at all — which
 * is a FAILURE, not a false: writing false because an API call timed out would
 * manufacture exactly the wrong answer this script exists to correct.
 */
async function hasReadyText(assetId: string): Promise<boolean | null> {
  try {
    const asset: any = await mux.video.assets.retrieve(assetId);
    const tracks: any[] = asset?.tracks ?? [];
    return tracks.some(
      (t) => t?.type === "text" && t?.status === "ready"
    );
  } catch {
    return null;
  }
}

const main = async () => {
  const films = await allFilms();

  const before = {
    total: films.length,
    trueN: films.filter((f) => f.captions_ready === true).length,
  };
  console.log(
    `captions:sync — ${before.total} published, unretired films carrying a Mux asset.`
  );
  console.log(
    `  column BEFORE: ${before.trueN} true, ${before.total - before.trueN} false/null`
  );
  if (DRY) console.log("  --dry-run: nothing will be written.\n");
  else console.log("");

  let setTrue = 0;
  let setFalse = 0;
  let unchanged = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const f of films) {
    const ready = await hasReadyText(f.mux_asset_id as string);
    if (ready === null) {
      failed++;
      failures.push(`${f.title ?? f.id} (asset ${f.mux_asset_id})`);
      continue;
    }
    const current = f.captions_ready === true;
    if (current === ready) {
      unchanged++;
      continue;
    }
    if (!DRY) {
      const { error } = await sb
        .from("content")
        .update({ captions_ready: ready })
        .eq("id", f.id);
      if (error) {
        failed++;
        failures.push(`${f.title ?? f.id}: ${error.message}`);
        continue;
      }
    }
    if (ready) setTrue++;
    else setFalse++;
  }

  /* ---- the summary, every line of it from a counter above --------------- */
  console.log(`  ${DRY ? "would set" : "set"} true:   ${setTrue}`);
  console.log(`  ${DRY ? "would set" : "set"} false:  ${setFalse}`);
  console.log(`  already correct:  ${unchanged}`);
  console.log(`  FAILED to read:   ${failed}`);
  for (const line of failures.slice(0, 20)) console.log(`      ${line}`);
  if (failures.length > 20) console.log(`      … and ${failures.length - 20} more`);

  if (!DRY) {
    /* Read the column back rather than reporting what we intended to write. */
    const after = await allFilms();
    const afterTrue = after.filter((f) => f.captions_ready === true).length;
    console.log(
      `\n  column AFTER:  ${afterTrue} true, ${after.length - afterTrue} false/null` +
        `   (before: ${before.trueN} true)`
    );
    if (afterTrue !== before.trueN + setTrue - setFalse) {
      console.error(
        `  MISMATCH: read back ${afterTrue} true, expected ${before.trueN + setTrue - setFalse}.`
      );
      process.exit(1);
    }
  }

  /*
   * WHAT ELSE READS THIS COLUMN, asked because fixing one reader is how a
   * value gets corrected in one layer and left wrong in four:
   *   family_pitch_supply.fully_captioned  (0123, 0125) — bool_and over it
   *   scripts/focus-family-acceptance.ts   — SELECTs it, asserts nothing on it
   * Nothing in the daily loop, no screen and no notification keys on it, so
   * this run changes one view column and breaks no assertion.
   */
  if (failed > 0) {
    console.error(`\ncaptions:sync FAILED for ${failed} film(s).`);
    process.exit(1);
  }
  console.log("\ncaptions:sync complete.");
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
