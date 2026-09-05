/* ============================================================================
   EDIAGD — replace the video behind an existing content row

   REPLACE IN PLACE, NOT UPLOAD-AND-RETIRE. The content row keeps its id, so
   every content_progress row, every daily_completion.video_content_id, and the
   placement that decides where it surfaces all stay attached. Uploading a
   replacement as a NEW row would orphan all of that and leave two rows claiming
   the same placement — survivable today, wrong the moment anybody has watched
   the thing being replaced.

   The old asset is archived rather than deleted: archived_asset_id keeps it
   traceable in the Mux account, so a bad replacement is undone by pointing back
   at it rather than by hunting for a file.

   ORDER MATTERS, AND IT IS ENFORCED HERE:
     upload → (optional trim) → swap the master → derive the vertical
   Trimming after derivation would leave the two formats a second apart. The
   swap marks the existing vertical 'stale' automatically (0058), and the derive
   step then rebuilds it from the new master.

     npm run replace:video -- --id=<content uuid> --file="/path/to.mov"
     npm run replace:video -- --id=… --file=… --trim-start=1
     npm run replace:video -- --id=… --file=… --dry
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import Mux from "@mux/mux-node";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";

const run = promisify(execFile);

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});
const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
  jwtSigningKey: process.env.MUX_SIGNING_KEY_ID!,
  jwtPrivateKey: process.env.MUX_SIGNING_KEY_PRIVATE!,
});

const args = process.argv.slice(2);
const arg = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=");
const contentId = arg("id");
const file = arg("file");
const trimStart = arg("trim-start") ? Number(arg("trim-start")) : null;
const trimEnd = arg("trim-end") ? Number(arg("trim-end")) : null;
const dry = args.includes("--dry");

if (!contentId || !file) {
  console.error("  need --id=<content uuid> and --file=<path>");
  process.exit(1);
}

async function waitForAsset(assetId: string, label: string) {
  let a = await mux.video.assets.retrieve(assetId);
  for (let i = 0; i < 120 && a.status !== "ready"; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    a = await mux.video.assets.retrieve(assetId);
    if (a.status === "errored") {
      throw new Error(`${label} errored: ${JSON.stringify(a.errors)}`);
    }
  }
  if (a.status !== "ready") throw new Error(`${label} did not become ready in time`);
  return a;
}

async function main() {
  /* ---- 1. What are we replacing? ---------------------------------------- */
  const { data: row, error } = await sb
    .from("content")
    .select("id, title, mux_asset_id, mux_playback_id, vertical_status, duration_sec, status")
    .eq("id", contentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error(`no content row ${contentId}`);

  console.log(`\n  Replacing: ${row.title}  (${row.status})`);
  console.log(`    current master  ${String(row.mux_asset_id).slice(0, 14)}…  ${row.duration_sec}s`);
  console.log(`    current vertical ${row.vertical_status}`);

  /* ---- 2. What are we replacing it with? -------------------------------- */
  const { stdout } = await run("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate,codec_name",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", file!,
  ]);
  const [codec, w, h, fps, dur] = stdout.trim().split("\n");
  const bytes = statSync(file!).size;
  const sliceW = Math.round((Number(h) * 9) / 16);

  console.log(`\n  New file: ${file!.split("/").pop()}`);
  console.log(`    ${w}x${h} ${codec} ${fps.split("/")[0]}fps  ${Number(dur).toFixed(1)}s  ${(bytes / 1e6).toFixed(0)} MB`);
  console.log(`    9:16 slice will be ${sliceW}px wide -> ${sliceW >= 1080
    ? `downscaled to 1080. No upscale; this is what a 4K master buys.`
    : `upscaled ${(1080 / sliceW).toFixed(2)}x to 1080 — soft.`}`);
  if (trimStart != null || trimEnd != null) {
    console.log(`    trim: ${trimStart ?? 0}s -> ${trimEnd ?? "end"}`);
  }

  if (dry) { console.log("\n  --dry, stopping here.\n"); return; }

  /* ---- 3. Upload ---------------------------------------------------------- */
  console.log(`\n  Uploading…`);
  const upload = await mux.video.uploads.create({
    cors_origin: "*",
    new_asset_settings: {
      playback_policies: ["signed"],
      /*
       * PREMIUM, AND ONLY FOR MASTERS. video_quality caps what Mux keeps:
       * "basic" tops out at the 1080p tier, so a 4K upload is stored as UHD but
       * read back — including through master access — at about 2K. That was
       * measured, not assumed: a 3840x2160 master ingested as basic came back
       * 2048x1152, which turns the 9:16 slice from 1215px into 648px and forces
       * a 1.67x upscale. It defeats the entire reason for shooting 4K.
       *
       * Derived VERTICALS stay basic on purpose — they are 1080x1920, inside
       * the basic tier already, and premium would cost more for nothing.
       */
      video_quality: "premium",
      max_resolution_tier: "2160p",
      normalize_audio: true,
      inputs: [{ generated_subtitles: [{ language_code: "en", name: "English (auto)" }] }],
    },
  });

  let sent = 0;
  let lastPct = -1;
  const stream = createReadStream(file!);
  stream.on("data", (chunk) => {
    sent += chunk.length;
    const pct = Math.floor((sent / bytes) * 100);
    if (pct !== lastPct && pct % 10 === 0) {
      lastPct = pct;
      process.stdout.write(`    ${pct}%\n`);
    }
  });

  const put = await fetch(upload.url!, {
    method: "PUT",
    body: Readable.toWeb(stream) as unknown as BodyInit,
    // @ts-expect-error duplex is required for a streaming body, absent from DOM types
    duplex: "half",
    headers: { "content-length": String(bytes) },
  });
  if (!put.ok) throw new Error(`upload failed HTTP ${put.status}`);

  let newAssetId: string | null = null;
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const u = await mux.video.uploads.retrieve(upload.id);
    if (u.asset_id) { newAssetId = u.asset_id; break; }
    if (u.status === "errored") throw new Error("Mux upload errored");
  }
  if (!newAssetId) throw new Error("timed out waiting for an asset id");

  let asset = await waitForAsset(newAssetId, "new asset");
  console.log(`    asset ready   ${newAssetId.slice(0, 14)}…  ${asset.aspect_ratio}  ${asset.duration?.toFixed(1)}s`);

  /* ---- 4. Trim, if asked — BEFORE the swap, so both formats share the cut - */
  if (trimStart != null || trimEnd != null) {
    console.log(`\n  Trimming…`);
    const clip = await mux.video.assets.create({
      inputs: [{
        url: `mux://assets/${newAssetId}`,
        ...(trimStart != null ? { start_time: trimStart } : {}),
        ...(trimEnd != null ? { end_time: trimEnd } : {}),
        generated_subtitles: [{ language_code: "en", name: "English (auto)" }],
      }],
      playback_policies: ["signed"],
      // A clip of a master is still a master — see the note on the upload above.
      video_quality: "premium",
      max_resolution_tier: "2160p",
      normalize_audio: true,
    });
    asset = await waitForAsset(clip.id, "clip");
    newAssetId = clip.id;
    console.log(`    trimmed to    ${asset.duration?.toFixed(1)}s`);
  }

  const playback = asset.playback_ids?.find((p) => p.policy === "signed");
  if (!playback) throw new Error("new asset has no signed playback id");

  /* ---- 5. Swap ------------------------------------------------------------ */
  const { data: swapped, error: swapErr } = await sb.rpc("replace_master_asset", {
    _content_id: contentId,
    _new_asset_id: newAssetId,
    _new_playback_id: playback.id,
    _new_duration: asset.duration ? Math.round(asset.duration) : null,
  });
  if (swapErr) throw new Error(swapErr.message);
  console.log(`\n  Swapped. ${JSON.stringify(swapped)}`);

  /* ---- 6. Rebuild the vertical -------------------------------------------- */
  /* Shelling out to the worker rather than duplicating it: one implementation
     of the crop, and it stays the one that gets fixed. */
  console.log(`\n  Deriving the new vertical…`);
  await new Promise<void>((resolve, reject) => {
    const p = spawn("npm", ["run", "derive:vertical", "--", `--id=${contentId}`], {
      stdio: "inherit",
      env: process.env,
    });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`derive exited ${code}`))));
  });

  const { data: after } = await sb
    .from("content")
    .select("duration_sec, mux_playback_id, vertical_playback_id, vertical_status, archived_asset_id")
    .eq("id", contentId)
    .maybeSingle();
  console.log(`\n  Done.`);
  console.log(`    duration   ${after?.duration_sec}s`);
  console.log(`    landscape  ${String(after?.mux_playback_id).slice(0, 16)}…`);
  console.log(`    vertical   ${String(after?.vertical_playback_id).slice(0, 16)}…  (${after?.vertical_status})`);
  console.log(`    archived   ${String(after?.archived_asset_id).slice(0, 16)}…\n`);
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
  main().catch((e) => { console.error(`\n  FAILED: ${e.message}\n`); process.exit(1); });
}
