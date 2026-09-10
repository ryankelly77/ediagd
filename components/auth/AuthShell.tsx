"use client";

/* ============================================================================
   EDIAGD — the shell every signed-out screen sits in

   Extracted from LoginScreen when password reset arrived, because the
   alternative was three copies of the video background, the halo behind the
   mark and the Aloha. Three copies is how the reset screen ends up with last
   season's scrim.

   WHO SEES THESE SCREENS MATTERS. Sign-in is a routine moment; "I can't get in"
   is not. Somebody standing on a service drive who has just been refused by the
   app is the least patient reader this product has, so the rules here are plain
   words, one action per screen, and targets big enough to hit without looking.
   ============================================================================ */

import { useEffect, useRef } from "react";
import { BRAND } from "@/lib/brand";

export function AuthShell({ children }: { children: React.ReactNode }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  /* Honour prefers-reduced-motion: hold the poster frame instead of looping.
     CSS can't stop video playback, so this has to be imperative. */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");

    function apply() {
      const video = videoRef.current;
      if (!video) return;
      if (mq.matches) {
        video.pause();
        video.removeAttribute("autoplay");
        video.load(); // resets to the poster rather than freezing mid-frame
      } else {
        video.play().catch(() => {
          /* autoplay refused — the poster stands in */
        });
      }
    }

    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        poster="/video/ediagd-login-poster.jpg"
        aria-hidden="true"
      >
        <source src="/video/ediagd-login.webm" type="video/webm" />
        <source src="/video/ediagd-login.mp4" type="video/mp4" />
      </video>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
        <div className="relative mb-6 flex flex-col items-center">
          {/* Local halo — keeps the navy mark legible on every frame of the
              loop. Soft radial fade, not a boxed panel. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-8 -inset-y-6"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.38) 45%, rgba(255,255,255,0) 72%)",
            }}
          />
          <div className="relative flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/svg/ediagd-mark-primary-light.svg"
              alt="EDIAGD"
              className="h-20 w-auto"
            />
            <span className="mt-3 font-display text-3xl tracking-[0.22em] text-navy">
              {BRAND.name}
            </span>
            <span className="text-xs font-semibold uppercase tracking-[0.28em] text-navy/80">
              {BRAND.tagline}
            </span>
          </div>
        </div>

        <div className="rounded-2xl bg-white/95 p-6 shadow-2xl backdrop-blur">{children}</div>

        <p
          className="mt-6 text-center text-3xl text-navy/90"
          style={{ fontFamily: "var(--font-script)" }}
        >
          {BRAND.greeting}
        </p>
      </div>
    </main>
  );
}

/* ---- The pieces every auth screen uses, so they cannot drift -------------- */

/** 16px type and p-3.5: iOS zooms the page on a sub-16px field. */
export const AUTH_INPUT =
  "w-full rounded-xl border border-line bg-cream-card p-3.5 text-base text-navy outline-none focus:ring-2 focus:ring-gold";

/** The one gold action. Comfortably past 44px. */
export const AUTH_BUTTON =
  "w-full rounded-xl bg-gold p-3.5 text-base font-extrabold text-navy transition hover:brightness-95 disabled:opacity-60";

/**
 * The quiet way back or on — a full-width tap target rather than a line of
 * text with a link in it. Somebody locked out is not aiming carefully.
 */
export const AUTH_QUIET_LINK =
  "block w-full rounded-xl p-3 text-center text-sm font-bold text-ocean underline underline-offset-2 transition hover:bg-navy/5";
