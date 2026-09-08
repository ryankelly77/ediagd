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

   THE DRIVE SIDE IS ARCHIVED TOO, and it was not until this was written. The
   Mux asset moved to archived_asset_id while the superseded master stayed on
   the published shelf, so `02 - Published/Onboarding` held two Welcome films
   with only one row pointing at either — a folder claiming something the data
   contradicted. The old master now moves to `04 - Archive`, renamed with the
   version that replaced it, which is the same act as archived_asset_id in the
   place a person actually looks.

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
import { mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
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
/*
 * ---- TRIM SOMETHING ALREADY HERE -----------------------------------------
 *
 * The batch that prompted this arrives with a spoken slate on the front of
 * every film — a few seconds before Mitch says "Aloha" — and the cut point is
 * different in each one, so it comes from the transcript rather than from a
 * constant.
 *
 * Those films reach Mux through two different doors: a new film is a fresh
 * ingest, a reshoot is a replacement. Trimming them would have meant a trim in
 * the ingest path as well as this one — two implementations of clip → swap →
 * re-derive, and the ingest copy would have been the one that eventually
 * forgot the derive.
 *
 * So neither door trims. Everything lands untrimmed, and then this runs once
 * per film against the row that is already there. `--trim-only` is this whole
 * script minus its first half: no file, no upload, the CURRENT master as the
 * clip source, and the same swap and re-derive afterwards.
 */
const trimOnly = args.includes("--trim-only");

if (!contentId || (!file && !trimOnly)) {
  console.error("  need --id=<content uuid> and --file=<path>");
  console.error("  or:  --id=<content uuid> --trim-start=<seconds> --trim-only");
  process.exit(1);
}
if (trimOnly && trimStart == null && trimEnd == null) {
  console.error("  --trim-only needs --trim-start and/or --trim-end");
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

/**
 * Move the master this replaced out of `02 - Published` and into `04 - Archive`.
 *
 * Named with what superseded it, so the folder explains itself: the reason a
 * file is archived is the only thing anybody wants to know about it later.
 *
 * Located by walking up from the published shelf rather than by configuration,
 * for the same reason the ingest derives its destination: the masters folders
 * are always siblings, and an absolute path breaks the moment the Drive is
 * mounted somewhere else.
 */
async function archiveOldMaster(row: {
  collection: string | null;
  version: number | null;
  canonical_filename: string | null;
  title: string | null;
}): Promise<void> {
  const masters = process.env.VIDEO_MASTERS_DIR;
  if (!masters) return; // not configured: nothing to move, nothing to say
  if (!row.collection || !row.canonical_filename) return;

  const shelf = path.join(masters, "02 - Published", row.collection);
  const archive = path.join(masters, "04 - Archive");
  const oldVersion = row.version ?? 1;

  /* Both spellings: what the ingest files (canonical, .MOV) and what an older
     hand-named drop may have left. */
  const candidates = [
    row.canonical_filename,
    row.canonical_filename.replace(/\.mov$/i, ".MOV"),
  ];

  for (const name of candidates) {
    const from = path.join(shelf, name);
    try {
      await stat(from);
    } catch {
      continue;
    }
    const to = path.join(
      archive,
      name.replace(/(\.[a-z0-9]+)$/i, ` (superseded by v${oldVersion + 1})$1`)
    );
    try {
      await mkdir(archive, { recursive: true });
      await rename(from, to);
      console.log(`\n  archived the old master -> 04 - Archive/${path.basename(to)}`);
    } catch (e) {
      console.log(`\n  could not archive the old master: ${e instanceof Error ? e.message : e}`);
    }
    return;
  }
}

/**
 * Put the new master on the shelf the old one just left.
 *
 * ---------------------------------------------------------------------------
 * ARCHIVING THE OLD ONE WAS ONLY HALF OF IT
 * ---------------------------------------------------------------------------
 * This script moved the superseded master into 04 - Archive and left the
 * replacement wherever it was dropped. After fifty-four reshoots that produced
 * a Published/Mindset folder with fourteen films in it and a Drop Zone holding
 * fifty-four finished masters — the shelf understating the library by two
 * thirds, and the Drop Zone reading as fifty-four open items when none of them
 * were.
 *
 * The ingest has always filed its own finished masters for exactly the reason
 * in its comment: the Drop Zone should answer "what still needs a decision"
 * without anybody cross-referencing a database. A replacement is a finished
 * master too.
 *
 * BEST EFFORT, AFTER THE SWAP. The row is already correct and the video is
 * already live; a file that will not move is a note to a person, not a reason
 * to fail a run that has succeeded.
 */
async function fileNewMaster(row: { collection: string | null }, from: string) {
  try {
    const shelf = path.join(
      path.dirname(path.dirname(from)),
      "02 - Published",
      row.collection ?? "Mindset"
    );
    await mkdir(shelf, { recursive: true });
    const to = path.join(shelf, path.basename(from));
    /* Never overwrite: two files that disagree is worse than one in the wrong
       folder, and the wrong folder is visible. */
    try {
      await stat(to);
      console.log(`\n  already on the shelf, left in place: ${path.basename(to)}`);
      return;
    } catch {
      /* not there — good */
    }
    await rename(from, to);
    console.log(`\n  filed the new master -> 02 - Published/${row.collection}/${path.basename(to)}`);
  } catch (e) {
    console.log(`\n  could not file the new master: ${e instanceof Error ? e.message : e}`);
  }
}

async function main() {
  /* ---- 1. What are we replacing? ---------------------------------------- */
  const { data: row, error } = await sb
    .from("content")
    /* One string literal, not a concatenation: PostgREST infers the row type
       from the literal, and splitting it across a `+` makes every field an
       error type. */
    .select("id, title, mux_asset_id, mux_playback_id, vertical_status, duration_sec, status, collection, version, canonical_filename")
    .eq("id", contentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error(`no content row ${contentId}`);

  console.log(`\n  Replacing: ${row.title}  (${row.status})`);
  console.log(`    current master  ${String(row.mux_asset_id).slice(0, 14)}…  ${row.duration_sec}s`);
  console.log(`    current vertical ${row.vertical_status}`);

  /* ---- 2. What are we replacing it with? --------------------------------
     Nothing, when only trimming: the source is the master already on the row,
     and everything between here and the clip is about getting a new file in. */
  let newAssetId: string | null = null;
  let asset;

  if (trimOnly) {
    /* Narrowed into a const: newAssetId is nullable for the upload path, and
       waitForAsset takes a string. */
    const current = row.mux_asset_id;
    if (!current) throw new Error("row has no master asset to trim");
    newAssetId = current;
    asset = await waitForAsset(current, "current master");
    console.log(`\n  Trim only. Source is the current master.`);
    console.log(`    ${asset.aspect_ratio}  ${asset.duration?.toFixed(1)}s`);
    console.log(`    trim: ${trimStart ?? 0}s -> ${trimEnd ?? "end"}`);
    if (dry) { console.log("\n  --dry, stopping here.\n"); return; }
  } else {
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
      /*
       * ---- NO CAPTIONS ON AN UPLOAD THAT IS ABOUT TO BE TRIMMED -----------
       *
       * Mux refuses to clip an asset whose text track is still generating —
       * "Asset to clip has a pending text track, try again in a few minutes" —
       * and waitForAsset only waits for the ASSET to be ready, which it is,
       * captions or not. Every replacement in the first run of Ryan's batch
       * died there, after uploading a full 4K master each time.
       *
       * Waiting for the track would fix the error and buy nothing: the clip
       * below requests its own subtitles, and the intermediate's would be
       * discarded anyway because their timings are wrong by exactly the length
       * of the cut. So they are not requested at all — one fewer failure mode
       * and one fewer caption job billed per film.
       */
      ...(trimStart != null || trimEnd != null
        ? {}
        : { inputs: [{ generated_subtitles: [{ language_code: "en", name: "English (auto)" }] }] }),
    },
  });

  /*
   * ---- RETRIED, BECAUSE ONE 503 IS NOT A REASON TO LOSE A FILM ------------
   *
   * A single transient 503 from the upload endpoint killed one film outright
   * in the first run of Ryan's batch. Over seventy-six uploads of a couple of
   * hundred megabytes each, a transient 5xx is not an exception, it is a
   * matter of time.
   *
   * A fresh read stream per attempt: a consumed one cannot be replayed, and
   * retrying with the old one uploads nothing and reports success.
   *
   * Only 5xx and network faults. A 4xx is Mux telling us the request is wrong,
   * and repeating a wrong request three times is just a slower failure.
   */
  const ATTEMPTS = 3;
  for (let attempt = 1; ; attempt++) {
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

    try {
      const put = await fetch(upload.url!, {
        method: "PUT",
        body: Readable.toWeb(stream) as unknown as BodyInit,
        // @ts-expect-error duplex is required for a streaming body, absent from DOM types
        duplex: "half",
        headers: { "content-length": String(bytes) },
      });
      if (put.ok) break;
      if (put.status < 500 || attempt >= ATTEMPTS) {
        throw new Error(`upload failed HTTP ${put.status}`);
      }
      console.log(`    HTTP ${put.status} — retrying (${attempt}/${ATTEMPTS - 1})`);
    } catch (e) {
      if (attempt >= ATTEMPTS) throw e;
      console.log(`    ${e instanceof Error ? e.message : e} — retrying (${attempt}/${ATTEMPTS - 1})`);
    }
    await new Promise((r) => setTimeout(r, 5000 * attempt));
  }

  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const u = await mux.video.uploads.retrieve(upload.id);
    if (u.asset_id) { newAssetId = u.asset_id; break; }
    if (u.status === "errored") throw new Error("Mux upload errored");
  }
  if (!newAssetId) throw new Error("timed out waiting for an asset id");

  asset = await waitForAsset(newAssetId, "new asset");
  console.log(`    asset ready   ${newAssetId.slice(0, 14)}…  ${asset.aspect_ratio}  ${asset.duration?.toFixed(1)}s`);
  }

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
  /*
   * The version and the name move with the asset — but only for a real
   * replacement. A --trim-only run is the SAME take cut differently, and
   * bumping it would invent a take that was never shot. See 0107, which was
   * written after fifty-four reshoots left their rows claiming v1 of a file
   * that had already been archived under another name.
   */
  const newCanonical = trimOnly ? null : path.basename(file!);
  const newVersion = trimOnly
    ? null
    : Number(newCanonical!.match(/—\s*v(\d+)\.[a-z0-9]+$/i)?.[1] ?? row.version + 1);

  const { data: swapped, error: swapErr } = await sb.rpc("replace_master_asset", {
    _content_id: contentId,
    _new_asset_id: newAssetId,
    _new_playback_id: playback.id,
    _new_duration: asset.duration ? Math.round(asset.duration) : null,
    _new_version: newVersion,
    _new_canonical: newCanonical,
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

  /* ---- Archive the superseded master in Drive --------------------------
     Best effort, after the swap has succeeded. A file that cannot be moved is
     reported and left alone: the replacement is already live and the row is
     already correct, so failing the run here would be worse than a stale file
     on a shelf. */
  /* Only a REPLACEMENT supersedes a master on the shelf. A trim produces a new
     Mux asset from one already ingested; the file in Drive is still the master
     it came from and archiving it would be a lie about what happened. */
  if (!trimOnly) {
    await archiveOldMaster(row);
    await fileNewMaster(row, file!);
  }

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
