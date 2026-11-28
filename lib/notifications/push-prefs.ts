/* ============================================================================
   EDIAGD — who gets asked about notifications, and when

   ---------------------------------------------------------------------------
   THE ONE-SHOT PROBLEM
   ---------------------------------------------------------------------------
   iOS shows its notification permission dialog ONCE per install. Ask at a bad
   moment, get a "no", and the app has permanently lost the ability to speak to
   that phone — the only way back is Settings, which nobody walks. So the real
   dialog is never shown cold. It appears behind our own card, at a moment the
   advisor has just finished something, and the card itself appears at most
   twice ever.

   Two, not one, and not "until they say yes". The first ask lands the day they
   complete their first block, when the app has just been useful and the offer
   makes sense. Somebody who says "not now" then is not necessarily saying no
   forever — a person on a five-day streak has a reason to protect that they did
   not have on day one, which is the only new argument we have and therefore the
   only second ask worth spending.

   ---------------------------------------------------------------------------
   WHY THE BUDGET IS SERVER-SIDE
   ---------------------------------------------------------------------------
   Because it is a fact about a PERSON, not a browser. Advisors switch handsets,
   reinstall, and sign in on a loaner from the service drive. In localStorage
   every one of those hands them a fresh pair of asks, and the two-ask budget
   quietly becomes unlimited — which is exactly the nagging the budget exists to
   prevent.
   ============================================================================ */

export type PushPref = {
  pushEnabled: boolean;
  softAskCount: number;
  softAskAnswer: "yes" | "not_now" | null;
  /**
   * When the card was last SHOWN. `record_soft_ask` has stamped this since
   * 0102; nothing read it until the card gained a second surface.
   */
  softAskLastAt: string | null;
};

export const DEFAULT_PUSH_PREF: PushPref = {
  /* True by default: the OS dialog IS the opt-in, so somebody who granted it
     should not have to find a second switch before anything arrives. */
  pushEnabled: true,
  softAskCount: 0,
  softAskAnswer: null,
  softAskLastAt: null,
};

/** The streak at which the second and final ask becomes available. */
export const SECOND_ASK_STREAK = 5;

/**
 * Should the soft-ask card render for this person right now?
 *
 * Pure, and separated from every I/O around it, because the interesting part is
 * a budget with an off-by-one in it: "at most twice" is easy to write as
 * "at most three times" by accident, and the cost of that bug is somebody's
 * permission dialog.
 *
 * The caller adds two conditions this cannot know:
 *   * it is the native shell (a browser has no push surface at all)
 *   * they do not already have a live token
 */
export function shouldOfferSoftAsk(input: {
  /** Days they have completed, ever. The first ask waits for one. */
  completions: number;
  /** Current Swell length, for the second ask. */
  streak: number;
  pref: PushPref;
  /**
   * Has the card already been shown today, at this person's store clock?
   *
   * ---------------------------------------------------------------------
   * WHY THE CALLER DECIDES THIS AND NOT THIS FUNCTION
   * ---------------------------------------------------------------------
   * "Today" is the ROOFTOP's today, not UTC's and not the browser's, and
   * this function is pure and holds no timezone. The caller has both the
   * store date and the rooftop zone; handing in the comparison keeps the
   * single interesting thing here — the budget — testable without a clock.
   *
   * Optional, and FALSE is the honest default: a caller that does not know
   * gets the pre-existing behaviour rather than a silent suppression.
   */
  askedToday?: boolean;
}): boolean {
  const { completions, streak, pref, askedToday = false } = input;

  /* Already said yes: the OS has been asked, and asking again is either a
     no-op or an annoyance depending on what they told iOS. */
  if (pref.softAskAnswer === "yes") return false;

  /* The budget. Two, ever. */
  if (pref.softAskCount >= 2) return false;

  /*
   * ---- ONE ASK PER DAY, WHICH IS NEW AND IS NOT THE BUDGET ----------------
   *
   * The card now has two surfaces in one day: the celebration the moment a
   * morning is finished, and the done-for-today screen on any later visit to
   * /today. Without this, an advisor who answered "not now" on the
   * celebration could meet the same card again an hour later — the budget
   * would allow it, because their streak is at or past SECOND_ASK_STREAK and
   * only one of the two asks has been spent.
   *
   * Two asks is a budget about a PERSON'S LIFETIME. Spending both inside one
   * morning is the nagging that budget exists to prevent, and it would also
   * waste the second ask's only argument — a longer streak they do not have
   * yet today.
   */
  if (askedToday) return false;

  /* NEVER BEFORE THE APP HAS BEEN USEFUL. An ask on day zero is a stranger
     wanting something; an ask after a finished block is an offer. */
  if (completions < 1) return false;

  if (pref.softAskCount === 0) return true;

  /* The second ask needs its own reason to exist, and the streak is it. */
  return streak >= SECOND_ASK_STREAK;
}

type Client = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

/** Their row, or the defaults. A missing row is a person who has never been asked. */
export async function loadPushPref(
  client: Client,
  userId: string
): Promise<PushPref> {
  const { data } = await client
    .from("user_notification_pref")
    .select("push_enabled, soft_ask_count, soft_ask_answer, soft_ask_last_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return DEFAULT_PUSH_PREF;

  return {
    pushEnabled: Boolean(data.push_enabled),
    softAskCount: Number(data.soft_ask_count ?? 0),
    softAskAnswer: (data.soft_ask_answer ?? null) as PushPref["softAskAnswer"],
    softAskLastAt: (data.soft_ask_last_at ?? null) as string | null,
  };
}

/** Does this person have a device we could actually reach? */
export async function hasLiveToken(
  client: Client,
  userId: string
): Promise<boolean> {
  const { data } = await client
    .from("device_push_token")
    .select("id")
    .eq("user_id", userId)
    .is("retired_at", null)
    .limit(1);
  return (data ?? []).length > 0;
}
