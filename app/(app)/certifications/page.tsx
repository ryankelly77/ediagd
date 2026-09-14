/* ============================================================================
   EDIAGD — the certifications wall

   The rung is stated in words, not only drawn. "5 of 8 core — 3 from EDIAGD
   Certified" is the thing an advisor is actually playing for, and a progress
   ring alone never says how far.

   INACTIVE TRACKS MUST NOT READ AS FAILURE. Four of the twelve craft tracks and
   five of the eighteen service tracks have no content behind them, or too
   little to clear the bar. That is Mitch's writing queue, not the advisor's
   backlog, so those tiles take the badge wall's "Coming soon" treatment and are
   grouped away from the ones in play — the same decision lib/badges.ts made
   about future badges and for the same reason.
============================================================================ */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rooftopToday } from "@/lib/admin-advisor-detail";
import { loadCertifications, type CertificationTile } from "@/lib/certifications";
import { SealMedallion } from "@/components/brand/badges/SealMedallion";
import { Card } from "@/components/brand/Card";
import type { IsoDate } from "@/lib/gamification/streak";

export const metadata = { title: "Certifications" };

export default async function CertificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("membership")
    .select("rooftop_id")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  /* The rooftop's today, so a certification earned this evening in Hawaii is
     not dated tomorrow. Falls back to the server's date when the advisor has no
     membership yet — the same compromise rooftopToday itself makes. */
  const today: IsoDate = membership?.rooftop_id
    ? await rooftopToday(supabase, membership.rooftop_id)
    : (new Date().toISOString().slice(0, 10) as IsoDate);

  const view = await loadCertifications(supabase, user.id, today);

  const inPlay = view.tiles.filter((t) => t.active || t.state !== "unearned");
  const soon = view.tiles.filter((t) => !t.active && t.state === "unearned");

  const craft = inPlay.filter((t) => t.kind === "craft");
  const service = inPlay.filter((t) => t.kind === "service");

  return (
    <main className="mx-auto max-w-app px-4 pb-8 pt-6">
      <h1 className="ediagd-eyebrow">Your certifications</h1>
      <p className="mt-1 text-2xl font-extrabold text-navy">{view.rungLine}</p>
      {/* Why the headline's 8 and the Craft section's 4 differ. Both numbers
          are right; without this the screen reads as contradicting itself. */}
      {view.buildLine && (
        <p className="mt-1 text-sm text-ink-soft">{view.buildLine}</p>
      )}

      {view.credential ? (
        <Card className="mt-4 flex items-center gap-4">
          <SealMedallion
            glyphKey="credential_certified"
            name="EDIAGD Certified"
            state="earned"
            size={72}
          />
          <div className="min-w-0">
            <p className="text-base font-extrabold text-navy">EDIAGD Certified</p>
            <p className="ediagd-numeral text-xs text-ink-soft">
              {view.credential.certificateId}
            </p>
            <p className="mt-0.5 text-xs text-ink-soft">
              Current through {view.credential.currentThrough}
            </p>
          </div>
        </Card>
      ) : null}

      <Section title="Craft" tiles={craft} />
      <Section title="Service" tiles={service} />

      {soon.length > 0 && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between gap-3 px-1">
            <h2 className="ediagd-eyebrow">Coming soon</h2>
            <span className="ediagd-numeral text-xs font-bold text-ink-soft">
              {soon.length}
            </span>
          </div>
          {/* Says whose queue this is. Without this line a wall of nine locked
              seals reads as nine things the advisor has not got round to. */}
          <p className="mt-1 px-1 text-xs text-ink-soft">
            These tracks open as their coaching content lands. Nothing to do yet.
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {soon.map((t) => (
              <li key={t.id}>
                <Tile tile={t} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Section({ title, tiles }: { title: string; tiles: CertificationTile[] }) {
  if (tiles.length === 0) return null;
  const held = tiles.filter((t) => t.state !== "unearned").length;

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="ediagd-eyebrow">{title}</h2>
        <span className="ediagd-numeral text-xs font-bold text-ink-soft">
          {held} of {tiles.length}
        </span>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <li key={t.id}>
            <Tile tile={t} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * One track.
 *
 * A LAPSED TRACK RENDERS EARNED. Design law 3 — the seal it earned stays the
 * seal it earned, and the currency is a line of copy beside it. Nothing here
 * dims or crosses out something somebody holds.
 */
function Tile({ tile }: { tile: CertificationTile }) {
  const earned = tile.state !== "unearned";
  const state = earned ? "earned" : tile.active ? "locked" : "soon";

  return (
    <div className="flex flex-col items-center gap-2 rounded-card bg-white p-3 text-center shadow-card">
      <SealMedallion
        glyphKey={tile.glyphKey}
        name={tile.name}
        state={state}
        size={96}
      />
      <p className="text-sm font-bold leading-tight text-navy">{tile.name}</p>
      <p className="text-xs leading-tight text-ink-soft">{statusLine(tile)}</p>
    </div>
  );
}

/**
 * The one line under the seal.
 *
 * "Quiz remaining" exists because items and modules can disagree: every cue in
 * a course can be finished while its quiz is still unpassed, and a bar sitting
 * at 100% on a track that is not earned would be the screen arguing with
 * itself.
 */
function statusLine(t: CertificationTile): string {
  if (t.state === "current") return t.currency ?? "Earned";
  if (t.state === "lapsed") return "Renew to stay current";
  if (!t.active) return "Coming soon";

  if (t.itemCount > 0 && t.doneItems >= t.itemCount) {
    if (t.totalModules > 0 && t.doneModules < t.totalModules) return "Quiz remaining";
    return "Finishing up";
  }
  return `${t.doneItems} of ${t.itemCount} items`;
}
