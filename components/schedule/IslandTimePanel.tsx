"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addIslandTime, removeIslandTime } from "@/lib/schedule-actions";
import { formatDayLabel, type IslandTimeEntry } from "@/lib/work-schedule";
import { quoteRange, quoteSentence, yearOf } from "@/lib/island-budget";
import type { IslandTime, IsoDate, WorkSchedule } from "@/lib/gamification/streak";

/* ============================================================================
   EDIAGD — Island Time
   Planned absence. Days inside a range are invisible to the Swell: they aren't
   missed days and they cost no Paddle Back Out.

   Only future ranges can be removed, and none can start in the past — see the
   server action for why. The UI mirrors those rules rather than offering
   controls that will be refused.

   ---------------------------------------------------------------------------
   THE COST IS QUOTED BEFORE THE BUTTON, NOT AFTER IT
   ---------------------------------------------------------------------------
   The days are budgeted now, and a limit an advisor meets by being refused is a
   worse limit than one they can watch as they pick the dates. So the same
   function the server enforces with runs here as they type, and the sentence
   under the pickers is the sentence the action would have used. This is a
   COURTESY, never the control: the server checks again, because a server action
   is reachable by direct POST.
   ============================================================================ */

export function IslandTimePanel({
  entries,
  today,
  schedule = null,
  cap,
  booked = [],
}: {
  entries: IslandTimeEntry[];
  today: IsoDate;
  /** Their work schedule — a day off inside a range spends no budget. */
  schedule?: WorkSchedule | null;
  /** game_settings.island_time_days_per_year. */
  cap: number;
  /** Every range on the books, including past ones: the year's budget counts
      them all, while the list above only shows what is still ahead. */
  booked?: IslandTime[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  /* Priced from the same function the action enforces with, so the preview and
     the refusal can never quote different arithmetic. Only once both ends are
     real dates — a half-typed range has no cost worth naming. */
  const quote =
    start && (end || start) >= start
      ? quoteRange(start as IsoDate, (end || start) as IsoDate, booked, schedule, cap)
      : null;

  function submit() {
    startTransition(async () => {
      const result = await addIslandTime(start, end || start, note || null);
      if (result.ok) {
        setMessage({ ok: true, text: result.message });
        setAdding(false);
        setStart("");
        setEnd("");
        setNote("");
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await removeIslandTime(id);
      setMessage(
        result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error }
      );
      if (result.ok) router.refresh();
    });
  }

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
        Island Time
      </p>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">
        Heading out? Tell us and your Swell holds. Days you&apos;re away
        don&apos;t count as missed and cost you nothing.
      </p>

      {message && (
        <p
          role="status"
          className={`mt-3 rounded-card px-4 py-3 text-sm font-bold ${
            message.ok ? "bg-palm-soft/30 text-palm" : "bg-cream-card text-clay"
          }`}
        >
          {message.text}
        </p>
      )}

      {entries.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {entries.map((entry) => {
            const running = entry.start <= today;
            return (
              <li key={entry.id} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold text-navy">
                    {formatDayLabel(entry.start, today)}
                    {entry.end !== entry.start && (
                      <> – {formatDayLabel(entry.end, today)}</>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-soft">
                    {running ? "Under way" : "Upcoming"}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </span>
                </span>

                {/* Only ranges that haven't begun. Removing one already under
                    way would turn days they were genuinely away into missed
                    days after the fact. */}
                {!running && (
                  <button
                    onClick={() => remove(entry.id)}
                    disabled={pending}
                    className="shrink-0 rounded-xl border border-line px-3 py-2 text-xs font-bold text-ink-soft transition hover:text-navy disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  >
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <div className="mt-3 rounded-card border border-line bg-cream-card p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                First day
              </span>
              <input
                type="date"
                min={today}
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className={input}
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                Last day
              </span>
              <input
                type="date"
                min={start || today}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className={input}
              />
            </label>
          </div>

          <label className="mt-3 block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
              Note (optional)
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Vacation, training, family"
              className={input}
            />
          </label>

          {/* The arithmetic, in the words the refusal would use. Amber when it
              fits, clay when it does not — and the button goes with it, so the
              only way to meet the cap is to be told before you tap. */}
          {quote && (
            <p
              className={`mt-3 text-sm font-bold ${
                quote.affordable ? "text-ink-soft" : "text-clay"
              }`}
            >
              {quote.affordable
                ? quoteSentence(quote, yearOf(today))
                : `That's more than you have left. ${quoteSentence(quote, yearOf(today))}`}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={submit}
              disabled={pending || !start || quote?.affordable === false}
              className="flex-1 rounded-xl bg-navy p-3 font-extrabold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {pending ? "Booking…" : "Book Island Time"}
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setMessage(null);
              }}
              className="rounded-xl border border-line px-4 py-3 font-bold text-navy"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => {
            setAdding(true);
            setMessage(null);
          }}
          className="mt-3 w-full rounded-xl border border-line bg-surface-card p-3 text-sm font-extrabold text-navy transition hover:bg-teal-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Add Island Time
        </button>
      )}
    </div>
  );
}

const input =
  "mt-1 w-full rounded-xl border border-line bg-surface-card p-3 text-navy outline-none focus:ring-2 focus:ring-gold";

export default IslandTimePanel;
