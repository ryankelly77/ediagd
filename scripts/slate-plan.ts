/* ============================================================================
   EDIAGD — turn spoken slates into a rename plan Ryan can read

     npm run slate:plan                 # report only
     npm run slate:plan -- --apply      # rename the confident ones in Drive

   ---------------------------------------------------------------------------
   A DIFFERENT MATCHER, BECAUSE A DIFFERENT PROBLEM
   ---------------------------------------------------------------------------
   lib/video/transcript-match.ts identifies CRAFT films by hunting op-code
   vocabulary and stage language through three minutes of teaching. It is the
   right tool for that and the wrong one here: run against this batch it
   reported "no deck vocabulary matched" forty times, because these are MINDSET
   quote films and there is no op code in them to find.

   These name themselves. Every one opens with a spoken slate — "Doubt is a
   strange thing by Kobe Bryant." — and then "Aloha". identify-videos.ts
   predicted exactly this batch: "The next batch carries a spoken slate and will
   not need any of this." So the identity is read, not inferred.

   ---------------------------------------------------------------------------
   THE DANGEROUS HALF IS THE MATCH, NOT THE PARSE
   ---------------------------------------------------------------------------
   Sixty-eight Mindset films are already in the library and most of them are
   PUBLISHED. Nearly every file in this batch is a reshoot of one of them, which
   means a wrong match does not create a stray row — it REPLACES a film an
   advisor is watching with a different film, keeping the old title.

   So a match is proposed with its score and its rival, and anything short of
   convincing is left for a person. The threshold is deliberately mean: a film
   wrongly ingested as new is a duplicate somebody spots, and a film wrongly
   matched is a lie nobody spots.

   A REShoot KEEPS THE LIBRARY'S TITLE. The slate is how Mitch says it out loud;
   the library title is the one already on screens, in placements, and in
   anything Mitch has written down. Renaming a film because its author said it
   differently this time would be a second change smuggled in beside the video.
   ============================================================================ */

import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";

const TIMINGS = "reports/slate-timings.json";
const OUT = "reports/slate-plan";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DIR = args.find((a) => a.startsWith("--dir="))?.slice(6) ?? "";

/** Below this, a person looks at it. See the note above on why it is mean. */
const CONFIDENT = 0.62;
/** And it has to beat the runner-up by this much, or it is not a decision. */
const MARGIN = 0.12;

type Timing = { file: string; aloha_at: number | null; slate: string; opening?: string; error?: string };
type Row = {
  id: string; title: string; voice: string | null; version: number;
  canonical_filename: string; status: string; duration_sec: number | null;
};

const norm = (s: string) =>
  s.toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Words too common to be evidence of anything. */
const STOP = new Set(["the","a","an","is","are","was","to","of","and","or","in","on","for","by","you","your","it","its","that","this","with","not","be","do","dont","if","when","what","who","my","me","i"]);

const tokens = (s: string) => norm(s).split(" ").filter((w) => w && !STOP.has(w));

/**
 * How much two titles agree, 0..1.
 *
 * Dice over content words rather than edit distance: "Doubt is a strange thing"
 * against "Doubt Is a Strange Thing (Kobe)" should score on the words they
 * share, and the parenthetical attribution should not count against it.
 */
function score(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return (2 * shared) / (A.size + B.size);
}

/**
 * Split "Doubt is a strange thing by Kobe Bryant." into title and voice.
 *
 * Both forms occur and both are Mitch speaking naturally: "X by Y" and "X, Y".
 * The comma form is the ambiguous one — "You lose when you stay down, Mickey
 * and Rocky" — so it is only treated as an attribution when what follows looks
 * like a name or a source rather than more sentence: short, and at the end.
 */
/**
 * Sources that are not people.
 *
 * Mitch attributes plenty of these to "an internet quote" or "author unknown",
 * and those belong in the voice, not welded onto the end of the title. Without
 * this the library gains a film called "Don't Quit. Popular Motivational
 * Quote".
 */
const SOURCEY = /^(an?\s+)?(ancient\s+)?(popular\s+)?(motivational\s+)?(internet|proverb|anonymous|author\s+unknown|unknown|tiktok|modern\s+internet|internet\s+quote|motivational\s+quote)\.?$/i;

function parseSlate(slate: string): { title: string; voice: string | null } {
  let clean = slate.replace(/\s+/g, " ").trim().replace(/[.。]+$/, "");

  /* Whisper numbers a list when Mitch pauses like one. "1. Create a life…" is
     not a title that starts with a digit. */
  clean = clean.replace(/^\s*\d+\s*[.)]\s*/, "");
  /* And it spaces percent signs. */
  clean = clean.replace(/(\d)\s+%/g, "$1%");

  if (!clean) return { title: "", voice: null };

  /* "TITLE. SOURCE" — the sentence break is the attribution when what follows
     is a source rather than more title. */
  const dotted = clean.match(/^(.*?)\.\s+(.{2,40})$/);
  if (dotted) {
    const tail = dotted[2].trim().replace(/\.$/, "");
    /* Either a generic source, or something shaped like a name — Mitch ends a
       slate with "…. Germany Kent" as readily as with "… by Germany Kent", and
       both are the attribution rather than the last words of the title. */
    const looksLikeAName = /^[A-Z][A-Za-z.''-]*(\s+[A-Z][A-Za-z.''-]*){0,3}$/.test(tail);
    if (SOURCEY.test(tail) || looksLikeAName) {
      return { title: dotted[1].trim(), voice: tail };
    }
  }

  const by = clean.match(/^(.*?)\s+by\s+([^,]{2,60}(?:,\s*[^,]{2,40})?)$/i);
  if (by) return { title: by[1].trim(), voice: by[2].trim() };

  const comma = clean.match(/^(.*),\s*([^,]{2,60})$/);
  if (comma && comma[2].split(" ").length <= 5) {
    return { title: comma[1].trim(), voice: comma[2].trim() };
  }
  return { title: clean, voice: null };
}

/**
 * Title Case in the library's own style, which is not the generic one.
 *
 * "Is" and "You" are CAPITALISED there — "Doubt Is a Strange Thing", "You Are
 * Not Tired", "Where Are You Living?" — so they are not small words here.
 * Copying a generic small-word list produced "Greatness is Inside" and "If you
 * Have to Ask" next to sixty-eight films that do it the other way, which is the
 * kind of thing nobody reports and everybody notices.
 */
const SMALL = new Set(["a","an","and","as","at","but","by","for","in","nor","of","on","or","the","to","vs","with"]);
function titleCase(s: string): string {
  const words = s.trim().split(/\s+/);
  return words
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i > 0 && i < words.length - 1 && SMALL.has(lower.replace(/[^a-z]/g, ""))) return lower;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

async function library(): Promise<Row[]> {
  const url = process.env.SB_URL, key = process.env.SB_KEY;
  if (!url || !key) throw new Error("need SB_URL and SB_KEY");
  const res = await fetch(
    `${url}/rest/v1/content?select=id,title,voice,version,canonical_filename,status,duration_sec` +
      `&collection=eq.Mindset&canonical_filename=not.is.null&limit=1000`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } }
  );
  return (await res.json()) as Row[];
}

type Plan = {
  file: string;
  slate: string;
  title: string;
  voice: string | null;
  alohaAt: number | null;
  action: "reshoot" | "new" | "review";
  renameTo: string | null;
  matchTitle?: string;
  matchId?: string;
  matchStatus?: string;
  score?: number;
  runnerUp?: string;
  runnerUpScore?: number;
  note?: string;
};

async function main() {
  if (!existsSync(TIMINGS)) {
    console.error(`\n  missing ${TIMINGS} — run scripts/slate-timings.py first\n`);
    process.exit(1);
  }
  const timings = Object.values(
    (JSON.parse(readFileSync(TIMINGS, "utf8")) as { files: Record<string, Timing> }).files
  );
  const rows = await library();
  console.log(`\n  ${timings.length} files · ${rows.length} Mindset films already in the library\n`);

  /* Two files with the same slate are one film shot twice. Neither is renamed:
     which take is the keeper is Mitch's call, not a score's. */
  const bySlate = new Map<string, string[]>();
  for (const t of timings) {
    const k = norm(parseSlate(t.slate).title);
    if (!k) continue;
    bySlate.set(k, [...(bySlate.get(k) ?? []), t.file]);
  }
  const duplicated = new Set(
    [...bySlate.values()].filter((v) => v.length > 1).flat()
  );

  const plan: Plan[] = [];

  for (const t of timings) {
    const { title, voice } = parseSlate(t.slate);
    const base: Plan = {
      file: t.file, slate: t.slate, title, voice,
      alohaAt: t.aloha_at, action: "review", renameTo: null,
    };

    if (t.error) { plan.push({ ...base, note: `timing failed: ${t.error}` }); continue; }
    if (!title) { plan.push({ ...base, note: "no slate heard" }); continue; }
    if (duplicated.has(t.file)) {
      plan.push({ ...base, note: `same slate as ${bySlate.get(norm(title))!.filter((f) => f !== t.file).join(", ")}` });
      continue;
    }

    const ranked = rows
      .map((r) => ({ r, s: Math.max(score(title, r.title), score(title, r.canonical_filename)) }))
      .sort((a, b) => b.s - a.s);
    const best = ranked[0];
    const second = ranked[1];

    if (best && best.s >= CONFIDENT && best.s - (second?.s ?? 0) >= MARGIN) {
      /* A reshoot. Keep the library's name; only the version moves. */
      const next = best.r.version + 1;
      plan.push({
        ...base,
        action: "reshoot",
        renameTo: best.r.canonical_filename.replace(/—\s*v\d+(\.[a-z0-9]+)$/i, `— v${next}$1`),
        matchTitle: best.r.title, matchId: best.r.id, matchStatus: best.r.status,
        score: Number(best.s.toFixed(2)),
        runnerUp: second?.r.title, runnerUpScore: Number((second?.s ?? 0).toFixed(2)),
      });
      continue;
    }

    if (best && best.s >= 0.35) {
      plan.push({
        ...base,
        note: "close to an existing film but not convincing — rule on it",
        matchTitle: best.r.title, matchId: best.r.id, matchStatus: best.r.status,
        score: Number(best.s.toFixed(2)),
        runnerUp: second?.r.title, runnerUpScore: Number((second?.s ?? 0).toFixed(2)),
      });
      continue;
    }

    /* Nothing like it in the library: a new film. */
    const name = `MINDSET — ${titleCase(title)}${voice ? ` (${voice})` : ""} — v1.mov`;
    plan.push({ ...base, action: "new", renameTo: name, score: Number((best?.s ?? 0).toFixed(2)) });
  }

  const reshoots = plan.filter((p) => p.action === "reshoot");
  const fresh = plan.filter((p) => p.action === "new");
  const review = plan.filter((p) => p.action === "review");

  const line = (p: Plan) =>
    `  ${(p.alohaAt == null ? "  ?  " : p.alohaAt.toFixed(2) + "s").padStart(7)}  ${p.file.padEnd(16)} ${p.renameTo ?? p.note ?? ""}`;

  console.log(`  RESHOOTS — replace a film already in the library (${reshoots.length})`);
  for (const p of reshoots) {
    console.log(line(p));
    console.log(`            "${p.title}"  ->  ${p.matchTitle}  [${p.matchStatus}] ${p.score}` +
      (p.runnerUpScore && p.runnerUpScore > 0.3 ? `  (next best ${p.runnerUp} ${p.runnerUpScore})` : ""));
  }
  console.log(`\n  NEW — nothing like it in the library (${fresh.length})`);
  for (const p of fresh) console.log(line(p));
  console.log(`\n  NEEDS A RULING (${review.length})`);
  for (const p of review) {
    console.log(line(p));
    if (p.matchTitle) console.log(`            "${p.title}"  ~  ${p.matchTitle} ${p.score}`);
  }

  writeFileSync(`${OUT}.json`, `${JSON.stringify({ plan }, null, 1)}\n`);
  const csv = [
    "file,action,alohaAt,slateTitle,voice,renameTo,matchTitle,matchStatus,score,runnerUp,runnerUpScore,note",
    ...plan.map((p) =>
      [p.file, p.action, p.alohaAt ?? "", p.title, p.voice ?? "", p.renameTo ?? "",
       p.matchTitle ?? "", p.matchStatus ?? "", p.score ?? "", p.runnerUp ?? "",
       p.runnerUpScore ?? "", p.note ?? ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");
  writeFileSync(`${OUT}.csv`, `${csv}\n`);
  console.log(`\n  plan -> ${OUT}.json + .csv`);

  if (!APPLY) {
    console.log(`\n  Nothing renamed. --apply --dir="<Drop Zone>" to rename the ${reshoots.length + fresh.length} confident ones.\n`);
    return;
  }
  if (!DIR) { console.error("\n  --apply needs --dir=\n"); process.exit(1); }

  let renamed = 0;
  for (const p of [...reshoots, ...fresh]) {
    if (!p.renameTo) continue;
    const from = join(DIR, p.file);
    const to = join(DIR, p.renameTo);
    if (existsSync(to)) { console.log(`  exists, skipping: ${p.renameTo}`); continue; }
    renameSync(from, to);
    renamed++;
  }
  console.log(`\n  renamed ${renamed}. ${review.length} left alone for a ruling.\n`);
}

if (require.main === module) void main();
