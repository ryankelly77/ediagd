import { SkeletonBlock } from "@/components/brand/ScreenSkeleton";

/* ============================================================================
   EDIAGD — the daily loop, arriving

   THE ONE THAT NEEDED THIS MOST. /today measured 5.2 seconds from tap to
   content — 21 awaits in a long sequential chain: the rooftop's date, then
   today's completion, then the Swell, then the schedule context, then the
   advisor's day, then the block, then the quote, cue and two videos, then
   badges and settings. Until this file existed, all five of those seconds
   were a tab that appeared not to have registered the tap at all.

   This does not make the page faster. It makes the navigation commit
   immediately and gives the eye the right shape to wait against — and it
   lets Next prefetch this far, so the shell is often already there.

   THE SHAPE IS PhoneScreen'S, NOT A PAGE'S. /today is immersive: no header,
   no tab bar, a fixed-height column of rail, body and footer. A skeleton in
   the standard <main> would be the wrong furniture in the wrong place and
   the whole screen would jump when the loop arrived.
   ============================================================================ */
export default function Loading() {
  return (
    <div
      className="ediagd-app flex h-dvh flex-col overflow-hidden"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading today</span>

      <div className="mx-auto flex w-full min-h-0 max-w-app flex-1 flex-col">
        {/* Rail: the five step dots. Drawn at their real widths so the row
            does not resize when the live ones replace them. */}
        <div className="mt-3 shrink-0 px-5">
          <div className="flex items-center gap-1.5">
            <SkeletonBlock className="h-1.5 w-8 rounded-pill" />
            <SkeletonBlock className="h-1.5 w-4 rounded-pill" />
            <SkeletonBlock className="h-1.5 w-4 rounded-pill" />
            <SkeletonBlock className="h-1.5 w-4 rounded-pill" />
          </div>
        </div>

        {/* Body: step one is a quote — a few long lines, an attribution, and
            the coaching under a rule. */}
        <div className="min-h-0 flex-1 overflow-hidden px-5 pt-4">
          <div className="py-8">
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="mt-6 h-6 w-full" />
            <SkeletonBlock className="mt-3 h-6 w-11/12" />
            <SkeletonBlock className="mt-3 h-6 w-3/4" />
            <SkeletonBlock className="mt-5 h-3 w-32" />

            <div className="mt-8 border-t border-line pt-5">
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="mt-3 h-4 w-full" />
              <SkeletonBlock className="mt-3 h-4 w-2/3" />
            </div>
          </div>
        </div>

        {/* Footer: the gold CTA's slot, held so the button does not appear to
            jump up from the bottom of the screen when it lands. */}
        <div className="shrink-0 px-5 pt-3 pb-3">
          <SkeletonBlock className="h-14 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
