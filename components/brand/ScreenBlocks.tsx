/* ============================================================================
   EDIAGD — the parts an onboarding or daily screen is made of

   One template, so sparse screens look composed rather than abandoned and
   text-heavy ones read as a page rather than zoomed-in prose.

        Kicker      small, tracked, teal — says what kind of screen this is
        Headline    the one idea, in a dark card or plain on cream
        Body        the words
        Visual      motif, illustration, player — optional
        CTA         gold, in the sticky footer

   DESIGN_LANGUAGE says one hero per screen and the rest quieter, gold reserved
   for the primary action, warm navy-tinted shadow rather than grey, and the
   sun/wave motif kept to a whisper. These encode that so screens inherit it
   instead of each re-deciding.
   ============================================================================ */

import { SunWaveMotif } from "@/components/brand/SunWaveMotif";

/** Small, tracked, teal. The eyebrow already in use across the app. */
export function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm font-bold uppercase tracking-[0.18em] text-ocean">
      {children}
    </p>
  );
}

/**
 * The dark header card — the treatment that already reads well on device.
 *
 * Navy gradient, cream text, the motif at a whisper. One per screen: the moment
 * there are two, neither is the headline.
 */
export function HeadlineCard({
  children,
  kicker,
  motif = true,
}: {
  children: React.ReactNode;
  kicker?: React.ReactNode;
  motif?: boolean;
}) {
  return (
    <section className="ediagd-hero relative overflow-hidden">
      {motif && <SunWaveMotif />}
      <div className="relative">
        {kicker && (
          <p className="ediagd-eyebrow mb-2">{kicker}</p>
        )}
        <h1 className="text-3xl font-extrabold leading-tight text-white">
          {children}
        </h1>
      </div>
    </section>
  );
}

/** Plain headline for screens that do not want the dark card. */
export function Headline({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-3xl font-extrabold leading-tight text-navy">{children}</h1>
  );
}

/**
 * Body copy at a comfortable reading size.
 *
 * NOT display size. A coaching passage set at headline scale is a wall — it
 * fills the screen, forces a scroll for three sentences, and reads as shouting.
 * 17px with 1.65 line height is a paragraph somebody can actually take in on a
 * phone held at arm's length on a service drive.
 */
export function Body({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`space-y-4 text-[1.0625rem] leading-[1.65] text-ink ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * A quote given room to be a quote.
 *
 * The Aloha screen was a wall of display-size text with the citation crammed
 * against the bottom edge. A pull quote wants: a rule to mark where it starts,
 * comfortable body size rather than headline size, generous leading, and the
 * attribution set as a kicker with space of its own.
 */
export function PullQuote({
  children,
  cite,
}: {
  children: React.ReactNode;
  cite?: React.ReactNode;
}) {
  return (
    <figure className="my-1">
      <div
        className="border-l-2 pl-4"
        style={{ borderColor: "rgb(var(--ediagd-teal) / 0.55)" }}
      >
        <blockquote className="text-[1.0625rem] leading-[1.7] text-ink [&>p+p]:mt-4">
          {children}
        </blockquote>
      </div>
      {cite && (
        /* mt-5 rather than mt-2: the citation is a separate beat, and on the
           device it was reading as another line of the quote. */
        <figcaption className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-ink-soft">
          {cite}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * Vertical rhythm for a screen's stack.
 *
 * `sparse` is the fix for the top-heavy screens: when there are only a few
 * elements, the block centres and the gaps open up, so the screen looks
 * composed rather than like content that failed to load below the fold.
 */
export function Stack({
  children,
  sparse = false,
}: {
  children: React.ReactNode;
  sparse?: boolean;
}) {
  return (
    <div className={sparse ? "space-y-7 py-4" : "space-y-5 py-4"}>{children}</div>
  );
}
