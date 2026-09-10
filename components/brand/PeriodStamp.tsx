import type { PeriodLabel } from "@/lib/period-label";

/* ============================================================================
   EDIAGD — which store, which month, and whether the month is finished

   ONE COMPONENT so the qualifier cannot be remembered on one screen and
   forgotten on the next. A partial month shown without its note is the single
   most misleading thing in the app right now: August holds ten days and looks
   like a collapse beside a full July.

   Clay, not red, and never a warning icon — a partial month is not a problem,
   it is a month that hasn't finished.
   ============================================================================ */

export function PeriodStamp({
  label,
  className,
}: {
  label: PeriodLabel;
  className?: string;
}) {
  if (!label.headline) return null;

  return (
    <div className={className}>
      {/*
        TWO LINES: THE STORE, THEN THE MONTH WITH ITS DATES BESIDE IT.

        This used to print `headline` — "Doggett Chrysler Dodge Jeep Ram · July
        2026" — as one paragraph with the range underneath. At anything above
        default text size the store name filled the line and pushed "· July
        2026" onto a second, leaving the range alone on a third. Ryan: "I want
        the Doggett title with the '- July 2026' on a second line and then next
        to that the actual date range. This doesn't need to be 3 lines."

        Splitting them means the break happens where it means something. The
        store owns line one; the month and the days it covers sit together on
        line two, because they are the same fact at two precisions.
      */}
      {label.rooftop && (
        <p className="text-sm font-bold leading-snug text-navy">{label.rooftop}</p>
      )}
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {label.period && (
          <span className="text-sm font-bold leading-snug text-navy">
            {label.period}
          </span>
        )}
        {label.range && (
          <span className="ediagd-numeral text-xs text-ink-soft">{label.range}</span>
        )}
        {label.partialNote && (
          <span
            className="rounded-pill px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide"
            style={{
              background:
                "color-mix(in srgb, rgb(var(--ediagd-clay)) 14%, transparent)",
              color: "rgb(var(--ediagd-clay))",
            }}
          >
            {label.partialNote}
          </span>
        )}
      </div>
    </div>
  );
}

/** The compact form, for places with no room for two lines. */
export function PeriodChip({ label }: { label: PeriodLabel }) {
  if (!label.period) return null;
  return (
    <span
      className="rounded-pill px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide"
      style={
        label.isPartial
          ? {
              background:
                "color-mix(in srgb, rgb(var(--ediagd-clay)) 14%, transparent)",
              color: "rgb(var(--ediagd-clay))",
            }
          : {
              background:
                "color-mix(in srgb, rgb(var(--ediagd-teal)) 14%, transparent)",
              color: "rgb(var(--ediagd-ocean))",
            }
      }
    >
      {label.period}
    </span>
  );
}
