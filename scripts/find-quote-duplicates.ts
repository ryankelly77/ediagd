/* ============================================================================
   EDIAGD — find the quotes that were entered twice

   REPORT ONLY. This script never writes. It produces a CSV with a blank
   decision column for Ryan to fill, and scripts/dedupe-quotes.ts retires what
   he approves. Same shape as the video/quote match pass, for the same reason:
   a wrong retirement takes a line out of the rotation that nobody asked to
   lose, and the matcher is good enough to propose and not to decide.

   ---------------------------------------------------------------------------
   WHERE THESE CAME FROM
   ---------------------------------------------------------------------------
   The ties-at-ceiling rule in the video matcher surfaced them as a side effect:
   two quotes both scoring 1.0 against one video usually means the library holds
   the same line twice with trivial wording drift — "Work hard in the dark to
   shine in the light" and "You have to work hard in the dark to shine in the
   light" are one Kobe line, written down twice.

   ---------------------------------------------------------------------------
   HOW DUPLICATES ARE DECIDED
   ---------------------------------------------------------------------------
   Same normalization as the matcher — lowercase, unify quote marks, drop
   punctuation, collapse whitespace — so the two passes agree about what "the
   same words" means.

     exact  normalized bodies identical
     near   one normalized body contains the other, or token-set Jaccard >= 0.90,
            or the two share a whole sentence

   THE SHARED SENTENCE IS THE ONE THAT MATTERS MOST, and it was not obvious
   until the Happy Kid pair failed both other tests:

     Q0224  Don't try to make a happy kid happier. If it's not broken, don't
            break it.
     Q0309  The most underrated management skill is knowing when to do nothing.
            Don't try to make a happy kid happier.

   Neither contains the other and their Jaccard is 0.35, because each row wraps
   the same line in different framing. That is how this library was actually
   built — somebody kept a good sentence and rewrote what surrounded it — so a
   whole shared sentence is stronger evidence of one idea entered twice than
   any similarity score on the full body. Short sentences would over-fire
   ("This too shall pass"), so a shared sentence needs MIN_SENTENCE_TOKENS
   content-bearing words to count.

   NEAR IS SPLIT BY LENGTH RATIO, because two very different situations both
   land in it:

     drift    the rows are comparable in length — one line, written twice
     excerpt  one is far shorter — a standalone line that also lives inside a
              longer passage. Retiring the short one may be throwing away a
              punchy version somebody wrote on purpose.

   The ratio does not change the tier and does not change the proposal. It
   tells Ryan which rows deserve a second read.

   VOICE IS A GATE, NOT A SIGNAL, exactly as in the matcher. Two rows with the
   same text in different voices are NOT duplicates: that is a misattribution,
   which is a different problem with a different fix, and retiring one of them
   would silently pick a side. They get their own section of the report and no
   proposed action.

   CONTAINMENT NEEDS A FLOOR. A four-word quote is a substring of plenty of
   longer ones that have nothing to do with it, so the shorter side needs at
   least MIN_CONTAINED_TOKENS content-bearing tokens before containment counts
   as evidence. Jaccard has no such problem — it is symmetric — and carries no
   floor.

   ---------------------------------------------------------------------------
   WHICH ROW SURVIVES
   ---------------------------------------------------------------------------
   1. LINKED ROWS NEVER RETIRE. A quote a video points at is half of an artifact
      (0064); retiring it would leave the video pointing at a withdrawn row and
      break the loop's same-day dedup. For a quote the link is INBOUND — the
      pointer lives on the video and names the quote — so this asks who
      references the row, not what the row references.
   2. The fuller text. "You have to work hard in the dark..." is the line as
      Kobe said it; the clipped form is someone's paraphrase in a spreadsheet.
   3. The lower quote number, which is the older row.

   If two rows in one group are both linked, no survivor is proposed and the
   group is flagged: that is two videos pointing at what is arguably one idea,
   and it needs a person.

     npm run find:dupes
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});

type Row = {
  id: string;
  title: string;
  body: string | null;
  voice: string | null;
  quote_key: string | null;
  quote_slot: string | null;
  status: string | null;
  artifact_id: string | null;
};

/** Lowercase, unify quote marks, drop punctuation, collapse whitespace. */
function norm(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* The matcher's stoplist, unchanged, so both passes tokenize identically. */
const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "at", "by",
  "for", "with", "is", "are", "was", "were", "be", "been", "it", "its", "that",
  "this", "you", "your", "i", "me", "my", "we", "us", "our", "as", "so", "do",
]);

const tokens = (s: string) =>
  new Set(norm(s).split(" ").filter((t) => t.length > 1 && !STOP.has(t)));

/** |A ∩ B| / |A ∪ B| — symmetric, which is what "same line" wants. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit / (a.size + b.size - hit);
}

const NEAR = 0.9;
const MIN_CONTAINED_TOKENS = 4;
const MIN_SENTENCE_TOKENS = 4;
/** Below this, the shorter row is an excerpt of the longer, not a variant of it. */
const DRIFT_RATIO = 0.6;

/**
 * The normalized sentences of a body, long enough to mean something.
 *
 * Split on terminal punctuation only. An em dash joins clauses of one thought
 * — "it's management — manage yourself" — and splitting there would invent
 * fragments that match across unrelated rows.
 */
function sentences(body: string): string[] {
  return (body ?? "")
    .split(/(?<=[.!?])\s+/)
    .map(norm)
    .filter((s) => s.split(" ").filter((t) => t.length > 1 && !STOP.has(t)).length >= MIN_SENTENCE_TOKENS);
}

/** Digits of Q0141 -> 141, for the older-row tiebreak. Missing keys sort last. */
function quoteNumber(key: string | null): number {
  const m = (key ?? "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
}

async function main() {
  const all: Row[] = [];
  for (let o = 0; ; o += 1000) {
    const { data, error } = await sb
      .from("content")
      .select("id, title, body, voice, quote_key, quote_slot, status, artifact_id")
      .eq("format", "quote")
      .is("retired_at", null)
      .order("id")
      .range(o, o + 999);
    if (error) throw new Error(error.message);
    all.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) break;
  }

  /* ---- Who is pointed AT --------------------------------------------------
   * A quote is "linked" when a video's artifact_id names it. Reading the
   * quote's own artifact_id would find nothing and quietly propose retiring
   * exactly the rows that must not be retired. */
  const inbound = new Set<string>();
  for (let o = 0; ; o += 1000) {
    const { data, error } = await sb
      .from("content")
      .select("artifact_id")
      .not("artifact_id", "is", null)
      .order("artifact_id")
      .range(o, o + 999);
    if (error) throw new Error(error.message);
    (data ?? []).forEach((r) => inbound.add(r.artifact_id as string));
    if (!data || data.length < 1000) break;
  }
  const isLinked = (r: Row) => inbound.has(r.id) || Boolean(r.artifact_id);

  console.log(`  ${all.length} live quotes, ${inbound.size} rows referenced as artifacts\n`);

  const prepared = all.map((r) => ({
    row: r,
    n: norm(r.body ?? ""),
    t: tokens(r.body ?? ""),
    s: sentences(r.body ?? ""),
  }));

  type Pairing = { a: number; b: number; tier: "exact" | "near"; why: string; ratio: number };
  const pairs: Pairing[] = [];
  const crossVoice: { a: Row; b: Row }[] = [];

  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const A = prepared[i];
      const B = prepared[j];
      if (!A.n || !B.n) continue;

      const sameVoice = (A.row.voice ?? "") === (B.row.voice ?? "");
      const ratio =
        Math.min(A.n.length, B.n.length) / Math.max(A.n.length, B.n.length);

      if (A.n === B.n) {
        // Identical text in two voices is a misattribution, not a duplicate.
        if (!sameVoice) { crossVoice.push({ a: A.row, b: B.row }); continue; }
        pairs.push({ a: i, b: j, tier: "exact", why: "identical", ratio: 1 });
        continue;
      }
      if (!sameVoice) continue;

      const shorter = A.n.length <= B.n.length ? A : B;
      const longer = shorter === A ? B : A;
      if (
        shorter.t.size >= MIN_CONTAINED_TOKENS &&
        longer.n.includes(shorter.n)
      ) {
        pairs.push({ a: i, b: j, tier: "near", why: "one contains the other", ratio });
        continue;
      }
      const js = jaccard(A.t, B.t);
      if (js >= NEAR) {
        pairs.push({ a: i, b: j, tier: "near", why: `jaccard ${js.toFixed(3)}`, ratio });
        continue;
      }
      // Last, because it is the loosest of the three and the other two carry
      // more information when they fire.
      const shared = A.s.find((s) => B.s.includes(s));
      if (shared) {
        pairs.push({
          a: i, b: j, tier: "near",
          why: `shares a sentence: "${shared.slice(0, 48)}"`,
          ratio,
        });
      }
    }
  }

  /* ---- Union-find, so three drifted copies land in ONE group ---------------
   * Pairwise output would list A~B and B~C separately and invite retiring the
   * middle row twice. */
  const parent = prepared.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (x: number, y: number) => { parent[find(x)] = find(y); };
  pairs.forEach((p) => union(p.a, p.b));

  const groups = new Map<number, number[]>();
  pairs.forEach((p) => {
    const root = find(p.a);
    if (!groups.has(root)) groups.set(root, []);
    const g = groups.get(root)!;
    if (!g.includes(p.a)) g.push(p.a);
    if (!g.includes(p.b)) g.push(p.b);
  });

  const tierOf = new Map<number, "exact" | "near">();
  pairs.forEach((p) => {
    const root = find(p.a);
    // A group holding any near pair is a near group — the weaker evidence wins,
    // because that is the one that needs looking at.
    if (p.tier === "near" || !tierOf.has(root)) tierOf.set(root, p.tier);
  });
  pairs.forEach((p) => { if (p.tier === "near") tierOf.set(find(p.a), "near"); });

  const whyOf = new Map<number, string>();
  pairs.forEach((p) => {
    const root = find(p.a);
    if (!whyOf.has(root)) whyOf.set(root, p.why);
  });

  // The narrowest ratio in the group, since that is the pair worth reading.
  const ratioOf = new Map<number, number>();
  pairs.forEach((p) => {
    const root = find(p.a);
    ratioOf.set(root, Math.min(ratioOf.get(root) ?? 1, p.ratio));
  });

  /* ---- Propose a survivor per group --------------------------------------- */
  type Decided = {
    gid: number;
    tier: "exact" | "near";
    shape: "identical" | "drift" | "excerpt";
    ratio: number;
    why: string;
    rows: { row: Row; linked: boolean; action: "survive" | "retire" | "hold" }[];
    flag: string;
  };

  const decided: Decided[] = [];
  let gid = 0;
  for (const [, members] of groups) {
    gid++;
    const rows = members.map((i) => ({ row: prepared[i].row, linked: isLinked(prepared[i].row) }));
    const linkedRows = rows.filter((r) => r.linked);

    let flag = "";
    let survivor: Row | null = null;

    if (linkedRows.length > 1) {
      // Two videos pointing into one idea. No survivor proposed.
      flag = "two linked rows — needs a person";
    } else if (linkedRows.length === 1) {
      survivor = linkedRows[0].row;
      // Did the link override what the text tiebreaks would have chosen?
      const byText = [...rows].sort(
        (x, y) =>
          norm(y.row.body ?? "").length - norm(x.row.body ?? "").length ||
          quoteNumber(x.row.quote_key) - quoteNumber(y.row.quote_key)
      )[0].row;
      if (byText.id !== survivor.id) {
        flag = `link overrides text tiebreak (text would pick ${byText.quote_key})`;
      }
    } else {
      survivor = [...rows].sort(
        (x, y) =>
          norm(y.row.body ?? "").length - norm(x.row.body ?? "").length ||
          quoteNumber(x.row.quote_key) - quoteNumber(y.row.quote_key)
      )[0].row;
    }

    const tier = tierOf.get(find(members[0])) ?? "near";
    const ratio = ratioOf.get(find(members[0])) ?? 1;
    decided.push({
      gid,
      tier,
      ratio,
      shape: tier === "exact" ? "identical" : ratio >= DRIFT_RATIO ? "drift" : "excerpt",
      why: whyOf.get(find(members[0])) ?? "",
      flag,
      rows: rows
        .sort((x, y) => quoteNumber(x.row.quote_key) - quoteNumber(y.row.quote_key))
        .map((r) => ({
          ...r,
          action: !survivor ? ("hold" as const) : r.row.id === survivor.id ? ("survive" as const) : ("retire" as const),
        })),
    });
  }

  // Strongest evidence first: identical, then drift, then excerpt — so the
  // rows that need reading are at the bottom where they stay visible.
  const SHAPE_ORDER = { identical: 0, drift: 1, excerpt: 2 };
  decided.sort((a, b) => SHAPE_ORDER[a.shape] - SHAPE_ORDER[b.shape] || a.gid - b.gid);

  /* ---- CSV ---------------------------------------------------------------- */
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = [
    "group", "tier", "shape", "ratio", "why", "flag", "quote_key", "id", "voice", "slot",
    "body_140", "linked", "proposed_action", "decision",
  ];
  const lines = [head.join(",")];
  decided.forEach((g) =>
    g.rows.forEach((r) =>
      lines.push(
        [
          g.gid, g.tier, g.shape, g.ratio.toFixed(2), g.why, g.flag,
          r.row.quote_key ?? "", r.row.id, r.row.voice ?? "", r.row.quote_slot ?? "",
          (r.row.body ?? "").slice(0, 140),
          r.linked ? "linked" : "",
          r.action,
          "", // decision — Ryan fills: ok | keep-both | swap
        ].map(esc).join(",")
      )
    )
  );

  if (crossVoice.length) {
    lines.push("");
    lines.push("# identical text, different voice — misattribution, no action proposed");
    lines.push(head.join(","));
    crossVoice.forEach((p, i) =>
      [p.a, p.b].forEach((r) =>
        lines.push(
          [
            `V${i + 1}`, "voice-conflict", "identical", "1.00", "identical text", "different voice",
            r.quote_key ?? "", r.id, r.voice ?? "", r.quote_slot ?? "",
            (r.body ?? "").slice(0, 140), inbound.has(r.id) ? "linked" : "", "none", "",
          ].map(esc).join(",")
        )
      )
    );
  }

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/quote-duplicates.csv", lines.join("\n") + "\n");

  /* ---- Console summary ---------------------------------------------------- */
  const exact = decided.filter((g) => g.tier === "exact");
  const near = decided.filter((g) => g.tier === "near");
  const retiring = decided.flatMap((g) => g.rows).filter((r) => r.action === "retire");
  const held = decided.filter((g) => g.rows.some((r) => r.action === "hold"));
  const overridden = decided.filter((g) => g.flag.startsWith("link overrides"));

  /*
   * Exact PAIRS, not exact groups. A group holding one identical pair and one
   * looser variant is reported as near — the weaker evidence wins, because that
   * is the row that needs reading — which would otherwise hide the identical
   * pair inside it from this count entirely.
   */
  const exactPairs = pairs.filter((p) => p.tier === "exact").length;

  console.log(`  duplicate groups            : ${decided.length}`);
  console.log(`    exact                     : ${exact.length}`);
  console.log(`    near                      : ${near.length}`);
  console.log(`      of those, drift         : ${near.filter((g) => g.shape === "drift").length}`);
  console.log(`      of those, excerpt       : ${near.filter((g) => g.shape === "excerpt").length}`);
  console.log(`  identical pairs, any group  : ${exactPairs}`);
  console.log(`  rows proposed for retirement: ${retiring.length}`);
  console.log(`  no survivor proposed        : ${held.length}`);
  console.log(`  link overrode the text rule : ${overridden.length}`);
  console.log(`  identical text, other voice : ${crossVoice.length}`);

  console.log(`\n  GROUPS\n`);
  decided.forEach((g) => {
    console.log(
      `  ${String(g.gid).padStart(3)}  ${g.tier.padEnd(5)} ${g.shape.padEnd(9)} ` +
        `${g.ratio.toFixed(2)}  ${g.why}${g.flag ? `   [${g.flag}]` : ""}`
    );
    g.rows.forEach((r) =>
      console.log(
        `        ${(r.row.quote_key ?? "—").padEnd(6)} ${r.action.padEnd(8)}` +
          `${r.linked ? "LINKED " : "       "}${(r.row.voice ?? "—").padEnd(16)}` +
          `${(r.row.body ?? "").slice(0, 62)}`
      )
    );
  });

  if (crossVoice.length) {
    console.log(`\n  IDENTICAL TEXT, DIFFERENT VOICE — no action proposed\n`);
    crossVoice.forEach((p) => {
      console.log(`    ${p.a.quote_key} (${p.a.voice})  vs  ${p.b.quote_key} (${p.b.voice})`);
      console.log(`      ${(p.a.body ?? "").slice(0, 76)}`);
    });
  }

  console.log(`\n  wrote reports/quote-duplicates.csv — nothing was written to the database.\n`);
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
  main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
}
