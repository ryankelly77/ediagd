"use client";

import MuxPlayer from "@mux/mux-player-react";

/* ============================================================================
   EDIAGD — a PUBLIC Mux film for the signed-out front door

   No token. The library player (MuxVideo) mints a signed JWT per view because
   every library asset is signed; these two sample assets have a second, PUBLIC
   playback id created for exactly this surface, so a visitor with no account can
   play them. mux-player needs only the id.

   Autoplay off — a tap starts it, which is also what iOS requires for sound. The
   player sizes itself to the asset's own aspect ratio; the container caps the
   height so a vertical mindset clip does not run the length of a desktop.
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
      style={{
        width: "100%",
        maxHeight: "70vh",
        display: "block",
        borderRadius: "0.75rem",
        overflow: "hidden",
        // Letterbox rather than crop, so neither orientation is cut off.
        "--media-object-fit": "contain",
        background: "rgb(var(--ediagd-navy))",
      }}
    />
  );
}
