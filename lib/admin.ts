/* ============================================================================
   EDIAGD — admin engagement logic
   The engagement SCORE is computed by the `user_engagement` view (0009), which
   is the single source of truth — nothing here recomputes it. These helpers
   only group rows by rooftop and map a score to the brand's colour language.
   ============================================================================ */

import { ENGAGEMENT_TARGET, type ColorName } from "./brand";

export type EngagementBand = "engaged" | "building" | "nudge";

export const BAND_META: Record<
  EngagementBand,
  { label: string; color: ColorName }
> = {
  // Positive framing throughout — the bottom band is a nudge, never a failure.
  engaged: { label: "Engaged", color: "palm" },
  building: { label: "Building", color: "gold" },
  nudge: { label: "Needs a nudge", color: "clay" },
};

/** >= 75 palm, 50-74 gold, < 50 clay. Never red. */
export function engagementBand(score: number): EngagementBand {
  if (score >= ENGAGEMENT_TARGET) return "engaged";
  if (score >= 50) return "building";
  return "nudge";
}

/* The per-advisor / per-rooftop grouping that used to live here is gone: the
   0026 views (admin_advisor_engagement, admin_rooftop_engagement,
   admin_engagement_summary) do it in Postgres. Doing it in JS meant fetching
   every row first, which silently truncated at PostgREST's 1000-row cap.
   Only the band language survives, because it's shared with the UI. */
