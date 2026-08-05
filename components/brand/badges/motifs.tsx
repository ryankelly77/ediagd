/* ============================================================================
   EDIAGD — badge motifs
   Flat shapes from the brand's world: sun, wave, palm. Each is drawn inside the
   BadgeFrame's 100×100 space, centred roughly on (50, 52) and kept within the
   dotted ring (r=39). Stroke-based so they stay crisp from 24px to 120px.
   ============================================================================ */

import type { MotifColors } from "./BadgeFrame";

/** First Light — a sun rising over the horizon. */
export function RisingSunMotif({ sun, wave, stroke }: MotifColors) {
  return (
    <g strokeLinecap="round">
      {/* rays */}
      <g stroke={sun} strokeWidth={stroke * 0.8}>
        <path d="M50 24v7M31 32l5 5M69 32l-5 5M24 51h7M69 51h7" />
      </g>
      {/* half sun sitting on the horizon */}
      <path d="M36 62a14 14 0 0 1 28 0z" fill={sun} />
      {/* horizon */}
      <path d="M26 62h48" stroke={wave} strokeWidth={stroke} />
    </g>
  );
}

/** 7-Day Swell — one clean wave. */
export function WaveMotif({ wave, stroke }: MotifColors) {
  return (
    <g fill="none" stroke={wave} strokeWidth={stroke} strokeLinecap="round">
      <path d="M28 52q11-11 22 0t22 0" />
    </g>
  );
}

/** 30-Day Swell — a fuller, double wave. */
export function DoubleWaveMotif({ wave, stroke }: MotifColors) {
  return (
    <g fill="none" stroke={wave} strokeWidth={stroke} strokeLinecap="round">
      <path d="M28 45q11-11 22 0t22 0" />
      <path d="M28 60q11-11 22 0t22 0" />
    </g>
  );
}

/** 90-Day Swell — a season of them: three ranks of water. */
export function TripleWaveMotif({ wave, sun, stroke }: MotifColors) {
  return (
    <g fill="none" strokeLinecap="round">
      <g stroke={sun} strokeWidth={stroke}>
        <path d="M28 38q11-11 22 0t22 0" />
      </g>
      <g stroke={wave} strokeWidth={stroke}>
        <path d="M28 52q11-11 22 0t22 0" />
        <path d="M28 66q11-11 22 0t22 0" />
      </g>
    </g>
  );
}

/** Big Wave — a large cresting wave with a curling lip. */
export function CrestingWaveMotif({ wave, sun, stroke }: MotifColors) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      {/* the curl */}
      <path
        d="M24 66c0-18 10-30 25-30 9 0 15 5 15 12 0 6-4 10-10 10-4 0-7-2-7-6"
        stroke={wave}
        strokeWidth={stroke}
      />
      {/* the crest catching light */}
      <path d="M64 48q6-4 12-2" stroke={sun} strokeWidth={stroke * 0.9} />
      {/* the water beneath */}
      <path d="M24 72q13-9 26 0t26 0" stroke={wave} strokeWidth={stroke} />
    </g>
  );
}
