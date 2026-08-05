"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/brand/Card";
import {
  updateDisplayName,
  updateEmail,
  updatePassword,
} from "@/app/(app)/profile/actions";
import { NAME_MAX, PASSWORD_MIN, type ProfileResult } from "@/lib/profile";

/**
 * Account management: name, email, password.
 *
 * Three independent sections with their own save buttons and their own
 * feedback — changing your name shouldn't require touching your password, and
 * a failure in one shouldn't blank the others.
 *
 * Errors use clay, never red (brand rule). Every write is validated again
 * server-side; the checks here are only for a fast response.
 */
export function AccountForms({
  initialName,
  currentEmail,
}: {
  initialName: string;
  currentEmail: string;
}) {
  return (
    <>
      <h2 className="ediagd-eyebrow mt-8 px-1">Your details</h2>
      <NameSection initialName={initialName} />
      <EmailSection currentEmail={currentEmail} />

      <h2 className="ediagd-eyebrow mt-8 px-1">Password</h2>
      <PasswordSection />
    </>
  );
}

/* ---- Name ---------------------------------------------------------------- */

function NameSection({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saved, setSaved] = useState(initialName);
  const [result, setResult] = useState<ProfileResult | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = name.trim() !== saved.trim();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const response = await updateDisplayName(name);
      setResult(response);
      if (response.ok) {
        setSaved(name.trim());
        // The header greeting and avatar initials read this — refresh the shell.
        router.refresh();
      }
    });
  }

  return (
    <Card className="mt-2 p-5">
      <form onSubmit={submit}>
        <Field label="Display name" hint="How your name appears to your team.">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX}
            autoComplete="name"
            className={inputClass}
          />
        </Field>

        <Feedback result={result} />

        <button
          type="submit"
          disabled={pending || !dirty}
          className={saveButtonClass}
        >
          {pending ? "Saving…" : "Save name"}
        </button>
      </form>
    </Card>
  );
}

/* ---- Email --------------------------------------------------------------- */

function EmailSection({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState(currentEmail);
  const [result, setResult] = useState<ProfileResult | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = email.trim().toLowerCase() !== currentEmail.toLowerCase();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      setResult(await updateEmail(email));
    });
  }

  return (
    <Card className="mt-3 p-5">
      <form onSubmit={submit}>
        <Field
          label="Email address"
          hint="Used to sign in. Changing it needs confirmation from the new address."
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className={inputClass}
          />
        </Field>

        <Feedback result={result} />

        <button
          type="submit"
          disabled={pending || !dirty}
          className={saveButtonClass}
        >
          {pending ? "Sending…" : "Change email"}
        </button>
      </form>
    </Card>
  );
}

/* ---- Password ------------------------------------------------------------ */

function PasswordSection() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [result, setResult] = useState<ProfileResult | null>(null);
  const [pending, startTransition] = useTransition();

  const ready = password.length > 0 && confirmation.length > 0;
  const mismatch =
    confirmation.length > 0 && password.length > 0 && password !== confirmation;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const response = await updatePassword(password, confirmation);
      setResult(response);
      if (response.ok) {
        setPassword("");
        setConfirmation("");
      }
    });
  }

  return (
    <Card className="mt-2 p-5">
      <form onSubmit={submit}>
        <Field label="New password" hint={`At least ${PASSWORD_MIN} characters.`}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>

        <div className="mt-4">
          <Field label="Confirm new password">
            <input
              type="password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="new-password"
              aria-invalid={mismatch || undefined}
              className={`${inputClass} ${mismatch ? "border-clay" : ""}`}
            />
          </Field>
          {mismatch && (
            <p className="mt-1 text-xs font-bold text-clay">
              Those two don&apos;t match yet.
            </p>
          )}
        </div>

        <Feedback result={result} />

        <button
          type="submit"
          disabled={pending || !ready || mismatch}
          className={saveButtonClass}
        >
          {pending ? "Updating…" : "Update password"}
        </button>
      </form>
    </Card>
  );
}

/* ---- Shared -------------------------------------------------------------- */

const inputClass =
  "mt-1 w-full rounded-xl border border-line bg-cream-card p-3 text-navy outline-none focus:ring-2 focus:ring-gold";

const saveButtonClass =
  "mt-4 w-full rounded-xl bg-gold p-3.5 font-extrabold text-navy transition hover:brightness-95 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

/** Success in palm, problems in clay — never red. */
function Feedback({ result }: { result: ProfileResult | null }) {
  if (!result) return null;
  return (
    <p
      role="status"
      className={`mt-4 rounded-xl border border-line px-4 py-3 text-sm font-bold leading-relaxed ${
        result.ok ? "bg-palm-soft/30 text-palm" : "bg-cream-card text-clay"
      }`}
    >
      {result.ok ? result.message : result.error}
    </p>
  );
}

export default AccountForms;
