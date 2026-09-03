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
   Gold is RESERVED — "if every ping glows gold, none of them do" — for wins and
   for the SINGLE primary action on a screen, which below a player is the CTA
   that carries the day forward. Never for ordinary chrome, and never split
   across a flow: the loop's Continue is gold on every step, disabled or not.
   See DESIGN_LANGUAGE. The surface is navy: letterboxing a 16:9 video on cream
   leaves grey bars that look like a rendering fault.

   16px radius and the warm navy-tinted shadow are the standard card treatment,
   so a video reads as a card with media in it rather than a hole in the page.
   ============================================================================ */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import MuxPlayer from "@mux/mux-player-react";
import type MuxPlayerElement from "@mux/mux-player";
import { createClient } from "@/lib/supabase/client";
import type { VideoRenditions } from "@/lib/mux/playback";
import { markGeometry, pickRendition, type Viewport } from "@/lib/video-rendition";

/*
 * useLayoutEffect on the client, useEffect on the server.
 *
 * The measurement below has to happen BEFORE the browser paints, or the frame
 * flashes at the wrong aspect ratio. React warns about useLayoutEffect during
 * SSR — correctly, since it never runs there — so the standard swap is made
 * once, here, rather than suppressed at the call site.
 */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export type MuxVideoProps = {
  contentId: string;
  /**
   * BOTH cuts, signed. The player picks; the server cannot.
   *
   * This used to be a single playbackId chosen in shapeVideo(), and the choice
   * had no viewport to consult — so the 9:16 phone crop went to desktops and
   * Mitch reported, correctly, that the video was blurry. See
   * lib/video-rendition.ts for the rule and the reasoning.
   */
  renditions: VideoRenditions;
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
   * Write furthest-reached to content_progress as this plays. Default true.
   *
   * ---------------------------------------------------------------------------
   * WHY THIS IS A SEPARATE SWITCH FROM THE WATCH POLICY
   * ---------------------------------------------------------------------------
   * There are two measurements here and they are recorded by different code.
   * TrackedVideo's coverage is the one the gate reads; THIS one is
   * furthest-reached, and it is written from inside this component, on its own
   * timeupdate, whatever the tracker above is doing.
   *
   * So `policy="none"` — which promises to "measure nothing" — did not actually
   * stop a row being written. That never mattered while every caller was the
   * daily loop, and it started mattering the moment the admin preview became a
   * real player: an admin scrubbing through an asset to check it is not an
   * advisor watching it, and the difference has to survive into the table the
   * LMS will credit lessons from.
   *
   * TrackedVideo derives it from the policy, so callers do not have to keep two
   * flags in agreement.
   */
  recordProgress?: boolean;
  /**
   * This player stands in front of a gate, so it is a player you cannot skip.
   *
   * ---------------------------------------------------------------------------
   * WHAT A GATED PLAYER GIVES UP, AND WHY EACH ONE
   * ---------------------------------------------------------------------------
   *   the timeline      the only control whose entire purpose is to not watch
   *   arrow-key seeking the same thing without the timeline
   *   the speed menu    2x playback covers the same seconds in half the time,
   *                     and coverage counts seconds, so it is a half-price watch
   *   the resume point  see below — this is the one that was trapping people
   *
   * Play and pause stay. Space and K still work; only the arrows are taken.
   *
   * NOT A SECURITY BOUNDARY, and not pretending to be one. Anyone with a
   * console can seek. The coverage rule is what makes seeking unprofitable —
   * skipped seconds are never credited — and this only removes the invitation,
   * so that an advisor who scrubs out of habit does not end up fighting a
   * button that will not open.
   *
   * `credit-only` and `none` players (the LMS, the library) keep everything.
   * Nothing is gated there, so there is nothing to protect and a lesson you
   * cannot scrub is just a worse lesson.
   */
  gated?: boolean;
  className?: string;
};

export function MuxVideo({
  contentId,
  renditions,
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
  gated = false,
  recordProgress = true,
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
      /* A preview is not a watch. See the prop's note. */
      if (!recordProgress) return;
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
    [contentId, recordProgress]
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

  /* --------------------------------------------------------------------------
     WHICH CUT PLAYS

     Two measurements, because they answer different questions. The VIEWPORT
     says which way the device is being held — the thing that decides whether a
     9:16 cut is the designed picture or a mistake. The FRAME says how much
     width the player was actually given, which is what the vertical's native
     1080 has to be compared against: /today can draw a 480px player inside a
     1600px window, and the window is not what the viewer is looking at.

     Both are client facts. That is the whole reason the choice lives here and
     not in shapeVideo(), where it used to be and where it was always wrong.
  -------------------------------------------------------------------------- */
  const frame = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<Viewport | null>(null);

  /*
   * FROZEN ONCE PLAYING. Changing playbackId swaps the source, and mux-player
   * responds by tearing down the media element and buffering the new one — mid
   * video that is a visible stall and a lost position, which is a worse trade
   * than a slightly letterboxed picture for someone who rotated a tablet.
   *
   * SO: the frame is re-measured and the cut re-picked freely up to the moment
   * of first play, and held from then on. Rotate before you press play and you
   * get the right cut; rotate during and you keep watching the one you started.
   */
  const playing = useRef(false);

  /*
   * MEASURED BEFORE THE PLAYER IS MOUNTED, NOT AFTER.
   *
   * The first version of this rendered the player immediately with the master
   * and swapped the source once the measurement arrived. On a phone that swap
   * lands milliseconds into loading the first one, and mux-player reports the
   * abandoned load as an error — which the daily loop correctly treats as "this
   * video is broken" and releases the gate for. A correct rendition choice that
   * announces "Couldn't play this one" is not a fix.
   *
   * So the frame renders empty for one layout pass, the measurement is taken
   * in it, and the player mounts once, already holding the id it will keep.
   * useLayoutEffect, so that pass never reaches the screen.
   */
  useIsomorphicLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;

    const measure = () => {
      if (playing.current) return;
      const next: Viewport = {
        frameWidth: el.getBoundingClientRect().width,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
      /* Same numbers, same object — a ResizeObserver fires on every reflow and
         a new object each time would re-render the player on each one. */
      setView((prev) =>
        prev &&
        Math.round(prev.frameWidth) === Math.round(next.frameWidth) &&
        prev.viewportWidth === next.viewportWidth &&
        prev.viewportHeight === next.viewportHeight
          ? prev
          : next
      );
    };

    measure();

    /* Rotation is not a resize of the frame — a phone turned sideways can leave
       a full-width player exactly as wide as it was. The viewport listener is
       what catches it. */
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);

    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);

    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      observer?.disconnect();
    };
  }, []);

  const { rendition, shape } = pickRendition(renditions, view);

  /*
   * The picture's real aspect ratio, once the player knows it. Until then the
   * declared shape stands in, which is right for every asset in the library —
   * all 57 are exactly 16:9 and each frame is drawn at the shape of the cut
   * inside it. loadedmetadata is what would catch the first one that is not.
   */
  const [sourceRatio, setSourceRatio] = useState<number | null>(null);
  const handleLoadedMetadata = useCallback((event: Event) => {
    const el = event.currentTarget as { videoWidth?: number; videoHeight?: number } | null;
    const w = Number(el?.videoWidth);
    const h = Number(el?.videoHeight);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      setSourceRatio(w / h);
    }
  }, []);

  const declaredRatio = shape === "vertical" ? 9 / 16 : 16 / 9;
  const frameBox = view
    ? { width: view.frameWidth, height: view.frameWidth / declaredRatio }
    : null;
  const mark = frameBox
    ? markGeometry(frameBox, sourceRatio ?? declaredRatio, shape)
    : null;

  const handlePlay = useCallback(
    (event: Event) => {
      playing.current = true;
      onPlay?.(event);
    },
    [onPlay]
  );

  /*
   * ---- hotkeys IS AN ATTRIBUTE, NOT A PROP --------------------------------
   *
   * `<MuxPlayer hotkeys="noarrowleft noarrowright">` typechecks and then throws
   * at runtime: React sets props on a custom element by ASSIGNING to the
   * property, and mux-player's `hotkeys` is getter-only — it returns a token
   * list. The assignment raises "Cannot set property hotkeys of #<Fe> which has
   * only a getter", React unwinds, and /today renders "This page couldn't
   * load". A change meant to stop people getting stuck on the video step would
   * have stopped them getting to it.
   *
   * So it is set as an attribute, which is what the element actually reads.
   *
   * Arrow keys are a seek bar with no bar. Space and K are left alone: they
   * play and pause, which a gated player still does.
   */
  const playerRef = useCallback(
    (el: MuxPlayerElement | null) => {
      if (!el) return;
      if (gated) el.setAttribute("hotkeys", "noarrowleft noarrowright");
      else el.removeAttribute("hotkeys");
    },
    [gated]
  );

  /*
   * Put the rate back. Hiding the menu removes the button, not the ability —
   * a browser extension, a remembered preference, or a media-key can all still
   * set playbackRate, and each one would buy a full watch for half the seconds.
   */
  const handleRateChange = useCallback((event: Event) => {
    if (!gated) return;
    const el = event.currentTarget as HTMLMediaElement | null;
    if (el && el.playbackRate !== 1) el.playbackRate = 1;
  }, [gated]);

  return (
    <div className={className}>
      <div
        ref={frame}
        className="relative overflow-hidden rounded-card bg-navy"
        style={{ boxShadow: "0 4px 16px rgba(12,28,44,0.08)" }}
      >
        {/*
          NOT RENDERED UNTIL THE FRAME HAS BEEN MEASURED. One layout pass with
          an empty navy box — invisible, because the measurement runs before
          paint — and then the player mounts holding its final id. Rendering it
          first and correcting the source afterwards is what made a phone say
          "Couldn't play this one" about a video that was fine.

          The box keeps a 16:9 reservation in the meantime so the page does not
          jump; on a phone it grows into 9:16 on the very next pass.
        */}
        {view === null ? (
          <div style={{ aspectRatio: "16 / 9", width: "100%" }} />
        ) : (
        <MuxPlayer
          ref={playerRef}
          playbackId={rendition.playbackId}
          tokens={{
            playback: rendition.token,
            thumbnail: rendition.thumbnailToken,
            storyboard: rendition.storyboardToken,
          }}
          streamType="on-demand"
          title={title}
          /* See the note at the top — this is the Capacitor-critical one. */
          playsInline
          preload="metadata"
          /*
           * ---- THE LOCKOUT LIVED ON THIS LINE ------------------------------
           *
           * A gated player ALWAYS starts at zero. It used to resume wherever
           * content_progress last left the playhead, and that is what trapped
           * Ryan: one drag of the scrubber to 48s of a 52s video wrote
           * position_sec = 48 through record_watch_progress, and from then on
           * every load of /today — every refresh, every new day — started him
           * four seconds from the end. Coverage counts seconds decoded, so the
           * most he could ever reach was those four seconds, and Continue could
           * never open. A refresh did not clear it because the position was in
           * Postgres, not in the tab.
           *
           * Resuming was never worth anything here anyway: coverage does not
           * survive a reload, so a gated video has to be covered in one sitting
           * whatever the playhead does. Resume stays for the LMS and the
           * library, where picking up a twelve-minute lesson where you left it
           * is the whole point and nothing is gated on it.
           */
          startTime={gated ? undefined : initialPositionSec ?? undefined}
          /*
           * LOCKED TO 1, AND PUT BACK IF ANYTHING MOVES IT. Coverage counts
           * media seconds, so 2x is a full watch for half the sitting — the
           * menu is hidden below, and this catches whatever sets the property
           * some other way.
           */
          playbackRate={gated ? 1 : undefined}
          onRateChange={handleRateChange}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={onEnded}
          onPlay={handlePlay}
          onPause={onPause}
          onError={onError}
          envKey={process.env.NEXT_PUBLIC_MUX_ENV_KEY}
          metadata={{
            video_id: contentId,
            video_title: title,
          }}
          accentColor="#4AA8B0"
          style={{
            aspectRatio: shape === "vertical" ? "9 / 16" : "16 / 9",
            width: "100%",
            display: "block",
            "--controls-backdrop-color": "rgba(12,28,44,0.55)",
            /*
             * `contain` in both shapes now. A 16:9 master shown in a narrow
             * frame is LETTERBOXED rather than centre-cropped: the crop threw
             * away two thirds of the width and cut hands and heads, which is
             * exactly why derive-vertical exists to cut a checked one instead.
             * Bars on navy read as a frame; a beheaded presenter reads as a bug.
             */
            "--media-object-fit": "contain",
            /*
             * The controls a gated player does not get. mux-player hides a
             * control when its variable is `none`; the seek buttons go with the
             * bar because they are the same affordance with a different shape.
             */
            ...(gated
              ? {
                  "--time-range": "none",
                  "--seek-backward-button": "none",
                  "--seek-forward-button": "none",
                  "--playback-rate-button": "none",
                  "--playback-rate-menu-button": "none",
                }
              : null),
          }}
        />
        )}

        {/*
          THE MARK. Drawn over the picture, never over a letterbox bar — see
          markGeometry.

          pointer-events: none is the load-bearing line. The whole surface of a
          gated player is a play/pause target, and on a phone the mark sits
          exactly where a thumb lands; a watermark that swallowed that tap would
          look like a video that will not start.

          The drop shadow is not decoration either. Mitch films against bright
          walls, and a white mark on a white wall is an invisible mark; a soft
          navy shadow under it survives the worst case without printing a box on
          the good one.
        */}
        {mark && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: mark.left,
              top: mark.top,
              width: mark.size,
              height: mark.size,
              /* A background rather than an <img>: this is decoration with no
                 content, it carries no alt text, and it is the shape the lint
                 rule about next/image is actually asking for. drop-shadow reads
                 the painted alpha, so the shadow follows the ring and the wave
                 rather than boxing the square. */
              backgroundImage: "url(/brand/svg/ediagd-mark-oneink-white.svg)",
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              opacity: 0.85,
              pointerEvents: "none",
              filter: "drop-shadow(0 1px 3px rgba(12,28,44,0.55))",
            }}
          />
        )}
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
