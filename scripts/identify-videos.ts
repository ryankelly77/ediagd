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

import { readFileSync, renameSync, existsSync } from "fs";
import { join } from "path";
import {
  findTakes,
  matchTranscript,
  proposedKeeper,
  proposedName,
  type DeckProfile,
  type Proposal,
} from "../lib/video/transcript-match";

const TRANSCRIPTS = "reports/dropzone-transcripts.json";
const VOCABULARY = "data/deck-vocabulary.json";
const APPLY = process.argv.includes("--apply");
const DIR = (process.argv.find((a) => a.startsWith("--dir=")) ?? "").slice(6);

/**
 * Deck name -> op code.
 *
 * The quiz bank names decks and does not carry op codes, so the mapping is the
 * caller's to supply — see DeckProfile.code. Only decks with a code here can
 * produce a filename; a match on a deck that has none is still reported, it
 * just cannot be renamed automatically.
 */
const DECK_CODES: Record<string, string> = {
  "Engine Air Filter": "EAF-001",
  "Brake Fluid Exchange": "BFF-012",
  "Cabin Air Filter": "CAF-002",
  "Arctic Blast": "ABT-054",
  "Wiper Blades": "WBF-018",
  "Serpentine Belt": "SRP-038",
  "Coolant Hoses": "CLH-042",
  "Timing Belt": "TMB-039",
  "Battery": "BAT-030",
  "Brake Service": "BPR-029",
  "Coolant Exchange": "CLE-010",
  "Differential Fluid Exchange": "DFF-005",
  "Power Steering Fluid Exchange": "PSF-004",
  "Transmission Fluid Exchange": "TRF-003",
  "A/C Odor Treatment": "ACO-010",
  "A/C Recharge": "ACR-011",
  "Spark Plugs": "SPK-037",
  "Complete Fuel System Service": "CFS-036",
};

type Row = { file: string; seconds?: number; transcript: string; words?: number; error?: string };

function load(): { rows: Row[]; profiles: DeckProfile[] } {
  if (!existsSync(TRANSCRIPTS)) {
    console.error(
      `\n  ${TRANSCRIPTS} not found.\n` +
        `  Run the transcriber first:\n` +
        `    python3 scripts/transcribe-dropzone.py --dir="<Drop Zone>" --out=${TRANSCRIPTS}\n`
    );
    process.exit(1);
  }
  const rows = JSON.parse(readFileSync(TRANSCRIPTS, "utf8")).files as Row[];
  const vocab = JSON.parse(readFileSync(VOCABULARY, "utf8")) as {
    decks: { deck: string; terms: { term: string; weight: number }[] }[];
  };
  const profiles = vocab.decks.map((d) => ({
    deck: d.deck,
    code: DECK_CODES[d.deck],
    terms: d.terms,
  }));
  return { rows, profiles };
}

/** The transcript's opening, as the evidence a person actually reads. */
function opening(text: string, chars = 150): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= chars ? clean : `${clean.slice(0, chars)}…`;
}

function main() {
  const { rows, profiles } = load();
  const usable = rows.filter((r) => r.transcript && r.transcript.length > 0);

  console.log(`\n  ${rows.length} files · ${usable.length} transcribed\n`);

  const matched = usable.map((r) => ({
    ...r,
    id: r.file,
    proposal: matchTranscript(r.transcript, profiles),
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
    if (name && !inAPair.has(m.file) && p.confidence !== "low") {
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
