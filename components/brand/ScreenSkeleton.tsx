/* ============================================================================
   EDIAGD — the shape of a screen, while the screen is on its way

   ---------------------------------------------------------------------------
   WHY THESE EXIST AT ALL
   ---------------------------------------------------------------------------
   Not decoration, and not really about "feeling fast". Every route in this app
   is dynamic because every one reads an auth cookie, and Next will not
   prefetch a dynamic route that has no loading boundary — nor will it navigate
   until the server has finished rendering. Measured: 700ms to 5.2s per tab tap
   with nothing moving on screen, not even the URL.

   A loading.tsx changes both. The navigation commits immediately and this is
   what the advisor sees while the real page streams in behind it.

   ---------------------------------------------------------------------------
   IT MIRRORS THE PAGE IT REPLACES
   ---------------------------------------------------------------------------
   Same <main>, same paddings, same eyebrow-then-cards rhythm every screen in
   the app uses. A skeleton whose blocks land where the content does not is
   worse than a spinner: the layout jumps when the real thing arrives, and the
   jump is the thing people notice.

   That is also why these are per-route files rather than one generic shimmer —
   the Streak screen leads with a tall navy hero, the libraries lead with a
   list. Each loading.tsx picks the shape its own page has.
   ============================================================================ */

/** One block. Width and height come from the caller — see the note above. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <div aria-hidden="true" className={`ediagd-skeleton ${className ?? ""}`} />;
}

/**
 * The screen wrapper every loading.tsx uses.
 *
 * `aria-busy` and a polite live region, so this is announced once as "Loading"
 * rather than read out as a screenful of empty boxes. The blocks themselves
 * are aria-hidden.
 */
export function SkeletonScreen({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="mx-auto max-w-app px-4 pb-8 pt-6"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading</span>
      {children}
    </main>
  );
}

/** The tracked uppercase label almost every screen opens with. */
export function SkeletonEyebrow() {
  return <SkeletonBlock className="h-3 w-28" />;
}

/** A standard cream card with a few lines in it. */
export function SkeletonCard({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`ediagd-card p-5 ${className ?? ""}`}>
      <SkeletonBlock className="h-4 w-1/3" />
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonBlock
          key={i}
          /* The last line short, the way a paragraph ends. */
          className={`mt-3 h-3 ${i === lines - 1 ? "w-2/5" : "w-full"}`}
        />
      ))}
    </div>
  );
}

/** A row in a list of links — the shape More and the libraries use. */
export function SkeletonRow() {
  return (
    <div className="ediagd-card flex items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <SkeletonBlock className="h-4 w-2/5" />
        <SkeletonBlock className="mt-2 h-3 w-3/4" />
      </div>
      <SkeletonBlock className="h-4 w-2" />
    </div>
  );
}
