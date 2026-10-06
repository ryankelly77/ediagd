/* ============================================================================
   EDIAGD — what trim:measure refuses, and what it accepts

     npm run test:trim-measure

   A measure that only ever runs against production is a measure nobody has
   seen refuse. AGENTS.md: every gate gets BOTH tests — the refusal against a
   deliberately bad input, and the acceptance against a real good one. The
   acceptance is the one that gets skipped, and it is the one that catches a
   gate which achieves its exclusions by proposing nothing at all.

   So the first scenario here is a POSITIVE one, and it is first on purpose: a
   build of this script that proposed no cut for anything would pass every
   refusal below and fail scenario 1.
   ============================================================================ */
import { parseCues, propose, screen, LIMITS, type Row, type Limits } from "./trim-measure";

let failures = 0;
let ran = 0;

function check(name: string, got: unknown, want: unknown) {
  ran++;
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}\n          got  ${g}\n          want ${w}`);
  }
}

/** A row as the caption pass would leave it, with the bits a scenario cares
 *  about overridden. */
function row(over: Partial<Row>): Row {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    title: "a film",
    collection: "Craft",
    placement: "daily_craft",
    muxAssetId: "asset",
    assetDuration: 100,
    durationSec: 100,
    inOldLedger: false,
    captionHead: null,
    captionMahaloEnd: null,
    captionLastCueEnd: null,
    alohaAt: null,
    mahaloEnd: null,
    head: null,
    tail: null,
    headMeasuredBy: "none",
    tailMeasuredBy: "none",
    flagHead: false,
    flagTail: false,
    proposedStart: null,
    proposedEnd: null,
    notes: [],
    headHeard: "",
    tailHeard: "",
    error: null,
    ...over,
  };
}

const L: Limits = { headThreshold: 1.0, tailThreshold: 1.5, padHead: 0.3, padTail: 0.7 };

console.log("\n  trim:measure — the decisions\n");

/* ---- 1. THE POSITIVE HALF, FIRST ---------------------------------------- */
/* Get the Hell Out of Here, Part 1, with the numbers actually measured off the
   asset on 5 October: head 17.4, Mahalo ending 96.136, asset 100.576. If this
   does not propose a cut, nothing below is worth reading. */
{
  const r = row({
    assetDuration: 100.576,
    durationSec: 101,
    head: 17.4,
    alohaAt: 17.4,
    headMeasuredBy: "word",
    mahaloEnd: 96.136,
    tail: 4.44,
    tailMeasuredBy: "word",
  });
  propose(r, L);
  check("the film Ryan reported is cut at both ends", [r.proposedStart, r.proposedEnd], [17.1, 96.84]);
}

/* ---- 2. A clean head and a long tail is cut at the TAIL ONLY ------------- */
/* This is the old-ledger case from the brief: 165 films already had their heads
   cut by trim:slates, and cutting those heads a second time would take another
   few seconds off a film that is already correct — the invisible damage, since
   the film still plays and just starts mid-sentence. */
{
  const r = row({
    inOldLedger: true,
    assetDuration: 90,
    head: 0.35,
    alohaAt: 0.35,
    headMeasuredBy: "word",
    mahaloEnd: 84,
    tail: 6,
    tailMeasuredBy: "word",
  });
  propose(r, L);
  check("already-trimmed head is not touched a second time", r.proposedStart, null);
  check("…and its long tail still gets cut", r.proposedEnd, 84.7);
}

/* ---- 3. A film measured fine proposes nothing ---------------------------- */
{
  const r = row({
    assetDuration: 60,
    head: 0.4,
    alohaAt: 0.4,
    headMeasuredBy: "word",
    mahaloEnd: 59.1,
    tail: 0.9,
    tailMeasuredBy: "word",
  });
  propose(r, L);
  check("a film that is fine is not in the apply run", [r.proposedStart, r.proposedEnd], [null, null]);
}

/* ---- 4. A caption number is never enough to cut on ---------------------- */
/* The cheap pass puts a cue boundary at the start of the SLATE on any film
   whose slate and greeting share one cue, so a cut computed from it keeps the
   slate — the single outcome this job exists to avoid. */
{
  const r = row({
    assetDuration: 100,
    captionHead: 12,
    head: 12,
    headMeasuredBy: "caption",
    captionMahaloEnd: 95,
    tail: 5,
    tailMeasuredBy: "caption",
  });
  propose(r, L);
  check("captions alone propose no cut", [r.proposedStart, r.proposedEnd], [null, null]);
}
/* ---- 4b. …and the gate is on PROVENANCE, not on a number being present ---
   The scenario above passes even with the provenance check weakened, because
   alohaAt and mahaloEnd happen to be null on a caption-only row — so it proves
   the gate only by accident. Verified: weakening `headMeasuredBy === "word"` to
   `!== "none"` left 27/27 green.

   A test that passes for a reason other than the one it names is the thing this
   file exists to catch, so this row carries word-level numbers while still
   claiming caption provenance. Unreachable through the real flow, which is the
   point: it isolates the gate instead of resting on the invariant that feeds
   it. */
{
  const r = row({
    assetDuration: 100,
    captionHead: 12,
    head: 12,
    alohaAt: 12,
    headMeasuredBy: "caption",
    captionMahaloEnd: 95,
    mahaloEnd: 95,
    tail: 5,
    tailMeasuredBy: "caption",
  });
  propose(r, L);
  check("a caption-provenance row proposes nothing even carrying numbers", [r.proposedStart, r.proposedEnd], [null, null]);
}

/* ---- 5. An unknown screens IN, both sides ------------------------------- */
{
  const r = row({ assetDuration: 100, captionHead: null, tail: null });
  screen(r, L);
  check("no caption Aloha screens the head into the word pass", r.flagHead, true);
  check("no caption Mahalo screens the tail into the word pass", r.flagTail, true);
}
{
  const r = row({ assetDuration: 100, captionHead: 0.2, tail: 0.4 });
  screen(r, L);
  check("a short caption head screens the head OUT", r.flagHead, false);
  check("a short caption tail screens the tail OUT", r.flagTail, false);
}

/* ---- 6. offset-suspect proposes nothing on the tail --------------------- */
/* The two passes are independent routes to where Mahalo is. When they
   disagree, the offset the tail window was read at is in doubt, and an offset
   that is wrong is wrong by the same amount on every film — the consistent
   error, which is the dangerous kind. */
{
  const r = row({
    assetDuration: 100,
    head: 5,
    alohaAt: 5,
    headMeasuredBy: "word",
    mahaloEnd: 80,
    tail: 20,
    tailMeasuredBy: "word",
    captionMahaloEnd: 95,
    notes: ["offset-suspect(captions 95.00 vs words 80.00)"],
  });
  propose(r, L);
  check("a suspect offset proposes no tail cut", r.proposedEnd, null);
  check("…but the head, measured in its own window, still cuts", r.proposedStart, 4.7);
}

/* ---- 7. The pads clamp ------------------------------------------------- */
{
  const r = row({
    assetDuration: 50,
    head: 1.2,
    alohaAt: 0.1,
    headMeasuredBy: "word",
    mahaloEnd: 49.9,
    tail: 1.6,
    tailMeasuredBy: "word",
  });
  propose(r, L);
  check("a pad that would go negative proposes no head cut", r.proposedStart, null);
  check("a pad that would exceed the asset proposes no tail cut", r.proposedEnd, null);
}

/* ---- 8. A row with no asset duration proposes nothing ------------------- */
{
  const r = row({
    assetDuration: null,
    head: 20,
    alohaAt: 20,
    headMeasuredBy: "word",
    mahaloEnd: 50,
    tail: 30,
    tailMeasuredBy: "word",
  });
  propose(r, L);
  check("no asset duration proposes nothing", [r.proposedStart, r.proposedEnd], [null, null]);
  screen(r, L);
  check("…and screens nothing, rather than screening everything", [r.flagHead, r.flagTail], [false, false]);
}

/* ---- 9. The thresholds are flags, and they move the answer -------------- */
{
  const base = {
    assetDuration: 100,
    head: 1.2,
    alohaAt: 1.2,
    headMeasuredBy: "word" as const,
    mahaloEnd: 98,
    tail: 2,
    tailMeasuredBy: "word" as const,
  };
  const tight = row(base);
  propose(tight, L);
  check("at the default thresholds this film is cut", [tight.proposedStart, tight.proposedEnd], [0.9, 98.7]);

  const loose = row(base);
  propose(loose, { ...L, headThreshold: 2.0, tailThreshold: 3.0 });
  check("with Ryan's looser ruling the same film is left alone", [loose.proposedStart, loose.proposedEnd], [null, null]);

  const wider = row(base);
  propose(wider, { ...L, padHead: 0.8, padTail: 1.5 });
  check("a wider pad moves the cut, and the pad is a flag", [wider.proposedStart, wider.proposedEnd], [0.4, 99.5]);
}

/* ---- 10. parseCues reads what Mux actually sends ------------------------ */
{
  const vtt = [
    "WEBVTT",
    "",
    "1",
    "00:00:00.000 --> 00:00:10.400",
    "Get the hell out of here speech.",
    "",
    "2",
    "00:00:17.200 --> 00:00:18.760",
    "Aloha.",
    "",
    "3",
    "00:01:36.200 --> 00:01:37.400",
    "Mahalo.",
    "",
  ].join("\n");
  const cues = parseCues(vtt);
  check("three cues", cues.length, 3);
  check("HH:MM:SS.mmm is read as seconds", [cues[1].start, cues[1].end], [17.2, 18.76]);
  check("the minute field carries", cues[2].start, 96.2);
  check("the cue text survives", cues[1].text, "Aloha.");
}
{
  /* MM:SS.mmm — Mux sends this shape on short films. */
  const cues = parseCues("WEBVTT\n\n00:05.000 --> 00:07.500\nAloha.\n");
  check("MM:SS.mmm is read as seconds", [cues[0].start, cues[0].end], [5, 7.5]);
}
{
  /* A cue whose text holds both words is still one cue, and the greeting one
     is the first that MENTIONS aloha — which on this shape is the slate's own
     cue, and precisely why a caption number may not be cut on. */
  const cues = parseCues(
    "WEBVTT\n\n00:00:00.000 --> 00:00:06.000\nDoubt is a strange thing by Kobe Bryant. Aloha.\n"
  );
  check("a shared slate/greeting cue starts at the slate", cues[0].start, 0);
  check("…and that is the whole reason for pass two", /aloha/i.test(cues[0].text), true);
}
{
  check("an empty vtt yields no cues", parseCues("WEBVTT\n\n").length, 0);
  check("a malformed timestamp is skipped, not guessed", parseCues("WEBVTT\n\nxx --> yy\nhi\n").length, 0);
}

console.log(`\n  ${ran - failures}/${ran} passed\n`);
if (failures) {
  console.error(`  ${failures} FAILED\n`);
  process.exit(1);
}
