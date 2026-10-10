"use client";

/* ============================================================================
   EDIAGD — the two components that record a Rollcall event, and render nothing

   ---------------------------------------------------------------------------
   THESE ARE CLIENT COMPONENTS FOR ONE REASON, AND IT IS NOT INTERACTIVITY
   ---------------------------------------------------------------------------
   Next renders a route's server components when a <Link> to it is prefetched.
   /certifications is on the tab bar of every signed-in screen, so a page that
   logged its own open from inside its server render would record an open every
   time anybody looked at anything.

   A prefetch does not MOUNT anything. Putting the write behind a mount effect
   is therefore not a style preference — it is the only placement where "the
   event means a person arrived" is true by construction rather than by
   everybody remembering.

   Neither component renders a node, takes a child, or blocks anything. They
   are the page saying "somebody is here" and nothing else.
   ============================================================================ */

import { useEffect, useRef } from "react";
import { recordOpen, recordSignInPing } from "@/lib/events/actions";
import type { ClientOpenKind } from "@/lib/events/kinds";
import { nativePlatform } from "@/lib/native/bridge";

/**
 * One open event, on arrival.
 *
 * The ref keys on kind + target so that React's development-mode double mount
 * writes one row, while a genuine navigation to a DIFFERENT module within the
 * same component instance still writes its own. Opening Certs four times in a
 * day is four opens — that is the number Ryan asked for, so nothing here
 * dedups across page loads.
 */
export function RecordOpen({
  kind,
  targetId = null,
}: {
  kind: ClientOpenKind;
  targetId?: string | null;
}) {
  const fired = useRef<string | null>(null);

  useEffect(() => {
    const key = `${kind}:${targetId ?? ""}`;
    if (fired.current === key) return;
    fired.current = key;
    /* Deliberately not awaited and deliberately not caught here — the action
       catches everything itself and returns void. */
    void recordOpen(kind, targetId);
  }, [kind, targetId]);

  return null;
}

/* Once per browser session. The database dedups per store-day as well; this
   only saves the round trip on a shell that reloads. */
const PINGED = "ediagd:signin-pinged";

/**
 * The shell this session is running in, handed up once.
 *
 * MOUNTED IN THE (app) LAYOUT, next to markActiveToday, and for the same
 * reason it sits there rather than on /today: a manager who lives on /manager
 * has still opened the app.
 *
 * NOT FOLDED INTO NativeBridge, which returns early in a browser — web is a
 * platform Rollcall has to be able to say, and "nothing was recorded" and
 * "they were on the web" are not the same answer.
 */
export function SignInPing() {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    (async () => {
      try {
        if (sessionStorage.getItem(PINGED) === "1") return;
        /* Resolved HERE because only the shell knows it is a shell. In a
           normal tab nativePlatform() returns null and the honest answer is
           "web" — not "unknown", and not nothing. */
        const platform = (await nativePlatform()) ?? "web";
        sessionStorage.setItem(PINGED, "1");
        void recordSignInPing(platform);
      } catch {
        /* sessionStorage can throw in a locked-down webview. The ping is not
           worth a broken page, and the per-store-day dedup key means the
           fallback — pinging again — costs one refused insert. */
      }
    })();
  }, []);

  return null;
}
