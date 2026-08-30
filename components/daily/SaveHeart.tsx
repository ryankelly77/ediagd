"use client";

/* ============================================================================
   EDIAGD — keep this one

   OPTIMISTIC, because the alternative is a heart that waits. The tap is the
   whole interaction; a spinner on it would last longer than the thing it
   reports. The state flips immediately and reverts if the server disagrees.

   NEVER RED. A filled heart is the one place a coaching app is tempted into it,
   and the brand rule holds everywhere: the filled state is CLAY, the same warm
   tone the rest of the app uses for emphasis, and the outline is ink-soft.

   ---------------------------------------------------------------------------
   THE ANIMATION ONLY PLAYS ONE WAY
   ---------------------------------------------------------------------------
   Saving pops and sends out a ring. UNSAVING DOES NEITHER — it just goes quiet.
   A flourish on removal celebrates the wrong thing, and on a double-tap
   correction it makes a mistake feel like an event.

   It also does not play on mount. `useEffect` on a ref rather than on `saved`
   itself, so a quote you kept last week does not pop every time the screen
   loads — the animation marks the MOMENT of keeping, not the state of being
   kept.
   ============================================================================ */

import { useEffect, useRef, useState, useTransition } from "react";
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
  const [celebrating, setCelebrating] = useState(false);
  const wasSaved = useRef(initialSaved);

  useEffect(() => {
    // Only the false -> true edge, and never the first render.
    if (saved && !wasSaved.current) {
      setCelebrating(true);
      const t = setTimeout(() => setCelebrating(false), 620);
      wasSaved.current = saved;
      return () => clearTimeout(t);
    }
    wasSaved.current = saved;
  }, [saved]);

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
      className="ediagd-keep inline-flex items-center gap-2 rounded-full border border-line bg-surface-card px-3 py-2 text-xs font-bold text-ink-soft transition-colors disabled:opacity-60"
    >
      <span className="relative inline-flex h-4 w-4 items-center justify-center">
        {/* The ring is drawn only while it is wanted. A permanently mounted
            element at opacity 0 still gets composited on every frame of a
            scroll, and this sits inside the daily loop's scroll region. */}
        {celebrating && (
          <span aria-hidden="true" className="ediagd-keep-ring absolute inset-0 rounded-full" />
        )}
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 ${celebrating ? "ediagd-keep-pop" : ""}`}
          aria-hidden="true"
        >
          <path
            d="M12 20.5s-7.5-4.6-7.5-9.6A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 3.3c0 5-7.5 9.6-7.5 9.6Z"
            fill={saved ? "rgb(var(--ediagd-clay))" : "none"}
            stroke={saved ? "rgb(var(--ediagd-clay))" : "currentColor"}
            strokeWidth="1.8"
            strokeLinejoin="round"
            /* The fill arrives over 180ms rather than snapping, so the colour
               change reads as part of the pop instead of racing ahead of it. */
            style={{ transition: "fill 180ms ease-out, stroke 180ms ease-out" }}
          />
        </svg>
      </span>
      {saved ? "Saved" : label}

      <style>{`
        /* Same overshoot curve as the badge celebration, shorter and smaller:
           this is an acknowledgement, not an award. */
        .ediagd-keep-pop {
          animation: ediagd-keep-pop 520ms cubic-bezier(.2,.9,.3,1.2) both;
          transform-origin: center;
        }
        @keyframes ediagd-keep-pop {
          0%   { transform: scale(1); }
          30%  { transform: scale(.82); }
          55%  { transform: scale(1.28); }
          100% { transform: scale(1); }
        }

        .ediagd-keep-ring {
          border: 2px solid rgb(var(--ediagd-clay));
          animation: ediagd-keep-ring 560ms cubic-bezier(.2,.7,.3,1) both;
        }
        @keyframes ediagd-keep-ring {
          0%   { transform: scale(.6); opacity: .65; }
          100% { transform: scale(2.3); opacity: 0; }
        }

        /* The state still changes, it just arrives instead of performing. */
        @media (prefers-reduced-motion: reduce) {
          .ediagd-keep-pop,
          .ediagd-keep-ring { animation: none; }
          .ediagd-keep-ring { display: none; }
        }
      `}</style>
    </button>
  );
}
