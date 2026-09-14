"use client";

import { useState, useTransition } from "react";
import { saveFoundingClass } from "@/app/(app)/admin/settings/actions";

/**
 * The Founding Class cutoff.
 *
 * Sits beside the minimum content bar because they are the two settings that
 * change what the certification programme IS rather than what it pays — and
 * both are Mitch's judgement rather than an engineering number.
 *
 * NO "MARK THIS ADVISOR" CONTROL, here or anywhere. Founding Class is derived
 * from a date, like every other credential state, so the only thing an admin
 * can do is choose the date. See 0119.
 */
export function FoundingClassForm({
  initial,
  markedNow,
}: {
  /** game_settings.founding_class_through, or null. */
  initial: string | null;
  /** How many credentials currently carry the mark. */
  markedNow: number;
}) {
  const [value, setValue] = useState(initial ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setMsg(null);
    setErr(null);
    start(async () => {
      const result = await saveFoundingClass(value.trim() === "" ? null : value.trim());
      if (!result.ok) return setErr(result.error);
      setMsg(
        result.through
          ? `Saved and applied — ${result.marked} credential${result.marked === 1 ? "" : "s"} now marked Founding Class.`
          : "Cleared — nobody is Founding Class."
      );
    });
  }

  return (
    <section className="mt-6 rounded-card border border-line bg-surface-card p-5">
      <h2 className="ediagd-eyebrow">Founding Class</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Credentials earned on or before this date carry the Founding Class mark on
        the certificate and the verify page. Leave it empty and nobody is marked.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="rounded-input border border-line bg-white px-3 py-2 text-base text-navy"
          aria-label="Founding Class cutoff date"
        />
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-pill bg-gold px-4 py-2 text-sm font-extrabold text-navy disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {value !== "" && (
          <button
            type="button"
            onClick={() => setValue("")}
            className="text-sm font-bold text-ink-soft underline"
          >
            Clear
          </button>
        )}
      </div>

      {/*
        APPLIED ON SAVE, and the message says how many — rather than the
        content bar's "does not take effect until you recompute". A saved
        setting that has not been applied is a screen disagreeing with the data,
        which is the bug this whole phase started from.
      */}
      <p className="mt-2 text-xs text-ink-soft">
        Applied immediately when saved. Changing the date re-derives the mark for
        everyone, in both directions — moving it earlier un-marks people.
      </p>

      {msg && <p className="mt-2 text-sm font-bold text-palm">{msg}</p>}
      {err && <p className="mt-2 text-sm font-bold text-clay">{err}</p>}
      {!msg && !err && (
        <p className="mt-2 text-sm text-ink-soft">
          {markedNow === 0
            ? "Nobody is Founding Class yet."
            : `${markedNow} credential${markedNow === 1 ? "" : "s"} currently marked.`}
        </p>
      )}
    </section>
  );
}

export default FoundingClassForm;
