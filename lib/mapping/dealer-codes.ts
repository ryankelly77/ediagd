/* ============================================================================
   EDIAGD — what the Dealer Codes screen reads
   SERVER ONLY.

   The per-dealer translation table: everything a dealer's DMS sends, ruled onto
   our vocabulary. Two grains, and they are not the same kind of thing.

     SECTION 1  sub-category -> family.  LIVE. Every attach rate on every screen
                is computed through this join, so an edit here moves measured
                numbers and goes through mapping_edit with Correction/Change.

     SECTION 2  DMS op code -> catalog code.  NOTHING READS IT YET. Built so
                that when coaching moves to op-code precision the bridge already
                has an honest effective-dated history. See 0093.

   Sorted by MONEY in both sections. 82 sub-categories arrived in the first file
   and the top ten carry most of the volume; alphabetical order would have
   somebody ruling "Accessories" before "LOF".
   ============================================================================ */

import "server-only";

/* Structural: these helpers only ever call `from`, and are handed the service
   client. Naming the full SupabaseClient buys nothing and costs compatibility. */
type Client = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

/**
 * Every row, not the first thousand.
 *
 * PostgREST caps a response at 1000 rows whatever `.limit()` says — the same
 * cap checkmap.ts documents. Doggett has 1,805 distinct op codes, so a single
 * request returns 1,000 of them and a screen built on it would show 55% of the
 * table while printing a total that looks complete.
 */
async function allRows<T>(
  build: () => { range: (from: number, to: number) => Promise<{ data: T[] | null }> }
): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let off = 0; ; off += PAGE) {
    const { data } = await build().range(off, off + PAGE - 1);
    const page = data ?? [];
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

/* ---------------------------------------------------------------------------
   Dealers
--------------------------------------------------------------------------- */

export type Dealer = {
  id: string;
  name: string;
  rooftopIds: string[];
  rooftopCount: number;
  lockedAt: string | null;
  lockedBy: string | null;
};

/**
 * Every dealer, with its rooftops folded in.
 *
 * `org` was already the dealer grain — one row, Doggett Automotive Group, 11
 * rooftops — so a second dealer is a second row and the picker needs no schema
 * change. That was the brief's test and the model passed it without help.
 *
 * Demo rooftops are excluded the same way the DMS queue excludes them: they
 * carry fabricated data and would put invented volume at the top of a list
 * sorted by volume.
 */
export async function loadDealers(service: Client): Promise<Dealer[]> {
  const [{ data: orgs }, { data: rooftops }] = await Promise.all([
    service.from("org").select("id, name, codes_locked_at, codes_locked_by").order("name"),
    service.from("rooftop").select("id, org_id, name").not("name", "like", "[DEMO]%"),
  ]);

  const byOrg = new Map<string, string[]>();
  for (const r of (rooftops ?? []) as { id: string; org_id: string }[]) {
    const list = byOrg.get(r.org_id) ?? [];
    list.push(r.id);
    byOrg.set(r.org_id, list);
  }

  return ((orgs ?? []) as {
    id: string;
    name: string;
    codes_locked_at: string | null;
    codes_locked_by: string | null;
  }[]).map((o) => {
    const ids = byOrg.get(o.id) ?? [];
    return {
      id: o.id,
      name: o.name,
      rooftopIds: ids,
      rooftopCount: ids.length,
      lockedAt: o.codes_locked_at,
      lockedBy: o.codes_locked_by,
    };
  });
}

/* ---------------------------------------------------------------------------
   Section 1 — sub-categories
--------------------------------------------------------------------------- */

export type SubCategoryRow = {
  subCategory: string;
  /** Summed across the dealer's rooftops. */
  ros: number;
  labor: number;
  storeCount: number;
  /** One entry per rooftop that has ruled — usually all or none. */
  families: { rooftopId: string; family: string | null; status: string }[];
  /** The family every ruled rooftop agrees on, or null when they disagree. */
  family: string | null;
  status: "auto" | "confirmed" | "unmapped" | "not_coachable" | "mixed";
  /** Mitch's deck-map proposal, when one names this sub-category. */
  proposal: {
    canonical: string;
    evidenceRos: number | null;
    evidenceLabor: number | null;
    evidenceStores: number | null;
    evidencePeriod: string | null;
    note: string | null;
  } | null;
  /** Who last ruled it, and when — the audit line. */
  audit: { origin: string | null; updatedAt: string | null; effectiveFrom: string | null } | null;
};

/**
 * Everything the dealer has sent, with its ruling and the money behind it.
 *
 * VOLUME COMES FROM dms_daily_metric, not from the deck map. The deck map's
 * numbers are Mitch's evidence for a PROPOSAL and cover one month; this is what
 * the dealer actually sent across everything loaded. Both are shown, because
 * they answer different questions: "how big is this" and "what did Mitch see
 * when he proposed".
 */
export async function loadSubCategories(
  service: Client,
  dealer: Dealer
): Promise<SubCategoryRow[]> {
  if (dealer.rooftopIds.length === 0) return [];

  const [{ data: metrics }, { data: maps }, { data: proposals }] = await Promise.all([
    /* AGGREGATED IN THE DATABASE (0095). This used to sum dms_daily_metric in
       here behind a .limit(50000) — on a 156,918-row table, which meant the
       screen saw a fraction of the dealer's codes and printed the fraction as
       the total. A cap is only safe when it is bigger than the set can get. */
    allRows<{ sub_category: string; ros: number | null; labor: number | null; store_count: number | null }>(
      () =>
        service
          .from("dealer_sub_category_volume")
          .select("sub_category, ros, labor, store_count")
          .eq("dealer_id", dealer.id)
    ).then((data) => ({ data })),
    service
      .from("sub_category_map_live")
      .select("rooftop_id, sub_category, family, status, origin, updated_at, effective_from")
      .in("rooftop_id", dealer.rooftopIds),
    service
      .from("mapping_alias")
      .select("alias, canonical, confirmed, evidence_ros, evidence_labor, evidence_stores, evidence_period, note")
      .eq("kind", "op_code"),
  ]);

  type Agg = { ros: number; labor: number; storeCount: number };
  const volume = new Map<string, Agg>();
  for (const m of (metrics ?? []) as {
    sub_category: string;
    ros: number | null;
    labor: number | null;
    store_count: number | null;
  }[]) {
    volume.set(m.sub_category, {
      ros: Number(m.ros ?? 0),
      labor: Number(m.labor ?? 0),
      storeCount: Number(m.store_count ?? 0),
    });
  }

  /* Rulings, grouped. A sub-category is usually ruled the same way everywhere —
     "is this coachable" is a property of the work, not of the store — so a
     disagreement is worth showing rather than averaging away. */
  type MapRow = {
    rooftop_id: string;
    sub_category: string;
    family: string | null;
    status: string;
    origin: string | null;
    updated_at: string | null;
    effective_from: string | null;
  };
  const rulings = new Map<string, MapRow[]>();
  for (const r of (maps ?? []) as MapRow[]) {
    const list = rulings.get(r.sub_category) ?? [];
    list.push(r);
    rulings.set(r.sub_category, list);
  }

  const proposalBySub = new Map<string, SubCategoryRow["proposal"]>();
  for (const p of (proposals ?? []) as {
    alias: string;
    canonical: string;
    confirmed: boolean;
    evidence_ros: number | null;
    evidence_labor: number | null;
    evidence_stores: number | null;
    evidence_period: string | null;
    note: string | null;
  }[]) {
    /* Confirmed rows are decisions already made; a proposal is what is still
       waiting. Only the waiting ones get a Confirm button. */
    if (p.confirmed) continue;
    proposalBySub.set(p.alias, {
      canonical: p.canonical,
      evidenceRos: p.evidence_ros,
      evidenceLabor: p.evidence_labor,
      evidenceStores: p.evidence_stores,
      evidencePeriod: p.evidence_period,
      note: p.note,
    });
  }

  /* Every sub-category the dealer has sent OR has a ruling for. A row that was
     ruled and then stopped arriving still matters — it measured months. */
  const names = new Set<string>([...volume.keys(), ...rulings.keys()]);

  const rows: SubCategoryRow[] = [];
  for (const name of names) {
    const v = volume.get(name);
    const ruled = rulings.get(name) ?? [];

    const statuses = new Set(ruled.map((r) => r.status));
    const families = new Set(ruled.map((r) => r.family ?? ""));

    let status: SubCategoryRow["status"];
    if (ruled.length === 0) status = "unmapped";
    else if (statuses.size > 1 || families.size > 1) status = "mixed";
    else status = ([...statuses][0] as SubCategoryRow["status"]) ?? "unmapped";

    /* The newest ruling is the audit line — the screen shows one, not eleven. */
    const newest = [...ruled].sort((a, b) =>
      String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""))
    )[0];

    rows.push({
      subCategory: name,
      ros: Math.round(v?.ros ?? 0),
      labor: Math.round(v?.labor ?? 0),
      storeCount: v?.storeCount ?? 0,
      families: ruled.map((r) => ({
        rooftopId: r.rooftop_id,
        family: r.family,
        status: r.status,
      })),
      family: families.size === 1 ? ([...families][0] || null) : null,
      status,
      proposal: proposalBySub.get(name) ?? null,
      audit: newest
        ? {
            origin: newest.origin,
            updatedAt: newest.updated_at,
            effectiveFrom: newest.effective_from,
          }
        : null,
    });
  }

  /* Money first. This is the whole point of the ordering. */
  rows.sort((a, b) => b.labor - a.labor || b.ros - a.ros);
  return rows;
}

/* ---------------------------------------------------------------------------
   Section 2 — DMS op codes
--------------------------------------------------------------------------- */

export type OpCodeRow = {
  dmsOpCode: string;
  description: string;
  ros: number;
  labor: number;
  storeCount: number;
  /** The ruling, when one has been recorded. */
  canonical: string | null;
  status: "proposed" | "confirmed" | "no_match" | "unruled";
  matchedBy: string | null;
  /** What the auto-matcher suggests, when nothing has been ruled. */
  suggestion: { code: string; name: string; score: number; why: string } | null;
  audit: { origin: string | null; updatedAt: string | null; effectiveFrom: string | null } | null;
};

const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "at", "for", "with",
  "is", "are", "was", "were", "be", "it", "its", "that", "this", "per", "each",
  "service", "svc", "labor", "perform", "performed", "check", "replace",
  "replacement", "install", "installed", "new", "customer", "cust", "veh",
  "vehicle", "recommend", "recommended", "found", "needs", "need",
]);

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

const tokens = (s: string) =>
  new Set(norm(s).split(" ").filter((t) => t.length > 1 && !STOP.has(t)));

/**
 * |A ∩ B| / |A| — how much of the catalog name the description contains.
 *
 * The same scorer the quote matcher uses, and for the same reason: a DMS
 * description is long and a catalog name is short ("PERFORMED A.C. DEODORIZER
 * SERVICE." against "AC Odor Treatment"), so Jaccard would divide by the union
 * and score a true pair near zero. Containment asks the question that matters —
 * is our name present in what they wrote.
 */
function containment(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit / a.size;
}

/** Below this, a suggestion is noise and the row is better left unruled. */
const MATCH_FLOOR = 0.75;

/**
 * A catalog name needs two content-bearing tokens to be matchable at all.
 *
 * The same rule the quote matcher applies, and this is what it is for. "Tires"
 * is one token after stop-words, so containment scores 1.0 against any
 * description containing the word — and Doggett's biggest bucket code, a
 * catch-all whose description happens to mention tires, matched TIR-057 at
 * 100%. A single common word is not evidence.
 */
const MIN_NAME_TOKENS = 2;

export async function loadOpCodes(
  service: Client,
  dealer: Dealer,
  limit = 400
): Promise<{ rows: OpCodeRow[]; total: number; noMatch: number }> {
  if (dealer.rooftopIds.length === 0) return { rows: [], total: 0, noMatch: 0 };

  const [{ data: metrics }, { data: rulings }, { data: catalog }] = await Promise.all([
    /* Aggregated in the database (0095) — see the note in loadSubCategories.
       1,805 distinct codes live behind 156,918 rows. */
    allRows<{ op_code: string; ros: number | null; labor: number | null; store_count: number | null; description: string | null }>(
      () =>
        service
          .from("dealer_op_code_volume")
          .select("op_code, ros, labor, store_count, description")
          .eq("dealer_id", dealer.id)
    ).then((data) => ({ data })),
    service
      .from("dms_op_code_map_live")
      .select("rooftop_id, dms_op_code, canonical_code, status, matched_by, origin, updated_at, effective_from")
      .in("rooftop_id", dealer.rooftopIds),
    service.from("op_code_catalog").select("code, name").is("retired_at", null),
  ]);

  type Agg = { ros: number; labor: number; storeCount: number; description: string };
  const agg = new Map<string, Agg>();
  for (const m of (metrics ?? []) as {
    op_code: string;
    ros: number | null;
    labor: number | null;
    store_count: number | null;
    description: string | null;
  }[]) {
    agg.set(m.op_code.trim(), {
      ros: Number(m.ros ?? 0),
      labor: Number(m.labor ?? 0),
      storeCount: Number(m.store_count ?? 0),
      description: (m.description ?? "").trim(),
    });
  }

  type Ruling = {
    dms_op_code: string;
    canonical_code: string | null;
    status: string;
    matched_by: string | null;
    origin: string | null;
    updated_at: string | null;
    effective_from: string | null;
  };
  const ruled = new Map<string, Ruling>();
  for (const r of (rulings ?? []) as Ruling[]) ruled.set(r.dms_op_code, r);

  const cat = ((catalog ?? []) as { code: string; name: string }[])
    .map((c) => ({ ...c, tokens: tokens(c.name) }))
    .filter((c) => c.tokens.size >= MIN_NAME_TOKENS);

  const all = [...agg.entries()].sort(
    (a, b) => b[1].labor - a[1].labor || b[1].ros - a[1].ros
  );

  const rows: OpCodeRow[] = [];
  let noMatch = 0;

  for (const [code, a] of all) {
    const r = ruled.get(code);
    let suggestion: OpCodeRow["suggestion"] = null;

    if (!r) {
      const descTokens = tokens(`${code} ${a.description}`);
      let best: { code: string; name: string; score: number } | null = null;
      for (const c of cat) {
        const score = containment(c.tokens, descTokens);
        if (score >= MATCH_FLOOR && (!best || score > best.score)) {
          best = { code: c.code, name: c.name, score };
        }
      }
      if (best) {
        suggestion = { ...best, why: "description contains the catalog name" };
      } else {
        noMatch++;
      }
    }

    rows.push({
      dmsOpCode: code,
      description: a.description,
      ros: Math.round(a.ros),
      labor: Math.round(a.labor),
      storeCount: a.storeCount,
      canonical: r?.canonical_code ?? null,
      status: (r?.status as OpCodeRow["status"]) ?? "unruled",
      matchedBy: r?.matched_by ?? null,
      suggestion,
      audit: r
        ? { origin: r.origin, updatedAt: r.updated_at, effectiveFrom: r.effective_from }
        : null,
    });
  }

  return { rows: rows.slice(0, limit), total: rows.length, noMatch };
}

/* ---------------------------------------------------------------------------
   CSV
--------------------------------------------------------------------------- */

/** RFC-4180 enough for a spreadsheet and for the scripts that read these back. */
export function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

/* ---------------------------------------------------------------------------
   What a row's button is allowed to do
--------------------------------------------------------------------------- */

/**
 * Navigate, or write.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A FUNCTION AND NOT AN EXPRESSION INSIDE THE ROW
 * ---------------------------------------------------------------------------
 * Ryan clicked "Rule it…" on two DMS op codes with no suggested match and both
 * were ruled instantly — recorded as "nothing fits", at genesis, across all
 * eleven rooftops, with no dialog and no chance to pick a value. The button was
 * a submit inside a form whose text input defaulted to "" and whose placeholder
 * read "no match", so the placeholder became the ruling.
 *
 * The rule that was violated is small enough to state and therefore small
 * enough to test: A ONE-TAP WRITE IS ONLY EVER LEGITIMATE WHEN THE VALUE SHOWN
 * ON THE ROW IS EXACTLY THE VALUE RECORDED. A row with nothing shown has
 * nothing to confirm, so its button must navigate.
 *
 * scripts/dealer-row-scenarios.ts holds it to that.
 */
export type RowAction =
  | { kind: "navigate"; label: string; weight: RowWeight }
  | { kind: "write"; label: string; weight: RowWeight; value: string };

export type RowWeight = "needs-ruling" | "confirmable" | "ruled";

/** Section 2: a raw DMS op code. */
export function opCodeRowAction(
  row: Pick<OpCodeRow, "status" | "canonical" | "suggestion">,
  locked = false
): RowAction {
  const decided = row.status === "confirmed" || row.status === "no_match";
  if (decided) return { kind: "navigate", label: "Change…", weight: "ruled" };

  /*
   * The ONLY write path. A suggestion exists, it is on screen, and confirming
   * records that exact string — nothing is inferred from an empty box.
   * Locked turns even this into a review: after the table is ruled complete,
   * agreeing with a guess is still an edit to a finished table.
   */
  if (row.suggestion && !locked) {
    return {
      kind: "write",
      label: "Confirm",
      weight: "confirmable",
      value: row.suggestion.code,
    };
  }
  if (row.suggestion) return { kind: "navigate", label: "Review…", weight: "confirmable" };

  /* No suggestion: there is nothing to confirm, so there is nothing to tap. */
  return { kind: "navigate", label: "Rule it…", weight: "needs-ruling" };
}

/** Section 1: a sub-category. Kept here so both grains state the rule once. */
export function subCategoryRowAction(
  row: Pick<SubCategoryRow, "status" | "family">,
  locked = false
): RowAction {
  const decided = row.status === "confirmed" || row.status === "not_coachable";
  if (decided) return { kind: "navigate", label: "Review…", weight: "ruled" };

  const hasValue = row.family !== null && row.status !== "mixed";
  if (hasValue && !locked) {
    return { kind: "write", label: "Confirm", weight: "confirmable", value: row.family as string };
  }
  if (hasValue) return { kind: "navigate", label: "Review…", weight: "confirmable" };

  return { kind: "navigate", label: "Rule it…", weight: "needs-ruling" };
}
