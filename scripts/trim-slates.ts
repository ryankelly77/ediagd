/* ============================================================================
   EDIAGD — cut the slate off the front of a batch

     npm run trim:slates                 # report, change nothing
     npm run trim:slates -- --apply
     npm run trim:slates -- --apply --only="FND — Pre-Write"

   ---------------------------------------------------------------------------
   WHAT A SLATE IS HERE
   ---------------------------------------------------------------------------
   Mitch's newer films open with a few seconds of slate — the camera running
   before the take begins — and then he says "Aloha", which is the first word of
   every finished film. So the cut is not "two seconds": it is "wherever Aloha
   is", and that is different in every file. A fixed trim would clip the
   greeting off the short ones and leave dead air on the long ones, and both are
   visible on the very first frame an advisor sees.

   The timestamp comes from scripts/slate-timings.py, which reads word-level
   positions out of the first thirty seconds of each file — the same pass that
   reads the slate the film is named from. One measurement, used twice.

   ---------------------------------------------------------------------------
   IT TRIMS ROWS, NOT FILES
   ---------------------------------------------------------------------------
   This runs AFTER the ingest, against content rows that already exist. That is
   deliberate: films reach Mux through two doors — a new one is an ingest, a
   reshoot is a replacement — and teaching both doors to trim would have meant
   two implementations of clip → swap → re-derive-the-vertical. The second one
   would have been the copy that eventually forgot the derive, and a landscape
   trimmed while its vertical was not is a pair of videos a second apart.

   So both doors stay untrimmed and this makes one pass afterwards, shelling out
   to `replace:video --trim-only`, which is that sequence and already had it.

   ---------------------------------------------------------------------------
   TRIMMING TWICE WOULD BE INVISIBLE
   ---------------------------------------------------------------------------
   A second run would cut another two seconds off an already-trimmed film, and
   the result still plays — it just starts in the middle of a sentence. Nothing
   about the row says whether it has been cut, so this keeps its own ledger and
   refuses anything already in it. --force is available and is a decision, not a
   retry.
   ============================================================================ */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { spawn } from "node:child_process";

/*
 * BOTH FACTS COME FROM slate-plan.json, and that is a correction.
 *
 * This first read the whole-film transcripts for the cut point, and those
 * timestamps are SEGMENT starts. The slate is spoken — "Doubt is a strange
 * thing by Kobe Bryant." — and Whisper puts it in the same segment as the
 * "Aloha" that follows it, so the segment start is the start of the SLATE.
 * Measured on this batch: about 1.1s where the truth is about 5s. Trimming
 * there would have cut a second of silence and kept the entire thing this job
 * exists to remove, and the result would have looked deliberate.
 *
 * slate-timings.py gets the word-level position of "Aloha" from the first
 * thirty seconds, and slate-plan.ts carries it through beside the name it
 * chose. One file, both facts, and they cannot disagree about which film.
 */
const PLAN = "reports/slate-plan.json";
const LEDGER = "reports/slate-trims.json";
/**
 * One run at a time, enforced.
 *
 * The ledger stops a film being trimmed twice by SEPARATE runs. It cannot stop
 * two CONCURRENT runs both picking the same film before either has written —
 * and that is not theoretical: two overlapping runs cut "Have Patience with
 * Yourself" twice, taking 14.5 seconds off a film whose slate was 7.3, and the
 * result still plays. It just starts mid-sentence, which is the damage nobody
 * reports.
 *
 * The lock holds the pid so a stale one from a killed run can be identified and
 * cleared rather than becoming a permanent refusal.
 */
const LOCK = "reports/.trim-slates.lock";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FORCE = args.includes("--force");
const ONLY = args.find((a) => a.startsWith("--only="))?.slice(7);

/**
 * A beat before the word, so the "A" is not clipped.
 *
 * Word timestamps land fractionally inside the first phoneme often enough to
 * matter on a word this short, and a clipped "loha" is the one failure a viewer
 * notices instantly. A third of a second of room costs nothing: what sits there
 * is the tail of the slate, which is a pause.
 */
const LEAD_IN = 0.35;

/**
 * Past this, the first "Aloha" is not a greeting.
 *
 * Some films say it again mid-lesson, and a transcript whose opening was missed
 * would hand back that later timestamp — trimming a minute of the film off and
 * reporting success. A greeting lives in the first few seconds; anything else
 * is reported for a person to look at rather than acted on.
 */
const MAX_SLATE = 20;

type PlanFile = {
  file: string;
  renameTo: string | null;
  alohaAt: number | null;
  action: "reshoot" | "new" | "review";
  title?: string;
};

function load<T>(path: string, what: string): T {
  if (!existsSync(path)) {
    console.error(`\n  missing ${path} — ${what}\n`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function run(cmd: string, argv: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, argv, { stdio: "inherit", env: process.env });
    c.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function main() {
  if (existsSync(LOCK) && !args.includes("--force-unlock")) {
    const held = readFileSync(LOCK, "utf8").trim();
    const alive = (() => {
      try { process.kill(Number(held), 0); return true; } catch { return false; }
    })();
    if (alive) {
      console.error(`\n  another trim run is in progress (pid ${held}).\n` +
        `  Two at once cut the same film twice — that has already happened once.\n`);
      process.exit(1);
    }
    console.log(`  clearing a stale lock from pid ${held}\n`);
  }
  writeFileSync(LOCK, String(process.pid));
  const release = () => { try { unlinkSync(LOCK); } catch { /* already gone */ } };
  process.on("exit", release);
  process.on("SIGINT", () => { release(); process.exit(130); });
  process.on("SIGTERM", () => { release(); process.exit(143); });

  const url = process.env.SB_URL;
  const key = process.env.SB_KEY;
  if (!url || !key) {
    console.error("\n  need SB_URL and SB_KEY\n");
    process.exit(1);
  }

  const plan = load<{ plan: PlanFile[] }>(
    PLAN,
    "run slate:plan first — it maps camera-roll names to canonical ones and carries the cut point"
  ).plan;

  const ledger: Record<string, { trimmedAt: string; startTime: number }> = existsSync(LEDGER)
    ? JSON.parse(readFileSync(LEDGER, "utf8"))
    : {};

  /* Only films this batch actually renamed. Anything left for a ruling has no
     canonical name yet and nothing to trim against. */
  const byCanonical = new Map<string, PlanFile>();
  for (const p of plan) {
    if (p.renameTo && p.action !== "review") {
      byCanonical.set(p.renameTo.replace(/\.[a-z0-9]+$/i, ""), p);
    }
  }

  /* Everything in the library that this batch could have produced. */
  const res = await fetch(
    `${url}/rest/v1/content?select=id,title,canonical_filename,duration_sec,status,mux_asset_id&canonical_filename=not.is.null`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } }
  );
  const rows = (await res.json()) as {
    id: string; title: string; canonical_filename: string;
    duration_sec: number | null; status: string; mux_asset_id: string | null;
  }[];

  type Job = { id: string; title: string; canonical: string; source: string; start: number };
  const jobs: Job[] = [];
  const skipped: { what: string; because: string }[] = [];

  for (const row of rows) {
    const stem = row.canonical_filename.replace(/\.[a-z0-9]+$/i, "");
    const entry = byCanonical.get(stem);
    if (!entry) continue; // not from this batch
    const source = entry.file;
    if (ONLY && !row.canonical_filename.toLowerCase().includes(ONLY.toLowerCase())) continue;

    if (ledger[row.id] && !FORCE) {
      skipped.push({ what: row.title, because: `already trimmed at ${ledger[row.id].startTime}s` });
      continue;
    }
    if (!row.mux_asset_id) {
      skipped.push({ what: row.title, because: "no master asset yet — is the ingest finished?" });
      continue;
    }

    if (entry.alohaAt == null) {
      skipped.push({ what: row.title, because: `no "Aloha" found in ${source} — trim by hand` });
      continue;
    }
    if (entry.alohaAt > MAX_SLATE) {
      skipped.push({
        what: row.title,
        because: `first "Aloha" at ${entry.alohaAt}s is too late to be a greeting`,
      });
      continue;
    }

    const start = Math.max(0, Number((entry.alohaAt - LEAD_IN).toFixed(2)));
    if (start <= 0) {
      skipped.push({ what: row.title, because: "starts on the greeting already — nothing to cut" });
      continue;
    }
    jobs.push({ id: row.id, title: row.title, canonical: row.canonical_filename, source, start });
  }

  console.log(`\n  ${jobs.length} to trim, ${skipped.length} skipped\n`);
  for (const j of jobs) {
    console.log(`    ${j.start.toFixed(2)}s   ${j.canonical}`);
    console.log(`             from ${j.source}`);
  }
  if (skipped.length) {
    console.log(`\n  SKIPPED`);
    for (const s of skipped) console.log(`    ${s.what}\n             ${s.because}`);
  }

  if (!APPLY) {
    console.log(`\n  --apply to cut. Nothing changed.\n`);
    return;
  }

  let done = 0;
  const failed: { title: string; error: string }[] = [];

  for (const j of jobs) {
    console.log(`\n  ──────── ${j.canonical}`);
    try {
      await run("npm", [
        "run", "replace:video", "--",
        `--id=${j.id}`,
        `--trim-start=${j.start}`,
        "--trim-only",
      ]);
      /* Written per film, not at the end: a run that dies at film 40 must not
         re-cut the first 39 on the next attempt. */
      ledger[j.id] = { trimmedAt: new Date().toISOString(), startTime: j.start };
      writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 1)}\n`);
      done++;
    } catch (e) {
      failed.push({ title: j.canonical, error: e instanceof Error ? e.message : String(e) });
      console.log(`    FAILED — continuing`);
    }
  }

  console.log(`\n  trimmed ${done}, failed ${failed.length}`);
  for (const f of failed) console.log(`    ${f.title}: ${f.error}`);
  console.log("");
}

if (require.main === module) void main();
