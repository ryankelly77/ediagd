import { STATUS_META, serviceStatus, type ServiceStatus } from "../../lib/brand";

/** The glanceable service dot. Pass a status, or a rate + store average. */
export function StatusDot({
  status,
  rate,
  storeAvg,
  size = 16,
  withRing = true,
}: {
  status?: ServiceStatus;
  rate?: number;
  storeAvg?: number;
  size?: number;
  withRing?: boolean;
}) {
  const s =
    status ??
    (rate != null && storeAvg != null ? serviceStatus(rate, storeAvg) : "pursue");
  const color = `rgb(var(${STATUS_META[s].cssVar}))`;
  return (
    <span
      aria-label={STATUS_META[s].label}
      role="img"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        boxShadow: withRing ? `0 0 0 4px color-mix(in srgb, ${color} 15%, transparent)` : undefined,
        flex: "0 0 auto",
      }}
    />
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
      className="flex w-full items-center gap-3 border-b border-line px-1.5 py-3 text-left transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
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
