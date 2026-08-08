import { Card } from "@/components/brand/Card";
import type { ImpactRooftopRow, NetworkRoi } from "@/lib/admin-impact";

/* ============================================================================
   EDIAGD — cost against return

   NEVER A RATIO WITHOUT ITS INPUTS. A bare "4.2x" is unfalsifiable; the three
   numbers it comes from — revenue lift, the gross profit inside it, and what
   the stores paid — are checkable, so all three sit next to it every time.

   BELOW-COST IS SHOWN, NOT HIDDEN. A rooftop that didn't return its
   subscription is the most useful row on the screen: it is a churn risk and an
   intervention signal, and burying it would make this a sales asset rather than
   a management tool. Clay, never red.
   ============================================================================ */

export const money = (v: number | null): string =>
  v == null
    ? "—"
    : `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString()}`;

/** Palm at or above break-even, clay below. Never red. */
export function roiColor(ratio: number | null): string {
  if (ratio == null) return "rgb(var(--ediagd-ink-soft))";
  if (ratio >= 1) return "rgb(var(--ediagd-palm))";
  return "rgb(var(--ediagd-clay))";
}

export function roiLabel(ratio: number | null): string {
  if (ratio == null) return "—";
  return `${ratio.toFixed(2)}×`;
}

/* ---- Network ------------------------------------------------------------- */

export function NetworkRoiCard({ roi }: { roi: NetworkRoi }) {
  const excluded = roi.rooftopsTooNew + roi.rooftopsNoGp;

  return (
    <Card className="mt-3 p-5">
      <p className="ediagd-eyebrow">Return against subscription</p>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className="ediagd-numeral text-4xl font-extrabold"
          style={{ color: roiColor(roi.roiRatio) }}
        >
          {roiLabel(roi.roiRatio)}
        </span>
        <span className="text-sm font-bold text-navy">
          gross profit back per $1 of subscription
        </span>
      </div>

      <p
        className="ediagd-numeral mt-1 text-sm font-bold"
        style={{ color: roiColor(roi.roiRatio) }}
      >
        {(roi.netGain ?? 0) >= 0 ? "Net gain " : "Net shortfall "}
        {money(roi.netGain == null ? null : Math.abs(roi.netGain))}
      </p>

      {/* The arithmetic, always visible. */}
      <dl className="mt-4 divide-y divide-line border-y border-line">
        <Row label="Revenue lift (labor sales)" value={money(roi.incrementalLabor)} />
        <Row
          label={`Gross profit at ${roi.gpPctUsed == null ? "—" : `${roi.gpPctUsed}%`} labor GP`}
          value={money(roi.incrementalGp)}
          emphasis
        />
        <Row
          label={`Subscription paid · ${roi.rooftopsCounted} rooftops`}
          value={money(roi.subscriptionCost == null ? null : -roi.subscriptionCost)}
        />
      </dl>

      <p className="mt-3 text-xs leading-relaxed text-ink-soft">
        Gross profit uses each rooftop&apos;s own labor GP% from its op-code
        export, not an assumed margin. Cost is that rooftop&apos;s monthly price
        × every month it has data for — including months whose movement
        can&apos;t be measured, which understates the return rather than
        flattering it.
      </p>

      {(excluded > 0 || roi.rooftopsBelowCost > 0) && (
        <ul className="mt-2.5 space-y-1 text-xs leading-relaxed text-ink-soft">
          {roi.rooftopsBelowCost > 0 && (
            <li>
              <span
                className="ediagd-numeral font-bold"
                style={{ color: "rgb(var(--ediagd-clay))" }}
              >
                {roi.rooftopsBelowCost}
              </span>{" "}
              {roi.rooftopsBelowCost === 1 ? "rooftop has" : "rooftops have"} not
              returned their subscription yet.
            </li>
          )}
          {roi.rooftopsTooNew > 0 && (
            <li>
              <span className="ediagd-numeral font-bold text-navy">
                {roi.rooftopsTooNew}
              </span>{" "}
              excluded — fewer than two months of data. A gap in the data, not a
              finding.
            </li>
          )}
          {roi.rooftopsNoGp > 0 && (
            <li>
              <span className="ediagd-numeral font-bold text-navy">
                {roi.rooftopsNoGp}
              </span>{" "}
              excluded — no labor GP% on file. Left out rather than given an
              assumed margin.
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}

/* ---- One rooftop --------------------------------------------------------- */

export function RooftopRoiCard({ rooftop }: { rooftop: ImpactRooftopRow }) {
  if (rooftop.gpMissing) {
    return (
      <Card className="mt-3 p-5">
        <p className="ediagd-eyebrow">Return against subscription</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          No labor GP% on file for this rooftop&apos;s periods, so return
          can&apos;t be computed. It is excluded rather than given an assumed
          margin — a made-up figure here would be the whole number.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mt-3 p-5">
      <p className="ediagd-eyebrow">Return against subscription</p>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className="ediagd-numeral text-3xl font-extrabold"
          style={{ color: roiColor(rooftop.roiRatio) }}
        >
          {roiLabel(rooftop.roiRatio)}
        </span>
        <span className="text-sm font-bold text-navy">
          back per $1 paid
        </span>
      </div>

      <dl className="mt-4 divide-y divide-line border-y border-line">
        <Row label="Revenue lift" value={money(rooftop.incrementalLabor)} />
        <Row
          label={`Gross profit at ${rooftop.gpPctUsed == null ? "—" : `${rooftop.gpPctUsed}%`}`}
          value={money(rooftop.incrementalGp)}
          emphasis
        />
        <Row
          label={`${money(rooftop.monthlyPrice)}/month × ${rooftop.monthCount} months`}
          value={money(
            rooftop.subscriptionCost == null ? null : -rooftop.subscriptionCost
          )}
        />
      </dl>

      <p className="mt-2.5 text-xs text-ink-soft">
        {rooftop.priceIsOverride
          ? "Using this rooftop's own price."
          : "Using the network default price."}
      </p>

      {rooftop.roiRatio != null && rooftop.roiRatio < 1 && (
        <p className="mt-2.5 rounded-card p-3 text-xs leading-relaxed text-navy"
           style={{ background: "color-mix(in srgb, rgb(var(--ediagd-clay)) 12%, transparent)" }}>
          This store hasn&apos;t returned its subscription over the months
          measured. Worth understanding before it becomes a renewal
          conversation — the engagement screen is usually where the reason is.
        </p>
      )}
    </Card>
  );
}

function Row({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <dt
        className={`min-w-0 text-sm ${emphasis ? "font-extrabold text-navy" : "text-ink-soft"}`}
      >
        {label}
      </dt>
      <dd
        className={`ediagd-numeral shrink-0 text-sm ${
          emphasis ? "font-extrabold text-navy" : "font-bold text-navy"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/* ---- Price override ------------------------------------------------------ */

export function SubscriptionForm({
  rooftop,
  action,
}: {
  rooftop: ImpactRooftopRow;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <details className="group mt-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-1 text-sm font-bold text-ocean [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="text-lg leading-none transition-transform group-open:rotate-90"
        >
          ›
        </span>
        Change this rooftop&apos;s price
      </summary>

      <Card className="mt-2 p-4">
        <form action={action} className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="block text-xs font-bold text-ink-soft">
              Monthly subscription
            </span>
            <input
              name="amount"
              type="number"
              step="1"
              min="0"
              inputMode="decimal"
              defaultValue={
                rooftop.priceIsOverride ? (rooftop.monthlyPrice ?? undefined) : undefined
              }
              placeholder={`${rooftop.monthlyPrice ?? 600} (network default)`}
              className="ediagd-numeral mt-1 min-h-[3rem] w-full rounded-xl border border-line bg-surface-card px-4 text-navy outline-none focus:ring-2 focus:ring-gold"
            />
          </label>
          <button
            type="submit"
            className="min-h-[3rem] shrink-0 rounded-xl bg-gold px-4 text-sm font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            Save
          </button>
        </form>
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          Leave it empty and save to go back to the network default.
        </p>
      </Card>
    </details>
  );
}
