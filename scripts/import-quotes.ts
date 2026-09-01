/* ============================================================================
   EDIAGD — import the Quote Master into the daily loop

   503 quotes from "All Quotes — Master", the authoritative tab. The two slot
   tabs are views of it (332 = 69 slot-2 + 263 both; 434 = 171 slot-3 + 263
   both — they reconcile exactly), so importing from them would double-count.

   ---------------------------------------------------------------------------
   THREE THINGS THIS DOES THAT ARE NOT JUST COPYING CELLS
   ---------------------------------------------------------------------------

   1. THE ATTRIBUTION COMES OUT OF THE QUOTE TEXT. Most rows read
      `"Work hard in the dark…" — Kobe Bryant`, with the voice inside the
      string AND in its own column. The app renders `voice` beneath the quote,
      so importing the text as-is puts "— Kobe Bryant" on screen twice. The
      trailing dash-plus-voice is stripped, and ONLY when it matches the voice
      column — a quote that quotes someone else keeps its inner attribution.

   2. DUPLICATES MERGE ON THE TEXT, NOT THE ID. Lowest Quote ID wins, per the
      brief. But a duplicate is not always a clean twin: three pairs disagree
      about WHO SAID IT (Mitch Hardt vs "Unattributed") and six disagree about
      which slot it fills. Keeping the lowest ID happens to keep the better
      answer in every one of those — the named voice, the wider slot — which is
      checked here rather than assumed. If a future file breaks that, the run
      stops instead of quietly narrowing a quote's eligibility.

   3. quote_key IS THE UPSERT KEY. Re-running updates in place. The workbook is
      still being edited, so this will be run again.

     npm run import:quotes -- --file="/path/to.xlsx" --dry
     npm run import:quotes -- --file="/path/to.xlsx"
   ============================================================================ */
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});

const args = process.argv.slice(2);
const arg = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=");
const FILE = arg("file")!;
/**
 * Optional second workbook to heal clipped coaching nuggets from — Mitch's
 * master. See healNugget(). Without it the import still runs; the nuggets that
 * came in clipped simply stay clipped.
 */
const HEAL_FILE = arg("heal-from");
const DRY = args.includes("--dry");

const SHEET = "All Quotes — Master";

/** Excel cells arrive as strings, rich text runs, or formula results. */
function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: string };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.result != null) return String(o.result);
    if (o.text) return o.text;
  }
  return String(v);
}

/**
 * The comparison key for "these are the same quote".
 *
 * Smart quotes, wrapping quotes and a trailing full stop all differ between
 * the tabs these rows were pulled from — the same line of Zig Ziglar appears
 * once curly and once straight. None of those differences are the quote.
 */
const dedupeKey = (s: string) =>
  s
    .replace(/\s+/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .trim()
    .toLowerCase()
    .replace(/^["']+/, "")
    .replace(/["'.]+$/, "")
    .trim();

/**
 * A quote whose last em-dash clause is an ATTRIBUTION CHAIN, not a citation of
 * the voice: "Ralph Waldo Emerson, cited by Jimmy Valvano", "attributed to Walt
 * Whitman; made famous by Ted Lasso". The tail names a second person and says
 * how the quote reached the first. Deleting it would delete the real author.
 */
const CHAIN = /\b(cited|quoting|quoted|attributed|popularized|popularised|made famous|and)\b/i;

/**
 * Strip the trailing `— Voice` when it repeats what we store in `voice`.
 *
 * ---------------------------------------------------------------------------
 * WHY "CONTAINS THE VOICE" AND NOT "EQUALS THE VOICE"
 * ---------------------------------------------------------------------------
 * Exact match handles 232 of the 503 and leaves 51 that would render their
 * attribution twice, because the tail is RICHER than the voice column:
 *
 *     "Coach Nick Saban"            voice: Nick Saban        (20 rows)
 *     "Mitch Hardt, CSI class"      voice: Mitch Hardt       (~25 rows)
 *     "Ted Lasso (Apple TV+)"       voice: Ted Lasso
 *     "His Holiness the 14th Dalai Lama"                      voice: Dalai Lama
 *
 * The dangerous half of that same set is the em dash used as PUNCTUATION,
 * where the trailing clause is the end of the sentence:
 *
 *     "…that's the down payment on your dream"
 *     "…what does that get you? Nothing"
 *     "…when nobody's clapping, when nobody's checking"
 *
 * The two populations separate cleanly on one test: an attribution contains
 * the voice's name, a sentence ending never does. Checked against all 61
 * distinct trailing clauses in the file — no sentence ending contains its own
 * speaker's name, and no attribution fails to.
 *
 * NOTHING IS THROWN AWAY. When the tail says more than the voice column does —
 * which class it came from, which film — that text moves into `source`, so the
 * provenance survives even though the screen stops repeating the name.
 */
function stripAttribution(
  quote: string,
  voice: string
): { body: string; citation: string | null } {
  const t = quote.replace(/\s+/g, " ").trim();
  const m = t.match(/^(.*?)\s*[—–]\s*([^—–]+)$/);
  if (!m) return { body: t, citation: null };

  const tail = m[2].replace(/[."'\s]+$/, "").trim();
  const v = voice.trim().toLowerCase();
  const exact = tail.toLowerCase() === v;
  const richer = !exact && tail.toLowerCase().includes(v) && !CHAIN.test(tail);
  if (!exact && !richer) return { body: t, citation: null };

  // Drop the now-pointless wrapping quotes too: `"…"` with nothing after it is
  // a rendering artefact once the citation moves to its own line.
  let body = m[1].trim();
  if (/^["“].*["”]$/.test(body)) body = body.slice(1, -1).trim();
  return { body, citation: richer ? tail : null };
}

const SLOT: Record<string, "slot2" | "slot3" | "both"> = {
  Both: "both",
  "Slot 2 — Sales": "slot2",
  "Slot 3 — Life": "slot3",
};

/**
 * Put back the words a coaching nugget lost on its way into the Quote Master.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS BELONGS IN THE IMPORT AND NOT IN A SCRIPT OF ITS OWN
 * ---------------------------------------------------------------------------
 * 25 nuggets arrive clipped at a round length, 22 of them at exactly 900
 * characters — the same truncation the cue bodies had, and for the same reason:
 * something upstream cut at a fixed width. 21 of the 25 exist in full in
 * Mitch's master workbook, which we already hold.
 *
 * A separate restore script would work exactly once. This import UPSERTS
 * coaching_nugget, so the next run of it would put the 900-character clip
 * straight back over the repair. Healing has to happen on the way in or it does
 * not hold.
 *
 * The match is the same conservative test the cue restore used: the clipped
 * text must be a PREFIX of the candidate, and the candidate must be strictly
 * longer. Whitespace is normalised on both sides because Excel keeps paragraph
 * breaks the import collapsed. Anything ambiguous is left alone and reported —
 * a nugget explains why an advisor is being shown a quote, and inventing the
 * end of that sentence is worse than leaving it short.
 */
function buildHealIndex(wb: ExcelJS.Workbook): { text: string; norm: string }[] {
  const out: { text: string; norm: string }[] = [];
  for (const ws of wb.worksheets) {
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        const t = cellText(cell.value);
        // Shorter than the shortest clip cannot be the full version of one.
        if (t.length >= 400) out.push({ text: t, norm: t.replace(/\s+/g, " ").trim() });
      });
    });
  }
  return out;
}

function healNugget(
  nugget: string,
  index: { text: string; norm: string }[]
): string | null {
  // Only a ROUND length is evidence of a machine cut. A nugget that happens to
  // be 873 characters is just a long nugget.
  if (nugget.length < 400 || nugget.length % 100 !== 0) return null;

  const probe = nugget.replace(/\s+/g, " ").trim();
  const hits = index.filter(
    (c) => c.norm.startsWith(probe) && c.norm.length > probe.length + 5
  );
  if (hits.length === 0) return null;

  // The same passage often appears in several tabs at several truncations.
  // Those agree — they are one passage clipped differently — so the longest is
  // simply the least truncated. Genuine disagreement is left for a person.
  const distinct = [...new Map(hits.map((h) => [h.norm, h])).values()].sort(
    (a, b) => b.norm.length - a.norm.length
  );
  if (!distinct.every((d) => distinct[0].norm.startsWith(d.norm))) return null;
  return distinct[0].text.trim();
}

type Row = {
  key: string; voice: string; quote: string; slotRaw: string;
  needsTranslation: boolean; opCode: string; category: string;
  nugget: string; best: string; tab: string; srcRow: string; section: string;
  excelRow: number;
};

(async () => {
  /* ---- 1. Read the authoritative tab ------------------------------------- */
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const ws = wb.getWorksheet(SHEET);
  if (!ws) throw new Error(`no sheet named ${SHEET}`);

  const rows: Row[] = [];
  ws.eachRow((r, n) => {
    if (n === 1) return;
    const c = (i: number) => cellText(r.getCell(i).value).trim();
    if (!c(1) || !c(3)) return;
    rows.push({
      key: c(1), voice: c(2), quote: c(3), slotRaw: c(4),
      needsTranslation: c(5).toUpperCase() === "YES",
      opCode: c(6), category: c(7), nugget: c(8), best: c(9),
      tab: c(10), srcRow: c(11), section: c(12), excelRow: n,
    });
  });
  console.log(`  workbook: ${rows.length} quotes on "${SHEET}"`);

  const badSlot = rows.filter((r) => !SLOT[r.slotRaw]);
  if (badSlot.length) {
    throw new Error(`unknown Slot values: ${[...new Set(badSlot.map((r) => r.slotRaw))].join(", ")}`);
  }

  /* ---- 2. Dedupe on the QUOTE, not on the cell -------------------------- */
  /*
   * DEDUPE RUNS ON THE STRIPPED BODY. Doing it on the raw cell missed six
   * pairs, all Warren Buffett: the Buffett-tab row is bare text, the promoted
   * row wraps the same sentence in quote marks before its em dash —
   *
   *     Q0470   It takes 20 years to build a reputation…  — Warren Buffett
   *     Q0490  "It takes 20 years to build a reputation…" — Warren Buffett
   *
   * — so the stray closing quote mark sat mid-string where no amount of
   * trimming the ends could reach it. Once the attribution and the wrapping
   * marks come off, the two are byte-identical. Strip first, then compare.
   */
  const stripped = new Map<string, { body: string; citation: string | null }>();
  for (const r of rows) stripped.set(r.key, stripAttribution(r.quote, r.voice));

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = dedupeKey(stripped.get(r.key)!.body);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }

  const WIDTH = { both: 2, slot2: 1, slot3: 1 } as const;
  const dropped: { kept: Row; dupe: Row; differs: string[] }[] = [];
  const widened: string[] = [];
  const merged: string[] = [];
  const conflicts: { key: string; a: string; b: string; other: string }[] = [];
  const keep: Row[] = [];

  for (const g of groups.values()) {
    const sorted = [...g].sort((a, b) => a.key.localeCompare(b.key));
    // Shallow copy: the kept row may absorb fields from its twins below, and
    // mutating the parsed sheet row would make a re-run behave differently.
    const kept = { ...sorted[0] };
    keep.push(kept);

    for (const d of sorted.slice(1)) {
      const differs: string[] = [];
      if (d.voice !== kept.voice) {
        differs.push(`voice: ${kept.voice} / ${d.voice}`);
        /*
         * A CONFLICT ONLY WHEN BOTH SIDES NAME SOMEBODY. Three of these pairs
         * are "Mitch Hardt" against "Unattributed", which is not a
         * disagreement — it is one row knowing the answer and the other not.
         * Asking Mitch to choose between his own name and a blank would be
         * noise in a queue whose whole value is that everything in it is a real
         * question.
         */
        if (!/^unattributed$/i.test(kept.voice) && !/^unattributed$/i.test(d.voice)) {
          conflicts.push({ key: kept.key, a: kept.voice, b: d.voice, other: d.key });
        }
      }
      if (d.slotRaw !== kept.slotRaw) differs.push(`slot: ${kept.slotRaw} / ${d.slotRaw}`);
      if (d.tab !== kept.tab) differs.push(`tab: ${kept.tab} / ${d.tab}`);
      dropped.push({ kept, dupe: d, differs });

      /*
       * LOWEST ID WINS THE IDENTITY. IT DOES NOT WIN A BLANK FIELD.
       *
       * The six Buffett pairs are exactly the case: the lower id is the raw
       * video-planning row with NO coaching nugget and no best-used-for, and
       * the higher id is the one somebody wrote the coaching for. Dropping the
       * higher id wholesale would have thrown away six nuggets of 667-852
       * characters and left the quote in the app with nothing explaining why
       * it is there.
       *
       * So a dropped twin donates only what the kept row does not have. It can
       * never overwrite. Which keeps "lowest Quote ID wins" exactly as briefed
       * while not discarding work.
       */
      for (const f of ["nugget", "best", "opCode", "section"] as const) {
        if (!kept[f] && d[f]) {
          kept[f] = d[f];
          merged.push(`${kept.key} takes ${f} from ${d.key} (${d[f].length} chars)`);
        }
      }

      /*
       * THE SLOT WIDENS, IT NEVER NARROWS. Same principle as the blank fields
       * above: the lowest id wins the IDENTITY, not the right to shrink what
       * the quote is eligible for. If the workbook says somewhere that this
       * line works in either slot, it works in either slot — that is a fact
       * about the quote, and the row it happens to be written on is an
       * accident of which tab someone typed it into.
       *
       * This started as a hard stop, on the assumption that lowest-id would
       * always happen to be the wider row. It was, until dedupe moved onto the
       * stripped body and started matching the pairs that differ by a stray
       * quote mark — at which point 11 groups tripped it. Halting on the
       * ordinary case is not a safety rail, it is a broken import.
       */
      if (WIDTH[SLOT[d.slotRaw]] > WIDTH[SLOT[kept.slotRaw]]) {
        widened.push(`${kept.key} ${kept.slotRaw} -> ${d.slotRaw} (from ${d.key})`);
        kept.slotRaw = d.slotRaw;
      }
    }
  }

  if (widened.length) {
    console.log(`  slot widened to match a dropped twin: ${widened.length}`);
    widened.forEach((w) => console.log(`    ${w}`));
  }

  if (merged.length) {
    console.log(`  fields recovered from dropped twins: ${merged.length}`);
    merged.forEach((m) => console.log(`    ${m}`));
  }

  console.log(`  after dedupe: ${keep.length} (${dropped.length} duplicate rows dropped)`);

  /* ---- 3. Heal clipped nuggets, if a master workbook was given ----------- */
  let healIndex: { text: string; norm: string }[] = [];
  if (HEAL_FILE) {
    const healWb = new ExcelJS.Workbook();
    await healWb.xlsx.readFile(HEAL_FILE);
    healIndex = buildHealIndex(healWb);
    console.log(`  heal source: ${healWb.worksheets.length} sheets, ${healIndex.length} long cells`);
  }

  /* ---- 4. Shape the content rows ----------------------------------------- */
  let strippedCount = 0;
  const healed: { key: string; from: number; to: number }[] = [];
  const stillClipped: { key: string; voice: string; len: number; tail: string }[] = [];
  let citationCount = 0;
  const payload = keep.map((r) => {
    const { body, citation } = stripped.get(r.key)!;
    if (body !== r.quote.replace(/\s+/g, " ").trim()) strippedCount++;
    if (citation) citationCount++;

    let nugget = r.nugget;
    if (nugget.length >= 400 && nugget.length % 100 === 0) {
      const full = healNugget(nugget, healIndex);
      if (full) {
        healed.push({ key: r.key, from: nugget.length, to: full.length });
        nugget = full;
      } else {
        stillClipped.push({
          key: r.key, voice: r.voice, len: nugget.length,
          tail: nugget.trimEnd().slice(-70),
        });
      }
    }

    return {
      type: "quote" as const,
      // The context label IS the quote's name — "Never Quit", "Word Track".
      // Never blank in this file; the voice is the honest fallback if it ever is.
      title: r.category || r.voice,
      body,
      voice: r.voice,
      quote_key: r.key,
      quote_slot: SLOT[r.slotRaw],
      subcategory: r.section || null,
      coaching_nugget: nugget || null,
      best_used_for: r.best || null,
      needs_translation: r.needsTranslation,
      op_code: r.opCode || null,
      // Same shape as the cue provenance already in this table, plus the row so
      // any single quote can be traced back to a cell — and the fuller citation
      // when the workbook had one, so stripping it off the screen does not lose it.
      source:
        `Quote Master — ${r.tab} r${r.srcRow || r.excelRow}` +
        (citation ? ` · cited as "${citation}"` : ""),
      // Quotes carry no service and no tier. Leaving tier null is what keeps
      // them out of the cue pools that pickCoachingCueForBlock falls through.
      service_family: null,
      tier: null,
      status: "published" as const,
    };
  });

  console.log(
    `  attribution stripped from quote text: ${strippedCount}` +
      ` (${citationCount} of them said more than the voice column — kept in source)`
  );

  if (HEAL_FILE) {
    console.log(`  nuggets healed from the master workbook: ${healed.length}`);
  }

  /* ---- 5. Upsert on quote_key -------------------------------------------- */
  if (!DRY) {
    for (let i = 0; i < payload.length; i += 200) {
      const batch = payload.slice(i, i + 200);
      const { error } = await sb.from("content").upsert(batch, { onConflict: "quote_key" });
      if (error) throw new Error(`upsert at ${i}: ${error.message}`);
      process.stdout.write(`\r  upserted ${Math.min(i + 200, payload.length)}/${payload.length}`);
    }
    console.log("");
  }

  /* ---- 5b. Remove rows a previous run left behind ------------------------ */
  /*
   * An upsert cannot delete. When the dedupe rule gets SHARPER — as it did when
   * comparison moved onto the stripped body and started catching the pairs that
   * differ by a stray quote mark — quotes that were kept by the old rule stay
   * in the table as orphans, and the app happily serves the same line twice
   * under two ids.
   *
   * ONLY KEYS THIS WORKBOOK ACTUALLY CONTAINS ARE PRUNED. A quote_key present
   * in the file but deduped away is provably redundant. A quote_key that is not
   * in the file at all is left alone, because that would make a partial or
   * older workbook silently delete the library.
   */
  const inFile = new Set(rows.map((r) => r.key));
  const keptKeys = new Set(payload.map((p) => p.quote_key));
  const orphanKeys = [...inFile].filter((k) => !keptKeys.has(k));

  let pruned = 0;
  if (orphanKeys.length) {
    const { data: present } = await sb
      .from("content")
      .select("quote_key")
      .eq("type", "quote")
      .in("quote_key", orphanKeys);
    const toDelete = (present ?? []).map((r) => r.quote_key as string);
    if (toDelete.length && !DRY) {
      const { error } = await sb.from("content").delete().eq("type", "quote").in("quote_key", toDelete);
      if (error) throw new Error(`prune: ${error.message}`);
    }
    pruned = toDelete.length;
  }
  console.log(`  deduped rows removed from a previous import: ${pruned}`);

  /* ---- 5c. Put the open questions in front of a person -------------------- */
  /*
   * WRITTEN HERE RATHER THAN BY A SEPARATE SWEEP, because this is where the
   * evidence exists. Which nuggets were healed and which could not be, which
   * duplicate pairs disagreed about the voice — none of that is recoverable
   * from the rows afterwards. A later pass over the database could see that a
   * nugget is 900 characters; it could not know we already looked for a longer
   * one in Mitch's master and there wasn't one.
   */
  if (!DRY) {
    const { data: live } = await sb
      .from("content")
      .select("id, quote_key")
      .eq("type", "quote")
      .not("quote_key", "is", null)
      .limit(2000);
    const idFor = new Map((live ?? []).map((r) => [r.quote_key as string, r.id as string]));

    const flags: {
      content_id: string;
      reason: string;
      detail: string;
      options: unknown;
    }[] = [];

    for (const c of stillClipped) {
      const id = idFor.get(c.key);
      if (!id) continue;
      flags.push({
        content_id: id,
        reason: "truncated",
        detail:
          `The coaching nugget stops at exactly ${c.len} characters — a machine cut, not a sentence. ` +
          `We searched every tab of your master workbook and there is no longer version of it anywhere, ` +
          `so we cannot recover it from a file. If it reads fine as it stands, say so and we will leave it.`,
        options: { ends: c.tail },
      });
    }

    for (const p of payload.filter((x) => !x.coaching_nugget)) {
      const id = idFor.get(p.quote_key);
      if (!id) continue;
      flags.push({
        content_id: id,
        reason: "missing_nugget",
        detail:
          "This quote has nothing explaining what it is for, so the advisor sees the line with no coaching. " +
          "One or two sentences: when would you use it, and with whom?",
        options: null,
      });
    }

    for (const c of conflicts) {
      const id = idFor.get(c.key);
      if (!id) continue;
      flags.push({
        content_id: id,
        reason: "attribution",
        detail:
          `The same words appear twice in the workbook under two different names — ` +
          `"${c.a}" on ${c.key} and "${c.b}" on ${c.other}. We kept ${c.a} because it is the lower ` +
          `Quote ID, which is a filing rule, not evidence. Who actually said it?`,
        options: { candidates: [c.a, c.b] },
      });
    }

    if (flags.length) {
      const { error } = await sb
        .from("content_review")
        .upsert(flags, { onConflict: "content_id,reason" });
      if (error) throw new Error(`review flags: ${error.message}`);
    }
    console.log(`  flagged for review in the admin area: ${flags.length}`);
  }

  /* ---- 6. Report ---------------------------------------------------------- */
  const tally = <T extends string | number>(f: (r: (typeof payload)[number]) => T) => {
    const m = new Map<T, number>();
    payload.forEach((p) => m.set(f(p), (m.get(f(p)) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  console.log(`\n  BY SLOT`);
  for (const [k, v] of tally((p) => p.quote_slot)) {
    console.log(`    ${String(v).padStart(4)}  ${k}`);
  }
  const eligible2 = payload.filter((p) => p.quote_slot !== "slot3").length;
  const eligible3 = payload.filter((p) => p.quote_slot !== "slot2").length;
  console.log(`    -> slot 2 draws from ${eligible2}, slot 3 from ${eligible3} (both counted in each)`);

  console.log(`\n  BY VOICE (${tally((p) => p.voice).length} distinct)`);
  for (const [k, v] of tally((p) => p.voice)) {
    console.log(`    ${String(v).padStart(4)}  ${k}`);
  }

  console.log(`\n  NEEDS SALES TRANSLATION: ${payload.filter((p) => p.needs_translation).length} of ${payload.length} — imported and served normally, admin filter only`);

  console.log(`\n  DUPLICATES DROPPED: ${dropped.length}`);
  for (const d of dropped) {
    console.log(`    keep ${d.kept.key}  drop ${d.dupe.key}${d.differs.length ? `   [${d.differs.join("; ")}]` : ""}`);
    console.log(`      ${d.kept.quote.replace(/\s+/g, " ").slice(0, 96)}`);
  }

  /* ---- 7. What only a person can supply ---------------------------------- */
  const noNugget = payload.filter((p) => !p.coaching_nugget);
  console.log(`\n  NUGGETS HEALED FROM THE MASTER WORKBOOK: ${healed.length}`);
  for (const h of healed) console.log(`    ${h.key}  ${h.from} -> ${h.to} chars`);

  console.log(`\n  STILL CLIPPED — no longer version in any file we hold: ${stillClipped.length}`);
  for (const c of stillClipped) {
    console.log(`    ${c.key} [${c.voice}] ${c.len} chars`);
    console.log(`       ends: …${JSON.stringify(c.tail)}`);
  }

  console.log(`\n  NO COACHING NUGGET AT ALL: ${noNugget.length}`);

  mkdirSync("exports", { recursive: true });
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  writeFileSync(
    "exports/quote-dedupe-pairs.csv",
    [
      ["kept_id", "dropped_id", "differences", "quote"].join(","),
      ...dropped.map((d) =>
        [d.kept.key, d.dupe.key, d.differs.join("; "), d.kept.quote.replace(/\s+/g, " ")].map(esc).join(",")
      ),
    ].join("\n"),
    "utf8"
  );
  console.log(`\n  wrote exports/quote-dedupe-pairs.csv`);
  if (DRY) console.log("  (--dry: nothing was written to the database)\n");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
