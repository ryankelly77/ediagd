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
     * dismissed by the backdrop, by Escape, or by whatever close control the
       caller renders
   ============================================================================ */

export function Modal({
  label,
  onClose,
  children,
  width = "sm",
  padded = true,
}: {
  /** Accessible name for the dialog. */
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: "sm" | "md";
  /** False when the content runs edge to edge (e.g. a product image on top). */
  padded?: boolean;
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
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`max-h-full w-full overflow-y-auto rounded-card bg-surface-card shadow-pop ${
          width === "md" ? "max-w-md" : "max-w-sm"
        } ${padded ? "p-6" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export default Modal;
