/* ============================================================================
   EDIAGD — the certificate, as it prints

   ---------------------------------------------------------------------------
   SIZED IN INCHES, NOT PIXELS
   ---------------------------------------------------------------------------
   11in × 8.5in, and every measurement inside it is in `in` or `pt`. This is the
   one document in the product whose physical size is the requirement: a
   px-sized certificate is correct on exactly one screen and wrong on paper,
   which is the only place it matters. The print stylesheet sets the same size
   on @page so the browser's Save-as-PDF produces a document with no margin
   fighting the frame.

   ---------------------------------------------------------------------------
   TWO LEVELS, ONE SKELETON
   ---------------------------------------------------------------------------
   Certified is cream ground with navy and gold. Master is the same layout on
   navy with a heavier gold frame and the mark reversed, so the two are
   distinguishable across a room rather than by reading them. The skeleton is
   shared because they are the same document at different ranks — if the layout
   ever diverges, that is a decision somebody should have to make on purpose.

   MASTER IS UNREACHABLE THIS PHASE. Nothing computes it (see lib/certification
   — the level exists in the type and the DB constraint and is granted by
   nothing), so this template has never been rendered against a real credential.
   It is built to the mockup and tested against a fixture.
============================================================================ */

import { Logo } from "@/components/brand/Logo";
import {
  certificateCopy,
  formatCertificateDate,
  foundingClassMark,
  verifyUrl,
  type CertificateFacts,
} from "@/lib/certificate";

/** Where the founder's signature lives. See the note at the render site. */
export const SIGNATURE_SRC = "/brand/mitch-hardt-signature.png";

export function Certificate({
  facts,
  appUrl,
  hasSignature = true,
}: {
  facts: CertificateFacts;
  /** Absolute origin, so the printed URL is right in every environment. */
  appUrl: string;
  /**
   * Whether the signature asset is actually on disk.
   *
   * A MISSING ASSET MUST NOT PRINT A BROKEN IMAGE. This is the one document in
   * the product that gets framed on a wall, and a browser's broken-image glyph
   * on it is worse than no signature at all. When false the rule and the role
   * still render — the signature block keeps its shape — and the ink is simply
   * absent. The page decides this by looking on disk; see app/certificate.
   */
  hasSignature?: boolean;
}) {
  const master = facts.level === "master";
  const copy = certificateCopy(facts.level);
  const verify = verifyUrl(facts.certificateId, appUrl);

  /* The palette, resolved once. Master inverts ground and ink; the gold and the
     teal are the same inks in both, because they are the brand's and not the
     tier's. */
  const ground = master ? "#0C2739" : "#FBF6EA";
  const ink = master ? "#FFFFFF" : "#0C2739";
  const inkSoft = master ? "rgba(255,255,255,0.72)" : "rgba(12,39,57,0.72)";
  const gold = "#E8A317";
  const goldSoft = master ? "rgba(232,163,23,0.85)" : "rgba(199,158,88,0.9)";
  const titleColor = master ? gold : ink;

  return (
    <article
      className="ediagd-certificate"
      style={{
        width: "11in",
        height: "8.5in",
        background: ground,
        color: ink,
        position: "relative",
        boxSizing: "border-box",
        padding: "0.42in",
        fontFamily: "var(--font-body, ui-sans-serif, system-ui, sans-serif)",
      }}
    >
      {/* ---- The frame ----------------------------------------------------
          Two rules, not one. The outer is heavier on Master — the single
          cheapest way to make the rank read from across a room, which is the
          job the spec gives it. */}
      <div
        style={{
          position: "absolute",
          inset: "0.42in",
          border: `${master ? "3pt" : "1.5pt"} solid ${gold}`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: "0.56in",
          border: `0.75pt solid ${master ? "rgba(232,163,23,0.55)" : goldSoft}`,
        }}
      />

      {/* ---- Contents ---------------------------------------------------- */}
      <div
        style={{
          position: "relative",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "0.55in 0.9in 0.5in",
          textAlign: "center",
        }}
      >
        {/* The mark. On Master the ring goes white and the disc goes navy by
            overriding the two tokens Logo draws from — rather than forking the
            SVG, which would be a second copy of the geometry to drift. */}
        <div
          style={
            master
              ? ({
                  ["--ediagd-navy" as string]: "255 255 255",
                  ["--ediagd-cream" as string]: "12 39 57",
                } as React.CSSProperties)
              : undefined
          }
        >
          <Logo size={96} />
        </div>

        <div
          style={{
            fontFamily: "var(--font-display, Marcellus, Georgia, serif)",
            fontSize: "26pt",
            letterSpacing: "0.22em",
            marginTop: "0.12in",
            color: ink,
          }}
        >
          EDIAGD
        </div>
        <div
          style={{
            fontSize: "8pt",
            letterSpacing: "0.28em",
            fontWeight: 700,
            color: master ? "#7FD4D0" : "#2F8E86",
            marginTop: "0.04in",
          }}
        >
          EVERY DAY IS A GREAT DAY
        </div>

        {/* Ornament. Master takes the diamond — the mockup's one flourish. */}
        <div
          style={{
            marginTop: "0.16in",
            display: "flex",
            alignItems: "center",
            gap: "0.1in",
          }}
        >
          <span style={{ display: "block", width: "0.6in", height: "1.2pt", background: gold }} />
          {master && (
            <span
              style={{
                display: "block",
                width: "6pt",
                height: "6pt",
                background: gold,
                transform: "rotate(45deg)",
              }}
            />
          )}
          {master && (
            <span style={{ display: "block", width: "0.6in", height: "1.2pt", background: gold }} />
          )}
        </div>

        <div
          style={{
            marginTop: "0.42in",
            fontSize: "9pt",
            letterSpacing: "0.26em",
            fontWeight: 700,
            color: master ? inkSoft : goldSoft,
          }}
        >
          THIS CERTIFIES THAT
        </div>

        {/* The name. The largest thing on the page, because it is the point. */}
        <h1
          data-testid="certificate-name"
          style={{
            fontFamily: "var(--font-display, Marcellus, Georgia, serif)",
            fontWeight: 400,
            fontSize: "44pt",
            lineHeight: 1.05,
            margin: "0.12in 0 0",
            color: ink,
          }}
        >
          {facts.name}
        </h1>

        <div
          style={{
            width: "5.2in",
            height: "0.75pt",
            background: goldSoft,
            margin: "0.18in 0 0.22in",
          }}
        />

        {copy.body.map((line) => (
          <p key={line} style={{ margin: "0.06in 0", fontSize: "12pt", color: inkSoft }}>
            {line}
          </p>
        ))}

        <h2
          data-testid="certificate-title"
          style={{
            fontFamily: "var(--font-display, Marcellus, Georgia, serif)",
            fontWeight: 400,
            fontSize: "26pt",
            margin: "0.24in 0 0",
            color: titleColor,
          }}
        >
          {copy.title}
        </h2>

        {/* FOUNDING CLASS, only when it is true. Not a greyed-out slot: a
            certificate is not a progress screen, and an absent mark is the
            correct rendering of not being in the founding class. */}
        {facts.foundingClass && (
          <div
            data-testid="certificate-founding"
            style={{
              marginTop: "0.1in",
              fontSize: "8.5pt",
              letterSpacing: "0.24em",
              fontWeight: 700,
              color: master ? inkSoft : goldSoft,
            }}
          >
            {foundingClassMark(facts.earnedOn)}
          </div>
        )}

        {/* ---- Footer: id · signature · dates --------------------------- */}
        <div
          style={{
            marginTop: "auto",
            width: "100%",
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "end",
            gap: "0.3in",
          }}
        >
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: "7.5pt", letterSpacing: "0.2em", fontWeight: 700, color: inkSoft }}>
              CERTIFICATE NO.
            </div>
            <div
              data-testid="certificate-id"
              style={{ fontSize: "12pt", letterSpacing: "0.12em", marginTop: "0.04in", color: ink }}
            >
              {facts.certificateId}
            </div>
            {/* The URL is on the FACE, not only in the app. A certificate whose
                verification lives somewhere you have to be told about is a
                certificate nobody checks. */}
            <div
              data-testid="certificate-verify"
              style={{ fontSize: "8.5pt", marginTop: "0.06in", color: inkSoft }}
            >
              Verify at {verify.display}
            </div>
          </div>

          <div style={{ textAlign: "center" }}>
            {/*
              MITCH'S SIGNATURE, above a rule, with his ROLE beneath — not his
              name repeated, because the signature already says it.

              eslint-disable: next/image would put a loader in front of a static
              transparent PNG that must print at an exact physical size.
            */}
            {hasSignature ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={SIGNATURE_SRC}
                alt=""
                data-testid="certificate-signature"
                style={{
                  height: "0.62in",
                  display: "block",
                  margin: "0 auto 0.04in",
                  /* The asset is navy ink. On the navy ground it has to reverse,
                     and inverting is what keeps ONE asset instead of two that can
                     drift apart. */
                  filter: master ? "invert(1) brightness(1.6)" : undefined,
                }}
              />
            ) : (
              /* Holds the signature's exact height so the footer does not jump
                 when the asset lands — the layout is already correct. */
              <div
                data-testid="certificate-signature-missing"
                style={{ height: "0.62in", marginBottom: "0.04in" }}
              />
            )}
            <div style={{ width: "2.6in", height: "0.75pt", background: goldSoft, margin: "0 auto" }} />
            <div
              style={{
                fontSize: "7.5pt",
                letterSpacing: "0.2em",
                fontWeight: 700,
                color: inkSoft,
                marginTop: "0.06in",
              }}
            >
              FOUNDER, EDIAGD
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "7.5pt", letterSpacing: "0.2em", fontWeight: 700, color: inkSoft }}>
              ISSUED
            </div>
            <div
              data-testid="certificate-earned"
              style={{ fontSize: "12pt", marginTop: "0.04in", color: ink }}
            >
              {formatCertificateDate(facts.earnedOn)}
            </div>
            <div
              data-testid="certificate-through"
              style={{ fontSize: "8.5pt", marginTop: "0.06in", color: inkSoft }}
            >
              Current through {formatCertificateDate(facts.currentThrough)}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export default Certificate;
