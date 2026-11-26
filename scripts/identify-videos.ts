/* ============================================================================
   EDIAGD — naming the Drop Zone by what is said in it

     npm run identify:videos                    # report, write nothing
     npm run identify:videos -- --apply         # rename the keepers in Drive

   Forty-eight camera-roll files: same presenter, same setting, same framing,
   sequential numbers, nothing on screen that says which is which. Mitch knows
   what he filmed; this works it out without asking him.

   ---------------------------------------------------------------------------
   TWO HALVES, DELIBERATELY SPLIT
   ---------------------------------------------------------------------------
   scripts/transcribe-dropzone.py turns audio into text, because faster-whisper
   is a Python library. This turns text into a proposed name, using
   lib/video/transcript-match.ts — the SAME matcher the self-naming ingest will
   run against Mux's transcripts. Two implementations of that would eventually
   disagree, and a film named one way at ingest and another way here would leave
   nobody able to say which was right.

   ---------------------------------------------------------------------------
   IT PROPOSES. RYAN DECIDES. ONLY THEN DOES IT RENAME.
   ---------------------------------------------------------------------------
   The default run writes nothing at all. --apply renames files in Google Drive
   through the local Drive for Desktop mount, and only files this run proposed a
   confident name for: a duplicate take is reported as a pair with a suggested
   keeper and NEITHER file is touched, because "these two are the same film" is
   a thing a person confirms and "this one is the trash" is a thing only Mitch
   knows.
   ============================================================================ */

import { readFileSync, renameSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import {
  findTakes,
  matchTranscript,
  proposedKeeper,
  proposedName,
  type DeckProfile,
  type FilmScript,
  type Proposal,
} from "../lib/video/transcript-match";
import { matchSlate, type SlateRow, type SlateMatch } from "../lib/video/manager-slate";

/**
 * What is already in the library, so a reshoot is named as a reshoot.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SCRIPT NOW READS THE DATABASE
 * ---------------------------------------------------------------------------
 * It used to propose v1 for everything, which was right when the library was
 * empty and silently wrong the moment it was not. The ingest treats a version
 * that is not HIGHER than the live take as "already have this" and skips the
 * file — so a batch of reshoots named v1 does not fail, it does nothing, and
 * reports that it did nothing in a line that reads like success.
 *
 * Ryan's batch is largely reshoots. So the version is no longer a constant: it
 * is one more than whatever is on the shelf for that same idea, and a film
 * nobody has seen before still gets v1 because there is nothing to be higher
 * than.
 *
 * IDENTITY IGNORES THE VERSION AND KEEPS THE COLLECTION — the same rule
 * ingest-videos.ts uses, because these two have to agree about what "the same
 * film, re-shot" means or the version they choose is meaningless.
 */
async function liveVersions(): Promise<Map<string, number>> {
  const url = process.env.SB_URL, key = process.env.SB_KEY;
  const map = new Map<string, number>();
  if (!url || !key) {
    console.log("  no SB_URL / SB_KEY — every proposal will be v1\n");
    return map;
  }
  const res = await fetch(
    `${url}/rest/v1/content?select=canonical_filename,version&canonical_filename=not.is.null`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } }
  );
  const rows = (await res.json()) as { canonical_filename: string; version: number | null }[];
  if (!Array.isArray(rows)) return map;
  for (const r of rows) {
    const identity = r.canonical_filename
      .replace(/\s*—\s*v\d+\.[a-z0-9]+$/i, "")
      .trim()
      .toLowerCase();
    const v = Number(r.version ?? 1);
    if (!map.has(identity) || v > (map.get(identity) as number)) map.set(identity, v);
  }
  return map;
}

/**
 * The Manager Meetings library, for slate identification.
 *
 * ---------------------------------------------------------------------------
 * THIS TRACK IS IDENTIFIED BY LOOKUP, NOT BY THE MATCHER
 * ---------------------------------------------------------------------------
 * Every Manager Meetings film opens with its Classification line before the
 * Aloha — "Manager Meetings/<Topic>/<length>/<Title>" — which IS the meeting's
 * identity and is what `content.classification_line` holds (0183). So the film
 * says what it is and there is nothing to infer.
 *
 * NO OTHER TRACK IS AFFECTED. Advisor and craft films have no slate, `matchSlate`
 * returns no match for them, and they go through `matchTranscript` exactly as
 * before. The 17 Bank Account films use a different slate shape and are not in
 * this library, so they are not claimed either — both asserted in
 * npm run test:manager-slate.
 *
 * Without SB_URL / SB_KEY the library is empty and every slate film HOLDS rather
 * than being matched by content — which is the right failure. A manager meeting
 * guessed at by the keyword matcher would be named after whatever service it
 * happens to discuss, and the matcher has no way to know it should not try.
 */
async function managerLibrary(): Promise<SlateRow[]> {
  const url = process.env.SB_URL, key = process.env.SB_KEY;
  if (!url || !key) return [];
  const res = await fetch(
    `${url}/rest/v1/content?select=id,title,classification_line` +
      `&classification_line=not.is.null`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } }
  );
  const rows = (await res.json()) as SlateRow[];
  return Array.isArray(rows) ? rows : [];
}

const TRANSCRIPTS = "reports/dropzone-transcripts.json";
const VOCABULARY = "data/deck-vocabulary.json";
const SCRIPTS = "data/teleprompter-films.json";
const APPLY = process.argv.includes("--apply");
const DIR = (process.argv.find((a) => a.startsWith("--dir=")) ?? "").slice(6);

/**
 * Names Ryan ruled that the matcher does not derive.
 *
 * ---------------------------------------------------------------------------
 * A RULING IS NOT A BUG FIX
 * ---------------------------------------------------------------------------
 * IMG_2249 is The Big Ticket Visit, Part 2. It names itself in sentence one —
 * "when we have that big ticket item" — and then spends three minutes on the
 * pre-write packet, which is enough to pull the Pre-Write module back on top.
 * Chasing it further meant tuning the matcher against one file, and each
 * previous round of that moved a different film.
 *
 * So it is recorded as what it is: a human decision, in the report, marked as
 * such. The next batch carries a spoken slate and will not need any of this.
 */
const RULINGS: Record<string, { title: string; code: string; note: string }> = {
  "IMG_2249.MOV": {
    code: "FND",
    title: "The Big Ticket Visit, Part 2",
    note: "Ryan's ruling — matcher reads the pre-write content and proposes Pre-Write, Part 2",
  },
};

type Row = { file: string; seconds?: number; transcript: string; words?: number; error?: string };

function load(): { rows: Row[]; profiles: DeckProfile[]; scripts: FilmScript[] } {
  if (!existsSync(TRANSCRIPTS)) {
    console.error(
      `\n  ${TRANSCRIPTS} not found.\n` +
        `  Run the transcriber first:\n` +
        `    python3 scripts/transcribe-dropzone.py --dir="<Drop Zone>" --out=${TRANSCRIPTS}\n`
    );
    process.exit(1);
  }
  const rows = JSON.parse(readFileSync(TRANSCRIPTS, "utf8")).files as Row[];
  /*
   * THE OP CODES COME FROM THE DECK MAP, not from this file.
   *
   * They were hand-typed here first and a third of them were wrong — CLE-010
   * for Coolant Exchange when Mitch's map says CLF-010, DFF-005 for
   * Differential when it says DFF-014, SPK-037 for Spark Plugs when it says
   * SPK-043. Those were the names films would have been renamed to, and the
   * rename is the one step nobody reviews line by line.
   */
  const vocab = JSON.parse(readFileSync(VOCABULARY, "utf8")) as { decks: DeckProfile[] };
  /* Ground truth for the twenty films Volume 2 carries. Optional: without it
     everything still works from declarations alone. */
  const scripts = existsSync(SCRIPTS)
    ? (JSON.parse(readFileSync(SCRIPTS, "utf8")).films as FilmScript[])
    : [];
  return { rows, profiles: vocab.decks, scripts };
}

/** The transcript's opening, as the evidence a person actually reads. */
function opening(text: string, chars = 150): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= chars ? clean : `${clean.slice(0, chars)}…`;
}

async function main() {
  const LIVE = await liveVersions();
  const LIBRARY = await managerLibrary();
  if (LIBRARY.length) {
    console.log(`  ${LIBRARY.length} Manager Meetings rows available for slate lookup`);
  }
  const { rows, profiles, scripts } = load();
  const usable = rows.filter((r) => r.transcript && r.transcript.length > 0);

  console.log(`\n  ${rows.length} files · ${usable.length} transcribed\n`);

  /* The slate is read FIRST, and only where it is absent does the matcher run.
     A film that declares itself must not then be argued with. */
  const matched = usable.map((r) => {
    const slate: SlateMatch = matchSlate(r.transcript, LIBRARY);
    return {
      ...r,
      id: r.file,
      slate,
      /* Still computed for a slate film, because the report shows what the
         matcher WOULD have said — useful evidence when a slate holds — but it
         is never used to name one. */
      proposal: matchTranscript(r.transcript, profiles, scripts),
    };
  });

  const slateFilms = matched.filter((m) => m.slate.ok || m.slate.line !== null);
  if (slateFilms.length) {
    console.log(`  ${slateFilms.length} file(s) carry a Manager Meetings slate\n`);
  }

  /** The one place a file's proposed name is decided — slate, ruling or matcher. */
  const nameFor = (m: (typeof matched)[number]): string | null => {
    /* A SLATE OUTRANKS BOTH. The film declared itself, so the name is the
       library's title for the row it named. A slate that did NOT resolve
       returns null here, which makes it a hold — never the matcher's guess,
       because a manager meeting run through the keyword matcher would be named
       after whichever service it happens to discuss. */
    if (m.slate.ok) {
      const t = (m.slate.row.title ?? "").trim();
      if (!t) return null;
      /*
       * ---- THE MANAGER PREFIX, AND WHY ITS ABSENCE WAS INERT -------------
       *
       * This returned a bare `<Title> — vN`, which `splitPrefix` reads as the
       * first word being the collection: "Teach Mode vs. Preach Mode — v1"
       * gives prefix "TEACH", which is in no routing table, so every manager
       * film would have been listed as UNKNOWN COLLECTION and skipped. The
       * rename would have succeeded and the ingest would have done nothing —
       * the silent-success shape this pipeline keeps paying for.
       *
       * MANAGER is the route key (ROUTES in ingest-videos.ts) and it is also
       * what the 17 Bank Account films actually carry on disk: their
       * `source_filename` is `MANAGER — <title> — Mitch Hardt — v1.mov`, and
       * the `MANAGER MEETINGS — … (Mitch Hardt)` form is the canonical name
       * the ingest INVENTS afterwards. So this matches the observed name, not
       * the derived one.
       *
       * ALWAYS v1, NEVER A COMPUTED VERSION. A Manager Meetings film attaches
       * to a loaded row that has no asset; if that row already has one, the
       * attach refuses and it is a HOLD for a person rather than a v2. So
       * there is nothing for a version to count, and deriving one from LIVE
       * would be arithmetic on a key that never matches — right by accident,
       * which is worse than right on purpose.
       */
      return `MANAGER — ${t} — Mitch Hardt — v1`;
    }
    if (m.slate.line !== null) return null;

    const r = RULINGS[m.file];
    const stem = r ? `${r.code} — ${r.title}` : proposedName(m.proposal, 0)?.replace(/ — v0$/, "");
    if (!stem) return null;
    /* One past whatever is live for this same idea. Nothing live means v1. */
    const live = LIVE.get(stem.trim().toLowerCase()) ?? 0;
    return `${stem} — v${live + 1}`;
  };

  /* Takes first: a pair is one film, and naming both would put two v1s of the
     same stage in the folder. */
  const takes = findTakes(matched);
  const inAPair = new Set<string>();
  const keepers = new Set<string>();
  for (const pair of takes) {
    inAPair.add(pair.a.file);
    inAPair.add(pair.b.file);
    keepers.add(proposedKeeper(pair).file);
  }

  /*
   * TWO FILMS PROPOSED FOR ONE NAME IS A WRONG ANSWER, NOT A CHOICE.
   *
   * A deck has one film per stage. When two transcripts both come out as
   * "PSF-013 — Set Up the MPI" the matcher has misread one of them — almost
   * always the selling film, whose recap talks about setting up the
   * multi-point. Renaming either would put a confident wrong name on a film,
   * so both are held and named in the report for a person to split.
   */
  const proposedNames = new Map<string, number>();
  for (const m of matched) {
    const n = nameFor(m);
    if (n) proposedNames.set(n, (proposedNames.get(n) ?? 0) + 1);
  }
  const collides = (m: (typeof matched)[number]) => {
    const n = nameFor(m);
    return Boolean(n && (proposedNames.get(n) ?? 0) > 1);
  };

  /* ---- The table --------------------------------------------------------- */
  console.log("  FILE            PROPOSED NAME                              CONF     EVIDENCE");
  console.log("  " + "─".repeat(110));

  const renames: { file: string; to: string }[] = [];

  for (const m of matched) {
    const p: Proposal = m.proposal;
    /* RULINGS APPLY TO THE RENAME, NOT ONLY THE REPORT.
       They were read here from proposedName alone while the plan below applied
       the ruling, so the CSV said one name and --apply wrote another. IMG_2249
       went into Drive as "FND — Pre-Write, Part 2" and had to be corrected by
       hand. One source for the name, used by both. */
    const name = nameFor(m);
    const dupe = inAPair.has(m.file)
      ? keepers.has(m.file)
        ? " [take: keep]"
        : " [take: spare]"
      : "";

    const conf = m.slate.ok ? (m.slate.how === "exact" ? "slate" : "slate~") : p.confidence;
    const evidence = m.slate.ok
      ? [`slate ${m.slate.how}: "${m.slate.line}"`]
      : m.slate.line !== null
        ? [`slate unresolved: "${m.slate.line}"`]
        : p.evidence.slice(0, 5);

    console.log(
      `  ${m.file.padEnd(15)} ${(name ?? "— no proposal —").padEnd(42)} ` +
        `${conf.padEnd(8)} ${evidence.join(", ")}${dupe}`
    );
    console.log(`  ${"".padEnd(15)} ${opening(m.transcript)}`);
    if (!name) console.log(`  ${"".padEnd(15)} why: ${p.reason ?? "no code for this deck"}`);
    console.log("");

    /* A file in a take pair is never renamed automatically, even the proposed
       keeper — the pair is the thing a person confirms. */
    /* A SLATE FILM IS GATED ON THE SLATE, NOT ON THE MATCHER'S CONFIDENCE.
       `p.confidence` is what matchTranscript thought, and for a manager meeting
       it is frequently "low" — it is reading a film about running a meeting and
       looking for service keywords. Letting that block the rename would hold
       every correctly-identified slate film. An UNRESOLVED slate has no name at
       all by now, so it is already held. */
    const confidentEnough = m.slate.ok || p.confidence !== "low";
    if (name && !inAPair.has(m.file) && confidentEnough && !collides(m)) {
      renames.push({ file: m.file, to: `${name}.MOV` });
    }
  }

  /* ---- Duplicate takes --------------------------------------------------- */
  if (takes.length) {
    console.log("\n  TAKES OF THE SAME FILM — neither is renamed, you pick\n");
    for (const pair of takes) {
      const keep = proposedKeeper(pair);
      const spare = keep.file === pair.a.file ? pair.b : pair.a;
      console.log(
        `    ${pair.a.file} + ${pair.b.file}   ${Math.round(pair.similarity * 100)}% the same words`
      );
      console.log(
        `        suggest keeping ${keep.file} (${keep.words ?? "?"} words) ` +
          `over ${spare.file} (${spare.words ?? "?"} words)`
      );
      console.log(`        would be: ${proposedName(keep.proposal) ?? "— no proposal —"}\n`);
    }
  }

  /* ---- Anything that matched nothing ------------------------------------- */
  const none = matched.filter((m) => !m.proposal.deck);
  if (none.length) {
    console.log(`\n  ${none.length} matched no deck — say so rather than force it\n`);
    for (const m of none) {
      console.log(`    ${m.file}  ${m.proposal.reason}`);
    }
  }

  const failed = rows.filter((r) => r.error);
  if (failed.length) {
    console.log(`\n  ${failed.length} failed to transcribe\n`);
    for (const f of failed) console.log(`    ${f.file}  ${f.error}`);
  }

  /* ---- The plan, for whoever does the renaming ---------------------------
     Ryan is handing the renames to another agent working in Drive, so the
     mapping has to leave this script as data rather than as a table somebody
     retypes. Every file gets a row INCLUDING the ones not to touch: a plan that
     lists only the renames leaves the other agent to infer what the silence
     about the other twelve means, and the safe inference and the intended one
     are not always the same.

     THE LOCAL MOUNT AND DRIVE DISAGREE ON ONE NAME. Google Drive for Desktop
     shows "IMG_2173 (1).MOV" for a file Drive itself calls "IMG_2173.MOV" —
     a local disambiguation suffix, not part of the title. `driveTitle` is what
     to match on in Drive; `file` is what is on this disk. */
  const plan = matched.map((m) => {
    const ruled = RULINGS[m.file];
    const name = nameFor(m);
    /* A slate film's hold reason comes from the lookup, not from the matcher's
       confidence — "the spoken slate is not in the library" is the actionable
       sentence, and "low confidence" would be a report about a matcher nobody
       asked. */
    const slateHeld =
      !m.slate.ok && m.slate.line !== null
        ? `hold — ${m.slate.reason}` +
          (m.slate.candidates?.length
            ? ` (${m.slate.candidates.map((c) => c.title ?? c.id).join(" | ")})`
            : "")
        : null;
    const held = slateHeld
      ? slateHeld
      : m.slate.ok
      ? null
      : ruled
      ? null
      : collides(m)
      ? "hold — two films proposed for this same name; one is misread"
      : inAPair.has(m.file)
      ? keepers.has(m.file)
        ? "hold — take, suggested keeper"
        : "hold — take, suggested spare"
      : !name
        ? `hold — ${m.proposal.reason ?? "no op code for this deck"}`
        : m.proposal.confidence === "low"
          ? "hold — low confidence"
          : null;

    /*
     * ---- A HELD MANAGER FILM CARRIES NO ADVISOR GUESS ----------------------
     *
     * These four fields used to fall through to `m.proposal` whenever the slate
     * did not resolve — so a Manager Meetings film whose line is not in the
     * library was written into the plan as deck "Tire Repair", title "On the
     * Drive", identifiedBy "declared". Every one of those is a false statement
     * about the file, sitting in the artefact another agent reads.
     *
     * The anchor is evidence, so the deck IS known: the film said it is a
     * manager meeting. What is NOT known is which one — so title and stage are
     * null, and `identifiedBy` is null because nothing identified it. A hold
     * that names a mechanism is claiming an identification it did not make.
     */
    const claimedButUnresolved = !m.slate.ok && m.slate.line !== null;

    return {
      file: m.file,
      driveTitle: m.file.replace(/ \(\d+\)(?=\.[A-Za-z0-9]+$)/, ""),
      action: held ? "hold" : "rename",
      renameTo: held ? null : `${name}.MOV`,
      reason: held,
      deck: m.slate.ok || claimedButUnresolved
        ? "Manager Meetings"
        : ruled
        ? "The Big Ticket Visit"
        : m.proposal.deck,
      stage: m.slate.ok ? m.slate.row.title ?? null : claimedButUnresolved ? null : ruled ? "Part 2" : m.proposal.stage,
      title: m.slate.ok ? m.slate.row.title ?? null : claimedButUnresolved ? null : ruled ? ruled.title : m.proposal.title,
      identifiedBy: m.slate.ok ? "slate" : claimedButUnresolved ? null : ruled ? "ruled" : m.proposal.source,
      /* The matched line, quoted, so a reader can check it against the audio.
         Null for every other track, so nothing downstream has to guess. */
      slateLine: m.slate.line,
      contentId: m.slate.ok ? m.slate.row.id : null,
      confidence: m.slate.ok ? `slate-${m.slate.how}` : m.proposal.confidence,
      seconds: m.seconds ?? null,
      words: m.words ?? null,
      evidence: m.proposal.evidence.slice(0, 6),
      opening: opening(m.transcript, 200),
    };
  });

  writeFileSync(
    "reports/dropzone-rename-plan.json",
    `${JSON.stringify({ folder: DIR || "(Drop Zone)", takes: takes.map((t) => ({
      a: t.a.file, b: t.b.file, similarity: t.similarity, suggestedKeeper: proposedKeeper(t).file,
    })), files: plan }, null, 1)}\n`
  );

  const csv = [
    "drive_title,action,rename_to,deck,stage,identified_by,confidence,slate_line,content_id,reason",
    ...plan.map((p) =>
      [p.driveTitle, p.action, p.renameTo ?? "", p.deck ?? "", p.stage ?? "",
       p.identifiedBy ?? "", p.confidence, p.slateLine ?? "", p.contentId ?? "",
       p.reason ?? ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    ),
  ].join("\n");
  writeFileSync("reports/dropzone-rename-plan.csv", `${csv}\n`);

  console.log("  plan -> reports/dropzone-rename-plan.json + .csv\n");

  /* ---- Renaming, only on the word ---------------------------------------- */
  console.log(
    `\n  ${renames.length} file(s) are confident, unpaired and have an op code — ` +
      `the ones --apply would rename.\n`
  );

  if (!APPLY) {
    console.log("  Nothing was written. Re-run with --apply --dir=\"<Drop Zone>\" to rename.\n");
    return;
  }

  if (!DIR) {
    console.error("  --apply needs --dir=\"<Drop Zone>\" — the folder to rename inside.\n");
    process.exit(1);
  }

  let done = 0;
  for (const r of renames) {
    const from = join(DIR, r.file);
    const to = join(DIR, r.to);
    if (!existsSync(from)) {
      console.log(`    skipped ${r.file} — not in the folder any more`);
      continue;
    }
    if (existsSync(to)) {
      /* Never overwrite. Two films landing on one name means the matcher got
         one of them wrong, and clobbering would destroy the evidence of which. */
      console.log(`    skipped ${r.file} — "${r.to}" already exists`);
      continue;
    }
    try {
      renameSync(from, to);
      console.log(`    ${r.file}  ->  ${r.to}`);
      done++;
    } catch (e) {
      console.log(`    FAILED ${r.file}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`\n  renamed ${done} of ${renames.length}.\n`);
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
  void main();
}
