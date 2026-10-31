#!/usr/bin/env node
/* ============================================================================
   SYNC FINISH — the work left after the 266-film batch.

   Ryan's rulings, 30 October. Five phases, in order, one detached run:

     1  re-judge the 14 the old duplicated vote floor refused
     2  re-cut Piggyback and On the Drive at their measured window with NO
        shift — the first run shifted by the old asset's residual and landed
        within 3 ms of its own shift, so the shift was the error
     3  master-alignment for the films the correlator cannot read, AND the cut
        each one needs — the first run diagnosed all 11 and cut none
     4  retire the ACR-047 duplicates and finish the MPI retitles
     5  re-derive every stale vertical at the LANDSCAPE'S window, gated in
        crop mode against a master cropped the same 9:16

   ---------------------------------------------------------------------------
   ONE JUDGE
   ---------------------------------------------------------------------------
   The runner no longer carries its own vote floor. scripts/sync-instrument.py
   decides whether a measurement is readable; this file decides only whether a
   readable measurement is good enough (±40 ms) and whether the cut is the
   right length. Last night 14 films were repaired and then refused because
   this file re-applied a threshold the instrument had already lowered.

   ---------------------------------------------------------------------------
   WRITE-AHEAD, RESUMABLE, ONE INSTANCE
   ---------------------------------------------------------------------------
   Same construction as scripts/sync-repair.mjs: the ledger records intent
   before any asset is created or any row changed, an open intent row on
   startup is resolved by reading the database rather than assuming, and a pid
   lock refuses a second run.
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, appendFileSync, readdirSync, unlinkSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = "/Users/ryankelly/ediagd";
for (const l of readFileSync(`${ROOT}/.env.local`, "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const AUTH = "Basic " + Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString("base64");
const PRIV = Buffer.from(process.env.MUX_SIGNING_KEY_PRIVATE, "base64").toString("utf8");

const LEDGER = `${ROOT}/reports/sync-finish.json`;
const LOG    = `${ROOT}/reports/sync-repair.log`;
const LOCK   = `${ROOT}/reports/.sync-finish.lock`;
const STOP   = `${ROOT}/reports/.sync-finish.stop`;
const W      = `${ROOT}/.tmp-sync/work`;
const PRIOR  = `${ROOT}/reports/sync-recut.json`;
const GATE   = { offset: 40, lengthTol: 0.5 };
const P5_WORKERS = 2;   /* two vertical derives at a time; swaps stay serial */
const MAXBUF = 256 * 1024 * 1024;
const APPLY  = process.argv.includes("--apply");

/* --phase=5 and --only=<id,id> exist so the three proof films run through THIS
   code, not a copy of it. A proof that exercises a separate script proves the
   separate script. */
const ONLY_PHASES = (() => {
  const a = process.argv.find((x) => x.startsWith("--phase="));
  return a ? new Set(a.slice(8).split(",").map(Number)) : null;
})();
const ONLY_IDS = (() => {
  const a = process.argv.find((x) => x.startsWith("--only="));
  return a ? new Set(a.slice(7).split(",").map((s) => s.trim()).filter(Boolean)) : null;
})();
const phaseWanted = (n) => !ONLY_PHASES || ONLY_PHASES.has(n);
const idWanted = (id) => !ONLY_IDS || ONLY_IDS.has(id);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const signed = (pid) => {
  const h = b64({ alg: "RS256", typ: "JWT", kid: process.env.MUX_SIGNING_KEY_ID });
  const p = b64({ sub: pid, aud: "v", exp: Math.floor(Date.now() / 1000) + 10800 });
  return `https://stream.mux.com/${pid}.m3u8?token=${h}.${p}.${crypto.sign("RSA-SHA256", Buffer.from(`${h}.${p}`), PRIV).toString("base64url")}`;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const say = (s) => console.log(s);
const logLine = (s) => appendFileSync(LOG, `${stamp()}  ${s}\n`);

const mux = async (p, init, tries = 5) => {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`https://api.mux.com/video/v1${p}`, { ...init, headers: { Authorization: AUTH, "Content-Type": "application/json", ...(init?.headers || {}) } });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return j.data;
      if (r.status < 500 && r.status !== 429) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 140)}`);
      last = new Error(`${r.status}`);
    } catch (e) { if (/^4\d\d /.test(String(e.message))) throw e; last = e; }
    await sleep(2000 * 2 ** i);
  }
  throw last;
};

/* ---- how this job is stopped -----------------------------------------
   A SIGNAL IS NOT HOW YOU STOP THIS JOB, and the 30 October attempt is why.
   The lock holds node's own pid, which is right — but the run is launched
   under setsid and caffeinate, so node's PROCESS GROUP is the wrapper's, not
   its own pid. `kill -- -$(cat lock)` therefore signals a group that does not
   exist, falls through to killing node alone, and orphans a running ffmpeg.
   Signalling the real group did kill ffmpeg and caffeinate, and node carried
   straight on to the next film and started another encode. Only SIGKILL
   stopped it, which is the one way that cannot unwind cleanly.

   So stopping is a FILE, checked between films:

       touch reports/.sync-finish.stop

   The run finishes the film in hand, writes its ledger row, and exits 0. No
   asset is left half-swapped, because the check sits between films and never
   inside one.

   A START REFUSES while that file exists, rather than deleting it. Consuming
   the file silently would mean a stop could be undone by any later start,
   including an automatic one — and "I asked it to stop and something started
   it anyway" is not a state worth being able to represent. Removing it is one
   command and it is the operator saying so out loud. */
if (existsSync(STOP)) {
  console.error(`reports/.sync-finish.stop exists — refusing to start.\n`
    + `A previous run was asked to stop. Remove it when you mean to go again:\n`
    + `  rm ${STOP}`);
  logLine("REFUSED  start while .sync-finish.stop exists");
  process.exit(2);
}

/* ---- one instance ---------------------------------------------------- */
if (existsSync(LOCK)) {
  const old = readFileSync(LOCK, "utf8").trim();
  let alive = false; try { process.kill(Number(old), 0); alive = true; } catch {}
  if (alive) { console.error(`another run is alive (pid ${old}) — refusing`); process.exit(1); }
}
writeFileSync(LOCK, String(process.pid));   /* node's OWN pid, never a group */
const dropLock = () => { try { unlinkSync(LOCK); } catch {} };
process.on("exit", dropLock);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { dropLock(); process.exit(1); });

/* Latched, so the file can be removed after the stop is seen without the run
   changing its mind, and so the reason is logged exactly once. */
let stopping = false;
const stopRequested = () => {
  if (stopping) return true;
  if (existsSync(STOP)) {
    stopping = true;
    logLine("STOP   .sync-finish.stop seen — finishing the current film, then exiting cleanly");
    say("stop file seen — finishing the current film, then exiting");
  }
  return stopping;
};

const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : {};
/* What was already in the ledger before this run touched it, so the closing
   line can count THIS RUN's work rather than the file's running total. A
   summary that reports the whole ledger while claiming to report the run is
   the same defect as a summary that prints regardless of what happened. */
const keysAtStart = new Set(Object.keys(ledger));
const save = () => { const t = LEDGER + ".tmp"; writeFileSync(t, JSON.stringify(ledger, null, 1)); renameSync(t, LEDGER); };
const prior = JSON.parse(readFileSync(PRIOR, "utf8"));

const disk = new Map();
(function walk(d) { for (const e of readdirSync(d, { withFileTypes: true })) {
  const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else disk.set(e.name.toLowerCase(), f);
} })(process.env.VIDEO_MASTERS_DIR);
const masterFor = (c) => (c.canonical_filename && disk.get(c.canonical_filename.toLowerCase()))
  || (c.source_filename && disk.get(c.source_filename.toLowerCase())) || null;

/* ---- measurement ------------------------------------------------------ */
const signals = (src, tag) => execFileSync(`${ROOT}/scripts/sync-signals.sh`, [src, `${W}/${tag}`, "45"], { stdio: "pipe", maxBuffer: MAXBUF });
/* The master side of a VERTICAL comparison, cropped the same 9:16 the
   rendition is. Without this the instrument is handed two different pictures
   and the picture lag it returns is noise — which is what refused all 70
   verticals on 30 October while their audio agreed to 42 ms. */
const signalsCropped = (src, tag) => execFileSync(`${ROOT}/scripts/sync-signals.sh`, [src, `${W}/${tag}`, "45", "9x16"], { stdio: "pipe", maxBuffer: MAXBUF });
const fetchProxy = (pb, tag) => execFileSync("ffmpeg",
  ["-nostdin", "-v", "error", "-t", "45", "-i", signed(pb), "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30", "-c:a", "aac", "-y", `${W}/${tag}.mp4`],
  { stdio: "pipe", maxBuffer: MAXBUF });
const runPy = (script, tag) => JSON.parse(execFileSync(`${ROOT}/.venv-whisper/bin/python3`,
  [`${ROOT}/scripts/${script}`, `${W}/${tag}_m`, `${W}/${tag}_p`, "--json"], { encoding: "utf8", maxBuffer: MAXBUF }));

function measureWith(script, masterPath, pb, tag) {
  const once = () => { fetchProxy(pb, tag); signals(masterPath, `${tag}_m`); signals(`${W}/${tag}.mp4`, `${tag}_p`); return runPy(script, tag); };
  try { return once(); } catch (e) { say(`    retry: ${String(e.message).slice(0, 60)}`); return once(); }
}
const measure       = (m, pb, tag) => measureWith("sync-instrument.py", m, pb, tag);
const measureMaster = (m, pb, tag) => measureWith("sync-master-align.py", m, pb, tag);
const passes = (r) => r.status === "ok" && Math.abs(r.offset_ms) <= GATE.offset;

/* A vertical against its master: same instrument, same judge, master cropped
   to match. The proxy is already 9:16 as Mux serves it, so only the master
   side carries the crop flag. */
function measureVertical(masterPath, pb, tag) {
  const once = () => {
    fetchProxy(pb, tag);
    signalsCropped(masterPath, `${tag}_m`);
    signals(`${W}/${tag}.mp4`, `${tag}_p`);
    return runPy("sync-instrument.py", tag);
  };
  try { return once(); } catch (e) { say(`    retry: ${String(e.message).slice(0, 60)}`); return once(); }
}

/* ---- the cut window ---------------------------------------------------
   A vertical must be cut at the SAME window as the landscape it accompanies,
   or its length and every position_sec disagree with it.

   The window is MEASURED, not looked up: aligning the served landscape's
   audio to the disk master gives where the content actually begins, and the
   served asset's real Mux duration gives how long it runs. The ledgers are
   the cross-check, not the source — their points are in whatever asset they
   were measured against.

   NULL IS ABSENT, NOT ZERO. trim-pass.json carries trimStart: null for a
   tail-only trim. Ten of the 143 films in both ledgers "disagreed" by 4.9 to
   6.6 s purely because `window[0] - null` is `window[0] - 0` in JavaScript,
   and reconciling against that would have refused ten good films for an
   arithmetic artifact. */
const trimByContent = new Map();
for (const v of Object.values(JSON.parse(readFileSync(`${ROOT}/reports/trim-pass.json`, "utf8")))) {
  if (v.contentId) trimByContent.set(v.contentId, v);
}
const finite = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
function ledgerWindow(id) {
  const w = prior[id]?.window;
  if (Array.isArray(w) && finite(w[0]) !== null) return { start: w[0], src: "sync-recut" };
  const t = trimByContent.get(id);
  if (t && finite(t.trimStart) !== null) return { start: t.trimStart, src: "trim-pass" };
  return null;
}
const WINDOW_TOL = 0.75;   /* AGENTS.md: refuse on a ledger/measured disagreement over this */

/* ---- the swap, and what must travel with it --------------------------- */
async function swapIn(c, assetId, playbackId, duration, headCutSec) {
  const { error } = await sb.rpc("replace_master_asset", {
    _content_id: c.id, _new_asset_id: assetId, _new_playback_id: playbackId,
    _new_duration: Math.round(Number(duration)),
  });
  if (error) throw new Error(`replace_master_asset: ${error.message}`);

  /* POSITION_SEC MOVES WITH THE HEAD. A saved position is an offset into the
     OLD cut. Cutting N seconds off the front means every stored position is
     now N seconds late — an advisor resuming lands past where they stopped,
     and on a short film past the end. Clamped at 0 rather than going
     negative. Rows with no position are left alone. */
  let shifted = 0;
  if (headCutSec && headCutSec > 0) {
    const { data: rows } = await sb.from("content_progress")
      .select("id, position_sec").eq("content_id", c.id).not("position_sec", "is", null).gt("position_sec", 0);
    for (const r of rows ?? []) {
      const next = Math.max(0, Number(r.position_sec) - headCutSec);
      const { error: e2 } = await sb.from("content_progress").update({ position_sec: Math.round(next) }).eq("id", r.id);
      if (!e2) shifted++;
    }
  }
  return shifted;
}

/* ======================================================================= */
/* PHASE 1 — re-judge the 14                                                */
/* ======================================================================= */
async function phase1() {
  const todo = Object.entries(prior).filter(([id, v]) =>
    v.status === "failed-gate" && v.newAssetId && !(ledger[id] && ledger[id].phase === 1 && ledger[id].done));
  logLine(`PHASE 1  re-judge ${todo.length} film(s) whose assets already exist`);
  for (const [id, v] of todo) {
    if (stopRequested()) return;
    try {
      const { data: c } = await sb.from("content")
        .select("id,title,mux_asset_id,canonical_filename,source_filename").eq("id", id).maybeSingle();
      if (!c) { ledger[id] = { phase: 1, done: true, status: "refused", why: "no content row", title: v.title }; save(); continue; }
      const m = masterFor(c);
      if (!m) { ledger[id] = { phase: 1, done: true, status: "refused", why: "no master on disk", title: c.title }; save();
        logLine(`FAIL  ${c.title}  phase1 refused: no master`); continue; }
      const a = await mux(`/assets/${v.newAssetId}`);
      if (a.status !== "ready") { ledger[id] = { phase: 1, done: true, status: "refused", why: `asset ${a.status}`, title: c.title }; save();
        logLine(`FAIL  ${c.title}  phase1 refused: asset ${a.status}`); continue; }
      const pb = (a.playback_ids ?? [])[0]?.id;
      const re = measure(m, pb, "p1");
      const lenOk = v.lengthAsked == null || Math.abs(Number(a.duration) - Number(v.lengthAsked)) <= GATE.lengthTol;
      if (!(passes(re) && lenOk)) {
        ledger[id] = { phase: 1, done: true, status: "failed-gate", title: c.title, after: re, lengthGot: Number(a.duration) }; save();
        logLine(`FAIL  ${c.title}  before ${v.before?.offset_ms} ms  after ${re.offset_ms ?? re.rejected_offset_ms} ms  method=re-judged  (gate)`); continue;
      }
      if (!APPLY) { ledger[id] = { phase: 1, status: "dry", after: re, title: c.title }; save(); continue; }
      ledger[id] = { phase: 1, status: "intent", title: c.title, newAssetId: v.newAssetId, oldAssetId: c.mux_asset_id, window: v.window }; save();
      const shifted = await swapIn(c, v.newAssetId, pb, a.duration, v.window ? v.window[0] : 0);
      ledger[id] = { phase: 1, done: true, status: "swapped", title: c.title, method: "re-judged-existing-asset",
        before: v.before, after: { offset_ms: re.offset_ms, audio_corr: re.audio_corr, picture_votes: re.picture_votes },
        newAssetId: v.newAssetId, positionsShifted: shifted, verticalMarkedStale: true, at: new Date().toISOString() }; save();
      logLine(`PASS  ${c.title}  before ${v.before?.offset_ms} ms  after ${re.offset_ms} ms  method=re-judged  positions=${shifted}  vertical=stale`);
    } catch (e) {
      ledger[id] = { phase: 1, done: true, status: "errored", title: v.title, error: String(e.message).slice(0, 160) }; save();
      logLine(`FAIL  ${v.title}  phase1 errored: ${String(e.message).slice(0, 70)}`);
    }
  }
}

/* ======================================================================= */
/* PHASE 2 — the two whose MASTERS are out of sync                          */
/* ======================================================================= */
/* THE SHIFT WAS THE ERROR, NOT THE CUT — corrected 30 October.

   This phase shifted the audio by the OLD SERVED ASSET's residual, on the
   theory that the master itself was out of sync. The numbers say otherwise.
   Piggyback was shifted by -241.9 ms and came back at -240.7; On the Drive by
   -78 ms and came back at -74.7. A correction that leaves the error exactly
   where it was is not correcting anything: the fresh cut was already near
   zero, and the shift put the old asset's fault back into it.

   The uniformity is what should have been explained. Two films landing within
   3 ms of their own applied shift is not two coincidences, it is one
   systematic mistake — and a consistent difference is more dangerous than a
   wild one because it reads as a finding.

   So: re-cut at the measured window with NO shift and gate. Only if a
   residual over 40 ms survives a clean re-encode is the master itself at
   fault, and only then is it shifted — once, by THAT cut's own residual.

   -itsoffset is applied to a SECOND input of the same file rather than to the
   file as a whole, so the picture keeps the master's own timeline and only
   the sound moves. */
async function phase2() {
  /* Resolved from the recorded failure rather than typed, so a transcription
     slip cannot cut the wrong film. */
  const fromLedger = Object.entries(prior).filter(([, v]) => v.status === "failed-gate"
    && v.after?.status === "ok" && Math.abs(v.after.offset_ms) > GATE.offset);
  logLine(`PHASE 2  re-cut ${fromLedger.length} film(s) at the measured window, no shift`);
  for (const [id, v] of fromLedger) {
    const key = `p2:${id}`;
    if (ledger[key]?.done || !idWanted(id)) continue;
    if (stopRequested()) return;
    try {
      const { data: c } = await sb.from("content")
        .select("id,title,duration_sec,mux_asset_id,canonical_filename,source_filename").eq("id", id).maybeSingle();
      const m = masterFor(c);
      if (!m) { ledger[key] = { phase: 2, done: true, status: "refused", why: "no master", title: c?.title }; save(); continue; }
      const before = measure(m, (await sb.from("content").select("mux_playback_id").eq("id", id).maybeSingle()).data.mux_playback_id, "p2b");
      if (before.status !== "ok") { ledger[key] = { phase: 2, done: true, status: "refused", why: "before unmeasurable", title: c.title, before }; save();
        logLine(`FAIL  ${c.title}  phase2 refused: before unmeasurable`); continue; }
      const live = await mux(`/assets/${c.mux_asset_id}`);
      const dur = Number(live.duration);
      const start = -before.audio_lag_s;
      const lw = ledgerWindow(id);
      const gap = lw ? Math.abs(lw.start - start) : null;
      if (lw && gap > WINDOW_TOL) {
        ledger[key] = { phase: 2, done: true, status: "refused", title: c.title,
          why: `window disagreement ${gap.toFixed(3)}s: measured ${start.toFixed(3)} vs ${lw.src} ${lw.start}`, before }; save();
        logLine(`FAIL  ${c.title}  phase2 refused: window measured ${start.toFixed(3)}s vs ${lw.src} ${lw.start}s`); continue;
      }
      if (!APPLY) { ledger[key] = { phase: 2, status: "dry", title: c.title, before, start, dur, ledgerWindow: lw }; save(); continue; }

      /* One attempt = cut, upload, wait, measure. shiftSec "0" is the honest
         first attempt: cut faithfully and find out whether anything is wrong
         with the master at all. */
      const attempt = async (shiftSec, tag) => {
        const out = `${W}/p2_cut.mp4`;
        const args = ["-nostdin", "-v", "error", "-ss", start.toFixed(3), "-i", m];
        if (shiftSec !== null) args.push("-itsoffset", shiftSec, "-ss", start.toFixed(3), "-i", m,
          "-map", "0:v:0", "-map", "1:a:0");
        args.push("-t", dur.toFixed(3),
          "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-y", out);
        execFileSync("ffmpeg", args, { stdio: "pipe", maxBuffer: MAXBUF });

        const up = await mux("/uploads", { method: "POST", body: JSON.stringify({
          new_asset_settings: { playback_policy: ["signed"], video_quality: "basic", passthrough: `sync-recut-${id}`,
            generated_subtitles: [{ language_code: "en", name: "English (auto)" }] }, cors_origin: "*" }) });
        execFileSync("curl", ["-sS", "--fail", "-X", "PUT", "--upload-file", out, up.url], { stdio: "pipe", maxBuffer: MAXBUF });
        let aid = null;
        for (let i = 0; i < 100; i++) { const u = await mux(`/uploads/${up.id}`); if (u.asset_id) { aid = u.asset_id; break; } await sleep(3000); }
        let a = null;
        for (let i = 0; i < 480 && aid; i++) { const x = await mux(`/assets/${aid}`); if (x.status === "ready") { a = x; break; } if (x.status === "errored") break; await sleep(5000); }
        if (!a) return { assetId: aid, asset: null };
        const pb2 = (a.playback_ids ?? [])[0]?.id;
        return { assetId: aid, asset: a, pb: pb2, after: measure(m, pb2, tag),
          lenOk: Math.abs(Number(a.duration) - dur) <= GATE.lengthTol };
      };

      /* ---- attempt 1: no shift -------------------------------------------- */
      ledger[key] = { phase: 2, status: "intent", title: c.title, before, method: "no-shift", oldAssetId: c.mux_asset_id }; save();
      let t1 = await attempt(null, "p2a");
      let chosen = null, method = null;
      if (t1.asset && passes(t1.after) && t1.lenOk) { chosen = t1; method = "re-cut, no shift"; }

      /* ---- attempt 2, only if a residual SURVIVED a clean re-encode ------- */
      let t2 = null, shiftSec = null;
      if (!chosen && t1.asset && t1.after.status === "ok" && Math.abs(t1.after.offset_ms) > GATE.offset) {
        shiftSec = (t1.after.offset_ms / 1000).toFixed(4);
        logLine(`      ${c.title}  clean re-cut left ${t1.after.offset_ms} ms — the master is out of sync; shifting by ${shiftSec}s`);
        ledger[key] = { phase: 2, status: "intent", title: c.title, before, firstPass: t1.after,
          method: `audio-shift ${shiftSec}s`, oldAssetId: c.mux_asset_id, strandedAssetId: t1.assetId }; save();
        t2 = await attempt(shiftSec, "p2c");
        if (t2.asset && passes(t2.after) && t2.lenOk) { chosen = t2; method = `audio-shift ${shiftSec}s`; }
      }

      if (!chosen) {
        const last = t2 ?? t1;
        ledger[key] = { phase: 2, done: true, status: "failed-gate", title: c.title, before,
          firstPass: t1.after ?? null, after: last.after ?? null, shiftSec,
          newAssetId: last.assetId, strandedAssetId: t2 ? t1.assetId : null }; save();
        logLine(`FAIL  ${c.title}  before ${before.offset_ms} ms  no-shift ${t1.after?.offset_ms ?? t1.after?.rejected_offset_ms} ms${t2 ? `  shifted ${t2.after?.offset_ms ?? t2.after?.rejected_offset_ms} ms` : ""}  (gate)`); continue;
      }

      ledger[key] = { phase: 2, status: "intent", title: c.title, newAssetId: chosen.assetId, oldAssetId: c.mux_asset_id }; save();
      const shifted = await swapIn(c, chosen.assetId, chosen.pb, chosen.asset.duration, start);
      ledger[key] = { phase: 2, done: true, status: "swapped", title: c.title, method,
        before, after: { offset_ms: chosen.after.offset_ms }, newAssetId: chosen.assetId,
        strandedAssetId: chosen === t2 ? t1.assetId : null,
        positionsShifted: shifted, at: new Date().toISOString() }; save();
      logLine(`PASS  ${c.title}  before ${before.offset_ms} ms  after ${chosen.after.offset_ms} ms  method=${method}  positions=${shifted}  vertical=stale`);
    } catch (e) {
      ledger[key] = { phase: 2, done: true, status: "errored", title: v.title, error: String(e.message).slice(0, 160) }; save();
      logLine(`FAIL  ${v.title}  phase2 errored: ${String(e.message).slice(0, 70)}`);
    }
  }
}

/* ======================================================================= */
/* PHASE 3 — the films the correlator cannot read                           */
/* ======================================================================= */
/* MEASURING IS NOT FIXING — corrected 30 October. This phase measured all 11,
   wrote "needs a cut" on every one of them, and cut none. The ledger recorded
   a diagnosis as though it were an outcome, and the run reported the phase
   complete. Eleven films stayed exactly as out of sync as they were found.

   Now each one that needs a cut IS cut: from the disk master at its ledger
   window, full re-encode, gated with the master-alignment instrument because
   the correlator cannot read these films, swapped on pass.

   The OE Stagger goes first — it is the worst at +1184 ms. */
async function phase3() {
  const ids = [];
  for (const [id, v] of Object.entries(prior)) {
    if (v.status === "refused" && v.why === "before-measure unmeasurable") ids.push([id, v, "refused-9"]);
    if (v.status === "failed-gate" && v.after?.status === "unmeasurable") ids.push([id, v, "unmeasurable-gate"]);
  }
  ids.sort(([, a], [, b]) => (/oe stagger/i.test(b.title ?? "") ? 1 : 0) - (/oe stagger/i.test(a.title ?? "") ? 1 : 0));
  logLine(`PHASE 3  master-alignment then cut on ${ids.length} film(s) the correlator could not read`);
  for (const [id, v, group] of ids) {
    const key = `p3:${id}`;
    if (ledger[key]?.done || !idWanted(id)) continue;
    if (stopRequested()) return;
    try {
      const { data: c } = await sb.from("content")
        .select("id,title,duration_sec,mux_asset_id,mux_playback_id,canonical_filename,source_filename").eq("id", id).maybeSingle();
      const m = masterFor(c);
      if (!m) { ledger[key] = { phase: 3, done: true, status: "refused", why: "no master", title: c?.title }; save(); continue; }
      const r = measureMaster(m, c.mux_playback_id, "p3");
      const good = r.status === "ok" && r.within_40ms;
      if (good) {
        ledger[key] = { phase: 3, done: true, group, title: c.title, source: c.source_filename,
          status: "in-sync-leave-alone", align: r }; save();
        logLine(`PASS  ${c.title}  master-alignment ${r.offset_ms} ms  -> leave as is`); continue;
      }
      if (r.status !== "ok") {
        ledger[key] = { phase: 3, done: true, group, title: c.title, status: "refused",
          why: "master-alignment unmeasurable — neither instrument can read it", align: r }; save();
        logLine(`FAIL  ${c.title}  master-alignment unmeasurable  -> cannot cut what cannot be measured`); continue;
      }

      /* ---- it needs a cut, so cut it ------------------------------------- */
      const lw = ledgerWindow(id);
      if (!lw) {
        ledger[key] = { phase: 3, done: true, group, title: c.title, status: "refused",
          why: "needs a cut but no ledger window to cut at", align: r }; save();
        logLine(`FAIL  ${c.title}  needs a cut, no ledger window  -> held`); continue;
      }
      const live = await mux(`/assets/${c.mux_asset_id}`);
      const dur = Number(live.duration);
      if (!APPLY) {
        ledger[key] = { phase: 3, group, status: "dry", title: c.title, align: r, start: lw.start, dur, ledgerWindow: lw }; save(); continue;
      }
      ledger[key] = { phase: 3, group, status: "intent", title: c.title, align: r,
        start: lw.start, oldAssetId: c.mux_asset_id }; save();

      const out = `${W}/p3_cut.mp4`;
      execFileSync("ffmpeg", ["-nostdin", "-v", "error",
        "-ss", lw.start.toFixed(3), "-i", m, "-t", dur.toFixed(3),
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-y", out], { stdio: "pipe", maxBuffer: MAXBUF });

      const up = await mux("/uploads", { method: "POST", body: JSON.stringify({
        new_asset_settings: { playback_policy: ["signed"], video_quality: "basic", passthrough: `sync-p3-${id}`,
          generated_subtitles: [{ language_code: "en", name: "English (auto)" }] }, cors_origin: "*" }) });
      execFileSync("curl", ["-sS", "--fail", "-X", "PUT", "--upload-file", out, up.url], { stdio: "pipe", maxBuffer: MAXBUF });
      let assetId = null;
      for (let i = 0; i < 100; i++) { const u = await mux(`/uploads/${up.id}`); if (u.asset_id) { assetId = u.asset_id; break; } await sleep(3000); }
      let asset = null;
      for (let i = 0; i < 480 && assetId; i++) { const a = await mux(`/assets/${assetId}`); if (a.status === "ready") { asset = a; break; } if (a.status === "errored") break; await sleep(5000); }
      if (!asset) { ledger[key] = { phase: 3, done: true, group, status: "refused", why: "asset not ready", title: c.title, align: r, newAssetId: assetId }; save();
        logLine(`FAIL  ${c.title}  phase3 refused: asset not ready`); continue; }
      const pb = (asset.playback_ids ?? [])[0]?.id;
      /* Gated by the SAME instrument that diagnosed it — the correlator still
         cannot read these films after the cut any more than before it. */
      const after = measureMaster(m, pb, "p3a");
      const lenOk = Math.abs(Number(asset.duration) - dur) <= GATE.lengthTol;
      if (!(after.status === "ok" && after.within_40ms && lenOk)) {
        ledger[key] = { phase: 3, done: true, group, status: "failed-gate", title: c.title,
          align: r, after, newAssetId: assetId, lenOk }; save();
        logLine(`FAIL  ${c.title}  cut left ${after.offset_ms ?? after.rejected_offset_ms} ms${lenOk ? "" : " LENGTH"}  NOT swapped`); continue;
      }
      ledger[key] = { phase: 3, group, status: "intent", title: c.title, newAssetId: assetId, oldAssetId: c.mux_asset_id }; save();
      const shifted = await swapIn(c, assetId, pb, asset.duration, lw.start);
      ledger[key] = { phase: 3, done: true, group, status: "swapped", title: c.title, method: `cut at ${lw.src} window`,
        align: r, after: { offset_ms: after.offset_ms }, newAssetId: assetId,
        positionsShifted: shifted, at: new Date().toISOString() }; save();
      logLine(`PASS  ${c.title}  master-alignment ${r.offset_ms} ms -> ${after.offset_ms} ms  method=cut at ${lw.src} window  positions=${shifted}  vertical=stale`);
    } catch (e) {
      ledger[key] = { phase: 3, done: true, status: "errored", title: v.title, error: String(e.message).slice(0, 160) }; save();
      logLine(`FAIL  ${v.title}  phase3 errored: ${String(e.message).slice(0, 70)}`);
    }
  }
}

/* ======================================================================= */
/* PHASE 4 — ACR-047 retires, then finish the MPI retitles                  */
/* ======================================================================= */
async function phase4() {
  logLine("PHASE 4  ACR-047 duplicates and the remaining MPI retitles");
  /* ONLY WHERE A REPLACEMENT EXISTS. Ryan's ruling named three pairs; the live
     data has two. ACR-047 "On the Drive" has one row and no newer counterpart,
     so retiring it would remove a film and put nothing in its place. */
  for (const title of ["At the Kiosk", "After-MPI", "On the Drive"]) {
    const key = `p4:acr:${title}`;
    if (ledger[key]?.done) continue;
    if (stopRequested()) return;
    const { data } = await sb.from("content").select("id,title,duration_sec,source_filename,created_at")
      .eq("title", title).eq("status", "published").is("retired_at", null).like("source_filename", "ACR-047%");
    if ((data ?? []).length < 2) {
      ledger[key] = { phase: 4, done: true, status: "skipped", why: `${(data ?? []).length} live row(s) — no pair, nothing to replace it with`, title }; save();
      logLine(`SKIP  ACR-047 ${title}  ${(data ?? []).length} live row — no replacement, not retired`);
      continue;
    }
    /* The newer Mitch Hardt take stays; the old long .MOV retires. */
    const newer = data.find((r) => /Mitch Hardt/.test(r.source_filename));
    const older = data.find((r) => r !== newer);
    if (!newer || !older) { ledger[key] = { phase: 4, done: true, status: "refused", why: "cannot tell the pair apart", title }; save(); continue; }
    if (!APPLY) { ledger[key] = { phase: 4, status: "dry", keep: newer.id, retire: older.id, title }; save(); continue; }
    const { error } = await sb.from("content").update({
      retired_at: new Date().toISOString(),
      retired_reason: `Superseded by ${newer.source_filename} (${newer.duration_sec}s). Ryan's ruling 28 Oct: the newer take stays.`,
    }).eq("id", older.id);
    ledger[key] = { phase: 4, done: true, status: error ? "errored" : "retired", title,
      kept: newer.source_filename, retired: older.source_filename, error: error?.message }; save();
    logLine(`${error ? "FAIL" : "PASS"}  ACR-047 ${title}  retired ${older.source_filename} -> kept ${newer.source_filename}`);
  }
  /* The remaining MPI retitles: any live title still shared by more than one
     film, disambiguated by the op code's catalog name. Collisions refuse. */
  const key = "p4:retitles";
  if (!ledger[key]?.done) {
    const { data: all } = await sb.from("content").select("id,title,source_filename")
      .eq("status", "published").is("retired_at", null).not("source_filename", "is", null);
    const by = new Map();
    for (const r of all ?? []) { if (!by.has(r.title)) by.set(r.title, []); by.get(r.title).push(r); }
    const dupes = [...by].filter(([, v]) => v.length > 1);
    const code = (s) => (s?.match(/^([A-Z]{3}-\d{3})/) || [])[1] ?? null;
    const codes = [...new Set((all ?? []).map((r) => code(r.source_filename)).filter(Boolean))];
    const { data: cat } = await sb.from("op_code_catalog").select("code,name").in("code", codes);
    const name = new Map((cat ?? []).map((c) => [c.code, c.name]));
    const plan = [];
    for (const [t, rows] of dupes) for (const r of rows) {
      const cd = code(r.source_filename); const nm = cd ? name.get(cd) : null;
      if (cd && nm) plan.push({ id: r.id, to: `${t} — ${nm}` });
    }
    const seen = new Map(); for (const p of plan) seen.set(p.to, (seen.get(p.to) ?? 0) + 1);
    const collide = [...seen].filter(([, n]) => n > 1).map(([t]) => t);
    const safe = plan.filter((p) => !collide.includes(p.to));
    let ok = 0;
    if (APPLY) for (const p of safe) { const { error } = await sb.from("content").update({ title: p.to }).eq("id", p.id); if (!error) ok++; }
    ledger[key] = { phase: 4, done: APPLY, status: "retitled", renamed: ok, planned: safe.length, stillColliding: collide }; save();
    logLine(`PASS  MPI retitles  ${ok}/${safe.length} renamed, ${collide.length} still ambiguous: ${collide.join(" | ") || "none"}`);
  }
}

/* ======================================================================= */
/* PHASE 5 — the verticals                                                  */
/* ======================================================================= */
/* MASTER ONLY, NEVER HLS — lib/mux/derive.ts's rule, and the reason a
   recovered cut once produced a vertical of a different take. Each derived
   vertical is measured against the same disk master before it is marked
   ready: a 9:16 crop of an out-of-sync landscape is still out of sync.

   TWO THINGS THIS GOT WRONG ON 30 OCTOBER, both of which passed silently.

   It ran ffmpeg on the WHOLE master — no -ss, no -t — so every vertical
   carried the slate its landscape had cut off. Nothing errored; the
   renditions were simply a different film from the second they started, and
   every stored position_sec was wrong by the length of a slate.

   And it judged the 9:16 crop against the master's FULL frame, so the picture
   lag was noise: 70 films refused with offsets from -42 s to +0.4 s while
   their audio agreed to 42 ms. The audio agreeing that well on all 70 is what
   should have been explained, rather than read as 70 bad cuts.

   So now: the window is measured from the served landscape and reconciled
   against the ledger, the cut is one pass from the disk master, and the gate
   runs in crop mode with a length check beside it. */
async function phase5() {
  const swappedNow = new Set([
    ...Object.entries(prior).filter(([, v]) => v.status === "swapped").map(([id]) => id),
    ...Object.entries(ledger).filter(([, v]) => v.status === "swapped" && v.title).map(([k]) => k.replace(/^p\d:/, "")),
  ]);
  const { data: stale } = await sb.from("content")
    .select("id,title,mux_asset_id,mux_playback_id,canonical_filename,source_filename")
    .eq("vertical_status", "stale").limit(2000);
  const CORE = [/walk.?around/i, /setting up the mpi|mpi setup/i, /four step close/i, /success cycle/i, /objection/i, /lasting impression/i, /name tag/i, /menu/i];
  const rank = (t) => { for (const [i, re] of CORE.entries()) if (re.test(t)) return i; return 90; };
  const ordered = (stale ?? []).sort((a, b) =>
    (swappedNow.has(b.id) ? 1 : 0) - (swappedNow.has(a.id) ? 1 : 0) || rank(a.title) - rank(b.title));
  const queue = ordered.filter((c) => !ledger[`p5:${c.id}`]?.done && idWanted(c.id));
  logLine(`PHASE 5  ${ordered.length} stale vertical(s), ${queue.length} still to do; films swapped this run first, core tracks first within them; ${P5_WORKERS} derives at a time`);

  /* TWO DERIVES AT A TIME, AND EVERY TEMP FILE CARRIES ITS SLOT.
     The tags were fixed strings — p5, p5l, p5_vert.mp4 — which is harmless
     while the loop is serial and silently destroys both measurements the
     moment it is not: two workers would write one another's luma, pcm and
     mp4 and each would be gated against the other's film. The slot number is
     in every path below for that reason.

     The ledger stays a single writer because save() is synchronous and node
     is single-threaded: no await sits between mutating `ledger` and the
     rename that commits it, so a half-written ledger cannot be observed. */
  let next = 0;
  const worker = async (slot) => {
    for (;;) {
      if (stopRequested()) return;      /* between films, never inside one */
      const i = next++;
      if (i >= queue.length) return;
      await deriveVertical(queue[i], slot);
    }
  };
  await Promise.all(Array.from({ length: P5_WORKERS }, (_, s) => worker(s)));

  async function deriveVertical(c, slot) {
    const key = `p5:${c.id}`;
    const tagL = `p5l${slot}`, tagV = `p5v${slot}`;
    const out = `${W}/p5_vert_${slot}.mp4`;
    try {
      const m = masterFor(c);
      if (!m) { ledger[key] = { phase: 5, done: true, status: "refused", why: "no master on disk", title: c.title }; save();
        logLine(`FAIL  ${c.title}  vertical refused: no master`); return; }
      /* ---- WHERE THE LANDSCAPE WAS CUT, measured from the served asset ----
         Without this the vertical is derived from the whole master, so it
         carries the slate the landscape cut removed: its length and every
         stored position_sec disagree with the film it accompanies. */
      const live = await mux(`/assets/${c.mux_asset_id}`);
      const landDur = Number(live.duration);          /* REAL duration, never content.duration_sec */
      const land = measure(m, c.mux_playback_id, tagL);
      if (land.status !== "ok") {
        ledger[key] = { phase: 5, done: true, status: "refused", title: c.title,
          why: "landscape unmeasurable — cannot establish the cut window", landscape: land }; save();
        logLine(`FAIL  ${c.title}  vertical refused: landscape unmeasurable, no window`); return;
      }
      const start = -land.audio_lag_s;
      const lw = ledgerWindow(c.id);
      const disagreement = lw ? Math.abs(lw.start - start) : null;
      if (lw && disagreement > WINDOW_TOL) {
        ledger[key] = { phase: 5, done: true, status: "refused", title: c.title,
          why: `window disagreement ${disagreement.toFixed(3)}s: measured ${start.toFixed(3)} vs ${lw.src} ${lw.start}`,
          measuredStart: start, ledgerWindow: lw }; save();
        logLine(`FAIL  ${c.title}  vertical refused: window measured ${start.toFixed(3)}s vs ${lw.src} ${lw.start}s`); return;
      }
      if (!APPLY) {
        ledger[key] = { phase: 5, status: "dry", title: c.title, start, landDur,
          ledgerWindow: lw, windowAgreesWithin: disagreement }; save(); return;
      }
      ledger[key] = { phase: 5, status: "intent", title: c.title, start, landDur }; save();
      /* 9:16 centre crop from the MASTER, scaled to 1080x1920 and never
         upscaled past it — scripts/derive-vertical.ts's geometry. Accurate
         seek BEFORE -i, crop and full re-encode in the same pass, so the
         vertical and the landscape are one cut and no stream is copied. */
      execFileSync("ffmpeg", ["-nostdin", "-v", "error",
        "-ss", start.toFixed(3), "-i", m, "-t", landDur.toFixed(3),
        "-vf", "crop=ih*9/16:ih,scale=1080:1920:flags=lanczos", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-y", out],
        { stdio: "pipe", maxBuffer: MAXBUF });
      const up = await mux("/uploads", { method: "POST", body: JSON.stringify({
        new_asset_settings: { playback_policy: ["signed"], video_quality: "basic", passthrough: `vertical-${c.id}` }, cors_origin: "*" }) });
      execFileSync("curl", ["-sS", "--fail", "-X", "PUT", "--upload-file", out, up.url], { stdio: "pipe", maxBuffer: MAXBUF });
      let assetId = null;
      for (let i = 0; i < 100; i++) { const u = await mux(`/uploads/${up.id}`); if (u.asset_id) { assetId = u.asset_id; break; } await sleep(3000); }
      let asset = null;
      for (let i = 0; i < 480 && assetId; i++) { const a = await mux(`/assets/${assetId}`); if (a.status === "ready") { asset = a; break; } if (a.status === "errored") break; await sleep(5000); }
      if (!asset) { ledger[key] = { phase: 5, done: true, status: "refused", why: "vertical asset not ready", title: c.title, newAssetId: assetId }; save();
        logLine(`FAIL  ${c.title}  vertical refused: not ready`); return; }
      const pb = (asset.playback_ids ?? [])[0]?.id;
      /* THE SYNC GATE ON THE VERTICAL ITSELF, before it is marked ready —
         crop mode, so the master it is judged against is the same picture. */
      const r = measureVertical(m, pb, tagV);
      /* AND THE LENGTH AGAINST THE LANDSCAPE, which is the half a sync
         measurement cannot see: Mux returns exactly the length asked for and
         content from somewhere else. */
      const vertDur = Number(asset.duration);
      const lenOk = Math.abs(vertDur - landDur) <= GATE.lengthTol;
      if (!(passes(r) && lenOk)) {
        ledger[key] = { phase: 5, done: true, status: "failed-gate", title: c.title, after: r,
          newAssetId: assetId, start, vertDur, landDur, lenOk }; save();
        logLine(`FAIL  ${c.title}  vertical ${r.offset_ms ?? r.rejected_offset_ms} ms  len ${vertDur.toFixed(2)}/${landDur.toFixed(2)}s${lenOk ? "" : " LENGTH"}  NOT marked ready`); return;
      }
      const { error } = await sb.from("content").update({
        vertical_playback_id: pb, vertical_asset_id: assetId, vertical_status: "ready",
      }).eq("id", c.id);
      ledger[key] = { phase: 5, done: true, status: error ? "errored" : "vertical-ready", title: c.title,
        offset_ms: r.offset_ms, start, vertDur, landDur, newAssetId: assetId, error: error?.message }; save();
      logLine(`${error ? "FAIL" : "PASS"}  ${c.title}  vertical ${r.offset_ms} ms  len ${vertDur.toFixed(2)}/${landDur.toFixed(2)}s  -> ${error ? "update failed" : "ready"}`);
      try { unlinkSync(out); } catch {}
    } catch (e) {
      ledger[key] = { phase: 5, done: true, status: "errored", title: c.title, error: String(e.message).slice(0, 160) }; save();
      logLine(`FAIL  ${c.title}  vertical errored: ${String(e.message).slice(0, 70)}`);
    }
  }
}

/* ---- run -------------------------------------------------------------- */
logLine(`START  sync-finish pid ${process.pid}  apply=${APPLY}`
  + (ONLY_PHASES ? `  phases=${[...ONLY_PHASES].join(",")}` : "")
  + (ONLY_IDS ? `  only=${ONLY_IDS.size} film(s)` : "")
  + `  —  stop with: touch ${STOP}`);
if (phaseWanted(1) && !stopRequested()) await phase1();
if (phaseWanted(2) && !stopRequested()) await phase2();
if (phaseWanted(3) && !stopRequested()) await phase3();
if (phaseWanted(4) && !ONLY_IDS && !stopRequested()) await phase4();
if (phaseWanted(5) && !stopRequested()) await phase5();

/* The closing line is COMPUTED from what THIS RUN did — rows this run added,
   not the ledger's running total — and the exit code is a function of it. */
const v = Object.entries(ledger).filter(([k]) => !keysAtStart.has(k)).map(([, x]) => x);
const counts = {
  touched: v.length,
  swapped: v.filter((x) => x.status === "swapped").length,
  verticalsReady: v.filter((x) => x.status === "vertical-ready").length,
  failedGate: v.filter((x) => x.status === "failed-gate").length,
  refused: v.filter((x) => x.status === "refused").length,
  errored: v.filter((x) => x.status === "errored").length,
};
if (stopping) {
  logLine(`STOPPED  sync-finish stopped on request after the film in hand — `
    + `${counts.touched} film(s) this run: swapped ${counts.swapped}, verticals ready ${counts.verticalsReady}, `
    + `failed-gate ${counts.failedGate}, refused ${counts.refused}, errored ${counts.errored}. `
    + `Ledger is complete to this point; remove ${STOP} and start again to resume.`);
  dropLock();
  process.exit(0);
}
logLine(`DONE   sync-finish — ${counts.touched} film(s) this run: swapped ${counts.swapped}, verticals ready ${counts.verticalsReady}, `
  + `failed-gate ${counts.failedGate}, refused ${counts.refused}, errored ${counts.errored}`);
dropLock();
process.exit(counts.errored > 0 ? 1 : 0);
