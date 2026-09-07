/* ============================================================================
   EDIAGD — the cold-start animation

   SERVER-RENDERED ON PURPOSE. This markup is in the first HTML the browser
   receives, so the navy field and the mark are painted before a single line of
   JavaScript runs. That is the whole reason the handoff from Apple's static
   launch image is seamless: the native splash hides when the webview draws, and
   what the webview has drawn is already this, on the same #0C1C2C. A React
   component mounted after hydration would flash the page underneath first.

   ---------------------------------------------------------------------------
   THE SEQUENCE, AND WHY IT IS THIS ORDER
   ---------------------------------------------------------------------------
   The mark is a sun behind a wave. In the brand file the sun is painted BEFORE
   the wave, so the wave already occludes it — which means the sun can simply
   translate up from below and it emerges from behind the water for free. No
   masks, no clip paths, just the z-order the logo already had.

     0.00  the ring fades in — the frame arrives first, so the animation has
           somewhere to happen rather than assembling in empty space
     0.15  the sun rises, with a slight overshoot and settle
     0.55  the rays bloom outward from the sun that just arrived
     0.60  one swell passes through the water
     0.70  the palm leans once and returns
     1.10  settled

   Under 1.2s end to end. Long enough to read as deliberate, short enough that
   somebody opening the app on a service drive does not wait for it — and it
   never runs in ADDITION to the fetch, only during it. See LaunchScreenGate.

   ---------------------------------------------------------------------------
   REDUCED MOTION IS A CSS DECISION, NOT A JS ONE
   ---------------------------------------------------------------------------
   The keyframes are attached inside a `prefers-reduced-motion: no-preference`
   block, so the settled state IS the default and motion is the enhancement.
   Somebody with the preference set gets the finished mark on the first frame,
   with nothing to cancel and no chance of a flash of the pre-animation state.
   ============================================================================ */

import {
  MARK_CREAM,
  MARK_PALM_PATHS,
  MARK_RAYS,
  MARK_RING,
  MARK_SUN,
  MARK_SUN_CIRCLE,
  MARK_SWELL_PATHS,
  MARK_VIEWBOX,
  MARK_WAVE,
  MARK_WAVE_PATH,
} from "@/lib/brand-ink";

export function LaunchScreen() {
  return (
    <div id="ediagd-launch" aria-hidden="true">
      <div className="ediagd-launch__stage">
        {/*
          The mark, inline rather than an <img>, because the parts have to move
          independently. Geometry is copied from
          public/brand/svg/ediagd-mark-primary-dark.svg — the dark variant, so
          the ring is cream and reads on navy.
        */}
        <svg
          className="ediagd-launch__mark"
          viewBox={MARK_VIEWBOX}
          width="120"
          height="120"
          role="img"
          aria-label="EDIAGD"
        >
          <circle
            className="ediagd-launch__ring"
            cx={MARK_RING.cx}
            cy={MARK_RING.cy}
            r={MARK_RING.r}
            fill="none"
            stroke={MARK_CREAM}
            strokeWidth="2.4"
          />

          {/* Rays bloom from the sun's centre, so that is the origin. */}
          <g
            className="ediagd-launch__rays"
            stroke={MARK_SUN}
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            {MARK_RAYS.map((r, i) => (
              <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} />
            ))}
          </g>

          {/* PAINTED BEFORE THE WATER, which is what lets it rise from behind
              it without a mask. */}
          <circle
            className="ediagd-launch__sun"
            cx={MARK_SUN_CIRCLE.cx}
            cy={MARK_SUN_CIRCLE.cy}
            r={MARK_SUN_CIRCLE.r}
            fill={MARK_SUN}
          />

          {/*
            THE PALM, AND WHY IT SWAYS ONCE RATHER THAN STANDING STILL.

            It is rooted behind the water and drawn in the ring's ink, so it
            reads as part of the frame the sun rises into rather than a fourth
            moving object. A single lean-and-return, starting as the sun
            settles, is enough to say "wind" — a palm that holds perfectly
            still in an animation about a sunrise looks pasted on, and one that
            keeps swaying turns a doorway into a screensaver.

            The origin is the base of the trunk, so the crown travels and the
            roots do not, which is how a real tree bends.
          */}
          <g
            className="ediagd-launch__palm"
            fill="none"
            stroke={MARK_CREAM}
            strokeWidth="2.4"
            strokeLinecap="round"
          >
            {MARK_PALM_PATHS.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>

          <g className="ediagd-launch__water">
            <path d={MARK_WAVE_PATH} fill={MARK_WAVE} />
            {MARK_SWELL_PATHS.map((d, i) => (
              <path
                key={i}
                className={`ediagd-launch__swell ediagd-launch__swell--${i + 1}`}
                d={d}
                fill="none"
                stroke={MARK_WAVE}
                strokeWidth={i === 0 ? 2.2 : 2.2}
                strokeLinecap="round"
                opacity={i === 0 ? 1 : 0.6}
              />
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}
