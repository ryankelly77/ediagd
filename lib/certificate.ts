/* ============================================================================
   EDIAGD — what the certificate says

   PURE. No database, no React, no clock beyond what it is handed. The paper is
   the one artefact that leaves the building and gets framed on a wall, so every
   string on it is decided here where it can be asserted, rather than inline in
   a component where a typo ships.

   ---------------------------------------------------------------------------
   NO SURF VOCABULARY ON THE PAPER
   ---------------------------------------------------------------------------
   Swell, Sand Dollars, Paddle Back Out and Island Time are how the app talks to
   an advisor every day, and none of them appear here. A hiring manager reading
   this has no idea what a Swell is, and a certificate that needs the product's
   private language to be understood is not evidence of anything to anybody
   outside it. The paper speaks the industry's language: certified, current,
   issued.
============================================================================ */

import type { IsoDate } from "@/lib/gamification/streak";

export type CredentialLevel = "certified" | "master";

export type CertificateFacts = {
  name: string;
  level: CredentialLevel;
  certificateId: string;
  /** The day it was earned. */
  earnedOn: IsoDate;
  currentThrough: IsoDate;
  foundingClass: boolean;
};

/* ---------------------------------------------------------------------------
   DATES
--------------------------------------------------------------------------- */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * "14 March 2027".
 *
 * DAY MONTH YEAR, AND NOT toLocaleDateString. The certificate is printed, so
 * the string has to be identical everywhere it is produced — a server in one
 * region rendering "March 14, 2027" and a browser in another rendering
 * "14/03/2027" would put two different documents behind one certificate id.
 * Parsed as parts rather than through Date, so no timezone can move the day.
 */
export function formatCertificateDate(iso: IsoDate): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** The year a Founding Class mark carries: "FOUNDING CLASS · 2026". */
export function foundingClassMark(earnedOn: IsoDate): string {
  return `FOUNDING CLASS · ${earnedOn.slice(0, 4)}`;
}

/* ---------------------------------------------------------------------------
   THE WORDS
--------------------------------------------------------------------------- */

export type CertificateCopy = {
  /** "EDIAGD Certified Service Advisor" */
  title: string;
  /** The two lines above the title. */
  body: [string, string];
};

/**
 * The citation. Two lines, because the mockup sets it as two and a single
 * wrapped paragraph breaks differently at every paper size.
 *
 * MASTER'S SECOND LINE IS NOT A LOUDER VERSION OF CERTIFIED'S. Certified is
 * "completed the core eight"; Master is "holds every certification ... and has
 * given that craft back to the advisors alongside them", because Master is the
 * contribution programme (phase 3) rather than more of the same accumulation.
 * The paper has to say that or the two look like tiers of the same thing.
 */
export function certificateCopy(level: CredentialLevel): CertificateCopy {
  if (level === "master") {
    return {
      title: "EDIAGD Master Service Advisor",
      body: [
        "holds every certification in the EDIAGD program, current and complete,",
        "and has given that craft back to the advisors alongside them",
      ],
    };
  }
  return {
    title: "EDIAGD Certified Service Advisor",
    body: [
      "has completed the core eight craft certifications of the EDIAGD program",
      "and is recognized as an",
    ],
  };
}

/* ---------------------------------------------------------------------------
   THE VERIFY URL
--------------------------------------------------------------------------- */

/**
 * The link printed on the face, and the one the page links to.
 *
 * `display` drops the scheme because nobody types "https://" off a piece of
 * paper, and the mockup sets it bare. `href` keeps it because a link without a
 * scheme is resolved as a relative path.
 */
export function verifyUrl(
  certificateId: string,
  appUrl: string
): { href: string; display: string } {
  const base = appUrl.replace(/\/+$/, "");
  const href = `${base}/verify/${certificateId}`;
  return { href, display: href.replace(/^https?:\/\//, "") };
}

/* ---------------------------------------------------------------------------
   CURRENCY, IN THE LANGUAGE OF THE VERIFY PAGE
--------------------------------------------------------------------------- */

/**
 * "Current through 14 March 2028" / "Lapsed — was current through 14 March 2027".
 *
 * LAPSED IS STATED, NEVER HIDDEN AND NEVER SHAMED — design law 3, carried onto
 * the one surface a stranger sees. The credential was not withdrawn; it is out
 * of date, and the sentence says exactly that and stops. No red, no "expired",
 * no "no longer valid" — all of which describe a revocation that did not happen.
 */
export function currencyStatement(
  currentThrough: IsoDate,
  isCurrent: boolean
): string {
  const when = formatCertificateDate(currentThrough);
  return isCurrent ? `Current through ${when}` : `Lapsed — was current through ${when}`;
}
