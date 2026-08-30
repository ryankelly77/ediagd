"use client";

/* ============================================================================
   EDIAGD — keep this one

   OPTIMISTIC, because the alternative is a heart that waits. The tap is the
   whole interaction; a spinner on it would be longer than the thing it reports.
   The state flips immediately and reverts if the server disagrees.

   NEVER RED. A filled heart is the one place a coaching app is tempted into it,
   and the brand rule holds everywhere: the filled state is CLAY, the same warm
   tone the rest of the app uses for emphasis, and the outline is ink-soft.
   ============================================================================ */

import { useState, useTransition } from "react";
import { toggleSaveAction } from "@/lib/save-actions";

export function SaveHeart({
  contentId,
  initialSaved,
  label = "Keep this",
}: {
  contentId: string;
  initialSaved: boolean;
  label?: string;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !saved;
    setSaved(next);
    startTransition(async () => {
      const result = await toggleSaveAction(contentId);
      // Snap to the truth. If the write failed the heart goes back, rather than
      // leaving the advisor believing they kept something they didn't.
      setSaved(result.ok ? result.saved : !next);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      aria-label={saved ? "Saved — tap to remove" : label}
      className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-card px-3 py-2 text-xs font-bold text-ink-soft transition-colors disabled:opacity-60"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path
          d="M12 20.5s-7.5-4.6-7.5-9.6A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 3.3c0 5-7.5 9.6-7.5 9.6Z"
          fill={saved ? "rgb(var(--ediagd-clay))" : "none"}
          stroke={saved ? "rgb(var(--ediagd-clay))" : "currentColor"}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
      {saved ? "Saved" : label}
    </button>
  );
}
