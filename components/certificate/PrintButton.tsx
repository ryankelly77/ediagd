"use client";

/**
 * The one interactive element on the certificate page.
 *
 * A client component purely so it can call window.print(). Kept in its own file
 * rather than making the page a client component, because the page reads the
 * credential server-side and must keep doing so — pushing that to the browser
 * would mean shipping an advisor's credential to a client that then has to be
 * trusted to ask for their own.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      style={{
        background: "#E8A317",
        color: "#0C2739",
        fontWeight: 800,
        border: "none",
        borderRadius: "999px",
        padding: "0.6rem 1.4rem",
        fontSize: "0.95rem",
        cursor: "pointer",
      }}
    >
      Print or save as PDF
    </button>
  );
}

export default PrintButton;
