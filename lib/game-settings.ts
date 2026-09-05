/* ============================================================================
   EDIAGD — game_settings field definitions + validation
   Client-safe (no Supabase imports) so the form and the server action share one
   description of every tunable. Adding a setting means adding it here once.

   These are the numbers the engine reads at runtime — completeDay() never
   hardcodes an amount, so editing them here changes the economy with no deploy.
   ============================================================================ */

export type GameSettingsValues = {
  paddle_out_cap: number;
  paddle_out_per_month: number;
  sand_paddle_out_price: number;
  sand_daily_loop: number;
  sand_swell_7: number;
  sand_swell_30: number;
  sand_swell_90: number;
  sand_swell_365: number;
  sand_badge: number;
  sand_certification: number;
  sand_lesson: number;
  video_complete_pct: number;
  island_time_days_per_year: number;
};

export type GameSettingKey = keyof GameSettingsValues;

export type GameSettingField = {
  key: GameSettingKey;
  label: string;
  hint: string;
  group: "streak" | "rewards";
  min: number;
  max: number;
};

/**
 * The paddle-out cap is bounded at 30 to match the DB check constraint on
 * swell.paddle_out_available (0..30, added in 0011) — a cap above that would
 * let the engine try to bank more grace than a row can hold.
 */
export const GAME_SETTING_FIELDS: GameSettingField[] = [
  {
    /*
     * Island Time makes days stop counting against a Swell, so with no cap an
     * advisor could book every week they did not feel like turning up and hold
     * a 365-Day Swell without completing a day. 15 is a placeholder pending
     * Mitch's ruling — roughly three working weeks, and not defended beyond
     * that, which is why it is a text box here rather than a constant.
     *
     * Counted in WORK days against each advisor's own schedule: a Saturday
     * inside a booked fortnight costs a Mon-Fri advisor nothing. 0 switches
     * Island Time off entirely and the screen says so in those words.
     */
    key: "island_time_days_per_year",
    label: "Island Time days per year",
    hint: "Scheduled work days of planned absence an advisor may book per calendar year. Days they weren't working don't count. 0 turns it off.",
    group: "streak",
    min: 0,
    max: 365,
  },
  {
    key: "paddle_out_cap",
    label: "Max grace days a user can bank",
    hint: "Paddle Back Out days accumulate up to this ceiling. Database allows 0–30.",
    group: "streak",
    min: 0,
    max: 30,
  },
  {
    key: "paddle_out_per_month",
    label: "Grace days granted per month",
    hint: "Added on the first completion of each new month, up to the cap above.",
    group: "streak",
    min: 0,
    max: 30,
  },
  {
    key: "sand_paddle_out_price",
    label: "Cost of buying a grace day",
    hint: "What an advisor spends in the Swag Shack for one Paddle Back Out day.",
    group: "streak",
    min: 0,
    max: 100_000,
  },
  {
    key: "sand_daily_loop",
    label: "Sand Dollars for completing the daily loop",
    hint: "Paid every day the advisor finishes quote → cue → video.",
    group: "rewards",
    min: 0,
    max: 100_000,
  },
  {
    key: "sand_swell_7",
    label: "Bonus for a 7-Day Swell",
    hint: "Paid once, the first time the streak reaches 7.",
    group: "rewards",
    min: 0,
    max: 100_000,
  },
  {
    key: "sand_swell_30",
    label: "Bonus for a 30-Day Swell",
    hint: "Paid once, the first time the streak reaches 30.",
    group: "rewards",
    min: 0,
    max: 100_000,
  },
  {
    key: "sand_swell_90",
    label: "Bonus for a 90-Day Swell",
    hint: "Paid once, the first time the streak reaches 90.",
    group: "rewards",
    min: 0,
    max: 100_000,
  },
  {
    key: "sand_swell_365",
    label: "Bonus for a 365-Day Swell",
    hint: "Paid once, the first time the streak reaches 365 — a year of great days.",
    group: "rewards",
    min: 0,
    max: 100_000,
  },
  {
    key: "sand_badge",
    label: "Default Sand Dollars for earning a badge",
    hint: "Used by badges that don't carry their own milestone bonus.",
    group: "rewards",
    min: 0,
    max: 100_000,
  },
  {
    key: "sand_lesson",
    label: "Sand Dollars for finishing a lesson",
    hint: "Paid once per item, ever — a cue or a video in the library. Kept below the daily loop on purpose: a library of hundreds of items shouldn't outpay the habit.",
    group: "rewards",
    min: 0,
    max: 100_000,
  },
  {
    key: "video_complete_pct",
    label: "How much of a video counts as watched",
    hint: "Percent. Below this a video isn't finished and pays nothing.",
    group: "rewards",
    min: 1,
    max: 100,
  },
  {
    key: "sand_certification",
    label: "Sand Dollars for earning a certification",
    hint: "Reserved for the Lessons work — not yet awarded by the engine.",
    group: "rewards",
    min: 0,
    max: 100_000,
  },
];

export const STREAK_FIELDS = GAME_SETTING_FIELDS.filter((f) => f.group === "streak");
export const REWARD_FIELDS = GAME_SETTING_FIELDS.filter((f) => f.group === "rewards");

/** Whole numbers only, within each field's range. */
export function validateGameSettings(values: GameSettingsValues): {
  fieldErrors: Partial<Record<GameSettingKey, string>>;
  clean: GameSettingsValues;
} {
  const fieldErrors: Partial<Record<GameSettingKey, string>> = {};
  const clean = {} as GameSettingsValues;

  for (const field of GAME_SETTING_FIELDS) {
    const raw = values[field.key];
    const value = Number(raw);

    if (raw === null || raw === undefined || Number.isNaN(value)) {
      fieldErrors[field.key] = "Enter a number.";
      clean[field.key] = 0;
      continue;
    }
    if (!Number.isInteger(value)) {
      fieldErrors[field.key] = "Whole numbers only.";
    } else if (value < field.min || value > field.max) {
      fieldErrors[field.key] = `Must be between ${field.min} and ${field.max}.`;
    }
    clean[field.key] = value;
  }

  return { fieldErrors, clean };
}
