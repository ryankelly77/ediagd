/* ============================================================================
   EDIAGD — the rollout-day list

   READ-ONLY. No buttons, no forms, no actions file. Fixing any of this means
   linking an operator, inviting somebody, or an advisor confirming their own
   week — all of which happen somewhere else, by somebody with the standing to
   do them. A "link operator" control here would be a second write path into
   membership that skips every screen built to guard it.

   THE COUNT IS THE POINT. "52 of 63 ready" at the top, because on rollout day
   this is a number going up, and a list you can only judge by scrolling it is
   not a status.

   AMBER IS A QUESTION, NOT A VERDICT. A two-day part-timer is a real person at
   a real dealership. The flag line asks somebody to look; nothing about the row
   is disabled, excluded from the count, or coloured as an error.
   ============================================================================ */

import { Card } from "@/components/brand/Card";
import { flagLine } from "@/lib/schedule-flags";
import type { OnboardingRow, OnboardingStatus } from "@/lib/admin-onboarding";

/** "12 Mar" — a date somebody reads across a row, not a timestamp. */
function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
}

export function OnboardingStatusSection({
  status,
  showRooftop = false,
}: {
  status: OnboardingStatus;
  /** Group scope shows which store each person is at; a rooftop page does not. */
  showRooftop?: boolean;
}) {
  if (status.total === 0) return null;

  const notReady = status.total - status.ready;
  const flagged = status.rows.filter((r) => r.flags.length > 0).length;

  return (
    <section className="mt-8">
      <h2 className="px-1 text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
        Onboarding
        <span className="ml-2 text-clay">
          {status.ready} of {status.total} ready
        </span>
      </h2>

      <p className="mt-1 max-w-prose px-1 text-sm leading-relaxed text-ink-soft">
        Ready means two things: they&apos;ve confirmed a work schedule, and
        they&apos;re linked to an operator number. Without the schedule the app
        holds them at onboarding; without the operator there is no volume to
        read, so Eddie&apos;s Pick never has anything to coach them on.
        {notReady > 0 && (
          <>
            {" "}
            <span className="font-bold text-navy">
              {notReady} still {notReady === 1 ? "needs" : "need"} something.
            </span>
          </>
        )}
        {flagged > 0 && (
          <>
            {" "}
            {flagged} {flagged === 1 ? "schedule looks" : "schedules look"} unusual.
          </>
        )}
      </p>

      {/* daily_activity stopped being written on 31 July and only started again
          when the live writer shipped. A dash in First login is therefore "we
          have no record", not "they have never signed in" — and an admin acting
          on the second reading would go and chase somebody who is fine. */}
      {status.rows.some((r) => !r.firstLoginOn) && (
        <p className="mt-2 max-w-prose px-1 text-xs leading-relaxed text-ink-soft">
          A dash under First login means we have no record of one, not that they
          never signed in — logins were not being written for part of August.
        </p>
      )}

      <div className="mt-3 space-y-2">
        {status.rows.map((row) => (
          <Row key={`${row.userId}:${row.rooftopId}`} row={row} showRooftop={showRooftop} />
        ))}
      </div>
    </section>
  );
}

function Row({ row, showRooftop }: { row: OnboardingRow; showRooftop: boolean }) {
  const line = flagLine(row.flags);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-base font-extrabold text-navy">{row.name}</p>
        {showRooftop && (
          <p className="text-xs text-ink-soft">{row.rooftopName}</p>
        )}
        <span
          className={`ml-auto rounded-pill px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${
            row.ready
              ? "bg-teal-soft/50 text-navy"
              : "border border-clay text-clay"
          }`}
        >
          {row.ready ? "Ready" : "Not ready"}
        </span>
      </div>

      {/* Every field on one grid so the eye can run down a column across rows —
          the missing ones are the shape of the work. */}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        {/* "Account made", not "Invited". The column is app_user.created_at,
            and for accounts that predate the current data it is the day the ROW
            was written — Ryan's reads 2 Aug against a first login of 6 Jul.
            Labelling that "invited" would have an admin reading a broken
            timeline instead of an accurate one about a different fact. */}
        <Field label="Account made" value={shortDate(row.invitedOn)} />
        <Field
          label="First login"
          value={shortDate(row.firstLoginOn)}
          missing={!row.firstLoginOn}
        />
        <Field
          label="Schedule set"
          value={shortDate(row.scheduleSetOn)}
          missing={!row.scheduleSetOn}
        />
        <Field
          label="Work days"
          value={row.scheduleSetOn ? row.scheduleLine : "Not set yet"}
          missing={!row.scheduleSetOn}
        />
        <Field
          label="Operator"
          value={row.operatorLinked ? "Linked" : "Not linked"}
          missing={!row.operatorLinked}
        />
        <Field
          label="First day done"
          value={shortDate(row.firstCompletionOn)}
          /* NOT marked missing. Someone ready this morning has not finished a
             day yet and never should have; that is rollout working. */
        />
      </dl>

      {/* Amber, not clay. Clay is what this file uses for a field somebody has
          to go and fill in; this is a question about a field that IS filled in,
          and colouring it the same would make a legitimate part-timer look like
          an error. */}
      {line && (
        <p className="mt-3 rounded-xl bg-gold-soft/40 px-3 py-2 text-xs font-bold text-navy">
          {line}
        </p>
      )}
    </Card>
  );
}

function Field({
  label,
  value,
  missing = false,
}: {
  label: string;
  value: string;
  missing?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
        {label}
      </dt>
      <dd
        className={`mt-0.5 truncate text-sm ${
          missing ? "font-bold text-clay" : "text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
