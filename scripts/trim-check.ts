/* ============================================================================
   EDIAGD — does a finished film open on Aloha and close on Mahalo?

   ONE IMPLEMENTATION, used by two callers:
     trim:verify   asks it of every film already serving
     trim:recut    asks it of a CLIP, BEFORE that clip is swapped in

   That second caller is the whole reason this is a module rather than a block
   of code inside the verifier. A re-cut that is checked only after it is live
   has already served a clipped greeting to somebody.

   ---------------------------------------------------------------------------
   WHAT IT MEASURES, AND WHY NOTHING ELSE CAUGHT THIS
   ---------------------------------------------------------------------------
   The apply pass proved each asset came back the LENGTH asked for — 252 of 252,
   exactly — and that the captions still put "Aloha" near the start. Both are
   true of a film cut INTO the greeting. The length is right because the cut
   removed exactly the span requested; the captions still say "Aloha" because
   most of the word is still there.

   What neither asks is whether the FIRST WORD OF THE FILM is whole. A film that
   opens mid-word has its first word starting at 0.00, because the word was
   already sounding when the asset began. A film cut correctly has a beat of air
   in front of it. That one number is the difference, and it is the only thing
   here that could have caught what Ryan heard.
   ============================================================================ */
import Mux from "@mux/mux-node";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const run = promisify(execFile);

/** A film that opens mid-word has its first word starting at 0.00. */
export const MIN_FIRST_WORD_START = 0.15;
/** And the sign-off must not run to the very edge. */
export const MIN_TAIL_AFTER_MAHALO = 0.4;

export const strip = (w: string) => w.trim().toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");

export type Ends = {
  duration: number | null;
  /** WHICH word opens and closes the film — from whisper, which is good at this. */
  firstWord: string | null;
  lastWord: string | null;
  /** HOW MUCH AIR sits before the first sound and after the last — from audio
   *  energy, because whisper cannot measure it. See the note on readEnds. */
  leadIn: number | null;
  tailAfterLast: number | null;
  /** What whisper claimed the first word's start was. Kept only so the
   *  disagreement stays visible; never used to decide anything. */
  whisperFirstStart: number | null;
  headHeard: string; tailHeard: string;
  note: string | null;
};

export function headOk(e: Ends): boolean {
  return strip(e.firstWord ?? "") === "aloha" && (e.leadIn ?? -1) >= MIN_FIRST_WORD_START;
}
export function tailOk(e: Ends): boolean {
  return strip(e.lastWord ?? "") === "mahalo" && (e.tailAfterLast ?? -1) >= MIN_TAIL_AFTER_MAHALO;
}
export function passes(e: Ends): boolean {
  return headOk(e) && tailOk(e);
}

async function wavDuration(p: string): Promise<number> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]);
  const d = Number(stdout.trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error("unreadable wav");
  return d;
}

/** ffmpeg exits 0 on a partial pull, so the window is checked by what came
 *  back — the same discipline the measure pass had to learn. */
async function pull(hls: string, dest: string, from: number | null, secs: number | null, expect: number): Promise<number> {
  let last = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const a = ["-nostdin", "-hide_banner", "-loglevel", "error"];
      if (from != null) a.push("-ss", from.toFixed(3));
      if (secs != null) a.push("-t", secs.toFixed(3));
      a.push("-i", hls, "-vn", "-ac", "1", "-ar", "16000", "-y", dest);
      await run("ffmpeg", a, { maxBuffer: 1 << 24 });
      const got = await wavDuration(dest);
      if (got >= expect - 0.75) return got;
      last = `came back ${got.toFixed(2)}s of ${expect.toFixed(2)}s`;
    } catch (e) { last = e instanceof Error ? e.message : String(e); }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  throw new Error(`partial pull: ${last}`);
}

/**
 * Read the first and last word of ONE asset, by its playback id.
 *
 * Signed playback ids only — every asset in this library is signed, and a
 * public one would not need a token at all.
 */
export async function readEnds(
  mux: Mux,
  playbackId: string,
  duration: number,
  windowSec: number,
  model: string,
  work: string
): Promise<Ends> {
  const e: Ends = {
    duration, firstWord: null, lastWord: null, leadIn: null, tailAfterLast: null,
    whisperFirstStart: null, headHeard: "", tailHeard: "", note: null,
  };
  mkdirSync(work, { recursive: true });
  const tag = randomUUID().slice(0, 8);
  const hw = join(work, `${tag}-h.wav`);
  const tw = join(work, `${tag}-t.wav`);
  const man = join(work, `${tag}-m.json`);
  const out = join(work, `${tag}-w.json`);
  try {
    const token = await mux.jwt.signPlaybackId(playbackId, { type: "video", expiration: "3600s" });
    const hls = `https://stream.mux.com/${playbackId}.m3u8?token=${token}`;
    const w = Math.min(windowSec, duration);
    await pull(hls, hw, null, w, w);
    const from = Math.max(0, Number((duration - w).toFixed(3)));
    const got = await pull(hls, tw, from, null, duration - from);

    /* ---- THE AIR, BY ENERGY ------------------------------------------- */
    const hb = await silence(hw, w);
    const tb = await silence(tw, got);
    e.leadIn = Number(hb.onset.toFixed(3));
    e.tailAfterLast = Number((got - tb.offset).toFixed(3));
    writeFileSync(man, JSON.stringify({
      jobs: [{ key: "x", headWav: hw, tailWav: tw, tailOffset: Number((duration - got).toFixed(3)) }],
    }, null, 1));
    const py = existsSync(".venv-whisper/bin/python3") ? ".venv-whisper/bin/python3" : "python3";
    try {
      await run(py, ["scripts/trim-words.py", `--manifest=${man}`, `--out=${out}`, `--model=${model}`], { maxBuffer: 1 << 24 });
    } catch { /* per-film errors live in the output file */ }
    if (!existsSync(out)) { e.note = "worker wrote nothing"; return e; }
    const r = (JSON.parse(readFileSync(out, "utf8")) as Record<string, {
      headWords?: { word: string; start: number; end: number }[];
      tailWords?: { word: string; start: number; end: number }[];
      headHeard: string; tailHeard: string; errors: string[];
    }>)["x"];
    if (!r) { e.note = "no record for this asset"; return e; }
    e.headHeard = r.headHeard ?? "";
    e.tailHeard = r.tailHeard ?? "";
    const hwrd = r.headWords ?? [];
    const twrd = r.tailWords ?? [];
    /* Whisper is asked only WHICH word, never where it starts. */
    if (hwrd.length) { e.firstWord = hwrd[0].word; e.whisperFirstStart = hwrd[0].start; }
    if (twrd.length) e.lastWord = twrd[twrd.length - 1].word;
    if (r.errors?.length) e.note = r.errors.join("; ");
  } catch (err) {
    e.note = err instanceof Error ? err.message : String(err);
  } finally {
    for (const f of [hw, tw, man, out]) rmSync(f, { force: true });
  }
  return e;
}

export function line(e: Ends): string {
  const fs = e.leadIn == null ? "   —" : e.leadIn.toFixed(2).padStart(5);
  const tl = e.tailAfterLast == null ? "   —" : e.tailAfterLast.toFixed(2).padStart(5);
  return `${fs}s air then "${String(e.firstWord ?? "—")}"   …"${String(e.lastWord ?? "—")}" then ${tl}s air`;
}

/**
 * Where sound starts and stops in a wav, by ENERGY.
 *
 * ---------------------------------------------------------------------------
 * WHY NOT WHISPER, AND THIS COST TEN FILMS A NEEDLESS RE-CUT
 * ---------------------------------------------------------------------------
 * Whisper anchors the first word of a short window to 0.00 whatever silence
 * precedes it. Measured on the live "Coverage is Key, Part 1": ffmpeg's
 * silencedetect puts the first sound at 0.471s and whisper puts the first word
 * at 0.000. The film has nearly half a second of air and whisper says none.
 *
 * Built on whisper, the verifier called ten of twelve Coverage is Key films
 * over-cut. They were not. Only the refuse-before-swap gate stopped ten
 * perfectly good films being cut a second time on the strength of it.
 *
 * So the two instruments are used for the two different things they are each
 * good at: whisper says WHICH word it is, energy says HOW MUCH AIR is in front
 * of it. Neither can do the other's job.
 */
export function soundBounds(stderr: string, windowDur: number): { onset: number; offset: number } {
  const starts: number[] = [];
  const ends: number[] = [];
  for (const m of stderr.matchAll(/silence_start:\s*(-?[\d.]+)/g)) starts.push(Number(m[1]));
  for (const m of stderr.matchAll(/silence_end:\s*(-?[\d.]+)/g)) ends.push(Number(m[1]));
  /* Leading silence only counts when the window OPENS in silence. A window
     that opens on sound has no air in front of it, whatever follows. */
  const onset = starts.length && starts[0] <= 0.02 && ends.length ? ends[0] : 0;

  /*
   * ---- ffmpeg CLOSES THE FINAL SILENCE AT EOF -----------------------------
   *
   * silencedetect emits a `silence_end` equal to the window duration for a
   * silence that runs to the end of the file. The first rule here looked for an
   * UNTERMINATED silence — `lastEnd < lastStart` — which therefore never
   * matched, so every film reported 0.00s of air after its sign-off, including
   * two measured by hand at 0.60s and 0.66s.
   *
   * So the test is whether the last silence region REACHES the end, not whether
   * it was left open.
   */
  const lastStart = starts.length ? starts[starts.length - 1] : null;
  const lastEnd = ends.length ? ends[ends.length - 1] : null;
  const runsToEnd =
    lastStart != null && (lastEnd == null || lastEnd >= windowDur - 0.06) && lastStart > (lastEnd ?? -1) - windowDur;
  const offset = runsToEnd && lastStart != null ? lastStart : windowDur;
  return { onset, offset };
}

async function silence(path: string, dur: number): Promise<{ onset: number; offset: number }> {
  /*
   * silencedetect reports on STDERR and ffmpeg EXITS 0. The first build parsed
   * stderr only in the catch, so the success path — which is every path —
   * returned "no silence" for every film, and the verifier then called two
   * known-good films clipped. Read the stream, not the exit code: the same
   * mistake this pass has now made three times in three different scripts.
   */
  try {
    const { stderr, stdout } = await run(
      "ffmpeg",
      ["-hide_banner", "-i", path, "-af", "silencedetect=noise=-40dB:d=0.05", "-f", "null", "-"],
      { maxBuffer: 1 << 24 }
    );
    return soundBounds(`${stderr ?? ""}${stdout ?? ""}`, dur);
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string };
    return soundBounds(`${err.stderr ?? ""}${err.stdout ?? ""}`, dur);
  }
}
