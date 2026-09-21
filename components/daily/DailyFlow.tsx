"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VideoNotReady } from "@/components/video/MuxVideo";
import type { VideoRenditions } from "@/lib/mux/playback";
import { creditedGate, gateFromWatch, type GateRecord } from "@/lib/watch-credit";
import type { RestDay } from "@/lib/work-schedule";
import { RestingMark } from "@/components/brand/badges/RestingMark";
import { TrackedVideo, WatchGateLine, type WatchState } from "@/components/video/TrackedVideo";
import { WATCHED_PCT } from "@/lib/watch-coverage";
import {
  completeDayAction,
  openWatchTicketAction,
  recordGateMetAction,
} from "@/app/(app)/daily/actions";
import { BadgeCelebration } from "./BadgeCelebration";
import { MILESTONES } from "@/lib/gamification/streak";
import { SoftAsk } from "@/components/notifications/SoftAsk";
import { SwellSun } from "@/components/brand/badges/SwellSun";
import { SandDollarIcon } from "@/components/brand/SandDollarIcon";
import { BRAND } from "@/lib/brand";
import { citationFor } from "@/lib/content";
import type { CompleteDayResult } from "@/lib/gamification/completeDay";
import { PhoneScreen } from "@/components/brand/PhoneScreen";
import { PullQuote } from "@/components/brand/ScreenBlocks";
import { Prose } from "@/components/brand/LongCopy";
import { SaveHeart } from "./SaveHeart";

type Quote = {
  id: string;
  title: string;
  body: string | null;
  /** Who said it. Rendered as the citation, never inside the quote text. */
  voice: string | null;
  /** What the quote is FOR — the coaching use, shown beneath it. */
  nugget: string | null;
  saved: boolean;
};
type Focus = {
  service: string;
  /**
   * Null when the assignment has outlived the pick that opened it — the advisor
   * has since recovered on this family, so there is no gap to quote. The cycle
   * runs to the end of the shelf regardless; it just stops claiming a number it
   * no longer has.
   */
  rate: number | null;
  storeAvg: number | null;
  /** Nth film of this family's shelf, and how deep the shelf is. */
  position: number;
  total: number;
};

/** Signed playback for the pitch slot. Same shape as the mindset slot. */
type PitchVideo = LifestyleVideo & {
  family: string;
  stage: string | null;
  position: number;
  total: number;
};

/**
 * Slot 3.
 *
 * FORMAT IS RENDERED, NEVER FILTERED. TWO_LADDERS: "The moment the loop decides
 * 'only text here, video elsewhere,' two orderings compete — the module's and
 * the loop's." The server hands over whatever is next in module order and this
 * component draws it accordingly. Today every published module item is text; a
 * video item already works.
 */
type Item = {
  contentId: string;
  format: "text" | "video";
  title: string;
  body: string | null;
  video: LifestyleVideo | null;
  moduleName: string;
  trackName: string;
  position: number;
  total: number;
};

type Track = { name: string; entering: boolean };

type MorningKind = "normal" | "two_slot" | "track_entry";

/**
 * The daily ritual, in the Two Ladders shape.
 *
 *   track entry   mindset -> track film            -> celebration
 *   two-slot      mindset -> item                  -> celebration
 *   normal        mindset -> pitch      -> item    -> celebration
 *
 * THE MINDSET FILM RUNS FIRST NOW. It used to be step 4 of 5 — the last beat
 * before the celebration — which meant "get your head right" happened after the
 * work, and an advisor who abandoned the morning early never reached it at all.
 * The reversal is the point of the phase, not a refactor artifact.
 *
 * THE QUOTE IS NO LONGER A STEP. It renders on the celebration, after the
 * streak has advanced. It gates nothing and counts towards nothing — ruling 6.
 *
 * Every step before the celebration is pure UI. The ONLY mutation is
 * completeDayAction(), fired once on entering the celebration — so bailing out
 * early genuinely means the day is not complete and nothing is earned.
 */
export function DailyFlow({
  alreadyCompleteOnLoad,
  currentStreak,
  today,
  greetingName,
  ackLabel,
  morningKind,
  mindset,
  pitch,
  item,
  trackFilm,
  track,
  closingQuote,
  focus,
  dayStamp,
  badgeNames,
  badgeRewards,
  previewResult = null,
  previewNotes = [],
  dailyLoopSand,
  videoThreshold,
  restDay = null,
  nextWorkDayLabel = "",
  milestoneText = null,
  offerSoftAsk = false,
}: {
  alreadyCompleteOnLoad: boolean;
  /**
   * Put the notification soft-ask on the "done for today" screen.
   *
   * Server-decided (lib/notifications/push-prefs.ts) because the two-ask budget
   * is a fact about a person rather than about a browser. Deliberately NOT on
   * the celebration that immediately follows the ritual: that screen is the
   * payoff, and a permission request stapled to a reward is the pattern this
   * whole flow is written to avoid.
   */
  offerSoftAsk?: boolean;
  currentStreak: number;
  today: string;
  greetingName: string;
  ackLabel: string;
  /** Decided on the server, never inferred here. See lib/loop.ts. */
  morningKind: MorningKind;
  /** Slot 1. Always offered. */
  mindset: LifestyleVideo | null;
  /** Slot 2, or null on a two-slot or track-entry morning. */
  pitch: PitchVideo | null;
  /** Slot 3, or null on a track-entry morning. */
  item: Item | null;
  /**
   * The film that opens a track, on the morning an advisor enters one.
   *
   * RULING 2: null is the ordinary state today — no track has a film yet — and
   * null means the advisor simply gets a normal morning while the track starts
   * anyway. There is no placeholder and no "coming soon"; that is the whole
   * point of the rule.
   */
  trackFilm: LifestyleVideo | null;
  /** Which track the item belongs to, and whether this morning enters it. */
  track: Track | null;
  /** RULING 6 — the line they carry onto the drive. Not a slot. */
  closingQuote: Quote | null;
  /** The family and the shelf position behind the pitch. Null without one. */
  focus: Focus | null;
  /*
   * SIGNED "SERVED AT" STAMPS, minted by the page and handed straight back.
   * The client never reads or alters them — it could not; they carry an HMAC.
   * They are what lets the server refuse a completion claiming a full watch
   * two seconds after the step appeared. See lib/watch-ticket.
   */
  dayStamp: string;
  badgeNames: Record<string, string>;
  /** Badge key -> Sand Dollars it pays, from game_settings / the catalog. */
  badgeRewards: Record<string, number>;
  /**
   * Admin demo: a canned outcome to show instead of completing the day.
   * When present NOTHING is written — no completion, no badge, no Sand
   * Dollars — and the "already done today" screen is skipped so the whole
   * first-day arc can be walked as often as you like.
   */
  previewResult?: CompleteDayResult | null;
  /**
   * What the admin walkthrough had to substitute, in plain words.
   *
   * SHOWN, NOT SWALLOWED. lib/navigation.ts keeps these walkthroughs in their
   * own section because they are "the one place an admin can see something that
   * looks like a real result and isn't". A borrowed pitch film or a stand-in
   * track film is exactly that, so the banner names it above the ritual. Empty
   * on a real morning, and empty on a preview that needed no substitution —
   * which is itself worth saying, so the banner says that too.
   */
  previewNotes?: readonly string[];
  /** sand_daily_loop from game_settings — itemised in the celebration. */
  dailyLoopSand: number;
  /** game_settings.video_complete_pct — the bar a watch has to clear. */
  videoThreshold: number;
  /**
   * Set when today is a scheduled day off or inside Island Time. Null on a work
   * day, and null in the admin preview — the preview exists to demonstrate the
   * ritual, and a rest card would demonstrate its absence.
   */
  restDay?: RestDay | null;
  /**
   * "Monday", "Tuesday", or "your next work day" — the day their Swell picks
   * up, computed from their own schedule with Island Time skipped. Empty on a
   * work day, where the rest card never renders.
   */
  nextWorkDayLabel?: string;
  /**
   * The milestone sentence, already decided by lib/gamification/streak's
   * milestoneLine on the server. Passed as finished copy rather than as the
   * badge rows it was computed from: the client has no business knowing the
   * ledger, and a second caller of the selector is a second chance to drift
   * from the Swell card. Null when there is nothing to say.
   */
  milestoneText?: string | null;
}) {
  const preview = Boolean(previewResult);
  // The close button in the rail needs it; the nested steps have their own.
  const router = useRouter();
  /*
   * Seeded from the session so a remount mid-ritual resumes where the advisor
   * was. See stepKey() — the first Continue files a watch gate, and that is a
   * server action.
   */
  const [step, setStepRaw] = useState(() => readStep(dayStamp) ?? 1);
  const setStep = useCallback(
    (next: number) => {
      writeStep(dayStamp, next);
      setStepRaw(next);
    },
    [dayStamp]
  );
  const [confirmLeave, setConfirmLeave] = useState(false);
  // True once WE started the completion. From that moment the incoming
  // `alreadyCompleteOnLoad` prop flips true (the action's cookie write
  // re-renders this page on the server) and must be ignored.
  const [ritualRun, setRitualRun] = useState(false);

  // Captured at mount, so a later server re-render can't turn this on.
  const [doneOnArrival] = useState(alreadyCompleteOnLoad);

  /* Did they ask for the loop on a day off? One tap, never remembered — the
     next rest day opens as a rest day again, because volunteering once is not
     a standing offer to work weekends. */
  const [revealed, setRevealed] = useState(false);

  /*
   * WHAT WAS ACTUALLY WATCHED, held here rather than in the steps, because the
   * step unmounts when the flow moves on and the celebration is what posts it.
   * Null means "no video on this step" — distinct from 0, which means a video
   * was served and none of it played.
   */
  /*
   * ---- NOT SEEDED FROM THE GATE RECORD, AND THAT IS THE POINT -------------
   *
   * This is what the celebration POSTS, and the client may only ever claim what
   * it measured in this session. Seeding it from the record would have the
   * client assert 97% for a video it has not played in this tab — and if the
   * viewer then merely opened the player, a fresh ticket minted seconds ago
   * would arrive alongside that 97 and the completion's own plausibility check
   * would refuse the day. A fix for a locked gate that locks the day instead.
   *
   * So the client stays honest and the SERVER remembers: completeDay reads the
   * gate record itself and carries the recorded percentage into the completion.
   * See verifyWatch. What the record seeds on this side is only the button —
   * each step's own `watch` state, below.
   */
  const [pitchWatch, setPitchWatch] = useState<WatchState | null>(null);
  const [mindsetWatch, setMindsetWatch] = useState<WatchState | null>(null);

  /*
   * ---- THE GATE, HELD WHERE BOTH MOUNTS CAN SEE IT ------------------------
   *
   * The rest card and step 4 serve the SAME lifestyle video, and each one hands
   * its player an `initialMet` so a gate opened earlier today starts open. Both
   * used to read `lifestyle.gate` — a server prop, fetched once when the page
   * loaded.
   *
   * "Take today's rep anyway" reveals the loop with no round trip, deliberately
   * (see app/(app)/today/page.tsx). So an advisor who watched the video on the
   * rest card and then took the rep met a step-4 player still holding the null
   * the server sent before they pressed play, and was asked to watch the whole
   * thing again. The gate row was written correctly; nothing on the client ever
   * read it back.
   *
   * So the record lives here, above both, seeded from the server and updated
   * the moment a gate opens in either place. Card first or loop first, the
   * video is asked for once a day.
   *
   * PARTIAL COVERAGE DOES NOT CARRY, and that is a decision rather than an
   * oversight. Coverage is session-only on purpose — it is what stops a watch
   * being assembled out of five-second visits — and TrackedVideo explicitly
   * refuses to seed its accumulator from a record, because a later partial
   * watch could then resume from a full one. Lifting the session across an
   * unmount would mean reversing that. Threshold-or-nothing: cross the bar on
   * the card and the loop knows; stop halfway and the loop starts at zero.
   */
  const [mindsetSessionGate, setMindsetSessionGate] = useState<GateRecord | null>(null);
  const [pitchSessionGate, setPitchSessionGate] = useState<GateRecord | null>(null);
  /*
   * TWO MORE SLOTS CAN CARRY A FILM, AND BOTH ARE GATED THE SAME WAY.
   *
   * The track film is the whole of an entry morning, so it is the gate for that
   * morning. A video ITEM is not possible today — no module carries a
   * mux_playback_id — but the item slot is format-agnostic by design, so the
   * machinery is here rather than waiting to be discovered missing on the day
   * Mitch attaches the first one.
   */
  const [trackFilmSessionGate, setTrackFilmSessionGate] = useState<GateRecord | null>(null);
  const [itemSessionGate, setItemSessionGate] = useState<GateRecord | null>(null);
  const mindsetGate = creditedGate(mindset?.gate ?? null, mindsetSessionGate);
  const pitchGate = creditedGate(pitch?.gate ?? null, pitchSessionGate);
  const trackFilmGate = creditedGate(trackFilm?.gate ?? null, trackFilmSessionGate);
  const itemGate = creditedGate(item?.video?.gate ?? null, itemSessionGate);

  /*
   * ---- THE ITEM'S ACKNOWLEDGEMENT ----------------------------------------
   *
   * A TEXT item has nothing to measure — reading is not observable — so the
   * claim the client makes is that the advisor pressed Continue on it. That is
   * exactly what the old cue step asserted implicitly; the difference is that
   * it now travels as a named field and the server records it as a leg.
   *
   * A VIDEO item is not acknowledged, it is gated, and the server ignores this
   * flag for one. See buildMorning in lib/gamification/completeDay.ts.
   */
  const [itemAck, setItemAck] = useState(false);

  /*
   * ---- WRITING THE GATE DOWN ----------------------------------------------
   *
   * Fired once per video, the moment its gate opens. The action re-checks the
   * ticket and the wall clock and quietly declines anything it cannot stand
   * behind — a refusal is never surfaced, because somebody who has genuinely
   * just watched the video must not meet an error over our clock. They keep the
   * gate they earned in this session; what a refused claim loses is only its
   * survival of a refresh.
   */
  const fileGate = useCallback(
    (
      contentId: string | null,
      ticket: React.RefObject<string | null>,
      state: WatchState,
      /** Where to remember this gate for the rest of the visit. */
      remember: (gate: GateRecord) => void
    ) => {
      /*
       * Remembered BEFORE the round trip, and kept even if the write is
       * refused. The refusal path already says the advisor keeps the gate they
       * earned in this session and only loses its survival of a refresh — a
       * second mount of the same video in the same session is still that
       * session, so it must not re-demand the watch either.
       */
      remember(gateFromWatch(state));
      void (async () => {
        try {
          await recordGateMetAction({
            contentId,
            pct: state.error ? null : state.pct,
            watchError: state.error,
            ticket: ticket.current,
          });
        } catch {
          /* Deliberately silent — see above. */
        }
      })();
    },
    []
  );

  /*
   * ---- THE WATCH TICKETS, MINTED WHEN A PLAYER IS OPENED -----------------
   *
   * Not at page render. A ticket minted then says when the PAGE opened, which
   * is a fact about the page and almost nothing about the video — waiting five
   * minutes with the app in a pocket used to satisfy a three-minute video's
   * plausibility check.
   *
   * IF MINTING FAILS, THE GATE OPENS. The action never throws and returns null
   * on any failure; a null ticket then makes an at-or-above-bar claim
   * unverifiable, so the day is recorded with watch_error and a zero
   * percentage — exactly what a broken player does. Nobody is held behind our
   * own machinery.
   */
  const pitchTicket = useRef<string | null>(null);
  const mindsetTicket = useRef<string | null>(null);
  const trackFilmTicket = useRef<string | null>(null);
  const itemTicket = useRef<string | null>(null);
  const mintTicket = useCallback(
    (contentId: string | null, into: React.RefObject<string | null>) => {
      void (async () => {
        try {
          const { ticket } = await openWatchTicketAction(contentId);
          into.current = ticket;
        } catch {
          into.current = null;
        }
      })();
    },
    []
  );

  /*
   * ---- THE RITUAL IS IMMERSIVE, THE ROUTE IS NOT -------------------------
   *
   * /today used to sit in IMMERSIVE_ROUTES, which made AppHeader and TabBar
   * return null across the whole URL. That is right for the three minutes and
   * wrong for the rest-day card, which has no Continue, no step dots and no
   * close button — with the chrome gone, the only way off it was to take a rep
   * the app had just said nobody owed.
   *
   * So the loop covers the bars instead of the route hiding them: fixed, above
   * their z-40, exactly as full-bleed as it was. The rest card renders as an
   * ordinary page underneath them and the tab bar is its way out.
   */
  const immersive = (node: React.ReactNode) => (
    <div className="fixed inset-0 z-50">{node}</div>
  );

  // Terminal screen: they've already done today. It WAITS — nothing here
  // navigates on its own.
  if (doneOnArrival && !ritualRun && !preview) {
    return immersive(
      <DoneForTodayScreen streak={currentStreak} offerSoftAsk={offerSoftAsk} />
    );
  }

  /*
   * ---- A DAY OFF OPENS AS A CARD, NOT A RITUAL ----------------------------
   *
   * Below the already-done check, because somebody who took the voluntary rep
   * this morning should see the same "done for today" screen everyone else
   * does, not be sent back to a card offering them a rep they have taken.
   *
   * The reveal is CLIENT STATE, not a navigation. The whole day was assembled by
   * the server and handed down with it — quote, cue, video, day stamp — so
   * taking the rep starts the ordinary loop instantly and completes with exactly
   * the payload a Tuesday would have sent. There is no rest-day completion path
   * to keep in step with the real one, because there is only one path.
   */
  if (restDay && !revealed && !preview) {
    return (
      <RestDayCard
        kind={restDay.kind}
        closureLabel={restDay.label ?? null}
        greetingName={greetingName}
        streak={currentStreak}
        nextWorkDayLabel={nextWorkDayLabel}
        milestoneText={milestoneText}
        onTakeTheRep={() => setRevealed(true)}
      />
    );
  }

  return immersive(
    <PhoneScreen>
      {/* Below the island, with clear space.

          THE CLOSE BUTTON EXISTS BECAUSE THE CHROME DOES NOT. /today is in
          IMMERSIVE_ROUTES, so AppHeader and TabBar both render null over it —
          deliberate, and right for a three-minute ritual. But the shell launches
          at the bare domain, and app/page.tsx sends anyone who has not completed
          the day straight here, so this is the DEFAULT way into the native app.
          On iOS there is no back button and no browser chrome behind it, which
          left an advisor who opened the app and wanted to check their streak
          first with no way out but force-quitting.

          Leaving costs nothing, which is what makes a bare × honest rather than
          a trap door: steps 1-4 write nothing at all, and the comment at the top
          of this file has always said so. Step 5 has no × — the day is already
          complete by then and it has its own way onward. */}
      <PhoneScreen.Rail>
        {/* The dots are rem-sized, so at 150% they outgrew the row by 6px and
            pushed against the close button. min-w-0 lets the dot strip give,
            and flex-wrap is the escape hatch at the largest sizes — the × must
            never be squeezed, it is the way out of the loop. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {/* Three beats on a normal morning, two on the others. The dots
                count what the advisor will actually see — promising a step
                that never arrives reads as a bug. */}
            <StepDots step={step} total={morningKind === "normal" ? 4 : 3} />
          </div>
          {step < 4 && (
            <button
              type="button"
              onClick={() => setConfirmLeave(true)}
              aria-label="Leave the daily loop"
              /* A fixed -4px, not -mr-1. The nudge exists to pull the icon's
                 own padding back so it optically aligns with the rail edge —
                 an optical correction, which is a constant, not type. As a rem
                 it grew to 6px at 150% and hung the button past its container,
                 which is a page-level overflow measured in something nobody
                 chose. */
              style={{ marginRight: "-4px" }}
              className="shrink-0 rounded-full p-2 text-ink-soft transition hover:bg-cream-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
      </PhoneScreen.Rail>

      {/*
        THE WALKTHROUGH SAYS WHAT IT FABRICATED.

        Above the ritual and on every step, including the celebration — an
        admin who scrolls straight to the numbers still needs to know the pitch
        film was borrowed. `preview` alone is enough to render the header:
        "nothing here is real" is true of the whole walkthrough, and an empty
        `previewNotes` is a real answer ("your own account supplied all three
        slots") rather than a reason to say nothing.
      */}
      {preview && <PreviewBanner notes={previewNotes} />}

        {/*
          THE ORDER IS THE PHASE. mindset first, then the pitch, then the item.
          A track-entry morning replaces the middle and the end with one film.
        */}
        {step === 1 && (
          <MindsetStep
            greetingName={greetingName}
            video={mindset && { ...mindset, gate: mindsetGate }}
            threshold={videoThreshold}
            onWatch={setMindsetWatch}
            onFirstPlay={() => mintTicket(mindset?.contentId ?? null, mindsetTicket)}
            onGateMet={(s) =>
              fileGate(mindset?.contentId ?? null, mindsetTicket, s, setMindsetSessionGate)
            }
            /*
             * A TWO-SLOT MORNING SKIPS STRAIGHT TO THE ITEM.
             *
             * The focus family ran out of film (or there is no assignment at
             * all), so there is no pitch to serve. Rendering step 2 empty would
             * be the placeholder card this phase deleted; jumping past it is
             * the same decision the old loop made for its unfilmed pitch step,
             * and the dots already promise three beats rather than four.
             */
            onNext={() => setStep(morningKind === "two_slot" ? 3 : 2)}
          />
        )}

        {/*
          STEP 2 IS THE TRACK FILM ON AN ENTRY MORNING, AND THE PITCH OTHERWISE.

          Not two steps with one hidden: they are the same beat of the ritual
          answering "what are you working on today", and an entry morning ends
          after it. Ruling 2 means this branch is unreachable today — no track
          has a film — and it will start firing on its own the day Mitch rules
          one, with no code change. That is the test.
        */}
        {step === 2 && morningKind === "track_entry" && trackFilm && (
          <TrackFilmStep
            video={{ ...trackFilm, gate: trackFilmGate }}
            trackName={track?.name ?? ""}
            threshold={videoThreshold}
            onFirstPlay={() => mintTicket(trackFilm.contentId, trackFilmTicket)}
            onGateMet={(s) =>
              fileGate(trackFilm.contentId, trackFilmTicket, s, setTrackFilmSessionGate)
            }
            onNext={() => {
              setRitualRun(true);
              setStep(4);
            }}
          />
        )}

        {step === 2 && morningKind === "normal" && pitch && (
          <PitchStep
            video={{ ...pitch, gate: pitchGate }}
            focus={focus}
            threshold={videoThreshold}
            onWatch={setPitchWatch}
            onFirstPlay={() => mintTicket(pitch.contentId, pitchTicket)}
            onGateMet={(s) => fileGate(pitch.contentId, pitchTicket, s, setPitchSessionGate)}
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <ItemStep
            item={item}
            video={item?.video ? { ...item.video, gate: itemGate } : null}
            threshold={videoThreshold}
            onFirstPlay={() => mintTicket(item?.video?.contentId ?? null, itemTicket)}
            onGateMet={(s) =>
              fileGate(item?.video?.contentId ?? null, itemTicket, s, setItemSessionGate)
            }
            onAck={() => setItemAck(true)}
            onNext={() => {
              // Mark the ritual as ours BEFORE the mutation fires, so the
              // server re-render it triggers can't bounce us to /advisor.
              setRitualRun(true);
              setStep(4);
            }}
          />
        )}

        {confirmLeave && (
          <LeaveConfirm
            onStay={() => setConfirmLeave(false)}
            onLeave={() => router.push(preview ? "/admin" : "/advisor")}
          />
        )}

        {step === 4 && (
          <CelebrationStep
            previewResult={previewResult}
            dailyLoopSand={dailyLoopSand}
            dayStamp={dayStamp}
            pitchWatchPct={pitchWatch ? pitchWatch.pct : null}
            lifestyleWatchPct={mindsetWatch ? mindsetWatch.pct : null}
            watchError={Boolean(pitchWatch?.error || mindsetWatch?.error)}
            pitchWatchTicket={pitchTicket}
            lifestyleWatchTicket={mindsetTicket}
            itemAck={itemAck}
            /* RULING 6 — after the streak advances, gating nothing. */
            closingQuote={closingQuote}
            ackLabel={ackLabel}
            badgeNames={badgeNames}
            badgeRewards={badgeRewards}
            today={today}
            fallbackStreak={currentStreak}
          />
        )}
    </PhoneScreen>
  );
}

/* ---- The rest day -------------------------------------------------------- */

/**
 * What /today is on a day nobody asked them to work.
 *
 * ---------------------------------------------------------------------------
 * THE STREAK LINE IS THE POINT OF THE SCREEN
 * ---------------------------------------------------------------------------
 * Before this existed, a Mon–Fri advisor opening the app on a Saturday met the
 * full five-step ritual with a coaching demand in the middle of it, and nothing
 * anywhere said their Swell was safe. It always was — countMissedWorkDays has
 * skipped days off since 0025 — but the app had never once said so, which left
 * the advisor to either work their day off or guess. Saying it plainly is worth
 * more than every other pixel here.
 *
 * ONE MESSAGE, AND ONE WAY FORWARD. NOTHING ELSE.
 * The quote and the video used to sit on this card too, free to read and play.
 * They made the screen argue with itself: "nothing is owed today" printed
 * directly above a video and a quote, which is content asking to be consumed.
 * Ryan: "it's still confusing." He is right — an offer and a dismissal on the
 * same page read as neither.
 *
 * So the card says the one thing it exists to say, and everything else lives
 * BEHIND the button. Tapping it reveals the ordinary loop, where the quote is
 * step 1 and the video is step 4 — the same content, in the place that already
 * has a shape for it, rather than loose on a screen whose whole point is that
 * nothing is being asked.
 *
 * ONE QUIET ACTION. "Take today's rep anyway" is a link, not a gold button —
 * the gold on every other screen is the thing the app is asking for, and on
 * this screen the app is asking for nothing. An advisor who wants the rep can
 * have it, in one tap, and it counts in full.
 */
function RestDayCard({
  kind,
  closureLabel,
  greetingName,
  streak,
  nextWorkDayLabel,
  milestoneText,
  onTakeTheRep,
}: {
  kind: "day_off" | "island_time" | "store_closed";
  /** The manager's words for the closure — "Labor Day". Only when closed. */
  closureLabel: string | null;
  greetingName: string;
  streak: number;
  /** Their next scheduled day, in words. Never "Monday" by assumption. */
  nextWorkDayLabel: string;
  /** The same sentence the Swell card shows — see milestoneLine. */
  milestoneText: string | null;
  onTakeTheRep: () => void;
}) {
  const island = kind === "island_time";
  const closed = kind === "store_closed";

  /*
   * "Closed for Labor Day" — the manager's label, in their words, because they
   * are the ones who know why the store is shut. A closure with no usable label
   * falls back to the plain fact rather than printing "Closed for ".
   */
  const heading = closed
    ? closureLabel?.trim()
      ? `Closed for ${closureLabel.trim()}`
      : "Store closed"
    : island
      ? "Island Time"
      : "Scheduled day off";

  const because = closed
    ? /* THE STORE decided this one, not them and not us. Said plainly, because
         an advisor meeting a rest card on a Monday needs to know why before
         they trust it. */
      "Your store is closed today."
    : island
      ? "You booked today off."
      : "Today isn't one of your work days.";

  return (
    /*
     * A PAGE, NOT A PhoneScreen. The loop is the immersive thing and it now
     * covers the chrome itself; this sits under the header and above the tab
     * bar like any other destination, which is what makes the tab bar a way
     * out and lets the close button stay off a screen that is not a modal.
     *
     * 72dvh so the column has something to balance inside: the hero centres in
     * the space above the action instead of stacking at the top with a void
     * under it, which is how a screen this sparse ends up reading as unfinished
     * rather than as calm.
     */
    <main
      className="mx-auto flex w-full max-w-app flex-col px-4 pb-8 pt-5"
      style={{ minHeight: "72dvh" }}
    >
      {/*
        THE GREETING TRAVELS WITH THE HERO. Left at the top of the column it
        centred the panel and stranded itself — a line of type alone above a
        gap, which is the "void" version of the same problem the layout was
        meant to solve. Greeting and panel are one block, and the block is what
        sits in the middle.
      */}
      <div className="flex flex-1 flex-col justify-center py-6">
        <p className="mb-3 px-1 text-sm font-bold uppercase tracking-[0.18em] text-ocean">
          {BRAND.greeting}, {greetingName}
        </p>
        {/*
          THE HERO, in the Streak screen's family — same navy card, same
          rounded-card and shadow, same centred column with the mark on top.
          A rest day and a Swell day are the same app talking about the same
          streak, so they should not look like two products.
        */}
        <section className="rounded-card bg-navy p-7 text-center shadow-card">
          <RestingMark variant={island ? "palm" : "sun"} size={96} className="mx-auto" />

          {/*
            hyphens AND break-words, because at the top Dynamic Type sizes a
            SINGLE WORD here is wider than the card. "Scheduled" at 200% is
            ~340px of extrabold in a 226px box, so there is no space to wrap at
            and the word simply runs out of the panel — found by the larger-text
            audit the first Saturday it ever rendered this screen.

            hyphens-auto breaks it properly (Sched-uled) wherever the language
            allows; break-words is the floor under that, for the closure label,
            which is a manager's free text and can be any word at all.
          */}
          <h1 className="mt-4 hyphens-auto break-words text-3xl font-extrabold leading-tight text-white">
            {heading}
          </h1>
          {/*
            ONLY WHEN THERE IS ONE TO BE SAFE. `streak` now arrives from
            swellAsOf, which reads 0 for a Swell that is already broken — so
            this line used to tell a lapsed advisor their streak was safe
            minutes before the engine reset them to Day 1. It also said it to
            somebody who had never started one.

            Nothing replaces it. A rest day with no live Swell has nothing
            reassuring to say that is also true, and the honest version of this
            card is the two lines below it.
          */}
          {streak > 0 && (
            <p className="mt-2 text-base font-bold text-gold">Your streak is safe</p>
          )}

          <p className="mt-3 text-sm leading-relaxed text-ice-dim">
            {because} Nothing is owed — skipping today costs you nothing.
          </p>

          {/*
            THE GROUNDED CLOSER. Same treatment the Swell hero gives its
            next-milestone line: set into the panel rather than floating under
            it, because it is the sentence that answers "so what happens to my
            streak" and it should land last.

            ---------------------------------------------------------------
            IT SAYS BOTH HALVES NOW, AND THE SECOND HALF IS THE POINT
            ---------------------------------------------------------------
            This read "Day 5 is still Day 5 on Monday." Ryan, on a Saturday:
            "why does it say that — should it not be Day 6?"

            The sentence was TRUE. currentLen only moves when a rep is
            completed, so a rest day touches nothing and Monday morning really
            does start at Day 5. But it named MONDAY — the day he acts — while
            quoting the number from before he acts, so it read as though Monday
            were a dead end rather than the day the number moves.

            Preservation was only ever half the answer. The half an advisor
            actually wants on a day off is what happens when they come back, so
            the line now says both: it holds, and the next rep advances it.

            THE NEXT NUMBER IS streak + 1, which is the same arithmetic 0112's
            push copy does with {days_next} — "Keep that Swell going to
            {days_next} days!". Two surfaces promising a different next number
            would be worse than either wording alone.

            "Three minutes ON {label}" rather than "{label}'s three minutes",
            because nextWorkDayLabel is sometimes "your next work day" rather
            than a weekday, and the possessive form of that is unreadable.
          */}
          {streak > 0 && (
            <p className="mt-6 rounded-card bg-white/10 px-4 py-3 text-sm font-bold text-white">
              Day {streak} holds today. Three minutes{" "}
              {island ? "when you're back" : `on ${nextWorkDayLabel}`} makes it Day{" "}
              {streak + 1}.
            </p>
          )}

          {/*
            AND WHAT IS STILL AHEAD — the same sentence the Swell card shows, from
            the same selector, so the two screens cannot disagree about what an
            advisor has left to earn.

            UNDER the closer, not instead of it. The closer answers the question a
            rest day actually raises — does this cost me my streak — and that
            stays the last word in the dark panel. This sits below it, quieter, as
            information rather than a demand: a rest day is the one screen that is
            asking for nothing, and a gold countdown in the middle of it would be
            asking.
          */}
          {streak > 0 && milestoneText && (
            <p className="mt-3 text-sm font-bold text-ice-dim">{milestoneText}</p>
          )}
        </section>
      </div>

      {/* ONE QUIET ACTION. A bordered link, not a gold button — the gold on
          every other screen is the thing the app is asking for, and on this
          screen the app is asking for nothing. */}
      <div>
        <button
          type="button"
          onClick={onTakeTheRep}
          className="w-full rounded-xl border border-line px-4 py-3 text-base font-bold text-ocean transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Take today&apos;s rep anyway
        </button>
        {/* The one place "counts" appears, and it means earning. */}
        <p className="mt-2 text-center text-xs text-ink-soft">
          It counts in full: Sand Dollars, Swell and all.
        </p>
      </div>
    </main>
  );
}

/* ---- Progress ------------------------------------------------------------ */


/**
 * Signed playback for the lifestyle slot, minted per view on the server.
 *
 * BOTH CUTS, and the player chooses between them from a measured viewport —
 * see lib/video-rendition.ts. This type used to carry one pre-chosen playback
 * id, which is how desktops ended up playing the phone crop.
 */
export type LifestyleVideo = {
  contentId: string;
  title: string;
  renditions: VideoRenditions;
  watchedPct: number;
  positionSec: number | null;
  /** Already met today, from the server. The only watch state that survives a
      reload — see lib/watch-gate.ts. */
  gate: GateRecord | null;
};

/* ---- Step 1: the mindset film -------------------------------------------- */
/**
 * The film that opens the day. Get your head right, then go to work.
 *
 * THIS IS THE STEP THAT MOVED. It was step 4 of 5 — the last beat before the
 * celebration — and it is now the first thing an advisor meets. Same shelf,
 * same player, same gate; only the position changed, and the position was the
 * whole complaint.
 *
 * The greeting moved with it. It used to sit on the quote step, which no longer
 * exists as a step, and a morning ritual that opens without saying good morning
 * to anybody reads as a kiosk.
 */
function MindsetStep({
  greetingName,
  video,
  threshold,
  onWatch,
  onFirstPlay,
  onGateMet,
  onNext,
}: {
  greetingName: string;
  video: LifestyleVideo | null;
  threshold: number;
  onWatch: (state: WatchState) => void;
  onFirstPlay: () => void;
  onGateMet: (state: WatchState) => void;
  onNext: () => void;
}) {
  /* Seeded from the server, so Continue is gold on the first paint after a
     reload rather than opening a beat later. */
  const [watch, setWatch] = useState<WatchState>(() =>
    video?.gate
      ? { pct: video.gate.pct ?? 0, met: !video.gate.error, error: video.gate.error }
      : { pct: 0, met: false, error: false }
  );

  return (
    <>
      {/* The CTA lives in the footer, not the flow: on a short screen it
          was below the fold and on a long one it clipped. */}
      <PhoneScreen.Body>
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-ocean">
        Good morning, {greetingName}
      </p>
      <h1 className="mt-1 text-3xl font-extrabold text-navy">
        {video?.title ?? "Coming soon"}
      </h1>

      <div className="flex flex-1 flex-col justify-center py-6">
        {video ? (
          <TrackedVideo
            policy="gate-continue"
            onFirstPlay={onFirstPlay}
            contentId={video.contentId}
            renditions={video.renditions}
            title={video.title}
            threshold={threshold}
            initialWatchedPct={video.watchedPct}
            initialPositionSec={video.positionSec}
            initialMet={video.gate}
            onGateMet={onGateMet}
            onWatchChange={(s) => {
              setWatch(s);
              onWatch(s);
            }}
          />
        ) : (
          <VideoNotReady reason="The next one lands here as soon as it's cut." />
        )}
      </div>
      </PhoneScreen.Body>
      <PhoneScreen.Footer>
        {/*
          NO VIDEO IS NOT A GATE. When nothing is published the step renders its
          honest empty state and Continue stays live. Holding the day shut
          behind a film that does not exist would strand every advisor on step 1
          — the exact "must never cost an advisor their streak" case, arriving
          from the content side rather than the network. The server agrees: a
          slot that was never offered cannot hold the gate open, see
          lib/gamification/dayGate.ts.
        */}
        <PrimaryButton
          disabled={Boolean(video) && !watch.met && !watch.error}
          onClick={onNext}
        >
          Continue
        </PrimaryButton>
        {video && !watch.met && !watch.error && (
          <WatchGateLine pct={watch.pct} met={watch.met} />
        )}
      </PhoneScreen.Footer>
    </>
  );
}

/**
 * The dots count the steps the advisor will actually see.
 *
 * A two-slot or track-entry morning is three beats, not four, and showing four
 * dots would promise one that never arrives — the rail would jump from dot 2 to
 * dot 4 and read as a bug. `step` stays the real step number so the rest of the
 * flow does not renumber itself; only the dot that lights up shifts down.
 */
function StepDots({ step, total }: { step: number; total: number }) {
  const active = total === 3 && step >= 3 ? step - 1 : step;
  return (
    /*
     * CAPPED, LIKE THE LOGO — a progress indicator is not type.
     *
     * w-8 and w-4 are rem, so at 150% the five dots and their gaps grew to
     * 348px inside a 342px rail and spilled. Wrapping the parent could not
     * help: a single child wider than its container overflows whatever the
     * parent does.
     *
     * These dots exist to say "four steps, you are on two". That reading does
     * not improve when they are half again as long, and somebody who has
     * turned text up did it to read words. So min() holds them at their
     * designed size once the scale passes 100%.
     */
    <div className="flex items-center justify-center gap-2" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <span
          key={n}
          className={`rounded-pill transition-all ${
            n === active ? "bg-gold" : n < active ? "bg-teal" : "bg-line"
          }`}
          style={{
            height: "min(0.375rem, 6px)",
            width: n === active ? "min(2rem, 32px)" : "min(1rem, 16px)",
          }}
        />
      ))}
    </div>
  );
}

/* ---- Step 3: the item ---------------------------------------------------- */
/**
 * The advisor's next item in their craft curriculum.
 *
 * ---------------------------------------------------------------------------
 * THE FORMAT IS RENDERED, NOT SELECTED ON
 * ---------------------------------------------------------------------------
 * TWO_LADDERS is explicit: "No filtering by format. The moment the loop decides
 * 'only text here, video elsewhere,' two orderings compete — the module's and
 * the loop's. One ordering, and it lives in the module."
 *
 * So the server hands over whatever is next and this draws it. Every published
 * module item is text today — no module carries a mux_playback_id at all — and
 * the video branch is written and reachable rather than deferred, because the
 * day the first one is attached it must simply work.
 *
 * WHAT "DONE" MEANS DIFFERS BY FORMAT, AND THAT IS HONEST RATHER THAN
 * INCONSISTENT. A film has a watch gate. Text has nothing observable, so
 * Continue is the acknowledgement and it travels to the server as a named claim
 * — the same trust boundary the old coaching-cue step had, said out loud.
 */
function ItemStep({
  item,
  video,
  threshold,
  onFirstPlay,
  onGateMet,
  onAck,
  onNext,
}: {
  item: Item | null;
  video: LifestyleVideo | null;
  threshold: number;
  onFirstPlay: () => void;
  onGateMet: (state: WatchState) => void;
  onAck: () => void;
  onNext: () => void;
}) {
  const [watch, setWatch] = useState<WatchState>(() =>
    video?.gate
      ? { pct: video.gate.pct ?? 0, met: !video.gate.error, error: video.gate.error }
      : { pct: 0, met: false, error: false }
  );

  const gated = Boolean(video) && !watch.met && !watch.error;

  return (
    <>
      <PhoneScreen.Body>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-ocean">
          {item ? item.trackName : "Your curriculum"}
        </p>
        <h1 className="mt-1 text-3xl font-extrabold text-navy">
          {item?.title ?? "Nothing left to work"}
        </h1>
        {item && (
          /* The module, and where in the track they are. The advisor is never
             asked to think about the credential — this is orientation, not a
             scoreboard. */
          <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
            {item.moduleName} · {item.position} of {item.total}
          </p>
        )}

        <div className="flex flex-1 flex-col justify-center py-6">
          {item && video ? (
            <TrackedVideo
              policy="gate-continue"
              onFirstPlay={onFirstPlay}
              contentId={video.contentId}
              renditions={video.renditions}
              title={video.title}
              threshold={threshold}
              initialWatchedPct={video.watchedPct}
              initialPositionSec={video.positionSec}
              initialMet={video.gate}
              onGateMet={onGateMet}
              onWatchChange={setWatch}
            />
          ) : item ? (
            <Prose text={item.body ?? item.title} />
          ) : (
            /*
             * EVERY CORE TRACK FINISHED, or none has publishable content yet.
             * An honest empty rather than a fabricated item — and it does not
             * hold the day, because a slot that was not offered cannot.
             */
            <p className="text-lg leading-relaxed text-ink-soft">
              You are through everything published. More is being written.
            </p>
          )}
        </div>
      </PhoneScreen.Body>
      <PhoneScreen.Footer>
        <PrimaryButton
          disabled={gated}
          onClick={() => {
            /* The acknowledgement is only meaningful for text; for a film the
               server reads the gate and ignores this. Sent either way so the
               client never has to know which rule applied. */
            onAck();
            onNext();
          }}
        >
          Finish the day
        </PrimaryButton>
        {gated && <WatchGateLine pct={watch.pct} met={watch.met} />}
      </PhoneScreen.Footer>
    </>
  );
}

/* ---- Step 2 (entry mornings): the track film ----------------------------- */
/**
 * The film that opens a track. On this morning, the film IS the day.
 *
 * ---------------------------------------------------------------------------
 * RULING 2 — THIS SCREEN IS UNREACHABLE TODAY, AND THAT IS CORRECT
 * ---------------------------------------------------------------------------
 * No certification has an entry film: six Craft films exist against eight core
 * tracks, none named for a core track, and two of the six are already wired as
 * pitch-stage fallbacks. So `certification.entry_film_content_id` is null for
 * all eight and this branch never fires.
 *
 * It is built anyway, and NOT behind a placeholder. An advisor entering a track
 * with no film gets an ordinary three-slot morning and the track starts — no
 * "coming soon" card, no borrowed film from another track. The day Mitch rules
 * which film opens which track, an UPDATE makes entry mornings start appearing
 * with no code change. That is the test this shape exists to pass.
 *
 * GATED, UNLIKE THE OTHER FILMS. The other slots let Continue through on a
 * failed watch because a habit must not become a hurdle. This one is the whole
 * morning: letting it through would mean an advisor entering a track having
 * watched nothing, which is the orphan the gate was invented to prevent. The
 * gate still yields to a watch ERROR, so our own machinery cannot cost a streak.
 */
function TrackFilmStep({
  video,
  trackName,
  threshold,
  onFirstPlay,
  onGateMet,
  onNext,
}: {
  video: LifestyleVideo;
  trackName: string;
  threshold: number;
  onFirstPlay: () => void;
  onGateMet: (state: WatchState) => void;
  onNext: () => void;
}) {
  const [watch, setWatch] = useState<WatchState>(() =>
    video.gate
      ? { pct: video.gate.pct ?? 0, met: !video.gate.error, error: video.gate.error }
      : { pct: 0, met: false, error: false }
  );

  return (
    <>
      <PhoneScreen.Body>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-ocean">
          Starting {trackName}
        </p>
        <h1 className="mt-1 text-3xl font-extrabold text-navy">{video.title}</h1>

        <div className="flex flex-1 flex-col justify-center py-6">
          <TrackedVideo
            policy="gate-continue"
            onFirstPlay={onFirstPlay}
            contentId={video.contentId}
            renditions={video.renditions}
            title={video.title}
            threshold={threshold}
            initialWatchedPct={video.watchedPct}
            initialPositionSec={video.positionSec}
            initialMet={video.gate}
            onGateMet={onGateMet}
            onWatchChange={setWatch}
          />
        </div>
      </PhoneScreen.Body>
      <PhoneScreen.Footer>
        <PrimaryButton disabled={!watch.met && !watch.error} onClick={onNext}>
          Finish the day
        </PrimaryButton>
        {!watch.met && !watch.error && <WatchGateLine pct={watch.pct} met={watch.met} />}
      </PhoneScreen.Footer>
    </>
  );
}

/* ---- The admin walkthrough's banner -------------------------------------- */
/**
 * What this walkthrough is, and what it had to invent.
 *
 * CLAY, NOT GOLD, AND NEVER THE BRAND COLOURS. Gold means "you earned this" all
 * the way through this flow; a demo notice wearing it would be the exact
 * confusion the notice exists to prevent.
 */
function PreviewBanner({ notes }: { notes: readonly string[] }) {
  return (
    <div className="mx-5 mb-2 rounded-card border border-clay bg-surface-card px-3 py-2">
      {/*
        "NO DAY IS SAVED", NOT "NOTHING IS SAVED".
        
        The ritual's outcome is genuinely not written — no completion row, no
        consumption, no pool cursor, no track entry, no module completion, no
        Sand Dollars, no streak; verified by walking this screen against an
        account with zero rows and re-counting all eight tables afterwards.
        
        But opening a player and clearing its bar still files a watch_gate row,
        because recordGateMetAction is not preview-aware and should not be: the
        admin really did watch the video, and that record is what stops the app
        asking them to watch it again today. Claiming "nothing" would be the
        one false sentence on a banner whose whole job is not to mislead.
      */}
      <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-clay">
        Admin walkthrough · no day is saved
      </p>
      {notes.length === 0 ? (
        /* Worth saying out loud: it means the account being previewed has a
           real DMS book and the morning on screen is genuinely its own. */
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          Every slot came from this account&apos;s own data — nothing was
          substituted.
        </p>
      ) : (
        <ul className="mt-1 space-y-1">
          {notes.map((n) => (
            <li key={n} className="text-xs leading-relaxed text-ink-soft">
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---- The closing line ---------------------------------------------------- */
/**
 * The quote, on the celebration screen, after the streak has advanced.
 *
 * RULING 6. It is not a slot and it is not a step: it gates nothing, it counts
 * towards nothing, and 393 quotes folded into the item sequence would have made
 * the credential twenty-seven months instead of nine. What it is, is the line
 * the advisor carries onto the drive.
 *
 * The keep control comes with it. A save is the advisor's own act and always
 * was — moving the quote did not change whose it is.
 */
function ClosingQuote({ quote }: { quote: Quote }) {
  return (
    <div className="border-t border-line pt-6">
      <PullQuote cite={citationFor(quote.voice) ?? undefined}>
        <p>{quote.body ?? quote.title}</p>
      </PullQuote>
      {quote.nugget && (
        <div className="mt-5 border-t border-line pt-4">
          <Prose text={quote.nugget} />
        </div>
      )}
      <div className="mt-5">
        <SaveHeart contentId={quote.id} initialSaved={quote.saved} />
      </div>
    </div>
  );
}

/* ---- Step 3: the pitch video for today's stage --------------------------- */
/**
 * The op code's video for the stage the block is on.
 *
 * THIS COMPONENT ONLY RENDERS WHEN THERE IS A VIDEO. The null case is handled
 * one level up by skipping the step entirely — there is deliberately no empty
 * state here, because the empty state was the bug. For eleven months step 3 was
 * a dashed box saying "filming's underway", shown to every advisor every day,
 * and it taught them that one beat of the ritual is furniture.
 *
 * Watching is not gated, for the same reason as step 4: the ritual is three
 * minutes on a service drive and a watch-gate turns a habit into a hurdle the
 * first time somebody's signal drops. The watch is recorded, not enforced.
 */
function PitchStep({
  video,
  focus,
  threshold,
  onWatch,
  onFirstPlay,
  onGateMet,
  onNext,
}: {
  video: PitchVideo;
  focus: Focus | null;
  threshold: number;
  onWatch: (state: WatchState) => void;
  onFirstPlay: () => void;
  onGateMet: (state: WatchState) => void;
  onNext: () => void;
}) {
  const [watch, setWatch] = useState<WatchState>(() =>
    video.gate
      ? { pct: video.gate.pct ?? 0, met: !video.gate.error, error: video.gate.error }
      : { pct: 0, met: false, error: false }
  );

  return (
    <>
      <PhoneScreen.Body>
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-ocean">
        {video.stage ?? "The pitch"}
      </p>
      <h1 className="mt-1 text-3xl font-extrabold text-navy">{video.title}</h1>
      {focus && (
        <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
          {focus.service}
        </p>
      )}

      <div className="flex flex-1 flex-col justify-center py-6">
        <TrackedVideo
          policy="gate-continue"
          onFirstPlay={onFirstPlay}
          contentId={video.contentId}
          renditions={video.renditions}
          title={video.title}
          threshold={threshold}
          initialWatchedPct={video.watchedPct}
          initialPositionSec={video.positionSec}
          initialMet={video.gate}
          onGateMet={onGateMet}
          onWatchChange={(s) => {
            setWatch(s);
            onWatch(s);
          }}
        />
      </div>
      </PhoneScreen.Body>
      <PhoneScreen.Footer>
        <PrimaryButton disabled={!watch.met && !watch.error} onClick={onNext}>
          {watch.met ? "Got the pitch" : "Continue"}
        </PrimaryButton>
        {/* The line disappears once the gate is open — it has nothing left to
            say, and a full bar under an enabled button is decoration. */}
        {!watch.met && !watch.error && <WatchGateLine pct={watch.pct} met={watch.met} />}
      </PhoneScreen.Footer>
    </>
  );
}

/* ---- Step 4: celebration (the only mutation) ----------------------------- */

/**
 * Cache the celebration for the day in sessionStorage.
 *
 * A per-mount ref isn't enough: the action writes Supabase session cookies, so
 * Next re-renders this page on the server, which can remount this component.
 * On remount the effect re-fires, the engine's idempotency returns
 * alreadyComplete, and the real numbers would be lost. Caching means a remount
 * re-displays the same celebration instead of discarding it.
 *
 * ---------------------------------------------------------------------------
 * KEYED ON THE DAY STAMP, NOT ON THE DATE
 * ---------------------------------------------------------------------------
 * It was `ediagd:celebration:${today}` — the date alone. One browser, two
 * advisors, one day is enough to break that: the second signs in, finishes
 * their morning, and is shown the FIRST one's streak, badge and Sand Dollars,
 * because the cache hit short-circuits the action before it ever runs. Their
 * day is then never completed at all.
 *
 * Found while photographing the three morning types, which is exactly the
 * shared-device case a service drive has: one iPad, several advisors.
 *
 * The stamp's signature is an HMAC over user AND store-local date AND the
 * content served, so it is unique per advisor per day by construction — and
 * unlike a raw user id it is already on this component and is not a secret
 * worth hiding in storage.
 */
function dayKey(dayStamp: string): string {
  /* The MAC half, which is the part that varies by user. Trimmed because a
     storage key does not need 43 characters to be unique here. */
  return (dayStamp.split(".")[1] ?? dayStamp).slice(0, 16);
}

function cacheKey(dayStamp: string) {
  return `ediagd:celebration:${dayKey(dayStamp)}`;
}

/**
 * Which step the advisor is on, kept across a remount.
 *
 * ---------------------------------------------------------------------------
 * THE SAME REMOUNT THE CELEBRATION ALREADY DEFENDS AGAINST, ONE BEAT EARLIER
 * ---------------------------------------------------------------------------
 * Filing a watch gate is a server action, so it refreshes the route and can
 * remount this component — the comment above has said so for as long as the
 * gate has existed. What changed in 3b is WHEN the first gate is filed: the
 * mindset film is now step 1, so the very first Continue can throw the advisor
 * from step 2 back to step 1 while the write lands.
 *
 * Under the old order the first gate was filed on step 3 of 5 and the exposure
 * was the same; it simply bit less often. Moving the film to the front is the
 * point of the phase, so the flow has to stop losing its place.
 *
 * SESSION STORAGE, NOT A REF. A ref does not survive a remount either — that is
 * the whole problem. Session-scoped so closing the tab genuinely starts over,
 * and keyed per advisor per day for the reason above.
 */
function stepKey(dayStamp: string) {
  return `ediagd:step:${dayKey(dayStamp)}`;
}

function readStep(dayStamp: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(stepKey(dayStamp));
    const n = raw == null ? NaN : Number(raw);
    return Number.isInteger(n) && n >= 1 && n <= 4 ? n : null;
  } catch {
    return null;
  }
}

function writeStep(dayStamp: string, step: number) {
  try {
    window.sessionStorage.setItem(stepKey(dayStamp), String(step));
  } catch {
    /* Private mode / quota. The flow still works; it just forgets its place. */
  }
}

function readCachedResult(dayStamp: string): CompleteDayResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(cacheKey(dayStamp));
    return raw ? (JSON.parse(raw) as CompleteDayResult) : null;
  } catch {
    return null;
  }
}

function writeCachedResult(dayStamp: string, result: CompleteDayResult) {
  try {
    window.sessionStorage.setItem(cacheKey(dayStamp), JSON.stringify(result));
  } catch {
    // Private mode / quota — the celebration still shows this mount.
  }
}

function CelebrationStep({
  dayStamp,
  pitchWatchPct,
  lifestyleWatchPct,
  watchError,
  pitchWatchTicket,
  lifestyleWatchTicket,
  itemAck,
  closingQuote,
  ackLabel,
  badgeNames,
  badgeRewards,
  today,
  fallbackStreak,
  previewResult = null,
  dailyLoopSand,
}: {
  dayStamp: string;
  pitchWatchPct: number | null;
  lifestyleWatchPct: number | null;
  watchError: boolean;
  pitchWatchTicket: React.RefObject<string | null>;
  lifestyleWatchTicket: React.RefObject<string | null>;
  /** The item slot was worked through. See CompleteDayInput.itemAck. */
  itemAck: boolean;
  /** RULING 6 — rendered below the payoff, gating nothing. */
  closingQuote: Quote | null;
  ackLabel: string;
  badgeNames: Record<string, string>;
  badgeRewards: Record<string, number>;
  today: string;
  fallbackStreak: number;
  previewResult?: CompleteDayResult | null;
  /** sand_daily_loop, so the breakdown never hardcodes an amount. */
  dailyLoopSand: number;
}) {
  const router = useRouter();
  // In demo mode the outcome is handed in, and the cache is bypassed entirely
  // so a real day's celebration can't leak into the demo or vice versa.
  const [result, setResult] = useState<CompleteDayResult | null>(() =>
    previewResult ?? readCachedResult(dayStamp)
  );
  const [alreadyDone, setAlreadyDone] = useState<CompleteDayResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    // Already have the numbers (this mount or a previous one) — never re-fire.
    // A demo always has them, so the action is never called.
    if (result || previewResult || fired.current) return;
    fired.current = true;

    (async () => {
      /*
       * THE CLIENT NO LONGER SENDS THE DAY AS DATA.
       *
       * It sends back the stamp /today signed, which carries the five content
       * ids, the rung, the tier and the skipped flag. completeDay verifies it
       * and writes what it verified — a forged cue id fails the signature
       * rather than landing in the ROI figure. The op code, stage and block are
       * still read from the open block server-side.
       */
      /*
       * ---- A MISSING TICKET RELEASES, IT DOES NOT TRAP ----------------------
       *
       * If the mint action failed there is no way to VERIFY a full watch, and
       * completeDay refuses claims it cannot verify — correctly. Sending the
       * claim anyway would refuse the day of somebody who actually watched,
       * which is our machinery costing them a streak.
       *
       * So an unverifiable claim is downgraded here instead: the percentage
       * goes as null and watch_error goes true. NULL, NOT ZERO — the 0070
       * convention. Zero would assert they watched none of it, which is not
       * what happened; null says we cannot say, which is exactly what happened.
       * A below-the-bar figure is not a claim and travels as measured.
       */
      const verifiable = (pct: number | null, ticket: string | null) =>
        pct != null && pct >= WATCHED_PCT && !ticket ? null : pct;
      const pitchSend = verifiable(pitchWatchPct, pitchWatchTicket.current);
      const lifeSend = verifiable(lifestyleWatchPct, lifestyleWatchTicket.current);
      const unverifiable = pitchSend !== pitchWatchPct || lifeSend !== lifestyleWatchPct;

      const response = await completeDayAction({
        dayStamp,
        pitchWatchPct: pitchSend,
        lifestyleWatchPct: lifeSend,
        watchError: watchError || unverifiable,
        pitchWatchTicket: pitchWatchTicket.current,
        lifestyleWatchTicket: lifestyleWatchTicket.current,
        itemAck,
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      if (response.result.alreadyComplete) {
        // Finished in another tab (or this component remounted after the write
        // and the cache was unavailable). Show a terminal screen — do NOT
        // navigate; the user decides when to leave.
        setAlreadyDone(response.result);
        return;
      }
      writeCachedResult(dayStamp, response.result);
      setResult(response.result);
    })();
  }, [
    dayStamp,
    itemAck,
    pitchWatchPct,
    lifestyleWatchPct,
    watchError,
    pitchWatchTicket,
    lifestyleWatchTicket,
    result,
    today,
    previewResult,
  ]);

  if (alreadyDone) {
    return <DoneForTodayScreen streak={alreadyDone.streak || fallbackStreak} />;
  }

  if (error) {
    return (
      <section className="flex flex-1 flex-col justify-center">
        <div className="rounded-card border border-line bg-surface-card p-6">
          <p className="text-base font-extrabold text-navy">
            We couldn&apos;t save today just yet
          </p>
          <p className="mt-2 text-sm text-ink-soft">{error}</p>
          <p className="mt-2 text-sm text-ink-soft">
            Nothing was lost — try again and your day will count.
          </p>
        </div>
        <button
          onClick={() => router.refresh()}
          className="mt-6 w-full rounded-xl bg-navy p-4 text-lg font-extrabold text-white"
        >
          Try again
        </button>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center">
        <div
          aria-hidden="true"
          className="ediagd-sun h-20 w-20 rounded-pill"
          style={{
            background:
              "radial-gradient(circle, #FBEFC8 0%, #E8B44C 55%, rgba(232,180,76,0) 72%)",
          }}
        />
        <p className="mt-6 text-sm font-bold uppercase tracking-[0.18em] text-ocean">
          Logging your day…
        </p>
        <style>{`
          .ediagd-sun { animation: ediagd-rise 1.6s ease-in-out infinite; }
          @keyframes ediagd-rise {
            0%, 100% { transform: translateY(4px) scale(1); opacity: .85; }
            50%      { transform: translateY(-4px) scale(1.05); opacity: 1; }
          }
          @media (prefers-reduced-motion: reduce) {
            .ediagd-sun { animation: none; }
          }
        `}</style>
      </section>
    );
  }

  const badgeName = result.badgeEarned
    ? badgeNames[result.badgeEarned] ?? result.badgeEarned
    : null;

  // ---- What was earned, and where it came from ---------------------------
  // Every amount comes from game_settings / the badge catalog via props — the
  // celebration can never quote a number the engine didn't grant.
  const badgeReward = result.badgeEarned
    ? (badgeRewards[result.badgeEarned] ?? 0)
    : 0;

  const lines: { label: string; amount: number }[] = [];
  if (dailyLoopSand > 0) {
    lines.push({ label: "Daily training", amount: dailyLoopSand });
  }
  if (result.badgeEarned && badgeReward > 0) {
    lines.push({ label: `${badgeName ?? "Badge"} badge`, amount: badgeReward });
  }
  const accounted = lines.reduce((n, l) => n + l.amount, 0);
  const remainder = result.sandEarned - accounted;
  if (remainder > 0) {
    lines.push({
      label: (MILESTONES as readonly number[]).includes(result.streak)
        ? "Streak milestone"
        : "Bonus",
      amount: remainder,
    });
  }

  // Only itemise when there's more than one source, and only when the lines
  // genuinely add up — showing a breakdown that doesn't sum is worse than
  // showing none, which is the bug this replaces.
  const itemise =
    lines.length > 1 &&
    lines.reduce((n, l) => n + l.amount, 0) === result.sandEarned;

  return (
    <>
      {/*
        THROUGH THE SHELL, LIKE EVERY OTHER STEP. This screen used to return a
        bare <section> straight into PhoneScreen's column, which supplies no
        horizontal padding of its own — Body and Footer are where px-5 lives. So
        the full-width button ran edge to edge against the glass while the four
        steps before it sat inset, and on a phone that reads as a broken screen
        rather than a deliberate one.

        Same omission as onboarding screens 5 and 6, and the same fix: a screen
        that does not go through the shell does not get the shell's insets.

        `centre` is right here and nowhere else in this flow — the celebration
        is a badge and a number with no headline card to anchor to the top.
      */}
      <PhoneScreen.Body centre>
      <section className="text-center">
      {/* ---- Headline: the Swell day ----------------------------------- */}
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-ocean">
        {result.streakReset ? "A fresh Swell begins" : "Your Swell"}
      </p>

      <div className="mt-2 flex items-center justify-center gap-3">
        <SwellSun size={64} />
        <p className="ediagd-figure text-navy">Day {result.streak}</p>
      </div>

      {result.longest > result.streak && (
        <p className="mt-1 text-sm text-ink-soft">
          Your best is {result.longest} — yesterday&apos;s you is the one to beat.
        </p>
      )}

      {result.graceUsed && (
        <p className="mt-4 rounded-card border border-line bg-surface-card p-3 text-sm leading-relaxed text-navy">
          Paddled back out — your Swell&apos;s still rolling. Mahalo for coming
          back.
        </p>
      )}

      {/* ---- Headline: the badge --------------------------------------- */}
      {/* reward={null} when the amount is itemised below: printing it twice is
          what made the totals look double-counted. */}
      {badgeName && result.badgeEarned && (
        <BadgeCelebration
          badgeKey={result.badgeEarned}
          badgeName={badgeName}
          reward={itemise ? null : (badgeRewards[result.badgeEarned] ?? null)}
        />
      )}

      {/* ---- Supporting detail: the money ------------------------------ */}
      {itemise ? (
        <div className="mx-auto mt-5 w-full max-w-[17rem] rounded-card border border-line bg-surface-card p-4 text-left">
          <ul className="space-y-1.5">
            {lines.map((line) => (
              <li key={line.label} className="flex items-center gap-2">
                <SandDollarIcon size={14} tone="sand" />
                <span className="flex-1 text-sm text-ink-soft">{line.label}</span>
                <span className="ediagd-numeral text-sm font-bold text-navy">
                  +{line.amount}
                </span>
              </li>
            ))}
          </ul>

          {/* The total sums the lines above — heavier, gold, behind a rule. */}
          <div className="mt-2.5 flex items-center gap-2 border-t border-line pt-2.5">
            <SandDollarIcon size={20} />
            <span className="flex-1 text-sm font-extrabold text-navy">
              Sand Dollars
            </span>
            <span className="ediagd-numeral text-xl font-extrabold text-gold">
              +{result.sandEarned}
            </span>
          </div>
        </div>
      ) : (
        <p className="mt-5 flex items-center justify-center gap-2 text-2xl font-extrabold text-gold">
          <SandDollarIcon size={26} />
          <span className="ediagd-numeral">+{result.sandEarned}</span>
          <span>Sand Dollars</span>
        </p>
      )}

      {/* Only when it adds something. On day one the balance IS the amount
          just earned, so printing it again is the same number twice — the
          exact confusion the breakdown above exists to remove. */}
      {result.newBalance !== result.sandEarned && (
        <p className="mt-2 text-sm text-ink-soft">
          Balance:{" "}
          <span className="ediagd-numeral font-bold text-navy">
            {result.newBalance}
          </span>
        </p>
      )}

      {/* ---- Certifications, when a morning finished one ---------------- */}
      {/*
        BOTH LADDERS REPORT HERE. The pitch film can finish a service track and
        the item can finish a craft one, so this is a list. It is the first time
        the daily loop has been able to say this at all — accrual used to be
        wired only to the library, so an advisor who did the loop every morning
        advanced no certification.
      */}
      {result.certificationsEarned.length > 0 && (
        <p className="mt-5 rounded-card border border-gold bg-surface-card p-3 text-sm font-bold leading-relaxed text-navy">
          {result.certificationsEarned.length === 1
            ? "Certification earned."
            : `${result.certificationsEarned.length} certifications earned.`}{" "}
          It is on your profile.
        </p>
      )}

      <p
        className="mt-6 text-4xl text-teal"
        style={{ fontFamily: "var(--font-script)" }}
      >
        {BRAND.signoff}
      </p>

      {/*
        ---- THE CLOSING LINE, RULING 6 ---------------------------------------

        Below the signoff, after the streak has advanced and the money is
        counted. It is the last thing on the screen because it is the thing
        they take with them, and it is left-aligned inside a centred section
        because a pull quote that is centred stops being a pull quote.
      */}
      {closingQuote && (
        <div className="mt-8 text-left">
          <ClosingQuote quote={closingQuote} />
        </div>
      )}

      </section>
      </PhoneScreen.Body>

      {/* The CTA joins the other four in the footer, so it sits above the home
          indicator and in the same place on every step of the ritual. It was
          also the last hand-rolled copy of PrimaryButton's classes. */}
      <PhoneScreen.Footer>
        <PrimaryButton
          onClick={() => router.push(previewResult ? "/admin" : "/advisor")}
        >
          {previewResult ? "Back to admin" : closingQuote ? ackLabel : "See my numbers"}
        </PrimaryButton>
      </PhoneScreen.Footer>
    </>
  );
}

/* ---- Leaving early ------------------------------------------------------- */

/**
 * The sheet behind the × on steps 1-4.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DOES NOT SAY, AND WHY
 * ---------------------------------------------------------------------------
 * "You could lose your streak" would usually be FALSE, and a warning that is
 * usually false is worse than none — it teaches people to dismiss the next one.
 * Read against lib/gamification/streak.ts, leaving right now costs nothing:
 *
 *   * The Swell is only ever recalculated by applyDailyCompletion, which runs
 *     when someone FINISHES a day. Walking away triggers no evaluation at all.
 *   * A missed day only counts against them if it was a SCHEDULED work day —
 *     not Island Time, not a day off. countMissedWorkDays skips the rest.
 *   * Banked Paddle Back Out grace bridges a gap even then.
 *
 * So the true statement is that the day is still open, and that is also the
 * more useful one: it tells them what to do rather than what to fear. Nothing
 * has been earned yet either, which is the honest other half — steps 1-4 write
 * nothing, and the amount is deliberately not quoted here because the
 * celebration is where a number belongs.
 *
 * STAYING IS THE PRIMARY ACTION. Leaving is the one they already chose by
 * tapping the ×, so it does not need the gold; making it quiet and keeping it
 * one tap away is the difference between a reminder and a guilt trip.
 */
function LeaveConfirm({
  onStay,
  onLeave,
}: {
  onStay: () => void;
  onLeave: () => void;
}) {
  /* Latched, not toggled: leaving is one-way, and a second tap while the
     navigation is in flight would push the route twice. */
  const [leaving, setLeaving] = useState(false);

  // Escape closes it, because a sheet that can only be dismissed by choosing
  // one of two things is a trap of a smaller kind.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onStay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStay]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ediagd-leave-title"
    >
      {/* Tapping the scrim stays, matching Escape and the phone convention. */}
      {/* data-no-press: the global press state is right for controls and wrong
          for a full-bleed scrim, where dimming and scaling read as the sheet
          itself flinching. Dismissing is the feedback here. */}
      <button
        type="button"
        aria-label="Keep going"
        data-no-press
        onClick={onStay}
        className="absolute inset-0 bg-navy/40"
      />
      <div
        className="relative w-full max-w-app rounded-t-card bg-cream p-5 shadow-card"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <p
          id="ediagd-leave-title"
          className="text-xl font-extrabold leading-snug text-navy"
        >
          The day&apos;s still open
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Today counts once you finish it — so nothing&apos;s lost and nothing&apos;s
          been earned yet. Come back any time before the store closes and it
          still lands, Sand Dollars and all.
        </p>

        <div className="mt-5 space-y-2">
          <PrimaryButton onClick={onStay}>Keep going</PrimaryButton>
          {/*
            THE PRESS STATE IS GLOBAL NOW; THE WAIT IS THIS BUTTON'S PROBLEM.
            Leaving is a client navigation to /advisor, and that takes a beat.
            With nothing said in the meantime the sheet just sits there, which
            is the half of "you can tap it and not know if you did" that a
            press state alone does not answer.
          */}
          <button
            type="button"
            onClick={() => {
              setLeaving(true);
              onLeave();
            }}
            disabled={leaving}
            className="w-full rounded-xl p-3 text-base font-bold text-ink-soft transition hover:bg-cream-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-70"
          >
            {leaving ? "Leaving…" : "Leave for now"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Terminal: today is already done ------------------------------------ */

/**
 * Shown when the ritual is already complete for today. Deliberately has NO
 * auto-navigation — /today never moves the user off a screen they're reading.
 */
function DoneForTodayScreen({
  streak,
  offerSoftAsk = false,
}: {
  streak: number;
  offerSoftAsk?: boolean;
}) {
  const router = useRouter();
  return (
    <main className="min-h-screen bg-cream">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-8 text-center">
        <SwellSun size={88} className="mx-auto" />
        <h1 className="mt-4 text-3xl font-extrabold leading-snug text-navy">
          You&apos;ve completed today&apos;s training
        </h1>

        {streak > 0 && (
          <p className="mt-4 text-lg font-extrabold text-gold">
            Day {streak} of your Swell
          </p>
        )}

        <p className="mt-3 text-base leading-relaxed text-ink-soft">
          Come back tomorrow to keep it rolling.
        </p>

        {/* Below the streak, above the sign-off: they have just seen what the
            number is, which is the only argument the card has. Renders nothing
            outside the native shell. */}
        {offerSoftAsk && (
          <div className="mt-8 text-left">
            <SoftAsk />
          </div>
        )}

        <p
          className="mt-8 text-4xl text-teal"
          style={{ fontFamily: "var(--font-script)" }}
        >
          {BRAND.signoff}
        </p>

        <button
          onClick={() => router.push("/advisor")}
          className="mt-10 w-full rounded-xl bg-gold p-4 text-lg font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          Go to my dashboard
        </button>
      </div>
    </main>
  );
}

/* ---- Shared ------------------------------------------------------------- */

function PrimaryButton({
  onClick,
  children,
  disabled = false,
}: {
  onClick: () => void;
  children: React.ReactNode;
  /**
   * Muted and inert. The button keeps its words and its place — it does not
   * vanish, shrink, or grow a countdown. An advisor who taps it early gets
   * nothing and can see, from the line underneath, why.
   */
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="w-full cursor-not-allowed rounded-xl border border-line bg-cream-card p-4 text-lg font-extrabold text-ink-soft"
      >
        {children}
      </button>
    );
  }
  /*
   * ONE FLOW, ONE PRIMARY COLOUR.
   *
   * The watch-gate spec asked for clay on the two video steps, on the brand
   * rule "gold only for wins". It was built that way and then unified back:
   * steps 1, 2 and 5 of this same ritual use gold, so a clay Continue on steps
   * 3 and 4 read as a mistake rather than as a distinction — the advisor sees
   * one flow, not five screens with their own rules.
   *
   * Gold is not an exception here, it is the rule catching up to practice:
   * DESIGN_LANGUAGE has always granted gold to primary CTAs, and the admin's
   * Save button already works this way. The refinement is "the SINGLE primary
   * action on a screen", which is what keeps gold scarce without splitting a
   * flow down the middle.
   */
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl bg-gold p-4 text-lg font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
    >
      {children}
    </button>
  );
}

export default DailyFlow;
