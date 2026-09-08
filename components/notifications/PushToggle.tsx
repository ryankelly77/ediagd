"use client";

/* ============================================================================
   EDIAGD — turning the nudge off without going to Settings

   The reason this exists is the reason the soft-ask exists, run backwards.
   iOS permission is expensive to get and, once revoked in Settings, expensive
   to get back — the dialog does not return. So the in-app switch has to be the
   easy one: turning this off stops every send while the OS permission and the
   device tokens stay exactly where they are, and turning it back on is instant
   and silent.

   If the only way to stop the notification were iOS Settings, the cost of a
   single unwanted buzz would be the permission itself, permanently.

   Rendered for everybody, including browser users, deliberately. Somebody who
   set this up on their phone and later opens the app on a laptop should be able
   to turn it off from there.
   ============================================================================ */

import { useState, useTransition } from "react";
import { setPushEnabled } from "@/lib/notifications/push-actions";
import { Toggle } from "@/components/brand/Toggle";

export function PushToggle({ enabled }: { enabled: boolean }) {
  /* Optimistic: the switch moves under the thumb and the write follows. A
     preference toggle that waits for a round trip on a phone with one bar
     feels broken even when it is working. */
  const [on, setOn] = useState(enabled);
  const [, startTransition] = useTransition();

  return (
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
          setOn(next);
          startTransition(() => {
            void setPushEnabled(next);
          });
        }}
      />
    </div>
  );
}
