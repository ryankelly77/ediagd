"use client";

import MuxPlayer from "@mux/mux-player-react";

/* ============================================================================
   EDIAGD — a PUBLIC Mux film for the signed-out front door

   No token. The library player (MuxVideo) mints a signed JWT per view because
   every library asset is signed; these two sample assets have a second, PUBLIC
   playback id created for exactly this surface, so a visitor with no account can
   play them. mux-player needs only the id.

   Autoplay off — a tap starts it, which is also what iOS requires for sound.

   SIZING LIVES IN .ediagd-public-film (styles/brand.css), NOT HERE. It used to
   be an inline `maxHeight: "70vh"` next to `width: "100%"`, and it capped
   nothing: measured on a 1440x900 desktop the player came out 908 x 1614 CSS
   px. mux-player puts the asset's aspect-ratio on the host, so with the width
   pinned the height is derived and a max-height does not pull the width down
   with it. The class drives the height instead and lets the width follow, which
   is the only way the box keeps its shape AND obeys the cap.
   ============================================================================ */

export function PublicFilm({
  playbackId,
  title,
}: {
  playbackId: string;
  title: string;
}) {
  return (
    <MuxPlayer
      playbackId={playbackId}
      streamType="on-demand"
      accentColor="#4AA8B0"
      title={title}
      metadata={{ video_title: title, viewer_user_id: "front-door" }}
      className="ediagd-public-film"
      /* Width is NOT set here. An inline width beats the stylesheet, so the
         desktop rule's `width: auto` could never take effect from this object —
         the sizing lives entirely in the class so one place decides it. */
      style={{
        borderRadius: "0.75rem",
        overflow: "hidden",
        // Letterbox rather than crop, so neither orientation is cut off.
        "--media-object-fit": "contain",
        background: "rgb(var(--ediagd-navy))",
      }}
    />
  );
}
