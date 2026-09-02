"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VideoNotReady } from "@/components/video/MuxVideo";
import type { VideoRenditions } from "@/lib/mux/playback";
import { TrackedVideo, WatchGateLine, type WatchState } from "@/components/video/TrackedVideo";
import { WATCHED_PCT } from "@/lib/watch-coverage";
import { completeDayAction, openWatchTicketAction } from "@/app/(app)/daily/actions";
import { BadgeCelebration } from "./BadgeCelebration";
import { MILESTONES } from "@/lib/gamification/streak";
import { SwellSun } from "@/components/brand/badges/SwellSun";
import { SandDollarIcon } from "@/components/brand/SandDollarIcon";
import { BRAND } from "@/lib/brand";
import { MIN_ROS_FOR_COACHING, formatPct } from "@/lib/advisor";
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
type Cue = { id: string; title: string; body: string | null };
type Focus = {
  service: string;
  /**
   * Null when the block has outlived the pick that opened it — the advisor has
   * since recovered on this family, so there is no gap to quote. The block runs
   * to its end regardless; it just stops claiming a number it no longer has.
   */
  rate: number | null;
  storeAvg: number | null;
  /** Where in the six-stage pitch today sits. */
  stage: string;
  stageNumber: number;
  stageCount: number;
};

/** Signed playback for step 3's pitch video. Same shape as the lifestyle slot. */
type PitchVideo = LifestyleVideo & { stage: string | null };

/**
 * The daily ritual: quote → focus → pitch → lifestyle video → celebration.
 *
 * Steps 1-3 are pure UI. The ONLY mutation is completeDayAction(), fired once
 * on entering step 4 — so bailing out early genuinely means the day isn't
 * complete, and nothing is earned.
 */
export function DailyFlow({
  alreadyCompleteOnLoad,
  currentStreak,
  today,
  greetingName,
  ackLabel,
  quote,
  salesQuote,
  focus,
  cue,
  cueMatch,
  pitchVideo,
  dayStamp,
  totalRos,
  badgeNames,
  badgeRewards,
  previewResult = null,
  dailyLoopSand,
  lifestyle,
  videoThreshold,
}: {
  alreadyCompleteOnLoad: boolean;
  currentStreak: number;
  today: string;
  greetingName: string;
  ackLabel: string;
  quote: Quote | null;
  /** Slot 2 — the selling quote, shown with the focus cue on step 2. */
  salesQuote: Quote | null;
  focus: Focus | null;
  cue: Cue | null;
  /**
   * Which rung of the four-rung ladder produced the cue, or null when there was
   * no block and so no coaching to attempt. 'none' means the ladder ran out —
   * see the honest empty state in FocusStep.
   */
  cueMatch: "op_code_stage_tier" | "op_code_stage" | "op_code" | "family" | "none" | null;
  /** Step 3, or null when this stage has not been filmed. */
  pitchVideo: PitchVideo | null;
  /** True when a pitch video was looked for and not found; null when not looked for. */
  /*
   * SIGNED "SERVED AT" STAMPS, minted by the page and handed straight back.
   * The client never reads or alters them — it could not; they carry an HMAC.
   * They are what lets the server refuse a completion claiming a full watch
   * two seconds after the step appeared. See lib/watch-ticket.
   */
  dayStamp: string;
  totalRos: number;
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
  /** sand_daily_loop from game_settings — itemised in the celebration. */
  dailyLoopSand: number;
  /**
   * The lifestyle / sales-skill video, signed and ready to play, or null when
   * none is published. Null keeps the step in the flow with an honest empty
   * state rather than silently skipping a beat of the ritual.
   */
  lifestyle: LifestyleVideo | null;
  /** game_settings.video_complete_pct — the bar a watch has to clear. */
  videoThreshold: number;
}) {
  const preview = Boolean(previewResult);
  // The close button in the rail needs it; the nested steps have their own.
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // True once WE started the completion. From that moment the incoming
  // `alreadyCompleteOnLoad` prop flips true (the action's cookie write
  // re-renders this page on the server) and must be ignored.
  const [ritualRun, setRitualRun] = useState(false);

  // Captured at mount, so a later server re-render can't turn this on.
  const [doneOnArrival] = useState(alreadyCompleteOnLoad);

  /*
   * WHAT WAS ACTUALLY WATCHED, held here rather than in the steps, because the
   * step unmounts when the flow moves on and the celebration is what posts it.
   * Null means "no video on this step" — distinct from 0, which means a video
   * was served and none of it played.
   */
  const [pitchWatch, setPitchWatch] = useState<WatchState | null>(null);
  const [lifestyleWatch, setLifestyleWatch] = useState<WatchState | null>(null);

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
  const lifestyleTicket = useRef<string | null>(null);
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

  // Terminal screen: they've already done today. It WAITS — nothing here
  // navigates on its own.
  if (doneOnArrival && !ritualRun && !preview) {
    return <DoneForTodayScreen streak={currentStreak} />;
  }

  return (
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
        <div className="flex items-center justify-between gap-3">
          <StepDots step={step} total={pitchVideo ? 5 : 4} />
          {step < 5 && (
            <button
              type="button"
              onClick={() => setConfirmLeave(true)}
              aria-label="Leave the daily loop"
              className="-mr-1 shrink-0 rounded-full p-2 text-ink-soft transition hover:bg-cream-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
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

        {step === 1 && (
          <QuoteStep
            greetingName={greetingName}
            quote={quote}
            ackLabel={ackLabel}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <FocusStep
            focus={focus}
            cue={cue}
            cueMatch={cueMatch}
            salesQuote={salesQuote}
            totalRos={totalRos}
            onNext={() => setStep(pitchVideo ? 3 : 4)}
          />
        )}

        {/*
          STEP 3 IS SKIPPED WHEN THERE IS NO VIDEO, not rendered empty.

          It used to be a permanent placeholder card explaining that filming was
          underway — a beat of the ritual that never did anything, every day, for
          every advisor. An advisor standing on a service drive does not need a
          screen to tell them a video does not exist. The skip is recorded on the
          completion row instead, which is where the unfilmed-library count comes
          from. When the pitch library lands the step appears on its own.
        */}
        {step === 3 && pitchVideo && (
          <PitchStep
            video={pitchVideo}
            focus={focus}
            threshold={videoThreshold}
            onWatch={setPitchWatch}
            onFirstPlay={() => mintTicket(pitchVideo?.contentId ?? null, pitchTicket)}
            onNext={() => setStep(4)}
          />
        )}

        {step === 4 && (
          <LifestyleStep
            video={lifestyle}
            threshold={videoThreshold}
            onWatch={setLifestyleWatch}
            onFirstPlay={() => mintTicket(lifestyle?.contentId ?? null, lifestyleTicket)}
            onNext={() => {
              // Mark the ritual as ours BEFORE the mutation fires, so the
              // server re-render it triggers can't bounce us to /advisor.
              setRitualRun(true);
              setStep(5);
            }}
          />
        )}

        {confirmLeave && (
          <LeaveConfirm
            onStay={() => setConfirmLeave(false)}
            onLeave={() => router.push(preview ? "/admin" : "/advisor")}
          />
        )}

        {step === 5 && (
          <CelebrationStep
            previewResult={previewResult}
            dailyLoopSand={dailyLoopSand}
            dayStamp={dayStamp}
            pitchWatchPct={pitchWatch ? pitchWatch.pct : null}
            lifestyleWatchPct={lifestyleWatch ? lifestyleWatch.pct : null}
            watchError={Boolean(pitchWatch?.error || lifestyleWatch?.error)}
            pitchWatchTicket={pitchTicket}
            lifestyleWatchTicket={lifestyleTicket}
            badgeNames={badgeNames}
            badgeRewards={badgeRewards}
            today={today}
            fallbackStreak={currentStreak}
          />
        )}
    </PhoneScreen>
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
};

/* ---- Step 4: the lifestyle / sales-skill video --------------------------- */
/**
 * The first real video in the daily loop.
 *
 * WATCHING IS NOT GATED. Continue is always enabled, deliberately: the ritual
 * is three minutes on a service drive, and a hard watch-gate turns a habit into
 * a hurdle the first time somebody's signal drops. The watch is RECORDED —
 * content_progress via the player, and daily_completion.video_content_id when
 * the day completes — so the data is honest about who actually watched without
 * the app policing it.
 *
 * The button changes its words once the bar is cleared, which is
 * acknowledgement rather than enforcement.
 */
function LifestyleStep({
  video,
  threshold,
  onWatch,
  onFirstPlay,
  onNext,
}: {
  video: LifestyleVideo | null;
  threshold: number;
  onWatch: (state: WatchState) => void;
  onFirstPlay: () => void;
  onNext: () => void;
}) {
  const [watch, setWatch] = useState<WatchState>({ pct: 0, met: false, error: false });

  return (
    <>
      {/* The CTA lives in the footer, not the flow: on a short screen it
          was below the fold and on a long one it clipped. */}
      <PhoneScreen.Body>
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-ocean">
        Today&apos;s three minutes
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
          honest empty state, and holding the day shut behind a video that does
          not exist would strand every advisor on step 4 — the exact "must never
          cost an advisor their streak" case, arriving from the content side
          rather than the network.
        */}
        <PrimaryButton
          disabled={Boolean(video) && !watch.met && !watch.error}
          onClick={onNext}
        >
          {watch.met || !video ? "Finish the day" : "Continue"}
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
 * When step 3 has no video the day is four steps long, and showing five dots
 * would promise a beat that never arrives — the rail would jump from dot 2 to
 * dot 4 and read as a bug. `step` stays the real step number so the rest of the
 * flow does not have to renumber itself; only the dot it lights up shifts down.
 */
function StepDots({ step, total }: { step: number; total: number }) {
  const active = total === 4 && step >= 4 ? step - 1 : step;
  return (
    <div className="flex items-center justify-center gap-2" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <span
          key={n}
          className={`h-1.5 rounded-pill transition-all ${
            n === active ? "w-8 bg-gold" : n < active ? "w-4 bg-teal" : "w-4 bg-line"
          }`}
        />
      ))}
    </div>
  );
}

/* ---- Step 1: Quote of the Day -------------------------------------------- */

function QuoteStep({
  greetingName,
  quote,
  ackLabel,
  onNext,
}: {
  greetingName: string;
  quote: Quote | null;
  ackLabel: string;
  onNext: () => void;
}) {
  return (
    <>
      {/* The CTA lives in the footer, not the flow: on a short screen it
          was below the fold and on a long one it clipped.

          NO LONGER `centre`. That was right when this screen was a kicker and
          one short line: pinned to the top it left most of the display empty
          and read as a page that had failed to load. It now carries the quote,
          the coaching nugget and the keep control, and centring all of that
          floated the greeting away from the progress dots — the exact gap that
          got fixed on every other screen. Every screen starts in one place. */}
      <PhoneScreen.Body>
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-ocean">
        {BRAND.greeting}, {greetingName}
      </p>

      {/* A pull quote, not a headline. At display size a coaching passage
          fills the screen, forces a scroll for three sentences, and reads as
          shouting; the citation was also crammed against the bottom edge.

          The citation is the VOICE now, not the title. Before the quote import
          this pool held generic coaching cues, so `title` was the nearest thing
          to an attribution available — "The Money Objection — Sunbit Before
          They Finish the Sentence" cited beneath a paragraph. A quote knows who
          said it. */}
      <div className="py-8">
        {quote ? (
          <>
            <PullQuote cite={citationFor(quote.voice) ?? undefined}>
              <p>{quote.body ?? quote.title}</p>
            </PullQuote>

            {/* Why this quote is here — the rule says it, so it does not need
                a label saying it too. Quote, separator, coaching.

                NOT CLAMPED. LongCopy exists to keep long copy scannable in a
                LIST, and this is a single screen inside PhoneScreen.Body, which
                is already a scroll region with a fade when there is more below.
                Clamping here spent a "Read the rest" tap to hide two words and
                a whole screen of empty space. Scrolling is the cheaper gesture
                and the copy arrives whole. */}
            {quote.nugget && (
              <div className="mt-6 border-t border-line pt-5">
                <Prose text={quote.nugget} />
              </div>
            )}

            <div className="mt-6">
              <SaveHeart contentId={quote.id} initialSaved={quote.saved} />
            </div>
          </>
        ) : (
          <p className="text-2xl font-extrabold leading-snug text-navy">
            {BRAND.tagline}.
          </p>
        )}
      </div>
      </PhoneScreen.Body>
      <PhoneScreen.Footer>
        <PrimaryButton onClick={onNext}>{ackLabel}</PrimaryButton>
      </PhoneScreen.Footer>
    </>
  );
}

/* ---- Step 2: today's focus + coaching cue -------------------------------- */

function FocusStep({
  focus,
  cue,
  cueMatch,
  salesQuote,
  totalRos,
  onNext,
}: {
  focus: Focus | null;
  cue: Cue | null;
  cueMatch: "op_code_stage_tier" | "op_code_stage" | "op_code" | "family" | "none" | null;
  /** Slot 2 — the selling quote that sits with the cue. */
  salesQuote: Quote | null;
  totalRos: number;
  onNext: () => void;
}) {
  return (
    <>
      {/* The CTA lives in the footer, not the flow: on a short screen it
          was below the fold and on a long one it clipped. */}
      <PhoneScreen.Body>
      {focus ? (
        <>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-ocean">
            Today&apos;s focus
          </p>
          <h1 className="mt-1 text-3xl font-extrabold text-navy">{focus.service}</h1>
          {/* Where in the pitch today sits. The block is six days of one
              conversation, and without this the advisor has no way to tell
              day 4 from day 1. */}
          <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
            {focus.stage} · {focus.stageNumber} of {focus.stageCount}
          </p>
          {focus.rate != null && focus.storeAvg != null ? (
            <p className="mt-2 text-sm text-ink-soft">
              You&apos;re at{" "}
              <span className="font-extrabold text-navy">{formatPct(focus.rate)}</span> —
              the store averages{" "}
              <span className="font-extrabold text-navy">{formatPct(focus.storeAvg)}</span>
              . One good conversation moves it.
            </p>
          ) : (
            /* The block outlived the gap that opened it. Finishing the pitch is
               still worth the three minutes; quoting a gap that has closed is
               not. */
            <p className="mt-2 text-sm text-ink-soft">
              You&apos;ve pulled this one back up to the store average — let&apos;s
              finish the pitch anyway.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-ocean">
            Today&apos;s coaching
          </p>
          <h1 className="mt-1 text-3xl font-extrabold text-navy">
            Building your picture
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            {totalRos > 0
              ? `Just ${totalRos} ${totalRos === 1 ? "RO" : "ROs"} so far this period — your focus service unlocks at ${MIN_ROS_FOR_COACHING}.`
              : "Your focus service appears once this month's numbers land."}{" "}
            Here&apos;s something to carry onto the drive today.
          </p>
        </>
      )}

      <div className="flex flex-1 flex-col justify-center py-6">
        <div className="rounded-card border border-line bg-surface-card p-5 shadow-card">
          {cue ? (
            <>
              <p className="text-base font-extrabold text-navy">{cue.title}</p>
              {/* Also unclamped, and for the same reason as the nugget on step
                  1: one screen in a scroll region, not a row in a list. The 94
                  restored cues run to 1,200 characters now, which is exactly
                  the case where a "Read the rest" tap buys nothing — the words
                  were the point of restoring them. */}
              {cue.body && <Prose text={cue.body} className="mt-3" />}
            </>
          ) : cueMatch === "none" && focus ? (
            /*
             * THE EXPLICIT NO-CONTENT STATE.
             *
             * Every rung of the ladder came back empty for this family. The old
             * loop served a generic passage here and recorded it as the coaching
             * cue, which meant a family with nothing written for it was
             * indistinguishable from one that was working — for as long as
             * nobody happened to look. Saying so costs the advisor one card and
             * buys a number somebody can act on.
             */
            <>
              <p className="text-base font-extrabold text-navy">
                Nothing written for this one yet
              </p>
              <p className="mt-3 text-[15px] leading-relaxed text-ink">
                {focus.service} coaching for {focus.stage} hasn&apos;t been filmed
                or written yet. It&apos;s on the list — take the line below onto
                the drive today.
              </p>
            </>
          ) : (
            <p className="text-base leading-relaxed text-ink">
              Every customer conversation today is a chance to help someone leave
              safer than they arrived.
            </p>
          )}
        </div>

        {/* Slot 2: a quote that carries the SELLING lesson, sitting with the
            cue it reinforces rather than on a step of its own. The op-code cue
            above is the technique; this is the line to remember it by.

            Outside the card on purpose — one hero per screen, and the cue is
            the hero. This reads as a margin note, which is what it is. */}
        {salesQuote && (
          <div className="mt-5 border-l-2 border-teal pl-4">
            <p className="text-[15px] italic leading-relaxed text-ink">
              {salesQuote.body ?? salesQuote.title}
            </p>
            {citationFor(salesQuote.voice) && (
              <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
                {citationFor(salesQuote.voice)}
              </p>
            )}
            <div className="mt-3">
              <SaveHeart
                contentId={salesQuote.id}
                initialSaved={salesQuote.saved}
                label="Keep"
              />
            </div>
          </div>
        )}
      </div>
      </PhoneScreen.Body>
      <PhoneScreen.Footer>
        <PrimaryButton onClick={onNext}>Got it</PrimaryButton>
      </PhoneScreen.Footer>
    </>
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
  onNext,
}: {
  video: PitchVideo;
  focus: Focus | null;
  threshold: number;
  onWatch: (state: WatchState) => void;
  onFirstPlay: () => void;
  onNext: () => void;
}) {
  const [watch, setWatch] = useState<WatchState>({ pct: 0, met: false, error: false });

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
 * alreadyComplete, and the real numbers would be lost. Caching by date means a
 * remount re-displays the same celebration instead of discarding it.
 */
function cacheKey(today: string) {
  return `ediagd:celebration:${today}`;
}

function readCachedResult(today: string): CompleteDayResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(cacheKey(today));
    return raw ? (JSON.parse(raw) as CompleteDayResult) : null;
  } catch {
    return null;
  }
}

function writeCachedResult(today: string, result: CompleteDayResult) {
  try {
    window.sessionStorage.setItem(cacheKey(today), JSON.stringify(result));
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
    previewResult ?? readCachedResult(today)
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
      writeCachedResult(today, response.result);
      setResult(response.result);
    })();
  }, [
    dayStamp,
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

      <p
        className="mt-6 text-4xl text-teal"
        style={{ fontFamily: "var(--font-script)" }}
      >
        {BRAND.signoff}
      </p>

      </section>
      </PhoneScreen.Body>

      {/* The CTA joins the other four in the footer, so it sits above the home
          indicator and in the same place on every step of the ritual. It was
          also the last hand-rolled copy of PrimaryButton's classes. */}
      <PhoneScreen.Footer>
        <PrimaryButton
          onClick={() => router.push(previewResult ? "/admin" : "/advisor")}
        >
          {previewResult ? "Back to admin" : "See my numbers"}
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
      <button
        type="button"
        aria-label="Keep going"
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
          <button
            type="button"
            onClick={onLeave}
            className="w-full rounded-xl p-3 text-base font-bold text-ink-soft transition hover:bg-cream-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            Leave for now
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
function DoneForTodayScreen({ streak }: { streak: number }) {
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
