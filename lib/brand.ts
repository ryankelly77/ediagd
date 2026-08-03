/* ============================================================================
   EDIAGD — brand constants & domain logic (framework-agnostic)
   Use these in application logic. For styling, prefer Tailwind classes /
   CSS variables so theming stays centralized. Hex values here mirror
   styles/brand.css exactly.
   ============================================================================ */

export const palette = {
  navy: "#0C1C2C",
  navyDeep: "#061422",
  ocean: "#2A7A8A",
  teal: "#4AA8B0",
  tealSoft: "#B2DADC",
  ice: "#EAF6F2",
  iceDim: "#C4E6E0",
  gold: "#E8B44C",
  goldSoft: "#F4E0B0",
  palm: "#3B9E6A",
  palmSoft: "#B9E2C8",
  clay: "#C9762F", // warm attention — never red
  cream: "#F4F0E4",
  creamCard: "#FCFAF4",
  ink: "#0C1C2C",
  inkSoft: "#687080",
  line: "#E0D8C6",
} as const;

export type ColorName = keyof typeof palette;

/* ---- Advisor tier -------------------------------------------------------- */
export type Tier = "Elite" | "Strong" | "Low" | "Zero";

export const TIER_META: Record<
  Tier,
  { label: string; text: ColorName; tint: string }
> = {
  Elite: { label: "Elite", text: "gold", tint: palette.goldSoft },
  Strong: { label: "Strong", text: "palm", tint: palette.palmSoft },
  Low: { label: "Low", text: "ocean", tint: palette.tealSoft },
  Zero: { label: "Zero", text: "clay", tint: "#F0DFC9" },
};

/**
 * Tier from a 0–1 performance score (share of families at/above store average,
 * revenue-weighted in the real app). Thresholds mirror the prototype.
 */
export function tierFromScore(score: number): Tier {
  if (score >= 0.85) return "Elite";
  if (score >= 0.5) return "Strong";
  if (score >= 0.2) return "Low";
  return "Zero";
}

/* ---- Service status (the glanceable dot) --------------------------------- */
export type ServiceStatus = "on-track" | "close" | "pursue";

export const STATUS_META: Record<
  ServiceStatus,
  { label: string; cssVar: string; color: ColorName }
> = {
  "on-track": { label: "On track", cssVar: "--status-on-track", color: "palm" },
  close: { label: "Close", cssVar: "--status-close", color: "gold" },
  pursue: { label: "Pursue", cssVar: "--status-pursue", color: "clay" },
};

/**
 * A service's status, measured against the STORE AVERAGE (not the single best
 * performer). Positive framing by design: the low tier is "Pursue", never a
 * failure label.
 */
export function serviceStatus(rate: number, storeAvg: number): ServiceStatus {
  if (rate >= storeAvg) return "on-track";
  if (rate >= storeAvg * 0.6) return "close";
  return "pursue";
}

/* ---- Engagement (admin) -------------------------------------------------- */
export const ENGAGEMENT_TARGET = 75; // % — rooftops below this get flagged

/** 55% login-rate + 45% video-watch-rate over the working-day window. */
export function engagementScore(
  loginDays: number,
  videosWatched: number,
  workingDays: number
): number {
  if (workingDays <= 0) return 0;
  return Math.round(
    100 * (0.55 * (loginDays / workingDays) + 0.45 * (videosWatched / workingDays))
  );
}

/* ---- Brand copy ---------------------------------------------------------- */
export const BRAND = {
  name: "EDIAGD",
  app: "Eddie",
  tagline: "Every Day Is A Great Day", // single source of truth — GREAT overrides the book's GOOD; see BRAND.md
  greeting: "Aloha", // welcome — login screen
  signoff: "Mahalo", // how every EDIAGD interaction closes
  contentColumnMax: 940,
} as const;
