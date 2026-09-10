"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/brand/Select";
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
   * keeps them out of the cue pools pickCoachingCueForBlock falls through. Leaving
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
        <Select
          ariaLabel="Type"
          value={type}
          onChange={(v) => apply({ type: v })}
          options={[
            { value: "", label: "All types" },
            ...CONTENT_TYPES.map((t) => ({ value: t, label: TYPE_META[t].label })),
          ]}
        />
      </Field>

      {showTier && (
      <Field label="Tier">
        <Select
          ariaLabel="Tier"
          value={tier}
          onChange={(v) => apply({ tier: v })}
          options={[
            { value: "", label: "All tiers" },
            ...CONTENT_TIERS.map((t) => ({ value: t, label: TIER_LABEL[t] })),
          ]}
        />
      </Field>
      )}

      <Field label="Status">
        <Select
          ariaLabel="Status"
          value={status}
          onChange={(v) => apply({ status: v })}
          options={[
            { value: "", label: "All statuses" },
            ...CONTENT_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label })),
            /* Retired is not a status column — it is retired_at — but it is
               exactly what somebody means when they reach for this control.
               129 retired rows were invisible here, indistinguishable from
               drafts, until one of them was published by accident. */
            { value: "retired", label: "Retired" },
          ]}
        />
      </Field>
    </div>
  );
}

/*
 * The trigger's look moved into components/brand/Select.tsx as
 * SELECT_TRIGGER_CLASS, along with the reason it is p-3 with no size class:
 * iOS Safari — and so the WKWebView the app ships in — zooms the whole page
 * when a control smaller than 16px takes focus, which used to jump the layout
 * every time a filter opened. One definition now, so the styled menu and the
 * native one cannot drift apart.
 */

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-soft">
        {label}
      </span>
      {children}
    </label>
  );
}

export default ContentFilters;
