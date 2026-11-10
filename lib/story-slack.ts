/* ============================================================================
   EDIAGD — the #ediagd notice when a Good News Story is filed

   Ryan, 9 November: "A new story posts a notice to #ediagd."

   ---------------------------------------------------------------------------
   WHO, WHERE, WHICH TRACK, AND A LINK. NEVER THE WORDS
   ---------------------------------------------------------------------------
   SLACK SITS OUTSIDE THE RLS. 0127 spent a whole migration on who may read a
   story — the author, their rooftop's managers, their colleagues only when the
   author opts in, and since 0180 EDIAGD — and a channel post is a copy of the
   text in a place none of that applies to. A story is an HR surface: it is an
   advisor's own words about their own work, their customers and their
   colleagues, written under a form that tells them who reads it.

   So the notice says a story EXISTS and where to read it. Reading it means
   following the link and being entitled to the row. The one thing a webhook
   cannot take back is a body it has already posted.

   NOT THE EMAIL EITHER. The feedback post carries one because feedback is a
   support ticket somebody has to reply to. This is not: the queue is the reply
   surface and the advisor is identified by name to the two people in the
   channel who already know them.

   ---------------------------------------------------------------------------
   PURE, AND NOT `server-only`, SO THE ACCEPTANCE SUITE CAN ASSERT IT
   ---------------------------------------------------------------------------
   `npm run accept:story` asserts that this text carries the name, the rooftop
   and the track and does NOT carry the body. That assertion is worth something
   only if it reads the same builder the action does — a test with its own copy
   of the format string proves the copy, which is the "join on what was
   observed" rule applied to a test fixture. So the builder lives here, takes
   everything it prints, and has no imports to drag a server runtime in.
   ============================================================================ */

/** The deploy's public origin, no trailing slash. */
export function appBaseUrl(): string {
  /*
   * THE SAME ENV THE REST OF THE APP READS, with the same default —
   * app/certificate/page.tsx and scripts/ingest-videos.ts both resolve
   * NEXT_PUBLIC_APP_URL ?? "https://app.ediagd.ai". A second spelling of "where
   * does this app live" is a link that goes to the wrong host on exactly one
   * surface, discovered by somebody tapping it.
   */
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.ediagd.ai";
  return raw.replace(/\/+$/, "");
}

export type StoryNotice = {
  advisorName: string;
  rooftopName: string;
  trackName: string;
  /** Pass appBaseUrl(); a parameter so this stays pure and testable. */
  appUrl: string;
};

/**
 * The #ediagd post. Two lines, and neither of them is the story.
 *
 * Mitch reads this and goes to the queue. The eyebrow names the thing, the dot
 * separators are the same ones the feedback post uses, and the link is the one
 * place the words actually live.
 */
export function storySlackText(n: StoryNotice): string {
  return [
    `:sunrise: *Good News Story* · ${n.advisorName} · ${n.rooftopName} · ${n.trackName}`,
    `Read it in the queue: ${n.appUrl}/admin/stories`,
  ].join("\n");
}
