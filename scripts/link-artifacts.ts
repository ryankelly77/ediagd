/* ============================================================================
   EDIAGD — link the approved video/quote pairs

   Reads the decision column of reports/video-quote-matches.csv and applies only
   rows marked `link`. Dry run by default.

   ---------------------------------------------------------------------------
   THE QUOTE IS THE ANCHOR
   ---------------------------------------------------------------------------
   0064 models this as a self-reference: a row may point at the row that is the
   PRIMARY format of its idea, and a row with no pointer is its own artifact. So
   the pointer goes on the VIDEO and names the QUOTE, because the words existed
   first — Mitch wrote them, then filmed them — and because the quote is the
   format that survives if the video is ever re-shot.

   Only one row is written per pair. Setting both would need a second column and
   a rule about which one wins when they disagree.

   ---------------------------------------------------------------------------
   IT REFUSES RATHER THAN SKIPS
   ---------------------------------------------------------------------------
   A voice mismatch or a retired row means the CSV and the database have drifted
   since the report was generated. Quietly skipping those would leave somebody
   believing a pair was linked. They are printed as REFUSED with the reason and
   counted separately.

     npm run link:artifacts -- --from=reports/video-quote-matches.csv
     npm run link:artifacts -- --from=reports/video-quote-matches.csv --apply
     npm run link:artifacts -- --verify --from=reports/video-quote-matches.csv
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});

const args = process.argv.slice(2);
const FROM = args.find((a) => a.startsWith("--from="))?.split("=").slice(1).join("=");
const APPLY = args.includes("--apply");
const VERIFY = args.includes("--verify");

/*
 * CHECKED INSIDE main(), not at module level.
 *
 * A module-level `process.exit` narrowed FROM to `string` for the old IIFE,
 * because an IIFE is an expression evaluated in place. A function DECLARATION
 * is hoisted, so TypeScript can no longer assume the check ran before the body
 * — and it is right to refuse: nothing stops main() being called first.
 */
function requireFrom(): string {
  if (!FROM) {
    console.error("  --from=<csv> is required.\n");
    process.exit(1);
  }
  return FROM;
}

/** Minimal RFC-4180 reader — quote bodies in the CSV contain commas. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(cell); cell = ""; continue; }
    if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((v) => v.trim()));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

type Pair = {
  videoId: string;
  videoTitle: string;
  quoteKey: string;
  tier: string;
};

async function main() {
  const csv = parseCsv(readFileSync(requireFrom(), "utf8"));
  const decisions = csv.filter((r) => (r.decision ?? "").toLowerCase() === "link");

  const wanted: Pair[] = decisions.map((r) => ({
    videoId: r.video_id,
    videoTitle: r.video_title,
    quoteKey: r.best_quote_id,
    tier: r.tier,
  }));

  console.log(`  ${csv.length} rows in ${requireFrom().split("/").pop()}`);
  console.log(`  decision = link: ${wanted.length}\n`);

  /* ---- Resolve both sides fresh from the database -------------------------
   * The CSV holds quote_key (Q0469), not the uuid, so the quote is looked up
   * now rather than trusted from a file that may be hours old. */
  const keys = wanted.map((w) => w.quoteKey).filter(Boolean);
  const { data: quoteRows, error: qErr } = await sb
    .from("content")
    .select("id, quote_key, title, body, voice, retired_at, format")
    .in("quote_key", keys.length ? keys : ["__none__"]);
  if (qErr) throw new Error(`quotes: ${qErr.message}`);
  const byKey = new Map((quoteRows ?? []).map((q) => [q.quote_key as string, q]));

  const { data: videoRows, error: vErr } = await sb
    .from("content")
    .select("id, title, voice, retired_at, format, artifact_id")
    .in("id", wanted.length ? wanted.map((w) => w.videoId) : ["00000000-0000-0000-0000-000000000000"]);
  if (vErr) throw new Error(`videos: ${vErr.message}`);
  const byId = new Map((videoRows ?? []).map((v) => [v.id as string, v]));

  if (VERIFY) {
    const { data: linked } = await sb
      .from("content")
      .select("id, title, voice, artifact_id, retired_at")
      .not("artifact_id", "is", null);
    const rows = linked ?? [];
    console.log(`  VERIFY\n`);
    console.log(`  linked pairs in the database : ${rows.length}`);
    console.log(`  link decisions in the CSV    : ${wanted.length}`);

    let mismatch = 0;
    let retired = 0;
    for (const r of rows) {
      const { data: twin } = await sb
        .from("content")
        .select("voice, retired_at")
        .eq("id", r.artifact_id)
        .maybeSingle();
      if (!twin) continue;
      if ((twin.voice ?? "") !== (r.voice ?? "")) { mismatch++; console.log(`    VOICE MISMATCH  ${r.title}`); }
      if (r.retired_at || twin.retired_at) { retired++; console.log(`    RETIRED LINKED  ${r.title}`); }
    }
    console.log(`  voice mismatches             : ${mismatch}`);
    console.log(`  retired rows linked          : ${retired}`);
    const ok = rows.length === wanted.length && mismatch === 0 && retired === 0;
    console.log(`\n  ${ok ? "PASS" : "FAIL"}\n`);
    return;
  }

  /* ---- Check every pair before writing any of them ------------------------ */
  const ready: { v: Record<string, unknown>; q: Record<string, unknown>; p: Pair }[] = [];
  const refused: { p: Pair; why: string }[] = [];
  let already = 0;

  for (const p of wanted) {
    const v = byId.get(p.videoId);
    const q = byKey.get(p.quoteKey);
    if (!v) { refused.push({ p, why: "video row not found" }); continue; }
    if (!q) { refused.push({ p, why: `quote ${p.quoteKey} not found` }); continue; }
    if (v.retired_at) { refused.push({ p, why: "video is retired" }); continue; }
    if (q.retired_at) { refused.push({ p, why: `quote ${p.quoteKey} is retired` }); continue; }
    if ((v.voice ?? "") !== (q.voice ?? "")) {
      refused.push({ p, why: `voice differs — video "${v.voice}" vs quote "${q.voice}"` });
      continue;
    }
    // Idempotent: already pointing at this quote is success, not work.
    if (v.artifact_id === q.id) { already++; continue; }
    if (v.artifact_id && v.artifact_id !== q.id) {
      refused.push({ p, why: "video already linked to a different artifact" });
      continue;
    }
    ready.push({ v, q, p });
  }

  for (const r of ready) {
    console.log(`  ${r.p.tier}  ${String(r.p.videoTitle).slice(0, 44).padEnd(46)} -> ${r.p.quoteKey}  ${String(r.q.title).slice(0, 30)}`);
  }
  if (already) console.log(`\n  already linked (no change): ${already}`);
  if (refused.length) {
    console.log(`\n  REFUSED — reported, not skipped: ${refused.length}`);
    refused.forEach((r) => console.log(`    ${r.p.videoTitle}  —  ${r.why}`));
  }

  if (!APPLY) {
    console.log(`\n  --dry: nothing written. ${ready.length} pair(s) would be linked.\n`);
    return;
  }

  let done = 0;
  for (const r of ready) {
    const { error } = await sb
      .from("content")
      .update({ artifact_id: r.q.id })
      .eq("id", r.p.videoId);
    if (error) { console.log(`    FAILED ${r.p.videoTitle}: ${error.message}`); continue; }
    done++;
  }
  console.log(`\n  linked: ${done}   already: ${already}   refused: ${refused.length}\n`);
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
