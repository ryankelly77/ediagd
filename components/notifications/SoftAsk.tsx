"use client";

/* ============================================================================
   EDIAGD — the card that stands in front of Apple's dialog

   ---------------------------------------------------------------------------
   WHY THERE IS A CARD AT ALL
   ---------------------------------------------------------------------------
   iOS asks for notification permission once per install and remembers the
   answer forever. A cold dialog gets a reflexive "Don't Allow" from most people
   because it arrives with no argument attached — and that answer cannot be
   revisited except in Settings, which nobody walks.

   So this asks first, in our own words, at a moment the app has just been
   useful. Somebody who taps "Not now" here has cost us nothing: Apple's dialog
   was never shown, and it is still available the next time there is a reason to
   offer it. Only "Yes, remind me" spends the one shot.

   ---------------------------------------------------------------------------
   THE PROMISE IN THE COPY IS A PROMISE THE CODE KEEPS
   ---------------------------------------------------------------------------
   The card makes two promises and both are enforced somewhere, not written
   here as reassurance.

   "when your morning's waiting or you're close to earning something" — every
   send has a reason it can name. outbox_policy gates each kind, and no kind
   fires on nothing: streak_keeper and streak_last_call need a live Swell on a
   scheduled work day with the day unfinished, return needs a lapse against
   previous_scheduled_day(), start needs an accepted invite and no completed
   morning. Rest days are excluded by is_scheduled_day(), so a day off is
   silent.

   "Turn them off any time in Profile" — the switch in PushToggle writes
   push_enabled, and push_outbox_due joins on it, so turning it off stops every
   send while the OS permission and the device token stay where they are. That
   is the whole reason the switch exists; see the docblock there.

   WHAT THE CARD DELIBERATELY NO LONGER PROMISES, AND WHY "ONE" WAS THE WRONG
   THING TO SAY. One per advisor per day is enforced by a unique index on
   (recipient_id, local_date), and that number is CURRENT BEHAVIOUR rather than
   a promise the card should be making: it is one index away from changing, and
   the card is the last place that should have to be edited when it does.

   It is also not quite "one". The index reads

       where kind <> 'personal_best' and status <> 'skipped'

   so personal_best is exempt by design, and a row that ends up SKIPPED leaves
   the index — which means an advisor whose noon nudge failed to deliver can
   still receive the 16:50 last call, while one whose noon nudge went out
   cannot. That is a defensible rule and it is not "one nudge" either.

   Worth knowing if you read push-copy.ts: its streak_last_call note calls
   itself "the second exemption", which the schema does not bear out. The index
   has been defined exactly once, in 0056, and names only personal_best.

   So the copy now describes WHY a reminder arrives and HOW TO STOP IT — the
   two things the code actually guarantees — rather than how many arrive, which
   it does not.

   ---------------------------------------------------------------------------
   THE SHELL ONLY
   ---------------------------------------------------------------------------
   A browser has no push surface, so rendering this in a tab would be an offer
   we cannot honour. The check is a runtime one rather than a build-time one —
   the same bundle serves both — and it fails closed: anything other than a
   confirmed native platform renders nothing.
   ============================================================================ */

import { useEffect, useState } from "react";
import { isNative, registerForPush } from "@/lib/native/bridge";
import { createClient } from "@/lib/supabase/client";
import { answerSoftAsk, noteSoftAskShown } from "@/lib/notifications/push-actions";
import { SwellSun } from "@/components/brand/badges/SwellSun";

export function SoftAsk() {
  /* Starts hidden and is revealed only once the platform is confirmed native.
     The other order would flash the card in a browser for one frame. */
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!(await isNative())) return;
      if (cancelled) return;
      setVisible(true);
      /* Spends one of the two asks. Recorded on SHOW rather than on answer:
         a card somebody scrolled past without deciding has still been put in
         front of them, and asking again next week would be the nagging the
         budget exists to prevent. */
      void noteSoftAskShown();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  async function yes() {
    setBusy(true);
    /*
     * Recorded BEFORE the OS dialog. What we are storing is that they accepted
     * OUR offer; whether Apple then grants permission is a separate fact, held
     * by whether a token arrives. Recording it after would lose the answer of
     * anybody who says yes and then dismisses the system dialog — and ask them
     * all over again.
     */
    await answerSoftAsk("yes");

    const supabase = createClient();
    /* No tap handler argument any more, and that is the point: this used to
       pass `() => {}`, and registerForPush replaces every listener — so saying
       yes here broke the first notification tap until the app was relaunched.
       The shell owns the destination now. See setPushNavigator. */
    await registerForPush(
      async (token, platform) => {
        await supabase.rpc("register_push_token", {
          _token: token,
          _platform: platform,
        });
      },
      { prompt: true }
    );

    setVisible(false);
  }

  async function notNow() {
    setBusy(true);
    await answerSoftAsk("not_now");
    setVisible(false);
  }

  return (
    <section className="rounded-2xl border border-line bg-cream-card p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <SwellSun size={44} className="shrink-0" />
        <div className="min-w-0">
          <h2 className="text-base font-extrabold text-navy">
            Want a nudge to keep your Swell rolling?
          </h2>
          <p className="mt-1 text-sm text-navy/80">
            Short reminders when your morning&rsquo;s waiting or you&rsquo;re
            close to earning something. Turn them off any time in Profile.
          </p>
        </div>
      </div>

      {/* Stacked and full width: both are 44px+ and neither is the small grey
          one, because "Not now" is a real answer and not a trap door. */}
      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={yes}
          disabled={busy}
          className="w-full rounded-xl bg-gold p-3.5 text-base font-extrabold text-navy transition hover:brightness-95 disabled:opacity-60"
        >
          Yes, remind me
        </button>
        <button
          type="button"
          onClick={notNow}
          disabled={busy}
          className="w-full rounded-xl p-3 text-center text-sm font-bold text-ocean transition hover:bg-navy/5 disabled:opacity-60"
        >
          Not now
        </button>
      </div>
    </section>
  );
}
