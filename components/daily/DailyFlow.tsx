"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { completeDayAction } from "@/app/(app)/daily/actions";
import { BadgeCelebration } from "./BadgeCelebration";
import { SwellSun } from "@/components/brand/badges/SwellSun";
import { SandDollarIcon } from "@/components/brand/SandDollarIcon";
import { BRAND } from "@/lib/brand";
import { MIN_ROS_FOR_COACHING, formatPct } from "@/lib/advisor";
import type { CompleteDayResult } from "@/lib/gamification/completeDay";

type Quote = { id: string; title: string; body: string | null };
type Cue = { id: string; title: string; body: string | null };
type Focus = { service: string; rate: number; storeAvg: number };

/**
 * The daily ritual: quote → focus → video → celebration.
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
  focus,
  cue,
  cueMatch,
  totalRos,
  badgeNames,
  badgeRewards,
}: {
  alreadyCompleteOnLoad: boolean;
  currentStreak: number;
  today: string;
  greetingName: string;
  ackLabel: string;
  quote: Quote | null;
  focus: Focus | null;
  cue: Cue | null;
  cueMatch: "service+tier" | "service" | "generic";
  totalRos: number;
  badgeNames: Record<string, string>;
  /** Badge key -> Sand Dollars it pays, from game_settings / the catalog. */
  badgeRewards: Record<string, number>;
}) {
  const [step, setStep] = useState(1);
  // True once WE started the completion. From that moment the incoming
  // `alreadyCompleteOnLoad` prop flips true (the action's cookie write
  // re-renders this page on the server) and must be ignored.
  const [ritualRun, setRitualRun] = useState(false);

  // Captured at mount, so a later server re-render can't turn this on.
  const [doneOnArrival] = useState(alreadyCompleteOnLoad);

  // Terminal screen: they've already done today. It WAITS — nothing here
  // navigates on its own.
  if (doneOnArrival && !ritualRun) {
    return <DoneForTodayScreen streak={currentStreak} />;
  }

  return (
    <main className="min-h-screen bg-cream">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-8">
        <StepDots step={step} />

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
            totalRos={totalRos}
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <VideoStep
            focus={focus}
            onNext={() => {
              // Mark the ritual as ours BEFORE the mutation fires, so the
              // server re-render it triggers can't bounce us to /advisor.
              setRitualRun(true);
              setStep(4);
            }}
          />
        )}

        {step === 4 && (
          <CelebrationStep
            quoteId={quote?.id ?? null}
            cueId={cue?.id ?? null}
            badgeNames={badgeNames}
            badgeRewards={badgeRewards}
            today={today}
            fallbackStreak={currentStreak}
          />
        )}
      </div>
    </main>
  );
}

/* ---- Progress ------------------------------------------------------------ */

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2 pb-8" aria-hidden="true">
      {[1, 2, 3, 4].map((n) => (
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
    <section className="flex flex-1 flex-col">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-ocean">
        {BRAND.greeting}, {greetingName}
      </p>

      <div className="flex flex-1 flex-col justify-center py-8">
        {quote ? (
          <>
            <p className="text-2xl font-extrabold leading-snug text-navy">
              {quote.body ?? quote.title}
            </p>
            {quote.body && quote.title !== quote.body && (
              <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-ink-soft">
                {quote.title}
              </p>
            )}
          </>
        ) : (
          <p className="text-2xl font-extrabold leading-snug text-navy">
            {BRAND.tagline}.
          </p>
        )}
      </div>

      <PrimaryButton onClick={onNext}>{ackLabel}</PrimaryButton>
    </section>
  );
}

/* ---- Step 2: today's focus + coaching cue -------------------------------- */

function FocusStep({
  focus,
  cue,
  cueMatch,
  totalRos,
  onNext,
}: {
  focus: Focus | null;
  cue: Cue | null;
  cueMatch: "service+tier" | "service" | "generic";
  totalRos: number;
  onNext: () => void;
}) {
  return (
    <section className="flex flex-1 flex-col">
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
              {cue.body && (
                <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-ink">
                  {cue.body}
                </p>
              )}
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
      </div>

      <PrimaryButton onClick={onNext}>Got it</PrimaryButton>
    </section>
  );
}

/* ---- Step 3: the pitch video (not built yet) ----------------------------- */

function VideoStep({ focus, onNext }: { focus: Focus | null; onNext: () => void }) {
  return (
    <section className="flex flex-1 flex-col">
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

      <PrimaryButton onClick={onNext}>Continue</PrimaryButton>
    </section>
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
  badgeNames,
  badgeRewards,
  today,
  fallbackStreak,
}: {
  quoteId: string | null;
  cueId: string | null;
  badgeNames: Record<string, string>;
  badgeRewards: Record<string, number>;
  today: string;
  fallbackStreak: number;
}) {
  const router = useRouter();
  const [result, setResult] = useState<CompleteDayResult | null>(() =>
    readCachedResult(today)
  );
  const [alreadyDone, setAlreadyDone] = useState<CompleteDayResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    // Already have the numbers (this mount or a previous one) — never re-fire.
    if (result || fired.current) return;
    fired.current = true;

    (async () => {
      const response = await completeDayAction({ quoteId, cueId });
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
  }, [quoteId, cueId, result, today]);

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

  return (
    <section className="flex flex-1 flex-col justify-center text-center">
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

      <p className="mt-6 flex items-center justify-center gap-2 text-2xl font-extrabold text-gold">
        <SandDollarIcon size={26} />
        <span className="ediagd-numeral">+{result.sandEarned}</span>
        <span>Sand Dollars</span>
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        <span className="ediagd-numeral">{result.newBalance}</span> banked
      </p>

      {result.graceUsed && (
        <p className="mt-6 rounded-card border border-line bg-surface-card p-4 text-sm leading-relaxed text-navy">
          Paddled back out — your Swell&apos;s still rolling. Mahalo for coming
          back.
        </p>
      )}

      {badgeName && result.badgeEarned && (
        <BadgeCelebration
          badgeKey={result.badgeEarned}
          badgeName={badgeName}
          reward={badgeRewards[result.badgeEarned] ?? null}
        />
      )}

      <p
        className="mt-10 text-4xl text-teal"
        style={{ fontFamily: "var(--font-script)" }}
      >
        {BRAND.signoff}
      </p>

      <button
        onClick={() => router.push("/advisor")}
        className="mt-8 w-full rounded-xl bg-gold p-4 text-lg font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
      >
        See my numbers
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
