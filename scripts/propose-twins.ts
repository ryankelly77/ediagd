/* ============================================================================
   EDIAGD — cue and quote saying the same thing, unlinked

     SB_URL=… SB_KEY=… npm run propose:twins            # apply
     SB_URL=… SB_KEY=… npm run propose:twins -- --dry   # report only

   ---------------------------------------------------------------------------
   WHY THIS MATTERS TO THE DAILY LOOP AND NOT JUST TO TIDINESS
   ---------------------------------------------------------------------------
   pickQuotesForDay takes ONE exclusion: `videoArtifactId`, the lifestyle
   video's twin. That stops Mitch saying "never lose money" on step 4 while the
   same words sit on step 1.

   The coaching cue is chosen by pickCoachingCueForBlock and the quote picker
   never sees it. So a cue and a quote that are the same idea can both be served
   on the same day, and 127 such pairs exist unlinked — including the one search
   turned up, "The Perfect Pitch Is Not to Get a Yes", where the cue body is 600
   characters and the quote's is 768 with the same opening.

   Linking them gives the loop what it needs later; proposing rather than
   linking is the point of this script.

   ---------------------------------------------------------------------------
   PROPOSED, NEVER APPLIED
   ---------------------------------------------------------------------------
   Two rows sharing a title are usually one idea and sometimes are not: an
   excerpt and the passage it came from read identically at the top and are
   different content. Auto-linking would make the loop skip a cue Mitch meant to
   serve, silently, and the evidence would be gone. These land in
   content_review, which he already works.
   ============================================================================ */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry");

let _sb: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!_sb) {
    _sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
      auth: { persistSession: false },
    });
  }
  return _sb;
}

type Row = {
  id: string;
  type: string;
  title: string | null;
  body: string | null;
};

/** The quote matcher's normalisation: case, punctuation and spacing removed. */
const norm = (s: string | null) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* Borrowed verbatim from match-video-quotes.ts rather than re-derived, so that
   "the matcher thinks these are the same words" means one thing in this
   codebase and not two. */
const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "at", "by",
  "for", "with", "is", "are", "was", "were", "be", "been", "it", "its", "that",
  "this", "you", "your", "i", "me", "my", "we", "us", "our", "as", "so", "do",
]);

const tokens = (s: string | null) =>
  new Set(norm(s).split(" ").filter((t) => t.length > 1 && !STOP.has(t)));

/** |A ∩ B| / |A| — how much of the shorter side the longer one contains. */
function containment(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit / a.size;
}

/**
 * How much of the same thing these two rows actually say, 0–1, measured on the
 * BODIES rather than the titles that matched them.
 *
 * A shared title is the cheapest possible evidence — this codebase has four
 * separate cues titled "Accountability" — and the matcher already refuses to
 * score anything with fewer than two content-bearing tokens for exactly that
 * reason. Scoring the bodies is what tells a reviewer whether "same title" was
 * two rows saying one thing or two rows filed under one word.
 */
function bodyOverlap(a: string | null, b: string | null): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size < 2 || tb.size < 2) return 0;
  /* Shorter side first: an excerpt is fully contained in its passage, and
     dividing by the passage would score that true pair as a weak one. */
  return ta.size <= tb.size ? containment(ta, tb) : containment(tb, ta);
}

async function all(): Promise<Row[]> {
  const out: Row[] = [];
  for (let off = 0; ; off += 1000) {
    const { data } = await sb()
      .from("content")
      .select("id, type, title, body")
      .in("type", ["cue", "quote"])
      .eq("status", "published")
      .is("retired_at", null)
      .is("artifact_id", null)
      .range(off, off + 999);
    const page = data ?? [];
    out.push(...(page as Row[]));
    if (page.length < 1000) return out;
  }
}

async function main() {
  console.log(`\n  mode  ${DRY ? "DRY RUN — nothing is written" : "apply"}\n`);

  const rows = await all();
  const cues = rows.filter((r) => r.type === "cue");
  const quotes = rows.filter((r) => r.type === "quote");
  console.log(`  ${cues.length} unlinked cues · ${quotes.length} unlinked quotes`);

  /* Index the quotes by normalised title, so this is a join rather than a
     150,000-comparison sweep. */
  const byTitle = new Map<string, Row[]>();
  for (const q of quotes) {
    const k = norm(q.title);
    if (!k) continue;
    byTitle.set(k, [...(byTitle.get(k) ?? []), q]);
  }

  type Pair = { cue: Row; quote: Row; how: string; overlap: number };
  const pairs: Pair[] = [];
  const add = (cue: Row, quote: Row, how: string) =>
    pairs.push({ cue, quote, how, overlap: bodyOverlap(cue.body, quote.body) });

  for (const c of cues) {
    const t = norm(c.title);
    for (const q of byTitle.get(t) ?? []) {
      add(c, q, "same title");
    }
    /* Body containment, the matcher's own test: one is a prefix of the other,
       which is what an excerpt looks like. Only checked when the titles differ,
       so a pair is proposed once. */
    if (!byTitle.get(t)?.length) {
      const cb = norm(c.body);
      if (cb.length < 40) continue;
      for (const q of quotes) {
        const qb = norm(q.body);
        if (qb.length < 40) continue;
        if (cb.startsWith(qb) || qb.startsWith(cb)) {
          add(c, q, "one body is a prefix of the other");
        }
      }
    }
  }

  pairs.sort((a, b) => b.overlap - a.overlap);

  const strong = pairs.filter((p) => p.overlap >= 0.85).length;
  const partial = pairs.filter((p) => p.overlap >= 0.4 && p.overlap < 0.85).length;
  const weak = pairs.length - strong - partial;

  console.log(`  ${pairs.length} unlinked twin pair(s) across ` +
    `${new Set(pairs.map((p) => p.cue.id)).size} cue(s)`);
  console.log(`    ${strong} say nearly the same words (body overlap ≥ 0.85)`);
  console.log(`    ${partial} overlap partially (0.40 – 0.85)`);
  console.log(`    ${weak} share only a title — most likely NOT twins\n`);

  pairs.slice(0, 6).forEach((p) =>
    console.log(
      `    ${p.overlap.toFixed(2)}  ${p.how.padEnd(34)} ${(p.cue.title ?? "").slice(0, 42)}`
    )
  );
  if (pairs.length > 6) console.log(`    … and ${pairs.length - 6} more`);

  if (DRY) {
    console.log("\n  DRY RUN — nothing written.\n");
    return;
  }

  /*
   * ONE ROW PER CUE, NOT ONE PER PAIR.
   *
   * content_review carries a unique (content_id, reason) — the queue is a list
   * of questions about a piece of content, not a list of facts about it. Eight
   * of these cues have two candidate quotes (four rows are titled
   * "Accountability"), so the pairs are folded into one question per cue with
   * the candidates ranked inside it: "which of these, if any, is the twin?"
   * That is also the question a reviewer can actually answer in one sitting.
   */
  const byCue = new Map<string, Pair[]>();
  for (const p of pairs) byCue.set(p.cue.id, [...(byCue.get(p.cue.id) ?? []), p]);

  /*
   * Already asked? Re-running must not reopen a question somebody has already
   * answered, so a cue with ANY unlinked_twin row is skipped whatever its
   * status — an upsert here would quietly flip a resolved row back to open.
   */
  const { data: existing } = await sb()
    .from("content_review")
    .select("content_id")
    .eq("reason", "unlinked_twin");
  const already = new Set(
    ((existing ?? []) as { content_id: string }[]).map((e) => e.content_id)
  );

  const inserts = [...byCue.entries()]
    .filter(([cueId]) => !already.has(cueId))
    .map(([cueId, ps]) => {
      const best = ps[0]!; // pairs were sorted by overlap before grouping
      const more = ps.length > 1 ? ` ${ps.length - 1} other candidate(s) listed.` : "";
      return {
        /* Filed against the CUE. The quote picker is the one that can exclude,
           but the cue is the row a person would edit or retire, and the queue is
           opened from a content row. */
        content_id: cueId,
        reason: "unlinked_twin",
        detail:
          `A quote may say the same thing, and neither row is artifact-linked — so the daily ` +
          `loop can serve both on one day. Matched on ${best.how}; the two bodies share ` +
          `${Math.round(best.overlap * 100)}% of their words. ` +
          (best.overlap >= 0.85
            ? "Almost certainly the same idea."
            : best.overlap >= 0.4
              ? "Read both before linking."
              : "Weak — the bodies barely overlap, so this is probably a shared title and nothing more.") +
          more,
        options: {
          twin_type: "quote",
          candidates: ps.map((p) => ({
            twin_id: p.quote.id,
            matched_on: p.how,
            body_overlap: Number(p.overlap.toFixed(3)),
          })),
        },
        status: "open",
      };
    });

  if (inserts.length === 0) {
    console.log("\n  every pair is already in the queue — nothing to add.\n");
    return;
  }

  for (let i = 0; i < inserts.length; i += 200) {
    const { error } = await sb().from("content_review").insert(inserts.slice(i, i + 200));
    if (error) throw new Error(`insert at ${i}: ${error.message}`);
  }
  console.log(`\n  queued ${inserts.length} proposal(s) for review.\n`);
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
    console.error("\n  FAILED:", e instanceof Error ? e.message : e, "\n");
    process.exit(1);
  });
}

export { norm };
