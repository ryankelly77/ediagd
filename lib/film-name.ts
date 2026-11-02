/* ============================================================================
   EDIAGD — the name a person reads for a film, decided once
   PURE. No React, no DOM, no database.

   ---------------------------------------------------------------------------
   TWO NAMES, AND THEY ANSWER DIFFERENT QUESTIONS
   ---------------------------------------------------------------------------
   `content.title` is the SLATE — the name the film was shot under, which admin,
   search, and the trim and sync scripts match on. It is not touched and is not
   reslated: INGEST.md's rule is that a film keeps the name Mitch gave it,
   because reslating to suit a curriculum destroys the only record of what was
   actually filmed.

   `content.short_title` (0171) is what an ADVISOR OR A MANAGER reads on screen.
   It is editorial, written down rather than derived, and it is frequently NULL —
   97 of 459 films fit no mechanical rule and are waiting on a person.

   ---------------------------------------------------------------------------
   WHY THE FALLBACK IS A FUNCTION AND NOT A `??` AT EACH CALL SITE
   ---------------------------------------------------------------------------
   Because there are eight call sites, and `short_title ?? title` is wrong at
   two of them: an empty string and a string of spaces are both non-null, and
   both would print a blank where a film name belongs. One of them arriving is a
   matter of time — the column is admin-editable and a cleared text input posts
   "".

   So the rule is here, once: a short name that is present AND has ink in it,
   otherwise the full title. A surface that wants the slate asks for `title`
   explicitly, which makes that an obvious decision at the call site rather than
   an accident of which field somebody reached for.
   ============================================================================ */

/** The two names a content row can carry. */
export type NamedFilm = {
  title: string;
  short_title?: string | null;
};

/**
 * What to print for this film.
 *
 * Trimmed, because the stored value is a person's typing and a trailing space
 * is not a name. Falls back to the full title, which is never null.
 */
export function filmName(row: NamedFilm): string {
  const short = (row.short_title ?? "").trim();
  return short.length > 0 ? short : row.title;
}

/**
 * The same decision for a shape that has already been camelCased on its way to
 * a component.
 *
 * NOT A SECOND RULE — it calls the first one. It exists because the client
 * shapes (LifestyleVideoData, LoopItem) carry `shortTitle`, and a component
 * reaching back for the snake_case row would be reaching past the boundary that
 * shaped it.
 */
export function filmNameOf(row: { title: string; shortTitle?: string | null }): string {
  return filmName({ title: row.title, short_title: row.shortTitle ?? null });
}
