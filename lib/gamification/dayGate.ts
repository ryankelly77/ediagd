/* ============================================================================
   EDIAGD — what "complete" means, in one place

   PURE. No database, no imports from the app. It takes a description of what
   was served and what was watched, and returns whether the day is finished.

   ---------------------------------------------------------------------------
   WHY THIS IS A MODULE AND NOT THREE `if`s IN completeDay
   ---------------------------------------------------------------------------
   Three morning types — normal, two-slot, track-entry — have to complete
   through the SAME function, not through three call sites that agree today.
   They already nearly diverged once: the old loop let the client decide when
   step 4 was done and the server recorded a percentage it never checked, so
   "the day is complete" was really "the client navigated to step 5".

   The rule that keeps them together is that a morning is a LIST OF LEGS, and
   the morning type only decides which legs are REQUIRED. Adding a type is
   adding a row to that list. It is not a new branch.

   ---------------------------------------------------------------------------
   AND WHY THE LEGS ARE DATA
   ---------------------------------------------------------------------------
   TWO_LADDERS §PROPOSED marks the Good News Story undecided, and asks that if
   it is ever approved the gate be `itemsDone && quizPassed !== false &&
   (storyRequired ? storySubmitted : true)` — "a flag, not a structure. Turning
   it off is config, not a migration."

   NO STORY LEG IS DEFINED HERE. It is not approved, and 3d says do not design
   schema for it speculatively. What is here is the shape that makes it one
   entry in LEGS when and if it is: a key, when it is required, and how to tell
   whether it was met. Dropping it again would be deleting that entry. That
   preparation costs nothing and is worth having on its own — the reason to
   insist on it is that three components each deciding what "complete" means is
   how a leg gets removed everywhere but one place.
   ============================================================================ */

/** Which shape of morning was served. Recorded on daily_completion. */
export type MorningKind = "normal" | "two_slot" | "track_entry";

/**
 * What the morning put in front of the advisor, and what came back.
 *
 * `null` means THE SLOT WAS NOT OFFERED, which is not the same as offered and
 * not done. A two-slot morning has `pitch: null` because the focus family ran
 * out of film; that must not read as an unfinished pitch.
 */
export type ServedMorning = {
  kind: MorningKind;
  /** The mindset film. Always offered. */
  mindset: SlotState | null;
  /** The pitch film, or null on a two-slot or track-entry morning. */
  pitch: SlotState | null;
  /** The item, or null on a track-entry morning. */
  item: SlotState | null;
  /** The track film, only on a track-entry morning that HAS one. */
  trackFilm: SlotState | null;
};

/**
 * One slot's state.
 *
 * `met` is the server's judgement, never the client's claim — for a film it is
 * the watch gate that this server already stood behind (lib/watch-gate.ts), and
 * for an item it is the consumption row.
 */
export type SlotState = {
  contentId: string;
  met: boolean;
};

export type Leg = {
  key: "mindset" | "pitch" | "item" | "track_film";
  /** Offered on this morning at all. */
  offered: boolean;
  /** Offered AND must be finished for the day to count. */
  required: boolean;
  met: boolean;
};

export type DayGateResult = {
  complete: boolean;
  legs: Leg[];
  /** The legs that are required and not met. Empty when complete. */
  outstanding: Leg["key"][];
};

/**
 * THE LIST. One entry per leg; the morning type decides `required`.
 *
 * Every leg here is required-if-offered, which reads like a redundancy and is
 * not: it is the statement that there are no optional steps in a morning. The
 * quote on the completion screen is not on this list precisely because it IS
 * optional — ruling 6, it gates nothing — and the way to say that is to leave
 * it out rather than to add it with `required: false`, which would invite
 * somebody to flip it.
 */
const LEGS: {
  key: Leg["key"];
  slot: (m: ServedMorning) => SlotState | null;
  requiredWhenOffered: (kind: MorningKind) => boolean;
}[] = [
  {
    key: "mindset",
    slot: (m) => m.mindset,
    /*
     * ALWAYS. "Get your head right" is the one beat every morning has, and it
     * is the reason the film moved to the front.
     */
    requiredWhenOffered: () => true,
  },
  {
    key: "pitch",
    slot: (m) => m.pitch,
    requiredWhenOffered: (kind) => kind === "normal",
  },
  {
    key: "item",
    slot: (m) => m.item,
    requiredWhenOffered: (kind) => kind === "normal" || kind === "two_slot",
  },
  {
    key: "track_film",
    slot: (m) => m.trackFilm,
    /*
     * A track-entry morning WITH a film: the film is the day, so it is the
     * gate. Without one the slot is never offered and this leg is inert — which
     * is ruling 2 expressed as code rather than as a comment. No film means a
     * normal three-slot morning and the track simply starts.
     */
    requiredWhenOffered: (kind) => kind === "track_entry",
  },
];

/**
 * Is this morning finished?
 *
 * A leg that was not offered cannot hold the day open. A leg that was offered
 * and is required must be met. There is no third rule, and there is no place
 * else that decides this.
 */
export function evaluateDayGate(morning: ServedMorning): DayGateResult {
  const legs: Leg[] = LEGS.map(({ key, slot, requiredWhenOffered }) => {
    const state = slot(morning);
    const offered = state !== null;
    return {
      key,
      offered,
      required: offered && requiredWhenOffered(morning.kind),
      met: state?.met ?? false,
    };
  });

  const outstanding = legs.filter((l) => l.required && !l.met).map((l) => l.key);

  /*
   * A MORNING WITH NOTHING REQUIRED IS NOT COMPLETE, IT IS BROKEN.
   *
   * Every shape offers at least the mindset film. If none of the legs came back
   * required, the morning was assembled wrong — an empty library, a failed
   * query — and returning `complete: true` would hand out a streak day and ten
   * Sand Dollars for a screen with nothing on it. Fail closed: the advisor is
   * asked to reload, which is recoverable, rather than paid for nothing, which
   * is not.
   */
  if (!legs.some((l) => l.required)) {
    return { complete: false, legs, outstanding: ["mindset"] };
  }

  return { complete: outstanding.length === 0, legs, outstanding };
}

/** For the refusal message. "the mindset film and the pitch film". */
export function describeOutstanding(keys: Leg["key"][]): string {
  const NAMES: Record<Leg["key"], string> = {
    mindset: "the mindset film",
    pitch: "the pitch film",
    item: "today's item",
    track_film: "the track film",
  };
  const names = keys.map((k) => NAMES[k]);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
