import Link from "next/link";
import { Card } from "@/components/brand/Card";
import type { ModuleProgress } from "@/lib/lms";

/** A thin progress rule. Teal for in-flight, palm once finished. */
export function ProgressBar({ pct }: { pct: number }) {
  return (
    <span className="mt-1.5 block h-1.5 w-full rounded-pill bg-line/60">
      <span
        aria-hidden="true"
        className="block h-full rounded-pill transition-all"
        style={{
          width: `${Math.max(pct > 0 ? 4 : 0, pct)}%`,
          background:
            pct >= 100
              ? "rgb(var(--ediagd-palm))"
              : "rgb(var(--ediagd-teal))",
        }}
      />
    </span>
  );
}

/**
 * Where they left off.
 *
 * A module already started beats one never opened: finishing something is more
 * motivating than starting something, and the hardest part of a 253-module
 * library is knowing where you were.
 */
export function ContinueCard({ module: m }: { module: ModuleProgress }) {
  return (
    <Card className="ediagd-card-feature mt-4">
      <p className="ediagd-eyebrow">Pick up where you left off</p>
      {/*
        THE TRACK, ABOVE THE LESSON. "5. Tires on the Drive" on its own is not a
        place — Ryan's screenshot showed the card naming a lesson with no way to
        tell which track it belonged to. The course's name is what advisor-facing
        copy calls the track, and my_module_progress carries it (0160) so this
        costs no extra query.
      */}
      {m.courseName && (
        <p className="mt-2 text-xs font-bold uppercase tracking-wide text-ink-soft">
          {m.courseName}
        </p>
      )}
      <p className="mt-1 text-lg font-extrabold leading-snug text-navy">
        {m.name}
      </p>
      {/* WHOLE NUMBERS, NO PRINTED PERCENTAGE. The bar carries the proportion;
          printing "0%" beside "0 of 1 done" says the same thing twice and was
          the number that read as broken on a lesson nobody had started. */}
      <p className="ediagd-numeral mt-1 text-sm text-ink-soft">
        {m.completedItems} of {m.totalItems} done
      </p>
      <ProgressBar pct={m.pct} />
      <Link
        href={`/library/m/${m.moduleId}`}
        className="mt-4 flex min-h-[3rem] w-full items-center justify-center rounded-xl bg-gold px-4 text-sm font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        Continue
      </Link>
    </Card>
  );
}

/**
 * What a row says about its own contents, in one place.
 *
 * THREE STATES, AND THE MIDDLE ONE IS THE WHOLE POINT. Before 0160 a cue-only
 * module read "0 of 8 · 0%" over eight cues that could never move it; now the
 * gating count is 0 there, so the naive render would be "0 of 0". Neither is
 * true of the page. A module with cues and no film says so.
 */
export function lessonCount(m: ModuleProgress): string {
  if (m.isReinforcement) {
    return m.cueItems === 1 ? "1 cue · no lesson yet" : `${m.cueItems} cues · no lesson yet`;
  }
  return `${m.completedItems} of ${m.totalItems} done`;
}
