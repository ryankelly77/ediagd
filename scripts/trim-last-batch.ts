/* ============================================================================
   EDIAGD — the last trim batch: the 62 on Ryan's list, decided from the report

     set -a; source .env.local; set +a
     SB_URL="$NEXT_PUBLIC_SUPABASE_URL" SB_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
       npm run trim:last-batch -- --plan        # build the plan from the report
     …                            --dry         # report, change nothing
     …                            --apply       # cut
     …                            --apply --only=3790edc4
     …                            --apply --force-window   # outside quiet hours

   Reads reports/trim-verify-447.md — the 9 October reading of the rendition a
   phone plays — and nothing else decides which films are in this run. The six
   rules are Ryan's, written against that report's own columns:

   `--plan` is a ONE-TIME read of that report as it stood on 9 October, and
   reports/trim-last-batch-plan.json is the durable record of what it said.
   trim:last-batch-report then rewrites the report with the outcomes, after
   which `--plan` can no longer parse it — and refuses loudly rather than
   quietly planning nothing, because the coverage check below knows the brief's
   counts and a report that yields zero tail cuts fails it.

     runs N s past Mahalo   ->  cut at that Mahalo + 0.7s pad       (33 films)
     closes X, not Mahalo   ->  pass as it is, tail within standard (13)
     opens X, onset <= 0.1  ->  opens on Mitch talking, pass        (5)
     opens X, onset later   ->  cut at the energy onset - 0.3s pad  (6)
     could not be read      ->  one more read, then the rule that fits (3)
     2748 and 2821          ->  unpublished with a reason; not this script (2)

   ---------------------------------------------------------------------------
   WHY THIS IS NOT trim:apply
   ---------------------------------------------------------------------------
   trim:apply cuts from reports/trim-plan.json, delegates to replace:video, and
   verifies AFTER the swap. Every one of those is wrong for this batch:

     - trim-plan.json now holds the 8 October spoken-slate pass, not these films,
       and its tail numbers for them are the ones the 447 reading DISPROVED
       ("the plan measured this tail at 0.31s" against a heard 7.76s).
     - a film verified after its swap has already served the fault. trim:recut
       learned that in one line — "a re-cut checked after it is live has already
       served the fault it was meant to fix" — and this batch inherits it.
     - trim:recut cuts from `archived_asset_id` and re-derives BOTH ends from
       the plan, which would put back the spoken slate on 33 films whose heads
       are already right.

   This reads the archive too — see the clip-of-a-clip note below, which is the
   reason — but it carries the existing head through unchanged rather than
   recomputing it, verifies the clip before any row points at it, and reads a
   plan built for this batch.

   ---------------------------------------------------------------------------
   THE REPORT DECIDES WHICH FILMS; THE MASTER DECIDES WHERE TO CUT
   ---------------------------------------------------------------------------
   The 447 reading was taken on the rendition a phone plays — the VERTICAL on 57
   of these 62. A cut offset measured on a vertical crop and applied to a master
   is two systems' numbers wearing one name, which is how eighteen byte-identical
   films once read as reshoots five seconds longer than themselves.

   So every offset in this run is re-measured on the master at a 10-second
   window, and the report's number is kept beside it as a CROSS-CHECK. They
   agreed to 0.04s on the two films measured by hand before this was written
   (88.89 against 88.85; 6.356 against 6.36). A disagreement beyond
   RECONCILE_TOLERANCE refuses that film and says so, rather than cutting on the
   number that happens to be in front of it.

   ---------------------------------------------------------------------------
   VERIFIED BEFORE THE SWAP, AND THE REFUSAL IS PROVEN BOTH WAYS
   ---------------------------------------------------------------------------
   The clip is created, read at a 10-second window, and only then swapped. A
   clip that fails is left in Mux unreferenced and listed; the row keeps serving
   what it serves today, which is a known quantity. `--prove-refusal` cuts one
   film at a deliberately wrong offset to show the gate fires, because a gate
   that has only ever accepted has not been tested.

   ---------------------------------------------------------------------------
   THE LEDGER IS KEYED ON THE MASTER THAT WAS REPLACED
   ---------------------------------------------------------------------------
   Same rule as trim:apply, and for the same reason: a trimmed film is a new
   asset on the same row, so a content id cannot tell "already cut" from "cut
   before, and this is a different cut". The key is the master this run REPLACED
   — not the asset it clipped, which is usually the archive and is shared with
   the cut that created the master. reports/trim-pass.json is consulted too, so
   a master either pass has already replaced is refused here.

   ---------------------------------------------------------------------------
   A CLIP OF A CLIP IS NOT THE FILM YOU MEASURED — MEASURED, ON FOUR FILMS
   ---------------------------------------------------------------------------
   The first build of this clipped the CURRENT master with `end_time` alone.
   Head cuts came back perfect. Every single tail cut came back with the
   sign-off cut in half, and the before-swap gate refused all four it tried:

     15,000 Part 4   asked 0 -> 89.59 of a master whose Mahalo ends at 88.89
                     got 89.59s of content that opens 0.90s LATE and closes
                     on "Maha!" with 0.00s of air
     30 Sec WA P3    asked 0 -> 118.69, got content ending at master t≈114
                     on the word "Next!"

   `mux://assets/ID` where ID is ITSELF a clip does not deliver that clip's
   timeline: it re-resolves to the underlying source and lands on a keyframe,
   so the output begins somewhere BEFORE the master's zero by an amount that
   varies per film — 0.90s on one of these, about 4.7s on another. The length
   is always exactly what was asked for, which is why a length check alone
   cannot see it, and why the "uncut end drifted" number this run records was
   the thing that gave it away.

   Cutting the SAME film from `archived_asset_id` in the ARCHIVE's timeline
   fixes it completely. Measured on 15,000 Part 4, whose prior pass took 15.92s
   off the head, so master t maps to archive t + 15.92:

     from the master   0 -> 89.59        1.49s air, "Aloha," … "Maha!"   + 0.00s
     from the archive  15.92 -> 105.51   0.59s air, "Aloha," … "Mahalo!" + 0.70s

   0.59s is the master's own onset to the centisecond, and 0.70s is the pad that
   was asked for. So the source is the archive wherever one exists and
   reconciles, which is trim:recut's rule — "it cuts from the original, never
   from the shortened film" — arrived at a second time from the other direction.

   THE MAPPING IS RECONCILED, NOT ASSUMED. The offset comes from the prior
   pass's own ledger (`trimStart`), and the master's duration must be
   explainable by that ledger against the archive's real duration:
   master ≈ (trimEnd ?? archiveDuration) - trimStart. A film that does not
   reconcile is cut from its master instead and says so, and the before-swap
   gate judges the result either way.

   ---------------------------------------------------------------------------
   NO RE-DERIVE
   ---------------------------------------------------------------------------
   replace_master_asset marks the vertical `stale` when it swaps, so a phone
   letterboxes the master — correct, and the master is the thing that was just
   verified. Re-deriving the crop is t29 and deliberately not this run; nothing
   here touches derive-vertical.
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import Mux from "@mux/mux-node";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import {
  readEnds, line, strip, MIN_FIRST_WORD_START, MIN_TAIL_AFTER_MAHALO, type Ends,
} from "./trim-check";

/** Overridable only so the coverage check below can be proven against a
 *  deliberately broken report. Production runs read the real one. */
const REPORT = process.argv.slice(2).find((a) => a.startsWith("--report="))?.slice(9)
  ?? "reports/trim-verify-447.md";
const PLAN = "reports/trim-last-batch-plan.json";
/** Overridable so --prove-refusal can write to a scratch ledger instead of
 *  booking a film as "seen" and locking it out of the real run. */
const LEDGER = process.argv.slice(2).find((a) => a.startsWith("--ledger="))?.slice(9)
  ?? "reports/trim-last-batch.json";
/** The earlier pass's ledger, read only to refuse an asset it already cut. */
const PRIOR_LEDGER = "reports/trim-pass.json";
const LOCK = "reports/.trim-last-batch.lock";
const WORK = ".tmp-trim-last-batch";

/** Ryan's pads, from the brief. */
const PAD_TAIL = 0.7;
const PAD_HEAD = 0.3;
/** One window, both ends, on the master — the same width the 447 reading used. */
const WINDOW = 10;
/* The head window for --find-aloha. Wider than the verification window only
   because the greeting can sit behind a stray word and a gap, and a window
   that ends before the Aloha reports "no Aloha" rather than "look further". */
const ALOHA_WINDOW = 15;
const MODEL = "small.en";
/**
 * How far the master may disagree with the report before this refuses.
 *
 * 0.75s is not a comfort margin: it is what trim-check's own `pull()` accepts as
 * a complete window, so a smaller tolerance would be finer than the instrument.
 * The two films measured by hand disagreed by 0.04s and 0.004s.
 */
const RECONCILE_TOLERANCE = 0.75;
/** A tail must end within this of its Mahalo — the standard the library was built to. */
const TAIL_CEILING = 1.5;
/** A head must open within this of its first sound — Ryan's gate for this batch. */
const HEAD_CEILING = 0.5;

const n = (v: number | null | undefined, d = 2) => (v == null ? "—" : v.toFixed(d));

const argv = process.argv.slice(2);
const MAKE_PLAN = argv.includes("--plan");
const APPLY = argv.includes("--apply");
const FORCE_WINDOW = argv.includes("--force-window");
const PROVE_REFUSAL = argv.includes("--prove-refusal");
const ONLY = argv.find((a) => a.startsWith("--only="))?.slice(7);
const LIMIT = Number(argv.find((a) => a.startsWith("--limit="))?.slice(8) ?? 0) || 0;

type Rule =
  | "tail-cut" | "tail-pass" | "head-cut" | "head-pass" | "reread" | "unpublish";

type PlanRow = {
  id: string;
  title: string;
  series: string;
  rule: Rule;
  /** What the 447 report heard, kept as the cross-check and never as the cut. */
  reportSecond: number | null;
  reportTail: number | null;
  reportVertical: string;
  reportOpens: string | null;
  reportCloses: string | null;
  /** The master as it stands now. A row pointing elsewhere at apply time is refused. */
  masterAssetId: string | null;
  durationSec: number | null;
  /** Why this film is or is not cut, in one sentence, from the rule that decided it. */
  because: string;
  /**
   * Set only for the three the 447 reading could not read. Their `reportSecond`
   * is then the MASTER's own number, so the reconcile below compares a reading
   * with itself and proves nothing — which is why it is labelled rather than
   * left to look like the independent cross-check the other 39 get.
   */
  reportSecondFrom?: "447 report, served rendition" | "master re-read, not independent";
  rereadNote?: string;
  /**
   * The word the finished film MUST open on, when the cut was made to remove
   * something specific rather than just air. A head cut that only checks for
   * 0.3s of air would be satisfied by a film still opening on the stray word
   * the cut existed to remove — so where that is the point, say so and assert
   * it. The unsafe state stops being representable rather than being avoided.
   */
  expectFirstWord?: string;
};

type Measured = {
  assetDuration: number;
  leadIn: number | null;
  tailAfterLast: number | null;
  firstWord: string | null;
  lastWord: string | null;
  mahaloEnd: number | null;
  headHeard: string;
  tailHeard: string;
  note: string | null;
};

/**
 * Which asset to clip, and how to put this film's offsets into its timeline.
 *
 * `offset` is what you ADD to a master-timeline second to get a source-timeline
 * second. It is 0 when the source is the master itself.
 */
type Source = {
  assetId: string;
  kind: "archive" | "master";
  offset: number;
  duration: number;
  /** The arithmetic that justified it, in one line, for the ledger. */
  reconciled: string;
};

type Entry = {
  contentId: string;
  title: string;
  rule: Rule;
  /** The film's CURRENT master — the ledger key, and what was replaced. */
  masterAssetId: string;
  /** What was actually clipped, which is usually the archive. */
  source: Source | null;
  /** Kept for the shape trim:shift-positions reads. */
  sourceAssetId: string;
  newAssetId: string | null;
  /** What the FILM lost, in the master's timeline. trim:shift-positions reads
   *  trimStart, and a saved position moves by what the film lost — never by
   *  the offset into whatever asset happened to be clipped. */
  trimStart: number | null;
  trimEnd: number | null;
  /** What was actually sent to Mux, in the source asset's timeline. */
  sourceTrimStart?: number | null;
  sourceTrimEnd?: number | null;
  padHead: number | null;
  padTail: number | null;
  /** The master reading the offsets were computed from. */
  measuredBefore: Measured | null;
  /** The report's number for the same thing, and the gap between them. */
  reportSecond: number | null;
  reconcileGap: number | null;
  /** The clip, read before any row pointed at it. */
  measuredAfter: Measured | null;
  /** How far the end that was NOT cut appears to have moved. Reported, never
   *  judged — it is a fact about the re-encode. See the note at the gate. */
  uncutEndDrift?: number | null;
  swapped: boolean;
  verdict: "cut" | "refused" | "failed";
  note: string | null;
  at: string;
};

/* ---- the report is the only thing that decides who is in this run --------- */

/**
 * Parse Ryan's list out of reports/trim-verify-447.md.
 *
 * Both halves of the report are read and RECONCILED: the table's outcome column
 * and the per-film sections below it. The table says 62 and the sections say 62;
 * if they ever disagree, that disagreement is the bug and this refuses rather
 * than quietly preferring whichever it parsed second.
 */
function parseReport(md: string): { rows: PlanRow[]; tableCount: number } {
  const table = new Map<string, { series: string; tail: string; vertical: string; outcome: string }>();
  for (const l of md.split("\n")) {
    if (!l.startsWith("| ")) continue;
    const c = l.split("|").map((s) => s.trim());
    if (c.length < 8 || !/Ryan's list/.test(c[7])) continue;
    /* Titles repeat — twenty-three films are called "At the Kiosk" — so the
       table is keyed on title+outcome and used only for the series and the
       vertical. The id comes from the section, which has one. */
    table.set(`${c[1]}|${c[7]}`, { series: c[2], tail: c[5], vertical: c[6], outcome: c[7] });
  }

  const UNPUBLISH = new Set([
    "d0b1084d-db49-4c5e-b608-9fb594355861",
    "fe35f2ea-2fa7-4b07-acca-ea16e2e2c8c7",
  ]);

  const rows: PlanRow[] = [];
  for (const sec of md.split(/\n### /).slice(1)) {
    const lines = sec.split("\n");
    const title = lines[0].trim();
    const meta = lines[1] ?? "";
    const id = meta.match(/`([0-9a-f-]{36})`/)?.[1] ?? null;
    if (!id) throw new Error(`section "${title}" carries no content id`);
    const series = meta.split("·")[1]?.trim() ?? "";
    const durationSec = Number(meta.match(/·\s*(\d+)s\s*·/)?.[1] ?? NaN);
    const vertical = meta.match(/vertical `(\w+)`/)?.[1] ?? "";
    const body = lines.slice(2).join("\n");

    const pastMahalo = Number(body.match(/runs ([\d.]+)s past Mahalo/)?.[1] ?? NaN);
    const second = Number(body.match(/the second to look at: \*{0,2}([\d.]+)s/)?.[1] ?? NaN);
    const opens = body.match(/- opens "([^"]*)", not Aloha/)?.[1] ?? null;
    const closes = body.match(/- closes "([^"]*)", not Mahalo/)?.[1] ?? null;
    const unreadable =
      /partial pull/.test(body) || /head: no audio decoded/.test(body) || /tail: no audio decoded/.test(body);

    let rule: Rule;
    let because: string;
    if (UNPUBLISH.has(id)) {
      rule = "unpublish";
      because = "never finished as a take; unpublished with a reason naming the reshoot";
    } else if (unreadable) {
      rule = "reread";
      because = "the 447 reading could not read it; one more read at 10s, then the rule that fits";
    } else if (Number.isFinite(pastMahalo)) {
      rule = "tail-cut";
      because = `runs ${pastMahalo.toFixed(2)}s past a Mahalo the report heard; cut at that Mahalo + ${PAD_TAIL}s`;
    } else if (closes != null && opens == null) {
      rule = "tail-pass";
      because = `no Mahalo heard — closes "${closes}"; the tail is within the library's standard, so it is kept`;
    } else if (opens != null && Number.isFinite(second) && second <= 0.1) {
      rule = "head-pass";
      because = `opens "${opens}" at ${second.toFixed(2)}s — Mitch is already talking, so there is nothing to cut`;
    } else if (opens != null && Number.isFinite(second)) {
      /* A film that opens on a stray word AND closes without a Mahalo lands
         here on its head, which is the end that has something to cut. */
      rule = "head-cut";
      because = `opens "${opens}" after ${second.toFixed(2)}s of air; cut at the onset - ${PAD_HEAD}s`;
    } else {
      throw new Error(`"${title}" matches no rule — the report says something this does not read`);
    }

    rows.push({
      id, title, series, rule,
      reportSecond: Number.isFinite(second) ? second : null,
      reportTail: Number.isFinite(pastMahalo) ? pastMahalo : null,
      reportVertical: vertical,
      reportOpens: opens, reportCloses: closes,
      masterAssetId: null,
      durationSec: Number.isFinite(durationSec) ? durationSec : null,
      because,
      reportSecondFrom: "447 report, served rendition",
    });
  }

  if (rows.length !== table.size) {
    /* Not a warning. The table is the claim about coverage and the sections are
       the evidence; a gap between them means one of the two is wrong. */
    throw new Error(
      `the report disagrees with itself: ${table.size} rows marked "Ryan's list" in the table, ` +
        `${rows.length} sections below it. Reconcile the report before cutting anything.`
    );
  }
  for (const r of rows) {
    const hit = [...table.entries()].find(([k]) => k.startsWith(`${r.title}|`));
    if (!hit) throw new Error(`"${r.title}" has a section but no row in the table`);
    if (!r.series) r.series = hit[1].series;
  }
  return { rows, tableCount: table.size };
}

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

/** Beaumont's clock, not the laptop's — copied from trim:apply deliberately. */
function quietHours(): { ok: boolean; why: string } {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", hour: "numeric", hour12: false, weekday: "short",
    year: "numeric", month: "short", day: "numeric", minute: "2-digit",
  });
  const parts = Object.fromEntries(f.formatToParts(new Date()).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour);
  const label = f.format(new Date());
  if (String(parts.weekday) === "Sun") return { ok: true, why: `${label} Central — Sunday` };
  if (hour >= 21 || hour < 5) return { ok: true, why: `${label} Central — inside 21:00-05:00` };
  return { ok: false, why: `${label} Central — advisors may be mid-film` };
}

async function waitReady(id: string) {
  let a = await video().video.assets.retrieve(id);
  for (let i = 0; i < 180 && a.status !== "ready"; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    a = await video().video.assets.retrieve(id);
    if (a.status === "errored") throw new Error(`clip errored: ${JSON.stringify(a.errors)}`);
  }
  if (a.status !== "ready") throw new Error("clip never became ready");
  return a;
}

/**
 * Resolve what to clip for one film.
 *
 * Prefers the archive, because clipping a clip does not honour the clip's own
 * timeline — see the note at the top, and the two measurements that proved it.
 * Falls back to the master only when there is no archive or the arithmetic does
 * not add up, and records which, so a ledger reader never has to guess.
 */
async function resolveSource(
  contentId: string,
  masterAssetId: string,
  masterDuration: number,
  archivedAssetId: string | null,
  priorCuts: Map<string, { trimStart: number | null; trimEnd: number | null }>
): Promise<Source> {
  const fallback = (why: string): Source => ({
    assetId: masterAssetId, kind: "master", offset: 0, duration: masterDuration,
    reconciled: `clipping the master directly: ${why}`,
  });
  if (!archivedAssetId) return fallback("the row has no archived_asset_id");
  const prior = priorCuts.get(contentId);
  if (!prior) return fallback("no prior cut in any ledger, so there is no offset to map by");
  const start = prior.trimStart ?? 0;

  let archiveDuration: number;
  try {
    const a = await video().video.assets.retrieve(archivedAssetId);
    if (a.status !== "ready" || a.duration == null) {
      return fallback(`the archive is ${a.status} with duration ${a.duration}`);
    }
    archiveDuration = a.duration;
  } catch (e) {
    return fallback(`the archive could not be read (${e instanceof Error ? e.message : String(e)})`);
  }

  /*
   * ---- WHAT THE ARCHIVE HAS TO SATISFY, AND WHAT IT DOES NOT -------------
   *
   * The only thing needed from the archive is that the master's timeline sits
   * inside it at `start`. The first build demanded more than that — that the
   * prior cut EXPLAIN the master's exact length — and it cost `Promise
   * Yourself`:
   *
   *   archive 131.81s, prior head 4.97s, so it "implies" a 126.84s master
   *   the master is actually 120.94s, off by 5.90s  ->  archive rejected
   *
   * The 5.90s is a prior TAIL cut, and `slate-trims.json` records only
   * `startTime`. So the head offset was right the whole time and the check
   * threw it away for not knowing something it never stored. A false refusal
   * again, and again in the cautious direction.
   *
   * The test is therefore containment: the archive must be long enough to hold
   * the master starting at `start`. That is necessary, and it is not
   * sufficient — so the before-swap gate carries the weight, and for an
   * archive-sourced cut it additionally refuses any drift on the end it did
   * not cut. Twenty films cut from a reconciled archive drifted 0.000s; a
   * non-zero drift means this offset is wrong, which is precisely the evidence
   * a containment test cannot give on its own.
   */
  const needs = start + masterDuration;
  if (archiveDuration < needs - 1.0) {
    return fallback(
      `the archive is too short to contain this master at the prior offset: archive ` +
      `${archiveDuration.toFixed(2)}s, but the master is ${masterDuration.toFixed(2)}s starting at ` +
      `${start}s, which needs ${needs.toFixed(2)}s. The archive is a different take, not this one ` +
      `untrimmed`
    );
  }
  const tailAlsoCut = archiveDuration - needs;
  return {
    assetId: archivedAssetId, kind: "archive", offset: start, duration: archiveDuration,
    reconciled:
      `archive ${archiveDuration.toFixed(2)}s holds a ${masterDuration.toFixed(2)}s master at ` +
      `${start}s (needs ${needs.toFixed(2)}s)` +
      (Math.abs(tailAlsoCut) > 1.0
        ? `; the remaining ${tailAlsoCut.toFixed(2)}s is a prior tail cut the old ledger did not record`
        : "") +
      `; master t maps to archive t + ${start}`,
  };
}

/** One reading of one asset, at the 10-second window, with mahaloEnd derived. */
async function measure(playbackId: string, duration: number): Promise<Measured> {
  const e: Ends = await readEnds(video(), playbackId, duration, WINDOW, MODEL, WORK);
  return {
    assetDuration: Number(duration.toFixed(3)),
    leadIn: e.leadIn, tailAfterLast: e.tailAfterLast,
    firstWord: e.firstWord, lastWord: e.lastWord,
    mahaloEnd: e.tailAfterLast == null ? null : Number((duration - e.tailAfterLast).toFixed(3)),
    headHeard: e.headHeard, tailHeard: e.tailHeard, note: e.note,
  };
}

/** Rows whose counts must not move. A trim replaces an asset; it must not touch
 *  anybody's progress, and the only way to know is to count. */
async function witnessCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of ["module_completion", "content_progress", "watch_gate"]) {
    const { count, error } = await db().from(t).select("*", { count: "exact", head: true });
    out[t] = error ? -1 : (count ?? -1);
  }
  const { count: pub } = await db().from("content").select("*", { count: "exact", head: true })
    .eq("type", "advisor_video").eq("status", "published").is("retired_at", null);
  out["published_films"] = pub ?? -1;
  return out;
}

/* ---- --plan: write down who is in the run, and what the master is now ----- */
async function buildPlan() {
  const { rows, tableCount } = parseReport(readFileSync(REPORT, "utf8"));
  console.log(`\n  ${REPORT}: ${tableCount} films on Ryan's list, ${rows.length} sections — they agree.`);

  for (const r of rows) {
    const { data } = await db().from("content")
      .select("mux_asset_id, status, retired_at, duration_sec, vertical_status")
      .eq("id", r.id).maybeSingle();
    const row = data as unknown as {
      mux_asset_id: string | null; status: string; retired_at: string | null;
      duration_sec: number | null; vertical_status: string | null;
    } | null;
    if (!row) { r.because += " — NO SUCH ROW"; continue; }
    r.masterAssetId = row.mux_asset_id;
    if (row.status !== "published" || row.retired_at) {
      r.because += ` — not published now (status=${row.status}, retired_at=${row.retired_at})`;
    }
  }

  const tally: Record<string, number> = {};
  for (const r of rows) tally[r.rule] = (tally[r.rule] ?? 0) + 1;

  /*
   * ---- THE BRIEF STATED THE COUNTS, SO THE PARSE HAS TO REPRODUCE THEM -----
   *
   * Ryan's brief says 33 / 13 / 5 / 6 / 3 / 2. Those are a claim about coverage,
   * and a parse that silently produced 32 and 14 would read exactly like a parse
   * that worked. So the expected shape is written down and a mismatch exits
   * non-zero: this is the one moment the script knows enough to catch a
   * misreading of the report, and it must be loudest here rather than quietest.
   */
  const EXPECTED: Record<Rule, number> = {
    "tail-cut": 33, "tail-pass": 13, "head-pass": 5, "head-cut": 6, reread: 3, unpublish: 2,
  };
  const wrong = (Object.keys(EXPECTED) as Rule[])
    .filter((k) => (tally[k] ?? 0) !== EXPECTED[k])
    .map((k) => `${k}: brief says ${EXPECTED[k]}, the report parses to ${tally[k] ?? 0}`);
  if (wrong.length) {
    console.error(`\n  the brief and the report disagree about who is on the list:`);
    for (const x of wrong) console.error(`    ${x}`);
    console.error(`  Two documents disagreeing about the same fact is the bug. Nothing written.\n`);
    process.exit(1);
  }

  writeFileSync(PLAN, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    from: REPORT,
    pads: { padHead: PAD_HEAD, padTail: PAD_TAIL },
    window: WINDOW,
    reconcileTolerance: RECONCILE_TOLERANCE,
    ceilings: { head: HEAD_CEILING, tail: TAIL_CEILING },
    tally, rows,
  }, null, 1)}\n`);
  console.log(`\n  ${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join("   ")}`);
  console.log(`  wrote ${PLAN}\n`);
}

/* ---- --reread: the three the 447 reading could not read ------------------- */
/**
 * One more read at 10 seconds, on the master this time, and then whichever of
 * Ryan's rules fits what comes back. No third read: a film that cannot be read
 * twice is left alone and listed, which is the brief's own instruction and the
 * honest answer — nothing is known about it, so nothing is done to it.
 */
async function reread() {
  const plan = JSON.parse(readFileSync(PLAN, "utf8")) as {
    rows: PlanRow[]; tally: Record<string, number>; [k: string]: unknown;
  };
  const targets = plan.rows.filter((r) => r.rule === "reread");
  console.log(`\n  trim:last-batch --reread — ${targets.length} film(s), 10s window, on the master\n`);

  for (const r of targets) {
    console.log(`  ──────── ${r.title}`);
    try {
      const { data } = await db().from("content")
        .select("mux_asset_id, mux_playback_id, status, retired_at").eq("id", r.id).maybeSingle();
      const cur = data as unknown as {
        mux_asset_id: string | null; mux_playback_id: string | null; status: string; retired_at: string | null;
      } | null;
      if (!cur?.mux_asset_id || !cur.mux_playback_id) throw new Error("row has no master asset");
      r.masterAssetId = cur.mux_asset_id;
      const srcAsset = await video().video.assets.retrieve(cur.mux_asset_id);
      if (srcAsset.duration == null) throw new Error("master reports no duration");
      const m = await measure(cur.mux_playback_id, srcAsset.duration);
      console.log(`           master ${srcAsset.duration.toFixed(2)}s  leadIn ${m.leadIn ?? "—"}  ` +
        `first "${m.firstWord ?? "—"}"  last "${m.lastWord ?? "—"}"  tail ${m.tailAfterLast ?? "—"}`);
      if (m.note) console.log(`           note: ${m.note}`);

      const tailKnown = m.tailAfterLast != null && strip(m.lastWord ?? "") === "mahalo";
      const headKnown = m.leadIn != null;

      if (tailKnown && m.tailAfterLast! > TAIL_CEILING) {
        r.rule = "tail-cut";
        r.reportSecond = m.mahaloEnd;
        r.reportTail = m.tailAfterLast;
        r.reportSecondFrom = "master re-read, not independent";
        r.because = `re-read on the master: runs ${m.tailAfterLast!.toFixed(2)}s past its Mahalo; cut at that Mahalo + ${PAD_TAIL}s`;
      } else if (headKnown && m.leadIn! > 0.1 && strip(m.firstWord ?? "") !== "aloha") {
        r.rule = "head-cut";
        r.reportSecond = m.leadIn;
        r.reportSecondFrom = "master re-read, not independent";
        r.because = `re-read on the master: ${m.leadIn!.toFixed(2)}s of air before anything sounds` +
          (m.firstWord == null ? ` and whisper decodes no word in the head window` : ` and it opens "${m.firstWord}"`) +
          `; cut at the onset - ${PAD_HEAD}s`;
      } else if (tailKnown || headKnown) {
        r.rule = tailKnown && headKnown ? "tail-pass" : "reread";
        r.because = `re-read on the master: head ${m.leadIn ?? "—"}s, tail ${m.tailAfterLast ?? "—"}s — ` +
          `nothing outside the standard, so it is left as it is`;
      } else {
        r.because = `re-read on the master FAILED the same way (${m.note ?? "no reading"}) — ` +
          `left alone and listed; no third read`;
      }
      r.rereadNote = m.note ?? undefined;
      console.log(`           -> ${r.rule}: ${r.because}`);
    } catch (e) {
      r.because = `re-read FAILED: ${e instanceof Error ? e.message : String(e)} — left alone and listed`;
      r.rereadNote = e instanceof Error ? e.message : String(e);
      console.log(`           -> reread (unchanged): ${r.because}`);
    }
  }

  const tally: Record<string, number> = {};
  for (const r of plan.rows) tally[r.rule] = (tally[r.rule] ?? 0) + 1;
  plan.tally = tally;
  plan.rereadAt = new Date().toISOString();
  writeFileSync(PLAN, `${JSON.stringify(plan, null, 1)}\n`);
  console.log(`\n  ${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join("   ")}`);
  console.log(`  rewrote ${PLAN}\n`);
}

/* ---- --find-aloha -------------------------------------------------------- */
/**
 * For a film that opens on a stray word BEFORE the greeting.
 *
 * Ryan's ruling, 9 October: a word before the greeting is what the head rule
 * removes, not a different rule. So the anchor is the Aloha rather than the
 * energy onset — on these two films the energy onset is 0.000s, because the
 * stray word is already sounding when the asset begins.
 *
 * ---------------------------------------------------------------------------
 * WHISPER SAYS WHICH WORD; ENERGY STILL SAYS WHERE IT STARTS
 * ---------------------------------------------------------------------------
 * The obvious implementation — cut at whisper's "Aloha" timestamp minus 0.3s —
 * is the one that already went wrong once in this project. trim-recut.ts exists
 * because the apply pass cut at `alohaAt - 0.3` and whisper's word timestamps
 * "land fractionally INSIDE the first phoneme"; trim-slates.ts uses 0.35 for
 * the same reason, and trim:recut defaults to 0.6.
 *
 * So whisper is asked only WHICH word and roughly where, and the cut is taken
 * from the ENERGY onset of the sound region that word falls in — the start of
 * the audible Aloha, from silencedetect, which cannot land inside a phoneme.
 * Then 0.3s in front of that is a real 0.3s of air.
 *
 * `reports/trim-plan.json` already recorded this as the house anchor —
 * "min(energy onset, whisper aloha) - 0.3s" — and these two films are exactly
 * where that formula breaks: the minimum is the stray word at 0.000s. The fix
 * is not a different pad, it is asking energy about the right region.
 */
async function findAloha() {
  const plan = JSON.parse(readFileSync(PLAN, "utf8")) as {
    rows: PlanRow[]; tally: Record<string, number>; [k: string]: unknown;
  };
  const want = ONLY ? ONLY.split(",").map((s) => s.trim()).filter(Boolean) : [];
  if (!want.length) {
    console.error(`\n  --find-aloha needs --only=<id>[,<id>] — it is a per-film ruling, not a sweep.\n`);
    process.exit(1);
  }
  const targets = plan.rows.filter((r) => want.some((w) => r.id === w || r.id.startsWith(w)));
  if (targets.length !== want.length) {
    console.error(`\n  asked for ${want.length} film(s), the plan matched ${targets.length}. Refusing.\n`);
    process.exit(1);
  }
  console.log(`\n  trim:last-batch --find-aloha — ${targets.length} film(s)`);
  console.log(`  anchor: the ENERGY onset of the sound region whisper puts "Aloha" in, minus ${PAD_HEAD}s\n`);

  for (const r of targets) {
    console.log(`  ──────── ${r.title}`);
    try {
      const { data } = await db().from("content")
        .select("mux_asset_id, mux_playback_id, status, retired_at").eq("id", r.id).maybeSingle();
      const cur = data as unknown as {
        mux_asset_id: string | null; mux_playback_id: string | null; status: string; retired_at: string | null;
      } | null;
      if (!cur?.mux_asset_id || !cur.mux_playback_id) throw new Error("row has no master asset");
      if (cur.status !== "published" || cur.retired_at) throw new Error("row is not published");
      r.masterAssetId = cur.mux_asset_id;
      const asset = await video().video.assets.retrieve(cur.mux_asset_id);
      if (asset.duration == null) throw new Error("master reports no duration");

      const found = await alohaOnset(cur.mux_playback_id, asset.duration);
      console.log(`           whisper puts "Aloha" at ~${n(found.whisperStart, 3)}s in "${found.heard.slice(0, 70)}…"`);
      console.log(`           sound regions begin at: ${found.onsets.map((o) => o.toFixed(3)).join(", ")}`);
      console.log(`           candidates tested: ${found.tried.join("  |  ")}`);
      console.log(`           energy onset that opens on "Aloha": ${n(found.energyOnset, 3)}s`);

      if (found.energyOnset <= 0.1) {
        throw new Error(
          `the Aloha's own sound region starts at ${n(found.energyOnset, 3)}s, so there is nothing ` +
            `before the greeting to remove — this film does not match the ruling`
        );
      }
      const start = Math.max(0, Number((found.energyOnset - PAD_HEAD).toFixed(2)));
      r.rule = "head-cut";
      r.reportSecond = Number(found.energyOnset.toFixed(3));
      r.reportSecondFrom = "master re-read, not independent";
      /* The gate must assert the film now OPENS on the greeting. A head cut
         that merely leaves 0.3s of air would be satisfied by still opening on
         the stray word, which is the whole thing being removed. */
      r.expectFirstWord = "aloha";
      r.because =
        `**Ryan's ruling, 9 October: a word before the greeting is what the head rule removes.** ` +
        `The master opens on sound at 0.00s with the stray word "${r.reportOpens}", then the greeting. ` +
        `Whisper puts "Aloha" at ~${n(found.whisperStart, 2)}s; the energy onset of the region it falls in ` +
        `is ${n(found.energyOnset, 3)}s, and the cut is that minus the ${PAD_HEAD}s pad — ` +
        `taken from energy, not from whisper, because a whisper timestamp sits inside the first phoneme ` +
        `and cutting 0.3s off one is what trim:recut had to be written to undo.`;
      console.log(`           -> head-cut at ${start} (anchor ${n(found.energyOnset, 3)} - ${PAD_HEAD}), must open on "Aloha"\n`);
    } catch (e) {
      console.log(`           FAILED — ${e instanceof Error ? e.message : String(e)}`);
      console.log(`           left as ${r.rule}\n`);
    }
  }

  const tally: Record<string, number> = {};
  for (const r of plan.rows) tally[r.rule] = (tally[r.rule] ?? 0) + 1;
  plan.tally = tally;
  plan.alohaAnchoredAt = new Date().toISOString();
  writeFileSync(PLAN, `${JSON.stringify(plan, null, 1)}\n`);
  console.log(`  ${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join("   ")}`);
  console.log(`  rewrote ${PLAN}\n`);
}

/**
 * Where the audible "Aloha" starts in an asset's head, by both instruments.
 *
 * Returns the energy onset of the sound region whisper found the word in, which
 * is the only number here safe to cut 0.3s in front of.
 */
async function alohaOnset(
  playbackId: string,
  duration: number
): Promise<{
  energyOnset: number; whisperStart: number; onsets: number[]; heard: string; tried: string[];
}> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { mkdirSync, rmSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { randomUUID } = await import("node:crypto");
  const run = promisify(execFile);

  mkdirSync(WORK, { recursive: true });
  const tag = randomUUID().slice(0, 8);
  const wav = join(WORK, `${tag}-aloha.wav`);
  const man = join(WORK, `${tag}-aloha-man.json`);
  const out = join(WORK, `${tag}-aloha-out.json`);
  const w = Math.min(ALOHA_WINDOW, duration);

  try {
    const token = await video().jwt.signPlaybackId(playbackId, { type: "video", expiration: "3600s" });
    const hls = `https://stream.mux.com/${playbackId}.m3u8?token=${token}`;
    await run("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error",
      "-t", w.toFixed(3), "-i", hls, "-vn", "-ac", "1", "-ar", "16000", "-y", wav],
      { maxBuffer: 1 << 24 });
    const { stdout: probe } = await run("ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav]);
    const got = Number(probe.trim());
    if (!Number.isFinite(got) || got < w - 0.75) {
      throw new Error(`partial pull: came back ${got.toFixed(2)}s of ${w.toFixed(2)}s`);
    }

    /* ---- every point where sound STARTS in the window, by energy -------- */
    let stderr = "";
    try {
      const res = await run("ffmpeg",
        ["-hide_banner", "-i", wav, "-af", "silencedetect=noise=-40dB:d=0.05", "-f", "null", "-"],
        { maxBuffer: 1 << 24 });
      stderr = `${res.stderr ?? ""}${res.stdout ?? ""}`;
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string };
      stderr = `${err.stderr ?? ""}${err.stdout ?? ""}`;
    }
    const silenceStarts = [...stderr.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
    const silenceEnds = [...stderr.matchAll(/silence_end:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
    /* A sound region begins at 0 when the window opens on sound, and at every
       silence_end thereafter. These two films open on sound, which is exactly
       why their energy onset reads 0.000 and why that number is useless here. */
    const opensOnSound = !(silenceStarts.length && silenceStarts[0] <= 0.02);
    const onsets = [...(opensOnSound ? [0] : []), ...silenceEnds].sort((a, b) => a - b);

    /* ---- which word, and roughly where, from whisper ------------------- */
    writeFileSync(man, JSON.stringify({
      jobs: [{ key: "x", headWav: wav, tailWav: wav, tailOffset: 0 }],
    }, null, 1));
    const py = existsSync(".venv-whisper/bin/python3") ? ".venv-whisper/bin/python3" : "python3";
    try {
      await run(py, ["scripts/trim-words.py", `--manifest=${man}`, `--out=${out}`, `--model=${MODEL}`],
        { maxBuffer: 1 << 24 });
    } catch { /* per-film errors live in the output file */ }
    if (!existsSync(out)) throw new Error("the whisper worker wrote nothing");
    const rec = (JSON.parse(readFileSync(out, "utf8")) as Record<string, {
      headWords?: { word: string; start: number; end: number }[]; headHeard: string; errors?: string[];
    }>)["x"];
    if (!rec) throw new Error("no record for this asset");
    const words = rec.headWords ?? [];
    if (!words.length) throw new Error("whisper decoded no words in the head window");
    const idx = words.findIndex((x) => strip(x.word) === "aloha");
    if (idx < 0) {
      throw new Error(
        `no "Aloha" in the first ${w.toFixed(0)}s — heard "${(rec.headHeard ?? "").slice(0, 90)}"`
      );
    }
    if (idx === 0) throw new Error(`"Aloha" is already the first word, so there is nothing before it`);
    const whisperStart = words[idx].start;

    /*
     * ---- THE CANDIDATE IS TESTED, NOT TRUSTED --------------------------
     *
     * The first build picked "the last energy onset at or just before whisper's
     * timestamp" and got `Lasting Impressions, Part 12` wrong. Whisper placed
     * its "Aloha" at 0.360s, which selected the 0.509s region — while the
     * energy shows a silence running from just after 0.509 to 2.152s, and the
     * 447 report independently put the second to look at near 2.04s.
     *
     * The reason is the same trap one level down: whisper ANCHORS the first
     * word of a window to 0.00 and compresses what follows, so its absolute
     * positions in a window that opens on sound are not measurements. It was
     * trusted for WHICH word, correctly, and then quietly for WHERE, which is
     * the thing it cannot do.
     *
     * So each candidate onset is TESTED: pull a short window starting exactly
     * there and ask whisper what the first word is. The right anchor is the one
     * whose window opens on "Aloha". Whisper is used only for word identity,
     * which is what it is good at, and the answer is verified before a single
     * frame is cut rather than after.
     */
    /*
     * ORDER BY THE PAUSE IN FRONT, NOT BY WHISPER'S GUESS.
     *
     * Ordering candidates by nearness to whisper's timestamp got `Lasting
     * Impressions, Part 12` wrong a second time, and the test did not catch it:
     * whisper's 0.360s selected the 0.249s onset, a 4-second window from there
     * contains the tail of "Prospect" AND the greeting, and whisper dropped the
     * fragment and reported "Aloha," as the first word. A passing test for the
     * wrong anchor, which would have cut 0.249s off a film that needs 1.85s off.
     *
     * The structure these films actually have is: stray word, a real pause,
     * then the greeting. So the greeting is the onset with the LONGEST SILENCE
     * in front of it — 1.55s on Part 12, against the 0.05–0.2s dips inside the
     * stray word — and onsets preceded by less than a quarter second are not
     * word boundaries at all, they are energy dips inside one.
     *
     * Candidates are still each tested by pulling from them, so the ordering
     * only decides what is tried first. What makes the test meaningful is that
     * a correct anchor has nothing but the greeting after it.
     */
    const gaps: { onset: number; pause: number }[] = [];
    for (const o of onsets) {
      if (o <= 0.1) continue;
      /* the silence that ENDS at this onset */
      let pause = 0;
      for (let i = 0; i < silenceEnds.length; i++) {
        if (Math.abs(silenceEnds[i] - o) < 0.001 && silenceStarts[i] != null) {
          pause = silenceEnds[i] - silenceStarts[i];
          break;
        }
      }
      gaps.push({ onset: o, pause });
    }
    const MIN_PAUSE = 0.25;
    const ordered = gaps
      .filter((g) => g.pause >= MIN_PAUSE)
      .sort((a, b) => b.pause - a.pause)
      .slice(0, 6);
    if (!ordered.length) {
      throw new Error(
        `no sound region in the first ${w.toFixed(0)}s is preceded by ${MIN_PAUSE}s of silence, so there ` +
          `is no word boundary to anchor on — this film needs a human ear`
      );
    }
    const tried: string[] = [];
    for (const g of ordered) {
      const first = await firstWordAt(playbackId, g.onset, 4);
      tried.push(`${g.onset.toFixed(3)}s (after ${g.pause.toFixed(2)}s of silence) -> "${first ?? "—"}"`);
      if (first != null && strip(first) === "aloha") {
        return { energyOnset: g.onset, whisperStart, onsets, heard: rec.headHeard ?? "", tried };
      }
    }
    throw new Error(
      `no sound region opens on "Aloha". Tried: ${tried.join("; ")}. ` +
        `Whisper placed the word at ${whisperStart.toFixed(3)}s in the full head window, but that is a ` +
        `word identity and not a position — this film needs a human ear, not a wider tolerance`
    );
  } finally {
    for (const f of [wav, man, out]) rmSync(f, { force: true });
  }
}

/**
 * The first word of an asset starting exactly at `from`, by whisper.
 *
 * Used to TEST a candidate cut point before anything is cut. Whisper is asked
 * only which word it is — its position within this window is deliberately
 * ignored, because anchoring the first word of a window to 0.00 is precisely
 * the behaviour that made the candidate need testing in the first place.
 */
async function firstWordAt(playbackId: string, from: number, secs: number): Promise<string | null> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { mkdirSync, rmSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { randomUUID } = await import("node:crypto");
  const run = promisify(execFile);

  mkdirSync(WORK, { recursive: true });
  const tag = randomUUID().slice(0, 8);
  const wav = join(WORK, `${tag}-c.wav`);
  const man = join(WORK, `${tag}-c-man.json`);
  const out = join(WORK, `${tag}-c-out.json`);
  try {
    const token = await video().jwt.signPlaybackId(playbackId, { type: "video", expiration: "3600s" });
    const hls = `https://stream.mux.com/${playbackId}.m3u8?token=${token}`;
    await run("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error",
      "-ss", from.toFixed(3), "-t", secs.toFixed(3), "-i", hls,
      "-vn", "-ac", "1", "-ar", "16000", "-y", wav], { maxBuffer: 1 << 24 });
    writeFileSync(man, JSON.stringify({
      jobs: [{ key: "x", headWav: wav, tailWav: wav, tailOffset: 0 }],
    }, null, 1));
    const py = existsSync(".venv-whisper/bin/python3") ? ".venv-whisper/bin/python3" : "python3";
    try {
      await run(py, ["scripts/trim-words.py", `--manifest=${man}`, `--out=${out}`, `--model=${MODEL}`],
        { maxBuffer: 1 << 24 });
    } catch { /* per-film errors live in the output file */ }
    if (!existsSync(out)) return null;
    const rec = (JSON.parse(readFileSync(out, "utf8")) as Record<string, {
      headWords?: { word: string }[];
    }>)["x"];
    return rec?.headWords?.[0]?.word ?? null;
  } catch {
    return null;
  } finally {
    for (const f of [wav, man, out]) rmSync(f, { force: true });
  }
}

/* ---- --verify-rows ------------------------------------------------------- */
/**
 * Read every cut film's row back and check it against the ledger.
 *
 * The swap's own return value is not the evidence that the swap happened, and
 * neither is the ledger — the ledger is what this run BELIEVES. This asks the
 * database, for every film, whether the master is the clip that was verified,
 * whether the old master was archived, and whether the crop was marked stale.
 */
async function verifyRows() {
  const ledger: Record<string, Entry> = JSON.parse(readFileSync(LEDGER, "utf8"));
  /*
   * The LEDGER KEY is the master that was replaced — that is the whole point of
   * keying on it — so it is the authority here, and `masterAssetId` is a
   * convenience copy. The first film this batch cut was written before that
   * field existed, and reading the field alone reported it as a mismatch
   * against `undefined` while the row was perfectly correct. A verifier that
   * fails on its own schema change is noise in the one place that has to be
   * trustworthy.
   */
  const cut = Object.entries(ledger)
    .filter(([, e]) => e.verdict === "cut")
    .map(([key, e]) => ({ ...e, masterAssetId: e.masterAssetId ?? key }));
  console.log(`\n  trim:last-batch --verify-rows — ${cut.length} cut film(s), read back from the database\n`);

  let bad = 0;
  let stale = 0;
  const sec = { before: 0, after: 0 };
  for (const e of cut) {
    const { data } = await db().from("content")
      .select("mux_asset_id, archived_asset_id, vertical_status, duration_sec, status, retired_at")
      .eq("id", e.contentId).maybeSingle();
    const row = data as unknown as {
      mux_asset_id: string | null; archived_asset_id: string | null;
      vertical_status: string | null; duration_sec: number | null;
      status: string; retired_at: string | null;
    } | null;
    const wantDur = Math.round(e.measuredAfter?.assetDuration ?? -1);
    const checks: string[] = [];
    if (!row) checks.push("the row has gone");
    else {
      if (row.mux_asset_id !== e.newAssetId) checks.push(`master is ${row.mux_asset_id?.slice(0, 12)}…, ledger says ${e.newAssetId?.slice(0, 12)}…`);
      if (row.archived_asset_id !== e.masterAssetId) checks.push(`archived is ${row.archived_asset_id?.slice(0, 12)}…, expected the master it replaced`);
      if (row.vertical_status !== "stale") checks.push(`vertical_status is ${row.vertical_status}, expected stale`);
      if (row.duration_sec !== wantDur) checks.push(`duration_sec is ${row.duration_sec}, the verified clip was ${wantDur}`);
      if (row.status !== "published" || row.retired_at) checks.push(`status ${row.status} retired_at ${row.retired_at}`);
      if (row.vertical_status === "stale") stale++;
    }
    sec.before += e.measuredBefore?.assetDuration ?? 0;
    sec.after += e.measuredAfter?.assetDuration ?? 0;
    if (checks.length) { bad++; console.log(`  *** ${e.title}\n        ${checks.join("\n        ")}`); }
  }
  console.log(`  rows that match the ledger exactly: ${cut.length - bad} of ${cut.length}`);
  console.log(`  verticals marked stale:             ${stale} of ${cut.length}`);
  console.log(`  removed: ${(sec.before - sec.after).toFixed(1)}s across ${cut.length} films ` +
    `(${((sec.before - sec.after) / 60).toFixed(1)} minutes)`);
  console.log("");
  if (bad) process.exit(1);
}

/* ---- --replan-from-master ------------------------------------------------ */
/**
 * For the films where the master and the 447 report disagree about where to
 * cut, by more than the reconcile tolerance.
 *
 * THE MASTER WINS, AND THE REASON IS NOT THAT IT IS NEWER. The 447 reading was
 * taken once, on the served rendition. The reading this batch takes is on the
 * master, and on `After-MPI, Part 2` it was corroborated by reading the
 * VERTICAL too: master 0.27s of air after Mahalo, vertical 0.29s, against the
 * report's 2.00s. Two readings of two renditions agreeing with each other beat
 * one reading that neither reproduces.
 *
 * That difference is not academic. The report put `After-MPI, Part 2`'s Mahalo
 * at 165.81s and the master puts it at 167.50s, so cutting on the report's
 * number plus the pad would have ended the film at 166.51s — about a second
 * INTO the word "Mahalo". Six films were in that position.
 *
 * So each one is re-decided on its own master reading, against the library's
 * 1.5s tail standard and Ryan's "is there air at the head" question, and the
 * plan row records that its number is no longer independently corroborated.
 */
async function replanFromMaster() {
  const plan = JSON.parse(readFileSync(PLAN, "utf8")) as {
    rows: PlanRow[]; tally: Record<string, number>; [k: string]: unknown;
  };
  const ledger: Record<string, Entry> = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : {};
  const byContent = new Map<string, Entry>();
  for (const e of Object.values(ledger)) byContent.set(e.contentId, e);

  const stuck = plan.rows.filter((r) => {
    const e = byContent.get(r.id);
    return e?.verdict === "failed" && /disagree by/.test(e.note ?? "") && e.measuredBefore != null;
  });
  console.log(`\n  trim:last-batch --replan-from-master — ${stuck.length} film(s) the report and the master disagree about\n`);

  for (const r of stuck) {
    const e = byContent.get(r.id)!;
    const m = e.measuredBefore!;
    const was = r.rule;
    console.log(`  ──────── ${r.title}  (${was})`);
    console.log(`           master: ${n(m.leadIn)}s air, "${m.firstWord ?? "—"}" … "${m.lastWord ?? "—"}", ${n(m.tailAfterLast)}s after`);
    console.log(`           report said ${r.reportSecond}s, the master says ${was === "tail-cut" ? n(m.mahaloEnd) : n(m.leadIn)}s`);

    const previously = `the 447 report put this at ${r.reportSecond}s and the master reads ` +
      `${was === "tail-cut" ? n(m.mahaloEnd) : n(m.leadIn)}s — a ${n(e.reconcileGap)}s disagreement the master wins`;

    if (was === "tail-cut") {
      if ((m.tailAfterLast ?? 0) > TAIL_CEILING) {
        r.rule = "tail-cut";
        r.reportSecond = m.mahaloEnd;
        r.reportTail = m.tailAfterLast;
        r.reportSecondFrom = "master re-read, not independent";
        r.because = `${previously}. On the master it still runs ${n(m.tailAfterLast)}s past its Mahalo, ` +
          `which is over the ${TAIL_CEILING}s standard, so it is cut at that Mahalo + ${PAD_TAIL}s.`;
      } else {
        r.rule = "tail-pass";
        r.reportSecond = m.tailAfterLast;
        r.reportCloses = null;
        r.reportSecondFrom = "master re-read, not independent";
        r.because = `${previously}. On the master the tail is ${n(m.tailAfterLast)}s, inside the ` +
          `${TAIL_CEILING}s standard, so there is nothing to cut. The report's number is not reproducible here.`;
      }
    } else {
      if ((m.leadIn ?? 0) > 0.1) {
        r.rule = "head-cut";
        r.reportSecond = m.leadIn;
        r.reportSecondFrom = "master re-read, not independent";
        r.because = `${previously}. The master opens after ${n(m.leadIn)}s of air, so it is cut at the onset - ${PAD_HEAD}s.`;
      } else {
        r.rule = "head-pass";
        r.reportSecond = m.leadIn;
        r.reportSecondFrom = "master re-read, not independent";
        r.because = `${previously}. **The master opens on sound at ${n(m.leadIn)}s — there is no dead air to ` +
          `remove.** What it opens on is a stray word, "${m.firstWord ?? "—"}", before the Aloha. Removing ` +
          `that is a cut at the Aloha, which is a different decision from the one this batch was given, ` +
          `so the film is left alone and the finding is Ryan's to rule on.`;
      }
    }
    console.log(`           ${was} -> ${r.rule}`);
    console.log(`           ${r.because}\n`);
  }

  const tally: Record<string, number> = {};
  for (const r of plan.rows) tally[r.rule] = (tally[r.rule] ?? 0) + 1;
  plan.tally = tally;
  plan.replannedAt = new Date().toISOString();
  writeFileSync(PLAN, `${JSON.stringify(plan, null, 1)}\n`);
  console.log(`  ${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join("   ")}`);
  console.log(`  rewrote ${PLAN}\n`);
}

/* ---- --unpublish: 2748 and 2821 ------------------------------------------ */
/**
 * The two takes that were never finished. Not a trim — there is no sign-off to
 * cut to — so they leave publication with the reason on the row, and the row
 * survives to receive Mitch's reshoot in place.
 *
 * `status = 'draft'` is what "published = false" means in this schema: the
 * boolean `published` from 0001 is on `content_item`, not `content`, and
 * `content.status` is an enum that rejects every value but draft and published.
 * 0162 carries the whole argument and is the permanent record; this is the same
 * change applied through the service role so the count can be proved to move in
 * this run rather than at the next push.
 *
 * Every number here is read back from the database, before and after.
 */
async function unpublish() {
  const plan = JSON.parse(readFileSync(PLAN, "utf8")) as { rows: PlanRow[] };
  const targets = plan.rows.filter((r) => r.rule === "unpublish");
  if (targets.length !== 2) {
    console.error(`\n  expected 2 films to unpublish, the plan has ${targets.length}. Refusing.\n`);
    process.exit(1);
  }
  const REASONS: Record<string, string> = {
    "d0b1084d-db49-4c5e-b608-9fb594355861":
      "Unpublished 9 October 2026: the take was never finished — it ends mid-sentence on " +
      '"and build off", so there is no sign-off to trim to. Mitch reshoots; the reshoot ' +
      "replaces this row in place and it returns to published then. Not retired — the film " +
      "is coming, not gone.",
    "fe35f2ea-2fa7-4b07-acca-ea16e2e2c8c7":
      "Unpublished 9 October 2026: the take was never finished — it ends on an outtake and " +
      "the last ten seconds decode no words at all. Its vertical was already stale because " +
      "the crop disagreed with the master by 2.889s. Mitch reshoots; the reshoot replaces " +
      "this row in place.",
  };

  const countPublished = async () => {
    const { count } = await db().from("content").select("*", { count: "exact", head: true })
      .eq("type", "advisor_video").eq("status", "published").is("retired_at", null);
    return count ?? -1;
  };
  /* The certification numbers, before and after the recompute, so "I ran it" is
     not the evidence that anything happened. */
  const certs = async () => {
    const { data } = await db().from("certification").select("id, name, item_count, active").order("name");
    return (data ?? []) as unknown as { id: string; name: string; item_count: number; active: boolean }[];
  };

  const before = await countPublished();
  const certsBefore = await certs();
  console.log(`\n  trim:last-batch --unpublish ${APPLY ? "" : "— REPORT ONLY"}`);
  console.log(`  published advisor_video, unretired, BEFORE: ${before}`);

  for (const r of targets) {
    const { data } = await db().from("content")
      .select("id, title, status, retired_at, library_reason, mileage_rung, placement, mux_asset_id, vertical_status")
      .eq("id", r.id).maybeSingle();
    const row = data as unknown as Record<string, unknown> | null;
    console.log(`\n    ${r.title}`);
    console.log(`      now: status=${row?.status} retired_at=${row?.retired_at} library_reason=${row?.library_reason ?? "null"}`);
    /* What else is on this rung? A rung with no published film left would be a
       rung the shelf can no longer claim, and the shelf discovers its rungs
       from the films that exist. Counted, not assumed. */
    const { count: rung } = await db().from("content").select("*", { count: "exact", head: true })
      .eq("mileage_rung", row?.mileage_rung as number).eq("status", "published").is("retired_at", null);
    console.log(`      rung ${row?.mileage_rung}: ${rung} published films now, ${(rung ?? 1) - 1} after this`);
    if ((rung ?? 1) - 1 <= 0) {
      console.error(`      REFUSING: this would empty rung ${row?.mileage_rung} — the shelf would lose a rung.`);
      process.exit(1);
    }
  }

  if (!APPLY) { console.log(`\n  --apply to write. Nothing changed.\n`); return; }

  /*
   * The client is built without a generated Database type, so `update` infers
   * its argument as `never`. Cast the TABLE BUILDER, not the client — the same
   * shape of fix 0.trim-recut needed for `rpc`, and for the same reason: pulling
   * the method off the object loses its `this`.
   *
   * Both updates carry a WHERE. Supabase runs pg_safeupdate for the API roles,
   * so a WHERE-less UPDATE throws for every PostgREST caller even though it
   * applies fine as `postgres` — this project has already paid for that one.
   */
  type Upd = { update: (v: Record<string, unknown>) => {
    in: (c: string, v: string[]) => Promise<{ error: { message: string } | null }>;
    eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
  } };
  const content = () => db().from("content") as unknown as Upd;

  const { error } = await content().update({ status: "draft" }).in("id", targets.map((r) => r.id));
  if (error) throw new Error(`status: ${error.message}`);
  for (const r of targets) {
    const { error: e } = await content().update({ library_reason: REASONS[r.id] }).eq("id", r.id);
    if (e) throw new Error(`library_reason ${r.title}: ${e.message}`);
  }

  /* Read it back. The write's own return value is not the evidence. */
  const { data: back } = await db().from("content")
    .select("id, title, status, retired_at, retired_reason, library_reason, mux_asset_id, mileage_rung, placement, module_id")
    .in("id", targets.map((r) => r.id));
  const rows = (back ?? []) as unknown as Record<string, unknown>[];
  let bad = 0;
  for (const row of rows) {
    const ok = row.status === "draft" && row.retired_at == null && row.library_reason != null
      && row.retired_reason == null && row.mux_asset_id != null;
    if (!ok) bad++;
    console.log(`\n    ${row.title}`);
    console.log(`      status=${row.status}  retired_at=${row.retired_at}  retired_reason=${row.retired_reason}`);
    console.log(`      master kept=${row.mux_asset_id != null}  rung=${row.mileage_rung}  placement=${row.placement}  module=${row.module_id}`);
    console.log(`      reason: ${String(row.library_reason).slice(0, 96)}…`);
    console.log(`      ${ok ? "OK — unpublished, not retired, row otherwise untouched" : "*** NOT WHAT WAS ASKED FOR ***"}`);
  }

  const client = db() as unknown as {
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
  const { error: rpcErr } = await client.rpc("recompute_certification_content", {});
  console.log(`\n  recompute_certification_content(): ${rpcErr ? `ERROR ${rpcErr.message}` : "ran"}`);
  if (rpcErr) bad++;

  const after = await countPublished();
  const certsAfter = await certs();
  console.log(`  published advisor_video, unretired, AFTER:  ${after}   (${after - before})`);
  const movedCerts = certsAfter.filter((c) => {
    const b = certsBefore.find((x) => x.id === c.id);
    return !b || b.item_count !== c.item_count || b.active !== c.active;
  });
  if (movedCerts.length) {
    console.log(`  certifications whose item_count or active changed: ${movedCerts.length}`);
    for (const c of movedCerts) {
      const b = certsBefore.find((x) => x.id === c.id)!;
      console.log(`    ${c.name}: item_count ${b.item_count} -> ${c.item_count}, active ${b.active} -> ${c.active}`);
    }
  } else {
    console.log(`  no certification item_count or active flag moved — both films were attached to no module.`);
  }

  if (after - before !== -2) {
    console.error(`\n  *** the published count moved by ${after - before}, not -2. Something else changed too.\n`);
    process.exit(1);
  }
  if (bad) { console.error(`\n  *** ${bad} row(s) did not come back as asked\n`); process.exit(1); }
  console.log(`\n  published count down by exactly two, both rows intact apart from status and reason.\n`);
}

async function main() {
  requireEnv();
  if (MAKE_PLAN) return buildPlan();
  if (argv.includes("--reread")) return reread();
  if (argv.includes("--find-aloha")) return findAloha();
  if (argv.includes("--verify-rows")) return verifyRows();
  if (argv.includes("--replan-from-master")) return replanFromMaster();
  if (argv.includes("--unpublish")) return unpublish();

  if (!existsSync(PLAN)) {
    console.error(`\n  missing ${PLAN} — run with --plan first\n`);
    process.exit(1);
  }
  const plan = JSON.parse(readFileSync(PLAN, "utf8")) as { rows: PlanRow[]; tally: Record<string, number> };

  /* ---- who gets cut ----------------------------------------------------- */
  let toCut = plan.rows.filter((r) => r.rule === "tail-cut" || r.rule === "head-cut");
  const ledger: Record<string, Entry> = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : {};
  const prior: Record<string, { contentId: string; title: string }> = existsSync(PRIOR_LEDGER)
    ? JSON.parse(readFileSync(PRIOR_LEDGER, "utf8")) : {};

  const skipped: string[] = [];
  toCut = toCut.filter((r) => {
    if (!r.masterAssetId) { skipped.push(`${r.title}: the plan recorded no master asset`); return false; }
    /*
     * Only a COMPLETED cut blocks a retry. A `refused` or `failed` row means no
     * swap happened and the film is untouched, so running it again is safe and
     * is the point — the ledger records attempts, and the double-cut guard is
     * about masters that were actually replaced.
     */
    const seen = ledger[r.masterAssetId];
    if (seen?.verdict === "cut") { skipped.push(`${r.title}: this master was already cut by this batch`); return false; }
    if (prior[r.masterAssetId]) { skipped.push(`${r.title}: this master was cut by the earlier pass`); return false; }
    return true;
  });
  if (ONLY) {
    const want = ONLY.split(",").map((s) => s.trim()).filter(Boolean);
    toCut = toCut.filter((r) => want.some((w) => r.id === w || r.id.startsWith(w)));
  }
  if (LIMIT) toCut = toCut.slice(0, LIMIT);

  console.log(`\n  trim:last-batch ${APPLY ? "" : "— REPORT ONLY, nothing will be cut"}`);
  console.log(`  ${Object.entries(plan.tally).map(([k, v]) => `${k} ${v}`).join("   ")}`);
  console.log(`  ${toCut.length} film(s) to cut in this run` +
    `  (tail ${toCut.filter((r) => r.rule === "tail-cut").length}, head ${toCut.filter((r) => r.rule === "head-cut").length})`);
  if (skipped.length) {
    console.log(`\n  not in this run (${skipped.length})`);
    for (const s of skipped) console.log(`    ${s}`);
  }

  const w = quietHours();
  console.log(`\n  ${w.ok ? "quiet hours" : "NOT quiet hours"}: ${w.why}`);
  if (!APPLY) { console.log(`\n  --apply to cut. Nothing changed.\n`); return; }
  if (!w.ok && !FORCE_WINDOW) {
    console.error(`\n  REFUSING: a swap under an advisor mid-film costs them their place.\n` +
      `  Run after 21:00 Central, before 05:00, or on a Sunday — or pass --force-window.\n`);
    process.exit(1);
  }
  if (!w.ok && FORCE_WINDOW) {
    /* An override that leaves no trace is not an override anybody can audit
       later, so it goes in every ledger row this run writes. */
    console.log(`  --force-window: overridden deliberately, and recorded on every row.`);
  }
  if (!toCut.length) { console.log(`\n  nothing to do.\n`); return; }

  /* ---- one run at a time ------------------------------------------------- */
  if (existsSync(LOCK) && !argv.includes("--force-unlock")) {
    const held = readFileSync(LOCK, "utf8").trim();
    const alive = (() => { try { process.kill(Number(held), 0); return true; } catch { return false; } })();
    if (alive) {
      console.error(`\n  another run is in progress (pid ${held}). Two at once cut the same film twice.\n`);
      process.exit(1);
    }
    console.log(`  clearing a stale lock from pid ${held}`);
  }
  writeFileSync(LOCK, String(process.pid));
  const release = () => { try { unlinkSync(LOCK); } catch { /* already gone */ } };
  process.on("exit", release);
  process.on("SIGINT", () => { release(); process.exit(130); });
  process.on("SIGTERM", () => { release(); process.exit(143); });

  const before = await witnessCounts();
  console.log(`\n  before: ${Object.entries(before).map(([k, v]) => `${k}=${v}`).join("  ")}\n`);

  /* What the earlier passes took off each film, which is the only thing that
     can map a master-timeline second into its archive's timeline. Later
     ledgers win, because the archive on the row is the most recent one. */
  const priorCuts = new Map<string, { trimStart: number | null; trimEnd: number | null }>();
  /*
   * THREE LEDGERS, OLDEST FIRST, BECAUSE THE LATEST CUT IS THE RIGHT OFFSET.
   * `archived_asset_id` on the row is whatever the MOST RECENT swap replaced,
   * so the head to map by is the most recent one and later files must win.
   *
   * reports/slate-trims.json was the one missed on the first pass, and missing
   * it cost eleven films: they fell back to clipping their own master, which is
   * the clip-of-a-clip defect, and every one came back with its sign-off
   * truncated. It is keyed by CONTENT ID and carries `startTime` rather than
   * `trimStart` — trim:apply built an asset-keyed ledger precisely because this
   * one cannot tell two cuts of the same film apart. For the single question
   * asked here — how much head came off this film — the content id is enough,
   * and resolveSource proves the answer against the archive's real duration
   * before trusting it.
   */
  const SLATE = "reports/slate-trims.json";
  if (existsSync(SLATE)) {
    for (const [contentId, v] of Object.entries(JSON.parse(readFileSync(SLATE, "utf8")) as Record<string, {
      startTime: number | null;
    }>)) {
      priorCuts.set(contentId, { trimStart: v.startTime ?? null, trimEnd: null });
    }
  }
  for (const file of [PRIOR_LEDGER, "reports/trim-recut.json"]) {
    if (!existsSync(file)) continue;
    for (const v of Object.values(JSON.parse(readFileSync(file, "utf8")) as Record<string, {
      contentId: string; trimStart: number | null; trimEnd: number | null; swapped?: boolean;
    }>)) {
      if (v.swapped === false) continue;
      priorCuts.set(v.contentId, { trimStart: v.trimStart, trimEnd: v.trimEnd });
    }
  }
  console.log(`  prior cuts on record: ${priorCuts.size} films (slate-trims, trim-pass, trim-recut)\n`);

  const done: Entry[] = [];
  for (let i = 0; i < toCut.length; i++) {
    const r = toCut[i];
    console.log(`  ──────── [${i + 1}/${toCut.length}] ${r.title}  (${r.rule})`);
    const entry: Entry = {
      contentId: r.id, title: r.title, rule: r.rule,
      masterAssetId: r.masterAssetId!, source: null,
      sourceAssetId: r.masterAssetId!, newAssetId: null,
      trimStart: null, trimEnd: null, padHead: null, padTail: null,
      measuredBefore: null, reportSecond: r.reportSecond, reconcileGap: null,
      measuredAfter: null, swapped: false, verdict: "failed", note: null,
      at: new Date().toISOString(),
    };
    if (!w.ok && FORCE_WINDOW) entry.note = "cut outside quiet hours with --force-window";

    try {
      /* ---- the row still has to be the film the plan described ---------- */
      const { data: cur0, error } = await db().from("content")
        .select("mux_asset_id, mux_playback_id, archived_asset_id, status, retired_at, duration_sec")
        .eq("id", r.id).maybeSingle();
      if (error) throw new Error(`row read: ${error.message}`);
      const cur = cur0 as unknown as {
        mux_asset_id: string | null; mux_playback_id: string | null; archived_asset_id: string | null;
        status: string; retired_at: string | null; duration_sec: number | null;
      } | null;
      if (!cur) throw new Error("content row has gone");
      if (cur.status !== "published" || cur.retired_at) {
        throw new Error(`no longer published (status=${cur.status}, retired_at=${cur.retired_at})`);
      }
      if (!cur.mux_asset_id || !cur.mux_playback_id) throw new Error("row has no master asset");
      if (cur.mux_asset_id !== r.masterAssetId) {
        throw new Error(
          `master changed since the plan (plan ${String(r.masterAssetId).slice(0, 12)}…, ` +
            `row ${cur.mux_asset_id.slice(0, 12)}…) — re-plan rather than cutting on stale offsets`
        );
      }
      if (ledger[cur.mux_asset_id]?.verdict === "cut" || prior[cur.mux_asset_id]) {
        throw new Error("this master has already been replaced by a cut");
      }

      /* ---- measure the MASTER, and reconcile with the report ------------ */
      const srcAsset = await video().video.assets.retrieve(cur.mux_asset_id);
      if (srcAsset.duration == null) throw new Error("master reports no duration");
      const m = await measure(cur.mux_playback_id, srcAsset.duration);
      entry.measuredBefore = m;
      console.log(`           master ${srcAsset.duration.toFixed(2)}s  ${line({
        duration: m.assetDuration, firstWord: m.firstWord, lastWord: m.lastWord,
        leadIn: m.leadIn, tailAfterLast: m.tailAfterLast, whisperFirstStart: null,
        headHeard: "", tailHeard: "", note: null,
      })}`);
      if (m.note) console.log(`           reading note: ${m.note}`);

      let start: number | null = null;
      let end: number | null = null;

      if (r.rule === "tail-cut") {
        if (strip(m.lastWord ?? "") !== "mahalo") {
          throw new Error(
            `the master's last word is "${m.lastWord ?? "—"}", not Mahalo — the report heard one, ` +
              `so the two readings disagree about the thing the cut is anchored on`
          );
        }
        if (m.mahaloEnd == null) throw new Error("no Mahalo end could be derived from the master");
        const gap = r.reportSecond == null ? null : Number(Math.abs(m.mahaloEnd - r.reportSecond).toFixed(3));
        entry.reconcileGap = gap;
        console.log(`           mahaloEnd master ${m.mahaloEnd.toFixed(2)}s  report ${r.reportSecond ?? "—"}s  gap ${gap ?? "—"}`);
        if (gap != null && gap > RECONCILE_TOLERANCE) {
          throw new Error(
            `master and report disagree by ${gap}s about where the Mahalo ends ` +
              `(tolerance ${RECONCILE_TOLERANCE}s) — refusing rather than picking one`
          );
        }
        end = Number(Math.min(srcAsset.duration, m.mahaloEnd + PAD_TAIL).toFixed(2));
        entry.trimEnd = end; entry.padTail = PAD_TAIL;
        if (end >= srcAsset.duration - 0.05) {
          throw new Error(`the cut would remove nothing (end ${end} vs duration ${srcAsset.duration.toFixed(2)})`);
        }
      } else if (r.expectFirstWord) {
        /*
         * ---- AN ALOHA-ANCHORED HEAD CUT IS NOT RECONCILED ON leadIn -------
         *
         * For these films `reportSecond` is the onset of the GREETING, not the
         * onset of sound — they open on a stray word, so their `leadIn` is
         * 0.000s by definition. Comparing the two refused both films with a
         * "2.15s disagreement" between an energy onset and an Aloha onset:
         * two numbers with the same name from different quantities, which is
         * the thing the reconcile exists to prevent, committed by the
         * reconcile itself.
         *
         * There is nothing to cross-check against here, and that is stated
         * rather than papered over: the anchor was measured ON THIS MASTER by
         * --find-aloha, tested by pulling from it and hearing "Aloha", and the
         * independent check is the assertion below that the finished clip
         * opens on the greeting. A gate on the result, not on a second guess
         * at the input.
         */
        if (r.reportSecond == null) throw new Error("the plan carries no Aloha anchor for this film");
        entry.reconcileGap = null;
        entry.note = `${entry.note ? `${entry.note}; ` : ""}anchored on the greeting at ` +
          `${r.reportSecond}s (measured on this master by --find-aloha, not cross-checked against the ` +
          `447 reading — the check is that the clip opens on "${r.expectFirstWord}")`;
        console.log(`           anchor: the greeting at ${r.reportSecond}s on this master ` +
          `(leadIn is ${n(m.leadIn)}s — the stray word; not comparable, so not compared)`);
        start = Math.max(0, Number((r.reportSecond - PAD_HEAD).toFixed(2)));
        entry.trimStart = start; entry.padHead = PAD_HEAD;
        if (start <= 0.05) throw new Error(`the cut would remove nothing (start ${start})`);
      } else {
        if (m.leadIn == null) throw new Error("no energy onset could be read from the master");
        const gap = r.reportSecond == null ? null : Number(Math.abs(m.leadIn - r.reportSecond).toFixed(3));
        entry.reconcileGap = gap;
        console.log(`           onset master ${m.leadIn.toFixed(2)}s  report ${r.reportSecond ?? "—"}s  gap ${gap ?? "—"}`);
        if (gap != null && gap > RECONCILE_TOLERANCE) {
          throw new Error(
            `master and report disagree by ${gap}s about where sound starts ` +
              `(tolerance ${RECONCILE_TOLERANCE}s) — refusing rather than picking one`
          );
        }
        start = Math.max(0, Number((m.leadIn - PAD_HEAD).toFixed(2)));
        entry.trimStart = start; entry.padHead = PAD_HEAD;
        if (start <= 0.05) {
          throw new Error(`the cut would remove nothing (start ${start})`);
        }
      }

      /* ---- what to clip, and the offsets in ITS timeline ---------------- */
      const src = await resolveSource(
        r.id, cur.mux_asset_id, srcAsset.duration, cur.archived_asset_id, priorCuts);
      entry.source = src;
      entry.sourceAssetId = src.assetId;
      console.log(`           source: ${src.kind} ${src.assetId.slice(0, 12)}… — ${src.reconciled}`);

      /* The cut was computed in the MASTER's timeline, because that is what was
         measured. Shift it into the source's. A tail cut therefore acquires a
         start it did not have: master 0 is archive `offset`, and leaving it off
         would hand back the whole spoken slate the earlier pass removed. */
      const masterStart = start;
      const masterEnd = end;
      if (src.kind === "archive") {
        start = Number(((masterStart ?? 0) + src.offset).toFixed(2));
        end = masterEnd == null
          ? Number((src.offset + srcAsset.duration).toFixed(2))
          : Number((masterEnd + src.offset).toFixed(2));
        if (end > src.duration + 0.05) {
          throw new Error(
            `the mapped end ${end}s is past the archive's ${src.duration.toFixed(2)}s — ` +
              `the offset must be wrong, refusing`
          );
        }
        entry.trimStart = masterStart;   // what the FILM lost, for the position shift
        entry.trimEnd = masterEnd;
        entry.sourceTrimStart = start;   // what was actually sent to Mux
        entry.sourceTrimEnd = end;
        console.log(`           mapped into the archive: start=${start} end=${end} (master ${masterStart ?? "0"} -> ${masterEnd ?? "end"})`);
      } else {
        entry.sourceTrimStart = start;
        entry.sourceTrimEnd = end;
      }

      if (PROVE_REFUSAL) {
        /* Deliberately wrong, to show the gate fires: three seconds further in
           than the measurement says, which lands inside the speech. */
        if (end != null) end = Number((end - 3).toFixed(2));
        if (start != null) start = Number((start + 3).toFixed(2));
        entry.trimStart = start; entry.trimEnd = end;
        console.log(`           --prove-refusal: offset moved 3s into the speech on purpose`);
      }

      console.log(`           cutting  start=${start ?? "—"}  end=${end ?? "—"}`);

      /* ---- the clip, from the CURRENT master ---------------------------- */
      const clip = await video().video.assets.create({
        inputs: [{
          url: `mux://assets/${src.assetId}`,
          ...(start != null ? { start_time: start } : {}),
          ...(end != null ? { end_time: end } : {}),
          generated_subtitles: [{ language_code: "en", name: "English (auto)" }],
        }],
        playback_policies: ["signed"],
        /* A clip of a master is still a master — same settings replace:video
           and trim:recut use, so this batch does not quietly re-encode the
           library to a different quality than the rest of it. */
        video_quality: "premium",
        max_resolution_tier: "2160p",
        normalize_audio: true,
      });
      entry.newAssetId = clip.id;
      const asset = await waitReady(clip.id);
      const pb = asset.playback_ids?.find((x) => x.policy === "signed");
      if (!pb) throw new Error("clip has no signed playback id");

      /* ---- READ IT BEFORE ANY ROW POINTS AT IT ------------------------- */
      const after = await measure(pb.id, asset.duration ?? 0);
      entry.measuredAfter = after;
      console.log(`           clip ${(asset.duration ?? 0).toFixed(2)}s  ${line({
        duration: after.assetDuration, firstWord: after.firstWord, lastWord: after.lastWord,
        leadIn: after.leadIn, tailAfterLast: after.tailAfterLast, whisperFirstStart: null,
        headHeard: "", tailHeard: "", note: null,
      })}`);

      /* The gate. Each rule is checked on the end it cut, and on nothing else:
         a head-cut film does NOT have to open on Aloha — six of these open on a
         spoken slate and that is what Ryan's rule cuts the air in front of. */
      const reasons: string[] = [];
      if (r.rule === "tail-cut") {
        if (strip(after.lastWord ?? "") !== "mahalo") reasons.push(`closes "${after.lastWord ?? "—"}", not Mahalo`);
        if (after.tailAfterLast == null) reasons.push("no tail could be read");
        else if (after.tailAfterLast > TAIL_CEILING) reasons.push(`tail ${after.tailAfterLast}s > ${TAIL_CEILING}s`);
        /* The floor is trim-check's MIN_TAIL_AFTER_MAHALO, not MIN_FIRST_WORD_START.
           The first build of this gate used the head constant (0.15s) at the tail
           by mistake, and two films cut through the fallback path got through with
           0.195s and 0.328s of air after their sign-off — a whole "Mahalo" and
           audible, but tighter than the standard the library is built to. Both
           are named in the report. The two ends have two constants for a reason. */
        else if (after.tailAfterLast < MIN_TAIL_AFTER_MAHALO) {
          reasons.push(`tail ${after.tailAfterLast}s is under the ${MIN_TAIL_AFTER_MAHALO}s the sign-off needs`);
        }
      } else {
        if (after.leadIn == null) reasons.push("no onset could be read");
        else if (after.leadIn > HEAD_CEILING) reasons.push(`first sound at ${after.leadIn}s > ${HEAD_CEILING}s`);
        else if (after.leadIn < MIN_FIRST_WORD_START) reasons.push(`first sound at ${after.leadIn}s — cut into the first word`);
        /* Where the cut was made to remove a specific word, the film has to
           come back opening on the next one. See PlanRow.expectFirstWord. */
        if (r.expectFirstWord) {
          const got = strip(after.firstWord ?? "");
          if (got !== r.expectFirstWord) {
            reasons.push(
              `opens on "${after.firstWord ?? "—"}" and this cut exists to make it open on ` +
              `"${r.expectFirstWord}"`
            );
          }
        }
      }
      /*
       * ---- DID THE CLIP COME BACK THE LENGTH THE CUT ASKED FOR? -----------
       *
       * This is the load-bearing check on the end that was NOT cut, and it is
       * the one trim:apply already named as such: derived from what happened,
       * needs nothing to be transcribed, available for every film. A tail-only
       * cut that also moved the head cannot come back the right length.
       */
      /* Computed in the MASTER's timeline, which is the film the viewer has,
         whatever asset the clip was taken from. */
      const wantLength = r.rule === "tail-cut"
        ? masterEnd!
        : Number((m.assetDuration - masterStart!).toFixed(2));
      const gotLength = after.assetDuration;
      if (Math.abs(gotLength - wantLength) > 0.5) {
        reasons.push(`came back ${gotLength.toFixed(2)}s, the cut asked for ${wantLength.toFixed(2)}s`);
      }

      /*
       * ---- THE UNCUT END, AND WHAT IT ACTUALLY TURNED OUT TO MEAN ---------
       *
       * This number is how far the end that was NOT cut appears to have moved.
       * It is recorded rather than refused on, and the reason is worth keeping
       * because the first explanation of it was wrong in a way that would have
       * hidden a real defect.
       *
       * On the first attempt — clipping the current master with `end_time`
       * alone — 15,000 Part 4 came back with its onset moved 0.59s -> 1.49s.
       * That was written off as the re-encode moving the -40dB crossing: two
       * numbers from two HLS streams, so a gap between them is a fact about the
       * encoder. Plausible, and false. The 0.90s WAS the defect: Mux had
       * resolved `mux://assets/<clip>` back to the underlying source and begun
       * 0.90s before the master's zero, which is why the sign-off at the other
       * end was truncated.
       *
       * Cutting from the archive instead, the same film reads a drift of
       * exactly 0.000s. So a non-zero drift here is EVIDENCE, not noise — and
       * the only reason it is not a refusal is that the length check below
       * catches the same fault more cheaply and without a second instrument.
       * If this number is ever non-zero on a swapped film, read it.
       */
      const uncutEndDrift = r.rule === "tail-cut"
        ? (m.leadIn != null && after.leadIn != null ? Number((after.leadIn - m.leadIn).toFixed(3)) : null)
        : (m.tailAfterLast != null && after.tailAfterLast != null
            ? Number((after.tailAfterLast - m.tailAfterLast).toFixed(3)) : null);
      entry.uncutEndDrift = uncutEndDrift;

      /*
       * For an ARCHIVE-sourced cut the drift is a refusal, because the offset
       * is the one thing containment could not prove. Twenty films cut from a
       * reconciled archive came back at 0.000s; anything else means the offset
       * is wrong and the clip is not this film. For a MASTER-sourced cut it
       * stays a report, because there the drift is the known clip-of-a-clip
       * shift and the word and tail checks already judge the result.
       */
      const DRIFT_CEILING = 0.25;
      if (src.kind === "archive" && uncutEndDrift != null && Math.abs(uncutEndDrift) > DRIFT_CEILING) {
        reasons.push(
          `the end this cut did not touch moved ${uncutEndDrift}s, so the archive offset of ` +
          `${src.offset}s is wrong — a correctly mapped archive cut drifts 0.000s`
        );
      }
      console.log(`           length asked ${wantLength.toFixed(2)}s got ${gotLength.toFixed(2)}s` +
        `   uncut end drifted ${uncutEndDrift ?? "—"}s` +
        `${src.kind === "archive" ? " (judged: an archive cut must be 0)" : " (reported, not judged)"}`);

      if (reasons.length) {
        entry.verdict = "refused";
        entry.note = `${entry.note ? `${entry.note}; ` : ""}clip REFUSED: ${reasons.join("; ")} — left in Mux, unreferenced; the row still serves what it served`;
        console.log(`           *** REFUSED: ${reasons.join("; ")}`);
        console.log(`           NOT swapped. ${r.title} is unchanged and goes on the list.`);
        ledger[entry.masterAssetId] = entry;
        writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 1)}\n`);
        done.push(entry);
        continue;
      }

      /* ---- swap. 0107 archives the old master and marks the vertical stale. */
      const client = db() as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
      const { error: swapErr } = await client.rpc("replace_master_asset", {
        _content_id: r.id, _new_asset_id: clip.id, _new_playback_id: pb.id,
        _new_duration: asset.duration ? Math.round(asset.duration) : null,
        /* A trim is the same take cut differently. Neither moves. */
        _new_version: null, _new_canonical: null,
      });
      if (swapErr) throw new Error(`swap: ${swapErr.message}`);
      entry.swapped = true;
      entry.verdict = "cut";
      console.log(`           swapped; vertical marked stale by 0107, so a phone letterboxes this master`);
      ledger[entry.masterAssetId] = entry;
      writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 1)}\n`);
      done.push(entry);
    } catch (e) {
      entry.verdict = "failed";
      entry.note = `${entry.note ? `${entry.note}; ` : ""}${e instanceof Error ? e.message : String(e)}`;
      console.log(`           FAILED — ${entry.note}`);
      ledger[entry.masterAssetId] = entry;
      writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 1)}\n`);
      done.push(entry);
    }
  }

  const after = await witnessCounts();

  /* ---- the summary, computed from counters this run incremented ---------- */
  const cut = done.filter((d) => d.verdict === "cut");
  const refused = done.filter((d) => d.verdict === "refused");
  const failed = done.filter((d) => d.verdict === "failed");
  const seconds = cut.reduce(
    (t, d) => t + Math.max(0, (d.measuredBefore?.assetDuration ?? 0) - (d.measuredAfter?.assetDuration ?? 0)), 0);

  console.log(`\n  ${"═".repeat(72)}`);
  console.log(`  cut and swapped          ${cut.length}`);
  console.log(`  refused before the swap  ${refused.length}`);
  console.log(`  failed                   ${failed.length}`);
  console.log(`  removed                  ${(seconds / 60).toFixed(1)} minutes`);
  console.log(`  ${"═".repeat(72)}`);
  console.log(`  before: ${Object.entries(before).map(([k, v]) => `${k}=${v}`).join("  ")}`);
  console.log(`  after:  ${Object.entries(after).map(([k, v]) => `${k}=${v}`).join("  ")}`);
  const moved = Object.keys(before).filter((k) => before[k] !== after[k]);
  if (moved.length) console.log(`\n  *** ${moved.join(", ")} CHANGED — a trim must not touch progress or publication ***`);
  else console.log(`  no progress row counts moved, and nothing was published or unpublished.`);

  if (refused.length) {
    console.log(`\n  REFUSED BEFORE THE SWAP — these films are unchanged:`);
    for (const d of refused) console.log(`    ${d.title}\n        ${d.note}`);
  }
  if (failed.length) {
    console.log(`\n  FAILED:`);
    for (const d of failed) console.log(`    ${d.title}\n        ${d.note}`);
  }
  console.log(`\n  ledger: ${LEDGER}`);
  console.log(`  Next: npm run trim:shift-positions   (head cuts move saved resume positions)`);
  console.log(`        transcripts:backfill --force, stills:backfill, captions:sync`);
  console.log(`  NOT next: derive:vertical. The crops are stale on purpose; re-deriving is t29.\n`);

  if (failed.length || refused.length || moved.length) process.exit(1);
}

if (require.main === module) {
  main().catch((e) => { console.error(`\n  FAILED: ${e instanceof Error ? e.message : e}\n`); process.exit(1); });
}
