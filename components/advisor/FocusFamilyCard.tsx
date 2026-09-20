import Link from "next/link";
import { PeriodChip } from "@/components/brand/PeriodStamp";
import type { PeriodLabel } from "@/lib/period-label";
import { SunWaveMotif } from "@/components/brand/SunWaveMotif";
import { formatPct } from "@/lib/advisor";
import type { FocusFamilyCard as Card } from "@/lib/service-family";

/* ============================================================================
   EDIAGD — the focus-family progress card

   WHAT EDDIE'S PICK BECOMES. TWO_LADDERS: "With the pitch inside the loop, an
   Eddie's Pick card beside it repeats the film the advisor just watched. The
   card becomes a focus-family progress card: Belts & Cooling - 3 of 7 -
   continue. The loop guarantees a floor; the card lifts the ceiling."

   So the headline stops being an attach rate and becomes a position on a shelf.
   The rate stays underneath as the REASON the family was chosen — it is why
   they are here, not what they should do next.

   ---------------------------------------------------------------------------
   A SERVER COMPONENT, AND THE CONTINUE IS A LINK
   ---------------------------------------------------------------------------
   Nothing here is interactive: no dialog, no fetch, no state. "Continue" is an
   anchor to the family shelf, which is a real route an advisor can bookmark,
   share or land on from anywhere. The old card's CTA opened a modal that could
   only exist on this screen and showed cues under a button that said "Watch the
   pitch".
   ============================================================================ */

export function FocusFamilyCard({
  card,
  periodLabel,
  rate,
  storeAvg,
}: {
  card: Card;
  periodLabel: PeriodLabel;
  /**
   * The live attach numbers, but only when the pick still names the SAME
   * family the assignment locked. An advisor who has since recovered on it
   * sees no numbers rather than stale ones — the same rule the loop's focus
   * prop follows, and for the same reason.
   */
  rate: number | null;
  storeAvg: number | null;
}) {
  const finished = card.completed >= card.total;
  const pct = card.total > 0 ? Math.round((card.completed / card.total) * 100) : 0;

  return (
    <section className="ediagd-hero mt-6" data-intentional-bleed>
      <SunWaveMotif />

      <div className="relative">
        <div className="flex items-center gap-2">
          <p className="ediagd-eyebrow">
            {card.source === "manager" ? "Set by your manager" : "What you're working"}
          </p>
          {/*
            THE CHIP ONLY MAKES A CLAIM IT CAN BACK. It dates the attach-rate
            PICK, so it is shown only when those numbers are on screen — a
            manager-set family has no period behind it and a stale month stamped
            on it would be an invented provenance.
          */}
          {rate != null && <PeriodChip label={periodLabel} />}
        </div>

        <h2 className="mt-2 text-3xl font-extrabold leading-tight text-white">
          {card.family}
        </h2>

        {/* ---- The position on the shelf: the headline number ------------- */}
        <p className="mt-2 text-sm font-extrabold uppercase tracking-[0.14em] text-gold">
          <span className="ediagd-numeral">
            {card.completed} of {card.total}
          </span>{" "}
          films
        </p>

        <div className="mt-4" aria-hidden="true">
          <div className="h-2 w-full overflow-hidden rounded-pill bg-white/15">
            <div
              className="h-full rounded-pill bg-gold transition-all"
              style={{ width: `${Math.max(card.completed > 0 ? 4 : 0, pct)}%` }}
            />
          </div>
        </div>

        {/* ---- Why this family, when the numbers still say so ------------- */}
        {rate != null && storeAvg != null && (
          <p className="mt-4 text-sm leading-relaxed text-ice-dim">
            Your {card.family} attach is{" "}
            <span className="font-extrabold text-white">{formatPct(rate)}</span> — the
            store averages{" "}
            <span className="font-extrabold text-white">{formatPct(storeAvg)}</span>.
          </p>
        )}

        {/* ---- Continue ---------------------------------------------------- */}
        {finished ? (
          /*
           * THE SHELF IS FINISHED AND THE CARD SAYS SO RATHER THAN MOVING THEM.
           *
           * advance_focus_family() ends an exhausted cycle and derives the next
           * family — and it is the LOOP's to call. A card that moved somebody
           * onto a new family by being rendered would be a read with a side
           * effect, fired by a page load, outside the ritual. So this reports
           * the true state: finished, and tomorrow morning moves you on.
           */
          <div className="mt-6 rounded-xl border border-white/20 bg-white/10 px-4 py-3">
            <p className="text-sm font-extrabold text-white">
              You&apos;ve watched every {card.family} film.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ice-dim">
              Tomorrow&apos;s loop moves you to the next family.
            </p>
            <Link
              href={`/service/${encodeURIComponent(card.family)}`}
              className="mt-3 inline-flex text-sm font-extrabold text-gold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              Watch any of them again
            </Link>
          </div>
        ) : (
          <Link
            href={`/service/${encodeURIComponent(card.family)}`}
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-gold px-4 py-3.5 text-base font-extrabold text-navy shadow-[0_4px_16px_rgba(12,28,44,0.24)] transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
          >
            {card.completed === 0 ? "Start watching" : "Continue"}
          </Link>
        )}

        {/*
          THE FLOOR IS STILL THE LOOP. Said plainly, because the card is an
          invitation and must not read as a second obligation — an advisor who
          only ever does the morning is doing the thing the product asks of them.
        */}
        {!finished && (
          <p className="mt-3 text-xs leading-relaxed text-ice-dim">
            One lands in your morning anyway. This is for getting ahead.
          </p>
        )}
      </div>
    </section>
  );
}
