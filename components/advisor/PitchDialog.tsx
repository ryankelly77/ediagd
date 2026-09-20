"use client";

import { useId, useState } from "react";
import { Modal } from "@/components/brand/Modal";
import Link from "next/link";
import { CueCard } from "@/components/advisor/CueCard";
import type { ServiceCue } from "@/lib/daily";

/* ============================================================================
   EDIAGD — the pitch dialog
   Where "Watch the pitch" and the service detail both land: everything we
   coach on ONE service, in one place.

   A stepping stone to the lesson library, so it's deliberately read-only —
   no completion tracking, no Sand Dollars. Those need designing properly.
   ============================================================================ */

type Tab = "video" | "cues";

export function PitchDialog({
  service,
  cues,
  films,
  onClose,
}: {
  service: string;
  /** Resolved server-side — the dialog never fetches, so nothing pops in. */
  cues: ServiceCue[];
  /**
   * How many pitch films this family has, and how many this advisor has done.
   *
   * THE TAB USED TO SAY "SOON" UNCONDITIONALLY. It said it for Belts & Cooling,
   * which has twelve — on the same day the loop served the advisor one of them.
   * The count comes through service_family_content (0125), which resolves the
   * op-code path this screen never read.
   */
  films: { total: number; done: number };
  onClose: () => void;
}) {
  // Video leads even though it's empty: it's what the button promised, and
  // burying it would make the coming-soon state feel like a bait and switch.
  const [tab, setTab] = useState<Tab>("video");
  const base = useId();

  return (
    <Modal
      label={`${service} coaching`}
      onClose={onClose}
      width="md"
      padded={false}
      showClose
    >
      {/* ---- Hero -------------------------------------------------------- */}
      <div
        className="relative px-6 pb-6 pt-5"
        style={{ background: "var(--ediagd-hero-gradient)" }}
      >
        {/* No positioned wrapper here: a `relative` element after the close
            button paints ON TOP of it and eats the taps. */}
        <p className="ediagd-eyebrow">The pitch</p>
        <h2 className="mt-2 pr-14 text-2xl font-extrabold leading-tight text-white">
          {service}
        </h2>
      </div>

      {/* ---- Tabs -------------------------------------------------------- */}
      {/* Sticky, because the dialog itself is the scroll container — the tabs
          stay reachable however far down the cue list you are. */}
      <div
        role="tablist"
        aria-label={`${service} coaching`}
        className="sticky top-0 z-10 flex border-b border-line bg-surface-card"
      >
        <TabButton
          id={`${base}-video`}
          panelId={`${base}-video-panel`}
          selected={tab === "video"}
          onSelect={() => setTab("video")}
        >
          Films
          {films.total > 0 ? (
            <span className="ediagd-numeral ml-2 text-xs font-bold text-ink-soft">
              {films.done} / {films.total}
            </span>
          ) : (
            <span className="ml-2 rounded-pill bg-gold-soft px-1.5 py-0.5 text-xs font-extrabold uppercase tracking-wide text-navy">
              Soon
            </span>
          )}
        </TabButton>

        <TabButton
          id={`${base}-cues`}
          panelId={`${base}-cues-panel`}
          selected={tab === "cues"}
          onSelect={() => setTab("cues")}
        >
          Coaching cues
          {cues.length > 0 && (
            <span className="ediagd-numeral ml-2 text-xs font-bold text-ink-soft">
              {cues.length}
            </span>
          )}
        </TabButton>
      </div>

      {/* ---- Panels ------------------------------------------------------ */}
      {tab === "video" ? (
        <div
          role="tabpanel"
          id={`${base}-video-panel`}
          aria-labelledby={`${base}-video`}
          className="p-6"
        >
          {films.total > 0 ? (
            <FilmsReady service={service} films={films} />
          ) : (
            <VideoComingSoon
              service={service}
              onSeeCues={() => setTab("cues")}
              hasCues={cues.length > 0}
            />
          )}
        </div>
      ) : (
        <div
          role="tabpanel"
          id={`${base}-cues-panel`}
          aria-labelledby={`${base}-cues`}
          className="p-6"
        >
          <CueList service={service} cues={cues} />
        </div>
      )}
    </Modal>
  );
}

/* ---- Tabs ---------------------------------------------------------------- */

function TabButton({
  id,
  panelId,
  selected,
  onSelect,
  children,
}: {
  id: string;
  panelId: string;
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      id={id}
      role="tab"
      type="button"
      aria-selected={selected}
      aria-controls={panelId}
      onClick={onSelect}
      // min-h-[3rem] keeps the tap target comfortable on a phone.
      className={`flex min-h-[3rem] flex-1 items-center justify-center border-b-2 px-3 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold ${
        selected
          ? "border-gold text-navy"
          : "border-transparent text-ink-soft hover:text-navy"
      }`}
    >
      {children}
    </button>
  );
}

/* ---- Films: the ones that were there all along --------------------------- */
/**
 * The dialog does not play them, and that is a deliberate boundary.
 *
 * It is a modal on the numbers screen with no scroll position of its own worth
 * keeping and no route to come back to. A film is three or four minutes; that
 * belongs on a page an advisor can land on, leave and return to, which is what
 * /service/[family] is. So this says what exists and hands over.
 *
 * It is also what makes the count honest: the tab now reports the shelf, and
 * tapping through reaches the same shelf rather than a second, dialog-shaped
 * copy of it that would need its own completion handling.
 */
function FilmsReady({
  service,
  films,
}: {
  service: string;
  films: { total: number; done: number };
}) {
  const left = films.total - films.done;
  return (
    <div className="rounded-card border border-line bg-cream-card px-6 py-8 text-center">
      <p className="text-base font-extrabold text-navy">
        {films.total === 1
          ? `1 pitch film for ${service}.`
          : `${films.total} pitch films for ${service}.`}
      </p>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink-soft">
        {films.done === 0
          ? "One lands in your morning loop. You can watch ahead any time."
          : left === 0
            ? "You have watched all of them."
            : `You have watched ${films.done}. ${left} to go.`}
      </p>

      <Link
        href={`/service/${encodeURIComponent(service)}`}
        className="mt-5 inline-flex rounded-xl bg-gold px-4 py-2.5 text-sm font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        {films.done === 0 ? "Start watching" : left === 0 ? "Watch again" : "Continue"}
      </Link>
    </div>
  );
}

/* ---- Video: honestly empty, deliberately so ------------------------------ */

function VideoComingSoon({
  service,
  onSeeCues,
  hasCues,
}: {
  service: string;
  onSeeCues: () => void;
  hasCues: boolean;
}) {
  return (
    <div className="rounded-card border border-line bg-cream-card px-6 py-10 text-center">
      {/* A play affordance that is plainly not a control: no button, no
          pointer, no fake thumbnail or progress bar behind it. */}
      <span
        aria-hidden="true"
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-pill border-2 border-dashed border-ocean/35 text-ocean/45"
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7 translate-x-0.5" fill="currentColor">
          <path d="M8 5.5v13l11-6.5z" />
        </svg>
      </span>

      <p className="mt-5 text-base font-extrabold text-navy">
        Pitch videos for {service} are on the way.
      </p>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink-soft">
        {hasCues ? (
          <>
            We&apos;re filming the walkthroughs now. Until they land, the
            coaching cues have the words to use on the drive.
          </>
        ) : (
          // Don't point at cues this service hasn't got.
          <>We&apos;re filming the walkthroughs now. Check back soon.</>
        )}
      </p>

      {hasCues && (
        <button
          onClick={onSeeCues}
          className="mt-5 rounded-xl border border-line bg-surface-card px-4 py-2.5 text-sm font-extrabold text-navy transition hover:bg-teal-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Read the cues
        </button>
      )}
    </div>
  );
}

/* ---- Cues: the real content ---------------------------------------------- */

function CueList({ service, cues }: { service: string; cues: ServiceCue[] }) {
  if (cues.length === 0) {
    return (
      <div className="rounded-card border border-line bg-cream-card px-6 py-10 text-center">
        <p className="text-base font-extrabold text-navy">
          Cues for {service} are on the way.
        </p>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink-soft">
          This one isn&apos;t written up yet. Your other services already have
          theirs — start there today.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="ediagd-eyebrow">
        {cues.length === 1 ? "Your cue" : "Your cues"}
      </p>

      <ul className="mt-3 space-y-3">
        {cues.map((cue) => (
          <li key={cue.id}>
            {/*
              NO "TODAY'S CUE" BADGE ANY MORE. It was true while the ritual
              drew a family cue each morning and this list was rotated to lead
              with it. 3b's item slot serves the craft curriculum instead, so
              there is no family cue today to be the head of — and a badge
              pointing at a claim the product stopped making is worse than none.
            */}
            <CueCard cue={cue} />
          </li>
        ))}
      </ul>

      <p className="mt-4 text-center text-xs text-ink-soft">
        More {service} coaching is being added all the time.
      </p>
    </>
  );
}

export default PitchDialog;
