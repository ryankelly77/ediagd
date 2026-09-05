/* ============================================================================
   EDIAGD — what each Sand Dollar entry is supposed to point at

   NO IMPORTS, NO CLIENT, NO server-only. scripts/checkmap.ts compiles this file
   with a bare `tsc scripts/checkmap.ts` that resolves neither the `@/` alias nor
   Next's runtime, and the admin economy screen imports the same map through the
   app. One map, two readers — because a ledger check and a ledger screen that
   disagree about what "resolves" means are worse than either alone.

   ---------------------------------------------------------------------------
   WHY A LEDGER ENTRY MUST POINT AT SOMETHING
   ---------------------------------------------------------------------------
   Sand Dollars are minted by events: a day completed, a lesson finished, a
   badge earned. The entry is the money and the ref is the reason it exists. An
   entry whose ref resolves to nothing is a balance nobody can account for —
   which is the thing an economy screen exists to notice, and the thing a person
   would have to be believed about rather than shown.
   ============================================================================ */

/** reason → the table its ref_id must be a row in. */
export const REF_TARGET: Record<string, string> = {
  daily_loop: "daily_completion",
  badge: "daily_completion",
  swell_7: "daily_completion",
  swell_30: "daily_completion",
  swell_90: "daily_completion",
  swell_365: "daily_completion",
  lesson_complete: "content_progress",
  module_complete: "module",
  /* Added when the ledger check was extracted here. The swag action writes
     this reason pointing at the redemption row it just created — so before
     this line, the FIRST person to redeem swag would have tripped the check's
     "reason I don't know how to resolve" failure, on an event that is entirely
     correct. A check that cries wolf on a legitimate purchase gets switched
     off, which costs more than the check was ever worth. */
  swag_purchase: "swag_redemption",
};

/** Reasons with no event behind them, where a null ref is the correct state. */
export const NO_REF_EXPECTED = new Set(["paddle_out_purchase", "adjustment"]);

/*
 * DELIBERATELY UNMAPPED: 'certification'.
 *
 * The value has been in the sand_reason enum since 0011 and nothing in the app
 * has ever written it. Leaving it out of both sets is the ruling, not an
 * oversight: if one ever appears, somebody added a mint path without saying
 * where its evidence lives, and the check should stop rather than wave it
 * through. Map it here on the day that path is written.
 */

export type LedgerEntry = {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  ref_id: string | null;
};

export type LedgerAudit = {
  /** Entries whose evidence does not exist. Should always be empty. */
  orphans: LedgerEntry[];
  /** Reasons neither mapped nor excused — a hole in the audit, not a pass. */
  unknownReasons: string[];
};

/**
 * Which entries cannot be accounted for, given the ids that exist per table.
 *
 * PURE, and takes the id sets rather than fetching them, so the script and the
 * screen can each read them the way they are allowed to — the script over REST
 * with the service key, the screen through RLS as a platform owner.
 */
export function auditLedger(
  entries: LedgerEntry[],
  idsByTable: Record<string, Set<string>>
): LedgerAudit {
  const orphans: LedgerEntry[] = [];
  const unknownReasons: string[] = [];

  for (const e of entries) {
    if (e.ref_id === null) {
      /* A missing ref is only fine for the reasons that have no event. */
      if (!NO_REF_EXPECTED.has(e.reason)) orphans.push(e);
      continue;
    }
    const table = REF_TARGET[e.reason];
    if (!table) {
      if (!unknownReasons.includes(e.reason)) unknownReasons.push(e.reason);
      continue;
    }
    /* An unread table cannot clear an entry. Treating "I did not look" as
       "it is fine" is how an audit reports zero problems forever. */
    if (!idsByTable[table]?.has(e.ref_id)) orphans.push(e);
  }

  return { orphans, unknownReasons };
}

/** Every table the entries in hand need resolving against. */
export function tablesToResolve(entries: LedgerEntry[]): string[] {
  const out = new Set<string>();
  for (const e of entries) {
    if (e.ref_id === null) continue;
    const t = REF_TARGET[e.reason];
    if (t) out.add(t);
  }
  return [...out];
}
