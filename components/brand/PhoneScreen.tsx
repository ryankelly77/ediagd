"use client";

/* ============================================================================
   EDIAGD — the shape every full-screen flow takes on a phone

   Onboarding and the daily loop are the two places the app is a SCREEN rather
   than a page: no header, no tab bar, one job, a button at the bottom. They had
   drifted into two different implementations of that, both of which assumed a
   phone with no notch and no home indicator.

   ---------------------------------------------------------------------------
   WHY THIS EXISTS RATHER THAN FIXING EACH SCREEN
   ---------------------------------------------------------------------------
   Every symptom on the device came from the same two omissions:

     * The shell used fixed padding (pt-7 pb-10), so on a Dynamic Island phone
       the progress dots sat UNDER the island and the bottom kicker clipped off
       the edge. AppHeader and TabBar have handled insets since they were
       written — but onboarding lives outside the (app) group and has neither.
     * The CTA scrolled with the content, so on a short screen it sat below the
       fold and on a long one it was half-clipped. "Finish the day" was
       unreachable without a scroll nobody knew to make.

   Fixing those per screen would fix them until the next screen. So: one shell,
   one footer, one scroll region, and the insets are the shell's business rather
   than every author's.

   ---------------------------------------------------------------------------
   THE PARTS
   ---------------------------------------------------------------------------
     PhoneScreen        the shell. Owns safe areas and the column.
     PhoneScreen.Rail   fixed furniture under the top inset — progress dots.
     PhoneScreen.Body   the scroll region, with a fade when there is more below.
     PhoneScreen.Footer the CTA. Always visible, always above the home bar.
   ============================================================================ */

import { useEffect, useRef, useState } from "react";

export function PhoneScreen({
  children,
  className = "",
  ...rest
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <main
      /* h-dvh, NOT min-h-dvh, and overflow-hidden with it.
         min-h- sets a floor, so a tall screen simply grew past the viewport and
         took the footer with it — the body never became the scroller and the
         CTA ended up below the fold, which is the whole bug this component
         exists to prevent. A fixed height makes Body the only thing that
         scrolls and pins the footer where it belongs. */
      className={`ediagd-app flex h-dvh flex-col overflow-hidden ${className}`}
      style={{
        /* The island and the home bar are the shell's problem, not each
           screen's. Everything inside can assume it is on flat glass. */
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
      {...rest}
    >
      <div className="mx-auto flex w-full min-h-0 max-w-app flex-1 flex-col">
        {children}
      </div>
    </main>
  );
}

/**
 * Fixed furniture between the notch and the content — the progress dots.
 *
 * `mt-3` on top of the inset rather than flush against it: iOS reports the
 * inset as the bottom of the island, so a control sitting exactly there touches
 * it. Three units of clear space is what makes it read as deliberate.
 *
 * THE RAIL OWNS THE SPACING, NOT THE DOTS. Both StepDots components carried
 * their own pb-7/pb-8 from the old shell, which stacked on top of this and the
 * body's padding and pushed the headline card an extra 28px down the screen —
 * opening a gap far bigger than the one under the CTA. Furniture should not
 * decide its own margins when a layout owns them.
 */
function Rail({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 shrink-0 px-5">{children}</div>;
}

/**
 * The scroll region.
 *
 * CONTENT PINS TO THE TOP. It starts directly under the rail with a little
 * padding and runs down as far as it needs, scrolling when there is more than
 * fits. Vertical centring was tried and was wrong: on a screen with a headline
 * card it pushed the card away from the progress dots, opening a gap far larger
 * than the one under the CTA and leaving the screen looking unbalanced from the
 * top down.
 *
 * `centre` remains for the rare screen that is genuinely two lines and no
 * card — but it is opt-in, and anything with a headline card should not use it.
 *
 * The fade is drawn only when there is actually more below — a permanent
 * gradient is decoration, one that appears when content overflows is
 * information.
 */
function Body({
  children,
  centre = false,
  className = "",
}: {
  children: React.ReactNode;
  centre?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      // 8px of slack: a sub-pixel rounding difference must not draw a fade over
      // content that is already fully visible.
      setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={ref}
        /* pt-4: the "padding" that keeps the headline card off the progress
           dots without floating it down the screen. */
        className={`min-h-0 flex-1 overflow-y-auto px-5 pt-4 ${
          centre ? "flex flex-col justify-center" : ""
        } ${className}`}
      >
        {children}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-12 transition-opacity duration-200"
        style={{
          opacity: more ? 1 : 0,
          background:
            "linear-gradient(to top, rgb(var(--ediagd-cream)) 0%, rgb(var(--ediagd-cream) / 0) 100%)",
        }}
      />
    </div>
  );
}

/**
 * The CTA. Never below the fold, never half-clipped, never under the home bar.
 *
 * NOT `position: fixed`. Sticky-at-the-end-of-a-flex-column keeps it in normal
 * flow, so it cannot overlap the last line of content the way a fixed bar does
 * on a short screen — and it still cannot scroll away, because the body above
 * it is the only thing that scrolls.
 */
function Footer({
  children,
  className = "",
}: {
  /* Optional: a screen whose control portals in (the schedule form) renders an
     empty Footer purely to create the slot. */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      /* id: a portal target, so a control whose STATE has to stay inside a
         nested component (the schedule form's save button) can still render
         down here. Lifting that state out would be a bigger change than the
         problem deserves, and a button that scrolls off a small screen is not
         an option — see PhoneScreen.FOOTER_SLOT. */
      id={FOOTER_SLOT}
      className={`shrink-0 px-5 pt-3 ${className}`}
      style={{
        /* 1rem of breathing room ABOVE whatever the device reserves. On a
           home-button phone the inset is 0 and this is the whole margin. */
        paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))",
        background: "rgb(var(--ediagd-cream))",
      }}
    >
      {children}
    </div>
  );
}

/** Portal target for controls that must sit in the footer but live elsewhere. */
export const FOOTER_SLOT = "ediagd-phone-footer-slot";

PhoneScreen.Rail = Rail;
PhoneScreen.Body = Body;
PhoneScreen.Footer = Footer;
