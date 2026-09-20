/* ============================================================================
   EDIAGD — reading a Postgres composite back through PostgREST

   ONE FUNCTION, AND IT EXISTS BECAUSE OF A TRAP THAT COSTS A WHOLE FEATURE
   SILENTLY.

   A plpgsql function declared `returns <table>` that executes `return null`
   does NOT reach the client as null. PostgREST renders the null composite as a
   row with every column present and set to null:

       select * from derive_focus_family(...)   ->  {"id":null,"family":null,…}

   Which is an object. Which is truthy. So the natural thing to write —

       const row = await rpc("derive_focus_family", …)
       if (row) { … we have an assignment … }

   — takes the "nothing was rankable" branch and calls it success, then reads a
   null family out of it and locks the advisor onto nothing. Nothing throws.
   Nothing logs. The loop just quietly stops working for whoever had no DMS
   history, which is every Doggett advisor on 1 October.

   Found in phase 3a while writing the acceptance suite; see
   reports/phase-3a-ground-truth.md. The check lived at each call site for about
   an hour before it became obvious that the third caller would forget, so it
   lives here instead and the suite asserts it.

   NOT a general "is this object empty" helper. It takes the DISCRIMINATOR
   explicitly — the one column that is non-null whenever the row is real —
   because "every field is null" is a weaker test that a genuinely sparse row
   could fail. Pass the primary key or a NOT NULL column.
   ============================================================================ */

/**
 * A composite returned by an RPC, or null if Postgres actually returned null.
 *
 * @param row           whatever the rpc call handed back
 * @param discriminator a column that is NOT NULL on any real row of this type
 *
 * @example
 *   const assignment = compositeOrNull(data, "family");
 *   if (!assignment) return null;   // honestly nothing, not a null-filled row
 */
export function compositeOrNull<T extends object, K extends keyof T | string>(
  row: T | T[] | null | undefined,
  discriminator: K
): T | null {
  if (row == null) return null;

  /*
   * An RPC returning SETOF, or a `.select()` on a function, arrives as an
   * array. One element that is itself a null composite is the same trap one
   * layer down, so it is unwrapped and re-checked rather than special-cased.
   */
  if (Array.isArray(row)) {
    if (row.length === 0) return null;
    return compositeOrNull(row[0], discriminator);
  }

  if (typeof row !== "object") return null;
  if ((row as Record<string, unknown>)[discriminator as string] == null) return null;
  return row;
}
