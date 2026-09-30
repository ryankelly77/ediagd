/* ============================================================================
   EDIAGD — the certifications page says where you stand

   Rebuilt 30 September after Ryan reviewed it and could not tell which
   credential he was working toward, how far along he was, or what was next.
   Three faults, fixed in order:

     1  The tile led with items — "30 of 59" — and since 0143 a cue gates
        nothing, so the number described the scenery, not the climb. Tiles now
        lead with MODULES ("1 of 7 modules"), which is what the credential
        actually counts.
     2  Tiles went nowhere. Each core track now links to
        /certifications/[slug] — what completing the track takes, in the order
        the loop will serve it.
     3  Nothing named the credential. The page now opens with the credential
        the advisor is inside — EDIAGD Certified, a bar of modules complete
        over modules total across the nine core tracks, and the sentence
        "N of 9 core tracks complete."

   INACTIVE TRACKS STILL NEVER READ AS FAILURE, and the old mixed "Coming soon"
   bucket is split: Master tracks under Master (a different ladder, not absent
   content), empty service families under Service. Clay never red; mobile
   first; BRAND tokens only.
============================================================================ */

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rooftopToday } from "@/lib/admin-advisor-detail";
import {
  loadCertificationsOverview,
  type CertificationTile,
  type CoreTrackTile,
} from "@/lib/certifications";
import { SealMedallion } from "@/components/brand/badges/SealMedallion";
import { Card } from "@/components/brand/Card";
import { ProgressBar } from "@/components/library/CoursePieces";
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

  const view = await loadCertificationsOverview(supabase, user.id, today);

  const barPct =
    view.coreModulesTotal > 0
      ? Math.round((view.coreModulesDone / view.coreModulesTotal) * 100)
      : 0;

  return (
    <main className="mx-auto max-w-app px-4 pb-8 pt-6">
      <h1 className="ediagd-eyebrow">Your certifications</h1>

      {/* ---- The credential you are inside --------------------------------
          One card, first, because it is the thing every tile below feeds.
          The bar counts MODULES over the nine core tracks — the same
          population the credential computation requires — never items. */}
      <Card className="mt-3 p-4">
        <div className="flex items-center gap-4">
          <SealMedallion
            glyphKey="credential_certified"
            name="EDIAGD Certified"
            state={view.credential ? "earned" : "locked"}
            size={72}
          />
          <div className="min-w-0 flex-1">
            <p className="text-base font-extrabold text-navy">EDIAGD Certified</p>
            <p className="mt-0.5 text-sm text-ink-soft">
              {view.coreHeld} of {view.coreCount} core tracks complete
            </p>
            {view.credential && (
              <>
                <p className="ediagd-numeral mt-0.5 text-xs text-ink-soft">
                  {view.credential.certificateId}
                </p>
                <p className="text-xs text-ink-soft">{view.credential.currency}</p>
              </>
            )}
          </div>
        </div>
        <div className="mt-3">
          <ProgressBar pct={barPct} />
          {/* Lessons — gating modules — the exact population craftComplete()
              requires. Cue-only modules cannot complete (0143) and sit in no
              denominator on any of these screens. */}
          <p className="ediagd-numeral mt-1 text-xs text-ink-soft">
            {view.coreModulesDone} of {view.coreModulesTotal} lessons across the
            nine tracks
          </p>
        </div>
        {view.buildLine && (
          <p className="mt-2 text-xs text-ink-soft">{view.buildLine}</p>
        )}
      </Card>

      {/* One line for the tier above, while it is above. Master is defined and
          unreachable in code (computeCredential says so); this page shows its
          tracks below and claims nothing about the credential itself. */}
      {!view.credential && (
        <p className="mt-2 px-1 text-xs text-ink-soft">
          Master Certification opens after EDIAGD Certified.
        </p>
      )}

      {/* ---- The nine core tracks, in the order the loop walks them ------- */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between gap-3 px-1">
          <h2 className="ediagd-eyebrow">Core tracks</h2>
          <span className="ediagd-numeral text-xs font-bold text-ink-soft">
            {view.coreHeld} of {view.coreTracks.length}
          </span>
        </div>
        <Card className="mt-3 px-4">
          <ul className="divide-y divide-line">
            {view.coreTracks.map((t) => (
              <li key={t.id}>
                <CoreTrackRow tile={t} />
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {/* ---- Master — a ladder above, never a backlog ---------------------- */}
      {(view.masterActive.length > 0 || view.masterSoon.length > 0) && (
        <section className="mt-8">
          <h2 className="ediagd-eyebrow px-1">Master</h2>
          <p className="mt-1 px-1 text-xs text-ink-soft">
            The tier above EDIAGD Certified. Its tracks are listed here as they
            open; the credential itself is defined later.
          </p>
          {view.masterActive.length > 0 && (
            <Card className="mt-3 px-4">
              <ul className="divide-y divide-line">
                {view.masterActive.map((t) => (
                  <li key={t.id}>
                    <MasterTrackRow tile={t} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {view.masterSoon.length > 0 && (
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {view.masterSoon.map((t) => (
                <li key={t.id}>
                  <SoonTile tile={t} note="Master track" />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ---- The service ladder, clearly not the curriculum ---------------- */}
      {(view.serviceActive.length > 0 || view.serviceSoon.length > 0) && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between gap-3 px-1">
            <h2 className="ediagd-eyebrow">Service ladder</h2>
            <span className="ediagd-numeral text-xs font-bold text-ink-soft">
              {view.serviceActive.filter((t) => t.state !== "unearned").length} of{" "}
              {view.serviceActive.length}
            </span>
          </div>
          <p className="mt-1 px-1 text-xs text-ink-soft">
            Derived from your numbers — the morning pitch works these families,
            biggest gap first.
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {view.serviceActive.map((t) => (
              <li key={t.id}>
                <ServiceTile tile={t} />
              </li>
            ))}
          </ul>
          {view.serviceSoon.length > 0 && (
            <>
              <p className="mt-4 px-1 text-xs text-ink-soft">
                These families open as their coaching content lands. Nothing to
                do yet.
              </p>
              <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {view.serviceSoon.map((t) => (
                  <li key={t.id}>
                    <SoonTile tile={t} note="Opens with content" />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </main>
  );
}

/**
 * One core track: modules first, then what is next, and the whole row is the
 * door to the track page. The next-line comes from the same predicates the
 * loop uses (see loadCertificationsOverview) — this component only renders it.
 */
function CoreTrackRow({ tile }: { tile: CoreTrackTile }) {
  const earned = tile.state !== "unearned";
  /* Lessons — the same number craftComplete() and the track page count. A
     track with no lessons yet says so instead of showing "0 of 0". */
  const line = earned
    ? tile.currency ?? "Earned"
    : !tile.active
      ? "Coming soon"
      : tile.gatingModules === 0
        ? "No lessons yet"
        : `${tile.gatingDone} of ${tile.gatingModules} lessons`;

  return (
    <Link
      href={`/certifications/${encodeURIComponent(tile.slug)}`}
      className="flex min-h-[3.5rem] items-center gap-3 py-3.5 transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      <SealMedallion
        glyphKey={tile.glyphKey}
        name={tile.name}
        state={earned ? "earned" : tile.active ? "locked" : "soon"}
        size={48}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold text-navy">
          {tile.name}
        </span>
        <span className="ediagd-numeral mt-0.5 block text-xs text-ink-soft">
          {line}
        </span>
        {tile.nextLine && (
          <span className="mt-0.5 block text-xs font-bold text-ocean">
            {tile.nextLine}
          </span>
        )}
      </span>
      <span aria-hidden="true" className="text-lg leading-none text-ink-soft">
        ›
      </span>
    </Link>
  );
}

/** An active Master track: same row shape, same lesson numbers, marked as Master. */
function MasterTrackRow({ tile }: { tile: CoreTrackTile }) {
  const earned = tile.state !== "unearned";
  return (
    <Link
      href={`/certifications/${encodeURIComponent(tile.slug)}`}
      className="flex min-h-[3.5rem] items-center gap-3 py-3.5 transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      <SealMedallion
        glyphKey={tile.glyphKey}
        name={tile.name}
        state={earned ? "earned" : "locked"}
        size={48}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold text-navy">
          {tile.name}
        </span>
        <span className="ediagd-numeral mt-0.5 block text-xs text-ink-soft">
          {earned
            ? tile.currency ?? "Earned"
            : `Master track · ${tile.gatingDone} of ${tile.gatingModules} lessons`}
        </span>
      </span>
      <span aria-hidden="true" className="text-lg leading-none text-ink-soft">
        ›
      </span>
    </Link>
  );
}

/**
 * A service certification. Unlinked: the service ladder is worked from the
 * morning pitch and the family shelf, not from a curriculum page — a track
 * page full of films the derivation reorders would claim an order the pitch
 * does not keep.
 */
function ServiceTile({ tile }: { tile: CertificationTile }) {
  const earned = tile.state !== "unearned";
  return (
    <div className="flex flex-col items-center gap-2 rounded-card bg-white p-3 text-center shadow-card">
      <SealMedallion
        glyphKey={tile.glyphKey}
        name={tile.name}
        state={earned ? "earned" : "locked"}
        size={96}
      />
      <p className="text-sm font-bold leading-tight text-navy">{tile.name}</p>
      <p className="text-xs leading-tight text-ink-soft">
        {earned
          ? tile.currency ?? "Earned"
          : `${tile.doneItems} of ${tile.itemCount} items`}
      </p>
    </div>
  );
}

/** A not-yet-earnable track — somebody's writing queue, never a backlog. */
function SoonTile({ tile, note }: { tile: CertificationTile; note: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card bg-white p-3 text-center shadow-card">
      <SealMedallion glyphKey={tile.glyphKey} name={tile.name} state="soon" size={96} />
      <p className="text-sm font-bold leading-tight text-navy">{tile.name}</p>
      <p className="text-xs leading-tight text-ink-soft">{note}</p>
    </div>
  );
}
