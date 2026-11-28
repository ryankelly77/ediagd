"use client";

/* ============================================================================
   EDIAGD — turning the nudge on and off without going to Settings

   The reason this exists is the reason the soft-ask exists, run backwards.
   OS notification permission is expensive to get and, once revoked in the
   phone's settings, expensive to get back — the dialog does not return on
   either platform. So the in-app switch has to be the easy one: turning this
   off stops every send while the OS permission and the device tokens stay
   exactly where they are, and turning it back on is instant and silent.

   If the only way to stop the notification were the phone's own settings, the
   cost of a single unwanted buzz would be the permission itself, permanently.

   ---------------------------------------------------------------------------
   NOTHING ON THIS SCREEN NAMES AN OPERATING SYSTEM
   ---------------------------------------------------------------------------
   Every failure message here used to begin "iOS", and one of them said "This
   iPhone" — all written when iOS was the only shell. EDIAGD 1.0.0 is on Google
   Play now, so each of those told an Android advisor something false about the
   device in their hand.

   The route into the phone's settings is the one thing that genuinely differs,
   so that single sentence branches on nativePlatform() and the rest is written
   to be true on both. See settingsPath below.

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

import { useEffect, useState, useTransition } from "react";
import { setPushEnabled } from "@/lib/notifications/push-actions";
import { nativePlatform, registerForPush } from "@/lib/native/bridge";
import { createClient } from "@/lib/supabase/client";
import { Toggle } from "@/components/brand/Toggle";

/**
 * Where to turn notifications back on, in the words of the phone in their hand.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS BRANCHES INSTEAD OF SAYING "YOUR PHONE'S SETTINGS"
 * ---------------------------------------------------------------------------
 * Every message on this screen used to begin "iOS", written when iOS was the
 * only shell there was. EDIAGD 1.0.0 is on Google Play, so an Android advisor
 * who declines the permission is now told their iPhone is blocking it.
 *
 * The neutral fix — "turn them on in your phone's settings" — would be true
 * everywhere and useful nowhere. The two paths genuinely differ, and this
 * message exists to be FOLLOWED: it is shown to somebody who has just hit a
 * dead end and whose permission dialog is not coming back. So it names the
 * real path on the platform it is being read on, and falls back to the neutral
 * sentence only when the platform is genuinely unknown — which, per
 * nativePlatform(), means a browser, where the message below is not reachable
 * anyway because registerForPush returns "unavailable" first.
 *
 * NO OS NAME IN ANY BRANCH. "Settings → Notifications → EDIAGD" is a route
 * through the phone, not a claim about who made it, and it stays correct if
 * somebody is reading it on a tablet.
 */
function settingsPath(platform: "ios" | "android" | null): string {
  if (platform === "android") {
    return "Open Settings → Apps → EDIAGD → Notifications and turn them on";
  }
  if (platform === "ios") {
    return "Open Settings → Notifications → EDIAGD and allow them";
  }
  return "Turn notifications on for EDIAGD in your phone's settings";
}

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

  /*
   * Resolved once on mount rather than at the moment of failure, because the
   * hint below the switch needs it too and that renders without anybody
   * touching anything. Null until it settles, and null is a safe value — every
   * caller falls back to the neutral sentence.
   */
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const p = await nativePlatform();
      if (!cancelled) setPlatform(p);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function change(next: boolean) {
    setOn(next);
    startTransition(() => {
      void setPushEnabled(next);
    });

    setProblem(null);
    if (!next || registered) return;

    /* No token yet. Ask — this is the one place left that can, once the
       soft-ask budget is spent. */
    /* The tap-handler argument is gone — it used to be `() => {}` here, which
       silently replaced the shell's navigator for the rest of the session. */
    const outcome = await registerForPush(
      async (token, platform) => {
        const supabase = createClient();
        await supabase.rpc("register_push_token", {
          _token: token,
          _platform: platform,
        });
        setRegistered(true);
      },
      { prompt: true }
    );

    /*
     * Say what happened. Every one of these used to be silence, and silence is
     * how a shell with no push entitlement looked identical to a working one
     * for weeks.
     */
    if (outcome === "denied") {
      setProblem(
        `Notifications are turned off for EDIAGD in this phone's settings. ` +
          `${settingsPath(platform)}, and this will start working straight away.`
      );
    } else if (outcome === "no_token") {
      /*
       * "device token" and "push entitlement" were in this sentence and are
       * gone. It is read by a service advisor on their own profile screen, and
       * neither phrase tells them anything they can act on. The one thing they
       * CAN do is try again, so that is what it says.
       *
       * Nothing diagnostic is lost: the three outcomes still produce three
       * different sentences, and the failed: branch below still carries the
       * provider's own words verbatim.
       */
      setProblem(
        "This phone didn't finish setting up reminders. Check your connection " +
          "and try the switch again."
      );
    } else if (typeof outcome === "string" && outcome.startsWith("failed:")) {
      setProblem(
        `This phone refused to register for reminders — ${outcome.slice(8)}`
      );
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
          already dealt with.

          This read "This iPhone" until t68. It is JSX text rather than a
          quoted string, which is why the first sweep for OS names in this file
          missed it — a grep over string literals is not a grep over copy. */}
      {!registered && !on && (
        <p className="mt-3 text-xs leading-relaxed text-navy/60">
          This phone isn&rsquo;t set up for reminders yet. Turn the switch on and
          allow the prompt.
        </p>
      )}
    </div>
  );
}
