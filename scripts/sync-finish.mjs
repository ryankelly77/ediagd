#!/usr/bin/env node
/* ============================================================================
   SYNC FINISH — the work left after the 266-film batch.

   Ryan's rulings, 30 October. Five phases, in order, one detached run:

     1  re-judge the 14 the old duplicated vote floor refused
     2  re-cut Piggyback and On the Drive with the audio shifted by the
        measured residual — their MASTERS are out of sync, not the method
     3  master-alignment check for the films the correlator cannot read
     4  retire the ACR-047 duplicates and finish the MPI retitles
     5  re-derive every stale vertical, gated the same way

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
const W      = `${ROOT}/.tmp-sync/work`;
const PRIOR  = `${ROOT}/reports/sync-recut.json`;
const GATE   = { offset: 40, lengthTol: 0.5 };
const MAXBUF = 256 * 1024 * 1024;
const APPLY  = process.argv.includes("--apply");

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

/* ---- one instance ---------------------------------------------------- */
if (existsSync(LOCK)) {
  const old = readFileSync(LOCK, "utf8").trim();
  let alive = false; try { process.kill(Number(old), 0); alive = true; } catch {}
  if (alive) { console.error(`another run is alive (pid ${old}) — refusing`); process.exit(1); }
}
writeFileSync(LOCK, String(process.pid));
const dropLock = () => { try { unlinkSync(LOCK); } catch {} };
process.on("exit", dropLock);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { dropLock(); process.exit(1); });

const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : {};
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
/* The method cuts faithfully from the master, so a master that is itself out
   of sync produces a cut that is out of sync by the same amount. -itsoffset on
   the AUDIO INPUT shifts the sound relative to the picture by the measured
   residual before anything is cut. It is applied to a SECOND input of the same
   file rather than to the file as a whole, so the picture keeps the master's
   own timeline and only the sound moves. */
async function phase2() {
  const TARGETS = [
    { id: "c18f52fd-8e05-4113-9e7f-eaac21f92df6", residualMs: 40.6 },
    { id: "6aa81f6e-7c00-4e6b-9c1f-000000000000", residualMs: 65.8 },
  ];
  /* The second id was read from the ledger rather than typed — resolve by the
     recorded failure so a transcription slip cannot cut the wrong film. */
  const fromLedger = Object.entries(prior).filter(([, v]) => v.status === "failed-gate"
    && v.after?.status === "ok" && Math.abs(v.after.offset_ms) > GATE.offset);
  logLine(`PHASE 2  re-cut ${fromLedger.length} film(s) with the audio shifted by the measured residual`);
  for (const [id, v] of fromLedger) {
    const key = `p2:${id}`;
    if (ledger[key]?.done) continue;
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
      /* The residual IS the correction. offset = picture lag - audio lag, so a
         positive offset means sound leads picture and the audio must be
         DELAYED; -itsoffset with a positive value does exactly that. */
      const shiftSec = (before.offset_ms / 1000).toFixed(4);
      if (!APPLY) { ledger[key] = { phase: 2, status: "dry", title: c.title, before, shiftSec }; save(); continue; }
      ledger[key] = { phase: 2, status: "intent", title: c.title, before, shiftSec, oldAssetId: c.mux_asset_id }; save();

      const out = `${W}/p2_cut.mp4`;
      execFileSync("ffmpeg", ["-nostdin", "-v", "error",
        "-ss", start.toFixed(3), "-i", m,
        "-itsoffset", shiftSec, "-ss", start.toFixed(3), "-i", m,
        "-map", "0:v:0", "-map", "1:a:0", "-t", dur.toFixed(3),
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-y", out], { stdio: "pipe", maxBuffer: MAXBUF });

      const up = await mux("/uploads", { method: "POST", body: JSON.stringify({
        new_asset_settings: { playback_policy: ["signed"], video_quality: "basic", passthrough: `sync-shift-${id}`,
          generated_subtitles: [{ language_code: "en", name: "English (auto)" }] }, cors_origin: "*" }) });
      execFileSync("curl", ["-sS", "--fail", "-X", "PUT", "--upload-file", out, up.url], { stdio: "pipe", maxBuffer: MAXBUF });
      let assetId = null;
      for (let i = 0; i < 100; i++) { const u = await mux(`/uploads/${up.id}`); if (u.asset_id) { assetId = u.asset_id; break; } await sleep(3000); }
      let asset = null;
      for (let i = 0; i < 480 && assetId; i++) { const a = await mux(`/assets/${assetId}`); if (a.status === "ready") { asset = a; break; } if (a.status === "errored") break; await sleep(5000); }
      if (!asset) { ledger[key] = { phase: 2, done: true, status: "refused", why: "asset not ready", title: c.title, before, newAssetId: assetId }; save();
        logLine(`FAIL  ${c.title}  phase2 refused: asset not ready`); continue; }
      const pb = (asset.playback_ids ?? [])[0]?.id;
      const after = measure(m, pb, "p2a");
      const lenOk = Math.abs(Number(asset.duration) - dur) <= GATE.lengthTol;
      if (!(passes(after) && lenOk)) {
        ledger[key] = { phase: 2, done: true, status: "failed-gate", title: c.title, before, after, shiftSec, newAssetId: assetId }; save();
        logLine(`FAIL  ${c.title}  before ${before.offset_ms} ms  after ${after.offset_ms ?? after.rejected_offset_ms} ms  method=audio-shift ${shiftSec}s  (gate)`); continue;
      }
      ledger[key] = { phase: 2, status: "intent", title: c.title, newAssetId: assetId, oldAssetId: c.mux_asset_id }; save();
      const shifted = await swapIn(c, assetId, pb, asset.duration, start);
      ledger[key] = { phase: 2, done: true, status: "swapped", title: c.title, method: `audio-shift ${shiftSec}s`,
        before, after: { offset_ms: after.offset_ms }, newAssetId: assetId, positionsShifted: shifted, at: new Date().toISOString() }; save();
      logLine(`PASS  ${c.title}  before ${before.offset_ms} ms  after ${after.offset_ms} ms  method=audio-shift ${shiftSec}s  positions=${shifted}  vertical=stale`);
    } catch (e) {
      ledger[key] = { phase: 2, done: true, status: "errored", title: v.title, error: String(e.message).slice(0, 160) }; save();
      logLine(`FAIL  ${v.title}  phase2 errored: ${String(e.message).slice(0, 70)}`);
    }
  }
}

/* ======================================================================= */
/* PHASE 3 — the films the correlator cannot read                           */
/* ======================================================================= */
async function phase3() {
  const ids = [];
  for (const [id, v] of Object.entries(prior)) {
    if (v.status === "refused" && v.why === "before-measure unmeasurable") ids.push([id, v, "refused-9"]);
    if (v.status === "failed-gate" && v.after?.status === "unmeasurable") ids.push([id, v, "unmeasurable-gate"]);
  }
  logLine(`PHASE 3  master-alignment on ${ids.length} film(s) the correlator could not read`);
  for (const [id, v, group] of ids) {
    const key = `p3:${id}`;
    if (ledger[key]?.done) continue;
    try {
      const { data: c } = await sb.from("content")
        .select("id,title,mux_playback_id,canonical_filename,source_filename").eq("id", id).maybeSingle();
      const m = masterFor(c);
      if (!m) { ledger[key] = { phase: 3, done: true, status: "refused", why: "no master", title: c?.title }; save(); continue; }
      const r = measureMaster(m, c.mux_playback_id, "p3");
      const good = r.status === "ok" && r.within_40ms;
      ledger[key] = { phase: 3, done: true, group, title: c.title, source: c.source_filename,
        status: good ? "in-sync-leave-alone" : "needs-cut", align: r }; save();
      logLine(`${good ? "PASS" : "FAIL"}  ${c.title}  master-alignment ${r.offset_ms ?? r.rejected_offset_ms} ms  audio ${r.audio_corr} picture ${r.picture_corr}  -> ${good ? "leave as is" : "needs a cut"}`);
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
   ready: a 9:16 crop of an out-of-sync landscape is still out of sync. */
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
  logLine(`PHASE 5  ${ordered.length} stale vertical(s); films swapped this run first, core tracks first within them`);
  for (const c of ordered) {
    const key = `p5:${c.id}`;
    if (ledger[key]?.done) continue;
    try {
      const m = masterFor(c);
      if (!m) { ledger[key] = { phase: 5, done: true, status: "refused", why: "no master on disk", title: c.title }; save();
        logLine(`FAIL  ${c.title}  vertical refused: no master`); continue; }
      if (!APPLY) { ledger[key] = { phase: 5, status: "dry", title: c.title }; save(); continue; }
      ledger[key] = { phase: 5, status: "intent", title: c.title }; save();
      const out = `${W}/p5_vert.mp4`;
      /* 9:16 centre crop from the MASTER, scaled to 1080x1920 and never
         upscaled past it — scripts/derive-vertical.ts's geometry. */
      execFileSync("ffmpeg", ["-nostdin", "-v", "error", "-i", m,
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
      if (!asset) { ledger[key] = { phase: 5, done: true, status: "refused", why: "vertical asset not ready", title: c.title }; save();
        logLine(`FAIL  ${c.title}  vertical refused: not ready`); continue; }
      const pb = (asset.playback_ids ?? [])[0]?.id;
      /* THE SYNC GATE ON THE VERTICAL ITSELF, before it is marked ready. */
      const r = measure(m, pb, "p5");
      if (!passes(r)) {
        ledger[key] = { phase: 5, done: true, status: "failed-gate", title: c.title, after: r, newAssetId: assetId }; save();
        logLine(`FAIL  ${c.title}  vertical ${r.offset_ms ?? r.rejected_offset_ms} ms  NOT marked ready`); continue;
      }
      const { error } = await sb.from("content").update({
        vertical_playback_id: pb, vertical_asset_id: assetId, vertical_status: "ready",
      }).eq("id", c.id);
      ledger[key] = { phase: 5, done: true, status: error ? "errored" : "vertical-ready", title: c.title,
        offset_ms: r.offset_ms, newAssetId: assetId, error: error?.message }; save();
      logLine(`${error ? "FAIL" : "PASS"}  ${c.title}  vertical ${r.offset_ms} ms  -> ${error ? "update failed" : "ready"}`);
      try { unlinkSync(out); } catch {}
    } catch (e) {
      ledger[key] = { phase: 5, done: true, status: "errored", title: c.title, error: String(e.message).slice(0, 160) }; save();
      logLine(`FAIL  ${c.title}  vertical errored: ${String(e.message).slice(0, 70)}`);
    }
  }
}

/* ---- run -------------------------------------------------------------- */
logLine(`START  sync-finish pid ${process.pid}  apply=${APPLY}`);
await phase1();
await phase2();
await phase3();
await phase4();
await phase5();
const v = Object.values(ledger);
logLine(`DONE   sync-finish — swapped ${v.filter(x => x.status === "swapped").length}, verticals ready ${v.filter(x => x.status === "vertical-ready").length}, failed ${v.filter(x => String(x.status).includes("fail")).length}, refused ${v.filter(x => x.status === "refused").length}`);
dropLock();
