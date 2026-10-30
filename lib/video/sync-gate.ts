/* ============================================================================
   THE SYNC GATE — no asset is swapped in, and no vertical is marked ready,
   without a measured pass.
   SERVER/SCRIPT ONLY. Shells out to ffmpeg and the instrument.

   ---------------------------------------------------------------------------
   WHY THIS IS A FUNCTION AND NOT A STEP IN EACH SCRIPT
   ---------------------------------------------------------------------------
   226 films reached production out of sync because the thing that cut them
   reported a successful cut and nobody measured the result. A duration check
   passed on every one of them: Mux returns exactly the length you asked for
   and the wrong content, so length is the one property that cannot detect it.

   Two callers swap a master — replace:video and trim:apply — and a third
   marks a vertical ready. A gate implemented three times is three chances to
   implement it differently, and the version that is wrong is the one nobody
   reads. One function, called by all of them.

   ---------------------------------------------------------------------------
   IT MEASURES THE FINISHED ASSET, NOT THE FILE THAT WAS UPLOADED
   ---------------------------------------------------------------------------
   Against the DISK MASTER, through the playback Mux actually serves. A local
   file can be perfect and the transcoded rendition still land a quarter of a
   second out — that is the whole defect this exists to catch, so measuring
   the input would measure the wrong thing.

   ---------------------------------------------------------------------------
   A REFUSAL IS A REFUSAL, INCLUDING "I COULD NOT TELL"
   ---------------------------------------------------------------------------
   The instrument returns `unmeasurable` when the picture cannot be aligned
   confidently. That is NOT a pass. A gate that waves through what it cannot
   read is a gate that passes everything hard — and the hard ones here are the
   static menu screens, which were out of sync by a quarter second.
   ============================================================================ */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.env.EDIAGD_ROOT ?? process.cwd();
const MAXBUF = 256 * 1024 * 1024;

/** ±40 ms. Below the ~45 ms at which audio leading picture becomes visible. */
export const SYNC_TOLERANCE_MS = 40;

export type SyncVerdict = {
  pass: boolean;
  offsetMs: number | null;
  status: string;
  audioCorr: number | null;
  detail: string;
};

function signedUrl(playbackId: string): string {
  const keyId = process.env.MUX_SIGNING_KEY_ID;
  const priv = process.env.MUX_SIGNING_KEY_PRIVATE;
  if (!keyId || !priv) throw new Error("sync gate: MUX signing key missing");
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const h = b64({ alg: "RS256", typ: "JWT", kid: keyId });
  const p = b64({ sub: playbackId, aud: "v", exp: Math.floor(Date.now() / 1000) + 3600 });
  const sig = crypto
    .sign("RSA-SHA256", Buffer.from(`${h}.${p}`), Buffer.from(priv, "base64").toString("utf8"))
    .toString("base64url");
  return `https://stream.mux.com/${playbackId}.m3u8?token=${h}.${p}.${sig}`;
}

/**
 * Measure a finished Mux asset against its disk master.
 *
 * Returns `pass: false` with a reason rather than throwing, so a caller can
 * log and move to the next film instead of losing a batch — but it never
 * returns `pass: true` on an error path.
 */
export function checkSync(masterPath: string, playbackId: string, tag = "gate"): SyncVerdict {
  const work = path.join(ROOT, ".tmp-sync/work");
  const sig = path.join(ROOT, "scripts/sync-signals.sh");
  const instrument = path.join(ROOT, "scripts/sync-instrument.py");
  const python = path.join(ROOT, ".venv-whisper/bin/python3");

  for (const required of [sig, instrument, python]) {
    if (!existsSync(required)) {
      return { pass: false, offsetMs: null, status: "no-instrument", audioCorr: null,
        detail: `sync gate cannot run: ${required} is missing` };
    }
  }
  if (!existsSync(masterPath)) {
    return { pass: false, offsetMs: null, status: "no-master", audioCorr: null,
      detail: `sync gate cannot run: no master at ${masterPath}` };
  }

  try {
    execFileSync("ffmpeg", ["-nostdin", "-v", "error", "-t", "45", "-i", signedUrl(playbackId),
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30", "-c:a", "aac", "-y", `${work}/${tag}.mp4`],
      { stdio: "pipe", maxBuffer: MAXBUF });
    execFileSync(sig, [masterPath, `${work}/${tag}_m`, "45"], { stdio: "pipe", maxBuffer: MAXBUF });
    execFileSync(sig, [`${work}/${tag}.mp4`, `${work}/${tag}_p`, "45"], { stdio: "pipe", maxBuffer: MAXBUF });
    const out = execFileSync(python, [instrument, `${work}/${tag}_m`, `${work}/${tag}_p`, "--json"],
      { encoding: "utf8", maxBuffer: MAXBUF });
    const r = JSON.parse(out) as {
      status: string; offset_ms: number | null; rejected_offset_ms: number | null; audio_corr: number | null;
    };
    const offsetMs = r.offset_ms ?? r.rejected_offset_ms ?? null;
    /* `unmeasurable` is a refusal. See the header. */
    const pass = r.status === "ok" && r.offset_ms != null && Math.abs(r.offset_ms) <= SYNC_TOLERANCE_MS;
    return { pass, offsetMs, status: r.status, audioCorr: r.audio_corr,
      detail: pass
        ? `in sync: ${offsetMs} ms`
        : r.status !== "ok"
          ? `REFUSED — the instrument could not read this asset (${r.status}); that is not a pass`
          : `REFUSED — ${offsetMs} ms exceeds ±${SYNC_TOLERANCE_MS} ms` };
  } catch (e) {
    return { pass: false, offsetMs: null, status: "errored", audioCorr: null,
      detail: `sync gate errored: ${String((e as Error).message).slice(0, 160)}` };
  }
}
