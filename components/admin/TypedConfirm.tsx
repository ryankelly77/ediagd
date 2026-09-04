"use client";

/* ============================================================================
   EDIAGD — type the words to proceed

   For the two acts that change what every number means: declaring a dealer's
   translation table finished, and editing one after it has been declared
   finished. Everything else on the mapping screens stays one tap — the 60-row
   grind must not grow ceremony, or it stops getting done.

   ---------------------------------------------------------------------------
   WHY TYPING RATHER THAN A SECOND BUTTON
   ---------------------------------------------------------------------------
   A confirm dialog is dismissed by the same reflex that opened it. Typing is
   the only common pattern that cannot be completed without reading — you have
   to look at the phrase to reproduce it. It is the pattern every service uses
   before deleting a repository or a database, and for the same reason: the cost
   of the mistake is much higher than the cost of ten seconds.

   The button stays disabled rather than validating on submit. A disabled button
   says "not yet" before the attempt; a rejected submit says "wrong" after it,
   which reads as an accusation about something the person cannot see.
   ============================================================================ */

import { useState } from "react";

export function TypedConfirm({
  phrase,
  label,
  hint,
  children,
}: {
  /** The exact words that must be typed. Shown to the reader — this is not a password. */
  phrase: string;
  /** The submit button's words. */
  label: string;
  /** One line above the field saying what to type. */
  hint: string;
  /** Hidden inputs the surrounding form needs. */
  children?: React.ReactNode;
}) {
  const [typed, setTyped] = useState("");
  /* Trimmed and case-insensitive: this is a comprehension check, not a spelling
     test, and refusing "doggett automotive group" would be pedantry. */
  const matches = typed.trim().toLowerCase() === phrase.trim().toLowerCase();

  return (
    <div className="mt-4">
      {children}
      <label className="block text-sm text-ink-soft">
        {hint}{" "}
        <span className="font-bold text-navy">{phrase}</span>
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-label={hint}
          className="w-72 max-w-full rounded-xl border border-line bg-cream-card px-3 py-2 text-sm text-navy outline-none focus:ring-2 focus:ring-gold"
        />
        <button
          type="submit"
          disabled={!matches}
          className="rounded-xl bg-gold px-4 py-2 text-sm font-extrabold text-navy transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {label}
        </button>
      </div>
    </div>
  );
}
