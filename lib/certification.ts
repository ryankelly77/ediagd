/* ============================================================================
   EDIAGD — certification and credential state

   PURE. No database, no clock. Everything here takes what it needs and returns
   what it decided, so the rules can be asserted without a fixture advisor —
   see test:certification.

   ---------------------------------------------------------------------------
   THE ONE LAW THIS FILE ENFORCES
   ---------------------------------------------------------------------------
   Design law 6: credentials are computed, never granted by hand. There is no
   function here that takes "give this person the credential" as an input. A
   credential is a CONCLUSION about a set of certifications, and if the
   conclusion is wrong the fix is in the constituents, never in an override.

   Design law 3 is the other one: lapsed is never revoked. Nothing here returns
   a state that removes something earned. `lapsed` is a currency fact sitting
   beside an earned fact, never instead of it.
============================================================================ */

import type { IsoDate } from "@/lib/gamification/streak";

/* ---------------------------------------------------------------------------
   CURRENCY
--------------------------------------------------------------------------- */

/**
 * A certification is current for one year — design law 2, "annual currency,
 * lightweight".
 *
 * CALENDAR YEAR, NOT 365 DAYS. Somebody who certifies on 29 February is current
 * through 28 February, because that is the day a human would name, and
 * Date's own month arithmetic already rolls it that way.
 */
export function currentThrough(earnedAt: IsoDate): IsoDate {
  const [y, m, d] = earnedAt.split("-").map(Number);
  /* Date.UTC normalises 2027-02-29 to 2027-03-01, which is a day later than a
     person would say. Clamp to the last valid day of the target month instead. */
  const lastOfTarget = new Date(Date.UTC(y + 1, m, 0)).getUTCDate();
  const day = Math.min(d, lastOfTarget);
  const out = new Date(Date.UTC(y + 1, m - 1, day));
  return out.toISOString().slice(0, 10) as IsoDate;
}

/** Current through the END of that day — the date printed on the certificate. */
export function isCurrent(through: IsoDate | null, today: IsoDate): boolean {
  if (!through) return false;
  return through >= today;
}

/* ---------------------------------------------------------------------------
   A SINGLE CERTIFICATION
--------------------------------------------------------------------------- */

/**
 * ---------------------------------------------------------------------------
 * A TRACK, ONCE EARNED, IS HELD PERMANENTLY
 * ---------------------------------------------------------------------------
 * It does not expire, and there is no date on which it stops counting. What it
 * carries is the day it was earned.
 *
 * THIS REPLACES ANNUAL CURRENCY ON TRACKS, AND THE REASON MATTERS BECAUSE THE
 * OLD RULE LOOKED CORRECT. Each track used to be current for a year from the
 * day it was earned, and EDIAGD Certified required all eight current at once.
 * That silently assumed the eight could be collected inside twelve months.
 *
 * They cannot. The four finished core courses run 29–56 items; at 300–400 items
 * for the full eight, the first track is earned around day 61 and the eighth
 * somewhere past day 440 — so the first has lapsed about two weeks before the
 * last is earned, and the credential can never compute. The advisor does every
 * piece of the work and is refused, correctly, by a rule that assumed a
 * renewal path which did not exist.
 *
 * It matches ASE, too: their window is long relative to how fast the specialty
 * certifications can be stacked. Ours was shorter than the climb, which is the
 * actual defect.
 *
 * THE CURRENCY MOVED TO THE CREDENTIAL, which is where it does retention work
 * anyway — on somebody who has something to maintain rather than somebody still
 * earning one — and it collapses renewal from eight refreshers a year to one.
 * Ten minutes for the advisor instead of eighty, and one refresher for Mitch to
 * write instead of thirty.
 *
 * The accepted cost, stated plainly: a Certified advisor may hold a track they
 * last touched years ago. The credential is the public claim and the credential
 * is what must be renewed, so the honesty lives where anybody can check it.
 */
export type CertificationHolding = {
  slug: string;
  isCore: boolean;
  /** The day it was earned. Null when never earned. */
  earnedOn: IsoDate | null;
};

/** A track is held or it is not. There is no third state and no clock. */
export type CertificationState = "held" | "unearned";

export function certificationState(
  holding: Pick<CertificationHolding, "earnedOn">
): CertificationState {
  return holding.earnedOn ? "held" : "unearned";
}

/**
 * "Earned 14 March 2027", or nothing at all.
 *
 * NOT "Current through". A track that cannot lapse must not display a currency
 * date — that would be the screen asserting something the engine no longer
 * believes, and the first person to notice would be an advisor wondering what
 * happens when the date passes. Nothing happens. So the date shown is the one
 * that means something: when they did the work.
 */
export function earnedLine(
  holding: Pick<CertificationHolding, "earnedOn">
): string | null {
  return holding.earnedOn ? `Earned ${holding.earnedOn}` : null;
}

/* ---------------------------------------------------------------------------
   THE CREDENTIAL'S OWN CURRENCY — the only clock left
--------------------------------------------------------------------------- */

export type CredentialCurrency = "current" | "lapsed";

export function credentialState(
  currentThrough: IsoDate,
  today: IsoDate
): CredentialCurrency {
  return isCurrent(currentThrough, today) ? "current" : "lapsed";
}

/**
 * "renew to stay current" — clay at most, never red. Design law 3, which did
 * not change: it simply applies to the credential now, which is the thing that
 * can actually go out of date.
 */
export function credentialCurrencyLine(
  currentThrough: IsoDate,
  today: IsoDate
): string {
  return credentialState(currentThrough, today) === "current"
    ? `Current through ${currentThrough}`
    : "Renew to stay current";
}

/* ---------------------------------------------------------------------------
   THE CREDENTIAL
--------------------------------------------------------------------------- */

export type CredentialLevel = "certified" | "master";

export type ComputedCredential = {
  level: CredentialLevel;
  /**
   * One year from the day the CREDENTIAL was earned.
   *
   * Not the earliest constituent any more. The constituents no longer carry
   * dates that expire, so there is no "weakest part" to be only as current as —
   * the credential's clock starts when the credential does.
   */
  currentThrough: IsoDate;
  /** Which certifications it was computed from — the audit trail. */
  from: string[];
};

/**
 * EDIAGD Certified: all eight core craft certifications HELD.
 *
 * ---------------------------------------------------------------------------
 * HELD, NOT HELD-AND-CURRENT — AND THE OLD COMMENT ARGUED THE OPPOSITE
 * ---------------------------------------------------------------------------
 * What used to be here was a defence of the rule this replaces: that a
 * credential is only as true as its weakest part, so its date should be the
 * earliest among its constituents. It reads well. It was also the bug, and a
 * confident comment defending a wrong rule is how a fix gets reverted in six
 * months by somebody who trusts the prose — so it is gone rather than softened.
 *
 * The rule assumed the eight tracks could be collected inside the year each one
 * stayed current. They cannot: see the note on CertificationHolding above. The
 * first track lapsed before the eighth was earned, so the credential could
 * never compute for anybody who actually did the work.
 *
 * A track is now held permanently and the CREDENTIAL carries the year. There is
 * no weakest part to be only as current as, and nothing here consults a clock
 * to decide whether a constituent still counts — `today` is used only to date
 * the credential being granted.
 *
 * MASTER IS DEFINED AND UNREACHABLE. The level exists in the type and in the
 * database check constraint; nothing computes it. Its shape is the contribution
 * programme, which is Mitch's open design (spec §5) and phase 3. Returning it
 * from here on "every certification held" would quietly ship the accumulation
 * model he explicitly said he was on the fence about.
 */
export function computeCredential(
  holdings: CertificationHolding[],
  today: IsoDate,
  /**
   * HOW MANY CORE CERTIFICATIONS THE CATALOGUE HAS. Required, and not derived
   * from `holdings`.
   *
   * This argument exists because leaving it out was a silent-grant bug, found
   * by the test that passed seven core holdings and one non-core: the function
   * counted the core it could see, found all of them current, and returned a
   * credential. Any caller that filtered its query — `.eq('is_core', true)`
   * plus a join that dropped the unearned ones — would have certified somebody
   * on three of eight.
   *
   * Law 6 says a credential is computed rather than granted. A computation that
   * trusts its input to be complete is a grant wearing a computation's clothes,
   * so the expected size comes from the catalogue and a mismatch refuses.
   */
  coreCount: number
): ComputedCredential | null {
  const core = holdings.filter((h) => h.isCore);

  /* A zero-length core set is not a credential. It means the catalogue has not
     been seeded, and "everyone is certified" is the worst possible reading of
     an empty array. */
  if (coreCount <= 0) return null;

  /* The caller was handed a partial list. Refuse rather than conclude. */
  if (core.length !== coreCount) return null;

  /*
   * HELD, NOT HELD-AND-CURRENT. This one word is the whole fix.
   *
   * The old line filtered to constituents that were still current, and that is
   * what made the credential unreachable: by the time the eighth track is
   * earned the first has aged past a year, so the filter dropped it and the
   * count never matched. Nothing was broken — the rule was wrong.
   */
  const heldCore = core.filter((h) => certificationState(h) === "held");
  if (heldCore.length !== core.length) return null;

  return {
    level: "certified",
    /* The credential's year starts NOW, on the day the eighth track lands. */
    currentThrough: currentThrough(today),
    from: heldCore.map((h) => h.slug).sort(),
  };
}

/**
 * "5 of 8 core — 3 from EDIAGD Certified."
 *
 * Stated plainly because the rung is the thing an advisor is actually playing
 * for, and a progress ring alone does not say how far. Counts CURRENT ones: a
 * lapsed core certification is genuinely not carrying you toward the credential
 * today, and saying "8 of 8" while the credential refuses to compute would be
 * the screen arguing with itself.
 */
export function coreProgressLine(
  holdings: CertificationHolding[],
  today: IsoDate,
  /** The catalogue's core count — same contract as computeCredential. */
  coreCount: number
): string {
  const core = holdings.filter((h) => h.isCore);
  const have = core.filter((h) => certificationState(h) === "held").length;
  const total = coreCount;
  if (total === 0) return "The core eight are not published yet";
  const left = total - have;
  if (left === 0) return `${have} of ${total} core — EDIAGD Certified`;
  return `${have} of ${total} core — ${left} from EDIAGD Certified`;
}

/**
 * "4 of the 8 are still being built."
 *
 * WHY THE HEADLINE NEEDS A SECOND SENTENCE. coreProgressLine counts the whole
 * core — eight — because the credential requires all eight and a denominator
 * that shrank as content was withdrawn would make the credential easier exactly
 * as the library got thinner. The Craft section, meanwhile, only lists the
 * tracks an advisor can actually start.
 *
 * So the screen said "0 of 8 core" above "0 of 4", and read as though it were
 * arguing with itself. Both numbers are right; what was missing was the reason
 * they differ. This is that reason, and it disappears on its own the moment
 * Mitch's content lands — there is no state to clean up.
 *
 * Returns null when nothing is unbuilt, because a line saying "0 are still
 * being built" is worse than no line.
 */
export function coreBuildLine(coreCount: number, unbuilt: number): string | null {
  if (coreCount <= 0 || unbuilt <= 0) return null;
  if (unbuilt >= coreCount) return `All ${coreCount} are still being built.`;
  return `${unbuilt} of the ${coreCount} are still being built.`;
}

/* ---------------------------------------------------------------------------
   EARNING A CERTIFICATION
--------------------------------------------------------------------------- */

export type ModuleProgress = {
  moduleId: string;
  /** Every published content item in the module is complete. */
  contentComplete: boolean;
  /**
   * Null when the module publishes no quiz.
   *
   * The existing LMS rule, from 0035: "Every cue in it done, AND — where a
   * published quiz exists — that quiz passed. Modules with no published quiz
   * complete on content alone, so importing the curriculum before authoring
   * quizzes doesn't make the whole library uncompletable."
   *
   * That rule is inherited rather than restated. Today only The Walk-Around has
   * published questions; the other six craft courses would be uncompletable if
   * this file took a stricter line than the system it sits on.
   */
  quizPassed: boolean | null;
};

export function moduleComplete(m: ModuleProgress): boolean {
  return m.contentComplete && m.quizPassed !== false;
}

/**
 * A certification is earned when every module of every one of its courses is
 * complete.
 *
 * A CERTIFICATION WITH NO MODULES IS NOT EARNED. `every()` on an empty array is
 * true, which would hand out a certification for a course nobody has written —
 * and five of the twelve craft tracks are exactly that today. The explicit
 * length check is the whole reason this is a function rather than a one-liner
 * at the call site.
 */
export function certificationEarned(modules: ModuleProgress[]): boolean {
  if (modules.length === 0) return false;
  return modules.every(moduleComplete);
}

/* ---- The track gate, and its legs are data ------------------------------- */

/**
 * WHAT A TRACK NEEDS, IN ONE PLACE.
 *
 * `certificationEarned` above answers only "is every module done". Since 3e a
 * track also needs its Good News Story — the advisor's own account of something
 * they did differently on the drive because of what the track taught them. One
 * per track, eight per credential, at track exit, mirroring the track film at
 * track entry.
 *
 * ---------------------------------------------------------------------------
 * THE LEGS ARE DATA, THE SAME WAY dayGate's ARE
 * ---------------------------------------------------------------------------
 * Not `modules.every(...) && (storyRequired ? storySubmitted : true)` written
 * out at each call site. One list, one reducer, so removing the story later is
 * deleting an entry — not hunting a condition through three components, which
 * is how a leg ends up removed everywhere but one place.
 *
 * `required` is what the flag decides; `met` is what happened. Keeping them
 * apart is what lets describeTrackOutstanding say WHICH leg is missing rather
 * than just "not yet".
 */
export type TrackLegKey = "modules" | "story";

export type TrackState = {
  modules: ModuleProgress[];
  /** game_settings.story_required — see lib/story.ts loadStoryGate(). */
  storyRequired: boolean;
  /** Is there a live advisor_story row for this track? */
  storySubmitted: boolean;
};

export type TrackLeg = {
  key: TrackLegKey;
  required: boolean;
  met: boolean;
};

const TRACK_LEGS: {
  key: TrackLegKey;
  required: (t: TrackState) => boolean;
  met: (t: TrackState) => boolean;
}[] = [
  {
    key: "modules",
    /*
     * ALWAYS, and a track with no modules is never earned — `every()` on an
     * empty array is true, which would hand out a certification for a course
     * nobody has written. certificationEarned carries that check; this defers
     * to it rather than restating the rule.
     */
    required: () => true,
    met: (t) => certificationEarned(t.modules),
  },
  {
    key: "story",
    required: (t) => t.storyRequired,
    met: (t) => t.storySubmitted,
  },
];

/** Every leg, offered or not — the shape describeTrackOutstanding reads. */
export function trackLegs(t: TrackState): TrackLeg[] {
  return TRACK_LEGS.map((l) => ({
    key: l.key,
    required: l.required(t),
    met: l.met(t),
  }));
}

/**
 * The one answer to "is this track finished".
 *
 * Fails closed on an unrequired-and-unmet story by construction: an unrequired
 * leg is simply not consulted, so turning the flag off cannot strand anybody.
 */
export function trackComplete(t: TrackState): boolean {
  return trackLegs(t).every((l) => !l.required || l.met);
}

/** Which legs are required and still missing, in list order. */
export function trackOutstanding(t: TrackState): TrackLegKey[] {
  return trackLegs(t)
    .filter((l) => l.required && !l.met)
    .map((l) => l.key);
}

/**
 * Said plainly, because the failure this prevents is an advisor at 100% of
 * modules with an incomplete track and no idea why — months of work, one
 * sentence short, and nothing on screen saying so.
 *
 * Reads like describeOutstanding in dayGate.ts on purpose: an advisor meets
 * that sentence every morning, and the track should not invent a second voice
 * for the same job.
 */
export function describeTrackOutstanding(keys: TrackLegKey[]): string {
  const NAMES: Record<TrackLegKey, string> = {
    modules: "the rest of the modules",
    story: "your Good News Story",
  };
  const names = keys.map((k) => NAMES[k]);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** How far through, for the ring. 0..1, and never NaN on an empty track. */
export function certificationProgress(modules: ModuleProgress[]): number {
  if (modules.length === 0) return 0;
  return modules.filter(moduleComplete).length / modules.length;
}
