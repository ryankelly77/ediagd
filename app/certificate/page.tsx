/* ============================================================================
   EDIAGD — your certificate, ready to print

   ---------------------------------------------------------------------------
   OUTSIDE THE (app) ROUTE GROUP ON PURPOSE
   ---------------------------------------------------------------------------
   Not a styling preference. app/(app)/layout.tsx renders the header and the tab
   bar around every screen inside it, and both would land on the paper. This
   route has no chrome to hide.

   ---------------------------------------------------------------------------
   GENERATED, NEVER STORED
   ---------------------------------------------------------------------------
   There is no PDF sitting in a bucket. The document is built from the
   credential row every time it is asked for, which means it cannot drift from
   the data — reprint after renewing and the new date is simply there. A stored
   file would be a second copy of the truth with its own staleness.

   ---------------------------------------------------------------------------
   WHY THE BROWSER MAKES THE PDF
   ---------------------------------------------------------------------------
   Print → Save as PDF, with @page set to exactly 11in × 8.5in and no margin.
   The alternative was a rendering dependency — Puppeteer or a PDF toolkit — and
   for one landscape page of type and two rules that is a headless Chromium in
   the serverless bundle to reproduce what the browser already does correctly.
   The tradeoff, stated: the advisor takes one extra step (the print dialog),
   and we do not ship a second rendering engine to save it.
============================================================================ */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Certificate, SIGNATURE_SRC } from "@/components/certificate/Certificate";
import { PrintButton } from "@/components/certificate/PrintButton";
import type { CertificateFacts, CredentialLevel } from "@/lib/certificate";
import type { IsoDate } from "@/lib/gamification/streak";

export const metadata = { title: "Your certificate" };

export default async function CertificatePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  /* Their own row, under advisor_credential's own RLS. No service role here:
     this page shows one person their own credential, and using the service role
     would mean the query, not the policy, decided whose. */
  const { data: cred } = await supabase
    .from("advisor_credential")
    .select("level, certificate_id, earned_at, current_through, founding_class")
    .eq("user_id", user.id)
    .order("level")
    .limit(1)
    .maybeSingle();

  /* No credential is not an error and not an empty certificate. There is
     nothing to print, and /profile does not offer the button in the first
     place — this is the direct-URL case. */
  if (!cred) redirect("/profile");

  const { data: profile } = await supabase
    .from("app_user")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const facts: CertificateFacts = {
    name: profile?.full_name ?? user.email ?? "EDIAGD Advisor",
    level: cred.level as CredentialLevel,
    certificateId: cred.certificate_id as string,
    earnedOn: (cred.earned_at as string).slice(0, 10) as IsoDate,
    currentThrough: cred.current_through as IsoDate,
    foundingClass: Boolean(cred.founding_class),
  };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.ediagd.ai";

  /* Checked on disk rather than assumed. The asset is not in the repo yet, and
     a broken-image glyph on a framed certificate is worse than a blank space
     above the rule — see Certificate's hasSignature note. */
  const hasSignature = existsSync(join(process.cwd(), "public", SIGNATURE_SRC));

  return (
    <main style={{ background: "#E7DEC9", minHeight: "100vh", padding: "1.5rem 1rem" }}>
      {/* Screen-only chrome. `.print-hide` is switched off by the stylesheet
          below, so nothing here reaches the paper. */}
      <div
        className="print-hide"
        style={{
          maxWidth: "11in",
          margin: "0 auto 1rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <a href="/profile" style={{ color: "#0C2739", fontWeight: 700, textDecoration: "none" }}>
          ← Back
        </a>
        <PrintButton />
      </div>

      {/* The sheet. Scaled DOWN to fit narrow screens and never up — an
          11-inch document blown past its size on a desktop would misrepresent
          what comes out of the printer. */}
      <div style={{ maxWidth: "11in", margin: "0 auto" }}>
        <div className="ediagd-sheet">
          <Certificate facts={facts} appUrl={appUrl} hasSignature={hasSignature} />
        </div>
      </div>

      <style>{`
        .ediagd-sheet {
          box-shadow: 0 10px 40px rgba(12, 39, 57, 0.25);
          /* Fit to the viewport on a phone without reflowing the document:
             the inches stay inches, the whole sheet is scaled. */
          transform-origin: top left;
        }
        @media (max-width: 1100px) {
          .ediagd-sheet {
            transform: scale(calc(100vw / 11.6in));
            height: calc(8.5in * (100vw / 11.6in));
          }
        }
        @media print {
          @page { size: 11in 8.5in; margin: 0; }
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          .print-hide { display: none !important; }
          main { background: #fff !important; padding: 0 !important; min-height: 0 !important; }
          .ediagd-sheet { box-shadow: none !important; transform: none !important; height: auto !important; }
          /* The grounds and the gold are the document. Without this the
             browser helpfully drops every background and prints a white page
             with some text on it. */
          .ediagd-certificate, .ediagd-certificate * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </main>
  );
}
