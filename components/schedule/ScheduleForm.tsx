"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveWorkSchedule } from "@/lib/schedule-actions";
import {
  MON_FRI_DRAFT,
  SATURDAY_CHOICES,
  WEEKDAYS,
  formatDayLabel,
  validateDraft,
  type ScheduleDraft,
} from "@/lib/work-schedule";
import type { IsoDate, SaturdayMode } from "@/lib/gamification/streak";

/* ============================================================================
   EDIAGD — the work schedule form
   One component, two homes: the blocking first-run screen and the editable
   section in /profile. `tone` only changes the wording and the button, never
   the rules — so the two can't drift.
   ============================================================================ */

export function ScheduleForm({
  initial,
  saturdays,
  today,
  tone,
  onSaved,
  onSuccess,
  preview = false,
}: {
  initial: ScheduleDraft;
  /** Upcoming Saturdays for the alternating anchor picker. */
  saturdays: IsoDate[];
  today: IsoDate;
  tone: "onboarding" | "profile";
  /** Where to go after a successful save. Profile just refreshes. */
  onSaved?: string;
  /** Advance a flow instead of navigating. Takes precedence over onSaved, and
   *  deliberately skips router.refresh(): re-rendering /onboarding would hit
   *  its "already onboarded" redirect and skip the screens after this one. */
  onSuccess?: () => void;
  /** Preview: run every rule, write nothing. Lets an admin walk the flow
   *  repeatedly without changing their own schedule. */
  preview?: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ScheduleDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof ScheduleDraft>(k: K, v: ScheduleDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setError(null);
    setSaved(false);
  };

  function save() {
    const problem = validateDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    if (preview) {
      // Validation already ran above — this is the only thing skipped.
      setSaved(true);
      onSuccess?.();
      return;
    }
    startTransition(async () => {
      const result = await saveWorkSchedule(draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      if (onSuccess) {
        onSuccess();
        return;
      }
      if (onSaved) router.replace(onSaved);
      router.refresh();
    });
  }

  return (
    <div>
      {/* ---- The days ---------------------------------------------------- */}
      {/* Onboarding's card asks this directly above the form — repeating it
          here reads like a page nobody proofread. */}
      {tone === "profile" && (
        <p className="ediagd-eyebrow">Which days are you on the drive?</p>
      )}

      <div
        className={`grid grid-cols-3 gap-2 ${tone === "profile" ? "mt-3" : ""}`}
      >
        {WEEKDAYS.map((day) => (
          <DayToggle
            key={day.key}
            label={day.label}
            full={day.full}
            on={draft[day.key]}
            onToggle={() => set(day.key, !draft[day.key])}
          />
        ))}
      </div>

      {tone === "onboarding" && (
        <button
          type="button"
          onClick={() => {
            setDraft({ ...MON_FRI_DRAFT, saturdayMode: draft.saturdayMode, saturdayAnchor: draft.saturdayAnchor });
            setError(null);
          }}
          className="mt-2 text-xs font-bold text-ocean underline underline-offset-2 transition hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Most people work Mon–Fri — tap to fill that in
        </button>
      )}

      {/* ---- Saturday ---------------------------------------------------- */}
      <p className="ediagd-eyebrow mt-6">Saturdays</p>
      <div className="mt-2 space-y-2">
        {SATURDAY_CHOICES.map((choice) => (
          <SaturdayOption
            key={choice.value}
            label={choice.label}
            selected={draft.saturdayMode === choice.value}
            onSelect={() => {
              set("saturdayMode", choice.value as SaturdayMode);
              if (choice.value !== "alternating") set("saturdayAnchor", null);
            }}
          />
        ))}
      </div>

      {/* ---- Anchor, only when it means something ------------------------ */}
      {draft.saturdayMode === "alternating" && (
        <div className="mt-3 rounded-card border border-line bg-cream-card p-4">
          <p className="text-sm font-bold text-navy">
            Which Saturday is the next one you work?
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            We count every other week from there.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {saturdays.map((sat) => {
              const on = draft.saturdayAnchor === sat;
              return (
                <button
                  key={sat}
                  type="button"
                  onClick={() => set("saturdayAnchor", sat)}
                  aria-pressed={on}
                  className={`min-h-[2.75rem] rounded-xl border px-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                    on
                      ? "border-ocean bg-teal-soft/40 text-navy"
                      : "border-line bg-surface-card text-ink-soft hover:text-navy"
                  }`}
                >
                  {formatDayLabel(sat, today)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- Feedback ---------------------------------------------------- */}
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-card bg-cream-card px-4 py-3 text-sm font-bold text-clay"
        >
          {error}
        </p>
      )}
      {saved && !error && tone === "profile" && (
        <p
          role="status"
          className="mt-4 rounded-card bg-palm-soft/30 px-4 py-3 text-sm font-bold text-palm"
        >
          Saved. Your Swell counts these days from now on.
        </p>
      )}

      <button
        onClick={save}
        disabled={pending}
        className="mt-5 w-full rounded-xl bg-gold p-3.5 text-base font-extrabold text-navy transition hover:brightness-95 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
      >
        {pending
          ? "Saving…"
          : tone === "onboarding"
            ? "That's my week"
            : "Save schedule"}
      </button>
    </div>
  );
}

/* ---- Pieces -------------------------------------------------------------- */

function DayToggle({
  label,
  full,
  on,
  onToggle,
}: {
  label: string;
  full: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={full}
      // min-h 3rem: a thumb target, not a checkbox.
      className={`flex min-h-[3rem] items-center justify-center rounded-xl border text-base font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
        on
          ? "border-ocean bg-teal-soft/40 text-navy"
          : "border-line bg-surface-card text-ink-soft hover:text-navy"
      }`}
    >
      {label}
    </button>
  );
}

function SaturdayOption({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex min-h-[3rem] w-full items-center gap-3 rounded-xl border px-4 text-left text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
        selected
          ? "border-ocean bg-teal-soft/40 text-navy"
          : "border-line bg-surface-card text-ink-soft hover:text-navy"
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-pill border-2 ${
          selected ? "border-ocean" : "border-line"
        }`}
      >
        {selected && <span className="h-2.5 w-2.5 rounded-pill bg-ocean" />}
      </span>
      {label}
    </button>
  );
}

export default ScheduleForm;
