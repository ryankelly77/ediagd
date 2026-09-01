"use client";

/* ============================================================================
   EDIAGD — the video player

   One player for the whole app. Signed playback, branded chrome, and the same
   watch-progress contract CueDeck established: FURTHEST point reached, never
   current position, so scrubbing back to re-watch something cannot take away
   credit already earned.

   ---------------------------------------------------------------------------
   WHY playsInline IS NOT OPTIONAL HERE
   ---------------------------------------------------------------------------
   Without it, iOS takes any <video> full-screen the moment it plays. Inside the
   Capacitor shell that means the webview hands the video to the native player,
   the app's own UI disappears, and whatever was meant to happen at 90% watched
   happens behind a system screen the advisor has to dismiss. The daily loop
   would appear to stall.

   mux-player sets it by default; it is passed explicitly anyway, because the
   one place this breaks is the one place nobody tests in a browser.

   ---------------------------------------------------------------------------
   CHROME, PER DESIGN_LANGUAGE
   ---------------------------------------------------------------------------
   Reef teal is the interactive accent, so it is the scrubber and the controls.
   Gold is RESERVED — "if every ping glows gold, none of them do" — for the
   Swell, celebration, and the primary CTA that sits below the player, never for
   ordinary chrome. The surface is navy: letterboxing a 16:9 video on cream
   leaves grey bars that look like a rendering fault.

   16px radius and the warm navy-tinted shadow are the standard card treatment,
   so a video reads as a card with media in it rather than a hole in the page.
   ============================================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import MuxPlayer from "@mux/mux-player-react";
import { createClient } from "@/lib/supabase/client";

export type MuxVideoProps = {
  contentId: string;
  playbackId: string;
  token: string;
  thumbnailToken: string;
  storyboardToken: string;
  title: string;
  /** 0-100. Server setting (game_settings.video_complete_pct), default 90. */
  threshold?: number;
  /** Furthest point already reached, so a re-visit does not start from zero. */
  initialWatchedPct?: number;
  /** Seconds to resume from. */
  initialPositionSec?: number | null;
  /** Fired once, the first time the threshold is crossed in this session. */
  onReachedThreshold?: (pct: number) => void;
  /** Fired when playback ends, regardless of whether the bar was cleared. */
  onEnded?: (event: Event) => void;
  /*
   * PASSED THROUGH FOR THE COVERAGE TRACKER, which needs the raw media events
   * this component already listens to. It keeps its own furthest-point
   * recording either way — the two measurements answer different questions
   * (see lib/watch-coverage) and both are wanted, so the internal handler runs
   * first and then calls out. A tracker that replaced this handler would
   * silently stop content_progress from ever being written.
   */
  onTimeUpdate?: (event: Event) => void;
  onPlay?: (event: Event) => void;
  onPause?: (event: Event) => void;
  onError?: (event: Event) => void;
  /** Hide the built-in progress read-out when a parent draws its own. */
  showProgress?: boolean;
  /**
   * What shape the playback id actually is.
   *
   * "vertical"  a derived 9:16 crop — played full-bleed, no letterbox.
   * "landscape" the 16:9 master — played inline in its own frame.
   */
  orientation?: "vertical" | "landscape";
  /**
   * Present a LANDSCAPE source inside a 9:16 frame by cropping it in CSS.
   *
   * The fallback for a video whose vertical rendition does not exist yet, or
   * has gone stale after a trim. It throws away two thirds of the frame width
   * and can cut hands and heads, so it is deliberately not the default — a
   * derived crop is centre-framed by policy and checked; this one is not
   * checked by anybody.
   */
  cropToVertical?: boolean;
  className?: string;
};

export function MuxVideo({
  contentId,
  playbackId,
  token,
  thumbnailToken,
  storyboardToken,
  title,
  threshold = 90,
  initialWatchedPct = 0,
  initialPositionSec = null,
  onReachedThreshold,
  onEnded,
  onTimeUpdate,
  onPlay,
  onPause,
  onError,
  showProgress = true,
  orientation = "landscape",
  cropToVertical = false,
  className,
}: MuxVideoProps) {
  const [watched, setWatched] = useState(initialWatchedPct);
  const furthest = useRef(initialWatchedPct);
  const fired = useRef(initialWatchedPct >= threshold);

  /*
   * Progress is written at most every ten seconds of playback, not on every
   * timeupdate. A media element fires timeupdate four times a second; writing
   * that through to Postgres would be roughly 2,800 round trips for a
   * twelve-minute video, from a phone, on dealership wifi.
   */
  const lastWrite = useRef(0);
  const supabase = useRef(createClient());

  const persist = useCallback(
    async (pct: number, positionSec: number) => {
      try {
        await supabase.current.rpc("record_watch_progress", {
          _content_id: contentId,
          _pct: Math.round(pct),
          _position: Math.round(positionSec),
        });
      } catch {
        /*
         * Deliberately silent. Losing a progress ping costs a few seconds of
         * resume accuracy; an error toast over a video an advisor is watching
         * on the drive costs their attention. The RPC clamps monotonically, so
         * the next successful write repairs the gap.
         */
      }
    },
    [contentId]
  );

  const handleTimeUpdate = useCallback(
    (event: Event) => {
      /*
       * The tracker is notified FIRST and unconditionally. Every early return
       * below is a reason this component has nothing to record — metadata not
       * loaded, playhead moved backwards — and none of them is a reason to
       * withhold the event from a coverage measurement that has its own rules
       * about what counts.
       */
      onTimeUpdate?.(event);

      const el = event.currentTarget as HTMLVideoElement | null;
      if (!el || !el.duration || !Number.isFinite(el.duration)) return;

      const pct = Math.min(100, Math.round((el.currentTime / el.duration) * 100));
      if (pct <= furthest.current) return; // scrubbed backwards — no credit lost, none gained

      furthest.current = pct;
      setWatched(pct);

      const now = Date.now();
      if (now - lastWrite.current > 10_000) {
        lastWrite.current = now;
        void persist(pct, el.currentTime);
      }

      if (!fired.current && pct >= threshold) {
        fired.current = true;
        void persist(pct, el.currentTime); // the crossing is worth a write of its own
        onReachedThreshold?.(pct);
      }
    },
    [persist, threshold, onReachedThreshold, onTimeUpdate]
  );

  /* One last write on unmount, so closing the screen keeps the position. */
  useEffect(() => {
    return () => {
      if (furthest.current > initialWatchedPct) {
        void persist(furthest.current, 0);
      }
    };
  }, [persist, initialWatchedPct]);

  const cleared = watched >= threshold;

  /* A real vertical rendition, or a landscape one being squeezed into the same
     frame. Both present as 9:16; only the second one loses picture. */
  const vertical = orientation === "vertical" || cropToVertical;
  const ratio = vertical ? "9 / 16" : "16 / 9";
  /* contain would letterbox a 16:9 source inside a 9:16 box — pillar bars top
     and bottom, which is worse than the crop it is standing in for. */
  const objectFit = cropToVertical ? "cover" : "contain";

  return (
    <div className={className}>
      <div
        className="overflow-hidden rounded-card bg-navy"
        style={{ boxShadow: "0 4px 16px rgba(12,28,44,0.08)" }}
      >
        <MuxPlayer
          playbackId={playbackId}
          tokens={{
            playback: token,
            thumbnail: thumbnailToken,
            storyboard: storyboardToken,
          }}
          streamType="on-demand"
          title={title}
          /* See the note at the top — this is the Capacitor-critical one. */
          playsInline
          preload="metadata"
          startTime={initialPositionSec ?? undefined}
          onTimeUpdate={handleTimeUpdate}
          onEnded={onEnded}
          onPlay={onPlay}
          onPause={onPause}
          onError={onError}
          envKey={process.env.NEXT_PUBLIC_MUX_ENV_KEY}
          metadata={{
            video_id: contentId,
            video_title: title,
          }}
          accentColor="#4AA8B0"
          style={{
            aspectRatio: ratio,
            width: "100%",
            display: "block",
            "--controls-backdrop-color": "rgba(12,28,44,0.55)",
            "--media-object-fit": objectFit,
          }}
        />
      </div>

      {showProgress && (
        <div className="mt-3">
          <div
            className="h-1.5 w-full overflow-hidden rounded-pill"
            style={{ background: "rgb(var(--ediagd-teal-soft) / 0.45)" }}
            role="progressbar"
            aria-valuenow={watched}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Watched"
          >
            <div
              className="h-full rounded-pill transition-[width] duration-300"
              style={{
                width: `${watched}%`,
                /* Teal while working, palm once the bar is cleared. Gold would
                   be wrong here — it belongs to the CTA underneath. */
                background: cleared
                  ? "rgb(var(--ediagd-palm))"
                  : "rgb(var(--ediagd-teal))",
              }}
            />
          </div>
          <p className="mt-1.5 text-xs text-ink-soft">
            {cleared ? "Watched" : `${watched}% watched`}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * What a video row shows when it has no playable asset.
 *
 * Kept beside the real player on purpose: the honest empty state and the thing
 * it stands in for should be edited together, or the placeholder drifts into
 * claiming something the player no longer does.
 */
export function VideoNotReady({ reason }: { reason?: string }) {
  return (
    <div className="rounded-card border border-dashed border-line bg-surface-card p-8 text-center">
      <div
        aria-hidden="true"
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-pill bg-teal-soft/40 text-2xl text-ocean"
      >
        ▶
      </div>
      <p className="mt-4 text-base font-extrabold text-navy">
        This video isn&apos;t ready yet
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        {reason ?? "It'll play here as soon as it lands."}
      </p>
    </div>
  );
}
