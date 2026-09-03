/* ============================================================================
   EDIAGD — the navigation registry

   ONE LIST, TWO SURFACES. /admin renders these as cards and the More menu
   renders them as rows. Before this file each surface kept its own copy, and
   the result was four screens shipped that nothing linked to — the CMS,
   gamification settings, engagement, and then the whole impact section. Every
   one of them worked; you just had to know the URL.

   Adding a tool here puts it in both places. There is nowhere else to add one.

   The guarantee is enforced, not just intended: `npm run check:nav` walks the
   admin routes on disk and fails if any section is missing from this list. It
   runs in CI-shaped isolation, so a fifth orphan is a build failure rather than
   something discovered weeks later.

   WRITING A HINT. It appears verbatim in both places, so it has to work as a
   card subtitle and as a menu row. One line, sentence case, says what the
   screen answers rather than what it contains.
   ============================================================================ */

export type AdminTool = {
  href: string;
  label: string;
  hint: string;
};

/**
 * The admin screens, as PEERS.
 *
 * Engagement is one of six, not the roof over the other five. It used to be
 * both: /admin was the engagement screen AND carried a card grid linking to
 * everything else, so Impact & ROI read as something living underneath
 * engagement rather than the second half of the same question. It isn't —
 * engagement is whether people are using it, impact is whether that changed
 * anything, and neither contains the other.
 *
 * /admin is the hub and renders this list; the More menu renders it too, as a
 * fast path from the tab bar. The screens back out to /admin rather than to
 * each other, so nothing implies a hierarchy that doesn't exist.
 */
export const ADMIN_TOOLS: readonly AdminTool[] = [
  {
    href: "/admin/engagement",
    label: "Engagement",
    hint: "Who is showing up, across every rooftop.",
  },
  {
    href: "/admin/impact",
    label: "Impact & ROI",
    hint: "Is coaching moving attach rates, and is it paying for itself?",
  },
  {
    href: "/admin/pricing",
    label: "Pricing & Impact Thresholds",
    hint: "Subscription price, and what counts as engaged and improving.",
  },
  {
    href: "/admin/content",
    label: "Coaching Content",
    hint: "Cues, quotes and videos. Tap a type to open it.",
  },
  {
    href: "/admin/settings",
    label: "Gamification Settings",
    hint: "Sand Dollar amounts, streak grace days and caps.",
  },
  {
    href: "/admin/swag",
    label: "Swag Shack",
    hint: "Fulfilment queue and the product catalog.",
  },
  {
    href: "/admin/dms",
    label: "DMS Upload",
    hint: "Load the monthly op-code workbook and map its sub-categories.",
  },
  {
    href: "/admin/mapping",
    label: "Mapping",
    hint: "Op codes, service families and aliases — what Mitch coaches against.",
  },
  {
    href: "/admin/mapping/dealer-codes",
    label: "Dealer Codes",
    hint: "Everything a dealer's DMS sends, ruled onto our vocabulary.",
  },
] as const;

/**
 * Screens that render app chrome over fabricated data.
 *
 * Kept apart from the tools on purpose. They are the one place an admin can see
 * something that looks like a real result and isn't, so they are grouped under
 * their own heading and never mixed into the working tools.
 *
 * The badge celebration used to have its own entry. It doesn't need one — the
 * onboarding run-through walks through First Light, so the celebration is
 * already on screen inside it. The route still exists; see the note in the
 * report about it now being reachable only by URL.
 */
export const ADMIN_PREVIEWS: readonly AdminTool[] = [
  {
    href: "/onboarding?preview=1",
    label: "Onboarding Flow",
    hint: "All six screens, the first daily loop and First Light. Nothing is saved.",
  },
  {
    /*
     * THE DAILY LOOP ON ITS OWN. The onboarding preview ends with the daily
     * loop, which made it the only way to see the ritual — six screens of
     * setup before the thing you actually wanted to look at. This is the same
     * five steps with the same canned outcome, straight in.
     *
     * The machinery already existed; it was simply never listed. ?preview=1 is
     * checked against isAdminViewer server-side, so the flag is inert for
     * anyone else and can never be used to fake a completion. Nothing is
     * written: previewResult short-circuits completeDayAction, so no
     * completion row, no badge, no Sand Dollars, and the streak is untouched.
     */
    href: "/today?preview=1",
    label: "Daily Loop",
    hint: "The five steps with a canned first-day result. Nothing is saved.",
  },
] as const;

/**
 * Admin routes that are deliberately NOT in the registry, and why.
 *
 * `npm run check:nav` reads this, so an exemption has to be written down and
 * justified rather than being an absence nobody notices. A route is fine if it
 * is registered above, listed here, or sits underneath a registered tool —
 * that last rule is what lets detail pages be reachable from their own list.
 */
/**
 * The member-facing libraries.
 *
 * Same contract as the admin tools: listed here, rendered by the More menu,
 * checked against the routes on disk. `requiresRole` decides whether the row is
 * OFFERED — the page itself re-checks the product entitlement server-side and
 * RLS enforces it a third time, so hiding a row is a courtesy, never the
 * control.
 */
export type MemberSection = AdminTool & {
  /** Null means everyone signed in. */
  requiresRole: "manager" | "technician" | null;
};

export const MEMBER_SECTIONS: readonly MemberSection[] = [
  {
    // First in the list because it is the only one that is THEIRS. Everything
    // else here is a library somebody else filled.
    href: "/saved",
    label: "Saved",
    hint: "Quotes and cues you kept from the daily loop.",
    requiresRole: null,
  },
  {
    href: "/library",
    label: "Lesson Library",
    hint: "Coaching cues and pitch videos, by service.",
    requiresRole: null,
  },
  {
    href: "/joe-the-pro",
    label: "Joe the Pro",
    hint: "Why a service matters, by vehicle. An add-on.",
    requiresRole: null,
  },
  {
    href: "/meetings",
    label: "Manager Meetings",
    hint: "How to coach it, not how to sell it. An add-on.",
    requiresRole: "manager",
  },
  {
    // Gated on "manager" here as the coarse courtesy this list provides; the
    // page itself redirects anyone whose scope covers a single store, because
    // one rooftop is not a group.
    href: "/group",
    label: "Your Group",
    hint: "Every store you run, on one month.",
    requiresRole: "manager",
  },
] as const;

export const NAV_EXEMPT: Readonly<Record<string, string>> = {
  "/admin": "The hub itself — it renders this registry, and More links to it.",
  "/admin/rooftop/[id]":
    "Rooftop drill-down, opened from the list on /admin/engagement.",
  "/library/[course]": "One course, opened from the Lesson Library index.",
  "/library/m/[module]": "One module, opened from its course.",
  "/library/m/[module]/quiz": "A module's quiz, opened from the module.",
  "/joe-the-pro/[make]": "One make, opened from the Joe the Pro index.",
  "/admin/dms/mapping":
    "Redirects to Dealer Codes, which absorbed the queue. Kept because DMS "
    + "Upload links here and Mitch has the URL.",
  "/admin/mapping/dealer-codes/confirm":
    "Correction or Change for one sub-category, opened from Dealer Codes.",
} as const;
