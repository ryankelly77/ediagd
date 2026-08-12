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
      <p className="mt-2 text-lg font-extrabold leading-snug text-navy">
        {m.name}
      </p>
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
