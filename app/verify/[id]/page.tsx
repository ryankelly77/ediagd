/* ============================================================================
   EDIAGD — the public verify page

   THE ONLY SURFACE IN THIS PRODUCT THAT SERVES DATA TO A STRANGER. Everything
   else has an authenticated user behind it, and that difference is why every
   field here is a decision rather than a default.

   ---------------------------------------------------------------------------
   WHAT IT SHOWS, AND WHAT IT WILL NOT
   ---------------------------------------------------------------------------
   Shows: the holder's name, the level, the date earned, the current-through
   date, whether it is current or lapsed, and the seal — because the page should
   look like the certificate it corroborates.

   Never: email, rooftop, employer, dealer group, user id, or anything about any
   other advisor. A hiring manager needs to know the certificate is real and
   whose it is. WHERE SOMEBODY WORKS IS THEIR BUSINESS, and it is the single
   field that would turn this page into a recruiting list.

   That rule is not enforced here. It is enforced in verify_certificate() (0120),
   which returns six fields and has no way to be asked for a seventh — so adding
   one is a migration rather than a line in a component. This page cannot leak
   what it is never handed.

   ---------------------------------------------------------------------------
   NO ENUMERATION SURFACE OF ANY KIND
   ---------------------------------------------------------------------------
   No listing, no search by name, no "recently certified", and no hint on a miss
   about whether the id was well-formed. The throttle lives in the same function
   (30/minute, 300/hour per address) because the id is a 100,000-space a script
   could otherwise walk to count how many advisors have certified — the exact
   number the random id was chosen to hide.
============================================================================ */

import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { SealMedallion } from "@/components/brand/badges/SealMedallion";
import { currencyStatement, formatCertificateDate } from "@/lib/certificate";
import type { IsoDate } from "@/lib/gamification/streak";

/* Nothing here may be cached or prerendered: the answer depends on the caller's
   address for throttling, and on today's date for currency. */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Verify a certificate — EDIAGD",
  /* A verify page is for someone holding a specific id, never for a search
     engine building an index of who is certified. */
  robots: { index: false, follow: false },
};

type VerifyResult =
  | { status: "ok"; name: string; level: "certified" | "master"; earned_on: string;
      current_through: string; founding_class: boolean; is_current: boolean }
  | { status: "not_found" }
  | { status: "rate_limited" };

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  /*
   * The caller's address, read on the SERVER and handed to the throttle.
   *
   * It is never accepted from the browser — verify_certificate is revoked from
   * anon and authenticated precisely so that a client cannot call it directly
   * and pass whatever address it likes, which would make the limit decorative.
   */
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown";

  const service = createServiceClient();
  const { data } = await service.rpc("verify_certificate", {
    _certificate_id: id,
    _ip: ip,
  });
  const result = (data ?? { status: "not_found" }) as VerifyResult;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#FBF6EA",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1rem",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        color: "#0C2739",
      }}
    >
      <div style={{ width: "100%", maxWidth: "34rem", textAlign: "center" }}>
        {result.status === "ok" ? (
          <Verified result={result} />
        ) : result.status === "rate_limited" ? (
          <Plain
            heading="Too many lookups"
            body="Please wait a minute and try again."
          />
        ) : (
          /* ONE ANSWER FOR EVERY MISS. No "check the format", no suggestion,
             no distinction between a malformed id and a well-formed one that
             does not exist — each of those tells a script which half of the
             space to search next. */
          <Plain
            heading="No certificate found"
            body="We couldn't find a certificate with that number."
          />
        )}

        <p style={{ marginTop: "2.5rem", fontSize: "0.8rem", color: "rgba(12,39,57,0.6)" }}>
          EDIAGD · Every Day Is A Great Day
        </p>
      </div>
    </main>
  );
}

function Verified({ result }: { result: Extract<VerifyResult, { status: "ok" }> }) {
  const master = result.level === "master";
  const title = master ? "EDIAGD Master Service Advisor" : "EDIAGD Certified Service Advisor";

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E7DEC9",
        borderRadius: "1rem",
        padding: "2rem 1.5rem 1.75rem",
        boxShadow: "0 8px 30px rgba(12,39,57,0.08)",
      }}
    >
      <SealMedallion
        glyphKey={master ? "credential_master" : "credential_certified"}
        name={title}
        state="earned"
        size={120}
      />

      <p
        style={{
          marginTop: "1.25rem",
          fontSize: "0.72rem",
          letterSpacing: "0.2em",
          fontWeight: 700,
          color: "rgba(12,39,57,0.6)",
        }}
      >
        THIS CERTIFICATE IS GENUINE
      </p>

      <h1 style={{ fontSize: "1.9rem", fontWeight: 800, margin: "0.4rem 0 0" }}>
        {result.name}
      </h1>
      <p style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0C2739", marginTop: "0.35rem" }}>
        {title}
      </p>

      {result.founding_class && (
        <p
          style={{
            marginTop: "0.5rem",
            fontSize: "0.72rem",
            letterSpacing: "0.2em",
            fontWeight: 700,
            color: "#B98A2E",
          }}
        >
          FOUNDING CLASS · {String(result.earned_on).slice(0, 4)}
        </p>
      )}

      <hr style={{ border: 0, borderTop: "1px solid #E7DEC9", margin: "1.4rem 0 1.1rem" }} />

      <dl style={{ display: "grid", gap: "0.6rem", margin: 0, fontSize: "0.95rem" }}>
        <Row label="Issued" value={formatCertificateDate(result.earned_on as IsoDate)} />
        {/*
          LAPSED IS STATED, NEVER HIDDEN AND NEVER SHAMED. Clay, not red; "was
          current through" rather than "expired" or "no longer valid", both of
          which describe a withdrawal that did not happen. The credential is out
          of date, and that is all this says.
        */}
        <Row
          label="Status"
          value={currencyStatement(result.current_through as IsoDate, result.is_current)}
          tone={result.is_current ? "good" : "clay"}
        />
      </dl>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "clay";
}) {
  const color = tone === "clay" ? "#A9662B" : tone === "good" ? "#2F7D5B" : "#0C2739";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
      <dt style={{ color: "rgba(12,39,57,0.6)" }}>{label}</dt>
      <dd style={{ margin: 0, fontWeight: 700, color, textAlign: "right" }}>{value}</dd>
    </div>
  );
}

function Plain({ heading, body }: { heading: string; body: string }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E7DEC9",
        borderRadius: "1rem",
        padding: "2.5rem 1.5rem",
      }}
    >
      <h1 style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0 }}>{heading}</h1>
      <p style={{ marginTop: "0.6rem", color: "rgba(12,39,57,0.7)" }}>{body}</p>
    </div>
  );
}
