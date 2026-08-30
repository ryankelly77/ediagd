"use client";

import { useEffect, useRef, useState } from "react";
import { ConfettiBurst } from "@/components/brand/ConfettiBurst";
import { PaddleOutIcon } from "@/components/brand/PaddleOutIcon";
import { claimWelcomePaddleOut } from "@/lib/schedule-actions";
import { BRAND } from "@/lib/brand";
import { PhoneScreen } from "@/components/brand/PhoneScreen";

/* ============================================================================
   EDIAGD — the welcome gift
   Last screen of onboarding: their first Paddle Back Out day, revealed with the
   same treatment as earning a badge.

   The day itself is granted at account creation (0023). This screen calls a
   server action that is idempotent on that credit, so it almost always grants
   NOTHING and simply reports what they hold — a refresh can't mint a second
   one, and neither can re-entering the flow.
   ============================================================================ */

export function WelcomeGift({
  cap,
  preview,
  onStart,
}: {
  /** Fallback until the server answers — the real number replaces it. */
  cap: number;
  preview: boolean;
  onStart: () => void;
}) {
  const [held, setHeld] = useState<number | null>(null);
  const [realCap, setRealCap] = useState(cap);
  const claimed = useRef(false);

  useEffect(() => {
    // Once per mount, and never in preview: an admin walking the flow must not
    // touch their own bank.
    if (preview || claimed.current) return;
    claimed.current = true;

    // No abort flag here, deliberately. React's dev double-invoke runs
    // mount -> cleanup -> mount: an abort flag set by the first cleanup would
    // discard the only response, because the ref guard stops the second pass
    // from asking again. The result is idempotent and the component is still
    // mounted, so just take the answer whenever it lands.
    claimWelcomePaddleOut().then((result) => {
      if (!result.ok) return;
      setHeld(result.held);
      setRealCap(result.cap);
    });
  }, [preview]);

  const holding = preview ? 1 : held;

  return (
    /* Same Body/Footer split as every other screen: the hero lands in the same
       place under the progress bar, and the CTA lives in the footer instead of
       trailing the content. */
    <>
      <PhoneScreen.Body>
      <section className="ediagd-hero relative flex flex-1 flex-col justify-center overflow-hidden">
        <div className="relative flex flex-col items-center px-2 py-6 text-center">
          <ConfettiBurst topOffset={64} />

          <div className="ediagd-gift-pop">
            <PaddleOutIcon size={104} />
          </div>

          <p className="ediagd-eyebrow mt-5">A welcome gift</p>
          <h2 className="mt-2 text-3xl font-extrabold leading-tight text-white">
            Here&apos;s your first Paddle Back Out day
          </h2>

          <p className="mx-auto mt-4 max-w-xs text-base leading-relaxed text-ice-dim">
            Life happens. Miss a day you were meant to work and one of these
            keeps your Swell rolling — automatically, without you doing a thing.
          </p>

          {/* Say plainly that it's already theirs. */}
          <p className="mt-5 inline-flex items-center gap-2 rounded-pill bg-white/12 px-4 py-2 text-sm font-extrabold text-white">
            <PaddleOutIcon size={18} />
            {holding == null ? (
              <span>Adding it to your account…</span>
            ) : (
              <span>
                <span className="ediagd-numeral">{holding}</span> already in your
                account
              </span>
            )}
          </p>

          <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-ice-dim">
            You earn another every month, and can hold up to{" "}
            <span className="ediagd-numeral font-extrabold text-white">
              {realCap}
            </span>
            . Nothing to buy — this one&apos;s on us.
          </p>

          <p
            className="mt-6 text-4xl leading-none text-gold"
            style={{ fontFamily: "var(--font-script)" }}
          >
            {BRAND.signoff}
          </p>
        </div>
      </section>
      </PhoneScreen.Body>

      <PhoneScreen.Footer>
        <button
          type="button"
          onClick={onStart}
          className="w-full rounded-xl bg-gold p-4 text-lg font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          {preview ? "See my first day" : "Start my first day"}
        </button>
      </PhoneScreen.Footer>

      <style>{`
        /* Same arrival as the badge medallion, so the two moments feel like
           one family. */
        .ediagd-gift-pop {
          animation: ediagd-gift-pop 620ms cubic-bezier(.2,.9,.3,1.2) both;
        }
        @keyframes ediagd-gift-pop {
          0%   { transform: scale(.55); opacity: 0; }
          60%  { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ediagd-gift-pop { animation: none; }
        }
      `}</style>
    </>
  );
}

export default WelcomeGift;
