import Link from "next/link";
import { Card } from "@/components/brand/Card";
import type { LibraryItem } from "@/lib/library";

/* ============================================================================
   EDIAGD — the library's shared parts

   PLACEHOLDERS THAT READ AS "BUILT AND WAITING", NOT "BROKEN". Mitch will click
   through all of this before a single video exists, so every empty state has to
   look like a room with the furniture in it — branded, saying what is coming
   and why it isn't here yet. A blank page and a spinner both read as unfinished
   work; a fake player reads as a lie.

   There is deliberately no video player anywhere in here. content.video_url is
   null for every row until the ingestion pipeline writes one, and a play button
   that does nothing is worse than no play button.
   ============================================================================ */

/** "4 min" — duration is the one thing a video row can honestly show today. */
function duration(sec: number | null): string | null {
  if (!sec || sec <= 0) return null;
  const mins = Math.round(sec / 60);
  return mins < 1 ? "under a min" : `${mins} min`;
}

/**
 * The anticipatory empty state. Gold rule, warm copy, and a plain statement of
 * what lands here — the difference between "coming soon" and "we forgot".
 */
export function ComingSoon({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="mt-3 p-6">
      <span
        aria-hidden="true"
        className="block h-1 w-10 rounded-pill"
        style={{ background: "rgb(var(--ediagd-gold))" }}
      />
      <h2 className="mt-3 text-base font-extrabold text-navy">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink-soft">
        {children}
      </div>
    </Card>
  );
}

/**
 * Shown when the rooftop hasn't bought the add-on.
 *
 * Says which it is — not sold here, versus not your role — because those need
 * different next steps and a single "no access" message would send someone to
 * the wrong person.
 */
export function NotIncluded({
  product,
  hasRole,
  roleName,
  children,
}: {
  product: string;
  hasRole: boolean;
  roleName: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="mt-3 p-6">
      <span
        aria-hidden="true"
        className="block h-1 w-10 rounded-pill"
        style={{ background: "rgb(var(--ediagd-teal))" }}
      />
      <h2 className="mt-3 text-base font-extrabold text-navy">
        {hasRole ? `${product} isn't on your subscription` : `${product} is for ${roleName}s`}
      </h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink-soft">
        {hasRole ? (
          <>
            <p>
              It&apos;s an add-on rather than part of the base subscription, so
              a rooftop opts into it separately.
            </p>
            <p>{children}</p>
            <p className="text-navy">
              Your dealer admin can add it — worth asking if the team would use
              it.
            </p>
          </>
        ) : (
          <>
            <p>{children}</p>
            <p>
              You&apos;ll see it here if you take on a {roleName} role at a
              rooftop that has it.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

/** A row in any library list. Tapping opens nothing yet — see the note above. */
export function ItemRow({
  item,
  completed = false,
  action,
}: {
  item: LibraryItem;
  /** Already finished — earns nothing more, and says so. */
  completed?: boolean;
  /** Omitted when there is nothing to complete (a video with no player yet). */
  action?: (formData: FormData) => Promise<void>;
}) {
  const mins = duration(item.durationSec);
  const vehicle = [item.make, item.model, item.yearRange]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-start gap-3 py-3.5">
      <span
        aria-hidden="true"
        className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-card"
        style={{
          background: item.isVideo
            ? "color-mix(in srgb, rgb(var(--ediagd-teal)) 16%, transparent)"
            : "color-mix(in srgb, rgb(var(--ediagd-gold)) 18%, transparent)",
        }}
      >
        {item.isVideo ? <PlayGlyph /> : <CueGlyph />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold leading-snug text-navy">
          {item.title}
        </span>
        {item.body && (
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
            {item.body}
          </span>
        )}
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-soft">
          {vehicle && <span className="ediagd-numeral">{vehicle}</span>}
          {item.tier && <span className="uppercase tracking-wide">{item.tier}</span>}
          {mins && <span className="ediagd-numeral">{mins}</span>}
          {item.isVideo && item.videoUrl == null && (
            <span
              className="font-bold uppercase tracking-wide"
              style={{ color: "rgb(var(--ediagd-gold))" }}
            >
              Not uploaded yet
            </span>
          )}
        </span>
      </span>

      {completed ? (
        <span
          className="mt-1 shrink-0 rounded-pill px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide"
          style={{
            background: "color-mix(in srgb, rgb(var(--ediagd-palm)) 16%, transparent)",
            color: "rgb(var(--ediagd-palm))",
          }}
        >
          Done
        </span>
      ) : (
        action && (
          <form action={action} className="mt-0.5 shrink-0">
            <input type="hidden" name="contentId" value={item.id} />
            <button
              type="submit"
              className="min-h-[2.25rem] rounded-pill border border-line bg-surface-card px-3 text-xs font-extrabold text-navy transition hover:bg-teal-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              Mark done
            </button>
          </form>
        )
      )}
    </div>
  );
}

/** A tappable bucket — a service family, a make, a topic. */
export function BucketRow({
  href,
  label,
  detail,
}: {
  href: string;
  label: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[3.5rem] items-center gap-3 py-3.5 transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold text-navy">
          {label}
        </span>
        <span className="mt-0.5 block text-xs text-ink-soft">{detail}</span>
      </span>
      <span aria-hidden="true" className="text-lg leading-none text-ink-soft">
        ›
      </span>
    </Link>
  );
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        d="M8 5.5v13l11-6.5z"
        fill="rgb(var(--ediagd-teal))"
      />
    </svg>
  );
}

function CueGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="rgb(var(--ediagd-gold))"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 8h12M6 13h12M6 18h7" />
    </svg>
  );
}
