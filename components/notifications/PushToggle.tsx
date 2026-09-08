"use client";

/* ============================================================================
   EDIAGD — turning the nudge on and off without going to Settings

   The reason this exists is the reason the soft-ask exists, run backwards.
   iOS permission is expensive to get and, once revoked in Settings, expensive
   to get back — the dialog does not return. So the in-app switch has to be the
   easy one: turning this off stops every send while the OS permission and the
   device tokens stay exactly where they are, and turning it back on is instant
   and silent.

   If the only way to stop the notification were iOS Settings, the cost of a
   single unwanted buzz would be the permission itself, permanently.

   ---------------------------------------------------------------------------
   TURNING IT ON HAS TO BE ABLE TO ASK
   ---------------------------------------------------------------------------
   The first version only wrote the preference, which made this switch a liar
   for the exact people most likely to touch it. Somebody who said "Not now" to
   the soft-ask twice has no device token; flipping this on told them
   notifications were on and nothing would ever arrive, with no way to find out
   why. The soft-ask budget is spent, so the card is never coming back.

   So when this is switched ON inside the shell and there is no permission yet,
   it asks. That is the honest meaning of the control — and it is the only route
   back for anybody who declined the card, which makes it a feature rather than
   a convenience.

   Rendered for everybody, including browser users, deliberately: somebody who
   set this up on their phone and later opens the app on a laptop should be able
   to turn it off from there. In a browser registerForPush returns
   "unavailable" and does nothing.
   ============================================================================ */

import { useState, useTransition } from "react";
import { setPushEnabled } from "@/lib/notifications/push-actions";
import { registerForPush } from "@/lib/native/bridge";
import { createClient } from "@/lib/supabase/client";
import { Toggle } from "@/components/brand/Toggle";

export function PushToggle({
  enabled,
  hasDevice,
}: {
  enabled: boolean;
  /** A live token on file. False means turning on has to ask iOS first. */
  hasDevice: boolean;
}) {
  /*
   * ON MEANS "THIS WILL ACTUALLY ARRIVE", NOT "A COLUMN SAYS TRUE".
   *
   * push_enabled defaults to true, so for anybody who has never registered a
   * device this switch rendered as already-on while nothing could possibly be
   * delivered. That is a lie in itself, and it also created a dead end: the
   * registration prompt fires on an off→on transition, and a switch that is
   * already on has no transition to make. There was no route from "I want
   * these" to "iOS has issued a token" — the only other path is the soft-ask
   * card, which appears at most twice and only on the done-for-today screen.
   *
   * So a preference of true with no device on file reads as OFF, because
   * functionally it IS off. Turning it on then does the thing the label
   * promises: asks iOS, stores the token, and starts delivery.
   *
   * Optimistic, still: the switch moves under the thumb and the write follows.
   * A preference toggle that waits for a round trip on a phone with one bar
   * feels broken even when it is working.
   */
  const [on, setOn] = useState(enabled && hasDevice);
  const [registered, setRegistered] = useState(hasDevice);
  const [problem, setProblem] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function change(next: boolean) {
    setOn(next);
    startTransition(() => {
      void setPushEnabled(next);
    });

    setProblem(null);
    if (!next || registered) return;

    /* No token yet. Ask — this is the one place left that can, once the
       soft-ask budget is spent. */
    const outcome = await registerForPush(
      async (token, platform) => {
        const supabase = createClient();
        await supabase.rpc("register_push_token", {
          _token: token,
          _platform: platform,
        });
        setRegistered(true);
      },
      () => {},
      { prompt: true }
    );

    /*
     * Say what happened. Every one of these used to be silence, and silence is
     * how a shell with no push entitlement looked identical to a working one
     * for weeks.
     */
    if (outcome === "denied") {
      setProblem(
        "iOS is blocking notifications for EDIAGD. Open Settings → Notifications " +
          "→ EDIAGD and allow them, and this will start working straight away."
      );
    } else if (outcome === "no_token") {
      setProblem(
        "iOS did not return a device token. Check the connection and try the " +
          "switch again; if it keeps happening the build is missing its push " +
          "entitlement."
      );
    } else if (typeof outcome === "string" && outcome.startsWith("failed:")) {
      setProblem(`iOS refused to register this device — ${outcome.slice(8)}`);
    } else if (outcome === "unavailable") {
      setProblem(
        "Notifications only work in the EDIAGD app on your phone, not in a " +
          "browser. Your preference is saved either way."
      );
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-navy">Streak reminders</p>
          <p className="mt-0.5 text-xs text-navy/70">
            One nudge at the end of the day, only when your streak is on the line.
          </p>
        </div>
        <Toggle
          checked={on}
          label="Streak reminders"
          onChange={(next) => {
            void change(next);
          }}
        />
      </div>

      {problem && on && (
        <p className="mt-3 rounded-xl bg-navy/5 p-3 text-xs leading-relaxed text-navy/80">
          {problem}
        </p>
      )}

      {/* No device yet, and the switch is off because of it. Say why, so the
          state reads as a step to take rather than as a setting somebody has
          already dealt with. */}
      {!registered && !on && (
        <p className="mt-3 text-xs leading-relaxed text-navy/60">
          This iPhone isn&rsquo;t set up for reminders yet. Turn the switch on and
          allow the prompt.
        </p>
      )}
    </div>
  );
}
