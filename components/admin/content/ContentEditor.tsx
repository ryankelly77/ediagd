"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/brand/Card";
import {
  deleteContent,
  saveContent,
  setContentStatus,
} from "@/app/(app)/admin/content/actions";
import {
  CONTENT_TIERS,
  CONTENT_TYPES,
  STATUS_META,
  TIER_LABEL,
  TYPE_META,
  isVideoType,
  serviceToSlug,
  type ContentDraft,
  type ContentRow,
  type ContentTier,
  type ContentType,
} from "@/lib/content";

/**
 * Add/edit form. Mutations go through server actions (which re-check admin), so
 * nothing here trusts the client — this component only collects input and
 * reports what came back.
 */
export function ContentEditor({
  item,
  services,
  defaultService,
}: {
  item: ContentRow | null;
  /** Existing service names — the datalist that stops free-text drift. */
  services: string[];
  defaultService?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [draft, setDraft] = useState<ContentDraft>({
    id: item?.id,
    type: item?.type ?? "cue",
    service_family: item?.service_family ?? defaultService ?? null,
    subcategory: item?.subcategory ?? null,
    tier: item?.tier ?? null,
    make: item?.make ?? null,
    model: item?.model ?? null,
    year_range: item?.year_range ?? null,
    title: item?.title ?? "",
    body: item?.body ?? null,
    video_url: item?.video_url ?? null,
    duration_sec: item?.duration_sec ?? null,
    status: item?.status ?? "draft",
  });

  const showVideoFields = isVideoType(draft.type);
  const showVehicleFields = draft.type === "joe_the_pro";

  function set<K extends keyof ContentDraft>(key: K, value: ContentDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await saveContent(draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      if (!draft.id) {
        router.push(`/admin/content/item/${result.id}`);
        return;
      }
      router.refresh();
    });
  }

  function handleToggleStatus() {
    if (!draft.id) return;
    const next = draft.status === "published" ? "draft" : "published";
    setError(null);
    startTransition(async () => {
      const result = await setContentStatus(draft.id!, next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      set("status", next);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!draft.id) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteContent(draft.id!);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/admin/content/service/${serviceToSlug(draft.service_family)}`);
    });
  }

  return (
    <div className="mt-4 space-y-4">
      <Card className="p-5">
        <div className="space-y-4">
          <Field label="Type">
            <select
              value={draft.type}
              onChange={(e) => set("type", e.target.value as ContentType)}
              className={inputClass}
            >
              {CONTENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_META[t].label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Service"
            hint="Pick an existing name where you can — it keeps the library tidy."
          >
            <input
              list="ediagd-services"
              value={draft.service_family ?? ""}
              onChange={(e) => set("service_family", e.target.value || null)}
              placeholder="e.g. Brake Service"
              className={inputClass}
            />
            <datalist id="ediagd-services">
              {services.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>

          <Field label="Subcategory" hint="Optional finer grouping.">
            <input
              value={draft.subcategory ?? ""}
              onChange={(e) => set("subcategory", e.target.value || null)}
              className={inputClass}
            />
          </Field>

          <Field label="Tier">
            <select
              value={draft.tier ?? ""}
              onChange={(e) =>
                set("tier", (e.target.value || null) as ContentTier | null)
              }
              className={inputClass}
            >
              <option value="">None</option>
              {CONTENT_TIERS.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Title" hint="Required.">
            <input
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label={showVideoFields ? "Notes" : "Body"}>
            <textarea
              value={draft.body ?? ""}
              onChange={(e) => set("body", e.target.value || null)}
              rows={showVideoFields ? 3 : 8}
              className={`${inputClass} leading-relaxed`}
            />
          </Field>

          {showVideoFields && (
            <>
              <Field label="Video URL">
                <input
                  value={draft.video_url ?? ""}
                  onChange={(e) => set("video_url", e.target.value || null)}
                  className={inputClass}
                />
              </Field>
              <Field label="Duration (seconds)">
                <input
                  type="number"
                  min={0}
                  value={draft.duration_sec ?? ""}
                  onChange={(e) =>
                    set(
                      "duration_sec",
                      e.target.value === "" ? null : Number(e.target.value)
                    )
                  }
                  className={inputClass}
                />
              </Field>
            </>
          )}

          {showVehicleFields && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Make">
                <input
                  value={draft.make ?? ""}
                  onChange={(e) => set("make", e.target.value || null)}
                  className={inputClass}
                />
              </Field>
              <Field label="Model">
                <input
                  value={draft.model ?? ""}
                  onChange={(e) => set("model", e.target.value || null)}
                  className={inputClass}
                />
              </Field>
              <Field label="Year range">
                <input
                  value={draft.year_range ?? ""}
                  onChange={(e) => set("year_range", e.target.value || null)}
                  placeholder="2019–2024"
                  className={inputClass}
                />
              </Field>
            </div>
          )}
        </div>
      </Card>

      {error && (
        <p className="rounded-xl border border-line bg-cream-card px-4 py-3 text-sm font-bold text-clay">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="rounded-xl border border-line bg-cream-card px-4 py-3 text-sm font-bold text-palm">
          Saved.
        </p>
      )}

      {/* ---- Actions ---------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          disabled={pending}
          className="rounded-xl bg-gold px-4 py-3 font-extrabold text-navy transition hover:brightness-95 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          {pending ? "Working…" : draft.id ? "Save changes" : "Create"}
        </button>

        {draft.id && (
          <button
            onClick={handleToggleStatus}
            disabled={pending}
            className="rounded-xl bg-navy px-4 py-3 font-extrabold text-white transition hover:brightness-110 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            {draft.status === "published" ? "Unpublish" : "Publish"}
          </button>
        )}

        <span
          className="text-sm font-bold"
          style={{ color: `var(--color-${STATUS_META[draft.status].color})` }}
        >
          {STATUS_META[draft.status].label}
        </span>

        {draft.id && (
          <span className="ml-auto">
            {confirmingDelete ? (
              // Inline confirm rather than window.confirm — a native dialog
              // blocks the page and can't be styled.
              <span className="flex items-center gap-2">
                <span className="text-sm font-bold text-navy">Delete this?</span>
                <button
                  onClick={handleDelete}
                  disabled={pending}
                  className="rounded-xl bg-clay px-3 py-2 text-sm font-extrabold text-white transition hover:brightness-95 disabled:opacity-60"
                >
                  Yes, delete
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded-xl border border-line px-3 py-2 text-sm font-bold text-navy"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="rounded-xl border border-line px-3 py-2 text-sm font-bold text-clay transition hover:bg-clay/10"
              >
                Delete
              </button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-line bg-cream-card p-3 text-navy outline-none focus:ring-2 focus:ring-gold";

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
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-soft">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

export default ContentEditor;
