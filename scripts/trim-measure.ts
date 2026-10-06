/* ============================================================================
   EDIAGD — measure the dead air on every published film, head and tail

     set -a; source .env.local; set +a
     SB_URL="$NEXT_PUBLIC_SUPABASE_URL" SB_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
       npm run trim:measure
     … -- --only=c61fb5c9-…          one film
     … -- --limit=20                 the first 20, for a shakedown
     … -- --pad-head=0.3 --pad-tail=0.7
     … -- --head-threshold=1.0 --tail-threshold=1.5
     … -- --captions-only            pass one only; no ffmpeg, no whisper

   READ-ONLY. It writes reports/trim-plan.json and nothing else. No row is
   updated, no asset is created, no file in Drive is touched. Signing a playback
   token is a read.

   ---------------------------------------------------------------------------
   EVERY FILM OPENS ON ALOHA AND CLOSES ON MAHALO
   ---------------------------------------------------------------------------
   So dead air is anything before the first word and anything after the last.
   Ryan found it on "Get the Hell Out of Here, Part 1" — the camera running
   before the greeting and still running after the sign-off — and asked whether
   there are others. Measured, that film carries 17.4s in front of "Aloha" and
   4.4s after "Mahalo": 22 seconds of a 101-second film.

   Whether each of the other 446 has the same problem is a MEASUREMENT, not a
   guess. Some were cut by hand before upload. So this measures all of them and
   proposes nothing it has not measured.

   ---------------------------------------------------------------------------
   TWO PASSES, CHEAP FIRST, AND WHY THE CHEAP ONE CANNOT BE THE ONLY ONE
   ---------------------------------------------------------------------------
   Pass one reads the Mux auto-captions, which every published film has (447 of
   447 hold a ready English track — see captions:sync, which is what established
   that the captions_ready COLUMN was describing something else). A caption cue
   carries a start and an end, so the first cue containing "aloha" and the last
   containing "mahalo" bound the film's speech for the price of one HTTP GET.

   That is accurate enough to find candidates and NOT accurate enough to cut on.
   The cue that holds the greeting on this film reads

       00:00:00.000 --> 00:00:10.400   Get the hell out of here speech.

   and the Aloha is in the cue after it — but on a film whose slate and greeting
   land in ONE cue ("Doubt is a strange thing by Kobe Bryant. Aloha.") the cue
   start is the start of the SLATE, about a second early and on the wrong side
   of the thing being cut. Cutting there keeps the slate, which is the one
   outcome this whole job exists to avoid.

   So every film the cheap pass flags goes to pass two: word-level timing with
   VAD off, the slate-timings.py method, over bounded windows of the asset that
   will actually be cut.

   ---------------------------------------------------------------------------
   AN UNKNOWN IS NOT A PASS
   ---------------------------------------------------------------------------
   A film whose captions yield no "aloha" is not thereby a film with a clean
   head — it is a film the cheap pass could not measure, which is exactly the
   case the expensive pass exists for. Unknown screens IN. A check that is
   silent on the thing it cannot see is not a check.

   ---------------------------------------------------------------------------
   THE ASSET, NOT THE FILE ON DISK
   ---------------------------------------------------------------------------
   165 of these films have already had their heads cut by trim:slates, so the
   master in `02 - Published` is the UNTRIMMED original and its timestamps
   describe a film nobody is served. reports/signoff-timings.json was measured
   that way — on disk, over Published/Mindset — which is why it cannot be used
   here even though it names the same quantity.

   Pulling from the signed HLS of the current master means the offsets need no
   hand correction, and a hand correction is how a film gets cut twice.

   ---------------------------------------------------------------------------
   THE TAIL OFFSET IS DERIVED FROM WHAT FFMPEG DID, NOT FROM WHAT IT WAS ASKED
   ---------------------------------------------------------------------------
   `ffmpeg -ss <t> -i <hls>` seeks to a segment boundary, so the audio it
   returns may begin EARLIER than t. Trusting t would then shift every word
   timestamp in the tail window later than the truth, by the same amount on
   every film — and a consistent error is the dangerous kind, because eighteen
   films agreeing to within a second is the shape of a finding rather than of a
   bug. AGENTS.md has that lesson already, bought with eighteen byte-identical
   masters that read as reshoots.

   So the offset is computed as (asset duration − the duration of the wav that
   came back). It self-calibrates and the systematic error cannot exist.

   On top of that, pass one and pass two are independent routes to the same
   quantity, so they are RECONCILED: where they disagree about where Mahalo is
   by more than SKEW_TOLERANCE, the row is marked `offset-suspect` and no cut is
   proposed for it. That is the external check this measure could fail.

   ---------------------------------------------------------------------------
   TWO DURATIONS, AND THEY ARE NOT THE SAME MEASUREMENT
   ---------------------------------------------------------------------------
   `content.duration_sec` is a ROUNDED INTEGER written at swap time.
   `asset.duration` is a float from Mux. On the film above they are 101 and
   100.576. Every cut point here is arithmetic on the FLOAT, and duration_sec is
   carried into the plan for the report only. Subtracting one from the other is
   the mistake that made eighteen reshoots out of eighteen duplicates.
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import Mux from "@mux/mux-node";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const run = promisify(execFile);

/*
 * ---- NOTHING HAPPENS ON IMPORT -------------------------------------------
 *
 * The credential check and both clients used to run at module scope, which
 * meant `import { propose } from "./trim-measure"` in the scenarios suite
 * called process.exit(1) before a single assertion ran — and with credentials
 * present it would instead have built a live production client to run unit
 * tests against pure functions.
 *
 * replace-video.ts carries the same note at its foot, written after a bare
 * IIFE made a test that wanted one helper trigger a full production import and
 * truncate 15 cue bodies. Same question, and this is the second place it had to
 * be answered.
 */
function requireEnv(): { sbUrl: string; sbKey: string } {
  const missing = [
    "SB_URL",
    "SB_KEY",
    "MUX_TOKEN_ID",
    "MUX_TOKEN_SECRET",
    "MUX_SIGNING_KEY_ID",
    "MUX_SIGNING_KEY_PRIVATE",
  ].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(
      `\n  missing ${missing.join(", ")} — this reads the library from Supabase and\n` +
        `  captions and audio from Mux.\n`
    );
    process.exit(1);
  }
  return { sbUrl: process.env.SB_URL!, sbKey: process.env.SB_KEY! };
}

let _sb: ReturnType<typeof createClient> | null = null;
function db() {
  if (!_sb) {
    const { sbUrl, sbKey } = requireEnv();
    _sb = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
  }
  return _sb;
}

let _mux: Mux | null = null;
function video() {
  if (!_mux) {
    requireEnv();
    _mux = new Mux({
      tokenId: process.env.MUX_TOKEN_ID!,
      tokenSecret: process.env.MUX_TOKEN_SECRET!,
      jwtSigningKey: process.env.MUX_SIGNING_KEY_ID!,
      jwtPrivateKey: process.env.MUX_SIGNING_KEY_PRIVATE!,
    });
  }
  return _mux;
}

const argv = process.argv.slice(2);
const num = (k: string, dflt: number) => {
  const a = argv.find((x) => x.startsWith(`--${k}=`));
  if (!a) return dflt;
  const v = Number(a.slice(k.length + 3));
  if (!Number.isFinite(v)) {
    console.error(`\n  --${k} needs a number, got "${a.slice(k.length + 3)}"\n`);
    process.exit(1);
  }
  return v;
};
const str = (k: string) => argv.find((x) => x.startsWith(`--${k}=`))?.slice(k.length + 3);

/** Over this much in front of "Aloha" and the film has dead air worth cutting.
 *  A flag, not a constant: Ryan may rule differently once he reads the table. */
const HEAD_THRESHOLD = num("head-threshold", 1.0);
/** The tail runs longer before it reads as deliberate — Mitch holds the smile. */
const TAIL_THRESHOLD = num("tail-threshold", 1.5);
/** A third of a second of Mitch already on camera before the word reads as
 *  natural, and word timestamps land fractionally inside the first phoneme
 *  often enough to matter on a word this short. A clipped "loha" is the one
 *  failure a viewer notices instantly. */
const PAD_HEAD = num("pad-head", 0.3);
/** Seven tenths after Mahalo keeps the smile and loses the reach for the camera. */
const PAD_TAIL = num("pad-tail", 0.7);
const LIMIT = num("limit", 0);
const ONLY = str("only");
const CAPTIONS_ONLY = argv.includes("--captions-only");
/** Leave the pulled wavs and the manifest in .tmp-trim-measure for inspection. */
const KEEP_AUDIO = argv.includes("--keep-audio");
const MODEL = str("model") ?? "small.en";

/** How far pass one and pass two may disagree about Mahalo before the window
 *  offset is in doubt. Measured agreement on the shakedown film was 0.28s. */
const SKEW_TOLERANCE = 2.5;
/** Past this, the first "Aloha" is not a greeting — some films say it again
 *  mid-lesson, and a missed opening would otherwise hand back that later
 *  timestamp and cut a minute off the film while reporting success. */
const MAX_HEAD = 40;
/** Window sizes. Both are floors: the window is widened where pass one puts the
 *  word further in, so pass two cannot fail to reach a word pass one found. */
const HEAD_WINDOW = 30;
const TAIL_WINDOW = 30;

const PLAN = "reports/trim-plan.json";
const OLD_LEDGER = "reports/slate-trims.json";
const WORK = ".tmp-trim-measure";
/** Films per whisper batch. The model loads in 1.4s, so a batch exists to keep
 *  the wavs on disk bounded (about 1 MB each), not to amortise the load. */
const BATCH = 20;
/** ffmpeg pulls are network-bound and whisper is CPU-bound, so the pulls for a
 *  batch overlap each other. */
const PULL_CONCURRENCY = 6;

type Film = {
  id: string;
  title: string;
  collection: string | null;
  placement: string | null;
  duration_sec: number | null;
  mux_asset_id: string | null;
  mux_playback_id: string | null;
};

type Side = "caption" | "word" | "none";

export type Row = {
  id: string;
  title: string;
  collection: string | null;
  placement: string | null;
  muxAssetId: string | null;
  /** Mux's float. All arithmetic uses this. */
  assetDuration: number | null;
  /** The DB's rounded integer. Reported, never subtracted from the above. */
  durationSec: number | null;
  inOldLedger: boolean;

  captionHead: number | null;
  captionMahaloEnd: number | null;
  /** End of the last caption cue carrying any text — where speech stops, which
   *  is known even when the sign-off word was not transcribed. */
  captionLastCueEnd: number | null;
  alohaAt: number | null;
  mahaloEnd: number | null;
  head: number | null;
  tail: number | null;
  headMeasuredBy: Side;
  tailMeasuredBy: Side;

  flagHead: boolean;
  flagTail: boolean;
  /** Where a cut is proposed, these are what trim:apply passes to
   *  replace:video. null on a side means that side is not touched. */
  proposedStart: number | null;
  proposedEnd: number | null;

  /** no-greeting | no-signoff | offset-suspect | no-text-track | … */
  notes: string[];
  headHeard: string;
  tailHeard: string;
  error: string | null;
};

function fmt(n: number | null, w = 6): string {
  return n == null ? "—".padStart(w) : n.toFixed(2).padStart(w);
}

async function pool<T>(items: T[], n: number, fn: (t: T, i: number) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        await fn(items[idx], idx);
      }
    })
  );
}

/* ---- the library ---------------------------------------------------------- */
async function loadFilms(): Promise<Film[]> {
  const films: Film[] = [];
  const pageSize = 1000;
  for (let page = 0; ; page++) {
    const { data, error } = await db()
      .from("content")
      .select(
        "id, title, collection, placement, duration_sec, mux_asset_id, mux_playback_id"
      )
      .eq("type", "advisor_video")
      .eq("status", "published")
      .is("retired_at", null)
      .order("id")
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw new Error(`content read: ${error.message}`);
    if (!data || data.length === 0) break;
    films.push(...(data as Film[]));
    if (data.length < pageSize) break;
  }
  return films;
}

/* ---- pass one: the captions ---------------------------------------------- */
type Cue = { start: number; end: number; text: string };

/** WebVTT timestamps are HH:MM:SS.mmm or MM:SS.mmm. */
function vttTime(s: string): number {
  const parts = s.trim().split(":").map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return NaN;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return NaN;
}

export function parseCues(vtt: string): Cue[] {
  const cues: Cue[] = [];
  const lines = vtt.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*([\d:.]+)\s*-->\s*([\d:.]+)/);
    if (!m) continue;
    const start = vttTime(m[1]);
    const end = vttTime(m[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const text: string[] = [];
    for (let j = i + 1; j < lines.length && lines[j].trim() !== ""; j++) {
      if (lines[j].includes("-->")) break;
      text.push(lines[j].replace(/<[^>]+>/g, "").trim());
    }
    cues.push({ start, end, text: text.join(" ").trim() });
  }
  return cues;
}

/** Resolve the asset FROM the playback id the app actually streams.
 *
 *  Not from content.mux_asset_id and not through mux_upload: a film that was
 *  reshot or re-cut has more than one asset in its history, and the playback id
 *  is the one key both the app and Mux observed. transcripts-backfill.ts
 *  learned this when bridging through mux_upload read captions off a take the
 *  viewer never sees, for 167 films. */
async function resolveAsset(playbackId: string) {
  const pb = await video().video.playbackIds.retrieve(playbackId);
  const assetId = (pb.object?.id as string | undefined) ?? null;
  if (!assetId) throw new Error("playback id resolves to no asset");
  const asset = await video().video.assets.retrieve(assetId);
  return { assetId, asset };
}

async function captionPass(film: Film, row: Row): Promise<void> {
  if (!film.mux_playback_id) {
    row.notes.push("no-playback-id");
    row.error = "no mux_playback_id — cannot read captions or audio";
    return;
  }
  const { assetId, asset } = await resolveAsset(film.mux_playback_id);

  /* The asset the playback id resolves to is the one being served. If the row
     disagrees, say so — it does not change what is measured, but it is the
     kind of drift that makes a later ledger keyed on the row's asset id wrong. */
  if (film.mux_asset_id && film.mux_asset_id !== assetId) {
    row.notes.push("row-asset-differs-from-playback");
  }
  row.muxAssetId = assetId;

  if (asset.status !== "ready") {
    row.notes.push(`asset-${asset.status}`);
    row.error = `asset is ${asset.status}, not ready`;
    return;
  }
  row.assetDuration = asset.duration ?? null;
  if (row.assetDuration == null) {
    row.notes.push("no-asset-duration");
    row.error = "Mux reports no duration for this asset";
    return;
  }

  const track = (asset.tracks ?? []).find(
    (t) =>
      t.type === "text" &&
      t.status === "ready" &&
      (t.language_code === "en" || !t.language_code)
  );
  if (!track) {
    /* Loud, not silent. Every published film is supposed to have one; a film
       that does not is the case this pass must not pass over. */
    row.notes.push("no-text-track");
    return;
  }

  const token = await video().jwt.signPlaybackId(film.mux_playback_id, {
    type: "video",
    expiration: "600s",
  });
  const res = await fetch(
    `https://stream.mux.com/${film.mux_playback_id}/text/${track.id}.vtt?token=${token}`
  );
  if (!res.ok) {
    row.notes.push(`vtt-http-${res.status}`);
    return;
  }
  const cues = parseCues(await res.text());
  if (!cues.length) {
    row.notes.push("vtt-empty");
    return;
  }

  const first = cues.find((c) => /\baloha\b/i.test(c.text));
  if (first) {
    row.captionHead = Number(first.start.toFixed(3));
    row.headMeasuredBy = "caption";
    row.head = row.captionHead;
  }
  /* Where speech stops, whether or not "Mahalo" was transcribed. This is the
     fallback anchor for the tail window — see the note at the pull. */
  let lastSpoken: Cue | null = null;
  for (const c of cues) if (c.text) lastSpoken = c;
  if (lastSpoken) row.captionLastCueEnd = Number(lastSpoken.end.toFixed(3));

  let lastMahalo: Cue | null = null;
  for (const c of cues) if (/\bmahalo\b/i.test(c.text)) lastMahalo = c;
  if (lastMahalo) {
    row.captionMahaloEnd = Number(lastMahalo.end.toFixed(3));
    row.tailMeasuredBy = "caption";
    row.tail = Number((row.assetDuration - row.captionMahaloEnd).toFixed(3));
  }
}

/* ---- pass two: words from the asset that will be cut --------------------- */
async function wavDuration(path: string): Promise<number> {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    path,
  ]);
  const d = Number(stdout.trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error(`unreadable wav: ${path}`);
  return d;
}

/**
 * Pull one window of audio from the signed HLS of the current master.
 *
 * ffmpeg EXITS 0 ON A PARTIAL PULL. Measured: a tail pull printed
 * "Error during demuxing: Input/output error" and returned status 0 with a
 * plausible 30-second wav. So the exit code cannot be the check — the caller
 * verifies what came back by its duration and, for the tail, by agreement with
 * the captions.
 */
async function pullOnce(
  hls: string,
  dest: string,
  from: number | null,
  seconds: number | null
): Promise<void> {
  const a: string[] = ["-nostdin", "-hide_banner", "-loglevel", "error"];
  if (from != null) a.push("-ss", from.toFixed(3));
  if (seconds != null) a.push("-t", seconds.toFixed(3));
  a.push("-i", hls, "-vn", "-ac", "1", "-ar", "16000", "-y", dest);
  await run("ffmpeg", a, { maxBuffer: 1 << 24 });
  if (!existsSync(dest)) throw new Error("ffmpeg produced no file");
}

/** How far short of the expected window a pull may land before it is a partial. */
const PULL_SLACK = 1.0;
const PULL_ATTEMPTS = 3;

/**
 * Pull a window and PROVE it is the window that was asked for.
 *
 * ---------------------------------------------------------------------------
 * WHY THE LENGTH CHECK IS THE WHOLE POINT, AND WHY IT HAS TO BE THIS STRICT
 * ---------------------------------------------------------------------------
 * The first build guarded only against an empty file (`got < 1`), and six of
 * the first thirty-five tail pulls came back truncated by a transient HLS I/O
 * error — ffmpeg printing "Error during demuxing: Input/output error", writing
 * a short wav, and EXITING 0. Whisper then failed on them with a numpy
 * zero-size-axis error, which is the only reason anybody noticed.
 *
 * The silent version of that failure is the dangerous one. The tail offset is
 * computed as (asset duration − the duration of the wav that came back), which
 * is correct ONLY IF the pull ran to the end of the film. A pull that stops
 * early returns a SHORT wav, so the offset comes out LATE by exactly the amount
 * that was lost — and every word timestamp in that window is then shifted by
 * the same amount, which is the consistent-error shape that reads as a finding
 * rather than as a bug.
 *
 * So self-calibration is not enough on its own: it needs the guarantee that the
 * window ends where it was meant to. That is this check.
 *
 * Retried because a transient I/O fault over nine hundred pulls is not an
 * exception, it is a matter of time — replace-video.ts learned the same thing
 * about uploads after one 503 lost a film.
 */
async function pullVerified(
  hls: string,
  dest: string,
  from: number | null,
  seconds: number | null,
  expected: number
): Promise<number> {
  let last = "";
  for (let attempt = 1; attempt <= PULL_ATTEMPTS; attempt++) {
    try {
      await pullOnce(hls, dest, from, seconds);
      const got = await wavDuration(dest);
      if (got >= expected - PULL_SLACK) return got;
      last = `came back ${got.toFixed(2)}s of an expected ${expected.toFixed(2)}s`;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    if (attempt < PULL_ATTEMPTS) await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  throw new Error(`partial pull after ${PULL_ATTEMPTS} attempts — ${last}`);
}

type WordResult = {
  alohaAt: number | null;
  mahaloEnd: number | null;
  headHeard: string;
  tailHeard: string;
  errors: string[];
  /** Set by the worker when a window needed the padded retry. */
  notes?: string[];
};

async function wordBatch(
  rows: Row[],
  films: Map<string, Film>,
  batchNo: number,
  batches: number
): Promise<void> {
  mkdirSync(WORK, { recursive: true });
  const jobs: {
    key: string;
    headWav?: string;
    tailWav?: string;
    tailOffset?: number;
  }[] = [];

  console.log(`\n  pass two, batch ${batchNo}/${batches} — pulling audio for ${rows.length} films`);

  await pool(rows, PULL_CONCURRENCY, async (row) => {
    const film = films.get(row.id)!;
    if (!film.mux_playback_id || row.assetDuration == null) return;
    try {
      const token = await video().jwt.signPlaybackId(film.mux_playback_id, {
        type: "video",
        expiration: "3600s",
      });
      const hls = `https://stream.mux.com/${film.mux_playback_id}.m3u8?token=${token}`;
      const job: { key: string; headWav?: string; tailWav?: string; tailOffset?: number } = {
        key: row.id,
      };

      if (row.flagHead) {
        /* Widened where pass one put the greeting further in than the default
           window, so pass two cannot fail to reach a word pass one found. */
        const need =
          row.captionHead != null ? Math.max(HEAD_WINDOW, row.captionHead + 10) : HEAD_WINDOW;
        const seconds = Math.min(need, row.assetDuration);
        const dest = join(WORK, `${row.id}-head.wav`);
        try {
          await pullVerified(hls, dest, null, seconds, seconds);
          job.headWav = dest;
        } catch (e) {
          row.notes.push(`head-pull-failed(${e instanceof Error ? e.message : String(e)})`);
        }
      }

      if (row.flagTail) {
        /*
         * ---- THE ANCHOR, AND WHY "THE LAST THIRTY SECONDS" IS WRONG -------
         *
         * A fixed last-30s window marks a film with 40 seconds of dead air as
         * `no-signoff` — and that is precisely the film this pass exists to
         * find. So the window is anchored on evidence from pass one:
         *
         *   1. the caption cue holding "Mahalo", where there is one;
         *   2. otherwise the END OF THE LAST CUE THAT HAS ANY TEXT, which is
         *      where speech stops whether or not the word was transcribed;
         *   3. only then the last 30 seconds.
         *
         * Two is the one that matters. Without it, a film whose captions missed
         * the sign-off AND carries a long tail falls outside its own window and
         * comes back as a confident "no sign-off" — a ruling handed to Ryan
         * about a film the measurement never looked at properly.
         */
        const anchorFrom =
          row.captionMahaloEnd ?? row.captionLastCueEnd ?? null;
        const anchor =
          anchorFrom != null
            ? Math.min(row.assetDuration - TAIL_WINDOW, anchorFrom - 10)
            : row.assetDuration - TAIL_WINDOW;
        const from = Math.max(0, Number(anchor.toFixed(3)));
        const dest = join(WORK, `${row.id}-tail.wav`);
        /* Runs to the end of the film, so the window it should return is
           everything from `from` onwards. */
        const expected = row.assetDuration - from;
        try {
          const got = await pullVerified(hls, dest, from, null, expected);
          if (KEEP_AUDIO) {
            console.log(
              `      ${row.id.slice(0, 8)} tail: from=${from} expected=${expected.toFixed(3)} ` +
                `got=${got.toFixed(3)} offset=${(row.assetDuration - got).toFixed(3)} dur=${row.assetDuration}`
            );
          }
          /* THE OFFSET COMES FROM WHAT CAME BACK, NOT FROM WHAT WAS ASKED.
             ffmpeg seeks HLS to a segment boundary, so the audio may begin
             before `from`. Trustworthy only because pullVerified has already
             established that the window ends where it was meant to. */
          job.tailOffset = Number((row.assetDuration - got).toFixed(3));
          job.tailWav = dest;
        } catch (e) {
          row.notes.push(`tail-pull-failed(${e instanceof Error ? e.message : String(e)})`);
        }
      }

      if (job.headWav || job.tailWav) jobs.push(job);
    } catch (e) {
      row.error = `audio pull: ${e instanceof Error ? e.message : String(e)}`;
      row.notes.push("pull-failed");
    }
  });

  if (!jobs.length) {
    console.log(`    nothing pullable in this batch`);
    return;
  }

  const manifest = join(WORK, `manifest-${batchNo}.json`);
  const out = join(WORK, `words-${batchNo}.json`);
  writeFileSync(manifest, JSON.stringify({ jobs }, null, 1));

  const python = existsSync(".venv-whisper/bin/python3")
    ? ".venv-whisper/bin/python3"
    : "python3";
  console.log(`    transcribing ${jobs.length}…`);
  /*
   * ---- READ WHAT IT PRODUCED, NOT JUST WHETHER IT EXITED WELL -------------
   *
   * The worker writes a per-film record for every job and reports each film's
   * own failure inside it. Treating a non-zero exit as "this batch produced
   * nothing" discarded twenty films' measurements because one of them hit an
   * alignment fault — including head measurements that had succeeded in the
   * same process.
   *
   * So the output file is the result, and the exit code is a hint. Only a
   * missing or unparseable file is a batch failure.
   */
  let exitNote = "";
  try {
    await run(python, [
      "scripts/trim-words.py",
      `--manifest=${manifest}`,
      `--out=${out}`,
      `--model=${MODEL}`,
    ], { maxBuffer: 1 << 24 });
  } catch (e) {
    exitNote = e instanceof Error ? e.message.split("\n")[0] : String(e);
    console.log(`    worker exited non-zero (${exitNote}) — reading what it wrote`);
  }
  if (!existsSync(out)) {
    throw new Error(`worker wrote no results${exitNote ? ` — ${exitNote}` : ""}`);
  }

  const words = JSON.parse(readFileSync(out, "utf8")) as Record<string, WordResult>;
  for (const row of rows) {
    const w = words[row.id];
    if (!w) continue;
    row.headHeard = w.headHeard ?? "";
    row.tailHeard = w.tailHeard ?? "";
    if (w.errors?.length) row.notes.push(...w.errors.map((e) => `whisper:${e}`));
    if (w.notes?.length) row.notes.push(...w.notes);

    /*
     * ---- A FAILED SIDE IS UNMEASURED, NOT A RULING -------------------------
     *
     * `alohaAt == null` is produced both by a film that genuinely never says
     * Aloha and by a window that failed to decode. The first is a ruling for
     * Ryan; the second is a measurement this pass owes him and did not deliver.
     * Collapsing them would put films on the no-greeting list on the strength
     * of audio nobody read — the label-is-not-evidence failure, with Ryan's
     * attention as the cost.
     */
    const headFailed =
      (w.errors ?? []).some((e) => e.startsWith("head:")) ||
      row.notes.some((n) => n.startsWith("head-pull-failed"));
    const tailFailed =
      (w.errors ?? []).some((e) => e.startsWith("tail:")) ||
      row.notes.some((n) => n.startsWith("tail-pull-failed"));
    if (headFailed || tailFailed) {
      row.error = [row.error, `word pass failed on the ${headFailed ? "head" : ""}` +
        `${headFailed && tailFailed ? " and " : ""}${tailFailed ? "tail" : ""}`]
        .filter(Boolean)
        .join("; ");
    }

    if (row.flagHead && !headFailed) {
      if (w.alohaAt == null) {
        row.notes.push("no-greeting");
      } else if (w.alohaAt > MAX_HEAD) {
        row.notes.push(`aloha-too-late-${w.alohaAt.toFixed(1)}s`);
      } else {
        row.alohaAt = w.alohaAt;
        row.head = w.alohaAt;
        row.headMeasuredBy = "word";
      }
    }
    if (row.flagTail && !tailFailed) {
      if (w.mahaloEnd == null) {
        row.notes.push("no-signoff");
      } else {
        /* ---- RECONCILE THE TWO ROUTES ---------------------------------
           Pass one read a caption track; pass two read audio pulled at an
           offset. They are independent measurements of the same quantity, so
           a disagreement is evidence about the offset — and an offset that is
           wrong is wrong quietly. Where they disagree beyond tolerance the
           row is marked and nothing is proposed for it. */
        if (
          row.captionMahaloEnd != null &&
          Math.abs(row.captionMahaloEnd - w.mahaloEnd) > SKEW_TOLERANCE
        ) {
          row.notes.push(
            `offset-suspect(captions ${row.captionMahaloEnd.toFixed(2)} vs words ${w.mahaloEnd.toFixed(2)})`
          );
        } else {
          row.mahaloEnd = w.mahaloEnd;
          row.tail =
            row.assetDuration != null
              ? Number((row.assetDuration - w.mahaloEnd).toFixed(3))
              : null;
          row.tailMeasuredBy = "word";
        }
      }
    }
  }
}

/* ---- the decisions, as pure functions so they can be driven by a test ----
   Both of these are exported and exercised by scripts/trim-measure-scenarios.ts.
   A gate that only ever runs against production is a gate nobody has seen
   refuse. */
export type Limits = {
  headThreshold: number;
  tailThreshold: number;
  padHead: number;
  padTail: number;
};

export const LIMITS: Limits = {
  headThreshold: HEAD_THRESHOLD,
  tailThreshold: TAIL_THRESHOLD,
  padHead: PAD_HEAD,
  padTail: PAD_TAIL,
};

/**
 * Which side of which film the expensive pass has to look at.
 *
 * AN UNKNOWN SCREENS IN. `captionHead == null` means the cheap pass could not
 * find the greeting, which is not evidence that there is no dead air in front
 * of it — it is the case the expensive pass exists for. Reading a null as
 * "fine" is how a check ends up silent about exactly the films it was written
 * to catch.
 */
export function screen(row: Row, lim: Limits = LIMITS): void {
  if (row.assetDuration == null) return;
  row.flagHead = row.captionHead == null || row.captionHead > lim.headThreshold;
  row.flagTail = row.tail == null || row.tail > lim.tailThreshold;
}

export function propose(row: Row, lim: Limits = LIMITS): void {
  if (row.assetDuration == null) return;
  const suspect = row.notes.some((n) => n.startsWith("offset-suspect"));

  /* A side is cut only when it was measured TO THE WORD and still exceeds the
     threshold. A caption-only number is explicitly not enough to cut on, and a
     side under threshold is left alone — which is how a film from the old
     ledger with a clean head and a long tail gets cut at the tail only and has
     its head left untouched. */
  if (
    row.headMeasuredBy === "word" &&
    row.alohaAt != null &&
    row.head != null &&
    row.head > lim.headThreshold
  ) {
    row.proposedStart = Math.max(0, Number((row.alohaAt - lim.padHead).toFixed(2)));
    if (row.proposedStart <= 0) row.proposedStart = null; // nothing to cut
  }
  if (
    !suspect &&
    row.tailMeasuredBy === "word" &&
    row.mahaloEnd != null &&
    row.tail != null &&
    row.tail > lim.tailThreshold
  ) {
    const end = Number(Math.min(row.assetDuration, row.mahaloEnd + lim.padTail).toFixed(2));
    /* Within a pad of the end is not a cut worth making. */
    row.proposedEnd = row.assetDuration - end > 0.05 ? end : null;
  }
}

/* ---- main ---------------------------------------------------------------- */
async function main() {
  console.log(`\n  trim:measure — read-only`);
  console.log(
    `  head > ${HEAD_THRESHOLD}s or tail > ${TAIL_THRESHOLD}s screens into the word pass;` +
      ` pads ${PAD_HEAD}s / ${PAD_TAIL}s\n`
  );

  const oldLedger: Record<string, unknown> = existsSync(OLD_LEDGER)
    ? JSON.parse(readFileSync(OLD_LEDGER, "utf8"))
    : {};
  console.log(`  ${OLD_LEDGER}: ${Object.keys(oldLedger).length} films head-trimmed by trim:slates`);

  let films = await loadFilms();
  console.log(`  published films: ${films.length}`);
  if (ONLY) {
    /* Comma-separated, and each may be an id prefix — so a batch of films named
       in a report can be re-measured without editing the script. */
    const want = ONLY.split(",").map((x) => x.trim()).filter(Boolean);
    films = films.filter((f) => want.some((w) => f.id === w || f.id.startsWith(w)));
  }
  if (LIMIT) films = films.slice(0, LIMIT);
  if (ONLY || LIMIT) {
    console.log(`  SCOPED to ${films.length} film(s) — this plan is evidence about those only`);
  }
  if (!films.length) {
    console.error(`\n  no films matched. Nothing measured, nothing written.\n`);
    process.exit(1);
  }

  const byId = new Map(films.map((f) => [f.id, f]));
  const rows: Row[] = films.map((f) => ({
    id: f.id,
    title: f.title,
    collection: f.collection,
    placement: f.placement,
    muxAssetId: f.mux_asset_id,
    assetDuration: null,
    durationSec: f.duration_sec,
    inOldLedger: Boolean(oldLedger[f.id]),
    captionHead: null,
    captionMahaloEnd: null,
    captionLastCueEnd: null,
    alohaAt: null,
    mahaloEnd: null,
    head: null,
    tail: null,
    headMeasuredBy: "none",
    tailMeasuredBy: "none",
    flagHead: false,
    flagTail: false,
    proposedStart: null,
    proposedEnd: null,
    notes: [],
    headHeard: "",
    tailHeard: "",
    error: null,
  }));
  const byRow = new Map(rows.map((r) => [r.id, r]));

  /* ---- pass one ---------------------------------------------------------- */
  let done = 0;
  console.log(`\n  pass one — captions over ${rows.length} films`);
  await pool(rows, 8, async (row) => {
    try {
      await captionPass(byId.get(row.id)!, row);
    } catch (e) {
      row.error = `captions: ${e instanceof Error ? e.message : String(e)}`;
      row.notes.push("caption-pass-failed");
    }
    done++;
    if (done % 50 === 0) console.log(`    ${done}/${rows.length}`);
  });

  /* An unknown screens IN: a film whose captions yielded no position is a film
     the cheap pass could not measure, not a film with a clean end. */
  for (const row of rows) screen(row);

  const flagged = rows.filter((r) => r.flagHead || r.flagTail);
  console.log(
    `    caption pass: ${rows.filter((r) => r.captionHead != null).length} located an Aloha, ` +
      `${rows.filter((r) => r.captionMahaloEnd != null).length} a Mahalo`
  );
  console.log(`    screened into the word pass: ${flagged.length} of ${rows.length}`);

  /* ---- pass two ---------------------------------------------------------- */
  if (CAPTIONS_ONLY) {
    console.log(`\n  --captions-only: stopping after pass one. No cut is proposed from captions alone.`);
  } else if (flagged.length) {
    const batches = Math.ceil(flagged.length / BATCH);
    for (let b = 0; b < batches; b++) {
      const slice = flagged.slice(b * BATCH, b * BATCH + BATCH);
      try {
        await wordBatch(slice, byId, b + 1, batches);
      } catch (e) {
        for (const r of slice) {
          r.error = `word pass: ${e instanceof Error ? e.message : String(e)}`;
          r.notes.push("word-batch-failed");
        }
        console.log(`    batch ${b + 1} FAILED — continuing`);
      }
      if (!KEEP_AUDIO) {
        for (const r of slice) {
          try {
            rmSync(join(WORK, `${r.id}-head.wav`), { force: true });
            rmSync(join(WORK, `${r.id}-tail.wav`), { force: true });
          } catch {
            /* a wav that will not delete is not a reason to stop measuring */
          }
        }
      }
    }
  }

  for (const row of rows) propose(row);

  /* ---- counts, every one derived from the rows --------------------------- */
  const measured = rows.filter((r) => r.assetDuration != null).length;
  const cutHeadOnly = rows.filter((r) => r.proposedStart != null && r.proposedEnd == null);
  const cutTailOnly = rows.filter((r) => r.proposedStart == null && r.proposedEnd != null);
  const cutBoth = rows.filter((r) => r.proposedStart != null && r.proposedEnd != null);
  const noGreeting = rows.filter((r) => r.notes.includes("no-greeting"));
  const noSignoff = rows.filter((r) => r.notes.includes("no-signoff"));
  const suspect = rows.filter((r) => r.notes.some((n) => n.startsWith("offset-suspect")));
  const noTrack = rows.filter((r) => r.notes.includes("no-text-track"));
  const errored = rows.filter((r) => r.error);

  /*
   * ---- "FINE" MEANS MEASURED AND UNDER THRESHOLD, NOT "NOTHING PROPOSED" --
   *
   * The first build of this counted every row with no proposal as fine, and so
   * a --captions-only run — which proposes nothing by design — reported all 447
   * films as "fine as they are". That is this file's own rule broken in its own
   * summary: a label has to be checked against what is behind it, and what was
   * behind that one was a pass that had deliberately not looked.
   *
   * A side that was screened INTO the word pass and did not come back from it
   * is PENDING, which is neither fine nor cuttable.
   */
  const pending = rows.filter(
    (r) =>
      r.assetDuration != null &&
      !r.error &&
      ((r.flagHead && r.headMeasuredBy !== "word" && !r.notes.includes("no-greeting")) ||
        (r.flagTail && r.tailMeasuredBy !== "word" && !r.notes.includes("no-signoff")))
  );
  const pendingIds = new Set(pending.map((r) => r.id));
  const fine = rows.filter(
    (r) =>
      r.assetDuration != null &&
      !r.error &&
      !pendingIds.has(r.id) &&
      r.proposedStart == null &&
      r.proposedEnd == null &&
      !r.notes.includes("no-greeting") &&
      !r.notes.includes("no-signoff") &&
      !r.notes.some((n) => n.startsWith("offset-suspect"))
  );
  const toCut = cutHeadOnly.length + cutTailOnly.length + cutBoth.length;

  /* ---- the table, sorted by how much is coming off ---------------------- */
  const sorted = [...rows].sort(
    (a, b) => (b.head ?? 0) + (b.tail ?? 0) - ((a.head ?? 0) + (a.tail ?? 0))
  );
  console.log(`\n  ${"═".repeat(118)}`);
  console.log(
    `  ${"head".padStart(6)} ${"tail".padStart(6)} ${"dur".padStart(7)} ` +
      `${"start".padStart(7)} ${"end".padStart(8)}  ${"by".padEnd(5)} ${"collection".padEnd(18)} title`
  );
  console.log(`  ${"═".repeat(118)}`);
  for (const r of sorted) {
    const by = `${r.headMeasuredBy[0] ?? "-"}${r.tailMeasuredBy[0] ?? "-"}`;
    const note = r.notes.length ? `  [${r.notes.join("; ")}]` : "";
    console.log(
      `  ${fmt(r.head)} ${fmt(r.tail)} ${fmt(r.assetDuration, 7)} ` +
        `${fmt(r.proposedStart, 7)} ${fmt(r.proposedEnd, 8)}  ${by.padEnd(5)} ` +
        `${String(r.collection ?? "—").padEnd(18)} ${r.title.slice(0, 40)}${note}`
    );
  }
  console.log(`  ${"═".repeat(118)}`);

  const summary = {
    generatedAt: new Date().toISOString(),
    scope: ONLY || LIMIT ? `SCOPED: ${rows.length} of the published library` : "every published film",
    publishedFilms: rows.length,
    measured,
    screenedIntoWordPass: flagged.length,
    wordPassRun: !CAPTIONS_ONLY,
    toCut,
    flaggedHeadOnly: cutHeadOnly.length,
    flaggedTailOnly: cutTailOnly.length,
    flaggedBoth: cutBoth.length,
    pendingWordPass: pending.length,
    noGreeting: noGreeting.length,
    noSignoff: noSignoff.length,
    offsetSuspect: suspect.length,
    noTextTrack: noTrack.length,
    errored: errored.length,
    fine: fine.length,
    thresholds: { headThreshold: HEAD_THRESHOLD, tailThreshold: TAIL_THRESHOLD },
    pads: { padHead: PAD_HEAD, padTail: PAD_TAIL },
    model: MODEL,
  };

  console.log(`\n  ${summary.scope}`);
  console.log(`    measured                 ${measured}`);
  console.log(`    screened into word pass  ${flagged.length}`);
  console.log(`    ─────────────────────────────`);
  console.log(`    to cut, head only        ${cutHeadOnly.length}`);
  console.log(`    to cut, tail only        ${cutTailOnly.length}`);
  console.log(`    to cut, both ends        ${cutBoth.length}`);
  console.log(`    to cut, TOTAL            ${toCut}`);
  console.log(`    ─────────────────────────────`);
  console.log(`    fine as they are         ${fine.length}`);
  if (pending.length) {
    console.log(
      `    PENDING the word pass    ${pending.length}   ` +
        `(screened in, not measured to the word — neither fine nor cuttable)`
    );
  }
  console.log(`    no greeting heard        ${noGreeting.length}   (Ryan rules these by hand)`);
  console.log(`    no sign-off heard        ${noSignoff.length}   (Ryan rules these by hand)`);
  console.log(`    offset suspect           ${suspect.length}   (nothing proposed)`);
  console.log(`    no English text track    ${noTrack.length}`);
  console.log(`    errored                  ${errored.length}`);

  const accounted =
    toCut + fine.length + pending.length + noGreeting.length + noSignoff.length +
    suspect.length + errored.length;
  if (accounted !== rows.length) {
    console.log(
      `\n  NOTE: ${accounted} rows accounted for against ${rows.length} measured — ` +
        `a row can carry more than one ruling (a no-greeting head with a cuttable tail, say), ` +
        `so these buckets overlap by design.`
    );
  }

  writeFileSync(PLAN, `${JSON.stringify({ summary, rows }, null, 1)}\n`);
  console.log(`\n  wrote ${PLAN}`);

  if (noGreeting.length) {
    console.log(`\n  NO GREETING HEARD — for Ryan:`);
    for (const r of noGreeting) {
      console.log(`    ${r.id}  ${r.title}`);
      console.log(`      heard: ${r.headHeard.slice(0, 140) || "(nothing)"}`);
    }
  }
  if (noSignoff.length) {
    console.log(`\n  NO SIGN-OFF HEARD — for Ryan:`);
    for (const r of noSignoff) {
      console.log(`    ${r.id}  ${r.title}`);
      console.log(`      heard: ${r.tailHeard.slice(0, 140) || "(nothing)"}`);
    }
  }
  if (errored.length) {
    console.log(`\n  ERRORS:`);
    for (const r of errored) console.log(`    ${r.title}: ${r.error}`);
  }

  console.log(
    `\n  Nothing has been cut. Read the table, then trim:apply after Ryan says go.\n`
  );

  /* The exit code is a function of the failure count, not a line that prints
     regardless of what happened. A run that could not measure a film has not
     succeeded at the thing it was asked to do. */
  if (errored.length) {
    console.error(`  ${errored.length} film(s) could not be measured — exit 1\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`\n  FAILED: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
}
