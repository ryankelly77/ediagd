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
     0.95  the wordmark fades in beneath
     1.35  settled

   Under 1.4s end to end. Long enough to read as deliberate, short enough that
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
          viewBox="-18 -18 132 132"
          width="132"
          height="132"
          role="img"
          aria-label="EDIAGD"
        >
          <circle
            className="ediagd-launch__ring"
            cx="48"
            cy="48"
            r="44"
            fill="none"
            stroke="#F5F1E8"
            strokeWidth="2.6"
          />

          {/* Rays bloom from the sun's centre, so that is the origin. */}
          <g
            className="ediagd-launch__rays"
            stroke="#E8B44C"
            strokeWidth="2.4"
            strokeLinecap="round"
          >
            <line x1="60" y1="18" x2="60" y2="12" />
            <line x1="72" y1="22" x2="75.5" y2="17" />
            <line x1="80" y1="31" x2="85.5" y2="28" />
          </g>

          {/* PAINTED BEFORE THE WATER, which is what lets it rise from behind
              it without a mask. */}
          <circle className="ediagd-launch__sun" cx="60" cy="33" r="9" fill="#E8B44C" />

          <g className="ediagd-launch__water">
            <path
              d="M14 62 C 23 40, 47 33, 56 46 C 46 42, 38 48, 39.5 57 C 51 50, 68 53, 79 63 C 57 72, 30 71, 14 62 Z"
              fill="#7EC8CD"
            />
            <path
              className="ediagd-launch__swell ediagd-launch__swell--1"
              d="M22 72 C 38 77, 60 77, 74 71"
              fill="none"
              stroke="#7EC8CD"
              strokeWidth="2.4"
              strokeLinecap="round"
              opacity="0.7"
            />
            <path
              className="ediagd-launch__swell ediagd-launch__swell--2"
              d="M30 79 C 42 82.5, 56 82.5, 66 78.5"
              fill="none"
              stroke="#7EC8CD"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.45"
            />
          </g>
        </svg>

        <p className="ediagd-launch__wordmark">EDIAGD</p>
      </div>
    </div>
  );
}
