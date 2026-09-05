/* ============================================================================
   EDIAGD — find the quote each Mindset video is a filming of

   REPORT ONLY. This script never writes. It produces a CSV with a blank
   decision column for Ryan to fill, and scripts/link-artifacts.ts applies what
   he approves.

   ---------------------------------------------------------------------------
   WHY A REPORT AND NOT AN AUTOMATIC LINK
   ---------------------------------------------------------------------------
   A wrong link is worse than no link: it merges two ideas into one, and the
   daily loop then suppresses a quote an advisor should have seen because a
   video it has nothing to do with was served. The matcher is good enough to
   propose and not good enough to decide.

   ---------------------------------------------------------------------------
   HOW MATCHING WORKS
   ---------------------------------------------------------------------------
   NEVER ON QUOTE TITLE. A quote's `title` is its category label — "Risk /
   Capital preservation" for the one about never losing money — so title
   matching would score the right pair at zero and some wrong pair highly. The
   words live in `body`.

   The video's side of the comparison is its title plus the descriptive part of
   its canonical filename, which are usually the same but not always: the
   filename is what Mitch typed and the title is what ingest stored.

   VOICE IS A GATE, NOT A SIGNAL. A Buffett video cannot be a Kobe quote no
   matter how the words score. Voice disagreement removes a pair from
   consideration entirely rather than lowering its rank.

     A  exact    the normalized video string appears verbatim in the quote
     B  strong   token containment >= 0.85, and the top score is UNIQUE
     C  possible token containment 0.65 - 0.85, or a tie at the ceiling
        below 0.65, or voice disagrees: not a candidate

   CONTAINMENT, NOT JACCARD. The video string is short ("never lose money") and
   the quote is long ("Rule #1: Never lose money. Rule #2: Never forget rule
   #1."). Jaccard divides by the union and would score that true pair at 0.33;
   containment asks the question that actually matters — how much of the
   video's title is present in the quote — and scores it 1.0. The cost is that
   a one-word title would match anything containing that word, so a candidate
   needs at least two content-bearing tokens to be scored at all.

     npm run match:quotes
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});

type Row = {
  id: string;
  title: string;
  body: string | null;
  voice: string | null;
  quote_key: string | null;
  canonical_filename: string | null;
};

/** Lowercase, unify quote marks, drop punctuation, collapse whitespace. */
function norm(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Drop an enumerating prefix — "rule #1:", "rule 2." — for the fuzzy pass only.
 *
 * Tier A wants the quote as written, because a verbatim hit is the strongest
 * evidence there is. Tier B is asking "are these the same words", and a
 * numbering scheme the video title would never carry should not count against
 * the overlap.
 */
const stripEnumerator = (s: string) => s.replace(/^\s*rule\s*#?\s*\d+\s*[:.\-]?\s*/i, "");

/* Words that are present in almost any sentence and would inflate containment
   for a short title. Deliberately small — this is not a search engine. */
const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "at", "by",
  "for", "with", "is", "are", "was", "were", "be", "been", "it", "its", "that",
  "this", "you", "your", "i", "me", "my", "we", "us", "our", "as", "so", "do",
]);

const tokens = (s: string) =>
  new Set(norm(s).split(" ").filter((t) => t.length > 1 && !STOP.has(t)));

/** |A ∩ B| / |A| — how much of the video's title the quote contains. */
function containment(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit / a.size;
}

/**
 * The descriptive middle of `COLLECTION — Title (Voice) — vN.mov`.
 *
 * Split the same way ingest does — drop extension, drop version, take
 * everything after the first em/en dash, drop a trailing "(Voice)" — because a
 * single regex that tries all of it at once trips on titles that legitimately
 * contain a colon, like "WIN: What's Important Now".
 */
function descriptivePart(filename: string | null): string {
  if (!filename) return "";
  let b = filename.replace(/\.(mov|mp4|m4v)$/i, "").trim();
  b = b.replace(/\s*[—–]\s*v\d+\s*$/i, "").trim();
  const m = b.match(/^[A-Za-z][A-Za-z0-9 _]*?\s*[—–]\s*(.+)$/);
  if (!m) return "";
  return m[1].replace(/\s*\([^()]*\)\s*$/, "").trim();
}

const TIER_B = 0.85;
const TIER_C = 0.65;

async function main() {
  const page = async (build: (b: unknown) => unknown) => {
    const out: Row[] = [];
    for (let o = 0; ; o += 1000) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q = (build as any)(
        sb.from("content").select("id, title, body, voice, quote_key, canonical_filename")
      );
      const { data, error } = await q.order("id").range(o, o + 999);
      if (error) throw new Error(error.message);
      out.push(...((data ?? []) as unknown as Row[]));
      if (!data || data.length < 1000) break;
    }
    return out;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const videos = await page((b: any) =>
    b.eq("format", "video").eq("collection", "Mindset").is("retired_at", null)
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quotes = await page((b: any) => b.eq("format", "quote").is("retired_at", null));

  console.log(`  ${videos.length} Mindset videos, ${quotes.length} quotes\n`);

  // Pre-compute the quote side once rather than per video.
  const prepared = quotes.map((q) => {
    const body = q.body ?? "";
    return {
      row: q,
      normBody: norm(body),
      fuzzyTokens: tokens(stripEnumerator(body)),
    };
  });

  type Result = {
    video: Row;
    best: { q: Row; score: number; tier: "A" | "B" | "C" } | null;
    tiedAtCeiling: boolean;
    runnerUp: { q: Row; score: number } | null;
  };

  const results: Result[] = videos.map((v) => {
    const filenamePart = descriptivePart(v.canonical_filename);
    // Title and filename usually agree; when they differ, both are evidence.
    const searchRaw = filenamePart && norm(filenamePart) !== norm(v.title)
      ? `${v.title} ${filenamePart}`
      : v.title;
    const searchNorm = norm(v.title);
    const searchTokens = tokens(searchRaw);

    const scored: { q: Row; score: number; tier: "A" | "B" | "C" }[] = [];

    for (const p of prepared) {
      // VOICE IS A GATE. Disagreement removes the pair, it does not rank it low.
      if ((p.row.voice ?? "") !== (v.voice ?? "")) continue;

      // Tier A: the video's words, verbatim, inside the quote.
      if (searchNorm.length > 3 && p.normBody.includes(searchNorm)) {
        scored.push({ q: p.row, score: 1, tier: "A" });
        continue;
      }
      if (searchTokens.size < 2) continue; // see the containment note above
      const s = containment(searchTokens, p.fuzzyTokens);
      if (s >= TIER_B) scored.push({ q: p.row, score: s, tier: "B" });
      else if (s >= TIER_C) scored.push({ q: p.row, score: s, tier: "C" });
    }

    scored.sort((a, b) => b.score - a.score || a.tier.localeCompare(b.tier));

    /*
     * TIES AT THE CEILING ARE DEMOTED, NEVER AUTO-B.
     *
     * A genuine containment hit is nearly always unique. Two candidates both
     * scoring 1.0 means one of two things, and both need a person:
     *
     *   * the tokens are too common to mean anything. "Day One or One Day"
     *     reduces to ["day","one"] after stopwords, so every quote containing
     *     those two words scores 1.0 — it tied with an unrelated line about
     *     attitude, which is the tell that the number is measuring nothing.
     *   * the quote library holds the same line twice. Q0063 "Work hard in the
     *     dark to shine in the light" and Q0095 "You have to work hard in the
     *     dark..." are one Kobe quote written down twice, and the matcher
     *     cannot know which row the video belongs to.
     *
     * Catching a failure CLASS rather than a failure, the same way the voice
     * gate does — and without a stoplist to maintain, which would need a new
     * word every time a title happened to be made of common ones.
     */
    let best = scored[0] ?? null;
    let tiedAtCeiling = false;
    if (best && best.tier !== "A" && scored[1] && scored[1].score === best.score) {
      tiedAtCeiling = true;
      best = { ...best, tier: "C" };
    }

    return {
      video: v,
      best,
      tiedAtCeiling,
      runnerUp: scored[1] ? { q: scored[1].q, score: scored[1].score } : null,
    };
  });

  /* ---- The reverse hazard -------------------------------------------------
   * One quote being the best match for two videos is either two takes of the
   * same line or one take covering several quotes. Both are a row for Ryan;
   * neither is something to resolve by picking the higher score. */
  const byQuote = new Map<string, string[]>();
  results.forEach((r) => {
    if (!r.best) return;
    const l = byQuote.get(r.best.q.id) ?? [];
    l.push(r.video.title);
    byQuote.set(r.best.q.id, l);
  });
  const contested = new Set([...byQuote].filter(([, v]) => v.length > 1).map(([k]) => k));

  /* ---- CSV ---------------------------------------------------------------- */
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    [
      "video_id", "video_title", "voice", "canonical_filename",
      "best_quote_id", "best_quote_text", "score", "tier",
      "runner_up_quote_id", "runner_up_score", "flag", "decision",
    ].join(","),
  ];
  for (const r of results) {
    lines.push(
      [
        r.video.id,
        r.video.title,
        r.video.voice,
        r.video.canonical_filename,
        r.best?.q.quote_key ?? "",
        r.best ? (r.best.q.body ?? "").replace(/\s+/g, " ").slice(0, 120) : "",
        r.best ? r.best.score.toFixed(3) : "",
        r.best?.tier ?? "none",
        r.runnerUp?.q.quote_key ?? "",
        r.runnerUp ? r.runnerUp.score.toFixed(3) : "",
        [
          r.best && contested.has(r.best.q.id) ? "multi-video-quote" : null,
          r.tiedAtCeiling ? "tied-at-ceiling" : null,
        ].filter(Boolean).join(" ") || "none",
        "", // decision — Ryan fills: link | skip | note
      ].map(esc).join(",")
    );
  }
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/video-quote-matches.csv", lines.join("\n") + "\n", "utf8");

  /* ---- Summary ------------------------------------------------------------ */
  const tally = (t: string) => results.filter((r) => (r.best?.tier ?? "none") === t).length;
  console.log("  TIER          videos");
  console.log(`    A exact       ${tally("A")}`);
  console.log(`    B strong      ${tally("B")}`);
  console.log(`    C possible    ${tally("C")}`);
  console.log(`    none          ${tally("none")}`);
  const tied = results.filter((r) => r.tiedAtCeiling);
  console.log(`\n  demoted for tying at the ceiling: ${tied.length}`);
  tied.forEach((r) =>
    console.log(`    ${r.video.title.slice(0, 42).padEnd(44)} ${r.best?.q.quote_key} vs ${r.runnerUp?.q.quote_key}`)
  );
  console.log(`\n  quotes matched by more than one video: ${contested.size}`);
  for (const qid of contested) {
    const q = quotes.find((x) => x.id === qid)!;
    console.log(`    ${q.quote_key} <- ${byQuote.get(qid)!.join(" | ")}`);
  }

  const byVoice = new Map<string, { n: number; matched: number }>();
  results.forEach((r) => {
    const k = r.video.voice ?? "—";
    const e = byVoice.get(k) ?? { n: 0, matched: 0 };
    e.n++;
    if (r.best && r.best.tier !== "C") e.matched++;
    byVoice.set(k, e);
  });
  console.log("\n  by voice (A or B / total)");
  [...byVoice].sort((a, b) => b[1].n - a[1].n)
    .forEach(([v, e]) => console.log(`    ${String(e.matched).padStart(3)} / ${String(e.n).padEnd(3)}  ${v}`));

  const test = results.find((r) => r.video.title === "Never Lose Money");
  console.log("\n  TEST CASE — Never Lose Money");
  console.log(
    test?.best
      ? `    ${test.best.q.quote_key} tier ${test.best.tier} score ${test.best.score.toFixed(3)}  ${(test.best.q.body ?? "").slice(0, 70)}`
      : "    NO MATCH — the matcher is wrong"
  );

  console.log("\n  wrote reports/video-quote-matches.csv — decision column blank\n");
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
