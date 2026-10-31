#!/usr/bin/env node
/* ============================================================================
   VERTICAL PROOF — the three checks a vertical must pass, measured from the
   renditions Mux actually serves.

   The sync gate answers "is the picture in step with the sound". It cannot
   answer "is this the same cut as the landscape", because a vertical derived
   from the whole master is internally in sync and still starts at a different
   moment from the film it accompanies. That is the defect this script exists
   to catch, and it is the one that shipped on 30 October: 70 verticals, each a
   faithful crop of the wrong window.

   THREE CHECKS, and a vertical is ready only on all three:

     1  LENGTH     vertical duration equals the landscape within 0.5 s
     2  ONSET      the first spoken word lands at the same time in both,
                   within 0.1 s
     3  SYNC       crop-mode offset within 40 ms

   Check 2 is measured TWICE by different routes and the two are reconciled:
   an onset threshold on each rendition separately, and a direct correlation of
   the two audio envelopes against each other. An onset detector depends on a
   threshold and a correlation does not, so when they agree the number is
   trustworthy and when they disagree the disagreement is the finding.

   Usage: node scripts/vertical-proof.mjs <content-id> [<content-id> ...]
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "node:fs";
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
const W = `${ROOT}/.tmp-sync/work`;
const MAXBUF = 256 * 1024 * 1024;
const TOL = { lengthSec: 0.5, onsetSec: 0.1, offsetMs: 40, routeSec: 0.08 };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const signed = (pid) => {
  const h = b64({ alg: "RS256", typ: "JWT", kid: process.env.MUX_SIGNING_KEY_ID });
  const p = b64({ sub: pid, aud: "v", exp: Math.floor(Date.now() / 1000) + 10800 });
  return `https://stream.mux.com/${pid}.m3u8?token=${h}.${p}.${crypto.sign("RSA-SHA256", Buffer.from(`${h}.${p}`), PRIV).toString("base64url")}`;
};
const mux = async (p) => {
  const r = await fetch(`https://api.mux.com/video/v1${p}`, { headers: { Authorization: AUTH } });
  const j = await r.json(); if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j.data;
};
const disk = new Map();
(function walk(d) { for (const e of readdirSync(d, { withFileTypes: true })) {
  const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else disk.set(e.name.toLowerCase(), f);
} })(process.env.VIDEO_MASTERS_DIR);
const masterFor = (c) => (c.canonical_filename && disk.get(c.canonical_filename.toLowerCase()))
  || (c.source_filename && disk.get(c.source_filename.toLowerCase())) || null;

const sig = (src, tag, crop) => execFileSync(`${ROOT}/scripts/sync-signals.sh`,
  [src, `${W}/${tag}`, "45", ...(crop ? [crop] : [])], { stdio: "pipe", maxBuffer: MAXBUF });
const proxy = (pb, tag) => execFileSync("ffmpeg",
  ["-nostdin", "-v", "error", "-t", "45", "-i", signed(pb), "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30", "-c:a", "aac", "-y", `${W}/${tag}.mp4`],
  { stdio: "pipe", maxBuffer: MAXBUF });
const instrument = (tag) => JSON.parse(execFileSync(`${ROOT}/.venv-whisper/bin/python3`,
  [`${ROOT}/scripts/sync-instrument.py`, `${W}/${tag}_m`, `${W}/${tag}_p`, "--json"], { encoding: "utf8", maxBuffer: MAXBUF }));

/* Onset of the first spoken word, and the lag between two envelopes, both
   from the same 8 kHz PCM the instrument uses. */
const PY_ONSET = `
import numpy as np, sys, json
RATE = 25.0
def env(p):
    a = np.fromfile(p, dtype=np.int16).astype(np.float64)
    w = int(8000/RATE); a = a[:len(a)//w*w].reshape(-1, w)
    return np.sqrt((a**2).mean(axis=1))
def onset(e):
    # The floor is the quietest tenth, the voice is the loudest tenth, and the
    # trip point sits between them -- so it adapts to the film's own level
    # instead of a fixed dB that a quiet master would never cross.
    q = np.quantile(e, [0.10, 0.90]); floor, voice = q[0], q[1]
    if voice <= floor: return None
    thr = floor + 0.25*(voice-floor)
    above = np.flatnonzero(e > thr)
    if len(above) == 0: return None
    # the first run of 5 consecutive frames above the trip point (200 ms), so a
    # single click cannot be mistaken for speech
    for i in above:
        if np.all(e[i:i+5] > thr): return float(i/RATE)
    return float(above[0]/RATE)
def norm(x):
    x = x - x.mean(); s = x.std(); return x/s if s > 0 else x
def lag(a, b, maxlag=int(RATE*30)):
    a, b = norm(a), norm(b)
    n = 1 << int(np.ceil(np.log2(len(a)+len(b))))
    c = np.fft.irfft(np.fft.rfft(a,n)*np.conj(np.fft.rfft(b,n)), n)
    c = np.concatenate([c[-maxlag:], c[:maxlag+1]])
    i = int(np.argmax(c))
    return float((i-maxlag)/RATE), float(c[i]/len(a))
ea, eb = env(sys.argv[1]), env(sys.argv[2])
l, q = lag(ea, eb)
print(json.dumps({"onset_a": onset(ea), "onset_b": onset(eb), "lag_s": round(l,3), "corr": round(q,3)}))
`;

const onsets = (pcmA, pcmB) => JSON.parse(execFileSync(`${ROOT}/.venv-whisper/bin/python3`,
  ["-c", PY_ONSET, pcmA, pcmB], { encoding: "utf8", maxBuffer: MAXBUF }));

const rows = [];
for (const id of process.argv.slice(2)) {
  const { data: c } = await sb.from("content")
    .select("id,title,vertical_status,vertical_asset_id,vertical_playback_id,mux_asset_id,mux_playback_id,canonical_filename,source_filename")
    .eq("id", id).maybeSingle();
  if (!c) { console.log(`\n${id}: no content row`); continue; }
  console.log(`\n=== ${c.title} ===`);
  console.log(`    vertical_status: ${c.vertical_status}`);
  if (!c.vertical_playback_id) { console.log("    NO VERTICAL — nothing to prove"); rows.push({ title: c.title, verdict: "no vertical" }); continue; }
  const m = masterFor(c);
  if (!m) { console.log("    NO MASTER ON DISK"); rows.push({ title: c.title, verdict: "no master" }); continue; }

  const land = await mux(`/assets/${c.mux_asset_id}`);
  const vert = await mux(`/assets/${c.vertical_asset_id}`);
  const lD = Number(land.duration), vD = Number(vert.duration);
  const dLen = vD - lD;

  /* both renditions as Mux serves them */
  proxy(c.mux_playback_id, "vpL");  sig(`${W}/vpL.mp4`, "vpL_s");
  proxy(c.vertical_playback_id, "vpV"); sig(`${W}/vpV.mp4`, "vpV_s");
  const o = onsets(`${W}/vpL_s.pcm`, `${W}/vpV_s.pcm`);

  /* check 3: the vertical against a master cropped the same way */
  sig(m, "vpV_m", "9x16");
  const inst = JSON.parse(execFileSync(`${ROOT}/.venv-whisper/bin/python3`,
    [`${ROOT}/scripts/sync-instrument.py`, `${W}/vpV_m`, `${W}/vpV_s`, "--json"], { encoding: "utf8", maxBuffer: MAXBUF }));

  const dOnset = (o.onset_a === null || o.onset_b === null) ? null : o.onset_b - o.onset_a;
  /* two routes to the same quantity: onset difference and envelope lag */
  const routesAgree = dOnset === null ? false : Math.abs(Math.abs(dOnset) - Math.abs(o.lag_s)) <= TOL.routeSec;
  const c1 = Math.abs(dLen) <= TOL.lengthSec;
  const c2 = dOnset !== null && Math.abs(dOnset) <= TOL.onsetSec && Math.abs(o.lag_s) <= TOL.onsetSec;
  const c3 = inst.status === "ok" && Math.abs(inst.offset_ms) <= TOL.offsetMs;

  console.log(`    1 LENGTH  landscape ${lD.toFixed(3)}s  vertical ${vD.toFixed(3)}s  delta ${dLen >= 0 ? "+" : ""}${dLen.toFixed(3)}s   ${c1 ? "PASS" : "FAIL"} (<=${TOL.lengthSec}s)`);
  console.log(`    2 ONSET   landscape ${o.onset_a === null ? "n/a" : o.onset_a.toFixed(3) + "s"}  vertical ${o.onset_b === null ? "n/a" : o.onset_b.toFixed(3) + "s"}  delta ${dOnset === null ? "n/a" : (dOnset >= 0 ? "+" : "") + dOnset.toFixed(3) + "s"}   ${c2 ? "PASS" : "FAIL"} (<=${TOL.onsetSec}s)`);
  console.log(`              corroborated by envelope lag ${o.lag_s >= 0 ? "+" : ""}${o.lag_s}s (corr ${o.corr}) — two routes ${routesAgree ? "AGREE" : "DISAGREE"}`);
  console.log(`    3 SYNC    crop-mode offset ${inst.offset_ms ?? inst.rejected_offset_ms} ms  status ${inst.status}  votes ${inst.picture_votes} spread ${inst.picture_spread_frames}  audio ${inst.audio_corr}   ${c3 ? "PASS" : "FAIL"} (<=${TOL.offsetMs}ms)`);
  if (inst.why) console.log(`              why: ${inst.why}`);
  const all = c1 && c2 && c3;
  console.log(`    VERDICT   ${all ? "READY — all three" : "NOT READY"}${all && !routesAgree ? " (but the two onset routes disagree — look before trusting)" : ""}`);
  rows.push({ title: c.title, lD, vD, dLen, onsetL: o.onset_a, onsetV: o.onset_b, dOnset,
    lag: o.lag_s, corr: o.corr, offset: inst.offset_ms ?? inst.rejected_offset_ms, status: inst.status,
    votes: inst.picture_votes, c1, c2, c3, routesAgree, verdict: all ? "ready" : "not-ready" });
}

console.log("\n\n| film | length L/V | delta | onset L/V | delta | crop offset | verdict |");
console.log("|---|---|---|---|---|---|---|");
for (const r of rows) {
  if (!r.lD) { console.log(`| ${r.title} | — | — | — | — | — | ${r.verdict} |`); continue; }
  console.log(`| ${r.title} | ${r.lD.toFixed(2)}/${r.vD.toFixed(2)}s | ${r.dLen >= 0 ? "+" : ""}${r.dLen.toFixed(3)}s `
    + `| ${r.onsetL?.toFixed(3) ?? "n/a"}/${r.onsetV?.toFixed(3) ?? "n/a"}s | ${r.dOnset === null ? "n/a" : (r.dOnset >= 0 ? "+" : "") + r.dOnset.toFixed(3) + "s"} `
    + `| ${r.offset} ms | ${r.verdict === "ready" ? "**READY**" : r.verdict} |`);
}
const ready = rows.filter((r) => r.verdict === "ready").length;
console.log(`\n${ready} of ${rows.length} pass all three checks.`);
process.exit(ready === rows.length ? 0 : 1);
