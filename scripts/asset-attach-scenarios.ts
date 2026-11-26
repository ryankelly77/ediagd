/* ============================================================================
   EDIAGD — the three arms of a ready asset

     npm run test:asset-attach

   PURE. `decideAttach` is a function of the passthrough and the row the caller
   read, so all three arms are cheap and need no Mux, no webhook and no
   database:

     attach     the passthrough names a loaded row and that row is empty
     refuse     the row already has an asset — do not touch it, log and hold
     insert     no passthrough, so the pre-existing path, unchanged

   ---------------------------------------------------------------------------
   WHY THE THIRD ARM IS TESTED AT ALL
   ---------------------------------------------------------------------------
   Because it is the one that was already working. Every asset that reaches
   this webhook today has no passthrough — the admin uploader, `clipAsset` and
   the 9:16 derive all leave it unset — so a change that quietly started
   claiming those would break the entire existing library while the two new
   arms passed. "A refusal is not self-verifying": the acceptance test is the
   one that gets skipped, and it is the one that catches this.
============================================================================ */

import {
  attachColumns,
  decideAttach,
  readAttachIntent,
} from "@/lib/video/asset-attach";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(label: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`    ✓ ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? `\n        ${detail}` : ""}`);
    console.log(`    ✗ ${label}${detail ? `  — ${detail}` : ""}`);
  }
}
const section = (t: string) => console.log(`\n${t}`);

/** A real loaded row's id, from the 26 November Manager Meetings load. */
const ROW = "9d3cc574-2698-47d2-aab9-6a8bfaec1660";
const ASSET = "AbCdEf0123456789xyzQwErTy";
const PASS = JSON.stringify({ content_id: ROW });

console.log("\nAttaching a ready asset");

section("1. ATTACH — the passthrough names a loaded row that is empty");
{
  const d = decideAttach({
    passthrough: PASS,
    assetId: ASSET,
    row: { id: ROW, mux_asset_id: null },
  });
  ok("it attaches", d.mode === "attach");
  ok(
    "to the row the passthrough named, by id",
    d.mode === "attach" && d.contentId === ROW,
    d.mode === "attach" ? d.contentId : d.mode
  );
}

section("2. REFUSE — the row already carries a different asset");
{
  const d = decideAttach({
    passthrough: PASS,
    assetId: ASSET,
    row: { id: ROW, mux_asset_id: "SomeOtherAssetAlreadyHere" },
  });
  ok("it refuses", d.mode === "refuse");
  ok(
    "and does NOT fall back to inserting a row",
    d.mode !== "insert",
    d.mode
  );
  ok(
    "and names both assets so the hold is actionable",
    d.mode === "refuse" &&
      /SomeOtherAssetAlreadyHere/.test(d.reason) &&
      d.reason.includes(ASSET),
    d.mode === "refuse" ? d.reason : ""
  );
  ok(
    "and points at replace:video, which archives what it replaces",
    d.mode === "refuse" && /replace:video/.test(d.reason)
  );
}

section("3. INSERT — no passthrough, so nothing changes for any other track");
{
  for (const [label, value] of [
    ["absent", undefined],
    ["null", null],
    ["empty", ""],
    ["whitespace", "   "],
  ] as const) {
    const d = decideAttach({ passthrough: value, assetId: ASSET, row: null });
    ok(`a ${label} passthrough takes the legacy insert path`, d.mode === "insert", d.mode);
  }

  /* The shapes other producers could plausibly put there. None of them is a
     claim on a content row, and half-understanding one would be worse than
     ignoring it. */
  for (const [label, value] of [
    ["a bare uuid", ROW],
    ["someone else's json", JSON.stringify({ derived_from: ROW })],
    ["json that is not an object", JSON.stringify(["a", "b"])],
    ["unparseable text", "vertical-derive:9x16"],
    ["a content_id that is not uuid-shaped", JSON.stringify({ content_id: "not-an-id" })],
  ] as const) {
    const d = decideAttach({ passthrough: value, assetId: ASSET, row: null });
    ok(`${label} is not claimed`, d.mode === "insert", d.mode);
  }
}

section("4. A redelivery of the SAME asset is a quiet no-op, not a hold");
{
  /* Mux retries on any non-2xx and will deliver the same event twice. The row
     having an asset is only a problem when it is a DIFFERENT one; reporting a
     retry as a hold would put a false alarm in every run's report. */
  const d = decideAttach({
    passthrough: PASS,
    assetId: ASSET,
    row: { id: ROW, mux_asset_id: ASSET },
  });
  ok("it is a noop", d.mode === "noop", d.mode);
  ok("and says why, so the log is readable", d.mode === "noop" && /redelivery/i.test(d.reason));
}

section("5. A passthrough naming a row that does not exist REFUSES");
{
  /*
   * The tempting behaviour is to fall through and insert. That is exactly the
   * orphan this mechanism exists to prevent — a row with a film and no
   * teaching content — and it would be created silently.
   */
  const d = decideAttach({ passthrough: PASS, assetId: ASSET, row: null });
  ok("it refuses", d.mode === "refuse", d.mode);
  ok("and explicitly does not insert instead", d.mode !== "insert");
  ok(
    "and says the row is missing rather than blaming the asset",
    d.mode === "refuse" && /not in\s+content/.test(d.reason),
    d.mode === "refuse" ? d.reason : ""
  );
}

section("6. readAttachIntent accepts only its own envelope");
{
  ok("it reads a well-formed intent", readAttachIntent(PASS)?.content_id === ROW);
  /* Ids here are not all RFC-4122 — `318b0b2d-f70d-e8da-8837-397ffa642975`
     has `e` where a version should be, and the textbook regex refused a good
     id once already. Shape only. */
  const oddball = "318b0b2d-f70d-e8da-8837-397ffa642975";
  ok(
    "including an id whose version nibble is not 1-5",
    readAttachIntent(JSON.stringify({ content_id: oddball }))?.content_id === oddball
  );
  ok("and refuses a non-object", readAttachIntent(JSON.stringify("x")) === null);
  ok("and refuses a number", readAttachIntent(42) === null);
}

section("7. The attach writes the asset, and NOTHING the loader wrote");
{
  const cols = attachColumns({
    assetId: ASSET,
    playbackId: "pb_123",
    durationSec: 171,
    aspectRatio: "16:9",
    hasCaptions: true,
  });

  ok("it sets the asset id", cols.mux_asset_id === ASSET);
  ok("the playback id", cols.mux_playback_id === "pb_123");
  ok("signed playback, always", cols.mux_playback_policy === "signed");
  ok("the duration", cols.duration_sec === 171);
  ok("and queues the 9:16", cols.vertical_status === "pending");

  /*
   * THIS IS THE ASSERTION THE WHOLE MECHANISM RESTS ON.
   *
   * The loader wrote the title, the run sheet, best_used_for, situation_tags,
   * meeting_length and the classification_line that is the meeting's identity.
   * An attach that refreshed any of them from a video file would overwrite
   * Mitch's curated meeting with a filename. Enumerated rather than described,
   * so adding a column to the attach has to come past this list.
   */
  const FORBIDDEN = [
    "title", "body", "classification_line", "collection", "placement", "type",
    "meeting_length", "meeting_format", "situation_tags", "best_used_for",
    "status", "op_code", "series", "short_title", "detail",
  ];
  const written = Object.keys(cols);
  const trespass = FORBIDDEN.filter((k) => written.includes(k));
  ok(
    "and touches none of the loader's columns",
    trespass.length === 0,
    trespass.length ? `would overwrite: ${trespass.join(", ")}` : ""
  );
  ok(
    "and does not set status, because publishing is a person's decision",
    !written.includes("status")
  );

  /* File provenance is written, because it is a fact about the FILE that the
     loader never had — and because ingest-videos.ts decides what is already
     done by reading canonical_filename, so leaving it null makes the next run
     upload the same master again. */
  const withFile = attachColumns(
    { assetId: ASSET, playbackId: "pb_123", durationSec: 171, aspectRatio: "16:9", hasCaptions: true },
    { sourceFilename: "MANAGER — Teach Mode vs. Preach Mode — Mitch Hardt — v1.MOV",
      canonicalFilename: "MANAGER MEETINGS — Teach Mode vs. Preach Mode (Mitch Hardt) — v1.mov",
      voice: "Mitch Hardt" }
  );
  ok(
    "it records the file it came from",
    withFile.source_filename === "MANAGER — Teach Mode vs. Preach Mode — Mitch Hardt — v1.MOV"
  );
  ok(
    "and the canonical name, so a re-run does not upload it twice",
    withFile.canonical_filename ===
      "MANAGER MEETINGS — Teach Mode vs. Preach Mode (Mitch Hardt) — v1.mov"
  );
  ok("and the voice", withFile.voice === "Mitch Hardt");
  ok(
    "but an absent draft writes no nulls over them",
    !("source_filename" in cols) && !("canonical_filename" in cols) && !("voice" in cols)
  );
}

console.log("\n" + "=".repeat(64));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  ✗ " + f);
}
console.log("=".repeat(64));
process.exit(failed > 0 ? 1 : 0);
