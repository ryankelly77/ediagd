/* ============================================================================
   EDIAGD — Rollcall: the rollout-day list, now with what people actually did

   Was components/admin/OnboardingStatus.tsx. Renamed on Ryan's 6 October ask,
   which widened the question from "is everyone set up" to the six facts he
   listed: installed, password set, onboarded, mornings, Certs and tracks
   opened, lessons finished outside the morning.

   READ-ONLY. No buttons, no forms, no actions file. Fixing any of this means
   linking an operator, inviting somebody, or an advisor confirming their own
   week — all of which happen somewhere else, by somebody with the standing to
   do them. A "link operator" control here would be a second write path into
   membership that skips every screen built to guard it.

   THE COUNTS ARE THE POINT. The header line is numbers going up on rollout
   week, because a list you can only judge by scrolling it is not a status.

   AMBER IS A QUESTION, NOT A VERDICT. A two-day part-timer is a real person at
   a real dealership. The flag line asks somebody to look; nothing about the row
   is disabled, excluded from the count, or coloured as an error.

   ---------------------------------------------------------------------------
   TWO BLOCKS PER PERSON, AND THE SPLIT IS THE ARGUMENT
   ---------------------------------------------------------------------------
   SET UP first, then DID. They are different questions with different
   remedies: a missing operator is somebody's job this afternoon, and "opened
   Certs once on the 6th and not since" is a conversation. Interleaving them
   would make a row of twelve fields with no shape, and the eye could not run
   down a column.

   ---------------------------------------------------------------------------
   "INSTALLED" IS LABELLED FOR WHAT IT MEASURES
   ---------------------------------------------------------------------------
   The app cannot see a TestFlight install — that is per tester in App Store
   Connect. What it can see is the shell a session ran in, so the field is
   headed "First iOS/Android sign-in" and the note under the header says where
   the real install record lives. A column headed "Installed" over a sign-in
   date would be this project's most-repeated mistake: a label with something
   else behind it.
   ============================================================================ */

import { Card } from "@/components/brand/Card";
import { flagLine } from "@/lib/schedule-flags";
import {
  loopCompletionMismatches,
  type LastPush,
  type Reachability,
  type RollcallRow,
  type Rollcall,
  type Tally,
} from "@/lib/rollcall";

/** "12 Mar" — a date somebody reads across a row, not a timestamp. */
function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
}

/** "4 · last 8 Oct", or "Never". */
function tallyLine(t: Tally): string {
  if (t.count === 0) return "Never";
  return t.lastOn ? `${t.count} · last ${shortDate(t.lastOn)}` : String(t.count);
}

const PLATFORM_LABEL = { ios: "iOS", android: "Android", web: "Web" } as const;

/**
 * "Yes · iOS, 12 Oct", or why not.
 *
 * ---------------------------------------------------------------------------
 * THE TWO WAYS OF BEING UNREACHABLE ARE DIFFERENT PROBLEMS
 * ---------------------------------------------------------------------------
 * "never registered" is somebody who has not been asked for notification
 * permission, or who declined — a conversation. "token retired" is somebody
 * whose phone Apple has told us is gone, usually a reinstall — they need to
 * open the app again. A plain "No" would send whoever reads this screen after
 * the wrong one, so the reason is on the value and not in a footnote.
 *
 * `reach` null means the view returned no row, which happens only when nobody
 * has ever registered a device for them. That is a fact and is rendered as
 * "No", not as a dash: a dash says "we do not know", and here we do.
 */
function reachableLine(reach: Reachability | null): string {
  if (!reach || (!reach.reachable && reach.retiredTokens === 0)) {
    return "No — never registered";
  }
  if (!reach.reachable) {
    return `No — ${reach.retiredTokens === 1 ? "token" : "all tokens"} retired${
      reach.lastRetiredReason ? `: ${reach.lastRetiredReason}` : ""
    }`;
  }
  const platforms = reach.livePlatforms.map((p) => PLATFORM_LABEL[p]).join(" · ");
  return `Yes · ${platforms || "platform unrecorded"}${
    reach.firstRegisteredOn ? `, ${shortDate(reach.firstRegisteredOn)}` : ""
  }`;
}

/** "52 min", "3 h 10 min", "2 d 4 h". */
function gapLabel(mins: number): string {
  if (mins < 90) return `${mins} min`;
  if (mins < 60 * 48) return `${Math.floor(mins / 60)} h ${mins % 60} min`;
  return `${Math.floor(mins / 1440)} d ${Math.floor((mins % 1440) / 60)} h`;
}

/**
 * "return 15 Oct · back in 52 min", or what happened instead.
 *
 * THE FAILURE CASE IS NAMED WITH APPLE'S OWN WORD. "failed" alone would send
 * somebody looking at the app; "failed: BadDeviceToken" points at the device,
 * and "failed: TooManyProviderTokenUpdates" points at us. Apple already
 * distinguishes them and throwing that away would be a choice to know less.
 *
 * "no return yet" rather than "no return": the window is 24 hours and a push
 * sent an hour ago has not failed to bring anybody back. The word `yet` is
 * doing real work — without it this column would quietly convert "too early to
 * say" into "it did not work".
 */
function lastPushLine(p: LastPush | null): string {
  if (!p) return "None sent";
  const when = shortDate(p.storeDate);
  if (!p.deliveredOk) {
    return `${p.kind} ${when} · failed: ${p.apnsReason ?? "no reason recorded"}`;
  }
  if (p.returnGapMinutes === null) {
    return `${p.kind} ${when} · no return yet`;
  }
  /* Delivered, and something happened — but outside 24 hours, so it is shown
     as the gap it was rather than counted as a return. The number is the
     honest thing to print; the band is the judgement and it stays in `returned`. */
  const gap = gapLabel(p.returnGapMinutes);
  return `${p.kind} ${when} · back in ${gap}${p.returned ? "" : " (over 24 h)"}`;
}

export type RooftopChip = { id: string; name: string; accounts: number; href: string };

export function RollcallSection({
  rollcall,
  showRooftop = false,
  chips = [],
  chipsHidden = 0,
  allHref,
}: {
  rollcall: Rollcall;
  /** Group scope shows which store each person is at; a rooftop page does not. */
  showRooftop?: boolean;
  /**
   * The rooftop filter. Built by the page so the other query parameters — the
   * search, the band, the two "show more" cursors — survive a chip tap.
   * Already filtered to stores with accounts, and capped.
   */
  chips?: RooftopChip[];
  /** How many provisioned rooftops the cap left off. Stated, never swallowed. */
  chipsHidden?: number;
  allHref?: string;
}) {
  /* An empty list is only nothing to say when there is no roster either. A
     rooftop with a hundred measured advisors and no accounts is the most
     important state this section has — it is every store before rollout day. */
  if (rollcall.total === 0 && rollcall.rosterSeats === 0) return null;

  const notReady = rollcall.total - rollcall.ready;
  const flagged = rollcall.rows.filter((r) => r.flags.length > 0).length;
  const unprovisioned = Math.max(0, rollcall.rosterSeats - rollcall.total);
  const unattributed = rollcall.rows.reduce((s, r) => s + r.lessonsUnattributed.count, 0);
  const mismatches = loopCompletionMismatches(rollcall);

  return (
    <section className="mt-8">
      <h2 className="px-1 text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
        Rollcall
        <span className="ml-2 text-clay">
          {rollcall.ready} of {rollcall.total} ready
        </span>
      </h2>

      {/* ---- The rooftop filter ------------------------------------------
          ONLY STORES WITH ACCOUNTS, and at most a handful. This screen's own
          header says it must read the same for a dealer admin with one
          rooftop and a platform owner with hundreds — and the first build of
          this chipped every rooftop in scope, which on the demo data was a
          hundred chips and eight thousand pixels above the actual roll.
          Ordered accounts-descending by loadRollcall, so the store being
          rolled out leads without anybody hard-coding its name. */}
      {chips.length > 0 && allHref && (
        <div className="mt-3 flex flex-wrap items-baseline gap-2 px-1">
          <Chip href={allHref} label="All rooftops" active={rollcall.rooftopId === null} />
          {chips.map((c) => (
            <Chip
              key={c.id}
              href={c.href}
              label={`${c.name} (${c.accounts})`}
              active={rollcall.rooftopId === c.id}
            />
          ))}
          {chipsHidden > 0 && (
            /* Said, not swallowed. A chip row that quietly stopped at eight
               would read as "these are the provisioned stores". */
            <span className="text-xs text-ink-soft">
              +{chipsHidden} more provisioned{" "}
              {chipsHidden === 1 ? "rooftop" : "rooftops"} not shown — All
              rooftops covers them.
            </span>
          )}
        </div>
      )}

      {/* ---- The four numbers Ryan asked for, in one line ----------------
          Installed, onboarded, completed today — above the per-person list,
          because on rollout week this is the thing being watched and the list
          is where you go when one of them is lower than expected. */}
      <p className="mt-3 px-1 text-base font-extrabold text-navy">
        {rollcall.total.toLocaleString()} {rollcall.total === 1 ? "account" : "accounts"}
        <span className="text-ink-soft"> · </span>
        {rollcall.nativeInstalled.toLocaleString()} signed in from a phone
        <span className="text-ink-soft"> · </span>
        {rollcall.onboarded.toLocaleString()} onboarded
        {rollcall.today && (
          <>
            <span className="text-ink-soft"> · </span>
            {rollcall.completedToday.toLocaleString()} completed today
          </>
        )}
      </p>

      {/* The "completed today" count needs ONE store's calendar. Across
          several rooftops there is no single today, and quietly reporting a
          Hawaii store against a Texas date is the kind of confident wrong
          answer that reads as a finding. So it is absent rather than guessed,
          and this line says why. */}
      {!rollcall.today && rollcall.rooftops.filter((r) => r.accounts > 0).length > 1 && (
        <p className="mt-1 px-1 text-xs leading-relaxed text-ink-soft">
          Pick a rooftop to get a &ldquo;completed today&rdquo; count — across
          stores in different timezones there is no single today to count
          against.
        </p>
      )}

      {/* ---- THE NUMBER THAT ACTUALLY MEASURES ROLLOUT -------------------
          "3 of 3 ready" is true and reads like the job is done. It counts
          memberships, and the roster it is drawn from is a hundred people
          whose work the app is already measuring — so on its own that heading
          turns a 97% shortfall into a green tick. */}
      {rollcall.rosterSeats > 0 && (
        <p className="mt-1 px-1 text-sm text-ink-soft">
          {rollcall.rosterSeats.toLocaleString()} advisors measured in the DMS
          {rollcall.rosterRooftops > 1 && <> across {rollcall.rosterRooftops} rooftops</>}
        </p>
      )}

      {unprovisioned > 0 && (
        <p className="mt-1 max-w-prose px-1 text-sm leading-relaxed text-clay">
          <span className="font-bold">
            {unprovisioned.toLocaleString()} {unprovisioned === 1 ? "has" : "have"} no
            account yet.
          </span>{" "}
          The DMS is measuring their work and the app has never been able to
          reach them. Everything below is about the {rollcall.total}{" "}
          {rollcall.total === 1 ? "person who does" : "people who do"} have one.
        </p>
      )}

      {/* ---- The closure calendar, one line per rooftop -------------------
          A store whose calendar nobody has ruled on looks completely normal
          until the first holiday, when every advisor who was not at work gets
          charged a missed day. There is nothing on the advisor list that could
          show that, because it is not a fact about an advisor. */}
      {rollcall.closureCalendars.length > 0 && (
        <div className="mt-4 rounded-xl border border-line bg-cream-card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
            Closure calendar
          </p>
          <ul className="mt-2 space-y-1">
            {rollcall.closureCalendars.map((c) => (
              <li
                key={c.rooftopId}
                className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
              >
                <span className="font-bold text-navy">{c.rooftopName}</span>
                <span className={c.settled ? "text-ink-soft" : "font-bold text-clay"}>
                  {c.settled
                    ? "confirmed through year-end"
                    : c.openProposals > 0
                      ? `${c.openProposals} still to rule`
                      : "not set up"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rollcall.total === 0 ? (
        <p className="mt-3 px-1 text-sm leading-relaxed text-ink-soft">
          Nobody has been provisioned yet, so there is nothing to check the setup
          of. Ready will mean two things when there is: a confirmed work
          schedule, and a linked operator number.
        </p>
      ) : (
        <p className="mt-3 max-w-prose px-1 text-sm leading-relaxed text-ink-soft">
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
      )}

      {/* ---- What the activity half can and cannot say -------------------
          Both caveats, before the numbers rather than after them: a scoped
          measurement reported as a general one is a confident wrong answer. */}
      <p className="mt-2 max-w-prose px-1 text-xs leading-relaxed text-ink-soft">
        {rollcall.recordingSince ? (
          <>
            Taps and completions have only been recorded since{" "}
            {shortDate(rollcall.recordingSince)}. A zero in the activity half
            means &ldquo;nothing recorded since then&rdquo;, not
            &ldquo;never&rdquo;.
          </>
        ) : (
          <>
            No taps or completions have been recorded for anybody in scope yet,
            so every number in the activity half is a zero about an empty
            record rather than about a person.
          </>
        )}{" "}
        And the app cannot see a TestFlight install — App Store Connect shows
        Invited / Installed / last session per tester. The first sign-in from a
        phone build is the nearest thing the app itself can observe.
      </p>

      {/* daily_activity stopped being written on 31 July and only started again
          when the live writer shipped. A dash in First login is therefore "we
          have no record", not "they have never signed in" — and an admin acting
          on the second reading would go and chase somebody who is fine. */}
      {rollcall.rows.some((r) => !r.firstLoginOn) && (
        <p className="mt-2 max-w-prose px-1 text-xs leading-relaxed text-ink-soft">
          A dash under Password set means we have no record of a first sign-in,
          not that they never signed in — logins were not being written for part
          of August.
        </p>
      )}

      {/* ---- PUSHES, for the rooftop and the period ----------------------
          Ryan, 14 October: "I need to make sure the push notifications are
          going out and if it is working to get users back in."

          THE PERIOD IS STATED ON THE LINE. A count over "the period" with no
          period named is a scoped measurement reported as a general one, and
          a reader would take it for all time.

          THE THREE WORDS ARE DEFINED HERE because they are not the same
          number: sent is messages we attempted, delivered is messages Apple
          accepted, back is delivered messages followed by a sign-in, an
          activity row or a completion inside 24 hours. Adding them would
          answer the question optimistically, which is the direction a false
          pass always takes. */}
      <PushesLine rollcall={rollcall} />

      {/* ---- The two things that would mean these numbers are wrong ------
          Printed only when non-zero, and loud when they are. Both should be
          impossible; "should be impossible" is why they are printed rather
          than assumed. */}
      {unattributed > 0 && (
        <p className="mt-2 max-w-prose px-1 text-xs font-bold leading-relaxed text-clay">
          {unattributed} lesson {unattributed === 1 ? "completion" : "completions"} were
          recorded without saying which surface finished them, so they are in
          neither column. Something is writing lesson_completed without a
          source.
        </p>
      )}
      {mismatches.length > 0 && (
        <p className="mt-2 max-w-prose px-1 text-xs font-bold leading-relaxed text-clay">
          {mismatches.length}{" "}
          {mismatches.length === 1 ? "advisor has" : "advisors have"} more
          in-morning lesson events than completed mornings, which cannot
          happen — a morning serves at most one item. The activity numbers
          below are not trustworthy until that is explained.
        </p>
      )}

      <div className="mt-3 space-y-2">
        {rollcall.rows.map((row) => (
          <Row key={`${row.userId}:${row.rooftopId}`} row={row} showRooftop={showRooftop} />
        ))}
      </div>
    </section>
  );
}

/**
 * The push line. One sentence of counts, then the caveats that make them
 * readable — and the caveats are not optional furniture.
 *
 * ZERO IS THE INTERESTING CASE AND IT IS NOT SILENT. On rollout week this line
 * reads "0 sent", and "0 sent" has two completely different causes: nobody was
 * eligible, or nobody was reachable. A line that printed only the counts would
 * send somebody looking for a bug in the generator when the answer is that no
 * advisor has allowed notifications. So when there is nothing to report, this
 * says WHY there is nothing to report.
 */
function PushesLine({ rollcall }: { rollcall: Rollcall }) {
  const p = rollcall.pushes;
  const reachable = rollcall.total - rollcall.unreachable;

  return (
    <div className="mt-4 rounded-xl border border-line bg-cream-card p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
        Pushes · last {p.days} days
      </p>

      <p className="mt-1 text-base font-extrabold text-navy">
        {p.sent.toLocaleString()} sent
        <span className="text-ink-soft"> · </span>
        {p.delivered.toLocaleString()} delivered
        <span className="text-ink-soft"> · </span>
        {p.returned.toLocaleString()} back within 24 h
        {p.rate !== null && (
          <>
            <span className="text-ink-soft"> · </span>
            {Math.round(p.rate * 100)}% return rate
          </>
        )}
      </p>

      {/* The denominator, said out loud. A percentage with no stated base is a
          number somebody will quote at a dealer. */}
      {p.rate !== null && (
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          {p.returned} of {p.delivered} delivered{" "}
          {p.delivered === 1 ? "message was" : "messages were"} followed by a
          sign-in, an activity record or a completed morning within 24 hours.
          {p.firstOn && p.lastOn && (
            <>
              {" "}
              Sends run {shortDate(p.firstOn)}
              {p.firstOn !== p.lastOn && <> to {shortDate(p.lastOn)}</>}.
            </>
          )}
        </p>
      )}

      {/* NO RATE RATHER THAN 0%. 0/0 is not 0%, and "0% return rate" on a
          rollout week would read as "we asked them and they ignored us". */}
      {p.rate === null && (
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-ink-soft">
          {p.sent === 0 ? (
            <>
              Nothing has been sent, so there is no return rate — 0 of 0 is not
              0%.{" "}
              {rollcall.unreachable === rollcall.total && rollcall.total > 0 ? (
                <span className="font-bold text-clay">
                  No advisor here has a device registered, so the generator never
                  queues one: a push needs somewhere to go before anything else
                  about it matters.
                </span>
              ) : (
                <>
                  {reachable} of {rollcall.total} can be reached. A push is only
                  queued for somebody who is scheduled, not yet done for the day,
                  and lapsed or streaking — so a quiet period is the expected
                  state and not a fault.
                </>
              )}
            </>
          ) : (
            <>
              {p.sent} {p.sent === 1 ? "message was" : "messages were"} attempted
              and Apple accepted none of them, so there is no return rate to
              report. The failures are on the rows below with Apple&apos;s own
              reason.
            </>
          )}
        </p>
      )}

      {p.failedDeliveries > 0 && (
        <p className="mt-1 text-xs font-bold leading-relaxed text-clay">
          {p.failedDeliveries} device{" "}
          {p.failedDeliveries === 1 ? "delivery" : "deliveries"} refused by
          Apple. A person carrying two handsets can have one refused and still
          have received the push — the reason is on their row.
        </p>
      )}

      {/* The caveat that stops this being over-read. All three return records
          are per-day, so a null return is "no first touch of a store-day after
          the push", never "never opened the app". */}
      {p.delivered > 0 && (
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-ink-soft">
          &ldquo;Back&rdquo; is the first sign-in, activity record or completed
          morning after the delivery. All three are recorded once per store-day,
          so somebody who had already opened the app that morning writes no new
          row and reads as no return — this number never overstates returns and
          can understate them.
        </p>
      )}
    </div>
  );
}

function Chip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <a
      href={href}
      className={`rounded-pill px-3 py-1 text-xs font-extrabold ${
        active
          ? "bg-navy text-cream"
          : "border border-line bg-cream-card text-ink-soft"
      }`}
    >
      {label}
    </a>
  );
}

function Row({ row, showRooftop }: { row: RollcallRow; showRooftop: boolean }) {
  const line = flagLine(row.flags);
  /* "iOS", "iOS · Web". The platforms a session has actually arrived from —
     said plainly, because "signed in from a phone" with nothing naming which
     phone is a claim somebody would have to go and check. */
  const platformLabel = row.platforms
    .map((p) => (p === "ios" ? "iOS" : p === "android" ? "Android" : "Web"))
    .join(" · ");

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-base font-extrabold text-navy">{row.name}</p>
        {showRooftop && <p className="text-xs text-ink-soft">{row.rooftopName}</p>}
        {platformLabel && (
          <span className="rounded-pill border border-line px-2 py-0.5 text-xs font-bold text-ink-soft">
            {platformLabel}
          </span>
        )}
        <span
          className={`ml-auto rounded-pill px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide ${
            row.ready ? "bg-teal-soft/50 text-navy" : "border border-clay text-clay"
          }`}
        >
          {row.ready ? "Ready" : "Not ready"}
        </span>
      </div>

      {/* ---- Set up ---------------------------------------------------- */}
      {/* Every field on one grid so the eye can run down a column across rows —
          the missing ones are the shape of the work. */}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        {/* "Account made", not "Invited". The column is app_user.created_at,
            and for accounts that predate the current data it is the day the ROW
            was written — Ryan's reads 2 Aug against a first login of 6 Jul.
            Labelling that "invited" would have an admin reading a broken
            timeline instead of an accurate one about a different fact. */}
        <Field label="Account made" value={shortDate(row.invitedOn)} />
        {/* "Password set" is Ryan's wording for this, and first-sign-in is the
            honest reading of it: the invite link sets the password and signs
            you in, so the two happen within a minute of each other. What the
            app records is the sign-in, and that is what the value is. */}
        <Field
          label="Password set"
          value={shortDate(row.firstLoginOn)}
          missing={!row.firstLoginOn}
        />
        <Field
          label="Onboarded"
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
        {/* NOT "Installed". This is the first sign-in from a native build, and
            the install record is App Store Connect's. */}
        <Field
          label={
            row.firstNativePlatform === "android"
              ? "First Android sign-in"
              : "First iOS sign-in"
          }
          value={shortDate(row.firstNativeSignInOn)}
        />
      </dl>

      {/* ---- Did ------------------------------------------------------- */}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-sm sm:grid-cols-3">
        <Field
          label="Mornings done"
          value={
            row.completionCount === 0
              ? "Never"
              : `${row.completionCount} · last ${shortDate(row.lastCompletionOn)}`
          }
        />
        <Field label="Certs opened" value={tallyLine(row.certsOpened)} />
        <Field label="Tracks opened" value={tallyLine(row.tracksOpened)} />
        <Field label="Library opened" value={tallyLine(row.libraryOpened)} />
        <Field label="Lessons opened" value={tallyLine(row.lessonsOpened)} />
        {/* Ryan's sixth question. "Outside the morning" is the library deck and
            the family card — both of them are lessons somebody chose to do. */}
        <Field
          label="Lessons outside the morning"
          value={tallyLine(row.lessonsOutsideLoop)}
        />
        {/* ---- The two push columns, Ryan's 14 October ask ---------------
            REACHABLE COMES FIRST, because it is the question that decides
            whether the second one means anything. "No push arrived" and "no
            push was ever possible" are different sentences, and reading the
            second as the first is how somebody ends up debugging a generator
            that is working.

            The missing styling is on Reachable and NOT on Last push: no device
            is somebody's job this week, whereas "None sent" is often the
            correct and expected state for a reachable advisor who is neither
            lapsed nor streaking. Colouring the second would make the loop
            working look like a fault. */}
        <Field
          label="Reachable"
          value={reachableLine(row.reach)}
          missing={!row.reach?.reachable}
          wrap
        />
        <Field label="Last push" value={lastPushLine(row.lastPush)} wrap />
      </dl>

      {/* The tracks behind the count, where they still resolve. A shorter list
          than the count is a renamed or retired certification, not a miscount —
          the number comes from the event, never from this list. */}
      {row.trackNames.length > 0 && (
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          <span className="font-bold">Tracks:</span> {row.trackNames.join(", ")}
        </p>
      )}

      {row.storiesSubmitted.count > 0 && (
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          <span className="font-bold">Good News Stories:</span>{" "}
          {tallyLine(row.storiesSubmitted)}
        </p>
      )}

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
  wrap = false,
}: {
  label: string;
  value: string;
  missing?: boolean;
  /**
   * Let the value run onto a second line instead of being clipped.
   *
   * ---------------------------------------------------------------------------
   * TRUNCATION IS FINE FOR A DATE AND WRONG FOR A REASON
   * ---------------------------------------------------------------------------
   * Every original field on this grid is a date or a word — "12 Oct", "Linked",
   * "Never" — and `truncate` never bites. The two push fields carry sentences
   * whose END is the informative part: "No — token retired: Unregistered" and
   * "return 15 Oct · back in 52 min". Clipped at phone width those become "No —
   * token retir…" and "return 15 Oct · ba…", which is a label with its evidence
   * cut off — and on a two-column mobile grid it would ALWAYS bite, so the
   * screen would be wrong on the device it is most read on.
   */
  wrap?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase tracking-wide text-ink-soft">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-sm ${wrap ? "break-words" : "truncate"} ${
          missing ? "font-bold text-clay" : "text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
