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
/**
 * The MANAGER's tools — a different audience from ADMIN_TOOLS.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS LIST HAD TO EXIST
 * ---------------------------------------------------------------------------
 * The closure calendar first shipped in ADMIN_TOOLS, which was wrong in a way
 * that made it unreachable for the only people it is for. /admin gates on
 * `hasAdminAccess` — the `admin` role or the platform owner — and a service
 * manager is neither. The More menu renders ADMIN_TOOLS behind the same flag.
 * So the screen a manager owns was visible to everybody except a manager, who
 * could reach it only by typing the URL.
 *
 * The page itself was already right: it guards on managed_rooftops(), so a
 * manager who arrived could always use it. Only the way in was missing.
 *
 * A tool goes here when the person who should act on it is the manager at a
 * rooftop rather than somebody running the platform. Both lists are rendered
 * for a platform owner, because the fallback is real: Mitch acts for a dealer
 * that has not engaged yet.
 */
export const MANAGER_TOOLS: readonly AdminTool[] = [
  {
    href: "/admin/closures",
    label: "Closure calendar",
    hint: "Days your store is shut. Your team's streaks are safe on them.",
  },
];

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
  {
    /*
     * Listed even though it is platform-owner only and every other tool here is
     * open to rooftop admins. An unlisted screen is one somebody has to be told
     * about; the page itself redirects anyone else to /admin, which is the same
     * answer the link would have given.
     */
    href: "/admin/economy",
    label: "Sand Dollar Economy",
    hint: "Minted, spent, held — and whether all three still agree.",
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
    /* SEVEN, NOT SIX — 3e added the credential screen. The count in a hint is
       the same kind of claim as anything else on a screen, and this one had
       been wrong since the moment it stopped being true. */
    hint: "All seven screens, the first daily loop and First Light. Nothing is saved.",
  },
  {
    /*
     * THE DAILY LOOP ON ITS OWN. The onboarding preview ends with the daily
     * loop, which made it the only way to see the ritual — six screens of
     * setup before the thing you actually wanted to look at.
     *
     * ?preview= is checked against isAdminViewer server-side, so the flag is
     * inert for anyone else and can never be used to fake a completion.
     * Nothing is written: previewResult short-circuits completeDayAction, so no
     * completion row, no consumption, no pool cursor, no track entry, no badge,
     * no Sand Dollars, and the streak is untouched.
     *
     * `preview=1` still means this row — it is what the menu linked to before
     * the loop had shapes, and what any bookmark still holds.
     */
    href: "/today?preview=normal",
    label: "Daily Loop — a normal morning",
    hint: "Mindset film, pitch, item, then the quote on the celebration. No day is saved.",
  },
  {
    /*
     * ---- THE OTHER TWO SHAPES, LISTED RATHER THAN DISCOVERED -------------
     *
     * 3b gave the morning three shapes and only one of them is reachable from
     * an admin's own data — the pitch slot derives from a DMS book, which an
     * admin account does not have. Before these rows the walkthrough silently
     * served a two-slot morning every time and called it "the daily loop".
     *
     * Listed as separate entries rather than tabs inside one preview because
     * ADMIN_PREVIEWS is a menu of things to look at, and "the morning where the
     * family runs out of film" is a different thing to look at.
     */
    href: "/today?preview=two-slot",
    label: "Daily Loop — a two-slot morning",
    hint: "What an advisor gets when their focus family has no film left: mindset, then the item.",
  },
  {
    /*
     * REACHABLE EVEN THOUGH IT CANNOT HAPPEN YET. No certification has an entry
     * film — which film opens which track is Mitch's ruling — so the real loop
     * never serves this shape today. The walkthrough borrows a Craft film and
     * says on screen that it did; see lib/loop-preview.ts. The alternative was
     * that the one screen nobody can review is the one nobody has agreed to.
     */
    href: "/today?preview=track-entry",
    label: "Daily Loop — a track-entry morning",
    hint: "Mindset film, then the film that opens a track. Uses a stand-in film, named on screen.",
  },
  {
    /*
     * ---- THE OTHER END OF A TRACK ----------------------------------------
     *
     * The loop previews show a morning. This shows the screen an advisor meets
     * after roughly fifty of them, which nobody can reach today — no track is
     * near 100%, and none completes before February. That is precisely why it
     * needs a menu entry: the one screen that cannot be reached by using the
     * product is the one nobody would otherwise review before it ships.
     *
     * NOTHING IS WRITTEN, and unlike the loop preview that is a property of
     * the code rather than a claim about it — the preview branch returns
     * before the server action is called. Measured, not asserted: see the
     * before/after advisor_story count in reports/phase-3i-story-form.md.
     */
    href: "/certifications/craft-walk-around/story?preview=1",
    label: "Good News Story — the end of a track",
    hint: "What an advisor writes to finish a track. Always the empty form; nothing is saved.",
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
    /*
     * Second, above the libraries, because it is the other thing on this list
     * that is THEIRS. It lived as the fourth card on /profile — the one feature
     * that decides whether a fortnight away costs a Swell, filed under account
     * admin with nothing in the tab bar or this menu pointing at it.
     */
    href: "/island-time",
    label: "Island Time",
    hint: "Book time off so your Swell holds while you're away.",
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

/**
 * The routes the tab bar can put in front of somebody.
 *
 * A THIRD KIND OF REGISTRATION, because there are three ways a screen gets
 * linked and check:nav only knew about two. ADMIN_TOOLS and MEMBER_SECTIONS
 * describe rows in a menu; this describes the bar at the bottom, which is how
 * the most-used screens are reached and therefore the last place an orphan
 * would ever be noticed.
 *
 * It exists because /certifications moved OUT of MEMBER_SECTIONS and into the
 * bar, which made it registered nowhere — the check would have called it an
 * orphan, and the honest answer is that the checker had a blind spot rather
 * than that the route was unreachable.
 *
 * app/(app)/layout.tsx builds its tabs from these values, so renaming a route
 * here is a type error there rather than a silently dead tab.
 */
export const TAB_ROUTES = {
  today: "/today",
  /** Today swaps to the recap once the day is done; both light the Today tab. */
  advisor: "/advisor",
  streak: "/streak",
  certifications: "/certifications",
  badges: "/badges",
  manager: "/manager",
  swag: "/swag",
  more: "/more",
} as const;

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
  "/mileage":
    "The mileage shelf — fourteen service-interval rungs of reference films. "
    + "Reached from the celebration screen AFTER the morning is complete, never "
    + "before: /today is the ritual, and fifty-one browsable films on it "
    + "beforehand compete with the three minutes that move the credential. Also "
    + "reached from the Menus track. Reference material, so it completes nothing "
    + "and tracks nothing — see 0128 and lib/mileage.ts.",
  "/mileage/[rung]":
    "One rung's films: title, duration, play. No progress of any kind. A rung "
    + "with no films 404s rather than rendering an empty shelf, because the rung "
    + "list is built from the films that exist.",
  "/service/[family]":
    "One service family's films and cues, opened from the focus-family card on "
    + "/advisor and from the pitch dialog. Deliberately not a menu row: an "
    + "advisor has one focus family at a time and reaches it from the card that "
    + "names it, so a list of twenty families would be a second, competing way "
    + "in. See 0125 and the 3c report.",
} as const;
