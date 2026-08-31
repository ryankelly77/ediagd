/* ============================================================================
   EDIAGD — retire the quotes that were entered twice

   Reads reports/quote-duplicates.csv and acts on the DRIFT AND EXACT groups
   only. Dry run by default.

   ---------------------------------------------------------------------------
   WHY ONLY DRIFT AND EXACT
   ---------------------------------------------------------------------------
   Those groups are mechanical: the same line, entered twice, differing by a
   word or a comma. There is nothing to decide, so a script can decide it.

   The excerpt tier is not mechanical. A short standalone line living inside a
   longer passage may be deliberate — the punchy version is what fits on a
   card — and in the worst case (group 10) a passage contains two DIFFERENT
   lines, so retiring both to keep the passage destroys two usable quotes. That
   is an editorial call, it belongs to Mitch, and it belongs in the app rather
   than in a spreadsheet round trip. This script counts those groups and leaves
   them alone; the Duplicates review queue is where they get answered.

   ---------------------------------------------------------------------------
   RETIRE, NEVER DELETE
   ---------------------------------------------------------------------------
   Same shape as the admin's Retire button: `retired_at` plus `status='draft'`.
   Every foreign key survives — an advisor who kept the losing row still has it
   on their shelf, and the rotation drops it because the pool filters on
   `status='published'`. Reversible by clearing the date.

   ---------------------------------------------------------------------------
   WHAT MOVES BEFORE A ROW IS RETIRED
   ---------------------------------------------------------------------------
   INBOUND artifact_id. A video pointing at the retiring row is repointed at the
   survivor first. Leaving it would give the daily loop a withdrawn twin and
   silently disable the same-day dedup that link exists for.

   SLOT MEMBERSHIP. If the retiring row served slot2 and the survivor only
   slot3, retiring it narrows where the idea can appear. The survivor absorbs
   the union, so the idea keeps its reach and only its wording changes.

   Daily-loop history is left alone on purpose: it records what WAS served, and
   rewriting it would make a completed day claim something that did not happen.

     npm run dedupe:quotes -- --from=reports/quote-duplicates.csv
     npm run dedupe:quotes -- --from=reports/quote-duplicates.csv --apply
     npm run dedupe:quotes -- --verify
   ============================================================================ */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const sb = createClient(process.env.SB_URL!, process.env.SB_KEY!, {
  auth: { persistSession: false },
});

const args = process.argv.slice(2);
const FROM = args.find((a) => a.startsWith("--from="))?.split("=").slice(1).join("=");
const APPLY = args.includes("--apply");
const VERIFY = args.includes("--verify");

/** Minimal RFC-4180 reader — quote bodies contain commas. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(cell); cell = ""; continue; }
    if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const kept = rows.filter((r) => r.some((v) => v.trim()) && !r[0].startsWith("#"));
  const [head, ...body] = kept;
  return body
    // The cross-voice section repeats the header, and a repeated header would
    // otherwise parse as a data row with group="group".
    .filter((r) => r[0] !== head[0])
    .map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

type Member = {
  quoteKey: string;
  id: string;
  voice: string;
  slot: string;
  action: string;
  linked: boolean;
};
type Group = { gid: string; tier: string; shape: string; why: string; members: Member[] };

function readGroups(from: string): Group[] {
  const rows = parseCsv(readFileSync(from, "utf8"));
  const byGid = new Map<string, Group>();
  for (const r of rows) {
    if (r.tier === "voice-conflict") continue;
    const gid = r.group;
    if (!byGid.has(gid)) {
      byGid.set(gid, { gid, tier: r.tier, shape: r.shape, why: r.why, members: [] });
    }
    byGid.get(gid)!.members.push({
      quoteKey: r.quote_key,
      id: r.id,
      voice: r.voice,
      slot: r.slot,
      action: r.proposed_action,
      linked: r.linked === "linked",
    });
  }
  return [...byGid.values()];
}

/** The union of two slot values. 'both' absorbs everything. */
function unionSlot(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  if (a === b) return a;
  return "both";
}

(async () => {
  if (VERIFY) {
    /* ---- 1. No live row still has a twin in a resolved group -------------- */
    const live: { id: string; body: string | null; voice: string | null; quote_key: string | null }[] = [];
    for (let o = 0; ; o += 1000) {
      const { data, error } = await sb
        .from("content")
        .select("id, body, voice, quote_key")
        .eq("format", "quote")
        .is("retired_at", null)
        .order("id")
        .range(o, o + 999);
      if (error) throw new Error(error.message);
      live.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const norm = (s: string) =>
      (s ?? "").toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
        .replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();

    /*
     * DEFERRED ROWS ARE NOT FAILURES.
     *
     * An identical pair can legitimately still be live: group 16 holds two
     * rows that normalize the same AND a longer passage, so the group's
     * min-ratio classified all three as excerpt and sent them to Mitch. Part A
     * was right not to touch it, and a verify that counted it would never pass
     * until the queue was empty — which makes it useless as a gate on Part A.
     *
     * So the check is scoped to what this script was responsible for, and what
     * is waiting on a person is reported separately rather than hidden.
     */
    const deferred = new Set<string>();
    if (FROM) {
      readGroups(FROM)
        .filter((g) => g.shape === "excerpt")
        .forEach((g) => g.members.forEach((m) => deferred.add(m.id)));
    }

    const seen = new Map<string, string>();
    const dupes: string[] = [];
    const waiting: string[] = [];
    for (const r of live) {
      const k = `${r.voice ?? ""}|${norm(r.body ?? "")}`;
      if (seen.has(k)) {
        const pair = `${seen.get(k)} / ${r.quote_key}`;
        if (deferred.has(r.id)) waiting.push(pair);
        else dupes.push(pair);
      } else seen.set(k, r.quote_key ?? r.id);
    }

    /* ---- 2. Nothing retired is still pointed at --------------------------- */
    const { data: links } = await sb
      .from("content")
      .select("id, title, artifact_id")
      .not("artifact_id", "is", null);
    let orphaned = 0;
    for (const l of links ?? []) {
      const { data: t } = await sb
        .from("content")
        .select("quote_key, retired_at")
        .eq("id", l.artifact_id as string)
        .maybeSingle();
      if (t?.retired_at) { orphaned++; console.log(`    POINTS AT RETIRED  ${l.title} -> ${t.quote_key}`); }
    }

    console.log(`\n  VERIFY\n`);
    console.log(`  live quotes                     : ${live.length}`);
    console.log(`  live exact duplicates remaining : ${dupes.length}`);
    dupes.forEach((d) => console.log(`    ${d}`));
    console.log(`  identical pairs left for Mitch  : ${waiting.length}${FROM ? "" : "   (pass --from to separate these)"}`);
    waiting.forEach((d) => console.log(`    ${d}   in an excerpt group, queued`));
    console.log(`  links pointing at a retired row : ${orphaned}`);
    console.log(`\n  ${dupes.length === 0 && orphaned === 0 ? "PASS" : "FAIL"}\n`);
    return;
  }

  if (!FROM) {
    console.error("  --from=<csv> is required.\n");
    process.exit(1);
  }

  const all = readGroups(FROM);
  const mechanical = all.filter((g) => g.shape === "identical" || g.shape === "drift");
  const editorial = all.filter((g) => g.shape === "excerpt");

  console.log(`  ${all.length} groups in ${FROM.split("/").pop()}`);
  console.log(`    mechanical (exact + drift): ${mechanical.length}   <- this script acts on these`);
  console.log(`    editorial  (excerpt)      : ${editorial.length}   <- left for the review queue\n`);

  /* ---- Resolve every row fresh, then check the whole group before writing -- */
  const ids = mechanical.flatMap((g) => g.members.map((m) => m.id));
  const fresh = new Map<string, { id: string; quote_key: string | null; voice: string | null; slot: string | null; retired_at: string | null }>();
  for (let o = 0; o < ids.length; o += 200) {
    const { data, error } = await sb
      .from("content")
      .select("id, quote_key, voice, quote_slot, retired_at")
      .in("id", ids.slice(o, o + 200));
    if (error) throw new Error(error.message);
    (data ?? []).forEach((r) =>
      fresh.set(r.id as string, {
        id: r.id as string,
        quote_key: r.quote_key as string | null,
        voice: r.voice as string | null,
        slot: r.quote_slot as string | null,
        retired_at: r.retired_at as string | null,
      })
    );
  }

  // Inbound links, read now rather than trusted from a file that may be old.
  const inbound = new Map<string, { id: string; title: string }[]>();
  const { data: linkRows } = await sb
    .from("content")
    .select("id, title, artifact_id")
    .not("artifact_id", "is", null);
  (linkRows ?? []).forEach((l) => {
    const t = l.artifact_id as string;
    if (!inbound.has(t)) inbound.set(t, []);
    inbound.get(t)!.push({ id: l.id as string, title: l.title as string });
  });

  type Plan = {
    g: Group;
    survivor: Member;
    retire: Member[];
    slotTo: string | null;
    repoint: { id: string; title: string; from: string }[];
  };
  const plans: Plan[] = [];
  const refused: { g: Group; why: string }[] = [];
  let already = 0;

  for (const g of mechanical) {
    const survivors = g.members.filter((m) => m.action === "survive");
    const retire = g.members.filter((m) => m.action === "retire");

    if (survivors.length !== 1) {
      refused.push({ g, why: `${survivors.length} survivors proposed — needs exactly one` });
      continue;
    }
    if (retire.length === 0) {
      refused.push({ g, why: "nothing to retire" });
      continue;
    }
    const survivor = survivors[0];
    const sFresh = fresh.get(survivor.id);
    if (!sFresh) { refused.push({ g, why: `survivor ${survivor.quoteKey} not found` }); continue; }
    if (sFresh.retired_at) { refused.push({ g, why: `survivor ${survivor.quoteKey} is already retired` }); continue; }

    // A linked row never retires — the video pointing at it would be left
    // aiming at a withdrawn twin.
    const linkedRetiree = retire.find((m) => (inbound.get(m.id) ?? []).length > 0);
    if (linkedRetiree) {
      refused.push({ g, why: `${linkedRetiree.quoteKey} is linked to a video — move the link first` });
      continue;
    }
    const wrongVoice = g.members.find((m) => (fresh.get(m.id)?.voice ?? "") !== (sFresh.voice ?? ""));
    if (wrongVoice) {
      refused.push({ g, why: `voice differs — ${wrongVoice.quoteKey} is "${fresh.get(wrongVoice.id)?.voice}"` });
      continue;
    }

    const open = retire.filter((m) => !fresh.get(m.id)?.retired_at);
    if (open.length === 0) { already++; continue; }

    let slotTo = sFresh.slot;
    open.forEach((m) => { slotTo = unionSlot(slotTo, fresh.get(m.id)?.slot ?? null); });

    plans.push({
      g,
      survivor,
      retire: open,
      slotTo: slotTo === sFresh.slot ? null : slotTo,
      repoint: open.flatMap((m) =>
        (inbound.get(m.id) ?? []).map((v) => ({ ...v, from: m.quoteKey }))
      ),
    });
  }

  for (const p of plans) {
    console.log(
      `  ${p.g.gid.padStart(3)}  ${p.g.shape.padEnd(9)} keep ${p.survivor.quoteKey}` +
        `  retire ${p.retire.map((m) => m.quoteKey).join(" ")}` +
        `${p.slotTo ? `   slot -> ${p.slotTo}` : ""}`
    );
  }
  if (already) console.log(`\n  already resolved (no change): ${already}`);
  if (refused.length) {
    console.log(`\n  REFUSED — reported, not skipped: ${refused.length}`);
    refused.forEach((r) => console.log(`    group ${r.g.gid}  —  ${r.why}`));
  }

  if (!APPLY) {
    const n = plans.reduce((a, p) => a + p.retire.length, 0);
    console.log(`\n  --dry: nothing written. ${plans.length} group(s), ${n} row(s) would retire.\n`);
    return;
  }

  let groups = 0;
  let rows = 0;
  const now = new Date().toISOString();
  for (const p of plans) {
    // Repoint first: a link must never spend a moment aiming at a retired row.
    let failed = false;
    for (const v of p.repoint) {
      const { error } = await sb.from("content").update({ artifact_id: p.survivor.id }).eq("id", v.id);
      if (error) { console.log(`    FAILED repoint ${v.title}: ${error.message}`); failed = true; }
    }
    if (failed) continue;

    if (p.slotTo) {
      const { error } = await sb.from("content").update({ quote_slot: p.slotTo }).eq("id", p.survivor.id);
      if (error) { console.log(`    FAILED slot ${p.survivor.quoteKey}: ${error.message}`); continue; }
    }

    let ok = true;
    for (const m of p.retire) {
      const { error } = await sb
        .from("content")
        .update({ retired_at: now, status: "draft" })
        .eq("id", m.id);
      if (error) { console.log(`    FAILED retire ${m.quoteKey}: ${error.message}`); ok = false; continue; }
      rows++;
    }
    if (ok) groups++;
  }
  console.log(`\n  groups resolved: ${groups}   rows retired: ${rows}   already: ${already}   refused: ${refused.length}\n`);
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
