/* ============================================================================
   EDIAGD — where a mapping write sends you afterwards

   PURE, and in its own file because lib/dms/mapping-actions.ts is a "use server"
   module: those may only export async functions, so a helper defined there
   cannot be imported by a test. This one guards a redirect, which is exactly
   the kind of thing that should have a test.

   ---------------------------------------------------------------------------
   TWO CALLERS, TWO CORRECT ANSWERS
   ---------------------------------------------------------------------------
   The LIST's one-tap Confirm should leave you where you are — you are working
   down sixty rows, and being bounced to the top after each one would make the
   grind unusable. The RULING SCREEN should hand you back to the list, because
   you went there to decide one thing and you have decided it.

   So the form says which it is, by including a returnTo or not.

   ---------------------------------------------------------------------------
   VALIDATED, BECAUSE A SERVER ACTION IS REACHABLE BY DIRECT POST
   ---------------------------------------------------------------------------
   A redirect target taken from a form field and followed unchecked is an open
   redirect carrying a platform owner's session. Only paths inside Dealer Codes
   are accepted, and anything else fails safe to "stay where you are" rather
   than to an error — a refused redirect must never cost somebody the write that
   already succeeded.
   ============================================================================ */

const RETURN_PREFIX = "/admin/mapping/dealer-codes";

/**
 * The URL to redirect to after a successful write, or null to stay put.
 *
 * `saved` is composed by the ACTION from what it actually wrote, never taken
 * from the form — a banner assembled by the client could congratulate somebody
 * on a value the database does not hold.
 */
export function returnTarget(raw: string | null, saved: string): string | null {
  const target = (raw ?? "").trim();

  /* Must be one of ours. A relative path that does not start here is not a
     Dealer Codes screen, whatever else it might be. */
  if (!target.startsWith(RETURN_PREFIX)) return null;

  /*
   * Refuse anything that could leave the site even though it passed the prefix
   * test. A colon opens a scheme and a double slash opens a host, and both can
   * appear after a legitimate-looking prefix — "/admin/mapping/dealer-codes/..
   * //evil.example" starts with the prefix and is not our site.
   */
  if (target.includes(":") || target.includes("//")) return null;

  /* Backslashes are treated as slashes by some clients; a path containing one
     is not something this app generates. */
  if (target.includes("\\")) return null;

  const join = target.includes("?") ? "&" : "?";
  return `${target}${join}saved=${encodeURIComponent(saved)}`;
}
