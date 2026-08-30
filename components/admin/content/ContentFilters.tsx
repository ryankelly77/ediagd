"use client";

import { useRouter } from "next/navigation";
import {
  CONTENT_STATUSES,
  CONTENT_TIERS,
  CONTENT_TYPES,
  STATUS_META,
  TIER_LABEL,
  TYPE_META,
} from "@/lib/content";

/**
 * Filter controls. State lives in the URL so a filtered list is linkable and
 * the back button behaves; changing a filter always returns to page 1.
 */
export function ContentFilters({
  basePath,
  type,
  tier,
  status,
}: {
  basePath: string;
  type: string;
  tier: string;
  status: string;
}) {
  const router = useRouter();

  function apply(next: Partial<{ type: string; tier: string; status: string }>) {
    const merged = { type, tier, status, ...next };
    const query = new URLSearchParams();
    if (merged.type) query.set("type", merged.type);
    if (merged.tier) query.set("tier", merged.tier);
    if (merged.status) query.set("status", merged.status);
    const qs = query.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  /*
   * Tier is inert for quotes — they carry no tier, by design, which is what
   * keeps them out of the cue pools pickCoachingCue falls back through. Leaving
   * the control on screen offers a filter that can only ever return nothing.
   */
  const showTier = type !== "quote";

  return (
    /*
     * A GRID, NOT flex-wrap. Three `min-w-[9rem] flex-1` fields do not fit
     * across a phone, so the third wrapped onto its own line and then stretched
     * to the full width — two narrow controls above one wide one, which is the
     * "off" of it. A grid gives every filter the same width on every screen,
     * and drops to a clean pair when Tier is hidden.
     */
    <div
      className={`mt-4 grid gap-3 ${showTier ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"}`}
    >
      <Field label="Type">
        <select
          value={type}
          onChange={(e) => apply({ type: e.target.value })}
          className={selectClass}
        >
          <option value="">All types</option>
          {CONTENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_META[t].label}
            </option>
          ))}
        </select>
      </Field>

      {showTier && (
      <Field label="Tier">
        <select
          value={tier}
          onChange={(e) => apply({ tier: e.target.value })}
          className={selectClass}
        >
          <option value="">All tiers</option>
          {CONTENT_TIERS.map((t) => (
            <option key={t} value={t}>
              {TIER_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>
      )}

      <Field label="Status">
        <select
          value={status}
          onChange={(e) => apply({ status: e.target.value })}
          className={selectClass}
        >
          <option value="">All statuses</option>
          {CONTENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

/**
 * Matches the editor's own inputClass on the same feature — p-3, and NO size
 * class, so it inherits the 16px base.
 *
 * THE SIZE IS NOT COSMETIC. iOS Safari, and so the WKWebView the app ships in,
 * zooms the whole page when a select or input smaller than 16px takes focus.
 * These were text-sm, so opening a filter jumped the layout every time. The old
 * value also just disagreed with every other control in the CMS: p-2.5 against
 * p-3, 14px against 16px, on two screens of the same feature.
 */
const selectClass =
  "w-full rounded-xl border border-line bg-cream-card p-3 font-semibold text-navy outline-none focus:ring-2 focus:ring-gold";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-soft">
        {label}
      </span>
      {children}
    </label>
  );
}

export default ContentFilters;
