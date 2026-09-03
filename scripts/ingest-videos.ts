/* ============================================================================
   EDIAGD — batch-ingest a folder of masters into Mux

   Reads "01 - Ready", parses each filename, mints a Mux direct upload with the
   master settings, PUTs the file, and lets the webhook create the content row.

   ---------------------------------------------------------------------------
   IT USES THE EXISTING PATH, IT DOES NOT INVENT ONE
   ---------------------------------------------------------------------------
   The admin uploader already does: createDirectUpload() → insert mux_upload
   with a draft → PUT the bytes → webhook video.asset.ready builds the content
   row from that draft. This does exactly the same thing 56 times. Writing a
   second path that inserted content rows directly would mean two definitions of
   what an ingested video is, and they would drift the first time either moved.

   The draft is stored BEFORE the bytes go up, which is what makes the batch
   resumable: if this dies at file 31, the first 30 are already tagged and Mux
   will finish them without us.

   ---------------------------------------------------------------------------
   NOTHING GOES LIVE BROKEN
   ---------------------------------------------------------------------------
   The webhook creates every row as status='draft'. A row published before its
   asset is ready would render a player pointing at nothing, and mid-batch that
   is a real advisor opening a real screen. So: ingest leaves everything draft,
   the vertical cron fills in the 9:16, and publishing is a separate deliberate
   step (--publish-when-ready, or the admin screen).

   ---------------------------------------------------------------------------
   THE FILENAME IS THE METADATA
   ---------------------------------------------------------------------------
       MINDSET — Fearful When Others Are Greedy (Buffett) — v1.mov
          │                    │                    │        │
      collection             title                voice   version

   Anything that does not match is REPORTED, NEVER GUESSED. A file called
   "049.  Decide what do with the time given.MOV" has no collection and no
   version; inferring one would put a video in a rotation nobody chose.

     npm run ingest:videos -- --dir="/path/to/01 - Ready" --dry
     npm run ingest:videos -- --dir="/path/to/01 - Ready"
     npm run ingest:videos -- --dir="…" --only=MINDSET
   ============================================================================ */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readdir, stat, readFile, copyFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createDirectUpload } from "../lib/mux/upload";

/*
 * LAZY, NOT MODULE-LEVEL.
 *
 * createClient() at import time throws "supabaseUrl is required" the moment
 * anything requires this file without the ingest env — which is every test that
 * wants parseName. The require.main guard below stops main() from running; it
 * cannot stop a side effect that happens while the module is still loading.
 * A connection is a thing the ingest needs, not a thing the file needs.
 */
let _sb: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!_sb) {
    _sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
      auth: { persistSession: false },
    });
  }
  return _sb;
}

const args = process.argv.slice(2);
const arg = (k: string) =>
  args.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=");
const DIR = arg("dir");
const ONLY = arg("only")?.toUpperCase();
const DRY = args.includes("--dry");
const LIMIT = Number(arg("limit") ?? "0");

/*
 * CHECKED WHEN THE INGEST RUNS, not when the module loads.
 *
 * A module-level process.exit(1) means importing this file for parseName kills
 * the importing process with "--dir= is required" — which is what it did to the
 * name test. Same class of fault as the eager Supabase client above: work that
 * belongs to the run, happening at load.
 */
function requireDir(): string {
  if (!DIR) {
    console.error("  --dir= is required (the folder of masters).\n");
    process.exit(1);
  }
  return DIR;
}

/* ---- Where each collection surfaces ---------------------------------------
 * NO NEW COLUMNS. The content-model audit proposes `collection` and `format`;
 * The six collections and where each one is served. `collection` is the shelf
 * (0062); `placement` is where the app surfaces it (0057). They are different
 * questions and both are needed.
 *
 * `craftSeries` is the certification tag. There is no certification table yet,
 * so it rides in `subcategory`: a label a later lesson-assignment pass can
 * group on, and which is visibly a tag rather than pretending to be a link.
 */
type Route = {
  placement:
    | "daily_lifestyle"
    | "daily_pitch"
    | "onboarding_intro"
    | "technician_daily"
    | null;
  /** The shelf. Was `series` until 0063 replaced it. */
  collection: string | null;
  craftSeries: string | null;
  /**
   * The content type, when it is not the advisor default.
   *
   * COLLECTION IS A SHELF; TYPE IS THE ACCESS RULE. content_entitled_read
   * resolves roles_for_content_type(content.type) and has never looked at
   * collection, so a technician video filed as advisor_video would be a
   * technician video every advisor can see. See 0091.
   */
  contentType?: "advisor_video" | "technician_video";
};

const ROUTES: Record<string, Route> = {
  // Live in the daily loop's lifestyle slot, in the mindset rotation.
  MINDSET: { placement: "daily_lifestyle", collection: "Mindset", craftSeries: null },
  // The four craft series: same rotation, each pre-tagged for its certification.
  WALKAROUND: { placement: "daily_lifestyle", collection: "Craft", craftSeries: "Walk-Around" },
  CLOSE: { placement: "daily_lifestyle", collection: "Craft", craftSeries: "The Close" },
  OBJECTION: { placement: "daily_lifestyle", collection: "Craft", craftSeries: "Objection Handling" },
  MPI: { placement: "daily_lifestyle", collection: "Craft", craftSeries: "Multi-Point Inspection" },
  // Craft rotation, series deliberately unassigned — somebody will sort it.
  CRAFT: { placement: "daily_lifestyle", collection: "Craft", craftSeries: null },
  // The first-run intro. Stored correctly; no screen consumes it yet.
  ONBOARDING: { placement: "onboarding_intro", collection: "Onboarding", craftSeries: null },
  /*
   * The technician track (0091). A different CONTENT TYPE, not just a different
   * shelf: entitlement is keyed on type, so this is what makes a tech video
   * readable by a technician and invisible to an advisor's daily pools.
   */
  TECH: {
    placement: "technician_daily",
    collection: "Technician Training",
    craftSeries: null,
    contentType: "technician_video",
  },
};

type Parsed = {
  file: string;
  collection: string;
  title: string;
  voice: string | null;
  version: number;
  bytes: number;
  ext: string;
};

/**
 * Read a working name and make it correct.
 *
 * ---------------------------------------------------------------------------
 * THE PARSER IS FORGIVING ON PURPOSE. THAT IS THE PRODUCT.
 * ---------------------------------------------------------------------------
 * Mitch was told he gives a quick working name and ingest sorts it out. A
 * parser that rejects `ONBOARDING - Welcome from Mitch.MOV` because the dash is
 * a hyphen and the version is missing is a parser that makes him follow OUR
 * convention — the exact thing he was promised he would not have to do. He is
 * filming on a phone between classes; the strictness belongs here, not in his
 * hands.
 *
 * So it accepts any separator (em dash, en dash, hyphen, colon) with any
 * spacing, any case on the prefix, a missing version meaning v1, a version
 * token anywhere (`v2`, `V2`, `(v2)`), and any case on the extension.
 *
 * STRICTNESS LIVES IN canonical_filename. Whatever arrives, ingest stores the
 * normalised `COLLECTION — Title — vN.mov` and keeps what Mitch typed in
 * source_filename. The canonical name is what a re-drop is matched against, so
 * the convention holds in the database without ever being his problem.
 *
 * What it will NOT do is guess a collection. A name with no recognisable prefix
 * goes to review with a reason — never rejected silently, never filed on a
 * shelf nobody chose.
 */
/**
 * Voices the library already knows, for the dash-delimited form below.
 *
 * A seed, not the whole list: parseName is pure and testable, and ingest passes
 * the real set from `content` on top of this. These are here so the parser is
 * useful against an empty database and so the test does not need one.
 */
const SEED_VOICES = [
  "Mitch Hardt", "Kobe Bryant", "Warren Buffett", "Nick Saban", "Ray Lewis",
  "Jimmy Valvano", "Lou Holtz", "John Wooden", "Ted Lasso", "Vince Lombardi",
];

function parseName(file: string, knownVoices: Iterable<string> = SEED_VOICES): Parsed | null {
  const ext = (file.match(/\.(mov|mp4|m4v)$/i)?.[1] ?? "mov").toLowerCase();
  let base = file.replace(/\.(mov|mp4|m4v)$/i, "").trim();

  // Version first, from anywhere in the name, so it cannot be mistaken for part
  // of the title. Absent means v1 — a first take is the unmarked case.
  let version = 1;
  const vm = base.match(/[\s(\[_-]v(\d+)\)?\]?\s*$/i) ?? base.match(/\bv(\d+)\b/i);
  if (vm) {
    version = Number(vm[1]);
    base = base.replace(vm[0], " ").trim();
  }

  // The prefix is a single word-ish token, so a title containing a dash is not
  // mistaken for a collection boundary.
  const m = base.match(/^\s*([A-Za-z][A-Za-z0-9 _]*?)\s*[—–:-]+\s*(.+)$/);
  if (!m) return null;

  const collection = m[1].trim().toUpperCase().replace(/[\s_]+/g, "");
  let title = m[2].replace(/[\s—–:-]+$/, "").trim();
  let voice: string | null = null;

  const v = title.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (v) {
    title = v[1].trim();
    voice = v[2].trim();
  }

  /*
   * ---- THE OTHER WAY MITCH WRITES A VOICE --------------------------------
   *
   * `TECH — Torque Spec Basics — Mitch Hardt — v1.mov`. The established shape
   * puts the voice in parentheses, and this one puts it in a third
   * dash-delimited segment. Both are things a person types; the parser is
   * forgiving on purpose, and that is the product.
   *
   * IT ONLY FIRES ON A VOICE WE ALREADY KNOW, which is what makes it safe.
   * A title may legitimately contain a dash — the library has
   * "Watch First — The Walk-Around" — and a heuristic like "two capitalised
   * words is a name" would eat it. Matching against the known set cannot:
   * "The Walk-Around" is not a voice, so it stays part of the title, and a
   * genuinely new voice also stays in the title and goes to review rather than
   * being guessed at. Same rule as the collection prefix.
   */
  if (!voice) {
    const known = new Map<string, string>();
    for (const name of knownVoices) known.set(name.toLowerCase(), name);
    const tail = title.match(/^(.*?)\s*[—–-]+\s*([^—–]+?)\s*$/);
    if (tail) {
      const candidate = known.get(tail[2].trim().toLowerCase());
      if (candidate && tail[1].trim()) {
        title = tail[1].trim();
        voice = candidate;
      }
    }
  }

  if (!title) return null;

  return { file, collection, title, voice, version, bytes: 0, ext };
}

/**
 * The same IDEA, ignoring which take it is.
 *
 * canonicalName() answers "is this the same take"; this answers "is this the
 * same thing, re-shot" — the canonical name with its version suffix removed.
 * Collection and voice stay part of it because a title alone is not unique:
 * CRAFT and MINDSET can both hold a "Walk-Around", and the old bare-title key
 * collapsed them into one.
 */
function identityOf(canonical: string): string {
  return canonical.replace(/\s*—\s*v\d+\.[a-z0-9]+$/i, "").trim().toLowerCase();
}

/** Run a child command, inheriting stdio so its own reporting is the reporting. */
function run(cmd: string, argv: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, argv, { stdio: "inherit", env: process.env });
    c.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

/**
 * What the file SHOULD have been called. Stored as canonical_filename so a
 * re-drop of the same idea under a different working name still matches.
 */
function canonicalName(p: Parsed, label: string): string {
  const voice = p.voice ? ` (${p.voice})` : "";
  return `${label.toUpperCase()} — ${p.title}${voice} — v${p.version}.${p.ext}`;
}

/**
 * PUT the file to the one-time Mux URL.
 *
 * ---------------------------------------------------------------------------
 * STAGE TO LOCAL DISK FIRST. DO NOT STREAM THE DRIVE MOUNT INTO THE BODY.
 * ---------------------------------------------------------------------------
 * The masters live on a Google Drive File Stream mount, where the bytes are not
 * on this machine until something reads them. Piping that mount straight into
 * fetch() means every HTTP write waits on an on-demand download from Google,
 * and the two throttle each other: measured, one 95 MB file did not finish in
 * ten minutes, having materialised about 4 MB.
 *
 * Copied first, the same file lands in 39 seconds. So: one `cp` (Drive's
 * problem), then one PUT (Mux's problem), each running at its own speed with
 * its own failure. Disk cost is one file at a time — 415 MB at the worst.
 *
 * ---------------------------------------------------------------------------
 * AND THE BODY IS A BUFFER, NOT A STREAM.
 * ---------------------------------------------------------------------------
 * A stream body makes undici send chunked transfer-encoding regardless of the
 * content-length we set, and Mux's signed upload endpoint stalls on it: the
 * first attempt hung for ten minutes and returned a bare "fetch failed". The
 * same endpoint takes a plain sized PUT at 6.3 MB/s — measured with curl
 * against a throwaway upload URL, which is how the stream was ruled out as the
 * cause rather than the network.
 *
 * A Buffer sets an exact content-length and sends one body. Node keeps Buffers
 * off the JS heap, so even the 415 MB outlier is fine held briefly.
 */
async function putFile(url: string, filePath: string, bytes: number) {
  const dir = await mkdtemp(path.join(tmpdir(), "ediagd-ingest-"));
  const local = path.join(dir, "master" + path.extname(filePath));
  try {
    await copyFile(filePath, local);
    const body = await readFile(local);
    if (body.byteLength !== bytes) {
      throw new Error(`staged copy is ${body.byteLength}B, expected ${bytes}B`);
    }
    const res = await fetch(url, {
      method: "PUT",
      body,
      headers: { "content-type": "application/octet-stream" },
    });
    if (!res.ok) throw new Error(`PUT ${res.status} ${await res.text()}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  const SRC = requireDir();
  /* ---- 1. Read and parse the folder ------------------------------------- */
  const names = (await readdir(SRC)).filter((f) => /\.(mov|mp4|m4v)$/i.test(f));
  const parsed: Parsed[] = [];
  const unparsed: string[] = [];
  const unrouted: Parsed[] = [];

  for (const f of names.sort()) {
    const p = parseName(f);
    if (!p) {
      unparsed.push(f);
      continue;
    }
    p.bytes = (await stat(path.join(SRC, f))).size;
    if (!ROUTES[p.collection]) {
      unrouted.push(p);
      continue;
    }
    if (ONLY && p.collection !== ONLY) continue;
    parsed.push(p);
  }

  const totalBytes = parsed.reduce((n, p) => n + p.bytes, 0);
  console.log(`  folder:   ${SRC}`);
  console.log(`  videos:   ${names.length} file(s)`);
  console.log(`  parsed:   ${parsed.length}`);
  console.log(`  size:     ${(totalBytes / 1e9).toFixed(2)} GB\n`);

  const byCollection = new Map<string, number>();
  parsed.forEach((p) => byCollection.set(p.collection, (byCollection.get(p.collection) ?? 0) + 1));
  for (const [c, n] of [...byCollection].sort()) {
    const r = ROUTES[c];
    console.log(
      `    ${String(n).padStart(3)}  ${c.padEnd(11)} -> collection=${r.collection ?? "—"} placement=${r.placement ?? "—"}` +
        (r.craftSeries ? `  cert=${r.craftSeries}` : "")
    );
  }

  /* ---- 2. Anything the filename did not explain -------------------------- */
  // Listed, never guessed at. See the header.
  if (unparsed.length) {
    console.log(`\n  DID NOT PARSE — skipped, not guessed at: ${unparsed.length}`);
    unparsed.forEach((f) => console.log(`    ${f}`));
    console.log(`    Expected: COLLECTION — Title (Voice) — vN.mov`);
  }
  if (unrouted.length) {
    console.log(`\n  UNKNOWN COLLECTION — skipped: ${unrouted.length}`);
    unrouted.forEach((p) => console.log(`    ${p.collection.padEnd(12)} ${p.file}`));
    console.log(`    Known: ${Object.keys(ROUTES).join(", ")}`);
  }

  /*
   * ---- WHAT COUNTS AS "ALREADY HERE" -------------------------------------
   *
   * This used to be a Set of bare titles, and parseName() strips the version
   * token BEFORE the title is formed — so `… — v2.mov` produced the same title
   * as v1, matched, and was filtered out. A re-shoot never reached Mux, the run
   * printed "skipping 1 already uploaded", and the library kept the old take
   * while Mitch believed the new one had landed.
   *
   * canonicalName() has encoded the right key all along — COLLECTION, title,
   * voice and version — and the comment above it says "the canonical name is
   * what a re-drop is matched against". It was computed, stored, and never
   * matched on.
   *
   * READ FROM `content`, NOT FROM mux_upload.draft. The 56 drafts already in
   * production predate this shape entirely: they carry `series`, no version, no
   * voice (it is prose inside `body` — the mistake the Phase 3 backfill undid)
   * and no canonical_filename. The content rows the webhook built from them
   * carry all four. `content` is also where the id a replacement needs lives.
   *
   * BOTH KEYS COME OFF ONE STRING. The identity is the canonical name with its
   * ` — vN.ext` suffix removed, so the two grains cannot disagree about what
   * makes a video the same idea — and neither has to reconcile the filename's
   * "(Buffett)" with the row's resolved "Warren Buffett".
   */
  const { data: priorRows } = await sb()
    .from("content")
    .select("id, canonical_filename, version")
    .not("mux_asset_id", "is", null)
    .not("canonical_filename", "is", null);

  type Prior = { version: number; contentId: string; canonical: string };
  const byCanonical = new Map<string, Prior>();
  const byIdentity = new Map<string, Prior>();
  for (const r of (priorRows ?? []) as { id: string; canonical_filename: string; version: number | null }[]) {
    const prior: Prior = {
      version: Number(r.version ?? 1),
      contentId: r.id,
      canonical: r.canonical_filename,
    };
    byCanonical.set(r.canonical_filename, prior);
    const identity = identityOf(r.canonical_filename);
    const seen = byIdentity.get(identity);
    if (!seen || prior.version > seen.version) byIdentity.set(identity, prior);
  }

  const done: { file: string; uploadId: string }[] = [];
  const failed: { file: string; error: string }[] = [];
  const skipped: { file: string; because: string }[] = [];
  const replacements: { file: string; contentId: string; from: number; to: number }[] = [];
  const pending: Parsed[] = [];

  for (const p of parsed) {
    const route = ROUTES[p.collection];
    const canonical = canonicalName(p, route?.collection ?? p.collection);
    if (byCanonical.has(canonical)) {
      skipped.push({ file: p.file, because: `already ingested as ${canonical}` });
      continue;
    }
    const prior = byIdentity.get(identityOf(canonical));
    if (prior && p.version > prior.version) {
      replacements.push({
        file: p.file,
        contentId: prior.contentId,
        from: prior.version,
        to: p.version,
      });
      continue;
    }
    if (prior && p.version <= prior.version) {
      skipped.push({ file: p.file, because: `v${prior.version} is already the live take` });
      continue;
    }
    pending.push(p);
  }

  if (skipped.length) {
    console.log(`  skipping ${skipped.length}:`);
    for (const s of skipped) console.log(`     ${s.file}  —  ${s.because}`);
    console.log("");
  }

  /*
   * ---- A HIGHER VERSION IS A REPLACEMENT, NOT AN INGEST -------------------
   *
   * Shelling out to replace:video rather than reimplementing the swap: that
   * script already enforces the order that matters (upload -> optional trim ->
   * swap the master -> derive the vertical), archives the old asset id, and
   * lets 0058 mark the stale vertical. Two implementations of that sequence is
   * how one of them ends up skipping the derive. Same reasoning replace-video
   * itself gives for shelling out to derive:vertical.
   */
  for (const r of replacements) {
    console.log(`  REPLACE  ${r.file}  v${r.from} -> v${r.to}  (content ${r.contentId.slice(0, 8)})`);
    if (DRY) continue;
    try {
      await run("npm", [
        "run", "replace:video", "--",
        `--id=${r.contentId}`,
        `--file=${path.join(SRC, r.file)}`,
      ]);
      done.push({ file: r.file, uploadId: `replaced:${r.contentId}` });
    } catch (e) {
      failed.push({ file: r.file, error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (DRY) {
    console.log(`\n  --dry: nothing uploaded, nothing replaced.\n`);
    console.log(`    ${replacements.length} would REPLACE an existing take, ${pending.length} would ingest fresh, ${skipped.length} skipped\n`);
    pending.slice(0, LIMIT || pending.length).forEach((p) =>
      console.log(
        `    new      ${p.collection.padEnd(11)} ${p.title.slice(0, 46).padEnd(48)}${(p.voice ?? "—").padEnd(14)}${(p.bytes / 1e6).toFixed(0)}MB`
      )
    );
    return;
  }

  /* ---- 3. Upload, one at a time ------------------------------------------ */
  /*
   * SERIAL, DELIBERATELY. Six concurrent PUTs of 200 MB would saturate the
   * uplink and make every one of them slower, and a failure mid-flight would be
   * six unclear states instead of one. This is a batch nobody is watching —
   * predictable beats fast.
   */
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.ediagd.ai";

  /*
   * RESUMABLE. A 9 GB batch over a 2 MB/s link is an hours-long job, so it will
   * be interrupted at some point. A re-run continues rather than uploading the
   * same master twice.
   *
   * SKIP ON asset_id, NOT ON THE ROW EXISTING. The draft row is written before
   * the bytes go up, so a file whose PUT failed leaves a row sitting at
   * 'waiting' with no asset — and keying the skip on "a row exists" would make
   * every retry step over exactly the files that need retrying. An asset_id is
   * the only proof Mux actually received something.
   */
  const queue = LIMIT ? pending.slice(0, LIMIT) : pending;

  for (const [i, p] of queue.entries()) {
    const label = `[${i + 1}/${queue.length}] ${p.title.slice(0, 44)}`;
    try {
      const route = ROUTES[p.collection];
      // Voice in the Mux-side title too, so the dashboard is scannable
      // without opening anything. See the note in createDirectUpload.
      const { uploadId, url } = await createDirectUpload(
        origin,
        p.voice ? `${p.title} (${p.voice})` : p.title
      );
      // Mux types the one-time URL as optional. It is always present on a
      // successful create, but a missing one would mean PUTting into the void,
      // so it fails this file loudly rather than silently skipping the bytes.
      if (!url) throw new Error("Mux returned an upload with no URL");

      // The draft lands BEFORE the bytes, so a crash mid-upload still leaves a
      // correctly tagged row for Mux to finish into.
      const { error } = await sb().from("mux_upload").insert({
        upload_id: uploadId,
        status: "waiting",
        draft: {
          title: p.title,
          /* The route decides, defaulting to advisor. A tech video filed as
             advisor_video would be readable by every advisor — see 0091. */
          type: route.contentType ?? "advisor_video",
          collection: route.collection,
          placement: route.placement,
          subcategory: route.craftSeries,
          // Voice goes in its own column now, never into notes. Writing it as
          // prose was the mistake the Phase 3 backfill had to undo.
          voice: p.voice ?? "Mitch Hardt",
          version: p.version,
          // What Mitch typed, and what it should have been called. The second
          // is what a re-drop is matched against.
          source_filename: p.file,
          canonical_filename: canonicalName(p, route.collection ?? p.collection),
        },
      });
      if (error) throw new Error(`mux_upload insert: ${error.message}`);

      process.stdout.write(`  ${label} … `);
      await putFile(url, path.join(SRC, p.file), p.bytes);
      console.log(`ok  (${(p.bytes / 1e6).toFixed(0)}MB)  upload=${uploadId.slice(0, 12)}…`);
      done.push({ file: p.file, uploadId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`\n  ${label} FAILED — ${msg}`);
      failed.push({ file: p.file, error: msg });
    }
  }

  /* ---- 4. What happens next, without us ---------------------------------- */
  console.log(`\n  uploaded: ${done.length}/${queue.length}`);
  if (failed.length) {
    console.log(`  failed:   ${failed.length}`);
    failed.forEach((f) => console.log(`    ${f.file}  ${f.error}`));
  }
  console.log(
    `\n  Mux is transcoding. The webhook creates each content row as DRAFT when\n` +
      `  its asset is ready; the derive-vertical cron picks up the 9:16 within 30\n` +
      `  minutes of that. Nothing is advisor-visible until somebody publishes it.\n`
  );
}

/*
 * NOT ON IMPORT.
 *
 * This was a bare IIFE, which means requiring the file for any reason — a test
 * wanting parseName, a script reusing ROUTES — ran a full Drop Zone ingest
 * against production. That is not hypothetical: importing import-knowledge.ts
 * to write a test is exactly how 797 rows were touched and 15 cue bodies
 * truncated, and this file uploads to Mux.
 */
if (require.main === module) {
  main().catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}

export { parseName, ROUTES, SEED_VOICES, canonicalName, type Parsed, type Route };
