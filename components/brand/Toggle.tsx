"use client";

/* ============================================================================
   EDIAGD — a switch, because a decision is not a form submission

   Two buttons ("Closed" / "We're open") made every ruling look like an action
   with consequences, and worse, a ruled row then LEFT the list it was in and
   reappeared in another one further down the page. Ryan: "dropping it down
   below confused me." He is right — a list that rearranges itself under your
   thumb loses your place, and on a phone the row you just tapped scrolls out
   of sight, so you cannot tell whether the tap landed.

   A switch fixes both. Nothing moves: the date keeps its position in the year
   and the control simply shows which way it is set. It is also the gesture the
   platform already uses for exactly this question, which matters most in the
   WKWebView where everything else is a native iOS control.

   INDETERMINATE IS A REAL STATE HERE, not a loading artefact. Across a group of
   rooftops one date can be genuinely mixed — nine stores shut, two trading —
   and a switch that picked a side would silently misreport two of them. Mixed
   renders as a knob at centre, and tapping it commits every rooftop to the same
   answer rather than toggling to whichever side looked nearer.
   ============================================================================ */

export function Toggle({
  checked,
  indeterminate = false,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  /** Neither on nor off — the rooftops disagree. */
  indeterminate?: boolean;
  onChange: (next: boolean) => void;
  /** What a screen reader announces. The visible text lives beside it. */
  label: string;
  disabled?: boolean;
}) {
  const on = checked && !indeterminate;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={indeterminate ? "mixed" : on}
      aria-label={label}
      disabled={disabled}
      /* A mixed row commits everything to CLOSED on the first tap, which is the
         direction that cannot lose information: turning it off would silently
         reopen the stores somebody had already marked shut. */
      onClick={() => onChange(indeterminate ? true : !on)}
      /*
       * GEOMETRY INLINE, COLOUR IN CLASSES.
       *
       * 51x31 with a 27px knob is the iOS switch, and those are device pixels
       * rather than steps on a scale — there is no `w-51` and the arbitrary
       * `w-[51px]` did not survive into this page's stylesheet, so the control
       * rendered 0x0 and was invisible AND untappable. A measurement this
       * specific is clearer as a number anyway; the theme still owns every
       * colour.
       */
      style={{ width: 51, height: 31 }}
      className={`relative inline-flex shrink-0 items-center rounded-full transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 ${
        on ? "bg-teal" : indeterminate ? "bg-teal-soft" : "bg-line"
      }`}
    >
      <span
        aria-hidden="true"
        style={{
          width: 27,
          height: 27,
          transform: `translateX(${on ? 22 : indeterminate ? 12 : 2}px)`,
        }}
        className="absolute rounded-full bg-white shadow-[0_1px_3px_rgba(12,28,44,0.3)] transition-transform"
      />
    </button>
  );
}
