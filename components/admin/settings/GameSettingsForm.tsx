"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/brand/Card";
import { saveGameSettings } from "@/app/(app)/admin/settings/actions";
import {
  REWARD_FIELDS,
  STREAK_FIELDS,
  validateGameSettings,
  type GameSettingField,
  type GameSettingKey,
  type GameSettingsValues,
} from "@/lib/game-settings";

/**
 * Editor for the single game_settings row. Validates client-side for a fast
 * response, but the server action validates again — the client's word is never
 * trusted for values that mint currency.
 */
export function GameSettingsForm({ initial }: { initial: GameSettingsValues }) {
  const [values, setValues] = useState<GameSettingsValues>(initial);
  const [saved, setSaved] = useState<GameSettingsValues | null>(initial);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<GameSettingKey, string>>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty =
    saved === null ||
    (Object.keys(values) as GameSettingKey[]).some((k) => values[k] !== saved[k]);

  function set(key: GameSettingKey, raw: string) {
    setJustSaved(false);
    setValues((v) => ({
      ...v,
      // Keep NaN out of state: an empty box reads as 0 until they type.
      [key]: raw === "" ? 0 : Number(raw),
    }));
  }

  function handleSave() {
    setError(null);
    const { fieldErrors: local } = validateGameSettings(values);
    setFieldErrors(local);
    if (Object.keys(local).length > 0) {
      setError("Please fix the highlighted fields.");
      return;
    }

    startTransition(async () => {
      const result = await saveGameSettings(values);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(
          (result.fieldErrors ?? {}) as Partial<Record<GameSettingKey, string>>
        );
        return;
      }
      setValues(result.values);
      setSaved(result.values);
      setFieldErrors({});
      setJustSaved(true);
    });
  }

  return (
    <div className="mt-4 space-y-4">
      <Group title="Streak protection" fields={STREAK_FIELDS}>
        {STREAK_FIELDS.map((field) => (
          <Field
            key={field.key}
            field={field}
            value={values[field.key]}
            error={fieldErrors[field.key]}
            onChange={(raw) => set(field.key, raw)}
          />
        ))}
      </Group>

      <Group title="Sand Dollar rewards" fields={REWARD_FIELDS}>
        {REWARD_FIELDS.map((field) => (
          <Field
            key={field.key}
            field={field}
            value={values[field.key]}
            error={fieldErrors[field.key]}
            onChange={(raw) => set(field.key, raw)}
          />
        ))}
      </Group>

      {error && (
        <p className="rounded-xl border border-line bg-cream-card px-4 py-3 text-sm font-bold text-clay">
          {error}
        </p>
      )}
      {justSaved && !error && (
        <p className="rounded-xl border border-line bg-cream-card px-4 py-3 text-sm font-bold text-palm">
          Saved. New amounts apply to the next completed day.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          disabled={pending || !dirty}
          className="rounded-xl bg-gold px-5 py-3 font-extrabold text-navy transition hover:brightness-95 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>

        {dirty && !pending && (
          <button
            onClick={() => {
              if (saved) setValues(saved);
              setFieldErrors({});
              setError(null);
            }}
            className="rounded-xl border border-line px-4 py-3 font-bold text-navy transition hover:bg-teal-soft/20"
          >
            Discard changes
          </button>
        )}

        {!dirty && !pending && (
          <span className="text-sm font-semibold text-ink-soft">
            No unsaved changes
          </span>
        )}
      </div>
    </div>
  );
}

function Group({
  title,
  fields,
  children,
}: {
  title: string;
  fields: GameSettingField[];
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-ink-soft">
        {title}
      </h2>
      <p className="mt-0.5 text-xs text-ink-soft">
        {fields.length} {fields.length === 1 ? "setting" : "settings"}
      </p>
      <div className="mt-4 space-y-4">{children}</div>
    </Card>
  );
}

function Field({
  field,
  value,
  error,
  onChange,
}: {
  field: GameSettingField;
  value: number;
  error?: string;
  onChange: (raw: string) => void;
}) {
  return (
    <label className="block sm:flex sm:items-start sm:gap-4">
      <span className="sm:flex-1">
        <span className="block text-sm font-bold text-navy">{field.label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
          {field.hint}
        </span>
      </span>

      <span className="mt-2 block sm:mt-0 sm:w-32">
        <input
          type="number"
          inputMode="numeric"
          step={1}
          min={field.min}
          max={field.max}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          className={`w-full rounded-xl border bg-cream-card p-3 text-right font-extrabold text-navy outline-none focus:ring-2 focus:ring-gold ${
            error ? "border-clay" : "border-line"
          }`}
        />
        {error && (
          <span className="mt-1 block text-xs font-bold text-clay">{error}</span>
        )}
      </span>
    </label>
  );
}

export default GameSettingsForm;
