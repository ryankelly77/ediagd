/* ============================================================================
   EDIAGD — re-cut the films the first pass cut INTO the greeting

     set -a; source .env.local; set +a
     SB_URL=… SB_KEY=… npm run trim:recut -- --only=44cfa330      # report
     …                  npm run trim:recut -- --only=… --apply
     …                  npm run trim:recut -- --apply --pad-head=0.6

   ---------------------------------------------------------------------------
   WHAT WENT WRONG, MEASURED
   ---------------------------------------------------------------------------
   The apply pass cut each head at `alohaAt - 0.3`. Whisper's word timestamps
   land fractionally INSIDE the first phoneme — trim-slates.ts says so in its
   own comment and uses 0.35 for exactly this reason — and 0.3 was not enough
   room. The result is an asset whose first word is already sounding at 0.00.

   Nothing caught it. The length check passed because the cut removed exactly
   the span asked for. The caption check passed because the word is still mostly
   there. Only reading the FIRST WORD of the finished film finds it.

   ---------------------------------------------------------------------------
   IT CUTS FROM THE ORIGINAL, NEVER FROM THE SHORTENED FILM
   ---------------------------------------------------------------------------
   The source is `content.archived_asset_id` — the master the first cut replaced
   — so the new cut is computed in the ORIGINAL timeline from the plan's own
   alohaAt and mahaloEnd. Clipping the already-cut asset again would compound
   the error and there would be no way back.

   ---------------------------------------------------------------------------
   VERIFIED BEFORE THE SWAP, NOT AFTER
   ---------------------------------------------------------------------------
   The clip is created, read, and only swapped onto the row if its first word is
   a whole "Aloha" and its last word a whole "Mahalo". A re-cut checked after it
   is live has already served the fault it was meant to fix. A clip that fails
   is left in Mux, unreferenced, and reported — it costs storage and nothing
   else.
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import Mux from "@mux/mux-node";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { readEnds, passes, headOk, tailOk, line, type Ends } from "./trim-check";

const PLAN = "reports/trim-plan-approved.json";
const LEDGER = "reports/trim-pass.json";
const RECUT = "reports/trim-recut.json";
const WORK = ".tmp-trim-recut";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const ONLY = argv.find((a) => a.startsWith("--only="))?.slice(7);
const PAD_HEAD = Number(argv.find((a) => a.startsWith("--pad-head="))?.slice(11) ?? 0.6);
const PAD_TAIL = Number(argv.find((a) => a.startsWith("--pad-tail="))?.slice(11) ?? 0.7);
const WINDOW = Number(argv.find((a) => a.startsWith("--window="))?.slice(9) ?? 3);
const MODEL = argv.find((a) => a.startsWith("--model="))?.slice(8) ?? "small.en";
/*
 * Hand-measured overrides, for a film whose plan number is simply wrong.
 * "Coverage is Key, Part 6" is the worked example: the plan put Aloha at 10.64,
 * which is inside the spoken slate — "Coverage is Key Part 6, Fuel, Oil, and
 * A.C." runs to 10.38 and the greeting is at 11.54. A cut from the plan's
 * number opens on "and". Only ever used with --only, and recorded on the row.
 */
const ALOHA_AT = argv.find((a) => a.startsWith("--aloha-at="))?.slice(11);
const MAHALO_END = argv.find((a) => a.startsWith("--mahalo-end="))?.slice(13);

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

function sh(cmd: string, args: string[]): Promise<void> {
  return new Promise((res, rej) => {
    const c = spawn(cmd, args, { stdio: "inherit", env: process.env });
    c.on("exit", (code) => (code === 0 ? res() : rej(new Error(`${cmd} exited ${code}`))));
  });
}

type Entry = {
  contentId: string; title: string;
  sourceAssetId: string; supersededAssetId: string | null; newAssetId: string | null;
  trimStart: number | null; trimEnd: number | null; padHead: number; padTail: number;
  before: Ends | null; after: Ends | null;
  swapped: boolean; note: string | null; at: string;
};

async function main() {
  requireEnv();
  const plan = Object.fromEntries(
    (JSON.parse(readFileSync(PLAN, "utf8")).rows as Record<string, unknown>[]).map((r) => [r.id as string, r])
  );
  const ledger = JSON.parse(readFileSync(LEDGER, "utf8")) as Record<string, { contentId: string; title: string }>;
  const archivedOf = new Map<string, string>();
  for (const [asset, v] of Object.entries(ledger)) archivedOf.set(v.contentId, asset);

  let ids = [...archivedOf.keys()];
  if (ONLY) {
    const want = ONLY.split(",").map((s) => s.trim()).filter(Boolean);
    ids = ids.filter((id) => want.some((w) => id.startsWith(w)));
  }

  const recut: Record<string, Entry> = existsSync(RECUT) ? JSON.parse(readFileSync(RECUT, "utf8")) : {};
  /* The BEFORE reading comes from trim:verify, taken on the asset that is live
     right now. Recorded beside the after so the pair can be read together —
     a re-cut whose before is not written down is a claim, not a comparison. */
  const VERIFY = "reports/trim-verify.json";
  const before: Record<string, Ends> = {};
  if (existsSync(VERIFY)) {
    for (const r of (JSON.parse(readFileSync(VERIFY, "utf8")).results as (Ends & { contentId: string })[])) {
      before[r.contentId] = r;
    }
  }
  console.log(`\n  trim:recut ${APPLY ? "" : "— REPORT ONLY"}  pad head ${PAD_HEAD}s, tail ${PAD_TAIL}s`);
  console.log(`  ${ids.length} candidate film(s)\n`);

  const done: Entry[] = [];
  for (const id of ids) {
    const p = plan[id] as {
      title: string; alohaAt: number | null; mahaloEnd: number | null;
      assetDuration: number | null; proposedStart: number | null; proposedEnd: number | null;
    } | undefined;
    if (!p) { console.log(`  ${id.slice(0, 8)} — not in the plan, skipped`); continue; }
    if (recut[id]?.swapped) { console.log(`  ${p.title} — already re-cut, skipped`); continue; }

    const source = archivedOf.get(id)!;
    /* The new cut, in the ORIGINAL timeline. A side the first pass did not cut
       is still not cut: nothing here widens the scope of the original ruling. */
    const aloha = ALOHA_AT != null ? Number(ALOHA_AT) : p.alohaAt;
    const mahalo = MAHALO_END != null ? Number(MAHALO_END) : p.mahaloEnd;
    if (ALOHA_AT != null && !ONLY) {
      console.error("\n  --aloha-at is a hand measurement of ONE film; use it with --only.\n");
      process.exit(1);
    }
    const start = (p.proposedStart != null || ALOHA_AT != null) && aloha != null
      ? Math.max(0, Number((aloha - PAD_HEAD).toFixed(2))) : null;
    const end = (p.proposedEnd != null || MAHALO_END != null) && mahalo != null
      ? Number(Math.min(p.assetDuration ?? 1e9, mahalo + PAD_TAIL).toFixed(2)) : null;

    console.log(`  ──────── ${p.title}`);
    console.log(`           original ${p.assetDuration}s, aloha ${p.alohaAt}, mahaloEnd ${p.mahaloEnd}`);
    console.log(`           was  start=${p.proposedStart} end=${p.proposedEnd}`);
    console.log(`           now  start=${start} end=${end}   (from archived ${source.slice(0, 12)}…)`);
    if (start == null && end == null) { console.log(`           nothing to cut — skipped`); continue; }
    if (!APPLY) continue;

    const entry: Entry = {
      contentId: id, title: p.title, sourceAssetId: source, supersededAssetId: null, newAssetId: null,
      trimStart: start, trimEnd: end, padHead: PAD_HEAD, padTail: PAD_TAIL,
      before: before[id] ?? recut[id]?.before ?? null, after: null, swapped: false, note: null,
      at: new Date().toISOString(),
    };
    try {
      const { data: row } = await db().from("content")
        .select("mux_asset_id, mux_playback_id, status, retired_at").eq("id", id).maybeSingle();
      const cur = row as unknown as { mux_asset_id: string | null; status: string; retired_at: string | null } | null;
      if (!cur || cur.status !== "published" || cur.retired_at) throw new Error("row is not published");
      entry.supersededAssetId = cur.mux_asset_id;

      console.log(`           clipping from the original…`);
      const clip = await video().video.assets.create({
        inputs: [{
          url: `mux://assets/${source}`,
          ...(start != null ? { start_time: start } : {}),
          ...(end != null ? { end_time: end } : {}),
          generated_subtitles: [{ language_code: "en", name: "English (auto)" }],
        }],
        playback_policies: ["signed"],
        video_quality: "premium",
        max_resolution_tier: "2160p",
        normalize_audio: true,
      });
      const asset = await waitReady(clip.id);
      entry.newAssetId = clip.id;
      const pb = asset.playback_ids?.find((x) => x.policy === "signed");
      if (!pb) throw new Error("clip has no signed playback id");

      /* ---- READ IT BEFORE IT IS LIVE ---------------------------------- */
      console.log(`           clip ${clip.id.slice(0, 12)}… ${asset.duration?.toFixed(2)}s — reading its ends…`);
      const after = await readEnds(video(), pb.id, asset.duration ?? 0, WINDOW, MODEL, WORK);
      entry.after = after;
      console.log(`           ${line(after)}`);

      if (!passes(after)) {
        entry.note = `clip REFUSED: head ${headOk(after) ? "ok" : "BAD"}, tail ${tailOk(after) ? "ok" : "BAD"}` +
          (after.note ? ` (${after.note})` : "");
        console.log(`           *** ${entry.note} — NOT swapped. The row still serves the old asset.`);
        recut[id] = entry;
        writeFileSync(RECUT, `${JSON.stringify(recut, null, 1)}\n`);
        done.push(entry);
        continue;
      }

      /* The client is built without a generated Database type, so `rpc` infers
         its argument as `undefined`. Cast the CLIENT, not the method: pulling
         `rpc` off the object detaches it from its `this` and the call dies with
         "Cannot read properties of undefined (reading 'rest')" — after the clip
         has already been made and verified, which is the worst moment for it. */
      const client = db() as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
      const { error: swapErr } = await client.rpc("replace_master_asset", {
        _content_id: id, _new_asset_id: clip.id, _new_playback_id: pb.id,
        _new_duration: asset.duration ? Math.round(asset.duration) : null,
        _new_version: null, _new_canonical: null,
      });
      if (swapErr) throw new Error(`swap: ${swapErr.message}`);
      entry.swapped = true;
      recut[id] = entry;
      writeFileSync(RECUT, `${JSON.stringify(recut, null, 1)}\n`);
      console.log(`           swapped, ledger written`);

      await sh("npm", ["run", "derive:vertical", "--", `--id=${id}`]);
      done.push(entry);
    } catch (e) {
      entry.note = e instanceof Error ? e.message : String(e);
      recut[id] = entry;
      writeFileSync(RECUT, `${JSON.stringify(recut, null, 1)}\n`);
      console.log(`           FAILED — ${entry.note}`);
      done.push(entry);
    }
  }

  const swapped = done.filter((d) => d.swapped);
  const refused = done.filter((d) => !d.swapped);
  console.log(`\n  re-cut and swapped: ${swapped.length}`);
  console.log(`  refused or failed:  ${refused.length}`);
  for (const r of refused) console.log(`    ${r.title}: ${r.note}`);
  console.log("");
  if (refused.length) process.exit(1);
}

if (require.main === module) {
  main().catch((e) => { console.error(`\n  FAILED: ${e instanceof Error ? e.message : e}\n`); process.exit(1); });
}
