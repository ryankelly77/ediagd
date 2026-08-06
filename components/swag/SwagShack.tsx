"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/brand/Card";
import { PaddleOutIcon } from "@/components/brand/PaddleOutIcon";
import { SandDollarIcon } from "@/components/brand/SandDollarIcon";
import { Modal } from "@/components/brand/Modal";
import { buyPaddleOut, redeemSwag } from "@/app/(app)/swag/actions";
import {
  STATUS_LABEL,
  shortfallLabel,
  variantOptions,
  type Redemption,
  type SwagItem,
  type SwagResult,
} from "@/lib/swag";

/**
 * The Swag Shack. The gear can't be bought — only earned — so everything here
 * is priced in Sand Dollars and nothing takes payment.
 *
 * Prices and balances shown are display only: every redemption is re-priced
 * and re-checked server-side against the database.
 */
export function SwagShack({
  items,
  balance,
  redemptions,
  paddleOutPrice,
  paddleOutHeld,
  paddleOutCap,
}: {
  items: SwagItem[];
  balance: number;
  redemptions: Redemption[];
  paddleOutPrice: number;
  paddleOutHeld: number;
  paddleOutCap: number;
}) {
  const [selected, setSelected] = useState<SwagItem | null>(null);
  const [result, setResult] = useState<SwagResult | null>(null);

  return (
    <>
      {result && (
        <p
          role="status"
          className={`mt-4 rounded-card border border-line px-4 py-3 text-sm font-bold leading-relaxed ${
            result.ok ? "bg-palm-soft/30 text-palm" : "bg-cream-card text-clay"
          }`}
        >
          {result.ok ? result.message : result.error}
        </p>
      )}

      {/* ---- Paddle Back Out — not gear, but the other thing to spend on -- */}
      <h2 className="ediagd-eyebrow mt-8 px-1">Protect your Swell</h2>
      <PaddleOutCard
        price={paddleOutPrice}
        held={paddleOutHeld}
        cap={paddleOutCap}
        balance={balance}
        onResult={setResult}
      />

      {/* ---- The shelf --------------------------------------------------- */}
      <h2 className="ediagd-eyebrow mt-8 px-1">The gear</h2>
      <p className="mt-1 px-1 text-xs text-ink-soft">
        Earned, never bought. Every piece is paid for in Sand Dollars.
      </p>

      {/* What the mark means — shown with the actual glyph, not described. */}
      <p className="mt-2 flex items-center gap-2 px-1 text-xs text-ink-soft">
        <CheckMark size={20} />
        <span>
          means you&apos;ve earned enough — everything else shows how far to go.
        </span>
      </p>

      <ul className="mt-3 grid grid-cols-2 gap-3">
        {items.map((item) => (
          <li key={item.id}>
            <SwagTile
              item={item}
              balance={balance}
              onOpen={() => {
                setResult(null);
                setSelected(item);
              }}
            />
          </li>
        ))}
      </ul>

      {/* ---- Their orders ------------------------------------------------- */}
      {redemptions.length > 0 && (
        <>
          <h2 className="ediagd-eyebrow mt-8 px-1">Your redemptions</h2>
          <Card className="mt-2 px-4">
            <ul className="divide-y divide-line">
              {redemptions.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-3.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold text-navy">
                      {r.itemName}
                      {r.variant ? ` · ${r.variant}` : ""}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-soft">
                      {formatDate(r.createdAt)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs font-extrabold text-ink-soft">
                    <SandDollarIcon size={13} tone="sand" />
                    <span className="ediagd-numeral">
                      {r.pricePaid.toLocaleString()}
                    </span>
                  </span>
                  <StatusPill status={r.status} />
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {selected && (
        <RedeemSheet
          item={selected}
          balance={balance}
          onClose={() => setSelected(null)}
          onResult={(r) => {
            setResult(r);
            if (r.ok) setSelected(null);
          }}
        />
      )}
    </>
  );
}

/* ---- Tile ---------------------------------------------------------------- */

function SwagTile({
  item,
  balance,
  onOpen,
}: {
  item: SwagItem;
  balance: number;
  onOpen: () => void;
}) {
  const affordable = balance >= item.price;

  return (
    <button
      onClick={onOpen}
      className="ediagd-card flex h-full w-full flex-col overflow-hidden text-left transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      {/* The gear always looks its best — desaturating what you can't afford
          yet makes it drab, which is the opposite of aspirational. The check
          and the shortfall line carry affordability instead. */}
      <span className="relative block w-full">
        <SwagImage item={item} />
        {affordable && <AffordableCheck />}
      </span>

      <span className="flex flex-1 flex-col p-3">
        <span className="text-sm font-extrabold leading-tight text-navy">
          {item.name}
        </span>

        <span className="mt-auto pt-2">
          <span className="flex items-center gap-1 text-sm font-extrabold text-gold">
            <SandDollarIcon size={15} />
            <span className="ediagd-numeral">{item.price.toLocaleString()}</span>
          </span>
          {!affordable && (
            // Encouraging, never scolding.
            <span className="mt-0.5 block text-[11px] font-bold text-clay">
              {shortfallLabel(item.price, balance)}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

/**
 * Product shot, or a clean branded placeholder.
 *
 * The placeholder covers BOTH cases: no image_url set, and an image_url whose
 * file isn't there (the catalog is seeded with paths before the photography
 * exists). onError flips to the placeholder so a missing file never shows a
 * browser's broken-image icon.
 */
function SwagImage({
  item,
  detail = false,
}: {
  item: SwagItem;
  /** Detail view shows the WHOLE product; the grid crops to a tidy square. */
  detail?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (!item.imageUrl || failed) {
    return (
      <span
        aria-hidden="true"
        className={`flex w-full items-center justify-center bg-teal-soft/25 ${
          detail ? "h-48" : "aspect-square"
        }`}
      >
        <SandDollarIcon size={detail ? 56 : 34} tone="sand" />
      </span>
    );
  }

  if (detail) {
    // object-contain + letterbox: nothing of the mockup gets cut off, and the
    // capped height keeps the sheet's content on screen.
    return (
      <span className="flex max-h-[46vh] w-full items-center justify-center bg-teal-soft/15 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.imageUrl}
          alt=""
          onError={() => setFailed(true)}
          className="max-h-[40vh] w-auto max-w-full object-contain"
        />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.imageUrl}
      alt=""
      onError={() => setFailed(true)}
      className="aspect-square w-full object-cover"
    />
  );
}

/**
 * "You can get this now." Palm rather than gold, matching the badge wall's
 * check construction — gold stays reserved for the Swell and milestones
 * (DESIGN_LANGUAGE §5), and affordability isn't a milestone.
 *
 * The mark and its positioning are separate so the legend can show the very
 * same glyph the tiles use, rather than a lookalike that could drift.
 */
function CheckMark({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-pill bg-palm text-white shadow-[0_2px_6px_rgba(12,28,44,0.4)]"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" className="h-[62%] w-[62%]" aria-hidden="true">
        <path
          d="M5 13l4 4L19 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function AffordableCheck() {
  return (
    <span className="absolute right-2 top-2">
      <CheckMark />
    </span>
  );
}

/* ---- Redeem sheet -------------------------------------------------------- */

function RedeemSheet({
  item,
  balance,
  onClose,
  onResult,
}: {
  item: SwagItem;
  balance: number;
  onClose: () => void;
  onResult: (r: SwagResult) => void;
}) {
  const router = useRouter();
  const options = variantOptions(item.variants);
  const [variant, setVariant] = useState(options[0] ?? "");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const affordable = balance >= item.price;
  const after = balance - item.price;

  function redeem() {
    startTransition(async () => {
      const response = await redeemSwag(item.id, variant || null, note || null);
      onResult(response);
      if (response.ok) router.refresh();
    });
  }

  return (
    <Modal label={item.name} onClose={onClose} padded={false}>
        <SwagImage item={item} detail />

        <div className="p-6">
          <h2 className="text-xl font-extrabold text-navy">{item.name}</h2>
          {item.description && (
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              {item.description}
            </p>
          )}

          <p className="mt-4 flex items-center gap-1.5 text-lg font-extrabold text-gold">
            <SandDollarIcon size={20} />
            <span className="ediagd-numeral">{item.price.toLocaleString()}</span>
          </p>

          {!affordable ? (
            <p className="mt-4 rounded-card bg-cream-card px-4 py-3 text-sm font-bold text-clay">
              {shortfallLabel(item.price, balance)}. Keep the Swell rolling — it
              adds up fast.
            </p>
          ) : (
            <>
              {options.length > 0 && (
                <label className="mt-5 block">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                    Choose one
                  </span>
                  <select
                    value={variant}
                    onChange={(e) => setVariant(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-line bg-cream-card p-3 font-semibold text-navy outline-none focus:ring-2 focus:ring-gold"
                  >
                    {options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="mt-4 block">
                <span className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                  Where should we send it?
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Ship to the store, or an address"
                  className="mt-1 w-full rounded-xl border border-line bg-cream-card p-3 text-navy outline-none focus:ring-2 focus:ring-gold"
                />
              </label>

              {confirming ? (
                <div className="mt-5 rounded-card border border-gold bg-gold-soft/30 p-4">
                  <p className="text-sm font-bold leading-relaxed text-navy">
                    Redeem {item.name}
                    {variant ? ` (${variant})` : ""} for{" "}
                    <span className="ediagd-numeral">
                      {item.price.toLocaleString()}
                    </span>{" "}
                    Sand Dollars? You&apos;ll have{" "}
                    <span className="ediagd-numeral">{after.toLocaleString()}</span>{" "}
                    left.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={redeem}
                      disabled={pending}
                      className="flex-1 rounded-xl bg-gold p-3 font-extrabold text-navy transition hover:brightness-95 disabled:opacity-60"
                    >
                      {pending ? "Redeeming…" : "Yes, redeem"}
                    </button>
                    <button
                      onClick={() => setConfirming(false)}
                      className="rounded-xl border border-line px-4 py-3 font-bold text-navy"
                    >
                      Back
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirming(true)}
                  className="mt-5 w-full rounded-xl bg-gold p-3.5 font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
                >
                  Redeem
                </button>
              )}
            </>
          )}

          <button
            onClick={onClose}
            className="mt-3 w-full rounded-xl border border-line p-3 font-bold text-navy transition hover:bg-teal-soft/20"
          >
            Close
          </button>
        </div>
    </Modal>
  );
}

/* ---- Paddle Back Out ----------------------------------------------------- */

function PaddleOutCard({
  price,
  held,
  cap,
  balance,
  onResult,
}: {
  price: number;
  held: number;
  cap: number;
  balance: number;
  onResult: (r: SwagResult) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Spending 500 Sand Dollars shouldn't happen on one tap. Same two-step the
  // gear tiles use — nothing leaves the balance until "Yes, buy one".
  const [confirming, setConfirming] = useState(false);

  const full = held >= cap;
  const affordable = balance >= price;
  const after = balance - price;

  function buy() {
    startTransition(async () => {
      const response = await buyPaddleOut();
      onResult(response);
      setConfirming(false);
      if (response.ok) router.refresh();
    });
  }

  return (
    // Fully centred: it's a purchase card like the gear tiles beside it, and a
    // centred mark with a left-aligned body reads half-finished.
    <Card className="mt-2 p-5 text-center">
      <PaddleOutIcon size={56} className="mx-auto" />
      <p className="mt-2 text-base font-extrabold text-navy">
        Paddle Back Out day
      </p>

      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Miss a day and one of these keeps your Swell rolling. You can hold up to{" "}
        {cap} — you&apos;re holding{" "}
        <span className="ediagd-numeral font-bold text-navy">{held}</span>.
      </p>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-lg font-extrabold text-gold">
        <SandDollarIcon size={20} />
        <span className="ediagd-numeral">{price.toLocaleString()}</span>
      </p>

      {full ? (
        <p className="mt-3 rounded-card bg-teal-soft/25 px-4 py-3 text-sm font-bold text-ocean">
          Your bank is full — you&apos;re holding {held}. Spend one on a missed
          day and you can buy another.
        </p>
      ) : !affordable ? (
        <p className="mt-3 rounded-card bg-cream-card px-4 py-3 text-sm font-bold text-clay">
          {shortfallLabel(price, balance)}.
        </p>
      ) : confirming ? (
        <div className="mt-4 rounded-card border border-gold bg-gold-soft/30 p-4 text-left">
          <p className="text-sm font-bold leading-relaxed text-navy">
            {/* Every gap around an inline <span> is an explicit {" "}: SWC
                drops a plain leading space when the text node wraps to the
                next line, which silently glues "500Sand" together. */}
            Buy a Paddle Back Out day for{" "}
            <span className="ediagd-numeral">{price.toLocaleString()}</span>{" "}
            Sand Dollars? You&apos;ll have{" "}
            <span className="ediagd-numeral">{after.toLocaleString()}</span>{" "}
            left, and you&apos;ll be holding{" "}
            <span className="ediagd-numeral">{held + 1}</span>.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={buy}
              disabled={pending}
              className="flex-1 rounded-xl bg-gold p-3 font-extrabold text-navy transition hover:brightness-95 disabled:opacity-60"
            >
              {pending ? "Banking…" : "Yes, buy one"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="rounded-xl border border-line px-4 py-3 font-bold text-navy disabled:opacity-60"
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="mt-4 w-full rounded-xl bg-navy p-3.5 font-extrabold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Buy a Paddle Back Out day
        </button>
      )}
    </Card>
  );
}

/* ---- Shared -------------------------------------------------------------- */

function StatusPill({ status }: { status: Redemption["status"] }) {
  const tone =
    status === "fulfilled"
      ? "bg-palm-soft text-palm"
      : status === "cancelled"
        ? "bg-line text-ink-soft"
        : "bg-gold-soft text-navy";
  return (
    <span
      className={`shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${tone}`}
    >
      {STATUS_LABEL[status]}
    </span>
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

export default SwagShack;
