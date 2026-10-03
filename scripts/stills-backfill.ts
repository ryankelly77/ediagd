/* ============================================================================
   EDIAGD — a still per film for the corpus

     set -a; source .env.local; set +a
     SB_URL="$NEXT_PUBLIC_SUPABASE_URL" SB_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
       npm run stills:backfill -- [--force] [--limit=N]

   For every published film, grab a frame from Mux (the thumbnail at a fixed 3s —
   past a black first frame, before most of the talking), upload it to the PRIVATE
   film-stills bucket at <content_id>.jpg, sign a time-limited URL, and record both
   the object path and the signed URL on content_still. blog_corpus_films exposes
   still_url; see 0157 for why the URL is baked rather than signed per read.

   RE-RUNNABLE, and that is the refresh mechanism: a signed URL expires, so the
   script re-signs any still whose URL is within a day of expiring (or all of them
   with --force). A still already fresh is skipped. Point a weekly cron at it and
   the URLs never go stale.

   It reads Mux with the account token and writes with the service role. It never
   touches an advisor, a rooftop or a number — only content.
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import Mux from "@mux/mux-node";

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

/** How long a baked signed URL lasts, and how far ahead the re-run refreshes. */
const STILL_URL_TTL_DAYS = 30;
const REFRESH_WHEN_WITHIN_DAYS = 1;
/** The frame. A fixed early offset, past a black first frame. */
const STILL_TIME_SEC = 3;
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
  signed_until: string | null;
};

async function loadFilms(): Promise<Film[]> {
  const films: Film[] = [];
  const pageSize = 1000;
  for (let page = 0; ; page++) {
    const { data, error } = await sb
      .from("content")
      .select("id, title, mux_playback_id, content_still(signed_until)")
      .eq("type", "advisor_video")
      .eq("status", "published")
      .is("retired_at", null)
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw new Error(`content read: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data as unknown as Record<string, unknown>[]) {
      const cs = r.content_still as { signed_until: string }[] | { signed_until: string } | null;
      const signed = Array.isArray(cs) ? cs[0]?.signed_until ?? null : (cs?.signed_until ?? null);
      films.push({
        id: r.id as string,
        title: r.title as string,
        mux_playback_id: (r.mux_playback_id as string | null) ?? null,
        signed_until: signed,
      });
    }
    if (data.length < pageSize) break;
  }
  return films;
}

function freshEnough(signedUntil: string | null): boolean {
  if (!signedUntil) return false;
  const soon = Date.now() + REFRESH_WHEN_WITHIN_DAYS * 86_400_000;
  return new Date(signedUntil).getTime() > soon;
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    })
  );
}

async function backfillOne(film: Film): Promise<"filled" | "nomux" | "error"> {
  if (!mux || !film.mux_playback_id) return "nomux";
  const token = await mux.jwt.signPlaybackId(film.mux_playback_id, {
    type: "thumbnail",
    expiration: "600s",
  });
  const url = `https://image.mux.com/${film.mux_playback_id}/thumbnail.jpg?time=${STILL_TIME_SEC}&token=${token}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`thumbnail ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());

  const objectPath = `${film.id}.jpg`;
  const up = await sb.storage
    .from(BUCKET)
    .upload(objectPath, bytes, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`upload: ${up.error.message}`);

  const ttl = STILL_URL_TTL_DAYS * 86_400;
  const signed = await sb.storage.from(BUCKET).createSignedUrl(objectPath, ttl);
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(`sign: ${signed.error?.message ?? "no url"}`);
  }

  const nowMs = Date.now();
  const { error } = await sb.from("content_still").upsert(
    {
      content_id: film.id,
      object_path: objectPath,
      still_url: signed.data.signedUrl,
      signed_until: new Date(nowMs + ttl * 1000).toISOString(),
      source: "mux_thumbnail",
      updated_at: new Date(nowMs).toISOString(),
    },
    { onConflict: "content_id" }
  );
  if (error) throw new Error(`upsert: ${error.message}`);
  return "filled";
}

async function main() {
  console.log(`\n  stills:backfill ${FORCE ? "--force " : ""}(time=${STILL_TIME_SEC}s, ttl=${STILL_URL_TTL_DAYS}d)\n`);
  if (!mux) {
    console.error("  Mux is not configured (MUX_* absent). Nothing to do.\n");
    process.exit(1);
  }

  const films = await loadFilms();
  console.log(`  published films: ${films.length}`);

  const todo = films
    .filter((f) => FORCE || !freshEnough(f.signed_until))
    .slice(0, LIMIT || undefined);
  const skipped = films.length - todo.length;
  console.log(`  fresh, skipped: ${skipped}${FORCE ? " (ignored: --force)" : ""}`);
  console.log(`  to backfill: ${todo.length}`);

  let filled = 0;
  let nomux = 0;
  let errors = 0;
  const failures: string[] = [];
  await pool(todo, 8, async (film) => {
    try {
      const r = await backfillOne(film);
      if (r === "filled") filled++;
      else if (r === "nomux") nomux++;
    } catch (e) {
      errors++;
      failures.push(`${film.title}: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  console.log(`\n  ${"─".repeat(56)}`);
  console.log(`  stills written/refreshed: ${filled}`);
  console.log(`  no Mux playback id:       ${nomux}`);
  console.log(`  errors:                   ${errors}`);
  console.log(`  ${"─".repeat(56)}`);
  for (const f of failures.slice(0, 20)) console.log(`    - ${f}`);
  console.log(`\n  Done. Re-run (or --force) to refresh signed URLs before they expire.\n`);
}

main().catch((e) => {
  console.error(`\n  FAILED: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
