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
      <p className="text-sm font-bold leading-snug text-navy">{label.headline}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {label.range && (
          <span className="ediagd-numeral text-xs text-ink-soft">{label.range}</span>
        )}
        {label.partialNote && (
          <span
            className="rounded-pill px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide"
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
      className="rounded-pill px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide"
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
