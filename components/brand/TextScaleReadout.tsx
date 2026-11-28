"use client";

import { useEffect, useState } from "react";
import { nativePlatform } from "@/lib/native/bridge";

/* ============================================================================
   EDIAGD — what text size is this phone actually asking for?

   Ryan, after moving the iOS slider to the second of seven notches: "the font
   didn't visually change that I could notice… i'm not sure how to check what
   the font size is at this setting."

   Both halves of that are fair. The second notch is Small, which is 12%
   SMALLER than default — a change you would struggle to see on a screen you
   are not comparing side by side, and one that moves the wrong way from what
   "changing the text size" sounds like it should do. And there was no way to
   check: the value lives in a root font-size set by the native shell, which
   is not something you can read on a phone.

   So this prints it. It is a diagnostic, and it stays: the shell reads
   preferredContentSizeCategory and hands it to the web app across a bridge
   (DynamicType.swift), and a bridge with no readout at the far end is a
   bridge nobody can tell is broken. When this says 100% on a phone set to
   xxxLarge, the answer is one glance instead of an afternoon.

   THE STEP NAMES IN `STEPS` BELOW ARE APPLE'S Dynamic Type categories, so on
   an iPhone the line can be compared directly against the slider without
   counting notches. They are shown on Android too, where the scale is a
   percentage with no such names — the percentage and the pixel value are
   still right there, so the readout keeps working, but the WORD is borrowed.
   Naming the Android scale properly needs a mapping measured on a real
   handset, so it is left rather than guessed. The path into the settings,
   which is the actionable half, does branch: see textSizePath.
   ============================================================================ */

/** The standard slider, in the order it appears. Accessibility sizes go past this. */
const STEPS: { name: string; px: number }[] = [
  { name: "xSmall", px: 13.18 },
  { name: "Small", px: 14.12 },
  { name: "Medium", px: 15.06 },
  { name: "Large (default)", px: 16 },
  { name: "xLarge", px: 17.88 },
  { name: "xxLarge", px: 19.76 },
  { name: "xxxLarge", px: 21.65 },
];

/** Nearest named step, so the readout says a word and not just a number. */
function describe(px: number): string {
  let best = STEPS[0]!;
  for (const s of STEPS) {
    if (Math.abs(s.px - px) < Math.abs(best.px - px)) best = s;
  }
  /* Past the standard slider the shell clamps at 200% — see DynamicType.swift.
     Saying "xxxLarge" there would be wrong in a way that hides the clamp. */
  if (px > STEPS[STEPS.length - 1]!.px + 1) return "an Accessibility size";
  return best.name;
}

/**
 * Where to change it, on the phone it is being read on.
 *
 * This said "iOS Settings › Display & Brightness › Text Size" to everybody,
 * including Android, where that path does not exist. The component is not
 * platform-gated — it renders on /profile for every advisor — so the sentence
 * has to branch, the same way PushToggle's settings sentence does.
 *
 * No OS name in any branch: a path through a phone is not a claim about who
 * made it. The browser case gets the neutral sentence, and it is reachable —
 * an advisor can open /profile on a laptop.
 */
function textSizePath(platform: "ios" | "android" | null): string {
  if (platform === "android") return "Settings › Display › Display size and text";
  if (platform === "ios") return "Settings › Display & Brightness › Text Size";
  return "your phone's display settings";
}

export function TextScaleReadout({ className }: { className?: string }) {
  const [px, setPx] = useState<number | null>(null);
  /* Null until it settles, and null is the safe value: textSizePath falls
     back to the neutral sentence rather than guessing a platform. */
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const p = await nativePlatform();
      if (!cancelled) setPlatform(p);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const read = () =>
      setPx(parseFloat(getComputedStyle(document.documentElement).fontSize));
    read();

    /* Changing the setting means leaving the app and coming back, so these two
       events bracket every change that can happen while it is open. The shell
       also pushes the new value in directly on the notification — this is the
       belt to that braces. */
    window.addEventListener("focus", read);
    document.addEventListener("visibilitychange", read);

    /* And the push itself: the shell writes documentElement.style.fontSize, so
       watching the attribute catches it without polling. */
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });

    return () => {
      window.removeEventListener("focus", read);
      document.removeEventListener("visibilitychange", read);
      mo.disconnect();
    };
  }, []);

  if (px == null) return null;

  const pct = Math.round((px / 16) * 100);

  return (
    <p className={`text-xs text-ink-soft ${className ?? ""}`}>
      <span className="font-bold text-navy">Text size:</span>{" "}
      <span className="ediagd-numeral tabular-nums">{pct}%</span>{" "}
      <span className="ediagd-numeral tabular-nums">({px.toFixed(1)}px)</span>
      {/* A colon, not an em dash: advisor-facing copy does not use them. */}
      {": "}
      {describe(px)}.{" "}
      {pct === 100
        ? `Change it in ${textSizePath(platform)}.`
        : `From ${textSizePath(platform)}.`}
    </p>
  );
}

export default TextScaleReadout;
