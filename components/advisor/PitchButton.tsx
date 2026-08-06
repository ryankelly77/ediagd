"use client";

import { useState } from "react";
import { PitchDialog } from "@/components/advisor/PitchDialog";
import type { ServiceCue } from "@/lib/daily";

/**
 * The gold CTA on Eddie's Pick. Only the button needs to be interactive, so the
 * hero itself stays a server component.
 */
export function PitchButton({
  service,
  cues,
}: {
  service: string;
  cues: ServiceCue[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-gold px-4 py-3.5 text-base font-extrabold text-navy shadow-[0_4px_16px_rgba(12,28,44,0.24)] transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
      >
        Watch the pitch
      </button>

      {open && (
        <PitchDialog
          service={service}
          cues={cues}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export default PitchButton;
