"use client";

/* ============================================================================
   EDIAGD — survive a deploy that lands mid-session

   ---------------------------------------------------------------------------
   THE FAILURE THIS EXISTS FOR
   ---------------------------------------------------------------------------
   Next splits the app into chunks whose filenames carry a content hash. A
   deploy gives every changed chunk a new name and removes the old one. A phone
   that already has the app open is still holding the OLD names, so the next
   client-side navigation asks for a file that no longer exists and throws
   ChunkLoadError — which the router surfaces as a page that will not load.

   Ryan hit it across an afternoon of deploys: "the app is failing on many
   screens saying it can't load", "i have to hit reload on every page". Reload
   fixes it because it fetches fresh HTML with the new chunk names, which is
   also the entire fix — the app just should not need a person to think of it.

   This matters more than it sounds. An advisor stands on a service drive with
   the app open all day; every deploy we make is a live release under somebody
   mid-ritual. "Tap reload" is not an instruction that survives contact with a
   busy Monday.

   ---------------------------------------------------------------------------
   ONE RELOAD, THEN STOP
   ---------------------------------------------------------------------------
   The guard is the important half. If a chunk is missing for any reason OTHER
   than a deploy — a broken CDN path, a bad build — reloading gets the same
   error and the app becomes a reload loop, which is far worse than the thing
   being fixed.

   So a reload is attempted at most once per RETRY_WINDOW_MS. A second failure
   inside that window is left alone to surface as an honest error rather than
   spinning. The stamp lives in sessionStorage: it should expire with the tab,
   because a genuinely new session deserves a fresh attempt.
   ============================================================================ */

import { useEffect } from "react";

const STAMP_KEY = "ediagd:chunk-reload-at";
const RETRY_WINDOW_MS = 30_000;

/** Next names it ChunkLoadError; bundlers also phrase it as a failed import. */
function isChunkError(value: unknown): boolean {
  const message =
    value instanceof Error
      ? `${value.name}: ${value.message}`
      : typeof value === "string"
        ? value
        : "";
  return (
    /ChunkLoadError/i.test(message) ||
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /Failed to load chunk/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  );
}

export function ChunkReload() {
  useEffect(() => {
    const recover = (value: unknown) => {
      if (!isChunkError(value)) return;

      let last = 0;
      try {
        last = Number(sessionStorage.getItem(STAMP_KEY) ?? 0);
      } catch {
        /* Storage blocked. Fall through: one reload is still better than a
           dead screen, and without a stamp the browser's own throttling is
           the only backstop. */
      }

      if (Date.now() - last < RETRY_WINDOW_MS) return; // already tried; don't loop

      try {
        sessionStorage.setItem(STAMP_KEY, String(Date.now()));
      } catch {
        /* See above. */
      }
      window.location.reload();
    };

    const onError = (e: ErrorEvent) => recover(e.error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => recover(e.reason);

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
