/* ============================================================================
   EDIAGD — which shelf a filename means, and which stage

   PURE. No client, no filesystem. scripts/ingest-videos.ts holds the folder
   walk and the Mux upload; this holds the two decisions that were wrong for
   op-code films, so both can be tested without a Drop Zone or a database.

   ---------------------------------------------------------------------------
   THE GAP THIS CLOSES
   ---------------------------------------------------------------------------
   Forty-three renamed films could not flow. The ingest's prefix pattern was
   `[A-Za-z][A-Za-z0-9 _]*?` — no hyphen — so "EAF-001 — On the Drive — v1"
   split at the FIRST dash it found and produced collection "EAF", title
   "001 — On the Drive". "EAF" is in no routing table, so every one of them
   would have been skipped as an unknown collection: the right behaviour on a
   name it genuinely cannot read, applied to a name it should have read.

   ---------------------------------------------------------------------------
   THE CATALOG DECIDES, NOT A TABLE IN A SCRIPT
   ---------------------------------------------------------------------------
   A prefix is an op code if op_code_catalog says so. Three separate times in
   this project a deck-to-code map was typed into a file and a third of it was
   wrong; the catalog is the only thing that knows, and it is one query.
   ============================================================================ */

/**
 * The only six values content.stage will accept — 0062's check constraint.
 *
 * Note "MPI Setup" and "After-MPI": the database has always spelled the third
 * and fourth films this way, which is why the alias table maps Mitch's "Set Up
 * the MPI" and "MPI Selling" onto them. A film named for one of those on disk
 * still lands on the canonical value here.
 */
export const CANONICAL_STAGES = [
  "Pre-Write",
  "On the Drive",
  "At the Kiosk",
  "MPI Setup",
  "After-MPI",
  "Objections",
] as const;

export type CanonicalStage = (typeof CANONICAL_STAGES)[number];

export type Route = {
  placement: string | null;
  collection: string | null;
  craftSeries: string | null;
  contentType?: "advisor_video" | "technician_video";
  /** Set only for op-code films. `Pitches by Op Code` requires it — see 0063. */
  opCode?: string | null;
};

/** An op code as the catalog writes them: two to four letters, a number. */
const OP_CODE = /^[A-Z]{2,4}-\d{2,3}$/;

export const isOpCodeShaped = (prefix: string): boolean => OP_CODE.test(prefix.toUpperCase());

/**
 * Split "EAF-001 — On the Drive" into its prefix and its title.
 *
 * ---------------------------------------------------------------------------
 * THE OP-CODE SHAPE IS TRIED FIRST, ON PURPOSE
 * ---------------------------------------------------------------------------
 * A prefix pattern that simply allows hyphens cannot work: the separator is
 * also sometimes a hyphen, so "EAF-001 - On the Drive" has three dashes and no
 * way to tell which one divides. Matching the op-code SHAPE first removes the
 * ambiguity entirely — "EAF-001" is a code and everything after the next
 * separator is the title — and anything that is not that shape falls through to
 * the original single-token rule, unchanged.
 */
export function splitPrefix(base: string): { prefix: string; title: string } | null {
  const op = base.match(/^\s*([A-Za-z]{2,4}-\d{2,3})\s*[—–:-]+\s*(.+)$/);
  if (op) return { prefix: op[1].toUpperCase(), title: op[2].trim() };

  const word = base.match(/^\s*([A-Za-z][A-Za-z0-9 _]*?)\s*[—–:-]+\s*(.+)$/);
  if (word) {
    return { prefix: word[1].trim().toUpperCase().replace(/[\s_]+/g, ""), title: word[2].trim() };
  }
  return null;
}

/**
 * The canonical stage for a film's title, or null.
 *
 * ---------------------------------------------------------------------------
 * NULL IS THE ANSWER FOR A PART TITLE, NOT A FAILURE
 * ---------------------------------------------------------------------------
 * "Part 2" and "Part 3" are film names, not stages. A deck's structure is
 * whatever the quiz bank says it is — A/C Recharge splits a film in two — and
 * the stage column exists to answer "where in the pitch", which a part number
 * does not. Same treatment the quiz import gave them.
 *
 * `aliases` comes from mapping_alias kind='stage', already confirmed: "MPI
 * Selling" → "After-MPI", "Set Up the MPI" → "MPI Setup". Passed in rather than
 * hardcoded so the alias table stays the one place Mitch's phrasings live.
 */
export function resolveStage(
  title: string,
  aliases: Map<string, string> = new Map()
): CanonicalStage | null {
  const t = title.trim();
  const direct = CANONICAL_STAGES.find((s) => s.toLowerCase() === t.toLowerCase());
  if (direct) return direct;

  const aliased = aliases.get(t.toLowerCase());
  if (!aliased) return null;
  return CANONICAL_STAGES.find((s) => s.toLowerCase() === aliased.toLowerCase()) ?? null;
}

export type RoutingTables = {
  /** The script's own static shelves — MINDSET, CRAFT, TECH and friends. */
  staticRoutes: Record<string, Route>;
  /** mapping_alias kind='collection': prefix -> collection name. */
  collectionAliases: Map<string, string>;
  /** Live op_code_catalog codes. Membership is the whole test. */
  opCodes: Set<string>;
  /** Collection name -> the route it implies, for alias-resolved prefixes. */
  collectionRoutes: Record<string, Route>;
};

/**
 * What shelf this prefix means, or null to send it to review.
 *
 * Order matters and is not arbitrary:
 *
 *   1. A STATIC ROUTE wins. Those are the shelves this script was written for
 *      and changing what MINDSET means from the database would be a surprise.
 *   2. A LIVE OP CODE routes to Pitches by Op Code with the code attached.
 *   3. A COLLECTION ALIAS covers the rest — TECH, FND — because a prefix that
 *      names a shelf is data, and adding one should not need a deploy.
 *
 * NULL IS PRESERVED BEHAVIOUR. An unknown prefix has always gone to the review
 * list rather than being guessed onto a shelf, and nothing here changes that:
 * a film on the wrong shelf is served to the wrong people, and the only thing
 * worse than an unrouted file is a confidently misrouted one.
 */
export function routeFor(prefix: string, tables: RoutingTables): Route | null {
  const key = prefix.toUpperCase();

  const staticRoute = tables.staticRoutes[key];
  if (staticRoute) return staticRoute;

  if (tables.opCodes.has(key)) {
    return {
      placement: "op_code_pitch",
      collection: "Pitches by Op Code",
      craftSeries: null,
      opCode: key,
    };
  }

  const aliased = tables.collectionAliases.get(key);
  if (aliased) {
    const byCollection = tables.collectionRoutes[aliased];
    if (byCollection) return { ...byCollection, collection: aliased };
    /* An alias naming a collection nothing else describes still routes — the
       shelf is the answer, and placement can be filled in by whoever adds the
       collection. Better a correctly shelved draft than an unrouted file. */
    return { placement: null, collection: aliased, craftSeries: null };
  }

  return null;
}
