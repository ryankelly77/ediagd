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

  return (
    <div className="mt-4 flex flex-wrap gap-3">
      <Field label="Type">
        <select
          value={type}
          onChange={(e) => apply({ type: e.target.value })}
          className="w-full rounded-xl border border-line bg-cream-card p-2.5 text-sm font-semibold text-navy outline-none focus:ring-2 focus:ring-gold"
        >
          <option value="">All types</option>
          {CONTENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_META[t].label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Tier">
        <select
          value={tier}
          onChange={(e) => apply({ tier: e.target.value })}
          className="w-full rounded-xl border border-line bg-cream-card p-2.5 text-sm font-semibold text-navy outline-none focus:ring-2 focus:ring-gold"
        >
          <option value="">All tiers</option>
          {CONTENT_TIERS.map((t) => (
            <option key={t} value={t}>
              {TIER_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Status">
        <select
          value={status}
          onChange={(e) => apply({ status: e.target.value })}
          className="w-full rounded-xl border border-line bg-cream-card p-2.5 text-sm font-semibold text-navy outline-none focus:ring-2 focus:ring-gold"
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="min-w-[9rem] flex-1">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-soft">
        {label}
      </span>
      {children}
    </label>
  );
}

export default ContentFilters;
