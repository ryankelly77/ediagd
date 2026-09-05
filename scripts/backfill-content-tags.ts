/* ============================================================================
   EDIAGD — backfill the content model onto rows that predate it

   Dry run by default. Every rule reports what it would touch; --apply writes.

   ---------------------------------------------------------------------------
   THE RULES, AND WHAT EACH ONE REFUSES TO GUESS
   ---------------------------------------------------------------------------
   1  FORMAT       from what the row actually is: a Mux id or a video_url makes
                   it 'video', otherwise its existing `type`. Nothing inferred.

   2  VOICE        `^Voice:\s*(.+)$` lifted out of the body and into the column
                   that has existed since 0059, then the line is stripped so
                   notes are notes again. The ingest wrote it into prose; that
                   was my mistake and this is the undo.

                   Videos with no voice line default to 'Mitch' — his own words
                   are the unmarked case, which is exactly why nobody typed a
                   voice for them.

   3  COLLECTION   `series` is the only shelf label that exists, and it holds
                   one value. MINDSET -> 'Mindset'. Anything else is LISTED,
                   NOT GUESSED: a wrong collection puts a video in a rotation
                   nobody chose, and that is worse than an untagged row.

   4  VERSION      every current row becomes v1, and its Mux ids are copied into
                   content_version so the first re-shoot has something to
                   supersede. Without this, v2 would be the first row in the
                   history table and v1 would be lost.

   5  DIMENSIONS   width/height read back from Mux, which is the only place they
                   exist. Duration is already stored.

   6  RETIRE       the login-clip placeholder, so the 0063 constraint
                   (video ⇒ playable or retired) can be added. Nothing is
                   deleted — retiring keeps every foreign key intact.

     npm run backfill:content -- --dry     (default)
     npm run backfill:content -- --apply
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import Mux from "@mux/mux-node";
import { readdir } from "node:fs/promises";

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});
const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});

const APPLY = process.argv.includes("--apply");
/**
 * Re-prove the acceptance counts against the database.
 *
 * WHY THIS EXISTS. An earlier run of this script reported "0 rows" for every
 * rule while doing nothing at all: the select still asked for `series` after
 * 0063 dropped it, PostgREST failed the whole query, and destructuring only
 * `data` turned a failed read into an empty table. "Applied" was inferred from
 * a run that had not read anything.
 *
 * So the counts are not trusted from a log — they are asked of the database,
 * on demand, by anyone.
 */
const VERIFY = process.argv.includes("--verify");
/**
 * Optional: the Published folder, so the 58 rows ingested before
 * source_filename/canonical_filename existed can get theirs.
 *
 * WITHOUT IT THE "REPLACE THE VIDEO" PANEL HAS NOTHING TO MATCH ON. A re-drop
 * is matched to an artifact by canonical filename, so a row with a null one can
 * never be replaced — ingest would treat the new take as a brand new item.
 */
const FILES_DIR = process.argv.find((a) => a.startsWith("--files-from="))?.split("=").slice(1).join("=");

type Row = {
  id: string; title: string; type: string; status: string;
  body: string | null; voice: string | null;
  format: string | null; collection: string | null; version: number | null;
  mux_asset_id: string | null; mux_playback_id: string | null;
  vertical_playback_id: string | null; video_url: string | null;
  width: number | null; height: number | null; retired_at: string | null;
  source: string | null; canonical_filename: string | null;
};


/**
 * ONE SPELLING PER PERSON, FROM DAY ONE.
 *
 * The Voice field autocompletes from `select distinct voice`, so the first
 * spelling written becomes the one everyone picks from. "Kobe" and "Kobe
 * Bryant" as two entries is a mess that compounds with every video, and this
 * is the only moment it can be set for free — 21 rows now, hundreds later.
 *
 * Surnames-only in the source filenames become full names; people already
 * written in full are left exactly as they are.
 */
const VOICE_CANON: Record<string, string> = {
  watts: "Alan Watts",
  kobe: "Kobe Bryant",
  buffett: "Warren Buffett",
  /*
   * "Mitch" -> "Mitch Hardt", and this one is not cosmetic.
   *
   * 192 quote rows already say "Mitch Hardt", and lib/content.ts suppresses the
   * house voice by EXACT match on HOUSE_VOICE = "Mitch Hardt" — so a row voiced
   * "Mitch" is not recognised as him and prints "MITCH" on screen as an
   * attribution, inside his own app. Two spellings is the defect the
   * one-spelling-per-person rule exists to prevent; this is what it looks like.
   */
  mitch: "Mitch Hardt",
};

const canonVoice = (v: string) => VOICE_CANON[v.trim().toLowerCase()] ?? v.trim();

const VOICE_LINE = /^[ \t]*Voice:[ \t]*(.+?)[ \t]*$/m;

async function verify() {
  const q = async (label: string, build: (b: any) => any, want: number | string) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const { count, error } = await build(sb.from("content").select("id", { count: "exact", head: true }));
    if (error) throw new Error(`${label}: ${error.message}`);
    const ok = typeof want === "number" ? count === want : true;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(46)} ${count}   (want ${want})`);
    return ok;
  };

  console.log("\n  VERIFY — asked of the database, not read from a log\n");
  let allOk = true;

  // `notes` is the column called `body` in this schema.
  allOk = (await q("body still contains a 'Voice:' line", (b) => b.like("body", "%Voice:%"), 0)) && allOk;
  allOk = (await q("published videos, null collection", (b) =>
    b.eq("format", "video").eq("status", "published").is("collection", null), 0)) && allOk;
  allOk = (await q("published videos, no asset and not retired", (b) =>
    b.eq("format", "video").eq("status", "published").is("mux_playback_id", null).is("retired_at", null), 0)) && allOk;
  /*
   * 57 = the 56 Mindset masters plus the onboarding intro, whose filenames were
   * recorded by hand rather than by ingest: the file in Drop Zone turned out to
   * BE that already-published asset (same 3840x2160, same 132.9s), so it was
   * named rather than re-uploaded. Recording the names is what makes a genuine
   * re-drop match that artifact and become v2.
   */
  allOk = (await q("videos with a canonical filename", (b) =>
    b.eq("format", "video").not("canonical_filename", "is", null), 57)) && allOk;
  // The two retired rows: the login-clip placeholder and the duplicate Buffett
  // cut. Neither has a master in Drive, so neither can have a canonical name.
  allOk = (await q("videos with NO canonical filename", (b) =>
    b.eq("format", "video").is("canonical_filename", null), 2)) && allOk;

  const { data: vRows } = await sb.from("content_version").select("version");
  const v1 = (vRows ?? []).filter((r) => r.version === 1).length;
  console.log(`  ${v1 === 59 ? "PASS" : "FAIL"}  ${"content_version v1 rows".padEnd(46)} ${v1}   (want 59)`);
  allOk = v1 === 59 && allOk;

  // One spelling per person is the whole point of the canon map.
  const all: { voice: string | null }[] = [];
  for (let o = 0; ; o += 1000) {
    const { data, error } = await sb.from("content").select("voice").eq("format", "video").order("id").range(o, o + 999);
    if (error) throw new Error(`voices: ${error.message}`);
    all.push(...(data ?? [])); if (!data || data.length < 1000) break;
  }
  const voices = new Map<string, number>();
  all.forEach((r) => r.voice && voices.set(r.voice, (voices.get(r.voice) ?? 0) + 1));
  console.log(`\n  distinct voices across videos: ${voices.size}`);
  [...voices].sort((a, b) => b[1] - a[1]).forEach(([v, n]) => console.log(`     ${String(n).padStart(3)}  ${v}`));

  console.log(`\n  ${allOk ? "ALL CHECKS PASS" : "SOME CHECKS FAILED — re-run with --apply; the script is idempotent"}\n`);
}

async function main() {
  if (VERIFY) { await verify(); return; }

  const rows: Row[] = [];
  for (let o = 0; ; o += 1000) {
    const { data, error } = await sb
      .from("content")
      .select(
        // `series` was dropped in 0063 — `collection` replaced it.
        "id, title, type, status, body, voice, format, collection, version, " +
          "mux_asset_id, mux_playback_id, vertical_playback_id, video_url, width, height, retired_at, source, canonical_filename"
      )
      .order("id")
      .range(o, o + 999);
    /*
     * FAIL LOUDLY. Destructuring only `data` made a failed query look like an
     * empty table: after 0063 dropped `series` this select errored, `data` came
     * back null, and every rule reported "0 rows" as though the backfill were
     * already done. A script that cannot tell "nothing to do" from "I could not
     * ask" is worse than one that crashes.
     */
    if (error) throw new Error(`read content: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) break;
  }
  console.log(`  ${rows.length} content rows\n${APPLY ? "  APPLYING" : "  DRY RUN — nothing will be written"}\n`);

  const isVideo = (r: Row) => Boolean(r.mux_playback_id || r.video_url);

  /* ---- 1. format --------------------------------------------------------- */
  const fmt = rows.filter((r) => !r.format);
  const fmtOf = (r: Row) => (isVideo(r) ? "video" : r.type === "quote" ? "quote" : "cue");
  const fmtCounts: Record<string, number> = {};
  fmt.forEach((r) => (fmtCounts[fmtOf(r)] = (fmtCounts[fmtOf(r)] ?? 0) + 1));
  console.log(`1 FORMAT           ${fmt.length} rows  ${JSON.stringify(fmtCounts)}`);

  /* ---- 2. voice ---------------------------------------------------------- */
  const fromNotes = rows.filter((r) => r.body && VOICE_LINE.test(r.body) && !r.voice);
  const videoDefault = rows.filter(
    (r) => isVideo(r) && !r.voice && !(r.body && VOICE_LINE.test(r.body))
  );
  console.log(`2 VOICE            ${fromNotes.length} lifted from notes, ${videoDefault.length} videos defaulting to 'Mitch'`);
  // Count on the CANONICAL name, and note the raw spellings it absorbed —
  // keying the tally by the display string counted every row separately.
  const voices = new Map<string, { n: number; raw: Set<string> }>();
  fromNotes.forEach((r) => {
    const raw = r.body!.match(VOICE_LINE)![1].trim();
    const v = canonVoice(raw);
    const e = voices.get(v) ?? { n: 0, raw: new Set<string>() };
    e.n++;
    if (raw !== v) e.raw.add(raw);
    voices.set(v, e);
  });
  [...voices].sort((a, b) => b[1].n - a[1].n).forEach(([v, e]) =>
    console.log(
      `                     ${String(e.n).padStart(3)}  ${v}${e.raw.size ? `   <- "${[...e.raw].join('", "')}"` : ""}`
    )
  );

  /* ---- 3. collection — DONE, AND NO LONGER POSSIBLE ---------------------
   * This rule read `series` and mapped it onto `collection`. It ran once,
   * moving 57 rows to Mindset and 1 to Onboarding, and then 0063 DROPPED
   * `series` — the column it read from no longer exists, so the rule cannot
   * run again and does not need to.
   *
   * Kept as a note rather than deleted: the next person to read this script
   * should be able to see how collection got populated, not wonder why every
   * video has one when nothing here sets it. */
  const withoutCollection = rows.filter((r) => !r.collection).length;
  console.log(`3 COLLECTION       done in the first pass; ${withoutCollection} rows still null (cues/quotes — not videos)`);

  /* ---- 4. version + v1 history ------------------------------------------- */
  const { data: existingV } = await sb.from("content_version").select("content_id");
  const haveV = new Set((existingV ?? []).map((v) => v.content_id));
  const needV1 = rows.filter((r) => isVideo(r) && !haveV.has(r.id));
  console.log(`4 VERSION          ${needV1.length} v1 history rows to create (videos only)`);

  /* ---- 5. dimensions ----------------------------------------------------- */
  const needDims = rows.filter((r) => r.mux_asset_id && (!r.width || !r.height));
  console.log(`5 DIMENSIONS       ${needDims.length} rows need width/height from Mux`);

  /* ---- 6. retire the placeholder ----------------------------------------- */
  const placeholders = rows.filter(
    (r) => isVideo(r) && !r.mux_playback_id && !r.retired_at
  );
  console.log(`6 RETIRE           ${placeholders.length} video row(s) with no Mux asset`);
  placeholders.forEach((r) => console.log(`                     ${r.status.padEnd(10)}${r.title}`));

  const demo = rows.filter((r) => /\[DEMO\]/.test(r.title) && !r.retired_at);
  console.log(`                   ${demo.length} [DEMO] rows (deleted earlier — expected 0)`);

  /* ---- 7. filenames for rows ingested before those columns existed ------- */
  const nameByTitle = new Map<string, string>();
  if (FILES_DIR) {
    for (const f of await readdir(FILES_DIR)) {
      if (!/\.(mov|mp4|m4v)$/i.test(f)) continue;
      /*
       * "MINDSET — Title (Voice) — v1.mov" -> the title the row was stored under.
       *
       * Split the SAME WAY ingest does, in the same order: drop the extension,
       * drop the trailing version, take everything after the first em/en dash,
       * then drop a trailing "(Voice)". A single regex that tried to do all of
       * it at once matched nothing, because titles legitimately contain colons
       * and hyphens ("WIN: What's Important Now") and the separator class ate
       * them.
       */
      let b = f.replace(/\.(mov|mp4|m4v)$/i, "").trim();
      b = b.replace(/\s*[—–]\s*v\d+\s*$/i, "").trim();
      const m = b.match(/^[A-Za-z][A-Za-z0-9 _]*?\s*[—–]\s*(.+)$/);
      if (!m) continue;
      nameByTitle.set(m[1].replace(/\s*\([^()]*\)\s*$/, "").trim(), f);
    }
  }
  const needNames = rows.filter(
    (r) => isVideo(r) && !r.canonical_filename && nameByTitle.has(r.title)
  );
  console.log(`7 FILENAMES        ${needNames.length} rows matched to a file in ${FILES_DIR ? "the published folder" : "(no --files-from given)"}`);

  if (!APPLY) {
    console.log("\n  --dry: nothing written. Re-run with --apply.\n");
    return;
  }

  /* ---- write ------------------------------------------------------------- */
  console.log("\n  writing…");
  let n = 0;

  for (const r of fmt) {
    await sb.from("content").update({ format: fmtOf(r) }).eq("id", r.id);
    n++;
  }
  console.log(`    format:      ${n}`);

  let v = 0;
  for (const r of fromNotes) {
    const m = r.body!.match(VOICE_LINE)!;
    // Strip the line and collapse the blank it leaves behind, so notes that
    // held nothing else end up empty rather than whitespace.
    const body = r.body!.replace(VOICE_LINE, "").replace(/\n{3,}/g, "\n\n").trim();
    await sb.from("content").update({ voice: canonVoice(m[1]), body: body || null }).eq("id", r.id);
    v++;
  }
  for (const r of videoDefault) {
    // The Buffett shelf implied its voice; that shelf is gone with `series`, so
    // what is left defaults to the house voice.
    await sb.from("content").update({ voice: canonVoice("Mitch") }).eq("id", r.id);
    v++;
  }
  console.log(`    voice:       ${v}`);


  if (needV1.length) {
    const { error } = await sb.from("content_version").insert(
      needV1.map((r) => ({
        content_id: r.id,
        version: 1,
        mux_asset_id: r.mux_asset_id,
        mux_playback_id: r.mux_playback_id,
        vertical_playback_id: r.vertical_playback_id,
        source_filename: r.source,
      }))
    );
    if (error) console.log(`    version:     FAILED — ${error.message}`);
    else console.log(`    version:     ${needV1.length} v1 rows`);
  }

  let d = 0;
  for (const r of needDims) {
    try {
      const a = await mux.video.assets.retrieve(r.mux_asset_id!);
      const t = (a.tracks ?? []).find((x) => x.type === "video");
      if (t?.max_width && t?.max_height) {
        await sb.from("content").update({ width: t.max_width, height: t.max_height }).eq("id", r.id);
        d++;
      }
    } catch {
      /* An asset Mux no longer has is not a reason to fail the whole backfill. */
    }
  }
  console.log(`    dimensions:  ${d}`);

  for (const r of placeholders) {
    await sb.from("content")
      .update({ retired_at: new Date().toISOString(), status: "draft" })
      .eq("id", r.id);
  }
  console.log(`    retired:     ${placeholders.length}`);

  let f = 0;
  for (const r of needNames) {
    const file = nameByTitle.get(r.title)!;
    await sb.from("content")
      .update({ source_filename: file, canonical_filename: file })
      .eq("id", r.id);
    f++;
  }
  console.log(`    filenames:   ${f}`);
  console.log("");
}

/*
 * NOT ON IMPORT.
 *
 * A bare IIFE runs the moment anything requires this file — which is how a test
 * that only wanted one helper triggered a full production import and truncated
 * 15 cue bodies. Nothing imports this today; the guard is for the person who
 * first wants to.
 */
if (require.main === module) {
  main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
}
