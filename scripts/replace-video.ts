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

   ---------------------------------------------------------------------------
   THIS SCRIPT DOES NOT TRIM. TRIM DOCTRINE V2, 2 NOVEMBER.
   ---------------------------------------------------------------------------
   It used to: upload, clip, swap, re-derive, all in one run. That is removed,
   and not because it was buggy in itself — because v2 settled where a cut is
   made, and it is not here.

   NOTHING IS TRIMMED AT UPLOAD. `trim:apply` cuts from the DISK MASTER in
   `02 - Published`, behind the sync gate, and swaps through the same RPC this
   script uses. One cutter, one place.

   WHY THAT IS THE WHOLE FIX AND NOT A RESTRICTION. Trimming here made the
   master a Mux clip, and `mux://assets/<clip>` does not deliver that clip's
   timeline — Mux re-resolves to the underlying source and lands on a keyframe
   before the clip's zero, returning exactly the length asked for and the wrong
   content. Every later problem followed from that: a second cut was unsafe, the
   archive held a generation nobody wanted, and PR #59 found three films with
   nothing clean to re-cut from. PR #61 closed that gap the pre-v2 way, by
   keeping the untrimmed upload in `archived_asset_id` so a later clip had
   something honest to cut. Under v2 there is no later clip from Mux at all, so
   the gap is not patched — it is unrepresentable. The upload IS the master, and
   `archived_asset_id` is the version it replaced, which is what it says.

   ORDER MATTERS, AND IT IS ENFORCED HERE:
     upload → swap the master → derive the vertical
   The swap marks the existing vertical 'stale' automatically (0058), and the
   derive step then rebuilds it from the new master. A cut, when one is wanted,
   happens afterwards through `trim:apply` and re-derives again.

     npm run replace:video -- --id=<content uuid> --file="/path/to.mov"
     npm run replace:video -- --id=… --file=… --dry

   The trim flags are REFUSED rather than ignored, and a film with a cut point
   on file is named at the end with the command that cuts it.
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import { checkSync } from "@/lib/video/sync-gate";
import { cutPointNotice, type PlanCutRow } from "@/lib/video/cut-point-notice";
import { readdirSync as __readdirSync } from "node:fs";

/* The disk master for a row, matched on the name the file HAS on disk.
   canonical first (published files were renamed to it), source as the
   fallback for anything still in the Drop Zone. */
function masterPathFor(row: { canonical_filename?: string | null; source_filename?: string | null }): string | null {
  const rootDir = process.env.VIDEO_MASTERS_DIR;
  if (!rootDir) return null;
  const index = new Map<string, string>();
  (function walk(d: string) {
    for (const e of __readdirSync(d, { withFileTypes: true })) {
      const f = `${d}/${e.name}`;
      if (e.isDirectory()) walk(f); else index.set(e.name.toLowerCase(), f);
    }
  })(rootDir);
  return (row.canonical_filename && index.get(row.canonical_filename.toLowerCase()))
    || (row.source_filename && index.get(row.source_filename.toLowerCase()))
    || null;
}
import Mux from "@mux/mux-node";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";

const run = promisify(execFile);

/*
 * ---- THE CLIENTS ARE BUILT AFTER THE ARGUMENTS ARE VALIDATED -------------
 *
 * They used to be built here, above the flag parsing, and that made the trim
 * refusal unreachable without credentials: `--trim-only` with no SB_URL died
 * inside `createClient` with a Supabase stack trace instead of the three lines
 * telling the operator to use trim:apply. The refusal is the whole point of
 * removing the flag, so it must not depend on the environment being right.
 *
 * Validate the request, then touch the world. See below the guards.
 */

const args = process.argv.slice(2);
const arg = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=");
const contentId = arg("id");
const file = arg("file");
const dry = args.includes("--dry");

/*
 * ---- THE TRIM FLAGS ARE REFUSED, NOT IGNORED ------------------------------
 *
 * A flag a script accepts and quietly drops is this codebase's most-repeated
 * defect wearing a new hat: the operator types `--trim-start=4.26`, the run
 * reports success, and the film is live with its slate on. So the flags are
 * still PARSED, purely so they can be named in a refusal that says where the
 * cut now happens.
 */
const REMOVED_TRIM_FLAGS = ["trim-start", "trim-end", "trim-only"] as const;
const removedUsed = REMOVED_TRIM_FLAGS.filter(
  (f) => args.includes(`--${f}`) || args.some((a) => a.startsWith(`--${f}=`))
);
/*
 * `--trim-only` is gone with the rest. It was this script minus its first half
 * — no file, no upload, the current master as the clip source — and it is the
 * exact shape the hazard note below says is unsafe: a clip of a clip. What
 * replaced it is `trim:apply --only=<id>`, which cuts from the disk master.
 */
/**
 * ---- THE SAME TAKE, RE-ENCODED, BECAUSE THE ASSET WAS WRONG ---------------
 *
 * Mux's clip produced six assets whose VIDEO is about two seconds shorter than
 * their AUDIO — it cut the sound at the requested point and the picture
 * somewhere else — so the two play from different points in the film. That is
 * the desync Ryan heard on the daily loop, and Mux's own reported duration
 * matched what was asked for, so nothing downstream noticed.
 *
 * The repair is a locally cut file: ffmpeg seeking accurately lands the two
 * streams within a single frame of each other, measured. But it is NOT a new
 * take and NOT a new version — the master on the shelf is unchanged and still
 * the thing that was shot. So this uploads and swaps the asset, re-derives the
 * vertical, and touches nothing in Drive and nothing about the version.
 */
const assetOnly = args.includes("--asset-only");

if (removedUsed.length) {
  console.error(`\n  REFUSING — ${removedUsed.map((f) => `--${f}`).join(", ")} ${removedUsed.length === 1 ? "is" : "are"} gone.`);
  console.error("");
  console.error("  Trim doctrine v2: nothing is trimmed at upload. A cut is made from the");
  console.error("  DISK MASTER in `02 - Published`, behind the sync gate, by trim:apply —");
  console.error("  never from a Mux asset, because a clip of a clip returns the right length");
  console.error("  and the wrong content.");
  console.error("");
  console.error("  Upload and swap with this script, then:");
  console.error(`      npm run trim:apply -- --only=${contentId ?? "<content uuid>"}            # report`);
  console.error(`      npm run trim:apply -- --apply --only=${contentId ?? "<content uuid>"}    # cut`);
  console.error("");
  process.exit(1);
}
if (!contentId || !file) {
  console.error("  need --id=<content uuid> and --file=<path>");
  process.exit(1);
}
/* Bound after the guard. process.exit returns `never` but TypeScript will not
   narrow a module-level const through it, and a `!` at each use is the
   assertion that stops being true the day somebody moves the guard. */
const id: string = contentId;

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});
const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
  jwtSigningKey: process.env.MUX_SIGNING_KEY_ID!,
  jwtPrivateKey: process.env.MUX_SIGNING_KEY_PRIVATE!,
});

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
    /*
     * ALREADY ON THE SHELF IS NOT A MOVE.
     *
     * The destination used to be derived as "the parent of the parent, plus
     * 02 - Published" — right when the file comes from the Drop Zone and wrong
     * when it comes from the shelf itself, which happens whenever a film is
     * repaired from its own master. That produced
     * "02 - Published/02 - Published/Mindset" and an ENOENT, and it did it
     * AFTER archiveOldMaster had already moved the file, so the master ended up
     * in 04 - Archive labelled "superseded by v2" when nothing had superseded
     * it. Two wrong moves from one wrong assumption about where a file lives.
     */
    if (from.includes(`${path.sep}02 - Published${path.sep}`)) {
      console.log(`\n  master is already on the shelf; left where it is`);
      return;
    }
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
    /* archived_asset_id is read for the clip-of-a-clip hazard note at step 4:
       its presence means this master is itself a clip. Without it in the
       select the note is unreachable, which is a check that cannot fire. */
    .select("id, title, mux_asset_id, mux_playback_id, vertical_status, duration_sec, status, collection, version, canonical_filename, archived_asset_id")
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

  {
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
       * ---- CAPTIONS: WHY THIS WAS CONDITIONAL, AND WHY IT NO LONGER IS ----
       *
       * Mux refuses to clip an asset whose text track is still generating —
       * "Asset to clip has a pending text track, try again in a few minutes" —
       * and waitForAsset only waits for the ASSET to be ready, which it is,
       * captions or not. Every replacement in the first run of Ryan's batch
       * died there, after uploading a full 4K master each time.
       *
       * Waiting for the track would have fixed the error and bought nothing
       * WHILE THIS SCRIPT STILL CLIPPED: the clip requested its own subtitles,
       * and the intermediate's were discarded anyway because their timings were
       * wrong by exactly the length of the cut. So they were skipped whenever a
       * trim was coming.
       *
       * THE CLIP IS GONE, SO THEY ARE ALWAYS REQUESTED NOW. The asset this
       * uploads is the master that goes live, and an untrimmed master's
       * subtitle timings are correct — there is no cut to shift them. Leaving
       * the old condition in place would have been harmless only for as long as
       * nobody passed a trim flag, and the flags now refuse, so the condition
       * could only ever have evaluated one way. A branch that cannot take its
       * other arm is a branch that misleads the next reader.
       *
       * A later trim:apply cut re-requests subtitles for the cut asset, which
       * is where the shifted-timings problem actually belonged.
       */
      inputs: [{ generated_subtitles: [{ language_code: "en", name: "English (auto)" }] }],
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
  /*
   * ---------------------------------------------------------------------------
   * THE CLIP IS GONE, AND THE HAZARD WITH IT
   * ---------------------------------------------------------------------------
   * What stood here clipped the new asset through `mux://assets/<id>` before
   * swapping it in, under a note that began "KNOWN HAZARD, 9 OCTOBER 2026" and
   * said plainly that it was safe for a fresh upload and unsafe for a second
   * trim of an already-trimmed master: Mux re-resolves a clip of a clip to the
   * underlying source, lands on a keyframe before the clip's zero, and returns
   * exactly the length asked for. Measured at +4.7s on one Walk-Around film.
   *
   * The note also said the right gate was "probably refuse --trim-only when
   * archived_asset_id is set, and clip the archive instead", and left it for
   * its own change. This is that change, and the answer turned out to be
   * neither: v2 does not clip from Mux at all. `trim:apply` cuts from the disk
   * master in `02 - Published` behind the sync gate.
   *
   * So the master this script swaps in is always a first-generation upload, and
   * `archived_asset_id` is always the version it replaced. Both facts are now
   * true by construction rather than by a flag nobody must pass.
   */

  const playback = asset.playback_ids?.find((p) => p.policy === "signed");
  if (!playback) throw new Error("new asset has no signed playback id");

  /* ---- 5. Swap ------------------------------------------------------------ */
  /*
   * The version and the name move with the asset — but only for a real
   * replacement. `--asset-only` is the SAME take re-encoded because the asset
   * was wrong, and bumping it would invent a take that was never shot. See
   * 0107, written after fifty-four reshoots left their rows claiming v1 of a
   * file that had already been archived under another name.
   *
   * `--trim-only` used to share this arm, for the same reason. It is gone: a
   * trim is still the same take cut differently, and trim:apply carries that
   * rule now by passing null for both through the same RPC.
   */
  const newCanonical = assetOnly ? null : path.basename(file!);
  const newVersion = assetOnly
    ? null
    : Number(newCanonical!.match(/—\s*v(\d+)\.[a-z0-9]+$/i)?.[1] ?? row.version + 1);

  /* ---- THE SYNC GATE. No asset is swapped in without a measured pass. ----
     226 films reached production out of sync because the cut reported success
     and nobody measured the result. A duration check cannot catch it: Mux
     returns exactly the length asked for and the wrong content. Measured on
     the FINISHED asset, against the disk master, through the playback Mux
     actually serves. `unmeasurable` is a refusal, not a pass. */
  {
    const master = masterPathFor(row);
    if (!master) {
      throw new Error(
        "sync gate: no disk master for this film, so the cut cannot be verified. " +
        "Refusing the swap — the asset is in Mux and can be swapped by hand if that is really wanted."
      );
    }
    const verdict = checkSync(master, playback.id, `replace-${String(contentId).slice(0, 8)}`);
    console.log(`  sync gate: ${verdict.detail}`);
    if (!verdict.pass) {
      throw new Error(
        `sync gate REFUSED the swap — ${verdict.detail}. The live row is untouched and the new ` +
        `asset (${newAssetId}) is ready in Mux for a re-judge once the cut is corrected.`
      );
    }
  }

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
  /*
   * ---- A REFUSED VERTICAL IS NOT A FAILED TRIM, AND THIS USED TO THROW ----
   *
   * The swap is already committed four lines above. So throwing here reports
   * the whole run as failed for something that happened AFTER the only
   * irreversible step, and the caller believes the cut did not land.
   *
   * That is not hypothetical. trim:apply writes its ledger row only once this
   * process exits 0 — so a derive refusal produced a film that had been cut,
   * on a new asset, with NO LEDGER ROW naming the asset it was cut from. The
   * ledger is the one thing standing between this pipeline and a double trim,
   * and INGEST.md already records that it is incomplete by construction. This
   * would have been a second way to put a hole in it, on the failure path,
   * where nobody looks.
   *
   * derive:vertical now exits non-zero whenever it refuses a row — which is
   * correct of IT, and was previously masked because its refusal path returned
   * 0. A refusal is a recorded, survivable state: 0058's `stale`/`failed` both
   * mean "no usable crop", pickRendition serves the master letterboxed, and the
   * reason is in vertical_error. The trim, meanwhile, is done and verified.
   *
   * So it is REPORTED rather than thrown, which is exactly the judgement the
   * archive step below already makes in the same situation: "the replacement is
   * already live and the row is already correct, so failing the run here would
   * be worse than a stale file on a shelf."
   */
  console.log(`\n  Deriving the new vertical…`);
  const deriveCode = await new Promise<number>((resolve) => {
    const p = spawn("npm", ["run", "derive:vertical", "--", `--id=${contentId}`], {
      stdio: "inherit",
      env: process.env,
    });
    p.on("exit", (code) => resolve(code ?? 1));
  });
  if (deriveCode !== 0) {
    console.log(
      `\n  The vertical was NOT rebuilt (derive exited ${deriveCode}).` +
      `\n  The trim is committed and the row is correct. The vertical is left in a` +
      `\n  recorded state — see content.vertical_status and content.vertical_error —` +
      `\n  and a phone letterboxes the master until it is re-cut.`
    );
  }

  /* ---- Archive the superseded master in Drive --------------------------
     Best effort, after the swap has succeeded. A file that cannot be moved is
     reported and left alone: the replacement is already live and the row is
     already correct, so failing the run here would be worse than a stale file
     on a shelf. */
  /* Only a REPLACEMENT supersedes a master on the shelf. A trim produces a new
     Mux asset from one already ingested; the file in Drive is still the master
     it came from and archiving it would be a lie about what happened. */
  /*
   * Nor is repairing a film from its own master a supersession. archiveOldMaster
   * renames the shelf copy "(superseded by vN+1)" and moves it away, which is
   * a lie when the replacement IS that file — and it leaves the shelf without
   * the master it still needs.
   */
  const fromTheShelf = !assetOnly && file!.includes(`${path.sep}02 - Published${path.sep}`);
  if (!assetOnly && !fromTheShelf) {
    await archiveOldMaster(row);
    await fileNewMaster(row, file!);
  }

  /*
   * ---- DID THE TWO STREAMS SURVIVE? --------------------------------------
   *
   * The reason this exists: a Mux clip can return an asset whose duration is
   * exactly what was asked for while its video and audio start from different
   * points. Nothing in the API says so — only the file does. Six of ninety-one
   * shipped that way and were found by a person watching one.
   *
   * Best effort and non-fatal: the swap has already happened and the row is
   * already correct as far as anything else is concerned. This is here to make
   * the failure LOUD rather than to prevent the write.
   */
  try {
    /* Narrowed: newAssetId is nullable through the upload path and set by
       here, and the Mux client takes a string. */
    const finalAssetId = newAssetId as string;
    await mux.video.assets.updateMasterAccess(finalAssetId, { master_access: "temporary" });
    let ready: string | null = null;
    for (let i = 0; i < 24; i++) {
      const a = await mux.video.assets.retrieve(finalAssetId);
      if (a.master?.status === "ready" && a.master.url) { ready = a.master.url; break; }
      if (a.master?.status === "errored") break;
      await new Promise((r) => setTimeout(r, 5000));
    }
    if (ready) {
      const { stdout: probe } = await run("ffprobe", [
        "-v", "error", "-show_entries", "stream=codec_type,duration",
        "-of", "default=noprint_wrappers=1:nokey=0", ready,
      ]);
      const v = Number(probe.match(/codec_type=video\nduration=([\d.]+)/)?.[1] ?? 0);
      const a = Number(probe.match(/codec_type=audio\nduration=([\d.]+)/)?.[1] ?? 0);
      const skew = Math.abs(v - a);
      if (v && a && skew > 0.25) {
        console.log(`\n  ⚠  A/V SKEW: video ${v.toFixed(2)}s vs audio ${a.toFixed(2)}s (${skew.toFixed(2)}s apart).`);
        console.log(`     This asset will play out of sync. Re-cut it locally and use --asset-only.`);
      } else if (v && a) {
        console.log(`\n  streams aligned  video ${v.toFixed(2)}s / audio ${a.toFixed(2)}s`);
      }
    }
  } catch {
    /* Master access may be off account-wide; the swap still stands. */
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
  console.log(`    archived   ${String(after?.archived_asset_id).slice(0, 16)}…`);

  /*
   * ---- A CUT POINT ON FILE IS SAID OUT LOUD --------------------------------
   *
   * This script no longer trims, so a film that needs cutting leaves here with
   * its slate still on. That is correct and it is also the one way this change
   * could cost something: the operator's next step used to be nothing, and now
   * it is a second command. A run that ends "Done." over a film the plan says
   * to cut is a silence exactly where the handover is.
   *
   * reports/trim-plan.json is where trim:apply reads its cut points, so it is
   * what is consulted — not a guess from the transcript, and not a second
   * measurement. The absence of a plan row is reported too: "no cut point on
   * file" is a different statement from saying nothing, and on an untrimmed
   * upload it is the one that tells the operator to go and measure.
   *
   * ADVISORY ONLY. It reads a file and prints; it cannot fail the run, because
   * the swap has already happened and a missing or malformed plan is not a
   * reason to report a completed replacement as a failure.
   */
  /*
   * ADVISORY ONLY. It reads a file and prints; it cannot fail the run, because
   * the swap has already happened and a missing or malformed plan is not a
   * reason to report a completed replacement as a failure.
   *
   * THE WORDS ARE IN lib/video/cut-point-notice.ts, which is pure. This branch
   * only fires after a real upload, sync pass, swap and derive — so inside this
   * script it would be unreachable to a test, and the one new behaviour of
   * "replace:video never trims" would be the one thing nobody could check.
   */
  try {
    const PLAN = "reports/trim-plan.json";
    const rows = existsSync(PLAN)
      ? ((JSON.parse(readFileSync(PLAN, "utf8")) as { rows?: PlanCutRow[] }).rows ?? [])
      : null;
    const notice = cutPointNotice(rows, id);
    console.log("");
    for (const line of notice.lines) console.log(`  ${line}`);
  } catch (e) {
    console.log(`\n  (could not read the trim plan: ${(e as Error).message} — the swap stands)`);
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
  main().catch((e) => { console.error(`\n  FAILED: ${e.message}\n`); process.exit(1); });
}
