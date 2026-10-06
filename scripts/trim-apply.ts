/* ============================================================================
   EDIAGD — cut the dead air the measure pass found

     set -a; source .env.local; set +a
     SB_URL="$NEXT_PUBLIC_SUPABASE_URL" SB_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
       npm run trim:apply                     # report, change nothing
     … -- --apply                             # cut
     … -- --apply --limit=5                   # the first five, to watch one work
     … -- --only=c61fb5c9                     # one film, or a comma-separated list
     … -- --apply --force-window              # outside the quiet hours, deliberately

   Reads reports/trim-plan.json. Proposes nothing of its own: every start and end
   comes from the plan Ryan read and approved, and a film the plan does not
   propose a cut for is not in this run.

   ---------------------------------------------------------------------------
   THE LEDGER IS KEYED ON THE ASSET, NOT ON THE FILM
   ---------------------------------------------------------------------------
   reports/slate-trims.json is keyed by content id, which was right for a pass
   that cut each film once and wrong for this one: a trimmed film is a NEW asset
   on the same row, so a content id cannot distinguish "already cut" from "cut
   before, and this is a different cut". 165 films are in that ledger with their
   heads done and their tails still on.

   So this keeps its own, keyed by the `mux_asset_id` THAT WAS CUT, and refuses
   an asset id it has seen. The asset id is the thing that actually changes when
   a cut lands, which makes a double cut representable only by lying about which
   asset was the source.

   ---------------------------------------------------------------------------
   THE PLAN MEASURED A SPECIFIC ASSET, AND SO THE CUT APPLIES TO THAT ASSET
   ---------------------------------------------------------------------------
   Every start and end in the plan is an offset into ONE asset. If the row has
   been reshot, re-cut or re-uploaded since the measurement, its current asset is
   a different film and those offsets mean nothing — 17.10s into the new one is
   not where "Aloha" is. Nothing would error; the film would simply start in the
   wrong place.

   So before each cut the row is re-read and its CURRENT asset id is compared
   against the one the plan measured. A mismatch refuses that film and says so.
   This is the same rule as joining on what was observed: the plan observed an
   asset id, and that is the key it has to match on.

   ---------------------------------------------------------------------------
   ONE RUN AT A TIME
   ---------------------------------------------------------------------------
   The ledger stops a film being cut twice by separate runs. It cannot stop two
   CONCURRENT runs picking the same film before either has written — and that is
   not theoretical: two overlapping trim:slates runs cut "Have Patience with
   Yourself" twice, taking 14.5s off a film whose slate was 7.3s. The result
   still plays. It just starts mid-sentence, which is the damage nobody reports.

   ---------------------------------------------------------------------------
   IT RUNS WHEN BEAUMONT IS ASLEEP
   ---------------------------------------------------------------------------
   A swap under an advisor mid-film costs them their place, so this refuses to
   start outside 21:00–05:00 Central or a Sunday. --force-window is a decision,
   not a retry.
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import Mux from "@mux/mux-node";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import { parseCues } from "./trim-measure";

const PLAN = "reports/trim-plan.json";
const LEDGER = "reports/trim-pass.json";
const LOCK = "reports/.trim-pass.lock";

/*
 * ---- RYAN IS UNPUBLISHING THESE AND MITCH RESHOOTS ------------------------
 *
 * Both came back from the measure pass with no sign-off, and the reason is not
 * dead air: `25,000 Mile Dealer Upsell Menu (2748)` ends mid-sentence — "And
 * build off…" — and `70,000 Mile Dealer Upsell Menu, Part 2 (2821)` ends on an
 * outtake. Neither take was ever finished, so there is no Mahalo to cut after.
 *
 * They are excluded BY ID rather than by a note on the row, because a film that
 * is about to stop being published should not be quietly carried along by a
 * filter that happens to exclude it today for an unrelated reason.
 */
const SKIP: Record<string, string> = {
  "d0b1084d-db49-4c5e-b608-9fb594355861":
    "25,000 Mile Dealer Upsell Menu (2748) — ends mid-sentence; Ryan unpublishing, Mitch reshoots",
  "fe35f2ea-2fa7-4b07-acca-ea16e2e2c8c7":
    "70,000 Mile Dealer Upsell Menu, Part 2 (2821) — ends on an outtake; Ryan unpublishing, Mitch reshoots",
};

/** What the measure pass promised the cut would achieve. Re-checked on the new
 *  asset, from its own captions, after each swap. */
const HEAD_CEILING = 1.0;
const TAIL_CEILING = 1.5;
/**
 * Mux generates subtitles AFTER the asset is ready, so the track is almost
 * never there the instant the swap commits.
 *
 * The check after each swap is therefore ONE attempt, not a wait: blocking two
 * minutes per film for a track that needs longer than that anyway would add
 * eight hours to a 252-film run and still mostly time out. Every film that is
 * not ready goes on the sweep at the end, by which time the earliest cuts have
 * had the whole run to finish transcoding.
 *
 * The verification still happens for every film; what moved is where it waits.
 */
const CAPTION_SWEEP_ATTEMPTS = 6;
const CAPTION_SWEEP_POLL_MS = 20_000;

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const FORCE_WINDOW = argv.includes("--force-window");
const ONLY = argv.find((a) => a.startsWith("--only="))?.slice(7);
const LIMIT = Number(argv.find((a) => a.startsWith("--limit="))?.slice(8) ?? 0) || 0;

type PlanRow = {
  id: string;
  title: string;
  collection: string | null;
  placement: string | null;
  muxAssetId: string | null;
  assetDuration: number | null;
  durationSec: number | null;
  proposedStart: number | null;
  proposedEnd: number | null;
  head: number | null;
  tail: number | null;
  inOldLedger: boolean;
};

type LedgerEntry = {
  contentId: string;
  title: string;
  newAssetId: string;
  trimStart: number | null;
  trimEnd: number | null;
  oldDuration: number | null;
  newDuration: number | null;
  cutAt: string;
  verified?: { head: number | null; tail: number | null; ok: boolean; note?: string };
};

function requireEnv() {
  const missing = [
    "SB_URL", "SB_KEY",
    "MUX_TOKEN_ID", "MUX_TOKEN_SECRET", "MUX_SIGNING_KEY_ID", "MUX_SIGNING_KEY_PRIVATE",
  ].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`\n  missing ${missing.join(", ")}\n`);
    process.exit(1);
  }
}

let _sb: ReturnType<typeof createClient> | null = null;
const db = () => (_sb ??= createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
}));
let _mux: Mux | null = null;
const video = () => (_mux ??= new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
  jwtSigningKey: process.env.MUX_SIGNING_KEY_ID!,
  jwtPrivateKey: process.env.MUX_SIGNING_KEY_PRIVATE!,
}));

/** Beaumont's clock, not the laptop's. */
function centralNow(): { hour: number; weekday: string; label: string } {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric", hour12: false, weekday: "short",
    year: "numeric", month: "short", day: "numeric", minute: "2-digit",
  });
  const parts = Object.fromEntries(f.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return {
    hour: Number(parts.hour),
    weekday: String(parts.weekday),
    label: f.format(new Date()),
  };
}

function quietHours(): { ok: boolean; why: string } {
  const { hour, weekday, label } = centralNow();
  if (weekday === "Sun") return { ok: true, why: `${label} Central — Sunday` };
  if (hour >= 21 || hour < 5) return { ok: true, why: `${label} Central — inside 21:00–05:00` };
  return { ok: false, why: `${label} Central — advisors may be mid-film` };
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: "inherit", env: process.env });
    c.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

/** Where the greeting and the sign-off sit in an asset, read from its captions.
 *  The same reading the measure pass's cheap pass does — accurate enough to
 *  confirm a cut landed, which is all this is for. */
async function captionPositions(
  playbackId: string
): Promise<{ head: number | null; tail: number | null; note?: string }> {
  const pb = await video().video.playbackIds.retrieve(playbackId);
  const assetId = pb.object?.id as string | undefined;
  if (!assetId) return { head: null, tail: null, note: "playback id resolves to no asset" };
  const asset = await video().video.assets.retrieve(assetId);
  const dur = asset.duration;
  const track = (asset.tracks ?? []).find(
    (t) => t.type === "text" && t.status === "ready" && (t.language_code === "en" || !t.language_code)
  );
  if (!track) return { head: null, tail: null, note: "no ready English text track yet" };
  if (dur == null) return { head: null, tail: null, note: "asset reports no duration" };

  const token = await video().jwt.signPlaybackId(playbackId, { type: "video", expiration: "600s" });
  const res = await fetch(`https://stream.mux.com/${playbackId}/text/${track.id}.vtt?token=${token}`);
  if (!res.ok) return { head: null, tail: null, note: `vtt http ${res.status}` };
  const cues = parseCues(await res.text());
  if (!cues.length) return { head: null, tail: null, note: "vtt empty" };

  const first = cues.find((c) => /\baloha\b/i.test(c.text));
  let lastMahalo = null as (typeof cues)[number] | null;
  for (const c of cues) if (/\bmahalo\b/i.test(c.text)) lastMahalo = c;
  return {
    head: first ? Number(first.start.toFixed(3)) : null,
    tail: lastMahalo ? Number((dur - lastMahalo.end).toFixed(3)) : null,
  };
}

/** Rows whose counts must not move. A trim replaces the asset behind a row; it
 *  must not touch anybody's progress, and the only way to know is to count. */
async function witnessCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of ["module_completion", "content_progress", "watch_gate"]) {
    const { count, error } = await db().from(t).select("*", { count: "exact", head: true });
    out[t] = error ? -1 : (count ?? -1);
  }
  return out;
}

async function main() {
  requireEnv();
  console.log(`\n  trim:apply ${APPLY ? "" : "— REPORT ONLY, nothing will be cut"}`);

  if (!existsSync(PLAN)) {
    console.error(`\n  missing ${PLAN} — run npm run trim:measure first\n`);
    process.exit(1);
  }
  const plan = JSON.parse(readFileSync(PLAN, "utf8")) as { summary: Record<string, unknown>; rows: PlanRow[] };
  console.log(`  plan measured ${plan.summary.generatedAt} over ${plan.summary.scope}`);

  const ledger: Record<string, LedgerEntry> = existsSync(LEDGER)
    ? JSON.parse(readFileSync(LEDGER, "utf8"))
    : {};
  console.log(`  ${LEDGER}: ${Object.keys(ledger).length} assets already cut by this pass`);

  /* ---- who is in this run ------------------------------------------------ */
  let candidates = plan.rows.filter((r) => r.proposedStart != null || r.proposedEnd != null);
  const skipped: { title: string; because: string }[] = [];

  for (const id of Object.keys(SKIP)) {
    const hit = candidates.find((r) => r.id === id);
    if (hit) skipped.push({ title: hit.title, because: SKIP[id] });
  }
  candidates = candidates.filter((r) => !SKIP[r.id]);

  if (ONLY) {
    const want = ONLY.split(",").map((s) => s.trim()).filter(Boolean);
    candidates = candidates.filter((r) => want.some((w) => r.id === w || r.id.startsWith(w)));
  }

  const alreadyCut = candidates.filter((r) => r.muxAssetId && ledger[r.muxAssetId]);
  for (const r of alreadyCut) {
    skipped.push({ title: r.title, because: `asset ${r.muxAssetId!.slice(0, 12)}… is already in the ledger` });
  }
  candidates = candidates.filter((r) => !(r.muxAssetId && ledger[r.muxAssetId]));

  if (LIMIT) candidates = candidates.slice(0, LIMIT);

  const headOnly = candidates.filter((r) => r.proposedStart != null && r.proposedEnd == null).length;
  const tailOnly = candidates.filter((r) => r.proposedStart == null && r.proposedEnd != null).length;
  const both = candidates.filter((r) => r.proposedStart != null && r.proposedEnd != null).length;

  console.log(`\n  ${candidates.length} films to cut  (head only ${headOnly}, tail only ${tailOnly}, both ${both})`);
  if (skipped.length) {
    console.log(`\n  SKIPPED (${skipped.length})`);
    for (const s of skipped.slice(0, 12)) console.log(`    ${s.title}\n        ${s.because}`);
    if (skipped.length > 12) console.log(`    … and ${skipped.length - 12} more`);
  }

  const window = quietHours();
  console.log(`\n  ${window.ok ? "quiet hours" : "NOT quiet hours"}: ${window.why}`);

  if (!APPLY) {
    console.log(`\n  --apply to cut. Nothing changed.\n`);
    return;
  }
  if (!window.ok && !FORCE_WINDOW) {
    console.error(
      `\n  REFUSING: a swap under an advisor mid-film costs them their place.\n` +
        `  Run after 21:00 Central, before 05:00, or on a Sunday — or pass --force-window.\n`
    );
    process.exit(1);
  }
  if (!candidates.length) {
    console.log(`\n  nothing to do.\n`);
    return;
  }

  /* ---- one run at a time ------------------------------------------------- */
  if (existsSync(LOCK) && !argv.includes("--force-unlock")) {
    const held = readFileSync(LOCK, "utf8").trim();
    const alive = (() => { try { process.kill(Number(held), 0); return true; } catch { return false; } })();
    if (alive) {
      console.error(`\n  another trim:apply run is in progress (pid ${held}).\n` +
        `  Two at once cut the same film twice — that has already happened once.\n`);
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
  console.log(`\n  before: ${Object.entries(before).map(([k, v]) => `${k}=${v}`).join("  ")}`);

  /* ---- cut, one at a time ------------------------------------------------ */
  const done: LedgerEntry[] = [];
  const failed: { title: string; id: string; why: string }[] = [];
  const pendingCaptions: { id: string; title: string }[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const r = candidates[i];
    console.log(`\n  ──────── [${i + 1}/${candidates.length}] ${r.title}`);
    console.log(`           start=${r.proposedStart ?? "—"}  end=${r.proposedEnd ?? "—"}  was ${r.assetDuration}s`);

    try {
      /* The plan measured one asset. If the row points at a different one now,
         these offsets describe a film that is no longer there. */
      const { data: row, error } = await db()
        .from("content")
        .select("id, title, mux_asset_id, mux_playback_id, status, retired_at, duration_sec")
        .eq("id", r.id)
        .maybeSingle();
      if (error) throw new Error(`row read: ${error.message}`);
      if (!row) throw new Error("content row has gone");
      const cur = row as unknown as {
        mux_asset_id: string | null; mux_playback_id: string | null;
        status: string; retired_at: string | null; duration_sec: number | null;
      };
      if (cur.status !== "published" || cur.retired_at) {
        throw new Error(`no longer published (status=${cur.status}, retired_at=${cur.retired_at})`);
      }
      if (!cur.mux_asset_id) throw new Error("row has no master asset");
      if (cur.mux_asset_id !== r.muxAssetId) {
        throw new Error(
          `asset changed since the plan was measured ` +
            `(plan ${String(r.muxAssetId).slice(0, 12)}…, row ${cur.mux_asset_id.slice(0, 12)}…) — ` +
            `re-measure this film rather than cutting it on stale offsets`
        );
      }
      if (ledger[cur.mux_asset_id]) throw new Error("asset is already in the ledger");

      const args = ["run", "replace:video", "--", `--id=${r.id}`, "--trim-only"];
      if (r.proposedStart != null) args.push(`--trim-start=${r.proposedStart}`);
      if (r.proposedEnd != null) args.push(`--trim-end=${r.proposedEnd}`);
      await run("npm", args);

      /* ---- the ledger row goes in the moment the swap commits ------------- */
      const { data: after } = await db()
        .from("content")
        .select("mux_asset_id, mux_playback_id, duration_sec")
        .eq("id", r.id)
        .maybeSingle();
      const a = after as unknown as {
        mux_asset_id: string | null; mux_playback_id: string | null; duration_sec: number | null;
      } | null;
      if (!a?.mux_asset_id || a.mux_asset_id === cur.mux_asset_id) {
        throw new Error("the swap did not change the asset id — treat this film as uncut");
      }

      const entry: LedgerEntry = {
        contentId: r.id,
        title: r.title,
        newAssetId: a.mux_asset_id,
        trimStart: r.proposedStart,
        trimEnd: r.proposedEnd,
        oldDuration: r.assetDuration,
        newDuration: a.duration_sec,
        cutAt: new Date().toISOString(),
      };
      ledger[cur.mux_asset_id] = entry;
      writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 1)}\n`);
      console.log(`           ledger written: ${cur.mux_asset_id.slice(0, 12)}… -> ${a.mux_asset_id.slice(0, 12)}…`);

      /* ---- did the cut actually achieve what the plan promised? ---------- */
      let verified: LedgerEntry["verified"] = undefined;
      const pos = await captionPositions(a.mux_playback_id!);
      if (!pos.note) {
        const headOk = r.proposedStart == null || (pos.head != null && pos.head < HEAD_CEILING);
        const tailOk = r.proposedEnd == null || (pos.tail != null && pos.tail < TAIL_CEILING);
        verified = { head: pos.head, tail: pos.tail, ok: headOk && tailOk };
      }
      if (!verified) {
        pendingCaptions.push({ id: r.id, title: r.title });
        console.log(`           captions still generating — swept at the end`);
      } else {
        entry.verified = verified;
        writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 1)}\n`);
        console.log(
          `           verified head=${verified.head ?? "—"} tail=${verified.tail ?? "—"} ` +
            `${verified.ok ? "OK" : "*** OUTSIDE THE CEILING — reported, not retried ***"}`
        );
      }
      done.push(entry);
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      failed.push({ title: r.title, id: r.id, why });
      console.log(`           FAILED — ${why}`);
      console.log(`           continuing; this film is not in the ledger and can be re-run`);
    }
  }

  /* ---- sweep the films whose captions were still generating -------------- */
  if (pendingCaptions.length) {
    console.log(`\n  sweeping ${pendingCaptions.length} films whose captions were still generating…`);
    for (const p of pendingCaptions) {
      const { data } = await db().from("content").select("mux_playback_id, mux_asset_id").eq("id", p.id).maybeSingle();
      const pb = (data as unknown as { mux_playback_id: string | null } | null)?.mux_playback_id;
      if (!pb) continue;
      let pos = await captionPositions(pb);
      for (let k = 1; k < CAPTION_SWEEP_ATTEMPTS && pos.note; k++) {
        await new Promise((s) => setTimeout(s, CAPTION_SWEEP_POLL_MS));
        pos = await captionPositions(pb);
      }
      const entry = Object.values(ledger).find((e) => e.contentId === p.id);
      if (!entry) continue;
      const row = candidates.find((c) => c.id === p.id)!;
      const headOk = row.proposedStart == null || (pos.head != null && pos.head < HEAD_CEILING);
      const tailOk = row.proposedEnd == null || (pos.tail != null && pos.tail < TAIL_CEILING);
      entry.verified = { head: pos.head, tail: pos.tail, ok: headOk && tailOk, note: pos.note };
      writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 1)}\n`);
      console.log(`    ${p.title}: head=${pos.head ?? "—"} tail=${pos.tail ?? "—"} ${pos.note ?? ""}`);
    }
  }

  const after = await witnessCounts();

  /* ---- the report, computed from what happened --------------------------- */
  const verifiedOk = done.filter((d) => d.verified?.ok).length;
  const verifiedBad = done.filter((d) => d.verified && !d.verified.ok);
  const unverified = done.filter((d) => !d.verified || d.verified.note);
  const cutSeconds = done.reduce(
    (t, d) => t + Math.max(0, (d.oldDuration ?? 0) - (d.newDuration ?? d.oldDuration ?? 0)), 0
  );

  console.log(`\n  ${"═".repeat(70)}`);
  console.log(`  cut           ${done.length}`);
  console.log(`  failed        ${failed.length}`);
  console.log(`  verified OK   ${verifiedOk}`);
  console.log(`  outside the ceiling  ${verifiedBad.length}`);
  console.log(`  not verified  ${unverified.length}`);
  console.log(`  removed       ${(cutSeconds / 60).toFixed(1)} minutes`);
  console.log(`  ${"═".repeat(70)}`);
  console.log(`  before: ${Object.entries(before).map(([k, v]) => `${k}=${v}`).join("  ")}`);
  console.log(`  after:  ${Object.entries(after).map(([k, v]) => `${k}=${v}`).join("  ")}`);
  const moved = Object.keys(before).filter((k) => before[k] !== after[k]);
  if (moved.length) {
    console.log(`\n  *** ${moved.join(", ")} CHANGED during the run — a trim must not touch progress ***`);
  } else {
    console.log(`  no progress row counts moved.`);
  }

  if (verifiedBad.length) {
    console.log(`\n  OUTSIDE THE CEILING — reported, not retried:`);
    for (const d of verifiedBad) {
      console.log(`    ${d.title}: head=${d.verified!.head ?? "—"} tail=${d.verified!.tail ?? "—"}`);
    }
  }
  if (failed.length) {
    console.log(`\n  FAILED:`);
    for (const f of failed) console.log(`    ${f.title}\n        ${f.why}`);
  }

  console.log(
    `\n  Next: npm run transcripts:backfill -- --force   (the text is the same, the track is new)` +
      `\n        npm run stills:backfill                  (a new playback id is a new frame)` +
      `\n        npm run captions:sync                    (captions_ready describes the new assets)` +
      `\n  and confirm the vertical cron clears every cut film back to vertical_status='ready'.\n`
  );

  if (failed.length || verifiedBad.length || moved.length) process.exit(1);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`\n  FAILED: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
}
