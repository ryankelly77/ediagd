"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/brand/Card";
import { SandDollarIcon } from "@/components/brand/SandDollarIcon";
import {
  cancelRedemption,
  markFulfilled,
  saveSwagItem,
  setSwagItemActive,
  type SwagItemDraft,
} from "@/app/(app)/admin/swag/actions";
import { STATUS_LABEL, type SwagItem, type SwagResult } from "@/lib/swag";

export type QueueRow = {
  id: string;
  advisorName: string;
  itemName: string;
  pricePaid: number;
  variant: string | null;
  shippingNote: string | null;
  status: "requested" | "fulfilled" | "cancelled";
  createdAt: string;
};

/** Fulfillment queue + catalog, on one admin screen. */
export function SwagAdmin({
  queue,
  items,
}: {
  queue: QueueRow[];
  items: SwagItem[];
}) {
  const [result, setResult] = useState<SwagResult | null>(null);
  const waiting = queue.filter((r) => r.status === "requested");

  return (
    <>
      {result && (
        <p
          role="status"
          className={`mt-4 rounded-card border border-line px-4 py-3 text-sm font-bold ${
            result.ok ? "bg-palm-soft/30 text-palm" : "bg-cream-card text-clay"
          }`}
        >
          {result.ok ? result.message : result.error}
        </p>
      )}

      <div className="mt-6 flex items-baseline justify-between gap-3 px-1">
        <h2 className="ediagd-eyebrow">Fulfillment queue</h2>
        <span className="ediagd-numeral text-xs font-bold text-ink-soft">
          {waiting.length} awaiting
        </span>
      </div>

      {queue.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {queue.map((row) => (
            <li key={row.id}>
              <QueueCard row={row} onResult={setResult} />
            </li>
          ))}
        </ul>
      ) : (
        <Card className="mt-2 p-5">
          <p className="text-base font-extrabold text-navy">Nothing to ship</p>
          <p className="mt-1 text-sm text-ink-soft">
            Redemptions appear here as advisors spend their Sand Dollars.
          </p>
        </Card>
      )}

      <h2 className="ediagd-eyebrow mt-8 px-1">Catalog</h2>
      <CatalogEditor items={items} onResult={setResult} />
    </>
  );
}

/* ---- Queue --------------------------------------------------------------- */

function QueueCard({
  row,
  onResult,
}: {
  row: QueueRow;
  onResult: (r: SwagResult) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  function run(action: () => Promise<SwagResult>) {
    startTransition(async () => {
      const response = await action();
      onResult(response);
      if (response.ok) router.refresh();
    });
  }

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-extrabold text-navy">{row.itemName}</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            {row.advisorName}
            {row.variant ? ` · ${row.variant}` : ""} · {formatDate(row.createdAt)}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-xs font-extrabold text-ink-soft">
          <SandDollarIcon size={13} tone="sand" />
          <span className="ediagd-numeral">{row.pricePaid.toLocaleString()}</span>
        </span>
      </div>

      {row.shippingNote && (
        <p className="mt-3 whitespace-pre-line rounded-card bg-cream-card px-3 py-2 text-sm leading-relaxed text-ink">
          {row.shippingNote}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-pill px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
            row.status === "fulfilled"
              ? "bg-palm-soft text-palm"
              : row.status === "cancelled"
                ? "bg-line text-ink-soft"
                : "bg-gold-soft text-navy"
          }`}
        >
          {STATUS_LABEL[row.status]}
        </span>

        {row.status === "requested" && (
          <>
            <button
              onClick={() => run(() => markFulfilled(row.id))}
              disabled={pending}
              className="ml-auto rounded-xl bg-navy px-3 py-2 text-sm font-extrabold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {pending ? "Working…" : "Mark sent"}
            </button>

            {confirmingCancel ? (
              <span className="flex items-center gap-2">
                <button
                  onClick={() => run(() => cancelRedemption(row.id))}
                  disabled={pending}
                  className="rounded-xl bg-clay px-3 py-2 text-sm font-extrabold text-white transition hover:brightness-95 disabled:opacity-60"
                >
                  Cancel & refund
                </button>
                <button
                  onClick={() => setConfirmingCancel(false)}
                  className="rounded-xl border border-line px-3 py-2 text-sm font-bold text-navy"
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmingCancel(true)}
                className="rounded-xl border border-line px-3 py-2 text-sm font-bold text-clay transition hover:bg-clay/10"
              >
                Cancel
              </button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

/* ---- Catalog ------------------------------------------------------------- */

const BLANK: SwagItemDraft = {
  key: "",
  name: "",
  description: null,
  price: 0,
  variants: null,
  imageUrl: null,
  sortOrder: 0,
  active: true,
};

function CatalogEditor({
  items,
  onResult,
}: {
  items: SwagItem[];
  onResult: (r: SwagResult) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<SwagItemDraft | null>(null);
  const [pending, startTransition] = useTransition();

  function save(draft: SwagItemDraft) {
    startTransition(async () => {
      const response = await saveSwagItem(draft);
      onResult(response);
      if (response.ok) {
        setEditing(null);
        router.refresh();
      }
    });
  }

  function toggle(item: SwagItem) {
    startTransition(async () => {
      const response = await setSwagItemActive(item.id, !item.active);
      onResult(response);
      if (response.ok) router.refresh();
    });
  }

  return (
    <>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <Card className="flex items-center gap-3 p-4">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-extrabold text-navy">
                  {item.name}
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-soft">
                  <SandDollarIcon size={12} tone="sand" />
                  <span className="ediagd-numeral font-bold">
                    {item.price.toLocaleString()}
                  </span>
                  <span>· {item.key}</span>
                  {!item.active && <span>· retired</span>}
                </span>
              </span>
              <button
                onClick={() =>
                  setEditing({
                    id: item.id,
                    key: item.key,
                    name: item.name,
                    description: item.description,
                    price: item.price,
                    variants: item.variants,
                    imageUrl: item.imageUrl,
                    sortOrder: item.sortOrder,
                    active: item.active,
                  })
                }
                className="shrink-0 rounded-xl border border-line px-3 py-2 text-sm font-bold text-navy transition hover:bg-teal-soft/20"
              >
                Edit
              </button>
              <button
                onClick={() => toggle(item)}
                disabled={pending}
                className="shrink-0 rounded-xl border border-line px-3 py-2 text-sm font-bold text-ink-soft transition hover:bg-teal-soft/20 disabled:opacity-60"
              >
                {item.active ? "Retire" : "Restore"}
              </button>
            </Card>
          </li>
        ))}
      </ul>

      <button
        onClick={() => setEditing({ ...BLANK })}
        className="mt-3 w-full rounded-xl border border-line bg-surface-card p-3.5 font-extrabold text-navy transition hover:bg-teal-soft/20"
      >
        Add an item
      </button>

      {editing && (
        <ItemForm
          draft={editing}
          pending={pending}
          onChange={setEditing}
          onSave={() => save(editing)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function ItemForm({
  draft,
  pending,
  onChange,
  onSave,
  onClose,
}: {
  draft: SwagItemDraft;
  pending: boolean;
  onChange: (d: SwagItemDraft) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const set = <K extends keyof SwagItemDraft>(k: K, v: SwagItemDraft[K]) =>
    onChange({ ...draft, [k]: v });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={draft.id ? "Edit item" : "Add item"}
        className="max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-t-card bg-surface-card p-6 shadow-pop sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-extrabold text-navy">
          {draft.id ? "Edit item" : "Add item"}
        </h3>

        <div className="mt-4 space-y-3">
          <Field label="Name">
            <input value={draft.name} onChange={(e) => set("name", e.target.value)} className={input} />
          </Field>
          <Field label="Key" hint="Stable slug, used for the image filename.">
            <input value={draft.key} onChange={(e) => set("key", e.target.value)} className={input} />
          </Field>
          <Field label="Price (Sand Dollars)">
            <input
              type="number"
              min={0}
              value={draft.price}
              onChange={(e) => set("price", Number(e.target.value) || 0)}
              className={`${input} ediagd-numeral text-right`}
            />
          </Field>
          <Field label="Description">
            <textarea
              rows={2}
              value={draft.description ?? ""}
              onChange={(e) => set("description", e.target.value || null)}
              className={input}
            />
          </Field>
          <Field label="Variants" hint="Comma separated, e.g. S,M,L,XL. Leave blank for none.">
            <input
              value={draft.variants ?? ""}
              onChange={(e) => set("variants", e.target.value || null)}
              className={input}
            />
          </Field>
          <Field label="Image URL" hint="e.g. /brand/swag/dad_cap.jpg — blank shows a placeholder.">
            <input
              value={draft.imageUrl ?? ""}
              onChange={(e) => set("imageUrl", e.target.value || null)}
              className={input}
            />
          </Field>
          <Field label="Sort order">
            <input
              type="number"
              value={draft.sortOrder}
              onChange={(e) => set("sortOrder", Number(e.target.value) || 0)}
              className={`${input} ediagd-numeral text-right`}
            />
          </Field>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onSave}
            disabled={pending}
            className="flex-1 rounded-xl bg-gold p-3 font-extrabold text-navy transition hover:brightness-95 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            onClick={onClose}
            className="rounded-xl border border-line px-4 py-3 font-bold text-navy"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

const input =
  "mt-1 w-full rounded-xl border border-line bg-cream-card p-3 text-navy outline-none focus:ring-2 focus:ring-gold";

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

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default SwagAdmin;
