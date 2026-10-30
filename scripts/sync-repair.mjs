#!/usr/bin/env node
/* ============================================================================
   SYNC REPAIR — re-cut every out-of-sync film from its disk master.

   Ryan's rulings, 28-29 Oct:
     cut only from the disk masters in Published
     never from a Mux archive, never a Mux clip
     full re-encode of both streams, uploaded as a fresh asset
     sync gate on every swap
     write-ahead ledger
     resumable; never re-cut a film that passed

   ---------------------------------------------------------------------------
   THE LEDGER IS WRITTEN BEFORE THE SWAP, NOT AFTER
   ---------------------------------------------------------------------------
   The first version wrote its row after `update content`. A kill in that
   window would have left a swapped film with no record — and the next run,
   reading an empty ledger, would have cut it again. The ledger now records
   INTENT first (with the asset ids involved), and marks the row complete
   afterwards. An open intent row on startup means a previous run died
   mid-film, and is resolved by looking at what the database actually says
   rather than by assuming either outcome.

   ---------------------------------------------------------------------------
   THE SWAP GOES THROUGH replace_master_asset(), NOT A RAW UPDATE
   ---------------------------------------------------------------------------
   0058 section 5 exists so the master and the vertical cannot drift: it swaps
   the asset and marks the vertical stale in ONE statement. A raw update sets
   the new master and leaves vertical_status = 'ready' on a crop made from the
   OLD master — so the phone would keep playing the out-of-sync vertical while
   the landscape was fixed, and nothing would raise an error.

   A stale vertical mints no token (lib/daily.ts), so the player falls back to
   the landscape master letterboxed. That is the intended end state here;
   re-deriving verticals is parked under t29.
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, appendFileSync, readdirSync, unlinkSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import crypto from "node:crypto";

for (const l of readFileSync("/Users/ryankelly/ediagd/.env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const AUTH = "Basic " + Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString("base64");
const PRIV = Buffer.from(process.env.MUX_SIGNING_KEY_PRIVATE, "base64").toString("utf8");

const ROOT = "/Users/ryankelly/ediagd";
const LEDGER = path.join(ROOT, "reports/sync-recut.json");
const LOG = path.join(ROOT, "reports/sync-repair.log");
const LOCK = path.join(ROOT, "reports/.sync-repair.lock");
const W = path.join(ROOT, ".tmp-sync/work");
/* ONE JUDGE. votes and spread are NOT here.
   Tonight's run refused 14 films the instrument had already called ok —
   offset, spread and audio all inside the gate — because this object
   re-applied a vote floor of 12 that the instrument had already lowered to 3.
   Two places deciding one question, and the stricter copy won silently.
   The runner now takes the instrument's status and adds only the things the
   instrument cannot know: the offset budget and the length. */
const GATE = { offset: 40, lengthTol: 0.5 };
const APPLY = process.argv.includes("--apply");
const MAXBUF = 256 * 1024 * 1024;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const signed = (pid) => {
  const h = b64({ alg: "RS256", typ: "JWT", kid: process.env.MUX_SIGNING_KEY_ID });
  const p = b64({ sub: pid, aud: "v", exp: Math.floor(Date.now() / 1000) + 10800 });
  return `https://stream.mux.com/${pid}.m3u8?token=${h}.${p}.${crypto.sign("RSA-SHA256", Buffer.from(`${h}.${p}`), PRIV).toString("base64url")}`;
};
/* RETRY WITH BACKOFF. 68 films died on a bare "fetch failed" — a transient
   network or rate-limit error with no retry behind it, which threw the film
   away rather than waiting a second. 5xx and 429 are retried too; a 4xx is a
   real refusal and is raised immediately. */
const mux = async (p, init, tries = 5) => {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`https://api.mux.com/video/v1${p}`, { ...init, headers: { Authorization: AUTH, "Content-Type": "application/json", ...(init?.headers || {}) } });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return j.data;
      if (r.status < 500 && r.status !== 429) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 160)}`);
      last = new Error(`${r.status} ${JSON.stringify(j).slice(0, 120)}`);
    } catch (e) {
      if (/^4\d\d /.test(String(e.message))) throw e;
      last = e;
    }
    const wait = 2000 * Math.pow(2, i);
    say(`    mux ${p} failed (${String(last.message).slice(0, 50)}), retry ${i + 1}/${tries - 1} in ${wait / 1000}s`);
    await sleep(wait);
  }
  throw last;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const say = (s) => { console.log(s); };
/* One line per film, the thing Ryan reads in the morning. */
/* FILE ONLY. stdout is redirected into this same file by the launcher, so
   also console.log()-ing here printed every line twice. */
const logLine = (s) => { appendFileSync(LOG, `${stamp()}  ${s}\n`); };

/* ---- single instance ----------------------------------------------------- */
if (existsSync(LOCK)) {
  const old = readFileSync(LOCK, "utf8").trim();
  let alive = false;
  try { process.kill(Number(old), 0); alive = true; } catch { alive = false; }
  if (alive) { console.error(`another run is alive (pid ${old}) — refusing`); process.exit(1); }
  console.error(`stale lock from pid ${old}, taking it`);
}
writeFileSync(LOCK, String(process.pid));
const dropLock = () => { try { unlinkSync(LOCK); } catch {} };
process.on("exit", dropLock);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { dropLock(); process.exit(1); });

/* ---- ledger, written atomically ------------------------------------------ */
const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : {};
const save = () => {
  const tmp = LEDGER + ".tmp";
  writeFileSync(tmp, JSON.stringify(ledger, null, 1));
  renameSync(tmp, LEDGER);           // rename is atomic; a kill cannot truncate the ledger
};
const DONE = new Set(["swapped", "failed-gate", "refused", "errored", "already-in-sync"]);

/* ---- masters on disk ------------------------------------------------------ */
const disk = new Map();
(function walk(d) { for (const e of readdirSync(d, { withFileTypes: true })) {
  const f = path.join(d, e.name);
  if (e.isDirectory()) walk(f); else disk.set(e.name.toLowerCase(), f);
} })(process.env.VIDEO_MASTERS_DIR);

/* ---- measurement ---------------------------------------------------------- */
const measureOnce = (masterPath, pb, tag) => {
  execFileSync("ffmpeg", ["-nostdin", "-v", "error", "-t", "45", "-i", signed(pb),
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30", "-c:a", "aac", "-y", `${W}/${tag}.mp4`],
    { stdio: "pipe", maxBuffer: MAXBUF });
  execFileSync(path.join(ROOT, "scripts/sync-signals.sh"), [masterPath, `${W}/${tag}_m`, "45"], { stdio: "pipe", maxBuffer: MAXBUF });
  execFileSync(path.join(ROOT, "scripts/sync-signals.sh"), [`${W}/${tag}.mp4`, `${W}/${tag}_p`, "45"], { stdio: "pipe", maxBuffer: MAXBUF });
  return JSON.parse(execFileSync(path.join(ROOT, ".venv-whisper/bin/python3"),
    [path.join(ROOT, "scripts/sync-instrument.py"), `${W}/${tag}_m`, `${W}/${tag}_p`, "--json"],
    { encoding: "utf8", maxBuffer: MAXBUF }));
};
const measure = (m, pb, tag) => {
  try { return measureOnce(m, pb, tag); }
  catch (e) { say(`    measure failed, one retry: ${String(e.message).slice(0, 60)}`); return measureOnce(m, pb, tag); }
};
const passes = (r) => r.status === "ok" && Math.abs(r.offset_ms) <= GATE.offset;

const masterFor = (c) => (c.canonical_filename && disk.get(c.canonical_filename.toLowerCase()))
  || (c.source_filename && disk.get(c.source_filename.toLowerCase())) || null;

/* ---- the work list, rebuilt every pass so the rescan folds in ------------- */
const CORE = [/walk.?around/i, /setting up the mpi|mpi setup/i, /four step close/i, /success cycle/i,
  /objection/i, /lasting impression/i, /name tag/i, /menu/i];
const rank = (t) => { for (const [i, re] of CORE.entries()) if (re.test(t)) return i; return 90; };
function workList() {
  const scan = JSON.parse(readFileSync(path.join(ROOT, "reports/sync-scan-2026-10-28.json"), "utf8"));
  const items = [...scan.worklist];
  const rp = path.join(ROOT, ".tmp-sync/work/rescan.json");
  if (existsSync(rp)) {
    for (const r of JSON.parse(readFileSync(rp, "utf8"))) {
      if (r.status === "ok" && Math.abs(r.offset_ms) > 100 && !items.some((x) => x.id === r.id)) {
        items.push({ id: r.id, title: r.title, offset_ms: r.offset_ms, fromRescan: true });
      }
    }
  }
  return items
    .filter((w) => !(ledger[w.id] && DONE.has(ledger[w.id].status)))
    .sort((a, b) => rank(a.title) - rank(b.title) || Math.abs(b.offset_ms) - Math.abs(a.offset_ms));
}

/* ---- resolve any intent row left open by a previous run ------------------- */
async function resolveOpenIntents() {
  const open = Object.entries(ledger).filter(([, v]) => v.status === "intent");
  if (!open.length) return;
  logLine(`RESUME  ${open.length} open intent row(s) from a previous run — verifying against the database`);
  for (const [id, row] of open) {
    const { data: c } = await sb.from("content")
      .select("id,title,mux_asset_id,mux_playback_id,duration_sec,canonical_filename,source_filename").eq("id", id).maybeSingle();
    if (!c) { ledger[id] = { ...row, status: "refused", why: "content row vanished" }; save(); continue; }
    if (row.newAssetId && c.mux_asset_id === row.newAssetId) {
      /* The swap DID land before the kill. Measure what is live and close the
         row honestly rather than assuming it was good. */
      const m = masterFor(c);
      const after = m ? measure(m, c.mux_playback_id, "resume_after") : { status: "unmeasurable" };
      const ok = passes(after);
      ledger[id] = { ...row, status: ok ? "swapped" : "failed-gate", after,
        note: "swap landed before an interrupted run; verified on resume" };
      save();
      logLine(`${ok ? "PASS" : "FAIL"}  ${c.title}  before ${row.before?.offset_ms ?? "?"} ms  after ${after.offset_ms ?? after.rejected_offset_ms ?? "?"} ms  method=disk-master-reencode  (resumed)`);
    } else {
      /* Nothing was swapped. Clear the row so the film is retried cleanly. */
      delete ledger[id]; save();
      logLine(`RESUME  ${c.title} — intent open but no swap landed; requeued`);
    }
  }
}

/* ---- one film ------------------------------------------------------------- */
async function doFilm(w) {
  const { data: c } = await sb.from("content")
    .select("id,title,duration_sec,mux_asset_id,mux_playback_id,archived_asset_id,canonical_filename,source_filename")
    .eq("id", w.id).maybeSingle();
  if (!c) { ledger[w.id] = { title: w.title, status: "refused", why: "no content row" }; save();
    logLine(`FAIL  ${w.title}  refused: no content row`); return; }
  const master = masterFor(c);
  if (!master) { ledger[w.id] = { title: c.title, status: "refused", why: "no master on disk" }; save();
    logLine(`FAIL  ${c.title}  refused: no master on disk`); return; }

  const before = measure(master, c.mux_playback_id, "sr_before");
  if (before.status !== "ok") { ledger[w.id] = { title: c.title, status: "refused", why: `before-measure ${before.status}`, before }; save();
    logLine(`FAIL  ${c.title}  refused: cannot measure before-state`); return; }
  if (Math.abs(before.offset_ms) <= GATE.offset) {
    ledger[w.id] = { title: c.title, status: "already-in-sync", before }; save();
    logLine(`SKIP  ${c.title}  before ${before.offset_ms} ms — already inside the gate, left alone`); return; }

  /* THE REAL DURATION, NOT content.duration_sec. That column is rounded to the
     second, which added up to 0.44s to the window and pushed 13 films past the
     end of their own master — refused for being "too short" when the master was
     fine and the arithmetic was not. */
  const liveAsset = await mux(`/assets/${c.mux_asset_id}`);
  const dur = Number(liveAsset.duration);
  const start = -before.audio_lag_s;
  if (start < -0.5) { ledger[w.id] = { title: c.title, status: "refused", why: `negative start ${start.toFixed(3)}`, before }; save();
    logLine(`FAIL  ${c.title}  refused: window starts before the master`); return; }
  const masterDur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", master],
    { encoding: "utf8", maxBuffer: MAXBUF }).trim());
  if (!(masterDur > 0) || start + dur > masterDur + 0.25) {
    ledger[w.id] = { title: c.title, status: "refused", why: `master ${masterDur}s too short for window ending ${(start + dur).toFixed(2)}s`, before }; save();
    logLine(`FAIL  ${c.title}  refused: master too short for the window`); return; }

  /* ---- AN ASSET MAY ALREADY EXIST FROM A PREVIOUS RUN ---------------------
     10 of last night's 11 "failed gate" films were measured INSIDE the 40ms
     gate and refused on vote count alone. Their cut assets are ready in Mux.
     Re-encoding and re-uploading them would be paying twice to re-ask a
     question whose answer is already sitting there, so the existing asset is
     re-measured with the corrected instrument first. */
  const prior = ledger[w.id];
  if (prior && prior.newAssetId) {
    try {
      const a = await mux(`/assets/${prior.newAssetId}`);
      if (a.status === "ready") {
        const pb = (a.playback_ids ?? [])[0]?.id;
        const re = measure(master, pb, "sr_rejudge");
        const lenOk = Math.abs(Number(a.duration) - dur) <= GATE.lengthTol;
        if (passes(re) && lenOk) {
          ledger[w.id] = { ...prior, status: "intent", rejudged: true, newAssetId: prior.newAssetId }; save();
          const { error } = await sb.rpc("replace_master_asset", {
            _content_id: c.id, _new_asset_id: prior.newAssetId, _new_playback_id: pb,
            _new_duration: Math.round(Number(a.duration)) });
          if (!error) {
            ledger[w.id] = { ...prior, status: "swapped", method: "disk-master-reencode (re-judged)",
              after: { offset_ms: re.offset_ms, audio_corr: re.audio_corr, picture_votes: re.picture_votes, spread: re.picture_spread_frames },
              verticalMarkedStale: true, at: new Date().toISOString() };
            save();
            logLine(`PASS  ${c.title}  before ${before.offset_ms} ms  after ${re.offset_ms} ms  method=re-judged-existing-asset  vertical=stale`);
            return;
          }
        } else {
          say(`    existing asset still fails (${re.offset_ms ?? re.rejected_offset_ms} ms, votes ${re.picture_votes}) — re-cutting`);
        }
      }
    } catch (e) { say(`    could not re-judge prior asset: ${String(e.message).slice(0, 60)}`); }
  }

  /* ---- WRITE-AHEAD: intent recorded before anything is created or changed -- */
  ledger[w.id] = { title: c.title, status: "intent", method: "disk-master-reencode",
    window: [Number(start.toFixed(3)), Number((start + dur).toFixed(3))],
    before: { offset_ms: before.offset_ms, audio_corr: before.audio_corr, picture_votes: before.picture_votes },
    oldAssetId: c.mux_asset_id, newAssetId: null, startedAt: new Date().toISOString() };
  save();

  const out = `${W}/sr_cut.mp4`;
  execFileSync("ffmpeg", ["-nostdin", "-v", "error", "-ss", start.toFixed(3), "-i", master,
    "-t", dur.toFixed(3), "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-y", out], { stdio: "pipe", maxBuffer: MAXBUF });

  const up = await mux("/uploads", { method: "POST", body: JSON.stringify({
    new_asset_settings: { playback_policy: ["signed"], video_quality: "basic",
      passthrough: `sync-recut-${c.id}`,
      generated_subtitles: [{ language_code: "en", name: "English (auto)" }] }, cors_origin: "*" }) });
  execFileSync("curl", ["-sS", "--fail", "-X", "PUT", "--upload-file", out, up.url], { stdio: "pipe", maxBuffer: MAXBUF });

  let assetId = null;
  for (let i = 0; i < 100; i++) { const u = await mux(`/uploads/${up.id}`); if (u.asset_id) { assetId = u.asset_id; break; } await sleep(3000); }
  if (!assetId) { ledger[w.id] = { ...ledger[w.id], status: "refused", why: "upload produced no asset" }; save();
    logLine(`FAIL  ${c.title}  refused: upload produced no asset`); return; }
  ledger[w.id] = { ...ledger[w.id], newAssetId: assetId }; save();   // intent now names the asset

  let asset = null;
  for (let i = 0; i < 480; i++) { const a = await mux(`/assets/${assetId}`);   // 40 min, was 16
    if (a.status === "ready") { asset = a; break; } if (a.status === "errored") break; await sleep(5000); }
  if (!asset) { ledger[w.id] = { ...ledger[w.id], status: "refused", why: "asset never became ready" }; save();
    logLine(`FAIL  ${c.title}  refused: asset never became ready`); return; }
  const newPb = (asset.playback_ids ?? [])[0]?.id;

  /* ---- THE GATE, on the finished asset, before any swap ------------------- */
  const after = measure(master, newPb, "sr_after");
  const lenOk = Math.abs(Number(asset.duration) - dur) <= GATE.lengthTol;
  const ok = passes(after) && lenOk;
  if (!ok) {
    ledger[w.id] = { ...ledger[w.id], status: "failed-gate", after,
      lengthAsked: Number(dur.toFixed(3)), lengthGot: Number(asset.duration),
      note: "asset created but NOT swapped; the live row is untouched" }; save();
    logLine(`FAIL  ${c.title}  before ${before.offset_ms} ms  after ${after.offset_ms ?? after.rejected_offset_ms} ms  method=disk-master-reencode  (gate${lenOk ? "" : "+length"})`);
    return;
  }

  /* ---- swap through 0058's function: master and vertical in ONE statement -- */
  const { error } = await sb.rpc("replace_master_asset", {
    _content_id: c.id, _new_asset_id: assetId, _new_playback_id: newPb,
    _new_duration: Math.round(Number(asset.duration)) });
  if (error) { ledger[w.id] = { ...ledger[w.id], status: "errored", error: error.message, after }; save();
    logLine(`FAIL  ${c.title}  swap rpc failed: ${error.message}`); return; }

  ledger[w.id] = { ...ledger[w.id], status: "swapped", after: {
      offset_ms: after.offset_ms, audio_corr: after.audio_corr,
      picture_votes: after.picture_votes, spread: after.picture_spread_frames },
    newDuration: Number(asset.duration), verticalMarkedStale: true, at: new Date().toISOString() };
  save();
  logLine(`PASS  ${c.title}  before ${before.offset_ms} ms  after ${after.offset_ms} ms  method=disk-master-reencode  vertical=stale`);
  try { unlinkSync(out); } catch {}
}

/* ---- run ------------------------------------------------------------------ */
logLine(`START  pid ${process.pid}  apply=${APPLY}`);
await resolveOpenIntents();
let n = 0;
for (;;) {
  const list = workList();
  if (!list.length) break;
  const w = list[0];
  n++;
  say(`\n[${n}] ${w.title}`);
  if (!APPLY) { ledger[w.id] = { title: w.title, status: "refused", why: "dry run" }; save(); continue; }
  try { await doFilm(w); }
  catch (e) {
    ledger[w.id] = { ...(ledger[w.id] || { title: w.title }), status: "errored", error: String(e.message).slice(0, 200) };
    save();
    logLine(`FAIL  ${w.title}  errored, left untouched: ${String(e.message).slice(0, 70)}`);
  }
}
const done = Object.values(ledger);
logLine(`DONE   ${done.filter(r => r.status === "swapped").length} swapped, ${done.filter(r => r.status === "failed-gate").length} failed gate, ${done.filter(r => r.status === "refused").length} refused, ${done.filter(r => r.status === "errored").length} errored, ${done.filter(r => r.status === "already-in-sync").length} already in sync`);
dropLock();
