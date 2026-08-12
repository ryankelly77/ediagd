/* ============================================================================
   EDIAGD — the badge system, in code
   Mirrors BADGES.md: all 19 badges, their family, tier ring, and — the bit the
   wall needs — a plain-language line telling someone how to earn each one.
   Client-safe: no Supabase imports.

   STATUS is about DATA PLUMBING, not art. Every badge is drawn. "future" means
   the platform can't yet detect the achievement (no lessons, no period history,
   no team tracking, no certifications), so the wall marks those "Coming soon"
   rather than letting them read as things the user is failing to earn.

   Voice: encouraging, plain, never punitive. "Reach a 7-day Swell", not
   "You have not maintained a streak."
   ============================================================================ */

export type BadgeFamily =
  | "consistency"
  | "learning"
  | "performance"
  | "team"
  | "mastery";

export type BadgeStatus = "now" | "future";

export type BadgeSpec = {
  key: string;
  name: string;
  family: BadgeFamily;
  ring: "seafoam" | "gold";
  status: BadgeStatus;
  /** One line, always visible on the wall. */
  howToEarn: string;
  /** The fuller sentence, shown in the detail sheet. */
  detail: string;
  /** Why it isn't earnable yet — shown only on "future" badges. */
  waitingOn?: string;
};

export const BADGE_FAMILIES: {
  key: BadgeFamily;
  label: string;
  blurb: string;
}[] = [
  {
    key: "consistency",
    label: "Consistency",
    blurb: "Showing up, day after day. These are live now.",
  },
  { key: "learning", label: "Learning", blurb: "Going deeper than the daily three minutes." },
  { key: "performance", label: "Performance", blurb: "Beating your own numbers." },
  { key: "team", label: "Team", blurb: "Lifting the whole crew." },
  { key: "mastery", label: "Mastery", blurb: "Becoming the one others learn from." },
];

/** Ordered so the earnable family reads first. */
export const BADGES: BadgeSpec[] = [
  // ---- Consistency — live today on the streak engine ----------------------
  {
    key: "first_light",
    name: "First Light",
    family: "consistency",
    ring: "seafoam",
    status: "now",
    howToEarn: "Finish your first daily training",
    detail:
      "Awarded the first time you complete the daily loop. Everything starts here.",
  },
  {
    key: "swell_7",
    name: "7-Day Swell",
    family: "consistency",
    ring: "seafoam",
    status: "now",
    howToEarn: "Reach a 7-day Swell",
    detail: "One week of great days in a row. Grace days keep the Swell rolling.",
  },
  {
    key: "swell_30",
    name: "30-Day Swell",
    family: "consistency",
    ring: "gold",
    status: "now",
    howToEarn: "Reach a 30-day Swell",
    detail: "A month of great days. This is where the habit stops feeling like effort.",
  },
  {
    key: "swell_90",
    name: "90-Day Swell",
    family: "consistency",
    ring: "gold",
    status: "now",
    howToEarn: "Reach a 90-day Swell",
    detail: "A full quarter, unbroken. Very few get here.",
  },
  {
    key: "swell_365",
    name: "365-Day Swell",
    family: "consistency",
    ring: "gold",
    status: "now",
    howToEarn: "Reach a 365-day Swell",
    detail: "A year of great days. The rarest thing in the app.",
  },

  // ---- Learning — needs the lesson library --------------------------------
  {
    key: "ten_sunrises",
    name: "Ten Sunrises",
    family: "learning",
    ring: "seafoam",
    status: "now",
    howToEarn: "Complete ten lessons",
    detail: "Ten lessons finished beyond the daily loop.",
  },
  {
    key: "fifty_sunrises",
    name: "Fifty Sunrises",
    family: "learning",
    ring: "gold",
    status: "now",
    howToEarn: "Complete fifty lessons",
    detail: "Fifty lessons finished — a serious body of work.",
  },
  {
    key: "eddies_pick",
    name: "Eddie's Pick",
    family: "learning",
    ring: "gold",
    status: "now",
    howToEarn: "Complete twenty daily picks",
    detail: "Twenty of Eddie's daily picks worked all the way through.",
  },
  {
    key: "full_horizon",
    name: "Full Horizon",
    family: "learning",
    ring: "gold",
    status: "now",
    howToEarn: "Finish everything published in one service",
    detail: "Every published cue and video in one service, finished.",
  },

  // ---- Performance — needs a second period of data ------------------------
  {
    key: "personal_best",
    name: "Personal Best",
    family: "performance",
    ring: "seafoam",
    status: "future",
    howToEarn: "Beat your own attach-rate record",
    detail: "Your own high-water mark, passed. Compete with yesterday.",
    waitingOn: "Arrives once a second month of numbers exists.",
  },
  {
    key: "five_points",
    name: "Five Points",
    family: "performance",
    ring: "gold",
    status: "future",
    howToEarn: "Lift your attach rate five points in a month",
    detail: "Five percentage points, period over period.",
    waitingOn: "Arrives once a second month of numbers exists.",
  },
  {
    key: "clean_sweep",
    name: "Clean Sweep",
    family: "performance",
    ring: "gold",
    status: "future",
    howToEarn: "Attach every coachable opportunity in a day",
    detail: "A day where nothing was left on the table.",
    waitingOn: "Needs day-level repair-order data.",
  },

  // ---- Team — needs team activity tracking --------------------------------
  {
    key: "crew",
    name: "Crew",
    family: "team",
    ring: "seafoam",
    status: "future",
    howToEarn: "Have your whole team active on the same day",
    detail: "Everyone in the store showed up on the same day.",
    waitingOn: "Arrives with team activity tracking.",
  },
  {
    key: "morning_huddle",
    name: "Morning Huddle",
    family: "team",
    ring: "gold",
    status: "future",
    howToEarn: "Hold thirty straight team huddles",
    detail: "Thirty consecutive huddles — everyone under one umbrella.",
    waitingOn: "Arrives with team huddles.",
  },
  {
    key: "full_crew",
    name: "Full Crew",
    family: "team",
    ring: "gold",
    status: "future",
    howToEarn: "Have every advisor earn a badge in a month",
    detail: "A month where nobody on the team was left behind.",
    waitingOn: "Arrives with team activity tracking.",
  },
  {
    key: "lift",
    name: "Lift",
    family: "team",
    ring: "seafoam",
    status: "future",
    howToEarn: "Help a teammate to a personal best",
    detail: "Awarded by your manager when you walk alongside someone.",
    waitingOn: "Awarded by a manager — no automatic signal.",
  },

  // ---- Mastery — needs certifications -------------------------------------
  {
    key: "big_wave",
    name: "Big Wave",
    family: "mastery",
    ring: "gold",
    status: "future",
    howToEarn: "Earn a certification",
    detail: "The master mark. The biggest single reward in the app.",
    waitingOn: "Arrives with certifications.",
  },
  {
    key: "coach",
    name: "Coach",
    family: "mastery",
    ring: "gold",
    status: "future",
    howToEarn: "Coach another advisor to certification",
    detail: "The paddle you hand to the next person.",
    waitingOn: "Arrives with certifications.",
  },
  {
    key: "waterman",
    name: "Waterman",
    family: "mastery",
    ring: "gold",
    status: "future",
    howToEarn: "Get certified in every track",
    detail: "A full quiver — certified across the board.",
    waitingOn: "Arrives with certifications.",
  },
];

export const BADGES_BY_KEY = new Map(BADGES.map((b) => [b.key, b]));

/** The five wired to the streak engine today. */
export const NOW_BADGE_KEYS = BADGES.filter((b) => b.status === "now").map(
  (b) => b.key
);
