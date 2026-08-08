/* ============================================================================
   EDIAGD — the admin navigation registry

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
    hint: "Cues and videos, organised by service family.",
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
] as const;

/**
 * Admin routes that are deliberately NOT in the registry, and why.
 *
 * `npm run check:nav` reads this, so an exemption has to be written down and
 * justified rather than being an absence nobody notices. A route is fine if it
 * is registered above, listed here, or sits underneath a registered tool —
 * that last rule is what lets detail pages be reachable from their own list.
 */
export const NAV_EXEMPT: Readonly<Record<string, string>> = {
  "/admin": "The hub itself — it renders this registry, and More links to it.",
  "/admin/rooftop/[id]":
    "Rooftop drill-down, opened from the list on /admin/engagement.",
} as const;
