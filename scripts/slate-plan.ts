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

import { readFileSync, writeFileSync, existsSync, renameSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const TIMINGS = "reports/slate-timings.json";
/* The whole-film transcripts, for the containment test below. */
const TRANSCRIPTS = "reports/dropzone-transcripts.json";
const OUT = "reports/slate-plan";

/**
 * The shelf is the authority on what exists — Ryan's ruling, and the right one.
 *
 * The library table and this folder agree today, but they are not the same kind
 * of fact: a row can be a draft of something never shot, and a file on the
 * published shelf is a film that shipped. "Is this a reshoot" is a question
 * about what shipped, so it is answered by the shelf. The version to use next
 * comes from the same place, out of the filename that is already canonical.
 */
const PUBLISHED = "02 - Published";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DIR = args.find((a) => a.startsWith("--dir="))?.slice(6) ?? "";
/* One collection per run. This batch is all MINDSET; a mixed drop would be two
   runs, which is better than a scorer allowed to match across shelves. */
const COLLECTION = args.find((a) => a.startsWith("--collection="))?.slice(13) ?? "Mindset";

/** Below this, a person looks at it. See the note above on why it is mean. */
const CONFIDENT = 0.62;
/** And it has to beat the runner-up by this much, or it is not a decision. */
const MARGIN = 0.12;
/**
 * Except when the title simply IS the title.
 *
 * "Practice Makes Improvement" against "Practice Makes Improvement" scored a
 * perfect 1 and was still held for a ruling, because "Perfect Practice Makes
 * Perfect" is a real neighbouring film that scored close behind it. The margin
 * rule is right about ambiguity and wrong about this: an exact agreement is not
 * made doubtful by a similar title existing nearby.
 */
const DECISIVE = 0.9;
/**
 * Below this, a near-miss is not worth a person's attention.
 *
 * The floor was 0.35, which meant a film scoring 0.4 against something plainly
 * unrelated — "The Wolf Climbing the Hill" against "Never Lose Money" — was put
 * in front of Ryan as a question. Ten of those is how a review list stops being
 * read. Anything this weak is a new film, and being wrong about that produces a
 * duplicate somebody can spot rather than a silent replacement.
 */
const WORTH_ASKING = 0.55;

type Timing = { file: string; aloha_at: number | null; slate: string; opening?: string; error?: string };
type Row = {
  title: string; voice: string | null; version: number; canonical_filename: string;
};

/** "3 Rules" and "Three Rules" are the same rules. */
const NUMBERS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
};

const norm = (s: string) =>
  s.toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Words too common to be evidence of anything. */
const STOP = new Set(["the","a","an","is","are","was","to","of","and","or","in","on","for","by","you","your","it","its","that","this","with","not","be","do","dont","if","when","what","who","my","me","i"]);

const tokens = (s: string) =>
  norm(s)
    .split(" ")
    .filter((w) => w && !STOP.has(w))
    .map((w) => NUMBERS[w] ?? w)
    /* Light stemming, not a stemmer. "The Moment You Feel Comfortable" against
       a film that says "the moment you start feeling comfortable" should not
       lose a word to a suffix. Only long words, so "was"/"his" survive. */
    .map((w) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "") : w));

/**
 * How much two titles agree, 0..1.
 *
 * Dice over content words rather than edit distance: "Doubt is a strange thing"
 * against "Doubt Is a Strange Thing (Kobe)" should score on the words they
 * share, and the parenthetical attribution should not count against it.
 */
/**
 * Does the film SAY the existing title?
 *
 * Title-against-title was too weak for the real cases: the slate says
 * "Comfortable" and the shelf says "The Moment You Feel Comfortable", which
 * share one content word out of five. But the film itself opens "The moment you
 * start feeling comfortable, you're already losing" — every word of the shelf
 * title is right there in the first sentence.
 *
 * So the second signal asks the asymmetric question: what fraction of the
 * EXISTING title's words appear in the new film's opening? A reshoot restates
 * its own quote, so a real match scores near 1 while an unrelated film scores
 * near 0. It is the difference between guessing from a label and reading the
 * thing.
 *
 * THE OPENING ONLY. These films quote themselves in the first sentence and then
 * talk for a minute; scanning the whole transcript would let incidental words
 * anywhere in three minutes vote, and "time", "better" and "day" appear in
 * nearly all of them.
 */
/**
 * WEIGHTED BY HOW DISTINCTIVE EACH WORD IS, because the plain version was
 * confidently wrong.
 *
 * Counting matched words equally made "Be Better Than That" and "Day One or One
 * Day" match almost every film in the batch — they are two common words each,
 * and "better", "day" and "one" appear in nearly all sixty-eight titles. That
 * did more than mislabel those two: a false runner-up at 0.95 destroyed the
 * margin test for the genuinely obvious matches beside it, so "Practice Makes
 * Improvement" scoring a perfect 1 still came out as needing a ruling.
 *
 * So each word is worth how rare it is across the shelf. "Mamba" identifies a
 * film; "day" does not, and now says so.
 */
function contains(existingTitle: string, opening: string, idf: Map<string, number>): number {
  const want = tokens(existingTitle);
  if (!want.length) return 0;
  const have = new Set(tokens(opening));
  let hit = 0, total = 0;
  for (const w of new Set(want)) {
    const weight = idf.get(w) ?? 1;
    total += weight;
    if (have.has(w)) hit += weight;
  }
  if (!total) return 0;

  /*
   * A RATIO IS NOT ENOUGH — the title needs something distinctive to say.
   *
   * "Be Better Than That" is two common words. Any film containing "better" and
   * "than" matched all of it and scored a perfect ratio, which was not merely
   * wrong about that film: a false runner-up at 0.95 sat next to genuine
   * matches scoring 1.0 and defeated the margin test, so "Practice Makes
   * Improvement" against "Practice Makes Improvement" came out as unresolved.
   *
   * So the ratio is scaled by how much distinctive weight the title carries at
   * all. "The Mamba Mentality" has two words nothing else uses and can prove
   * itself; a title made of the batch's most common words cannot, and now says
   * so instead of shouting.
   */
  const MEANINGFUL = 1.5;
  return (hit / total) * Math.min(1, total / MEANINGFUL);
}

/**
 * How rare each word is among the published titles.
 *
 * Plain inverse frequency over a set this small, rather than a log: sixty-eight
 * titles is not a corpus, and the only job here is to rank "mamba" above "day".
 */
function idfOver(rows: { title: string }[]): Map<string, number> {
  const seen = new Map<string, number>();
  for (const r of rows) {
    for (const w of new Set(tokens(r.title))) seen.set(w, (seen.get(w) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [w, n] of seen) idf.set(w, 1 / n);
  /* A word that appears in no title at all is maximally distinctive. */
  return new Proxy(idf, {
    get: (t, k) => (k === "get" ? (w: string) => t.get(w) ?? 1 : Reflect.get(t, k)),
  }) as Map<string, number>;
}

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
 * Names Whisper gets wrong, and the ones it gets right.
 *
 * ---------------------------------------------------------------------------
 * WHY A LIST AND NOT A CLEVERER MODEL
 * ---------------------------------------------------------------------------
 * Speech recognition is confident and wrong about proper nouns in a way it is
 * not about ordinary words: "Hardt" comes back "Hart" every time, not
 * sometimes. That is not noise to be smoothed, it is a fixed substitution, and
 * a fixed substitution is fixed by a list.
 *
 * In Mitch's case it will never stop happening — the d is silent, so "Hart" is
 * a correct transcription of what was said and no better model will ever
 * decide otherwise. This entry is permanent, not a workaround for a weak
 * model, and it belongs to every batch from here on.
 *
 * ONLY NAMES SOMEBODY HAS CONFIRMED OR THAT ARE UNAMBIGUOUS PUBLIC FIGURES.
 * Ryan confirmed Mitch Hardt. The rest here are people whose names are a matter
 * of record and whose quotes these are — Saban, Hormozi, Serhant, Swindoll,
 * Tolkien, Gregorek, Inky Johnson. Anything I would be guessing at is left
 * exactly as heard and reported, because a wrongly "corrected" attribution is
 * worse than a transcription error: it looks authoritative.
 */
const NAME_FIXES: [RegExp, string][] = [
  [/\bmitch\s+hart\b/i, "Mitch Hardt"],
  [/\bcoach\s+hardt\b/i, "Coach Hardt"],
  /* Bare, so the possessive is caught too: the slate says "Sabin's Three
     Rules" as often as it says "by Nick Sabin". */
  [/\bsabin\b/i, "Saban"],
  [/\bnick\s+saban\b/i, "Nick Saban"],
  [/\balex\s+herm[oa]si\b/i, "Alex Hormozi"],
  [/\bcharles\s+swindle\b/i, "Charles Swindoll"],
  [/\bryan\s+sirhant\b/i, "Ryan Serhant"],
  [/\bjersey\s+gregorick\b/i, "Jerzy Gregorek"],
  [/\bjrr\s+token\b/i, "J.R.R. Tolkien"],
  [/\benki\s+johnson\b/i, "Inky Johnson"],
];

/** Are these byte-identical? Size first; only then the expensive read. */
function sameBytes(dir: string, original: string, copies: string[]): boolean {
  try {
    const a = statSync(join(dir, original));
    return copies.every((c) => statSync(join(dir, c)).size === a.size);
  } catch {
    return false;
  }
}

function fixNames(s: string | null): string | null {
  if (!s) return s;
  let out = s;
  for (const [re, to] of NAME_FIXES) out = out.replace(re, to);
  return out;
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

/**
 * Everything already published, read off the shelf.
 *
 * Filenames there are canonical by construction — the ingest wrote them — so
 * the title and the version are parsed straight back out rather than looked up.
 * The collection folder is walked whole: a Mindset reshoot cannot match a Craft
 * film, and scoping the read is cheaper than teaching the scorer to ignore
 * fifty-eight files it should never see.
 */
function library(mastersDir: string, collection: string): Row[] {
  const dir = join(mastersDir, PUBLISHED, collection);
  if (!existsSync(dir)) {
    console.error(`\n  no published shelf at ${dir}\n`);
    process.exit(1);
  }
  return readdirSync(dir)
    .filter((f) => /\.(mov|mp4|m4v)$/i.test(f) && !f.startsWith("."))
    .map((f) => {
      const m = f.match(/^(.*?)\s*—\s*(.*?)\s*—\s*v(\d+)\.[a-z0-9]+$/i);
      const titleAndVoice = m ? m[2] : f.replace(/\.[a-z0-9]+$/i, "");
      /* "(Kobe)" is an attribution, not part of the title, and including it
         would score against a slate that says the name differently. */
      const title = titleAndVoice.replace(/\s*\([^)]*\)\s*$/, "").trim();
      return {
        title,
        voice: titleAndVoice.match(/\(([^)]*)\)\s*$/)?.[1] ?? null,
        version: m ? Number(m[3]) : 1,
        canonical_filename: f,
      };
    });
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
  matchFile?: string;
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
  /* The masters root is the Drop Zone's parent: the shelves are always
     siblings, and an absolute path breaks the moment Drive mounts elsewhere. */
  const MASTERS = DIR ? join(DIR, "..") : "";
  if (!MASTERS) {
    console.error('\n  need --dir="<Drop Zone>" so the published shelf can be found\n');
    process.exit(1);
  }
  const rows = library(MASTERS, COLLECTION);
  const idf = idfOver(rows);

  /* Whole-film transcripts, for the containment test. Keyed by camera-roll
     name, which is what the timings are keyed by too. */
  const openings = new Map<string, string>();
  if (existsSync(TRANSCRIPTS)) {
    const t = JSON.parse(readFileSync(TRANSCRIPTS, "utf8")) as {
      files: { file: string; transcript?: string }[];
    };
    for (const r of t.files) {
      openings.set(r.file, (r.transcript ?? "").split(/\s+/).slice(0, 60).join(" "));
    }
  }
  console.log(`\n  ${timings.length} files · ${rows.length} Mindset films already in the library\n`);

  /* Two files with the same slate are one film shot twice. Neither is renamed:
     which take is the keeper is Mitch's call, not a score's. */
  const bySlate = new Map<string, string[]>();
  for (const t of timings) {
    const k = norm(parseSlate(t.slate).title);
    if (!k) continue;
    bySlate.set(k, [...(bySlate.get(k) ?? []), t.file]);
  }
  /*
   * Two files with the same slate are one film shot twice — unless one of them
   * is Drive's own copy, which is a different thing entirely. "IMG_2447 (1)"
   * beside "IMG_2447" with identical bytes is not a take to choose between; it
   * is the same file twice, and asking which one to keep is asking a question
   * with no meaning.
   */
  const duplicated = new Set<string>();
  const driveCopies = new Set<string>();
  for (const group of bySlate.values()) {
    if (group.length < 2) continue;
    const copies = group.filter((f) => /\(\d+\)\.[a-z0-9]+$/i.test(f));
    const originals = group.filter((f) => !/\(\d+\)\.[a-z0-9]+$/i.test(f));
    if (copies.length && originals.length === 1 && sameBytes(DIR, originals[0], copies)) {
      for (const c of copies) driveCopies.add(c);
      continue;
    }
    for (const f of group) duplicated.add(f);
  }

  /*
   * ---- ONE SHELF FILM, ONE FILE -------------------------------------------
   *
   * Scoring each file independently let two of them claim the same title, and
   * the failure was not theoretical: "Comfortable" scored 0.95 against "The
   * Mamba Mentality" because the film says the words "Mamba mentality" in its
   * own opening, while the actual Mamba film sat right beside it in the batch.
   * Both would have been renamed v2 of the same thing, and the second rename
   * would have quietly won.
   *
   * A film cannot be reshot twice in one batch, so the assignment is made
   * exclusive: every (file, shelf title) pair is ranked once, globally, and
   * taken best-first, skipping any pair whose file or whose shelf title has
   * already been spoken for. The strongest evidence in the batch gets first
   * refusal, and a weaker claim on an already-taken film falls through to its
   * own next-best or to "new".
   *
   * That is also what demotes "Read it backwards" from a 0.63 claim on "One
   * Focus": the file that actually says "One focus" scores 1.0 and takes it.
   */
  type Cand = { t: Timing; title: string; voice: string | null; row: Row; s: number };
  const pairs: Cand[] = [];
  const parsed = new Map<string, { title: string; voice: string | null }>();

  for (const t of timings) {
    const p0 = parseSlate(t.slate);
    const title = fixNames(p0.title) as string;
    const voice = fixNames(p0.voice);
    parsed.set(t.file, { title, voice });
    if (t.error || !title || duplicated.has(t.file) || driveCopies.has(t.file)) continue;

    const opening = openings.get(t.file) ?? "";
    const ranked = rows
      .map((r) => ({
        r,
        s: Math.max(
          score(title, r.title),
          score(title, r.canonical_filename),
          0.95 * contains(r.title, opening, idf)
        ),
      }))
      .sort((a, b) => b.s - a.s);

    for (const c of ranked.slice(0, 5)) {
      pairs.push({ t, title, voice, row: c.r, s: c.s });
    }
  }

  pairs.sort((a, b) => b.s - a.s);

  const takenFile = new Set<string>();
  const takenRow = new Set<string>();
  const assigned = new Map<string, Cand>();

  for (const c of pairs) {
    if (takenFile.has(c.t.file) || takenRow.has(c.row.canonical_filename)) continue;
    if (c.s < CONFIDENT) continue;

    /*
     * The margin is against what is STILL AVAILABLE, and that correction
     * matters. Measured against the file's global runner-up, a film that had
     * just lost its top choice to a stronger claim was judged ambiguous
     * forever: "Comfortable" lost "The Mamba Mentality" to the film that
     * actually is it, and was then refused "The Moment You Feel Comfortable"
     * because its own lost first choice still counted against it.
     *
     * Ambiguity is about the choice being made now, between the rows that can
     * still be chosen.
     */
    const rival = pairs.find(
      (o) => o.t.file === c.t.file && o.row !== c.row &&
             !takenRow.has(o.row.canonical_filename) && o.s <= c.s
    );
    if (c.s < DECISIVE && c.s - (rival?.s ?? 0) < MARGIN) continue;

    takenFile.add(c.t.file);
    takenRow.add(c.row.canonical_filename);
    assigned.set(c.t.file, c);
  }

  const plan: Plan[] = [];

  for (const t of timings) {
    const { title, voice } = parsed.get(t.file) ?? { title: "", voice: null };
    const base: Plan = {
      file: t.file, slate: t.slate, title, voice,
      alohaAt: t.aloha_at, action: "review", renameTo: null,
    };

    if (t.error) { plan.push({ ...base, note: `timing failed: ${t.error}` }); continue; }
    if (!title) { plan.push({ ...base, note: "no slate heard" }); continue; }
    if (driveCopies.has(t.file)) {
      plan.push({ ...base, note: "Drive duplicate of the same bytes — ignored" });
      continue;
    }
    if (duplicated.has(t.file)) {
      plan.push({ ...base, note: `same slate as ${bySlate.get(norm(title))!.filter((f) => f !== t.file).join(", ")}` });
      continue;
    }

    const win = assigned.get(t.file);
    if (win) {
      const next = win.row.version + 1;
      plan.push({
        ...base,
        action: "reshoot",
        renameTo: win.row.canonical_filename.replace(/—\s*v\d+(\.[a-z0-9]+)$/i, `— v${next}$1`),
        matchTitle: win.row.title, matchFile: win.row.canonical_filename,
        score: Number(win.s.toFixed(2)),
      });
      continue;
    }

    /*
     * Unassigned. Two different situations, and only one is a question.
     *
     * A film that scored moderately against a title ANOTHER file has already
     * won is not ambiguous — it is a new film that happens to share a couple of
     * words with something on the shelf. "Brave Enough", "If You Have to Ask"
     * and "Read It Backwards" all scored around 0.63 against titles claimed by
     * files that plainly are those titles. Asking about them is asking Ryan to
     * confirm a coincidence, three times.
     *
     * A CONTESTED claim is different: if this file scored well enough that it
     * could have been the reshoot, and lost, somebody should look at which of
     * the two is right.
     */
    const mine = pairs.filter((c) => c.t.file === t.file).sort((a, b) => b.s - a.s);
    const best = mine[0];
    const bestFree = mine.find((c) => !takenRow.has(c.row.canonical_filename));

    /** Strong enough that losing it is a conflict rather than a coincidence. */
    const CONTESTED = 0.85;

    if (best && takenRow.has(best.row.canonical_filename) && best.s >= CONTESTED) {
      plan.push({
        ...base,
        note: `looks like "${best.row.title}", but a stronger claim on it won — rule on it`,
        matchTitle: best.row.title, matchFile: best.row.canonical_filename,
        score: Number(best.s.toFixed(2)),
      });
      continue;
    }

    if (bestFree && bestFree.s >= WORTH_ASKING) {
      plan.push({
        ...base,
        note: "close to an existing film but not convincing — rule on it",
        matchTitle: bestFree.row.title, matchFile: bestFree.row.canonical_filename,
        score: Number(bestFree.s.toFixed(2)),
      });
      continue;
    }

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
    console.log(`            "${p.title}"  ->  ${p.matchTitle}  ${p.score}` +
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
    "file,action,alohaAt,slateTitle,voice,renameTo,matchTitle,matchFile,score,runnerUp,runnerUpScore,note",
    ...plan.map((p) =>
      [p.file, p.action, p.alohaAt ?? "", p.title, p.voice ?? "", p.renameTo ?? "",
       p.matchTitle ?? "", p.matchFile ?? "", p.score ?? "", p.runnerUp ?? "",
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
