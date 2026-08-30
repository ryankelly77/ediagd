"use client";

/* ============================================================================
   EDIAGD — noticing that it is tomorrow

   THE APP IS A WEBVIEW THAT NOBODY CLOSES. Every date the shell renders is
   resolved ON THE SERVER at render time: the (app) layout asks rooftop_today()
   to decide whether the Today tab points at the ritual or at the numbers, and
   /today resolves the same date to pick the quote, the cue and the video, and
   to check whether the day is already complete.

   In a browser that is fine, because a browser tab gets navigated. The native
   shell does not: an advisor opens it on Tuesday, leaves it open, and on
   Wednesday morning is still looking at Tuesday's render — Tuesday's quote,
   Tuesday's completion state, and a Today tab pointing at /advisor because
   Tuesday was finished. Nothing is wrong with the data; the page is simply old.

   ---------------------------------------------------------------------------
   THE ROOFTOP'S MIDNIGHT, NOT THE PHONE'S
   ---------------------------------------------------------------------------
   The comparison has to happen in the rooftop's timezone, which is the whole
   reason rooftop_today() exists (0013). An advisor at a Texas store whose phone
   is on Pacific time rolls over two hours after their store does, and a device
   date would have them on the wrong day for those two hours — every day.

   So: format "now" in the rooftop's IANA zone and compare it to the date the
   server rendered with. en-CA gives YYYY-MM-DD, which is what the server sends.

   A POLL RATHER THAN A TIMER TO MIDNIGHT. A single setTimeout is exact and also
   wrong here: background tabs throttle and suspended webviews do not fire at
   all, so the one moment it needed to work is the one it would miss. A cheap
   check every minute plus a check on every foreground catches the rollover
   whether the app was awake through it or asleep across it.
   ============================================================================ */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function DayRollover({
  serverDate,
  timezone,
}: {
  /** The rooftop-local date this render was built with, YYYY-MM-DD. */
  serverDate: string;
  /** IANA name from rooftop.timezone. */
  timezone: string;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!serverDate || !timezone) return;

    const localDate = () => {
      try {
        return new Intl.DateTimeFormat("en-CA", {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());
      } catch {
        // An unknown zone must not take the app down, and must not trigger a
        // refresh loop either — returning the server's own date is the inert
        // answer.
        return serverDate;
      }
    };

    let done = false;
    const check = () => {
      // Once only. router.refresh() re-runs the server components and this
      // effect re-mounts with the NEW serverDate, so the guard is belt and
      // braces against firing twice before that lands.
      if (done || localDate() === serverDate) return;
      done = true;
      router.refresh();
    };

    check();
    const id = setInterval(check, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, [serverDate, timezone, router]);

  return null;
}
