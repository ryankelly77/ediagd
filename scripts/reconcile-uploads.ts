/* ============================================================================
   EDIAGD — build the content rows a webhook could not

     npm run reconcile:uploads          # report
     npm run reconcile:uploads -- --apply

   ---------------------------------------------------------------------------
   THE FAILURE THIS EXISTS FOR, AND IT IS SILENT
   ---------------------------------------------------------------------------
   Mux transcoded all 46 films and fired every webhook. The handler updated
   mux_upload to `ready`, recorded the asset id, and then its content insert
   failed — because the ingest had routed pitch films to a placement that is not
   in the content_placement enum. Postgres refused the row; the handler did not
   check; the upload sat `ready` with a null content_id.

   Nothing anywhere said so. The upload table looked finished, Mux looked
   finished, and forty-one films simply did not exist. The bug is fixed, but a
   webhook does not fire twice: those assets are transcoded and paid for and
   need their rows built from what the draft already holds.

   ---------------------------------------------------------------------------
   IT MIRRORS THE WEBHOOK, IT DOES NOT REINVENT IT
   ---------------------------------------------------------------------------
   Same columns, same defaults, same draft status — a person decides a video is
   ready to be seen, and nothing here publishes. The one thing it cannot
   reproduce is the signed playback id, which the webhook mints from the asset,
   so that is read back from Mux for each asset rather than guessed.
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

type Draft = Record<string, unknown>;
type Row = {
  id: string;
  upload_id: string;
  asset_id: string | null;
  playback_id: string | null;
  status: string;
  draft: Draft | null;
  content_id: string | null;
};

/** The asset's playback id, from Mux. The webhook mints this; we ask for it. */
async function playbackIdFor(assetId: string): Promise<{ id: string; policy: string } | null> {
  const auth = Buffer.from(
    `${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`
  ).toString("base64");
  const res = await fetch(`https://api.mux.com/video/v1/assets/${assetId}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    data?: {
      playback_ids?: { id: string; policy: string }[];
      duration?: number;
      aspect_ratio?: string;
    };
  };
  const p = body.data?.playback_ids?.[0];
  return p ? { id: p.id, policy: p.policy } : null;
}

async function assetMeta(assetId: string) {
  const auth = Buffer.from(
    `${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`
  ).toString("base64");
  const res = await fetch(`https://api.mux.com/video/v1/assets/${assetId}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    data?: { duration?: number; aspect_ratio?: string; tracks?: { type: string; status?: string }[] };
  };
  return body.data ?? null;
}

async function main() {
  const { data } = await sb()
    .from("mux_upload")
    .select("id, upload_id, asset_id, playback_id, status, draft, content_id")
    .is("content_id", null)
    .not("asset_id", "is", null)
    .order("created_at", { ascending: true });

  const rows = ((data ?? []) as Row[]).filter((r) => r.draft?.canonical_filename);

  console.log(`\n  ${rows.length} upload(s) are ready with an asset and no content row\n`);
  if (rows.length === 0) return;

  for (const r of rows.slice(0, 50)) {
    const d = r.draft ?? {};
    console.log(
      `    ${String(d.canonical_filename).padEnd(38)} ` +
        `${String(d.collection ?? "—").padEnd(20)} ${String(d.placement ?? "—")}`
    );
  }

  if (!APPLY) {
    console.log("\n  Report only. Re-run with --apply to build the rows.\n");
    return;
  }

  let made = 0;
  const failed: { file: string; error: string }[] = [];

  for (const r of rows) {
    const d = r.draft ?? {};
    const file = String(d.canonical_filename);
    try {
      const meta = r.asset_id ? await assetMeta(r.asset_id) : null;
      const playback = r.playback_id
        ? { id: r.playback_id, policy: "signed" }
        : r.asset_id
          ? await playbackIdFor(r.asset_id)
          : null;
      if (!playback) throw new Error("no playback id on the asset");

      const hasCaptions = (meta?.tracks ?? []).some(
        (t) => t.type === "text" && t.status === "ready"
      );

      const { data: content, error } = await sb()
        .from("content")
        .insert({
          type: (d.type as string) ?? "advisor_video",
          title: (d.title as string) ?? "Untitled video",
          body: (d.body as string) ?? null,
          collection: (d.collection as string) ?? null,
          voice: (d.voice as string) ?? null,
          version: (d.version as number) ?? 1,
          format: "video",
          source_filename: (d.source_filename as string) ?? null,
          canonical_filename: (d.canonical_filename as string) ?? null,
          placement: (d.placement as string) ?? null,
          service_family: (d.service_family as string) ?? null,
          subcategory: (d.subcategory as string) ?? null,
          op_code: (d.op_code as string) ?? null,
          stage: (d.stage as string) ?? null,
          mux_asset_id: r.asset_id,
          mux_playback_id: playback.id,
          mux_playback_policy: playback.policy === "public" ? "public" : "signed",
          duration_sec: meta?.duration ? Math.round(meta.duration) : null,
          aspect_ratio: meta?.aspect_ratio ?? null,
          captions_ready: hasCaptions,
          /* DRAFT, exactly as the webhook does. A machine decides a video
             exists; a person decides it is ready to be seen. */
          status: "draft",
          vertical_status: "pending",
        })
        .select("id")
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!content?.id) throw new Error("insert returned no row");

      await sb()
        .from("mux_upload")
        .update({ content_id: content.id, playback_id: playback.id })
        .eq("id", r.id);

      console.log(`    ${file}  ->  ${content.id.slice(0, 8)}…`);
      made++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`    FAILED ${file}: ${msg}`);
      failed.push({ file, error: msg });
    }
  }

  console.log(`\n  built ${made} row(s), ${failed.length} failed.\n`);
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
