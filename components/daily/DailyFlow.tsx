"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MuxVideo, VideoNotReady } from "@/components/video/MuxVideo";
import { completeDayAction } from "@/app/(app)/daily/actions";
import { BadgeCelebration } from "./BadgeCelebration";
import { MILESTONES } from "@/lib/gamification/streak";
import { SwellSun } from "@/components/brand/badges/SwellSun";
import { SandDollarIcon } from "@/components/brand/SandDollarIcon";
import { BRAND } from "@/lib/brand";
import { MIN_ROS_FOR_COACHING, formatPct } from "@/lib/advisor";
import type { CompleteDayResult } from "@/lib/gamification/completeDay";
import { PhoneScreen } from "@/components/brand/PhoneScreen";
import { PullQuote } from "@/components/brand/ScreenBlocks";
import { LongCopy } from "@/components/brand/LongCopy";
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
type Focus = { service: string; rate: number; storeAvg: number };

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
  cueMatch: "service+tier" | "service" | "generic";
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
  // True once WE started the completion. From that moment the incoming
  // `alreadyCompleteOnLoad` prop flips true (the action's cookie write
  // re-renders this page on the server) and must be ignored.
  const [ritualRun, setRitualRun] = useState(false);

  // Captured at mount, so a later server re-render can't turn this on.
  const [doneOnArrival] = useState(alreadyCompleteOnLoad);

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
          <StepDots step={step} />
          {step < 5 && (
            <button
              type="button"
              onClick={() => router.push(preview ? "/admin" : "/advisor")}
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
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && <VideoStep focus={focus} onNext={() => setStep(4)} />}

        {step === 4 && (
          <LifestyleStep
            video={lifestyle}
            threshold={videoThreshold}
            onNext={() => {
              // Mark the ritual as ours BEFORE the mutation fires, so the
              // server re-render it triggers can't bounce us to /advisor.
              setRitualRun(true);
              setStep(5);
            }}
          />
        )}

        {step === 5 && (
          <CelebrationStep
            previewResult={previewResult}
            dailyLoopSand={dailyLoopSand}
            quoteId={quote?.id ?? null}
            cueId={cue?.id ?? null}
            videoId={lifestyle?.contentId ?? null}
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


/** Signed playback for the lifestyle slot, minted per view on the server. */
export type LifestyleVideo = {
  contentId: string;
  title: string;
  playbackId: string;
  token: string;
  thumbnailToken: string;
  storyboardToken: string;
  watchedPct: number;
  positionSec: number | null;
  orientation: "vertical" | "landscape";
  cropToVertical: boolean;
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
  onNext,
}: {
  video: LifestyleVideo | null;
  threshold: number;
  onNext: () => void;
}) {
  const [cleared, setCleared] = useState((video?.watchedPct ?? 0) >= threshold);

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
          <MuxVideo
            contentId={video.contentId}
            playbackId={video.playbackId}
            token={video.token}
            thumbnailToken={video.thumbnailToken}
            storyboardToken={video.storyboardToken}
            title={video.title}
            threshold={threshold}
            initialWatchedPct={video.watchedPct}
            initialPositionSec={video.positionSec}
            orientation={video.orientation}
            cropToVertical={video.cropToVertical}
            onReachedThreshold={() => setCleared(true)}
          />
        ) : (
          <VideoNotReady reason="The next one lands here as soon as it's cut." />
        )}
      </div>
      </PhoneScreen.Body>
      <PhoneScreen.Footer>
        <PrimaryButton onClick={onNext}>
        {cleared ? "Finish the day" : "Continue"}
      </PrimaryButton>
      </PhoneScreen.Footer>
    </>
  );
}

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`h-1.5 rounded-pill transition-all ${
            n === step ? "w-8 bg-gold" : n < step ? "w-4 bg-teal" : "w-4 bg-line"
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
            <PullQuote cite={quote.voice ?? undefined}>
              <p>{quote.body ?? quote.title}</p>
            </PullQuote>

            {/* Why this quote is here. Clamped at a sentence boundary because
                22 of the nuggets arrived from the workbook cut at exactly 900
                characters — the same truncation the cues had. */}
            {quote.nugget && (
              <div className="mt-6 border-t border-line pt-5">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink-soft">
                  Why this one
                </p>
                <LongCopy text={quote.nugget} className="mt-2 text-sm" />
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
  cueMatch: "service+tier" | "service" | "generic";
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
          <p className="mt-2 text-sm text-ink-soft">
            You&apos;re at{" "}
            <span className="font-extrabold text-navy">{formatPct(focus.rate)}</span> —
            the store averages{" "}
            <span className="font-extrabold text-navy">{formatPct(focus.storeAvg)}</span>
            . One good conversation moves it.
          </p>
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
              {/* Clamped at a sentence boundary, never a character count —
                  47 cue bodies arrived from the import already chopped
                  mid-clause. See lib/text.ts. */}
              {cue.body && <LongCopy text={cue.body} className="mt-3" />}
              {focus && cueMatch === "generic" && (
                <p className="mt-4 text-xs text-ink-soft">
                  Service-specific cues for {focus.service} are on the way.
                </p>
              )}
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
            {salesQuote.voice && (
              <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
                {salesQuote.voice}
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

/* ---- Step 3: the pitch video (not built yet) ----------------------------- */

function VideoStep({ focus, onNext }: { focus: Focus | null; onNext: () => void }) {
  return (
    <>
      {/* The CTA lives in the footer, not the flow: on a short screen it
          was below the fold and on a long one it clipped. */}
      <PhoneScreen.Body>
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-ocean">
        The pitch
      </p>
      <h1 className="mt-1 text-3xl font-extrabold text-navy">
        {focus ? focus.service : "Coming soon"}
      </h1>

      <div className="flex flex-1 flex-col justify-center py-6">
        {/* Deliberately NOT a fake player — there's no video to play yet. */}
        <div className="rounded-card border border-dashed border-line bg-surface-card p-8 text-center">
          <div
            aria-hidden="true"
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-pill bg-teal-soft/40 text-2xl text-ocean"
          >
            ▶
          </div>
          <p className="mt-4 text-base font-extrabold text-navy">
            {focus
              ? `The ${focus.service} pitch video is coming soon`
              : "Your pitch video is coming soon"}
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            Filming&apos;s underway. For now, take the cue onto the drive with you.
          </p>
          <button
            type="button"
            disabled
            className="mt-5 cursor-not-allowed rounded-xl border border-line px-4 py-2 text-sm font-bold text-ink-soft opacity-60"
          >
            Play — coming soon
          </button>
        </div>
      </div>
      </PhoneScreen.Body>
      <PhoneScreen.Footer>
        <PrimaryButton onClick={onNext}>Continue</PrimaryButton>
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
  quoteId,
  cueId,
  videoId,
  badgeNames,
  badgeRewards,
  today,
  fallbackStreak,
  previewResult = null,
  dailyLoopSand,
}: {
  quoteId: string | null;
  cueId: string | null;
  videoId: string | null;
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
      const response = await completeDayAction({ quoteId, cueId, videoId });
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
  }, [quoteId, cueId, videoId, result, today, previewResult]);

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
    <section className="flex flex-1 flex-col justify-center text-center">
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

      <button
        onClick={() => router.push(previewResult ? "/admin" : "/advisor")}
        className="mt-6 w-full rounded-xl bg-gold p-4 text-lg font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
      >
        {previewResult ? "Back to admin" : "See my numbers"}
      </button>
    </section>
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
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl bg-gold p-4 text-lg font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
    >
      {children}
    </button>
  );
}

export default DailyFlow;
