import "server-only";

/* ============================================================================
   EDIAGD — deriving a 9:16 vertical from a landscape master

   Mitch shoots 4K landscape, centre-framed. The app plays vertical. Mux cannot
   bridge that — it transcodes to many resolutions at the SAME aspect ratio and
   has no content-aware reframing anywhere — so the crop is ours to make.

   ---------------------------------------------------------------------------
   THIS CANNOT RUN IN A SERVERLESS FUNCTION, AND THAT IS THE MAIN CONSTRAINT
   ---------------------------------------------------------------------------
   It shells out to ffmpeg and moves hundreds of megabytes through a temp
   directory. A Vercel function has no ffmpeg binary, a hard timeout, and a
   read-only filesystem outside /tmp with a small budget. So:

     * The WEBHOOK marks the content row vertical_status = 'pending'. That is
       all a serverless path can honestly do.
     * A WORKER — this module, driven by scripts/derive-vertical.ts — claims
       pending rows and does the work. Today that is run by hand; it is written
       to be a container or a cron box without changes.

   Pretending otherwise would produce a pipeline that looks automatic and
   silently derives nothing.

   ---------------------------------------------------------------------------
   WHERE THE SOURCE PIXELS COME FROM
   ---------------------------------------------------------------------------
   Mux keeps the master but does not serve it by default. Temporary master
   access gives a signed download URL for 24 hours, which is the highest-quality
   source available and the right input for a crop.

   Failing that — an asset with master access disabled at the account level, or
   one still preparing — the HLS ladder is a usable fallback: ffmpeg reads an
   .m3u8 directly. It is capped at the top rendition rather than the true
   master, so it is second choice, not first.

   ---------------------------------------------------------------------------
   THE CROP IS CENTRED, AND THAT IS A POLICY NOT A GUESS
   ---------------------------------------------------------------------------
   Centre-crop only works because the shooting policy says centre-framed. There
   is no subject tracking here and there should not be: a face-following crop
   that is right 95% of the time is worse than a fixed one that is predictable,
   because the 5% is a jump cut nobody authored.
   ============================================================================ */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { muxClient } from "@/lib/mux/playback";

const run = promisify(execFile);

/** 1080x1920. The standard vertical frame; 4K masters downscale into it cleanly. */
export const VERTICAL_WIDTH = 1080;
export const VERTICAL_HEIGHT = 1920;

export type DeriveResult = {
  assetId: string;
  playbackId: string;
  sourceQuality: "master" | "hls";
  note?: string;
};

/**
 * Get a downloadable URL for an asset's highest-quality source.
 *
 * Tries temporary master access first and waits for Mux to prepare it. Falls
 * back to the signed HLS ladder, which always works but tops out at the best
 * rendition rather than the original.
 */
async function sourceUrlFor(assetId: string): Promise<{ url: string; quality: "master" | "hls" }> {
  const mux = muxClient();

  try {
    await mux.video.assets.updateMasterAccess(assetId, { master_access: "temporary" });

    // Preparing a master is not instant. Poll rather than assume.
    for (let i = 0; i < 40; i++) {
      const a = await mux.video.assets.retrieve(assetId);
      if (a.master?.status === "ready" && a.master.url) {
        return { url: a.master.url, quality: "master" };
      }
      if (a.master?.status === "errored") break;
      await new Promise((r) => setTimeout(r, 5000));
    }
  } catch {
    /* Master access can be disabled account-wide. Fall through. */
  }

  const asset = await muxClient().video.assets.retrieve(assetId);
  const signedId = asset.playback_ids?.find((p) => p.policy === "signed");
  if (!signedId) throw new Error(`Asset ${assetId} has no signed playback id to read from.`);

  const token = await mux.jwt.signPlaybackId(signedId.id, {
    type: "video",
    expiration: "3600s",
  });
  return { url: `https://stream.mux.com/${signedId.id}.m3u8?token=${token}`, quality: "hls" };
}

/**
 * Crop a landscape source to a centred 9:16 and upload it as its own Mux asset.
 *
 * The uploaded crop gets the same treatment every other asset gets — signed
 * playback, generated captions, normalised audio — because a derived rendition
 * that is less accessible than its master is a regression nobody would notice
 * until somebody needed the captions.
 */
export async function deriveVertical(opts: {
  sourceAssetId: string;
  /** Where to PUT the cropped file. From createDirectUpload. */
  uploadUrl: string;
}): Promise<{ sourceQuality: "master" | "hls"; bytes: number }> {
  const { url, quality } = await sourceUrlFor(opts.sourceAssetId);

  const dir = await mkdtemp(path.join(tmpdir(), "ediagd-vertical-"));
  const out = path.join(dir, "vertical.mp4");

  try {
    /*
     * crop=ih*9/16:ih  — take a full-height slice whose width is 9/16 of the
     * height, centred by default. Then scale to exactly 1080x1920.
     *
     * Explicitly NOT scale-then-crop: scaling first would resample pixels that
     * are about to be thrown away, which is slower and slightly softer.
     *
     * -movflags +faststart puts the moov atom at the front. Mux ingests either
     * way, but a front-loaded file starts transcoding without a full read.
     */
    await run(
      "ffmpeg",
      [
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", url,
        "-vf", `crop=ih*9/16:ih,scale=${VERTICAL_WIDTH}:${VERTICAL_HEIGHT}:flags=lanczos`,
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k",
        "-movflags", "+faststart",
        out,
      ],
      { maxBuffer: 1024 * 1024 * 32, timeout: 1000 * 60 * 30 }
    );

    const { size } = await stat(out);

    const file = await import("node:fs").then((fs) => fs.createReadStream(out));
    const res = await fetch(opts.uploadUrl, {
      method: "PUT",
      body: Readable.toWeb(file) as unknown as BodyInit,
      duplex: "half",
      headers: { "content-length": String(size) },
    } as RequestInit & { duplex: "half" });

    if (!res.ok) throw new Error(`Upload of the crop failed: HTTP ${res.status}`);

    return { sourceQuality: quality, bytes: size };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Probe a source so a caller can refuse to crop something already vertical. */
export async function probeOrientation(url: string): Promise<{ w: number; h: number }> {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-of", "csv=p=0",
    url,
  ]);
  const [w, h] = stdout.trim().split(",").map(Number);
  return { w, h };
}

export { createWriteStream, pipeline };
