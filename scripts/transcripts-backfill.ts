/* ============================================================================
   EDIAGD — fill content_transcript from the two sources that exist

     set -a; source .env.local; set +a
     SB_URL="$NEXT_PUBLIC_SUPABASE_URL" SB_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
       npm run transcripts:backfill -- [--dry] [--force] [--limit=N]

   ---------------------------------------------------------------------------
   TWO SOURCES, AND ONE OF THEM BARELY REACHES THE CURRENT LIBRARY
   ---------------------------------------------------------------------------
   1. reports/dropzone-transcripts.json — Whisper transcripts from ingest runs,
      keyed by the DROP-ZONE camera filename (IMG_2161.MOV and the like). The
      brief asks to match these to rows through source_filename. They almost
      never match: content.source_filename holds the CANONICAL name a film was
      renamed to at ingest ("CRAFT — Phones and Tones, Part 1 — Mitch Hardt —
      v1.mov"), not the IMG name the transcript was keyed under. This is the
      "join on what was observed, not on what was derived" rule — the two systems
      recorded different keys for the same file. So this pass matches on
      source_filename exactly, ASSERTS the count, and reports it rather than
      reaching for a derived bridge that resolves one film in 167.

   2. Mux auto-captions — the durable source. For each published film we resolve
      its asset through mux_upload, read the asset's text tracks, and where one is
      ready, download the VTT with a signed token and store the text. This is the
      path the October captions job (every film through Mux auto-subtitles) fills
      the rest through, so the script is written to be re-run: it upserts, and
      skips films that already have a transcript unless --force.

   It writes with the service role and reads Mux with the account token. It never
   touches an advisor, a rooftop or a number — only content.
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import Mux from "@mux/mux-node";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SB_URL = process.env.SB_URL;
const SB_KEY = process.env.SB_KEY;
if (!SB_URL || !SB_KEY) {
  console.error("\n  SB_URL and SB_KEY are required.\n");
  process.exit(1);
}

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const FORCE = args.includes("--force");
const LIMIT = (() => {
  const a = args.find((x) => x.startsWith("--limit="));
  return a ? Math.max(0, parseInt(a.slice("--limit=".length), 10) || 0) : 0;
})();

const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

const muxReady =
  process.env.MUX_TOKEN_ID &&
  process.env.MUX_TOKEN_SECRET &&
  process.env.MUX_SIGNING_KEY_ID &&
  process.env.MUX_SIGNING_KEY_PRIVATE;

const mux = muxReady
  ? new Mux({
      tokenId: process.env.MUX_TOKEN_ID!,
      tokenSecret: process.env.MUX_TOKEN_SECRET!,
      jwtSigningKey: process.env.MUX_SIGNING_KEY_ID!,
      jwtPrivateKey: process.env.MUX_SIGNING_KEY_PRIVATE!,
    })
  : null;

type Film = {
  id: string;
  title: string;
  source_filename: string | null;
  mux_playback_id: string | null;
  mux_playback_policy: string | null;
  asset_id: string | null;
  has_transcript: boolean;
};

/** Strip a WebVTT file down to spoken text: no header, no timings, no cue ids,
 *  and no line repeated back-to-back (rolling captions duplicate heavily). */
function vttToText(vtt: string): string {
  const out: string[] = [];
  for (const raw of vtt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line === "WEBVTT" || line.startsWith("NOTE")) continue;
    if (line.includes("-->")) continue;
    if (/^\d+$/.test(line)) continue; // cue number
    const clean = line.replace(/<[^>]+>/g, ""); // inline tags
    if (out.length && out[out.length - 1] === clean) continue;
    out.push(clean);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

async function upsert(contentId: string, transcript: string, source: string) {
  if (DRY) return;
  const { error } = await sb.from("content_transcript").upsert(
    { content_id: contentId, transcript, source, updated_at: new Date().toISOString() },
    { onConflict: "content_id" }
  );
  if (error) throw new Error(`upsert ${contentId}: ${error.message}`);
}

/** Run `tasks` with at most `n` in flight. */
async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        await fn(items[idx]);
      }
    })
  );
}

async function loadFilms(): Promise<Film[]> {
  // Page content; join mux_upload for the asset id and content_transcript for
  // what is already filled.
  const films: Film[] = [];
  const pageSize = 1000;
  for (let page = 0; ; page++) {
    const { data, error } = await sb
      .from("content")
      .select(
        "id, title, source_filename, mux_playback_id, mux_playback_policy, " +
          "mux_upload(asset_id), content_transcript(content_id)"
      )
      .eq("type", "advisor_video")
      .eq("status", "published")
      .is("retired_at", null)
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw new Error(`content read: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data as unknown as Record<string, unknown>[]) {
      const up = r.mux_upload as { asset_id: string | null }[] | { asset_id: string | null } | null;
      const asset =
        Array.isArray(up) ? up[0]?.asset_id ?? null : (up?.asset_id ?? null);
      const tx = r.content_transcript as unknown[] | unknown | null;
      films.push({
        id: r.id as string,
        title: r.title as string,
        source_filename: (r.source_filename as string | null) ?? null,
        mux_playback_id: (r.mux_playback_id as string | null) ?? null,
        mux_playback_policy: (r.mux_playback_policy as string | null) ?? null,
        asset_id: asset,
        has_transcript: Array.isArray(tx) ? tx.length > 0 : Boolean(tx),
      });
    }
    if (data.length < pageSize) break;
  }
  return films;
}

async function muxCaption(film: Film): Promise<boolean> {
  if (!mux || !film.asset_id || !film.mux_playback_id) return false;
  const asset = await mux.video.assets.retrieve(film.asset_id);
  const track = (asset.tracks ?? []).find(
    (t) => t.type === "text" && t.status === "ready"
  );
  if (!track) return false;

  const token = await mux.jwt.signPlaybackId(film.mux_playback_id, {
    type: "video",
    expiration: "600s",
  });
  const url = `https://stream.mux.com/${film.mux_playback_id}/text/${track.id}.vtt?token=${token}`;
  const res = await fetch(url);
  if (!res.ok) return false;
  const text = vttToText(await res.text());
  if (!text) return false;
  await upsert(film.id, text, "mux_caption");
  return true;
}

async function main() {
  console.log(`\n  transcripts:backfill ${DRY ? "(DRY)" : ""}${FORCE ? " --force" : ""}\n`);

  const films = await loadFilms();
  console.log(`  published films: ${films.length}`);
  const alreadyFilled = films.filter((f) => f.has_transcript).length;
  console.log(`  already have a transcript: ${alreadyFilled}${FORCE ? " (ignored: --force)" : " (skipped)"}`);

  const todo = (FORCE ? films : films.filter((f) => !f.has_transcript)).slice(
    0,
    LIMIT || undefined
  );

  // ---- 1. Whisper, matched on source_filename (asserted) ------------------
  const json = JSON.parse(
    readFileSync(resolve("reports/dropzone-transcripts.json"), "utf8")
  ) as { files: { file: string; transcript?: string }[] };
  const whisper = new Map<string, string>();
  for (const f of json.files) if (f.transcript) whisper.set(f.file, f.transcript);

  let filledWhisper = 0;
  for (const film of todo) {
    const t = film.source_filename ? whisper.get(film.source_filename) : undefined;
    if (t && t.trim()) {
      await upsert(film.id, t.trim(), "whisper");
      film.has_transcript = true;
      filledWhisper++;
    }
  }
  console.log(
    `  Whisper (match on source_filename): ${filledWhisper} of ${whisper.size} ` +
      `transcripts matched a published film`
  );
  if (whisper.size > 0 && filledWhisper === 0) {
    console.log(
      `    NOTE: zero matches. The Whisper json is keyed by the drop-zone camera\n` +
        `    filename; content.source_filename holds the canonical rename. They do\n` +
        `    not share a key — see the script header.`
    );
  }

  // ---- 2. Mux captions ----------------------------------------------------
  let filledMux = 0;
  let muxErrors = 0;
  if (!mux) {
    console.log(`  Mux: not configured (MUX_* absent) — caption pass skipped.`);
  } else {
    const remaining = todo.filter((f) => !f.has_transcript && f.asset_id);
    console.log(`  Mux caption pass over ${remaining.length} films…`);
    await pool(remaining, 8, async (film) => {
      try {
        if (await muxCaption(film)) {
          film.has_transcript = true;
          filledMux++;
        }
      } catch (e) {
        muxErrors++;
        console.error(`    ${film.title}: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
    console.log(`  Mux captions filled: ${filledMux}${muxErrors ? `  (${muxErrors} errors)` : ""}`);
  }

  // ---- 3. Report ----------------------------------------------------------
  const stillNull = films.filter((f) => !f.has_transcript);
  console.log(`\n  ${"─".repeat(60)}`);
  console.log(`  filled this run: ${filledWhisper + filledMux}  (whisper ${filledWhisper}, mux ${filledMux})`);
  console.log(`  published films with a transcript now: ${films.length - stillNull.length}`);
  console.log(`  still null: ${stillNull.length}`);
  console.log(`  ${"─".repeat(60)}`);
  if (stillNull.length) {
    console.log(`\n  PUBLISHED FILMS WITH NO TRANSCRIPT FROM EITHER SOURCE:`);
    for (const f of stillNull) console.log(`    - ${f.title}`);
  }
  console.log(
    `\n  ${DRY ? "DRY — nothing written." : "Done."} Re-runnable; the October ` +
      `captions job fills the rest through the same Mux pass.\n`
  );
}

main().catch((e) => {
  console.error(`\n  FAILED: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
