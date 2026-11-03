/* ============================================================================
   THE ONE CUTTER

   A cut is made in exactly one place in this repo. This is it.

   Before this file there were three copies of the same twelve lines — in
   sync-repair.mjs, in sync-finish.mjs (three times over, for phases 2, 3 and
   5) and nowhere at all in trim-apply.ts, which was the script INGEST.md names
   as the cutter and which had no ffmpeg in it. #87 removed trimming from
   replace:video and documented trim:apply as its replacement, but never wrote
   that half; the flags trim-apply passes have been refused since.

   Copies of a cut are not a style problem here. The method below is the
   settlement of October's repair: 226 of 462 published films were out of sync
   between picture and sound, every one of them having passed the checks in
   place at the time. Each property is load-bearing, and a paraphrase in a
   fourth copy is a chance to drop one silently.

   ---------------------------------------------------------------------------
   WHAT MAKES THIS CUT THE CUT
   ---------------------------------------------------------------------------
   FROM THE DISK MASTER, never a Mux asset. `mux://assets/<clip>` does not
   deliver the clip's timeline: Mux re-resolves to the underlying source and
   lands on a keyframe before the clip's zero, returning exactly the length
   asked for and the wrong content. Measured at +4.7s on a Walk-Around film,
   and at +1253 / -214 / -181 ms on three trial films where the local
   re-encode fixed two of them to -20 and -26 ms.

   ACCURATE SEEK BEFORE `-i`. In that position ffmpeg decodes from the nearest
   keyframe and discards, so the output starts where it was asked to. After
   `-i` it is a fast seek that lands on the keyframe instead.

   FULL RE-ENCODE OF BOTH STREAMS. No stream copy anywhere in a cut. A
   `-c copy` cut starts video at the preceding keyframe and audio at the
   requested instant, and the result is a file that plays out of sync and that
   Mux does not even reproduce faithfully — proven, 2 November: a stream-copy
   cut of a 4K master came back from Mux ~1 second out from its own source
   file and the sync gate refused it in both directions.

   CAPTIONS REQUESTED INSIDE `inputs[0]`, not beside playback_policy. At the
   top level of new_asset_settings Mux accepts the request, creates the asset,
   and silently generates nothing — which is how 256 masters and 261 verticals
   lost their captions without one error being raised.

   ---------------------------------------------------------------------------
   WHAT THIS DELIBERATELY DOES NOT DO
   ---------------------------------------------------------------------------
   It does not gate, swap, or write a ledger row. The caller does all three,
   because each caller swaps differently: trim:apply hands the cut to
   replace:video (one swap path), the sync repair calls the RPC directly. What
   must not differ is the cut, and that is what lives here.

   The gate belongs to the caller for a reason worth stating: the asset is
   measured against THE FILE IT WAS CUT FROM, and only the caller knows
   whether that is the file it just wrote (a fresh take) or the master the cut
   came out of. Getting that pair wrong is exactly the defect #88 fixed.
   ============================================================================ */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const MAXBUF = 256 * 1024 * 1024;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Find a film's disk master by the names it is known by, under a root.
 *
 * It lives beside the cutter because "cut from the disk master" is useless
 * without "and here is how the disk master is found" — and the version of this
 * that lived in replace-video.ts resolved it from the content ROW, which is
 * how a v2 asset came to be gated against its v1 master (#88).
 *
 * MATCH ON WHAT WAS OBSERVED. canonical_filename first, because a published
 * file was renamed to it; source_filename second, for anything still carrying
 * the name it had on the way in. Both are names a file HAS, not names anybody
 * derived.
 *
 * @param {string} root  VIDEO_MASTERS_DIR
 * @param {(string|null|undefined)[]} names  in order of preference
 * @returns {string|null}
 */
export function findMaster(root, names) {
  if (!root) return null;
  const index = new Map();
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f); else index.set(e.name.toLowerCase(), f);
    }
  })(root);
  for (const n of names) {
    if (!n) continue;
    const hit = index.get(String(n).toLowerCase());
    if (hit) return hit;
  }
  return null;
}

/**
 * Cut a window out of a disk master, full re-encode, both streams.
 *
 * @param {object} o
 * @param {string} o.master   absolute path to the disk master
 * @param {number} o.start    seconds into the master where the content begins
 * @param {number} o.duration seconds of content to keep
 * @param {string} o.out      absolute path to write. Its BASENAME becomes the
 *   uploaded file's name, which replace:video turns into canonical_filename —
 *   so a caller that wants the row renamed names this file accordingly.
 * @returns {string} the path written
 */
export function cutFromMaster({ master, start, duration, out }) {
  if (!(duration > 0)) throw new Error(`cutFromMaster: duration must be positive, got ${duration}`);
  if (!(start >= 0)) throw new Error(`cutFromMaster: start must be >= 0, got ${start}`);
  execFileSync("ffmpeg", [
    "-nostdin", "-v", "error",
    /* accurate seek: BEFORE -i */
    "-ss", start.toFixed(3),
    "-i", master,
    "-t", duration.toFixed(3),
    /* both streams re-encoded; no copy anywhere */
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k",
    "-movflags", "+faststart", "-y", out,
  ], { stdio: "pipe", maxBuffer: MAXBUF });
  return out;
}

/**
 * Upload a finished local file to Mux as a new asset and wait for ready.
 *
 * @param {object} o
 * @param {string} o.file          local path to upload
 * @param {string} o.passthrough   Mux passthrough, so the asset says where it came from
 * @param {(p: string, init?: object) => Promise<any>} o.mux  the caller's Mux fetch helper
 * @param {(s: string) => void} [o.say]
 * @returns {Promise<{assetId: string|null, playbackId: string|null, asset: any|null, why: string|null}>}
 */
export async function uploadAsNewAsset({ file, passthrough, mux, say = () => {} }) {
  const up = await mux("/uploads", {
    method: "POST",
    body: JSON.stringify({
      new_asset_settings: {
        playback_policy: ["signed"],
        video_quality: "basic",
        passthrough,
        /* INSIDE inputs. See the header: at the top level Mux accepts it and
           generates nothing, silently. */
        inputs: [{ generated_subtitles: [{ language_code: "en", name: "English (auto)" }] }],
      },
      cors_origin: "*",
    }),
  });
  execFileSync("curl", ["-sS", "--fail", "-X", "PUT", "--upload-file", file, up.url],
    { stdio: "pipe", maxBuffer: MAXBUF });

  let assetId = null;
  for (let i = 0; i < 100 && !assetId; i++) {
    const u = await mux(`/uploads/${up.id}`);
    if (u.asset_id) { assetId = u.asset_id; break; }
    await sleep(3000);
  }
  if (!assetId) return { assetId: null, playbackId: null, asset: null, why: "upload produced no asset" };
  say(`    asset ${assetId.slice(0, 14)}… transcoding`);

  let asset = null;
  for (let i = 0; i < 480; i++) {           /* 40 minutes */
    const a = await mux(`/assets/${assetId}`);
    if (a.status === "ready") { asset = a; break; }
    if (a.status === "errored") return { assetId, playbackId: null, asset: null, why: "asset errored in Mux" };
    await sleep(5000);
  }
  if (!asset) return { assetId, playbackId: null, asset: null, why: "asset never became ready" };
  return { assetId, playbackId: (asset.playback_ids ?? [])[0]?.id ?? null, asset, why: null };
}

/** Cut, then upload. The two halves are separate above so a caller can cut
 *  without uploading (a dry run that wants to measure the file it would send). */
export async function cutAndUpload(o) {
  const out = cutFromMaster(o);
  const r = await uploadAsNewAsset({ ...o, file: out });
  return { ...r, cutPath: out };
}
