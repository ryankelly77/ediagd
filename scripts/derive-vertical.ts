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
import { readEnds, strip } from "./trim-check";
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
  mux_playback_id: string | null;
  vertical_status: string;
  duration_sec: number | null;
};

/**
 * The master, or nothing.
 *
 * ---------------------------------------------------------------------------
 * THE HLS FALLBACK THIS USED TO HAVE WROTE A RENDITION NOBODY COULD TRUST
 * ---------------------------------------------------------------------------
 * When Mux had not prepared a master inside the wait, this fell through to the
 * signed HLS — "capped at top rendition" — and cropped that instead. On 8
 * October that path read a 960-pixel stream off a 3840x2160 master and reported
 * a NaN frame height, so both guards below were inert: `h >= w` is false for
 * NaN, and `sliceW < 1080` is false for NaN, so neither the portrait refusal
 * nor the softness warning fired. A 9:16 slice of a 960x540 stream is 304
 * pixels wide and was then upscaled 3.6x to 1080. The output had the right
 * geometry, the right duration, a ready status and a correct playback id — and
 * a picture derived from 8% of the master's pixels.
 *
 * Nothing errored. That is the whole problem: it is the confident wrong answer
 * AGENTS.md puts above a crash, and it would have repeated on every `pending`,
 * `stale` or `failed` row the scheduler swept.
 *
 * So the fallback is gone rather than fixed. A vertical is derived from the
 * master or it is not derived: the crop is the one irreversible step in this
 * pipeline, and a soft rendition that looks fine in the database is worse than
 * no rendition at all, because `stale`/`pending` makes the phone letterbox a
 * master nobody has damaged.
 *
 * This only ever PREVENTS a write — the same shape as the dump check in
 * scripts/db-migrate.sh. The caller records the refusal; see main().
 *
 * ---------------------------------------------------------------------------
 * WHY IT FELL THROUGH ON 8 OCTOBER, WHICH IS NOT WHAT THE OLD COMMENT GUESSED
 * ---------------------------------------------------------------------------
 * The bare `catch {}` this replaces was annotated "master access may be off
 * account-wide", and that guess became the standing explanation. It is
 * measurably wrong, and so is "the asset was too old" and "Mux was slow":
 *
 *   - Asked cold on 8 October, this account prepared a master for a 23
 *     September 4K asset in 42 SECONDS — a fifth of the wait.
 *   - `updateMasterAccess(id, 'temporary')` returns **400 "Download already
 *     exists"** when the asset ALREADY has temporary access. Measured on
 *     FaRpjV5A… ("Successful vs. Really Successful"), whose master was `ready`
 *     with a live mezzanine URL at the moment the call threw.
 *
 * That is the whole fault. The old catch wrapped the request AND the poll, so a
 * 400 on the request skipped the poll entirely and went to HLS having waited
 * zero seconds — while the master it was looking for was already prepared and
 * one `retrieve` away. Temporary access lasts about a day, so every asset
 * touched by a previous sweep poisons the next one. It fails on the SECOND run,
 * which is why it looked intermittent.
 *
 * So the request is best-effort and the POLL ALWAYS RUNS. Being told the
 * download already exists is not an error; it is the thing we wanted being
 * already true. Refusing on it would be a false refusal — the kind that
 * survives review because it wears the costume of care — and the acceptance
 * test is what caught it: the first build of this guard refused a film whose
 * master was ready, and reported that as working.
 *
 * ---------------------------------------------------------------------------
 * AND THE MASTER IS NOT ALWAYS THE SAME CUT AS THE ASSET. READ THIS BEFORE
 * TRUSTING A RE-DERIVE SWEEP.
 * ---------------------------------------------------------------------------
 * Removing the HLS branch fixes the SOFTNESS. It does not make the master
 * correct, and on some rows it is not. Measured 8 October over four films —
 * two of the 29 whose verticals do not match, two that pass — pulling the first
 * ten seconds of the mezzanine and of the signed HLS of the SAME asset, through
 * one whisper batch:
 *
 *   Successful vs. Really Successful   mezz "successful…"      hls "Aloha!"
 *   Four Step Close, Part 2            mezz "and say it…"      hls "Aloha!"
 *   On the Drive            (passes)   mezz "Aloha!"           hls "Aloha!"
 *   MPI Setup               (passes)   mezz "Aloha!" 1.30      hls "Aloha!" 1.22
 *
 * On the two failing films the mezzanine begins about five seconds INTO the
 * film and contains no "Aloha" at all, while the HLS — which is what a desktop
 * plays and what every check in the trim pass read — opens on it.
 *
 * THE DURATIONS AGREE IN ALL FOUR CASES, to within a quarter second. That is
 * what hid it: same asset, same name, same length, different cut. AGENTS.md
 * already has this lesson, bought with eighteen byte-identical masters that
 * read as reshoots — a uniform difference is the thing to explain, not the
 * thing that makes a comparison credible.
 *
 * So "the 29 were derived before the trim" is not established. A crop made from
 * the master TODAY reproduces the defect: deriving Successful vs. Really
 * Successful from its current master on 8 October produced a vertical opening on
 * "successful", which is what the live one already does.
 *
 * Why only some rows is NOT known, and trim status does not predict it — one of
 * the two failures was never trimmed and one of the two controls was. That is
 * the open question, and it belongs to the re-derive ticket.
 *
 * WHAT KEEPS THIS SAFE MEANWHILE is the gate further down in deriveOne: the
 * derive reads its own output and refuses to write a playback id for a
 * rendition that does not match the master's first and last word. On the film
 * above it refused, correctly. With the HLS branch gone, a misaligned master
 * now yields a RECORDED REFUSAL rather than a silent wrong vertical — which is
 * the whole point. A sweep that refuses half its rows is telling you something;
 * one that writes them all is not.
 */
async function sourceUrl(assetId: string): Promise<{ url: string; quality: string }> {
  /*
   * Best-effort, and deliberately NOT wrapped around the poll below. Mux
   * refuses a redundant request rather than treating it as a no-op, so the
   * common case on any re-run is a 400 that means "already granted".
   */
  let requestNote = "";
  try {
    await mux.video.assets.updateMasterAccess(assetId, { master_access: "temporary" });
  } catch (e) {
    requestNote = e instanceof Error ? e.message.replace(/\s+/g, " ").slice(0, 160) : String(e);
  }

  for (let i = 0; i < 40; i++) {
    const a = await mux.video.assets.retrieve(assetId);
    if (a.master?.status === "ready" && a.master.url) return { url: a.master.url, quality: "master" };
    if (a.master?.status === "errored") {
      throw new Error(`Mux reports master status 'errored' for ${assetId}`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  /* The wait genuinely expired. Say what the request said, because a 400 here
     alongside a master that never arrives is a different bug from a slow one. */
  throw new Error(
    `no master within 200 s${requestNote ? ` (the access request said: ${requestNote})` : ""}`
  );
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

    /*
     * ---- READ THE RENDITION BEFORE WRITING ITS ID ------------------------
     *
     * A phone plays the VERTICAL. Two of 447 of these — "Coverage is Key —
     * Opener" and "Name Tag — Opener" — were derived from the right asset,
     * got their own fresh playback id, reported ready, and began SIX SECONDS
     * into the film. The id was correct and the content inside it was not, so
     * nothing that checked ids, durations or statuses could see it. Ryan found
     * it by pressing play on his phone.
     *
     * Every other check in the trim pass read mux_playback_id and none of them
     * ever read this rendition. So the derive reads its own output now, and a
     * rendition that does not open on "Aloha" and close on "Mahalo", at the
     * same length as the master it came from, DOES NOT GET ITS ID WRITTEN. The
     * row keeps the vertical it had — stale is survivable, wrong is not, and
     * pickRendition already handles a missing one by serving the master
     * letterboxed.
     */
    /*
     * TEN SECONDS, NOT THREE. A 3s window is too short for whisper to decode
     * reliably: measured across 447 films it produced 34 heads and 25 tails with
     * NO WORDS AT ALL, and turned "Mahalo" into "Hello" or "." often enough to
     * fail films that are perfectly good. Three films checked by hand — 55,000
     * Mile Part 2, Name Tag Part 9, Four Step Close Part 5 — all read "Mahalo"
     * cleanly at 10s and garbage at 6s.
     *
     * A gate on a flaky instrument refuses good work, which is the failure mode
     * that looks like caution. The first build of this gate used 3s and refused
     * a vertical for opening "He" and closing "You".
     */
    /*
     * READ IT MORE THAN ONCE BEFORE REFUSING IT.
     *
     * A Mux asset reports "ready" before its HLS is reliably complete, so a
     * read taken the instant it flips can come back truncated. Measured on
     * "Buffalos and the Cows": the gate read the fresh clip's tail as ending on
     * "day" and refused it, while the same asset read a minute later ends
     * "...run into the storm. Mahalo." — as does its master.
     *
     * The first and last word of a finished film do not change between reads,
     * so a PASS on any attempt is a true pass and a FAIL may be transient.
     * Refusing on a transient read is the expensive direction: the row keeps the
     * broken vertical this derive exists to replace.
     */
    let ends = await readEnds(mux, pid.id, asset.duration ?? 0, 10, "small.en", ".tmp-derive-check");
    for (let attempt = 2; attempt <= 3; attempt++) {
      if (strip(ends.firstWord ?? "") === "aloha" && strip(ends.lastWord ?? "") === "mahalo") break;
      await new Promise((r) => setTimeout(r, 15000));
      const again = await readEnds(mux, pid.id, asset.duration ?? 0, 10, "small.en", ".tmp-derive-check");
      console.log(`    re-read ${attempt}    opens "${again.firstWord ?? "—"}", closes "${again.lastWord ?? "—"}"`);
      ends = again;
    }
    const first = strip(ends.firstWord ?? "");
    const last = strip(ends.lastWord ?? "");
    const lengthOk =
      asset.duration != null && row.duration_sec != null
        ? Math.abs(asset.duration - row.duration_sec) <= 1.0
        : true;
    let ok = first === "aloha" && last === "mahalo" && lengthOk;
    let against = "Aloha/Mahalo";

    /*
     * ---- A VERTICAL IS JUDGED AGAINST ITS MASTER, NOT AGAINST THE IDEAL ----
     *
     * The absolute test — opens Aloha, closes Mahalo — is the right one for the
     * LIBRARY, and the wrong one to block a derive with on its own. A handful of
     * films genuinely do not end on "Mahalo"; one refused here opened "Aloha!"
     * and closed "day", at the correct length. Judged absolutely it can never
     * have a vertical at all, and a film with NO vertical is worse off than one
     * whose vertical faithfully reproduces an imperfect master.
     *
     * What this derive is actually responsible for is FIDELITY: the rendition a
     * phone plays must be the same cut as the one a desktop plays. So where the
     * absolute test fails, the vertical is compared against the master's own
     * first and last word, and accepted if it matches. The film's content is
     * then a question for the library — trim:verify still reports it — and not a
     * reason to leave the row without a rendition.
     */
    if (!ok && lengthOk && row.mux_playback_id) {
      try {
        const master = await readEnds(mux, row.mux_playback_id, row.duration_sec ?? 0, 10, "small.en", ".tmp-derive-check");
        if (strip(master.firstWord ?? "") === first && strip(master.lastWord ?? "") === last) {
          ok = true;
          against = `the master, which also opens "${master.firstWord}" and closes "${master.lastWord}"`;
          console.log(`    faithful      matches the master word for word; the master itself is what differs from Aloha/Mahalo`);
        }
      } catch { /* fall through to the refusal below */ }
    }
    console.log(
      `    checked       opens "${ends.firstWord ?? "—"}", closes "${ends.lastWord ?? "—"}", ` +
        `${asset.duration?.toFixed(2)}s vs master ${row.duration_sec}s  [against ${against}]`
    );
    if (!ok) {
      throw new Error(
        `REFUSING to write this vertical: opens "${ends.firstWord ?? "—"}" closes ` +
          `"${ends.lastWord ?? "—"}" ${asset.duration?.toFixed(2)}s vs ${row.duration_sec}s. ` +
          `The row keeps its previous vertical. Asset ${assetId} is left in Mux for inspection.`
      );
    }

    await sb.rpc("set_vertical_rendition", {
      _content_id: row.content_id,
      _asset_id: assetId,
      _playback_id: pid.id,
    });

    console.log(`    VERTICAL      ${pid.id.slice(0, 14)}…  ${asset.aspect_ratio}  ${asset.duration?.toFixed(1)}s  verified`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Write down that a row was refused, and say whether the writing worked.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT JUST `fail_vertical_rendition`
 * ---------------------------------------------------------------------------
 * 0058's check constraint is
 *
 *     (vertical_playback_id is not null) = (vertical_status in ('ready','stale'))
 *
 * and `fail_vertical_rendition` sets `failed` WITHOUT clearing the playback id.
 * So on a row that already holds a vertical — every `stale` row, which is a
 * third of this queue — it raises 23514 and changes nothing. Measured through
 * PostgREST as `service_role`, which is the role and the path the worker really
 * uses: a `pending` row accepts it and returns `{"status":"failed"}`; a `stale`
 * row rejects it with `content_vertical_consistent`.
 *
 * The caller used to `await sb.rpc(...)` without reading `error`, so that
 * rejection was silent and the run still printed a success summary and exited
 * 0. Both halves of that are fixed here: the status write suits the row's
 * actual population, and the outcome is returned rather than assumed.
 *
 * `stale` IS THE RIGHT TERMINAL STATE FOR A REFUSED STALE ROW. It already means
 * "playable, but cut from a master that has since changed, so the player falls
 * back" — which is exactly true after a refusal, and it keeps the playback id
 * the eventual re-derive needs to replace. Only the reason is new, and
 * `vertical_error` is legal alongside `stale`: the constraint couples the status
 * to the id, not to the error.
 */
async function recordRefusal(row: Row, msg: string): Promise<boolean> {
  /* A row holding a vertical cannot become 'failed'. Keep it where it is and
     write down why, so the next reader sees that a machine objected. */
  if (row.vertical_status === "stale") {
    const { error } = await sb.from("content")
      .update({ vertical_error: msg.slice(0, 500) })
      .eq("id", row.content_id);
    if (error) { console.log(`      could not record: ${error.message}`); return false; }
    console.log(`      left stale, reason recorded`);
    return true;
  }

  const { error } = await sb.rpc("fail_vertical_rendition", {
    _content_id: row.content_id,
    _error: msg,
  });
  if (error) { console.log(`      could not record: ${error.message}`); return false; }
  console.log(`      marked failed`);
  return true;
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
  let refused = 0;
  let unrecorded = 0;
  for (const row of rows) {
    try {
      await deriveOne(row);
      ok++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`    FAILED — ${msg}`);
      refused++;
      if (!(await recordRefusal(row, msg))) unrecorded++;
    }
  }
  /* A summary is computed from counters the run incremented, and the exit code
     is a function of the failure count. Neither line prints regardless. */
  console.log(`\n  done: ${ok}/${rows.length} derived, ${refused} refused`);
  if (unrecorded) {
    console.log(`  ${unrecorded} refusal(s) COULD NOT BE RECORDED — the row still claims its old state`);
  }
  console.log();
  if (refused || unrecorded) process.exitCode = 1;
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
