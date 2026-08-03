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

export type AdvisorEngagement = {
  userId: string;
  name: string;
  workingDays: number;
  daysLoggedIn: number;
  videosWatched: number;
  loginRatePct: number;
  watchRatePct: number;
  /** Straight from the view — never recomputed here. */
  engagementScore: number;
};

export type RooftopEngagement = {
  rooftopId: string;
  name: string;
  advisors: AdvisorEngagement[];
  advisorCount: number;
  engagedCount: number;
  /** Mean of this rooftop's advisor scores; null when nobody has data yet. */
  averageScore: number | null;
};

export type GroupEngagement = {
  rooftops: RooftopEngagement[];
  advisorCount: number;
  engagedCount: number;
  /**
   * Mean across every advisor in the group — not a mean of rooftop means, so a
   * two-advisor store doesn't outweigh a twenty-advisor store.
   */
  averageScore: number | null;
};

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/** Lowest engagement first — the people who need a nudge surface at the top. */
export function rankAdvisors(advisors: AdvisorEngagement[]): AdvisorEngagement[] {
  return [...advisors].sort(
    (a, b) => a.engagementScore - b.engagementScore || a.name.localeCompare(b.name)
  );
}

export function summarizeRooftop(
  rooftopId: string,
  name: string,
  advisors: AdvisorEngagement[]
): RooftopEngagement {
  const ranked = rankAdvisors(advisors);
  return {
    rooftopId,
    name,
    advisors: ranked,
    advisorCount: ranked.length,
    engagedCount: ranked.filter((a) => a.engagementScore >= ENGAGEMENT_TARGET).length,
    averageScore: mean(ranked.map((a) => a.engagementScore)),
  };
}

/**
 * Roll rooftops into the group headline. Rooftops needing the most attention
 * (lowest average) sort first; rooftops with no data yet sink to the bottom
 * rather than reading as a zero.
 */
export function summarizeGroup(rooftops: RooftopEngagement[]): GroupEngagement {
  const sorted = [...rooftops].sort((a, b) => {
    if (a.averageScore == null) return 1;
    if (b.averageScore == null) return -1;
    return a.averageScore - b.averageScore;
  });

  const everyone = sorted.flatMap((r) => r.advisors);
  return {
    rooftops: sorted,
    advisorCount: everyone.length,
    engagedCount: everyone.filter((a) => a.engagementScore >= ENGAGEMENT_TARGET).length,
    averageScore: mean(everyone.map((a) => a.engagementScore)),
  };
}
