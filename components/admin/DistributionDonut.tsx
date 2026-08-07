import Link from "next/link";
import { Card } from "@/components/brand/Card";

/* ============================================================================
   EDIAGD — health distribution
   The one visual that reads identically at 1 rooftop and at 500: three
   proportions, three counts. Tapping a segment (or its legend row) filters the
   list below — done with links and a query param, so it works without client
   JavaScript and the filtered view is shareable.

   palm / gold / clay. Never red — the bottom band is "needs attention", which
   is a call to make, not a failure.
   ============================================================================ */

export type Band = "engaged" | "building" | "nudge";

const SEGMENTS: {
  band: Band;
  label: string;
  color: string;
}[] = [
  { band: "engaged", label: "On track", color: "rgb(var(--ediagd-palm))" },
  { band: "building", label: "Close", color: "rgb(var(--ediagd-gold))" },
  { band: "nudge", label: "Need attention", color: "rgb(var(--ediagd-clay))" },
];

export function DistributionDonut({
  counts,
  noun,
  activeBand,
  basePath,
  query,
}: {
  counts: Record<Band, number>;
  /** "rooftops" or "advisors" — the same component serves both levels. */
  noun: string;
  activeBand: Band | null;
  basePath: string;
  /** Params to preserve when a segment is tapped (search text, etc.). */
  query?: Record<string, string | undefined>;
}) {
  const total = SEGMENTS.reduce((n, s) => n + (counts[s.band] ?? 0), 0);

  // Stroke-dasharray around a circle: r=42 so the ring reads at phone size.
  const R = 42;
  const C = 2 * Math.PI * R;
  let offset = 0;

  const href = (band: Band | null) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v) params.set(k, v);
    }
    if (band) params.set("band", band);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <Card className="mt-3 p-5">
      <p className="ediagd-eyebrow">How the {noun} are doing</p>

      <div className="mt-4 flex items-center gap-5">
        <div className="relative shrink-0">
          <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke="rgb(var(--ediagd-line))"
              strokeWidth="13"
            />
            {total > 0 &&
              SEGMENTS.map((s) => {
                const value = counts[s.band] ?? 0;
                if (value === 0) return null;
                const length = (value / total) * C;
                const dash = (
                  <circle
                    key={s.band}
                    cx="50"
                    cy="50"
                    r={R}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="13"
                    strokeDasharray={`${length} ${C - length}`}
                    strokeDashoffset={-offset}
                    opacity={activeBand && activeBand !== s.band ? 0.3 : 1}
                  />
                );
                offset += length;
                return dash;
              })}
          </svg>

          {/* The total sits in the hole — no extra label needed. */}
          <span className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="ediagd-numeral text-2xl font-extrabold text-navy">
              {total}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">
              {noun}
            </span>
          </span>
        </div>

        <ul className="min-w-0 flex-1 space-y-1">
          {SEGMENTS.map((s) => {
            const value = counts[s.band] ?? 0;
            const active = activeBand === s.band;
            return (
              <li key={s.band}>
                <Link
                  href={href(active ? null : s.band)}
                  // Filtering isn't going somewhere new — hold the viewport.
                  scroll={false}
                  aria-pressed={active}
                  className={`flex min-h-[2.5rem] items-center gap-2.5 rounded-xl px-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                    active ? "bg-teal-soft/25" : "hover:bg-teal-soft/15"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-pill"
                    style={{ background: s.color }}
                  />
                  <span className="ediagd-numeral text-base font-extrabold text-navy">
                    {value}
                  </span>
                  <span className="flex-1 truncate text-sm text-ink-soft">
                    {s.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {activeBand && (
        <Link
          href={href(null)}
          scroll={false}
          className="mt-3 inline-block text-xs font-bold text-ocean underline underline-offset-2"
        >
          Clear filter
        </Link>
      )}
    </Card>
  );
}

export default DistributionDonut;
