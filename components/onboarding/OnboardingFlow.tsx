"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrushUnderline } from "@/components/brand/BrushUnderline";
import { SandDollarIcon } from "@/components/brand/SandDollarIcon";
import { SunWaveMotif } from "@/components/brand/SunWaveMotif";
import { SwellSun } from "@/components/brand/badges/SwellSun";
import { ScheduleForm } from "@/components/schedule/ScheduleForm";
import { WelcomeGift } from "@/components/onboarding/WelcomeGift";
import { BRAND } from "@/lib/brand";
import { EMPTY_DRAFT } from "@/lib/work-schedule";
import type { IsoDate } from "@/lib/gamification/streak";

/* ============================================================================
   EDIAGD — first run
   Six screens: who we are, what this is, how the day works, what you earn, your
   week, and the welcome gift. Screens 1-4 write nothing, so abandoning the flow
   early leaves no trace; 5 saves the schedule and 6 reveals the Paddle Back Out
   day their account already holds.

   Blocking, but it should read as a welcome. Short screens, one idea each,
   swipe or tap to move.
   ============================================================================ */

const TOTAL = 6;

export function OnboardingFlow({
  alreadyOnboarded,
  preview = false,
  firstName,
  saturdays,
  today,
  taglineLead,
  taglineWord,
  taglineTail,
  paddleOutCap,
}: {
  /** True only if they had a schedule BEFORE this visit. */
  alreadyOnboarded: boolean;
  /** Admin walkthrough: never bounce, never save, end back at /admin. */
  preview?: boolean;
  firstName: string | null;
  saturdays: IsoDate[];
  today: IsoDate;
  taglineLead: string;
  taglineWord: string;
  taglineTail: string;
  paddleOutCap: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const touchStartX = useRef<number | null>(null);

  // Captured at mount, so the server re-render triggered by saving on screen 5
  // (which reports alreadyOnboarded = true) can't yank the flow off its own
  // last screen.
  const [onboardedOnArrival] = useState(alreadyOnboarded);

  useEffect(() => {
    // Landed here with nothing to do — send them on, without a flash of intro.
    // Preview is exempt: that's the whole point of it.
    if (onboardedOnArrival && !preview) router.replace("/");
  }, [onboardedOnArrival, preview, router]);

  if (onboardedOnArrival && !preview) return null;

  // Narrative screens move freely; once the schedule is saved there's no going
  // back to re-answer it, so 6 is terminal.
  const canAdvance = step <= 4;
  const next = () => setStep((s) => Math.min(s + 1, TOTAL));
  const back = () => setStep((s) => Math.max(s - 1, 1));

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }
  function onTouchEnd(e: React.TouchEvent) {
    const from = touchStartX.current;
    touchStartX.current = null;
    if (from == null) return;
    const delta = (e.changedTouches[0]?.clientX ?? from) - from;
    if (Math.abs(delta) < 48) return; // a tap, or a scroll that wandered
    if (delta < 0 && canAdvance) next();
    if (delta > 0 && step > 1 && step < 6) back();
  }

  return (
    <main
      className="ediagd-app min-h-dvh"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" && canAdvance) next();
        if (e.key === "ArrowLeft" && step > 1 && step < 6) back();
      }}
      tabIndex={-1}
    >
      <div className="mx-auto flex min-h-dvh max-w-app flex-col px-5 pb-10 pt-7">
        <StepDots step={step} />

        {/* key= restarts the entrance animation on each screen */}
        <div key={step} className="ediagd-step-in flex flex-1 flex-col">
          {step === 1 && (
            <Screen1
              firstName={firstName}
              lead={taglineLead}
              word={taglineWord}
              tail={taglineTail}
              onNext={next}
            />
          )}
          {step === 2 && <Screen2 onNext={next} />}
          {step === 3 && <Screen3 onNext={next} />}
          {step === 4 && <Screen4 onNext={next} />}
          {step === 5 && (
            <Screen5
              firstName={firstName}
              saturdays={saturdays}
              today={today}
              preview={preview}
              onSaved={() => setStep(6)}
            />
          )}
          {step === 6 && (
            <WelcomeGift
              cap={paddleOutCap}
              preview={preview}
              onStart={() =>
                // The demo keeps going: the real daily loop, then the First
                // Light celebration, both with nothing written.
                router.replace(preview ? "/today?preview=1" : "/today")
              }
            />
          )}
        </div>
      </div>
    </main>
  );
}

/* ---- Progress ------------------------------------------------------------- */

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2 pb-7" aria-hidden="true">
      {Array.from({ length: TOTAL }, (_, i) => i + 1).map((n) => (
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

/**
 * A narrative screen. The whole panel advances on tap — there's nothing else
 * interactive on 1–4, so a large target is a feature rather than a trap.
 */
function Narrative({
  children,
  onNext,
  cta,
}: {
  children: React.ReactNode;
  onNext: () => void;
  cta: string;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <button
        type="button"
        onClick={onNext}
        aria-label={cta}
        className="flex flex-1 flex-col text-left focus-visible:outline-none"
      >
        {children}
      </button>

      <button
        type="button"
        onClick={onNext}
        className="mt-8 w-full rounded-xl bg-gold p-4 text-lg font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
      >
        {cta}
      </button>
    </div>
  );
}

/* ---- 1. Who we are -------------------------------------------------------- */

function Screen1({
  firstName,
  lead,
  word,
  tail,
  onNext,
}: {
  firstName: string | null;
  lead: string;
  word: string;
  tail: string;
  onNext: () => void;
}) {
  return (
    <Narrative onNext={onNext} cta="Show me">
      <section className="ediagd-hero">
        <SunWaveMotif />
        <div className="relative">
          <p className="ediagd-eyebrow">Welcome to</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight text-white">
            <span className="block">{lead}</span>
            <span className="block">
              <BrushUnderline>{word}</BrushUnderline>
              {tail && <>{" "}{tail}</>}
            </span>
          </h1>
          <p className="mt-3 text-sm font-bold leading-snug text-gold">
            The auto dealer service line training system
          </p>
        </div>
      </section>

      <div className="mt-7 space-y-4">
        {/* Every account is invited by a manager or admin, so we always know
            who this is — greet them by name rather than at large. */}
        <p className="text-2xl font-extrabold leading-snug text-navy">
          {firstName ? `${BRAND.greeting}, ${firstName}.` : `${BRAND.greeting}.`}
        </p>
        <p className="text-lg leading-relaxed text-ink">
          This industry doesn&apos;t have a talent problem. It has an energy
          problem.
        </p>
        <p className="text-lg leading-relaxed text-ink">
          Great dealerships aren&apos;t built by chance. They&apos;re built
          every day, by people who keep showing up.
        </p>
        <p className="text-base font-extrabold leading-relaxed text-ocean">
          Better leaders. Better teams. Better dealerships.
        </p>
      </div>
    </Narrative>
  );
}

/* ---- 2. What the app does ------------------------------------------------- */

function Screen2({ onNext }: { onNext: () => void }) {
  return (
    <Narrative onNext={onNext} cta="What's in it">
      <section className="ediagd-hero">
        <SunWaveMotif />
        <div className="relative">
          <p className="ediagd-eyebrow">The whole thing</p>
          <h2 className="mt-2 text-4xl font-extrabold leading-tight text-white">
            Three minutes.
            <br />
            Every day.
          </h2>
        </div>
      </section>

      <div className="mt-7 space-y-4">
        <p className="text-lg leading-relaxed text-ink">
          One thought to carry out to the drive, and one thing to work on.
        </p>
        <p className="text-lg leading-relaxed text-ink">
          {/* Explicit {" "} both sides: SWC drops a plain leading space in a
              text node that wraps to the next line. */}
          Picked from{" "}
          <span className="font-extrabold text-navy">your own numbers</span>
          {" "}— not a generic playbook written for somebody else&apos;s store.
        </p>
        <p className="text-base font-extrabold leading-relaxed text-ocean">
          No classroom. No binder. No homework.
        </p>
      </div>
    </Narrative>
  );
}

/* ---- 3. The daily loop ---------------------------------------------------- */

function Screen3({ onNext }: { onNext: () => void }) {
  return (
    <Narrative onNext={onNext} cta="What can I earn?">
      <section className="ediagd-hero">
        <SunWaveMotif />
        <div className="relative">
          <p className="ediagd-eyebrow">Every morning</p>
          <h2 className="mt-2 text-3xl font-extrabold leading-tight text-white">
            Three steps, and you&apos;re out the door
          </h2>
        </div>
      </section>

      <ol className="mt-6 space-y-3">
        <LoopStep n={1} title="A quote to start on">
          Something worth carrying out to the drive.
        </LoopStep>
        <LoopStep n={2} title={`${BRAND.app}'s Pick`}>
          The one service where you&apos;ve got the most room — measured against
          your own store, not a national average.
        </LoopStep>
        <LoopStep n={3} title="A coaching cue for exactly that">
          The words to use today, on that service.
        </LoopStep>
      </ol>
    </Narrative>
  );
}

function LoopStep({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="ediagd-card flex items-start gap-4 p-4">
      <span
        aria-hidden="true"
        className="ediagd-numeral flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-teal-soft/50 text-sm font-extrabold text-ocean"
      >
        {n}
      </span>
      <span className="min-w-0">
        <span className="block text-base font-extrabold text-navy">{title}</span>
        <span className="mt-1 block text-sm leading-relaxed text-ink-soft">
          {children}
        </span>
      </span>
    </li>
  );
}

/* ---- 4. What you earn ----------------------------------------------------- */

function Screen4({ onNext }: { onNext: () => void }) {
  return (
    <Narrative onNext={onNext} cta="Set up my week">
      <section className="ediagd-hero">
        <SunWaveMotif />
        <div className="relative">
          <p className="ediagd-eyebrow">Show up, it adds up</p>
          {/* The "can't be bought, only earned" line still does its work on the
              Swag Shack card below — the headline just invites. */}
          <h2 className="mt-2 text-4xl font-extrabold leading-tight text-white">
            Earn cool gear.
          </h2>
        </div>
      </section>

      <div className="mt-6 space-y-3">
        <Reward icon={<SwellSun size={38} />} title="Your Swell">
          Your run of good days. It grows every day you train, and pays a badge
          at 7, 30, 90 and 365.
        </Reward>
        <Reward icon={<SandDollarIcon size={32} />} title="Sand Dollars">
          Earned every day you show up, and every milestone you hit.
        </Reward>
        <Reward icon={<SwagTote />} title="The Swag Shack">
          Real gear, paid for in Sand Dollars. Nobody can buy their way in.
        </Reward>
      </div>
    </Narrative>
  );
}

/** The Swag Shack tote, matching the tab-bar glyph so the two read as one place. */
function SwagTote() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-8 w-8 text-ocean"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.8 8h14.4l-1.1 11.1a1.6 1.6 0 0 1-1.6 1.4H7.5a1.6 1.6 0 0 1-1.6-1.4L4.8 8Z" />
      <path d="M9 8.6V6.4a3 3 0 0 1 6 0v2.2" />
      <path d="M8.9 14.6c1-1 2.1-1 3.1 0s2.1 1 3.1 0" strokeWidth={1.7} />
    </svg>
  );
}

function Reward({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ediagd-card flex items-start gap-4 p-4">
      <span aria-hidden="true" className="shrink-0">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-base font-extrabold text-navy">{title}</span>
        <span className="mt-1 block text-sm leading-relaxed text-ink-soft">
          {children}
        </span>
      </span>
    </div>
  );
}

/* ---- 5. The one question -------------------------------------------------- */

function Screen5({
  firstName,
  saturdays,
  today,
  preview,
  onSaved,
}: {
  firstName: string | null;
  saturdays: IsoDate[];
  today: IsoDate;
  preview: boolean;
  onSaved: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <section className="ediagd-hero">
        <SunWaveMotif />
        <div className="relative">
          <p className="ediagd-eyebrow">One thing from you</p>
          <h2 className="mt-2 text-3xl font-extrabold leading-tight text-white">
            Which days are you at the store{firstName ? `, ${firstName}` : ""}?
          </h2>
          <p className="mt-3 text-base leading-relaxed text-ice-dim">
            Your Swell only counts the days you&apos;re on the drive, so days
            off never break it. No dings for time you weren&apos;t working.
          </p>
        </div>
      </section>

      <div className="ediagd-card mt-5 p-5">
        <ScheduleForm
          initial={EMPTY_DRAFT}
          saturdays={saturdays}
          today={today}
          tone="onboarding"
          preview={preview}
          onSuccess={onSaved}
        />
      </div>

      <p className="mt-4 px-1 text-center text-xs leading-relaxed text-ink-soft">
        {preview
          ? "Preview — nothing here is saved."
          : "You can change this any time in your profile."}
      </p>
    </div>
  );
}

export default OnboardingFlow;
