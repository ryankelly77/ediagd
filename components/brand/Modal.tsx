"use client";

import { useEffect } from "react";

/* ============================================================================
   EDIAGD — the one modal
   Every dialog in the app used to hand-roll this wrapper, and all five copies
   pinned themselves to the bottom edge on phones (`items-end`), which put them
   against the fixed footer nav. This centres them instead, and owns the
   behaviour so it can't drift again:

     * centred both axes, with margins on all four sides
     * z-index ABOVE the footer nav and header (both z-40)
     * safe-area insets added to the margins, so it clears notch and home bar
     * capped to the available height and scrolls internally when taller
     * dismissed by the backdrop, by Escape, or by the built-in close control

   The close control lives OUT here rather than inside the caller's content,
   because content scrolls: a × drawn into a dialog hero disappears the moment
   you scroll down a long list, leaving the backdrop (a thin margin on a phone)
   and Escape (no keyboard on a phone) as the only ways out. Anchoring it to
   the frame keeps it put. It is also 44×44 — the tap-target floor.
   ============================================================================ */

export function Modal({
  label,
  onClose,
  children,
  width = "sm",
  padded = true,
  showClose = false,
}: {
  /** Accessible name for the dialog. */
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: "sm" | "md";
  /** False when the content runs edge to edge (e.g. a product image on top). */
  padded?: boolean;
  /** Draw the floating × . Leave false where the content already ends in its
   *  own Close/Cancel button — two close controls is worse than one. */
  showClose?: boolean;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-navy/55"
      style={{
        // 1rem all round, plus whatever the device reserves for notch/home bar.
        paddingTop: "calc(1rem + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))",
        paddingLeft: "calc(1rem + env(safe-area-inset-left, 0px))",
        paddingRight: "calc(1rem + env(safe-area-inset-right, 0px))",
      }}
      onClick={onClose}
    >
      {/* The frame: sized like the dialog, but NOT the scroll container, so the
          close control can sit against it and stay put while content scrolls. */}
      <div
        className={`relative flex max-h-full w-full ${
          width === "md" ? "max-w-md" : "max-w-sm"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className={`max-h-full w-full min-w-0 overflow-y-auto rounded-card bg-surface-card shadow-pop ${
            padded ? "p-6" : ""
          }`}
        >
          {children}
        </div>

        {showClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            // Quiet over the navy hero it usually starts on, still legible once
            // light content scrolls underneath it.
            // z-20 so it outranks any sticky header the content sets up (the
            // pitch dialog's tab bar is z-10) — otherwise that bar scrolls
            // under the button and silently swallows the taps.
            className="absolute right-2 top-2 z-20 flex h-11 w-11 items-center justify-center rounded-pill bg-navy/45 text-white backdrop-blur-[2px] transition hover:bg-navy/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export default Modal;
