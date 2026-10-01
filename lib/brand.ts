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
  greeting: "Aloha", // welcome — the login screen and onboarding, where no rooftop clock exists yet
  signoff: "Mahalo", // how every EDIAGD interaction closes
  contentColumnMax: 940,
} as const;

/**
 * The greeting that follows the clock — THE STORE'S clock.
 *
 * "Aloha" stays on the login screen and onboarding, where nobody is signed in
 * and no rooftop exists to ask the time of. Every signed-in, in-day greeting
 * (/advisor, the daily loop, the technician's day, the not-ready screen) uses
 * this, fed the ROOFTOP's hour — never the server's and never the phone's. A
 * store in Hawaii at 8 a.m. must not be told good afternoon by a server in
 * Virginia.
 *
 *   before 12   Good morning
 *   12 to 16    Good afternoon
 *   17 onward   Good evening
 */
export function greetingForHour(hour: number): string {
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return BRAND.greeting;
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type GreetingClient = { rpc: (fn: string, args?: Record<string, unknown>) => any };

/**
 * The rooftop's current greeting, from the same source rooftop_today() reads:
 * `rooftop_local_now(_rooftop)` is `now() at time zone rooftop.timezone` in
 * the DATABASE — one clock, one timezone column, no second opinion.
 *
 * Falls back to BRAND.greeting when the clock cannot be read: "Aloha" at the
 * wrong hour is on-brand; "Good morning" at 9 p.m. is a wrong statement.
 */
export async function rooftopGreeting(
  client: GreetingClient,
  rooftopId: string | null | undefined
): Promise<string> {
  if (!rooftopId) return BRAND.greeting;
  const { data, error } = await client.rpc("rooftop_local_now", { _rooftop: rooftopId });
  if (error || typeof data !== "string" || data.length < 13) return BRAND.greeting;
  const hour = Number(data.slice(11, 13));
  return greetingForHour(hour);
}
