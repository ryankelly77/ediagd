import { STATUS_META, serviceStatus, type ServiceStatus } from "../../lib/brand";

/** The glanceable service dot. Pass a status, or a rate + store average. */
export function StatusDot({
  status,
  rate,
  storeAvg,
  // Slightly larger with a soft ring — echoes the badge construction in
  // DESIGN_LANGUAGE §3 without becoming a bullseye.
  size = 18,
  withRing = true,
  pulse = false,
}: {
  status?: ServiceStatus;
  rate?: number;
  storeAvg?: number;
  size?: number;
  withRing?: boolean;
  /** Opt in to the slow pulse. Honoured ONLY for the clay "pursue" dot, and
   *  only meant for the service dialog — see the note in brand.css. Callers
   *  can't turn it on for on-track or close; that rule lives here. */
  pulse?: boolean;
}) {
  const s =
    status ??
    (rate != null && storeAvg != null ? serviceStatus(rate, storeAvg) : "pursue");
  const color = `rgb(var(${STATUS_META[s].cssVar}))`;

  const dot = (
    <span
      aria-label={STATUS_META[s].label}
      role="img"
      style={{
        display: "block",
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        // A small light source rather than a printed dot: an inner highlight
        // above the fill, a tight containment ring, and a soft outer halo.
        background: `radial-gradient(circle at 34% 28%, rgb(255 255 255 / 0.45), rgb(255 255 255 / 0) 58%), ${color}`,
        boxShadow: withRing
          ? `0 0 0 5px color-mix(in srgb, ${color} 14%, transparent), 0 0 12px 2px color-mix(in srgb, ${color} 35%, transparent)`
          : `0 0 10px 2px color-mix(in srgb, ${color} 32%, transparent)`,
      }}
    />
  );

  if (!(pulse && s === "pursue")) {
    return <span style={{ display: "inline-block", flex: "0 0 auto" }}>{dot}</span>;
  }

  // The halo is rendered BEFORE the dot so the dot paints on top of it — no
  // z-index, no stacking-context guesswork.
  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        width: size,
        height: size,
        flex: "0 0 auto",
      }}
    >
      <span
        aria-hidden="true"
        className="ediagd-dot-pulse"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: color,
        }}
      />
      {dot}
    </span>
  );
}

/** A full tappable service row: dot + name + label + chevron. */
export function StatusRow({
  service,
  rate,
  storeAvg,
  onClick,
}: {
  service: string;
  rate: number;
  storeAvg: number;
  onClick?: () => void;
}) {
  const s = serviceStatus(rate, storeAvg);
  const color = `rgb(var(${STATUS_META[s].cssVar}))`;
  return (
    <button
      onClick={onClick}
      className="flex min-h-[3.5rem] w-full items-center gap-4 px-1.5 py-4 text-left transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      <StatusDot status={s} />
      <span className="flex-1 text-base font-bold text-navy">{service}</span>
      <span className="text-sm font-bold" style={{ color }}>
        {STATUS_META[s].label}
      </span>
      <span className="text-lg leading-none text-ink-soft">›</span>
    </button>
  );
}

export default StatusDot;
