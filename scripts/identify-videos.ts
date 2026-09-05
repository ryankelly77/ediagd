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

function main() {
  const { rows, profiles, scripts } = load();
  const usable = rows.filter((r) => r.transcript && r.transcript.length > 0);

  console.log(`\n  ${rows.length} files · ${usable.length} transcribed\n`);

  const matched = usable.map((r) => ({
    ...r,
    id: r.file,
    proposal: matchTranscript(r.transcript, profiles, scripts),
  }));

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
    const n = proposedName(m.proposal);
    if (n) proposedNames.set(n, (proposedNames.get(n) ?? 0) + 1);
  }
  const collides = (m: (typeof matched)[number]) => {
    const n = proposedName(m.proposal);
    return Boolean(n && (proposedNames.get(n) ?? 0) > 1);
  };

  /* ---- The table --------------------------------------------------------- */
  console.log("  FILE            PROPOSED NAME                              CONF     EVIDENCE");
  console.log("  " + "─".repeat(110));

  const renames: { file: string; to: string }[] = [];

  for (const m of matched) {
    const p: Proposal = m.proposal;
    const name = proposedName(p);
    const dupe = inAPair.has(m.file)
      ? keepers.has(m.file)
        ? " [take: keep]"
        : " [take: spare]"
      : "";

    console.log(
      `  ${m.file.padEnd(15)} ${(name ?? "— no proposal —").padEnd(42)} ` +
        `${p.confidence.padEnd(8)} ${p.evidence.slice(0, 5).join(", ")}${dupe}`
    );
    console.log(`  ${"".padEnd(15)} ${opening(m.transcript)}`);
    if (!name) console.log(`  ${"".padEnd(15)} why: ${p.reason ?? "no code for this deck"}`);
    console.log("");

    /* A file in a take pair is never renamed automatically, even the proposed
       keeper — the pair is the thing a person confirms. */
    if (name && !inAPair.has(m.file) && p.confidence !== "low" && !collides(m)) {
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
    const name = ruled
      ? `${ruled.code} — ${ruled.title} — v1`
      : proposedName(m.proposal);
    const held = ruled
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

    return {
      file: m.file,
      driveTitle: m.file.replace(/ \(\d+\)(?=\.[A-Za-z0-9]+$)/, ""),
      action: held ? "hold" : "rename",
      renameTo: held ? null : `${name}.MOV`,
      reason: held,
      deck: ruled ? "The Big Ticket Visit" : m.proposal.deck,
      stage: ruled ? "Part 2" : m.proposal.stage,
      title: ruled ? ruled.title : m.proposal.title,
      identifiedBy: ruled ? "ruled" : m.proposal.source,
      confidence: m.proposal.confidence,
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
    "drive_title,action,rename_to,deck,stage,identified_by,confidence,reason",
    ...plan.map((p) =>
      [p.driveTitle, p.action, p.renameTo ?? "", p.deck ?? "", p.stage ?? "",
       p.identifiedBy ?? "", p.confidence, p.reason ?? ""]
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
  main();
}
