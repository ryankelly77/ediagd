#!/usr/bin/env node
/* Restore auto-generated captions on assets that were created without them.
   Cause: sync-repair.mjs and sync-finish.mjs put generated_subtitles at the
   TOP LEVEL of new_asset_settings, where Mux silently ignores it. It belongs
   inside inputs[0], which is where replace-video.ts and derive-vertical.ts put
   it — and those kept their captions throughout.

   NO RE-UPLOAD AND NO RE-CUT. Mux generates subtitles on an EXISTING asset's
   audio track:
       POST /video/v1/assets/{ASSET}/tracks/{AUDIO_TRACK}/generate-subtitles
   Verified by trying it: /tracks/generate-subtitles returns 501, the per-audio
   -track form returns 201 with text_source "generated_vod".

   Re-checks each asset before asking, so a re-run after a partial pass costs
   one GET and skips what already has a track. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const ROOT = "/Users/ryankelly/ediagd";
for (const l of readFileSync(`${ROOT}/.env.local`, "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const AUTH = "Basic " + Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString("base64");
const STATE = `${ROOT}/.tmp-sync/work/captions-restore.json`;
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 1));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const hasEn = (a) => ((a?.tracks) ?? []).some(t => t.type === "text" && /en/i.test(t.language_code || "") && t.status !== "errored");

/* STATUS FIRST, BODY SECOND. The first pass checked only for `data` in the
   response, so a 429 rate-limit reply — which has no `data` — was recorded as
   "asset-gone" for 418 films that were all present. A missing asset is a 404
   and nothing else; everything retryable is retried. */
async function muxGet(path, tries = 6) {
  let last = "";
  for (let i = 0; i < tries; i++) {
    const r = await fetch(`https://api.mux.com/video/v1${path}`, { headers: { Authorization: AUTH } });
    if (r.status === 404) return { gone: true };
    if (r.ok) return { data: (await r.json()).data };
    last = `http-${r.status}`;
    const wait = Number(r.headers.get("retry-after") || 0) * 1000 || 1500 * 2 ** i;
    await sleep(wait);
  }
  return { error: last };
}
async function muxPost(path, body, tries = 6) {
  let last = "";
  for (let i = 0; i < tries; i++) {
    const r = await fetch(`https://api.mux.com/video/v1${path}`, { method: "POST",
      headers: { Authorization: AUTH, "Content-Type": "application/json" }, body });
    if (r.ok) return { ok: true };
    if (r.status === 404) return { gone: true };
    last = `http-${r.status}`;
    const wait = Number(r.headers.get("retry-after") || 0) * 1000 || 1500 * 2 ** i;
    await sleep(wait);
  }
  return { error: last };
}

const list = JSON.parse(readFileSync(`${ROOT}/.tmp-sync/work/no-captions.json`, "utf8"));
const work = [
  ...list.masters.map(x => ({ ...x, kind: "master" })),
  ...list.verticals.map(x => ({ ...x, kind: "vertical" })),
].sort((a, b) => a.rank - b.rank);   /* core tracks first */

let asked = 0, already = 0, failed = 0;
for (const [i, w] of work.entries()) {
  const key = `${w.kind}:${w.asset}`;
  if (state[key]?.done) continue;
  try {
    const a = await muxGet(`/assets/${w.asset}`);
    if (a.gone)  { state[key] = { done: true, status: "asset-gone", title: w.title }; failed++; save(); continue; }
    if (a.error) { state[key] = { status: a.error, title: w.title }; failed++; save(); continue; }  // not done: retried next run
    if (hasEn(a.data)) { state[key] = { done: true, status: "already", title: w.title }; already++; save(); continue; }
    const audio = (a.data.tracks ?? []).find(t => t.type === "audio");
    if (!audio) { state[key] = { done: true, status: "no-audio-track", title: w.title }; failed++; save(); continue; }
    const r = await muxPost(`/assets/${w.asset}/tracks/${audio.id}/generate-subtitles`,
      JSON.stringify({ generated_subtitles: [{ language_code: "en", name: "English (auto)" }] }));
    if (r.ok)        { state[key] = { done: true, status: "requested", title: w.title, kind: w.kind }; asked++; }
    else if (r.gone) { state[key] = { done: true, status: "asset-gone", title: w.title }; failed++; }
    else             { state[key] = { status: r.error, title: w.title }; failed++; }   // not done: retried next run
    save();
    await sleep(120);   /* ~8/s, under Mux's limit; the first pass ran flat out */
  } catch (e) { state[key] = { done: true, status: "errored", title: w.title, error: String(e.message).slice(0, 120) }; failed++; save(); }
  if ((i + 1) % 50 === 0) { console.error(`  ${i + 1}/${work.length}  requested ${asked} already ${already} failed ${failed}`); await sleep(500); }
}
console.log(`\n  requested ${asked}   already had one ${already}   failed ${failed}   of ${work.length}`);
const bad = Object.entries(state).filter(([, v]) => !["requested", "already"].includes(v.status));
if (bad.length) { console.log("  failures:"); for (const [, v] of bad.slice(0, 20)) console.log(`    ${v.status.padEnd(16)} ${v.title}`); }
