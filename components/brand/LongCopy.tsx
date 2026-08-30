"use client";

/* ============================================================================
   EDIAGD — long coaching copy, clamped honestly

   Shows the first sentences, reveals the rest on tap. Never cuts mid-word or
   mid-list, and tidies the dangling separator left behind by the data-side
   truncation described in lib/text.ts.

   TAP TO EXPAND RATHER THAN A SCROLLING BOX. On a phone, a nested scroll region
   inside a screen that also scrolls is a fight the user loses. A disclosure
   keeps one scroll axis and makes the length visible instead of hidden.
   ============================================================================ */

import { useState } from "react";
import { clampToSentence, tidyTruncation } from "@/lib/text";

export function LongCopy({
  text,
  budget = 320,
  className = "",
}: {
  text: string;
  budget?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { head, clamped, looksTruncated } = clampToSentence(text, budget);

  /* A body the import cut mid-list would otherwise end on a stray "/" or ",".
     Tidying it does not invent the missing words — it stops the advisor reading
     what looks like a rendering fault. */
  const shown = open ? text : head;
  const display = looksTruncated && !open ? tidyTruncation(shown) : shown;

  return (
    <div className={className}>
      <div className="space-y-4 text-[1.0625rem] leading-[1.65] text-ink">
        {display.split(/\n{2,}/).map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>

      {clamped && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-3 text-sm font-extrabold text-ocean underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          {open ? "Show less" : "Read the rest"}
        </button>
      )}
    </div>
  );
}
