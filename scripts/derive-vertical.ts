/* ============================================================================
   EDIAGD — derive vertical renditions

   Claims every content row waiting for a 9:16 crop, makes it, and writes the
   result back. Idempotent: a row that already has a ready vertical is skipped,
   and a run that dies halfway leaves the row 'pending' for the next one.

   THIS IS THE WORKER. The webhook can only mark a row pending — a serverless
   function has no ffmpeg and no time. Until this is running somewhere on a
   schedule, "automatic" means "automatic once somebody runs this".

     npm run derive:vertical              everything pending, stale or failed
     npm run derive:vertical -- --id=<content uuid>
     npm run derive:vertical -- --dry     list what it would do
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import Mux from "@mux/mux-node";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

const run = promisify(execFile);

const SB_URL = process.env.SB_URL!;
const SB_KEY = process.env.SB_KEY!;
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
  jwtSigningKey: process.env.MUX_SIGNING_KEY_ID!,
  jwtPrivateKey: process.env.MUX_SIGNING_KEY_PRIVATE!,
});

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith("--id="))?.slice(5);
const dry = args.includes("--dry");

type Row = {
  content_id: string;
  title: string;
  mux_asset_id: string;
  vertical_status: string;
  duration_sec: number | null;
};

/** Highest-quality readable source: the master if Mux will prepare one. */
async function sourceUrl(assetId: string): Promise<{ url: string; quality: string }> {
  try {
    await mux.video.assets.updateMasterAccess(assetId, { master_access: "temporary" });
    for (let i = 0; i < 40; i++) {
      const a = await mux.video.assets.retrieve(assetId);
      if (a.master?.status === "ready" && a.master.url) return { url: a.master.url, quality: "master" };
      if (a.master?.status === "errored") break;
      await new Promise((r) => setTimeout(r, 5000));
    }
  } catch { /* master access may be off account-wide */ }

  const a = await mux.video.assets.retrieve(assetId);
  const pid = a.playback_ids?.find((p) => p.policy === "signed");
  if (!pid) throw new Error("no signed playback id to read from");
  const token = await mux.jwt.signPlaybackId(pid.id, { type: "video", expiration: "3600s" });
  return { url: `https://stream.mux.com/${pid.id}.m3u8?token=${token}`, quality: "hls (capped at top rendition)" };
}

async function deriveOne(row: Row) {
  console.log(`\n  ${row.title}`);
  console.log(`    source asset  ${row.mux_asset_id.slice(0, 14)}…  (${row.vertical_status})`);

  const { url, quality } = await sourceUrl(row.mux_asset_id);
  console.log(`    reading from  ${quality}`);

  // Refuse to crop something that is already portrait.
  const { stdout } = await run("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height", "-of", "csv=p=0", url,
  ]);
  const [w, h] = stdout.trim().split(",").map(Number);
  console.log(`    source frame  ${w}x${h}`);
  if (h >= w) {
    throw new Error(`already portrait (${w}x${h}) — nothing to crop`);
  }
  /* The number that matters is the width of the SLICE, not of the source. A
     1280x720 frame yields a 405px-wide slice, which is a 2.7x upscale to 1080
     and visibly soft. A 4K master yields 1215px and upscales barely at all. */
  const sliceW = Math.round((h * 9) / 16);
  if (sliceW < 1080) {
    console.log(
      `    NOTE: the 9:16 slice is only ${sliceW}px wide (${Math.round((100 * sliceW) / w)}% of the frame), ` +
      `upscaled ${(1080 / sliceW).toFixed(2)}x to 1080. Soft. A 4K master gives 1215px and needs no upscale.`
    );
  }

  const dir = await mkdtemp(path.join(tmpdir(), "ediagd-vertical-"));
  const out = path.join(dir, "vertical.mp4");
  try {
    /* Crop a full-height centred 9:16 slice, THEN scale. Scaling first would
       resample pixels about to be discarded — slower and softer. */
    await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", url,
      "-vf", "crop=ih*9/16:ih,scale=1080:1920:flags=lanczos",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "160k",
      "-movflags", "+faststart",
      out,
    ], { maxBuffer: 1024 * 1024 * 32, timeout: 1000 * 60 * 30 });

    const { size } = await stat(out);
    console.log(`    cropped       ${(size / 1024 / 1024).toFixed(1)} MB`);

    const upload = await mux.video.uploads.create({
      cors_origin: "*",
      new_asset_settings: {
        playback_policies: ["signed"],
        video_quality: "basic",
        normalize_audio: true,
        inputs: [{ generated_subtitles: [{ language_code: "en", name: "English (auto)" }] }],
      },
    });

    const res = await fetch(upload.url!, {
      method: "PUT",
      body: Readable.toWeb(createReadStream(out)) as unknown as BodyInit,
      // @ts-expect-error duplex is required for a streaming body and not in the DOM types
      duplex: "half",
      headers: { "content-length": String(size) },
    });
    if (!res.ok) throw new Error(`upload failed HTTP ${res.status}`);
    console.log(`    uploaded      waiting for Mux…`);

    let assetId: string | null = null;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const u = await mux.video.uploads.retrieve(upload.id);
      if (u.asset_id) { assetId = u.asset_id; break; }
      if (u.status === "errored") throw new Error("Mux upload errored");
    }
    if (!assetId) throw new Error("timed out waiting for an asset id");

    let asset = await mux.video.assets.retrieve(assetId);
    for (let i = 0; i < 60 && asset.status !== "ready"; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      asset = await mux.video.assets.retrieve(assetId);
      if (asset.status === "errored") throw new Error("Mux asset errored");
    }

    const pid = asset.playback_ids?.find((p) => p.policy === "signed");
    if (!pid) throw new Error("derived asset has no signed playback id");

    await sb.rpc("set_vertical_rendition", {
      _content_id: row.content_id,
      _asset_id: assetId,
      _playback_id: pid.id,
    });

    console.log(`    VERTICAL      ${pid.id.slice(0, 14)}…  ${asset.aspect_ratio}  ${asset.duration?.toFixed(1)}s`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  let q = sb.from("vertical_derivation_queue").select("*");
  if (only) q = q.eq("content_id", only);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Row[];
  console.log(`  ${rows.length} row(s) awaiting a vertical rendition`);
  if (dry) {
    for (const r of rows) console.log(`    ${r.vertical_status.padEnd(8)} ${r.title}`);
    return;
  }

  let ok = 0;
  for (const row of rows) {
    try {
      await deriveOne(row);
      ok++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`    FAILED — ${msg}`);
      await sb.rpc("fail_vertical_rendition", { _content_id: row.content_id, _error: msg });
    }
  }
  console.log(`\n  done: ${ok}/${rows.length} derived\n`);
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
  main().catch((e) => { console.error(e); process.exit(1); });
}
