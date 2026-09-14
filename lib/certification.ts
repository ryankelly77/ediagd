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

export type CertificationHolding = {
  slug: string;
  isCore: boolean;
  /** Null when never earned. */
  currentThrough: IsoDate | null;
};

export type CertificationState = "current" | "lapsed" | "unearned";

/**
 * NOTE THERE IS NO "revoked". A lapsed certification is one an advisor holds
 * and needs to renew; the seal still renders earned and the badge is never
 * stripped. The only thing that changes is a line of copy.
 */
export function certificationState(
  holding: Pick<CertificationHolding, "currentThrough">,
  today: IsoDate
): CertificationState {
  if (!holding.currentThrough) return "unearned";
  return isCurrent(holding.currentThrough, today) ? "current" : "lapsed";
}

/** "renew to stay current" — clay at most, never red. Design law 3. */
export function currencyLine(
  holding: Pick<CertificationHolding, "currentThrough">,
  today: IsoDate
): string | null {
  const state = certificationState(holding, today);
  if (state === "unearned") return null;
  if (state === "current") return `Current through ${holding.currentThrough}`;
  return "Renew to stay current";
}

/* ---------------------------------------------------------------------------
   THE CREDENTIAL
--------------------------------------------------------------------------- */

export type CredentialLevel = "certified" | "master";

export type ComputedCredential = {
  level: CredentialLevel;
  /** The earliest current_through among the constituents. */
  currentThrough: IsoDate;
  /** Which certifications it was computed from — the audit trail. */
  from: string[];
};

/**
 * EDIAGD Certified: all eight core craft certifications, HELD AND CURRENT.
 *
 * ---------------------------------------------------------------------------
 * WHY "held and current" IS ONE TEST AND NOT TWO
 * ---------------------------------------------------------------------------
 * A credential composed of eight things is only as true as its weakest part,
 * so the credential's own current_through is the EARLIEST among them. That
 * single rule does all the work: let one constituent lapse and the credential's
 * date falls into the past on its own, with nothing to revoke and no second
 * "is it still valid" flag that could disagree with the dates it was computed
 * from.
 *
 * Renew the lapsed one and the earliest date moves forward again — the
 * credential restores itself, because it was never withdrawn.
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

  const currentCore = core.filter((h) => certificationState(h, today) === "current");
  if (currentCore.length !== core.length) return null;

  const earliest = currentCore
    .map((h) => h.currentThrough as IsoDate)
    .sort()[0];

  return {
    level: "certified",
    currentThrough: earliest,
    from: currentCore.map((h) => h.slug).sort(),
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
  const have = core.filter((h) => certificationState(h, today) === "current").length;
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

/** How far through, for the ring. 0..1, and never NaN on an empty track. */
export function certificationProgress(modules: ModuleProgress[]): number {
  if (modules.length === 0) return 0;
  return modules.filter(moduleComplete).length / modules.length;
}
