"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { submitFeedback } from "@/app/(app)/feedback/actions";
import { shellInfo } from "@/lib/native/bridge";

/* ============================================================================
   EDIAGD — the feedback form

   Body is the only required field. An optional screenshot, one image, 5 MB. On
   send the screen becomes a thank-you with a way back — no star rating, no
   category, nothing the product already knows asked of the advisor.

   Platform and shell version are read from the native bridge here, because only
   the shell can answer App.getInfo(); everything else the server attaches.
   ============================================================================ */

const MAX_BYTES = 5 * 1024 * 1024;

export function FeedbackForm({ from }: { from: string }) {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const backLabel = from === "/more" ? "Back to More" : "Back";

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) {
      setFileName(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("That image is over 5 MB — pick a smaller one, or send without it.");
      if (fileRef.current) fileRef.current.value = "";
      setFileName(null);
      return;
    }
    setFileName(f.name);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = (new FormData(form).get("body") as string | null)?.trim() ?? "";
    if (!body) {
      setError("Add a note so we know what happened.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData(form);
      fd.set("from", from);
      // Device context only the shell knows. Safe defaults in a browser.
      const info = await shellInfo();
      fd.set("platform", info.platform);
      if (info.version) fd.set("shellVersion", info.version);
      if (info.build) fd.set("shellBuild", info.build);
      const result = await submitFeedback(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div
        role="status"
        className="rounded-card bg-palm-soft/30 px-5 py-6 text-center"
      >
        <p className="text-lg font-extrabold text-navy">Got it. We read every one.</p>
        <Link
          href={from}
          className="mt-4 inline-flex items-center justify-center text-sm font-bold text-ocean underline underline-offset-2 transition hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          {backLabel}
        </Link>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate>
      <label htmlFor="feedback-body" className="ediagd-eyebrow">
        Tell us what happened
      </label>
      <textarea
        id="feedback-body"
        name="body"
        rows={6}
        maxLength={4000}
        placeholder="What were you doing, and what did you see?"
        onChange={() => setError(null)}
        className="mt-2 w-full rounded-card border border-line bg-surface-card p-4 text-base text-navy placeholder:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      />

      {/* ---- Optional screenshot --------------------------------------- */}
      <div className="mt-4">
        <input
          ref={fileRef}
          id="feedback-shot"
          name="screenshot"
          type="file"
          accept="image/*"
          onChange={onFileChange}
          className="hidden"
        />
        <label
          htmlFor="feedback-shot"
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface-card px-4 py-2.5 text-sm font-bold text-ocean transition hover:bg-teal-soft/10 focus-within:ring-2 focus-within:ring-gold"
        >
          {fileName ? "Change screenshot" : "Add a screenshot"}
        </label>
        {fileName && (
          <p className="mt-2 truncate text-xs text-ink-soft">{fileName}</p>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-card bg-cream-card px-4 py-3 text-sm font-bold text-clay"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-5 w-full rounded-xl bg-gold p-3.5 text-base font-extrabold text-navy transition hover:brightness-95 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
      >
        {pending ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
