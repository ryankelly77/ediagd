import { BRAND } from "@/lib/brand";
import { SunWaveMotif } from "@/components/brand/SunWaveMotif";

/* ============================================================================
   EDIAGD — the rooftop is not set up yet

   WHAT AN ADVISOR SEES INSTEAD OF A RITUAL THAT CANNOT FINISH.

   Their rooftop holds no product, so content_entitled_read returns nothing and
   every slot of the morning comes back empty. The gate then fails closed —
   correctly, an empty screen must not pay out a streak — and the effect is an
   advisor who does everything the app asks and never completes a day. No error,
   no explanation, nothing to tell anybody except "it doesn't work".

   ---------------------------------------------------------------------------
   THREE THINGS IT HAS TO DO, AND ONE IT MUST NOT
   ---------------------------------------------------------------------------
     say the app is fine and the ACCOUNT is not      — so they stop retrying
     say it is not their fault and not their job     — so they stop feeling it
     say who to tell                                 — so it actually gets fixed

   What it must NOT do is look like a paywall. Nobody here chose not to buy
   anything; a manager has not finished setting the store up. "Upgrade" language
   on a screen shown to an employee of a dealership that HAS bought the product
   would be both wrong and insulting.

   NO STREAK LANGUAGE EITHER. Their Swell is not at risk — countMissedWorkDays
   only ever charges against days they were scheduled AND the app was usable, and
   there is nothing here for them to lose by not completing. Raising it would
   invent an anxiety to reassure.
   ============================================================================ */

export function RooftopNotReady({
  greetingName,
  rooftopName,
}: {
  greetingName: string;
  /** Named so the message is about a place, not about them. */
  rooftopName: string | null;
}) {
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <p className="ediagd-eyebrow">
        {BRAND.greeting}, {greetingName}
      </p>

      <section className="ediagd-hero mt-4" data-intentional-bleed>
        <SunWaveMotif />
        <div className="relative">
          <h1 className="text-2xl font-extrabold leading-tight text-white">
            {rooftopName ?? "Your store"} isn&apos;t switched on yet
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ice-dim">
            Your account is ready and your training is waiting — the store just
            hasn&apos;t been given access to it yet. That&apos;s a setting on our
            side, not anything you&apos;ve done.
          </p>
        </div>
      </section>

      <div className="mt-6 rounded-card border border-line bg-surface-card p-5">
        <p className="text-sm font-extrabold text-navy">What to do</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Tell your service manager your {BRAND.app} account is set up but the
          store isn&apos;t. They can get it turned on, and everything here starts
          working the same morning — nothing is lost in the meantime.
        </p>
      </div>

      {/*
        NO CTA. There is nothing an advisor can press that would help, and a
        button that does not fix the problem it appears under is how somebody
        presses it four times and decides the app is broken. The tab bar is
        still there; the rest of the app that does not need this product — their
        streak, their badges, their profile — is still reachable.
      */}
    </main>
  );
}
