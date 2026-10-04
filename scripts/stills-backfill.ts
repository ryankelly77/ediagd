/* ============================================================================
   EDIAGD — a still per film for the corpus

     set -a; source .env.local; set +a
     SB_URL="$NEXT_PUBLIC_SUPABASE_URL" SB_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
       npm run stills:backfill -- [--force] [--limit=N]

   For every published film, grab a frame from Mux a THIRD of the way in
   (time = duration_sec / 3, width 1600), where Mitch is usually mid-sentence
   rather than on a slate or a black first frame. Upload it to the PUBLIC
   film-stills bucket at <content_id>.jpg and record its permanent public URL on
   content_still; blog_corpus_films exposes still_url. See 0156 for why the URL is
   public and permanent (the blog bakes it into static pages that cannot refresh a
   token).

   RE-RUNNABLE and incremental: a film that already has a still is skipped unless
   --force. Coverage is reported as X of N either way, so a re-run reads 418 of 418
   again.

   BLACK FRAMES ARE REPORTED, NOT GUESSED AROUND. A third of the way in is a good
   default, not a guarantee; any frame that comes back black or near-black is
   listed so Ryan can pick a timestamp for it by hand (re-upload that one with a
   different time). Brightness is the mean luminance of the frame, via sharp.

   It reads Mux with the account token and writes with the service role. It never
   touches an advisor, a rooftop or a number — only content.
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import Mux from "@mux/mux-node";
import sharp from "sharp";

const SB_URL = process.env.SB_URL;
const SB_KEY = process.env.SB_KEY;
if (!SB_URL || !SB_KEY) {
  console.error("\n  SB_URL and SB_KEY are required.\n");
  process.exit(1);
}

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const LIMIT = (() => {
  const a = args.find((x) => x.startsWith("--limit="));
  return a ? Math.max(0, parseInt(a.slice("--limit=".length), 10) || 0) : 0;
})();

const STILL_WIDTH = 1600;
/** Mean luminance (0-255) at or below which a frame is flagged near-black. */
const BLACK_MEAN = 16;
const BUCKET = "film-stills";

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
  mux_playback_id: string | null;
  duration_sec: number | null;
  hasStill: boolean;
};

async function loadFilms(): Promise<Film[]> {
  const films: Film[] = [];
  const pageSize = 1000;
  for (let page = 0; ; page++) {
    const { data, error } = await sb
      .from("content")
      .select("id, title, mux_playback_id, duration_sec, content_still(content_id)")
      .eq("type", "advisor_video")
      .eq("status", "published")
      .is("retired_at", null)
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw new Error(`content read: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data as unknown as Record<string, unknown>[]) {
      const cs = r.content_still as unknown[] | unknown | null;
      films.push({
        id: r.id as string,
        title: r.title as string,
        mux_playback_id: (r.mux_playback_id as string | null) ?? null,
        duration_sec: r.duration_sec == null ? null : Number(r.duration_sec),
        hasStill: Array.isArray(cs) ? cs.length > 0 : Boolean(cs),
      });
    }
    if (data.length < pageSize) break;
  }
  return films;
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    })
  );
}

type Result = { kind: "filled"; mean: number } | { kind: "nomux" };

async function backfillOne(film: Film): Promise<Result> {
  if (!mux || !film.mux_playback_id) return { kind: "nomux" };
  const time = Math.max(1, Math.round((film.duration_sec ?? 9) / 3));
  const token = await mux.jwt.signPlaybackId(film.mux_playback_id, {
    type: "thumbnail",
    expiration: "600s",
  });
  const url = `https://image.mux.com/${film.mux_playback_id}/thumbnail.jpg?time=${time}&width=${STILL_WIDTH}&token=${token}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`thumbnail ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());

  // Mean luminance, so a black or near-black frame can be reported.
  const stats = await sharp(bytes).greyscale().stats();
  const mean = stats.channels[0]?.mean ?? 0;

  const objectPath = `${film.id}.jpg`;
  const up = await sb.storage
    .from(BUCKET)
    .upload(objectPath, bytes, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`upload: ${up.error.message}`);

  const publicUrl = sb.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;

  const { error } = await sb.from("content_still").upsert(
    {
      content_id: film.id,
      object_path: objectPath,
      still_url: publicUrl,
      source: "mux_thumbnail",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "content_id" }
  );
  if (error) throw new Error(`upsert: ${error.message}`);
  return { kind: "filled", mean };
}

async function main() {
  console.log(`\n  stills:backfill ${FORCE ? "--force " : ""}(time=dur/3, width=${STILL_WIDTH})\n`);
  if (!mux) {
    console.error("  Mux is not configured (MUX_* absent). Nothing to do.\n");
    process.exit(1);
  }

  const films = await loadFilms();
  console.log(`  published films: ${films.length}`);

  const todo = films.filter((f) => FORCE || !f.hasStill).slice(0, LIMIT || undefined);
  console.log(`  already have a still, skipped: ${films.filter((f) => f.hasStill).length}${FORCE ? " (ignored: --force)" : ""}`);
  console.log(`  to backfill: ${todo.length}`);

  let filled = 0;
  let nomux = 0;
  let errors = 0;
  const black: { title: string; mean: number }[] = [];
  const failures: string[] = [];
  await pool(todo, 8, async (film) => {
    try {
      const r = await backfillOne(film);
      if (r.kind === "filled") {
        filled++;
        if (r.mean <= BLACK_MEAN) black.push({ title: film.title, mean: Math.round(r.mean) });
      } else nomux++;
    } catch (e) {
      errors++;
      failures.push(`${film.title}: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  // Coverage after this run.
  const after = await loadFilms();
  const covered = after.filter((f) => f.hasStill).length;

  console.log(`\n  ${"─".repeat(60)}`);
  console.log(`  stills written this run: ${filled}`);
  console.log(`  coverage: ${covered} of ${after.length} films have a still`);
  console.log(`  no Mux playback id:      ${nomux}`);
  console.log(`  errors:                  ${errors}`);
  console.log(`  ${"─".repeat(60)}`);
  if (black.length) {
    console.log(`\n  BLACK / NEAR-BLACK FRAMES (mean luminance <= ${BLACK_MEAN}) — pick a timestamp by hand:`);
    for (const b of black) console.log(`    - ${b.title}  (mean ${b.mean})`);
  } else {
    console.log(`\n  No black or near-black frames.`);
  }
  for (const f of failures.slice(0, 20)) console.log(`    ! ${f}`);
  console.log(`\n  Done. still_url is a permanent public URL; re-run only to add new films.\n`);
}

main().catch((e) => {
  console.error(`\n  FAILED: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
