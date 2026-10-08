/* ============================================================================
   EDIAGD — verify a cut film ON THE RESULT, not on the plan

     set -a; source .env.local; set +a
     SB_URL=… SB_KEY=… npm run trim:verify                 # every ledgered film
     …                  npm run trim:verify -- --only=44cfa330,2c186b71
     …                  npm run trim:verify -- --window=3  # seconds read at each end

   ---------------------------------------------------------------------------
   WHY THIS EXISTS
   ---------------------------------------------------------------------------
   trim:apply proved two things about every film it cut: that the asset came
   back the LENGTH the cut asked for — 252 of 252, exactly — and that the new
   captions still put "Aloha" near the start. Both of those are also true of a
   film cut INTO the greeting. Neither asks whether the finished film opens on a
   whole word with a beat of air in front of it.

   ---------------------------------------------------------------------------
   TWO INSTRUMENTS, AND USING THE WRONG ONE COST TEN FILMS A NEEDLESS RE-CUT
   ---------------------------------------------------------------------------
   The first build of this asked whisper where the first word started. Whisper
   anchors the first word of a short window to 0.00 whatever silence precedes
   it: on the live "Coverage is Key, Part 1" it reports 0.000 while ffmpeg's
   silencedetect puts the first sound at 0.471. The film has half a second of
   air and whisper says none.

   On that reading the verifier called ten of twelve Coverage is Key films
   over-cut. They were not. Only trim:recut refusing to swap a clip it had just
   measured stopped ten good films being cut again.

   So: ENERGY says how much air; WHISPER says which word. See trim-check.ts.
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import Mux from "@mux/mux-node";
import { readFileSync, writeFileSync } from "node:fs";
import {
  readEnds, passes, headOk, tailOk, strip,
  MIN_FIRST_WORD_START, MIN_TAIL_AFTER_MAHALO, type Ends,
} from "./trim-check";

const LEDGER = "reports/trim-pass.json";
const OUT = process.argv.slice(2).find((a) => a.startsWith("--out="))?.slice(6) ?? "reports/trim-verify.json";
const WORK = ".tmp-trim-verify";

const argv = process.argv.slice(2);
const ONLY = argv.find((a) => a.startsWith("--only="))?.slice(7);
const WINDOW = Number(argv.find((a) => a.startsWith("--window="))?.slice(9) ?? 3);
const MODEL = argv.find((a) => a.startsWith("--model="))?.slice(8) ?? "small.en";
/*
 * WHICH RENDITION. A phone plays the VERTICAL, and every check in the trim pass
 * read the landscape — which is how two films shipped a vertical that begins six
 * seconds into the film with correct ids, durations and statuses all the way
 * down. Default stays landscape; `--rendition=vertical` is the one that answers
 * "what does a phone play".
 */
const RENDITION = (argv.find((a) => a.startsWith("--rendition="))?.slice(12) ?? "landscape") as
  "landscape" | "vertical";
/** Every published film, not only the ones this pass cut. */
const ALL = argv.includes("--all");
/** For the vertical, the master's length is the thing it must agree with. */
const MAX_LENGTH_GAP = Number(argv.find((a) => a.startsWith("--max-gap="))?.slice(10) ?? 0.5);

function requireEnv() {
  const m = ["SB_URL", "SB_KEY", "MUX_TOKEN_ID", "MUX_TOKEN_SECRET", "MUX_SIGNING_KEY_ID", "MUX_SIGNING_KEY_PRIVATE"]
    .filter((k) => !process.env[k]);
  if (m.length) { console.error(`\n  missing ${m.join(", ")}\n`); process.exit(1); }
}
let _sb: ReturnType<typeof createClient> | null = null;
const db = () => (_sb ??= createClient(process.env.SB_URL!, process.env.SB_KEY!, { auth: { persistSession: false } }));
let _mux: Mux | null = null;
const video = () => (_mux ??= new Mux({
  tokenId: process.env.MUX_TOKEN_ID!, tokenSecret: process.env.MUX_TOKEN_SECRET!,
  jwtSigningKey: process.env.MUX_SIGNING_KEY_ID!, jwtPrivateKey: process.env.MUX_SIGNING_KEY_PRIVATE!,
}));

type Result = Ends & {
  contentId: string; title: string;
  archivedAssetId: string; currentAssetId: string | null;
  masterDuration: number | null; lengthGap: number | null;
  headOk: boolean; tailOk: boolean; pass: boolean;
};

async function main() {
  requireEnv();
  const ledger = JSON.parse(readFileSync(LEDGER, "utf8")) as Record<string, { contentId: string; title: string }>;
  const archivedOf = new Map<string, string>();
  for (const [asset, v] of Object.entries(ledger)) archivedOf.set(v.contentId, asset);

  type Film = { contentId: string; title: string; archived: string };
  let entries: Film[];
  if (ALL) {
    const rows: { id: string; title: string }[] = [];
    for (let page = 0; ; page++) {
      const { data, error } = await db().from("content").select("id, title")
        .eq("type", "advisor_video").eq("status", "published").is("retired_at", null)
        .order("id").range(page * 1000, page * 1000 + 999);
      if (error) throw new Error(error.message);
      if (!data?.length) break;
      rows.push(...(data as { id: string; title: string }[]));
      if (data.length < 1000) break;
    }
    entries = rows.map((r) => ({ contentId: r.id, title: r.title, archived: archivedOf.get(r.id) ?? "" }));
  } else {
    entries = Object.entries(ledger).map(([archived, v]) => ({ archived, contentId: v.contentId, title: v.title }));
  }
  if (ONLY) {
    const want = ONLY.split(",").map((s) => s.trim()).filter(Boolean);
    entries = entries.filter((e) => want.some((w) => e.contentId.startsWith(w)));
  }
  console.log(`\n  trim:verify — ${entries.length} film(s), ${RENDITION} rendition, ${WINDOW}s read at each end`);
  console.log(`  PASS = opens on "Aloha" with >= ${MIN_FIRST_WORD_START}s of air, closes on "Mahalo" with >= ${MIN_TAIL_AFTER_MAHALO}s after\n`);

  const results: Result[] = [];
  let n = 0;
  for (const e of entries) {
    n++;
    let ends: Ends = {
      duration: null, firstWord: null, lastWord: null, leadIn: null, tailAfterLast: null,
      whisperFirstStart: null, headHeard: "", tailHeard: "", note: null,
    };
    let current: string | null = null;
    let masterDur: number | null = null;
    try {
      const { data } = await db().from("content")
        .select("mux_playback_id, vertical_playback_id, mux_asset_id, duration_sec")
        .eq("id", e.contentId).maybeSingle();
      const row = data as unknown as {
        mux_playback_id: string | null; vertical_playback_id: string | null;
        mux_asset_id: string | null; duration_sec: number | null;
      } | null;
      const pbId = RENDITION === "vertical" ? row?.vertical_playback_id : row?.mux_playback_id;
      if (!pbId) throw new Error(`no ${RENDITION} playback id`);
      current = row!.mux_asset_id;
      /* The master's true length, for the gap test. */
      if (row!.mux_asset_id) {
        try { masterDur = (await video().video.assets.retrieve(row!.mux_asset_id)).duration ?? null; } catch { /* reported below */ }
      }
      const pb = await video().video.playbackIds.retrieve(pbId);
      const asset = await video().video.assets.retrieve(pb.object!.id as string);
      if (asset.duration == null) throw new Error("no asset duration");
      ends = await readEnds(video(), pbId, asset.duration, WINDOW, MODEL, WORK);
    } catch (err) {
      ends.note = err instanceof Error ? err.message : String(err);
    }
    /*
     * RYAN'S CRITERION FOR THE RENDITION A PHONE PLAYS: the first word is
     * "Aloha", the last is "Mahalo", and the length agrees with the master.
     * It deliberately does NOT test lead-in — whisper cannot measure that, and
     * an earlier build that tried called ten good films over-cut.
     */
    const gap = masterDur != null && ends.duration != null ? Math.abs(ends.duration - masterDur) : null;
    const wordsOk = strip(ends.firstWord ?? "") === "aloha" && strip(ends.lastWord ?? "") === "mahalo";
    const lengthOk = gap == null ? false : gap <= MAX_LENGTH_GAP;
    const r: Result = {
      ...ends, contentId: e.contentId, title: e.title,
      archivedAssetId: e.archived, currentAssetId: current,
      masterDuration: masterDur, lengthGap: gap == null ? null : Number(gap.toFixed(3)),
      headOk: RENDITION === "vertical" ? strip(ends.firstWord ?? "") === "aloha" : headOk(ends),
      tailOk: RENDITION === "vertical" ? strip(ends.lastWord ?? "") === "mahalo" : tailOk(ends),
      pass: RENDITION === "vertical" ? wordsOk && lengthOk : passes(ends),
    };
    results.push(r);
    if (n % 10 === 0) console.log(`  ${n}/${entries.length}`);
  }

  const fail = results.filter((r) => !r.pass);
  const clipped = fail.filter((r) => strip(r.firstWord ?? "") === "aloha" && (r.leadIn ?? 9) < MIN_FIRST_WORD_START);
  const wrongWord = fail.filter((r) => r.firstWord && strip(r.firstWord) !== "aloha");

  console.log(`\n  ${"═".repeat(96)}`);
  console.log(`  ${"air".padStart(6)} ${"first".padEnd(12)} ${"last".padEnd(12)} ${"air".padStart(6)} ${"dur".padStart(7)} ${"gap".padStart(6)}  film`);
  console.log(`  ${"═".repeat(96)}`);
  for (const r of [...results].sort((a, b) => (a.leadIn ?? 9) - (b.leadIn ?? 9))) {
    console.log(
      `  ${(r.leadIn ?? NaN).toFixed(2).padStart(6)} ${String(r.firstWord ?? "—").slice(0, 12).padEnd(12)} ` +
      `${String(r.lastWord ?? "—").slice(0, 12).padEnd(12)} ${(r.tailAfterLast ?? NaN).toFixed(2).padStart(6)} ` +
      `${(r.duration ?? 0).toFixed(2).padStart(7)} ${(r.lengthGap ?? NaN).toFixed(2).padStart(6)}  ${r.pass ? "    " : "FAIL"} ${r.title.slice(0, 40)}`
    );
  }
  console.log(`  ${"═".repeat(96)}`);
  console.log(`\n  verified ${results.length}   pass ${results.length - fail.length}   FAIL ${fail.length}`);
  console.log(`    opens INSIDE the greeting (< ${MIN_FIRST_WORD_START}s of air): ${clipped.length}`);
  console.log(`    does not open on "Aloha" at all:                ${wrongWord.length}`);

  if (fail.length) {
    console.log(`\n  FAILURES — archived asset is the original a re-cut must come from:`);
    for (const r of fail) {
      console.log(`    ${r.title}`);
      console.log(`      content ${r.contentId}`);
      console.log(`      archived ${r.archivedAssetId}`);
      console.log(`      ${(r.leadIn ?? NaN).toFixed(3)}s air then "${r.firstWord}" … "${r.lastWord}" then ${(r.tailAfterLast ?? NaN).toFixed(3)}s`);
      if (r.note) console.log(`      note: ${r.note}`);
    }
  }
  writeFileSync(OUT, `${JSON.stringify({ generatedAt: new Date().toISOString(), window: WINDOW, results }, null, 1)}\n`);
  console.log(`\n  wrote ${OUT}\n`);
  if (fail.length) process.exit(1);
}

if (require.main === module) {
  main().catch((e) => { console.error(`\n  FAILED: ${e instanceof Error ? e.message : e}\n`); process.exit(1); });
}
