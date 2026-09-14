/* ============================================================================
   EDIAGD — the navigation glyphs, in one place

   ---------------------------------------------------------------------------
   WHY THESE LEFT TabBar
   ---------------------------------------------------------------------------
   The header's streak chip needs the same wave the Streak tab wears, because
   the chip is a shortcut to that tab and a shortcut that looks like something
   else is just a second thing to learn. Ryan, on the first cut, which used the
   brand's SwellSun: "it is inconsistent with what we are using in the footer
   nav."

   He is right, and the fix is not to redraw the wave in the header — it is to
   have one wave. A copied SVG is a copy that drifts: somebody nudges the tab's
   curve and the chip keeps the old one, and nobody notices because the two are
   never on screen within an inch of each other.

   ---------------------------------------------------------------------------
   THESE ARE DRAWN FOR 24px
   ---------------------------------------------------------------------------
   Which is the other half of why the SwellSun was wrong up there. That mark is
   the full brand lockup — sun, water, palm — and it is legible at 92px on the
   streak hero and a pale smudge at 22. These are line glyphs with a 2px stroke
   and nothing smaller than a few pixels of detail; they are the app's small
   size vocabulary and the header is a small size.
   ============================================================================ */

/*
 * `calm` is not a tab. It lives here because the header's streak chip swaps
 * its glyph between working and resting days and both faces have to be drawn
 * in the same hand — same 24px box, same 2px stroke, same single colour. A rest
 * glyph drawn anywhere else would be the copied-SVG problem in the note above,
 * one drawer further along.
 */
export type TabIcon =
  | "sun"
  | "wave"
  | "shell"
  | "seal"
  | "team"
  | "swag"
  | "more"
  | "calm";

export function TabGlyph({
  icon,
  color = "currentColor",
  size = 24,
}: {
  icon: TabIcon;
  /**
   * Defaults to currentColor so the header chip inherits its text colour. The
   * tab bar passes an explicit token because its active and inactive states
   * are two different colours on the same element.
   */
  color?: string;
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (icon) {
    case "sun":
      return (
        <svg {...common}>
          <path d="M4 18h16" />
          <path d="M7 18a5 5 0 0 1 10 0" />
          <path d="M12 5v2M5.6 7.6l1.4 1.4M18.4 7.6 17 9" />
        </svg>
      );
    case "wave":
      return (
        <svg {...common}>
          <path d="M2 12c2.5-3 5-3 7.5 0s5 3 7.5 0 5-3 5-3" />
          <path d="M2 18c2.5-3 5-3 7.5 0s5 3 7.5 0 5-3 5-3" />
        </svg>
      );
    case "calm":
      /*
       * A DAY OFF, SAID AS FLAT WATER — the direct answer to `wave`.
       *
       * The chip's working face is two curling waves; this is the same two
       * lines of water with the curl taken out, under a low sun. Read together
       * across days that is the whole message: the water is up, or the water is
       * flat. Nothing is greyed out and nothing is missing, which is the rule
       * for rest days everywhere in this app — a day off is a different day,
       * not a lesser one.
       *
       * The sun is a plain circle with no rays, which is what separates it at a
       * glance from the `sun` tab glyph above: that one is a half-sun RISING
       * over the horizon with rays thrown out, and it means "today". This one
       * is already up and sitting quietly over still water.
       *
       * ONE REST GLYPH, FOR ALL THREE REASONS. Island Time briefly had its own
       * — a hammock, then a palm — and Ryan's call was to drop it and use this
       * for everything. The chip answers "is anything being asked of me today",
       * which has two answers, not four; the WHY is in the aria-label, which
       * still names Island Time and still names the closure.
       *
       * The hammock is worth recording as a dead end, because it looked
       * obviously right: RestingMark uses one at 96px on the rest card. Three
       * versions were drawn — short posts, tall posts, and posts with the end
       * lashings that RestingMark's own note says are what stop the curve being
       * a smile — and every one reads as a cup at 20px, the lashings becoming
       * two pin-heads. A drawing that needs a detail to be legible cannot be
       * shrunk past that detail.
       */
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3" />
          <path d="M3 15h18" />
          <path d="M6 19h12" />
        </svg>
      );
    case "shell":
      return (
        <svg {...common}>
          <path d="M12 21a9 9 0 1 0-9-9c0 4 3 9 9 9Z" />
          <path d="M12 21c-2-4-2-9 0-13M12 21c2-4 2-9 0-13" />
        </svg>
      );
    case "seal":
      /*
       * THE SCALLOPED RIM, WHICH IS THE WHOLE POINT.
       *
       * It sits beside `shell` in the same bar, so the two have to separate at
       * a glance and not merely differ: spec §10's rule is "circles are badges,
       * seals are certifications — badges keep the smooth disc, seals take the
       * scalloped rim". That contrast is load-bearing here. `shell` is a smooth
       * closed curve with two ribs; this is a toothed edge around an open
       * centre, and the eye catches the broken silhouette before it reads
       * either shape.
       *
       * TEN SCALLOPS, NOT TWELVE OR SIXTEEN. The rim on the real seal art
       * carries far more, and every one of them disappears here — at a 24px box
       * ten teeth already means a 6.0px pitch, and a 2px stroke with round
       * joins eats most of that. Twelve drops the pitch to 5.0px and the edge
       * starts reading as a soft blur rather than as teeth, which would leave a
       * fuzzy circle sitting next to the shell's crisp one. The rim is stylised
       * down to the point where it still says "seal", the same way `wave` is
       * two strokes rather than a seascape.
       *
       * The path is generated rather than hand-tuned: alternating radii 9.6 and
       * 7.8 about (12,12), which is why the numbers look arbitrary.
       */
      return (
        <svg {...common}>
          <path
            d="M12.00 2.40 L14.41 4.58 L17.64 4.23 L18.31 7.42 L21.13 9.03 L19.80 12.00 L21.13 14.97 L18.31 16.58 L17.64 19.77 L14.41 19.42 L12.00 21.60 L9.59 19.42 L6.36 19.77 L5.69 16.58 L2.87 14.97 L4.20 12.00 L2.87 9.03 L5.69 7.42 L6.36 4.23 L9.59 4.58 Z"
            strokeWidth={1.7}
          />
          {/* The inner ring the real seals all carry. Kept well clear of the
              rim so the two rings never touch and smear at small sizes. */}
          <circle cx="12" cy="12" r="4.1" />
        </svg>
      );
    case "team":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20a6 6 0 0 1 12 0" />
          <path d="M16 6.5a3 3 0 0 1 0 5.8M17 20a6 6 0 0 0-2-4.4" />
        </svg>
      );
    case "swag":
      // The tote from /brand/icons/swag_shack.svg, inlined so it inherits the
      // active/inactive colour like every other tab glyph.
      return (
        <svg {...common}>
          <path d="M4.8 8h14.4l-1.1 11.1a1.6 1.6 0 0 1-1.6 1.4H7.5a1.6 1.6 0 0 1-1.6-1.4L4.8 8Z" />
          <path d="M9 8.6V6.4a3 3 0 0 1 6 0v2.2" />
          <path d="M8.9 14.6c1-1 2.1-1 3.1 0s2.1 1 3.1 0" strokeWidth={1.7} />
        </svg>
      );
    case "more":
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1.4" />
          <circle cx="12" cy="12" r="1.4" />
          <circle cx="19" cy="12" r="1.4" />
        </svg>
      );
  }
}

export default TabGlyph;
