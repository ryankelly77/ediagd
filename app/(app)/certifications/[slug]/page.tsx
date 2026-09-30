/* ============================================================================
   EDIAGD — one track: what completing it takes, in the order the loop serves it

   /certifications/<slug>

   Reached from the core and Master rows on /certifications. The page answers
   the question Ryan could not answer from the wall: what do I still have to
   do. Entry film first (when Mitch has ruled one), then every module in
   certification_course.sort → module.sort_order, each in one of four states
   derived from the same predicates moduleRequirementsMet uses:

     complete        module_completion exists — the row the credential reads
     quiz waiting    every gating item done, published questions, no pass
     not started     a lesson still to watch
     reinforcement   a cue-only module: shown, linked, and marked as not
                     gating — it cannot complete and never counts in the bar

   Every module links to /library/m/[id]. THAT LINK IS THE ACCELERATION —
   Ryan's 30 September ruling in TWO_LADDERS: the daily loop is the drip, and
   an advisor may work ahead through the library at any time. The quiz gate,
   not the drip, is what makes the credential mean something.

   EVERY READ IS THE ADVISOR'S OWN CLIENT. Personal progress through RLS,
   never a service-role read — see loadTrackDetail.
============================================================================ */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTrackDetail, type TrackModuleRow } from "@/lib/certifications";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { SealMedallion } from "@/components/brand/badges/SealMedallion";
import { Card } from "@/components/brand/Card";
import { ProgressBar } from "@/components/library/CoursePieces";

export const metadata = { title: "Certification track" };

export default async function TrackPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { slug } = await params;
  const track = await loadTrackDetail(supabase, user.id, slug);
  if (!track) notFound();

  const earned = track.state !== "unearned";
  const pct =
    track.gatingTotal > 0
      ? Math.round((track.gatingDone / track.gatingTotal) * 100)
      : 0;

  /* A track that is not yet earnable, or a service certification: say what it
     is and stop. No module list, no progress, no links — nothing behind it is
     the advisor's to do (service accrues from the morning pitch instead). */
  if (track.comingSoon || track.kind === "service") {
    return (
      <main className="mx-auto max-w-app px-4 pb-12 pt-5">
        <AdminPageHeader
          back={{ href: "/certifications", label: "Certifications" }}
          title={track.name}
          subtitle={track.isMasterTrack ? "Master track" : undefined}
        />
        <Card className="mt-4 flex items-center gap-4">
          <SealMedallion
            glyphKey={track.glyphKey}
            name={track.name}
            state={earned ? "earned" : "soon"}
            size={72}
          />
          <p className="text-sm leading-relaxed text-ink-soft">
            {earned
              ? track.earnedLine
              : track.kind === "service"
                ? "A service certification — it accrues from the pitch films in your morning loop, biggest gap first. Nothing to work through here."
                : "This track opens as its coaching content lands. Nothing to do yet."}
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/certifications", label: "Certifications" }}
        title={track.name}
        subtitle={
          earned
            ? track.earnedLine ?? "Earned"
            : `${track.gatingDone} of ${track.gatingTotal} lessons complete`
        }
      />

      {/* The bar counts LESSONS — modules with a film. Reinforcement modules
          are listed below and marked, but a denominator holding modules that
          cannot complete would freeze this bar under 100% for an advisor who
          has done everything there is to do. */}
      {!earned && track.gatingTotal > 0 && (
        <div className="mt-3 px-1">
          <ProgressBar pct={pct} />
        </div>
      )}

      {track.entryFilm && (
        <Card className="mt-4 px-4">
          <div className="flex min-h-[3.5rem] items-center gap-3 py-3">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-xs font-extrabold"
              style={{
                background: track.entryFilm.watched
                  ? "color-mix(in srgb, rgb(var(--ediagd-palm)) 18%, transparent)"
                  : "color-mix(in srgb, rgb(var(--ediagd-teal)) 14%, transparent)",
                color: track.entryFilm.watched
                  ? "rgb(var(--ediagd-palm))"
                  : "rgb(var(--ediagd-ocean))",
              }}
            >
              {track.entryFilm.watched ? "✓" : "▶"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-bold text-navy">
                {track.entryFilm.title}
              </span>
              <span className="mt-0.5 block text-xs text-ink-soft">
                {track.entryFilm.watched
                  ? "Entry film · watched"
                  : "Entry film · opens the track on your first morning"}
              </span>
            </span>
          </div>
        </Card>
      )}

      <Card className="mt-4 px-4">
        <ul className="divide-y divide-line">
          {track.modules.map((m, i) => (
            <li key={m.moduleId}>
              <ModuleRow module={m} position={i + 1} />
            </li>
          ))}
        </ul>
      </Card>

      {/* ---- The story leg — the track's close ----------------------------
          One per track, at track exit, mirroring the entry film. The form
          itself carries the "please don't use customer names" line; this row
          names the leg and opens the door. */}
      {track.storyRequired && (
        <Card className="mt-4 px-4">
          <Link
            href={`/certifications/${encodeURIComponent(track.slug)}/story`}
            className="flex min-h-[3.5rem] items-center gap-3 py-3 transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-xs font-extrabold"
              style={{
                background: track.storySubmitted
                  ? "color-mix(in srgb, rgb(var(--ediagd-palm)) 18%, transparent)"
                  : "color-mix(in srgb, rgb(var(--ediagd-gold)) 22%, transparent)",
                color: track.storySubmitted
                  ? "rgb(var(--ediagd-palm))"
                  : "rgb(var(--ediagd-ocean))",
              }}
            >
              {track.storySubmitted ? "✓" : "✎"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold text-navy">
                Your Good News Story
              </span>
              <span className="mt-0.5 block text-xs text-ink-soft">
                {track.storySubmitted
                  ? "Submitted — it closes the track"
                  : "Something you did differently on the drive because of this track. No customer names."}
              </span>
            </span>
            <span aria-hidden="true" className="text-lg leading-none text-ink-soft">
              ›
            </span>
          </Link>
        </Card>
      )}
    </main>
  );
}

/**
 * One module row. All four states link into the library — working ahead is
 * the ruling, and a reinforcement module is still worth reading — but only
 * gating rows carry progress language.
 */
function ModuleRow({ module: m, position }: { module: TrackModuleRow; position: number }) {
  const detail =
    m.state === "complete"
      ? `Complete${m.hasQuiz ? " · quiz passed" : ""}`
      : m.state === "quiz_waiting"
        ? "Film watched · quiz waiting"
        : m.state === "reinforcement"
          ? "Reinforcement · doesn't gate the track"
          : m.hasQuiz
            ? "Lesson, then its quiz"
            : "Lesson";

  return (
    <Link
      href={`/library/m/${m.moduleId}`}
      className="flex min-h-[3.5rem] items-center gap-3 py-3.5 transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-xs font-extrabold"
        style={{
          background:
            m.state === "complete"
              ? "color-mix(in srgb, rgb(var(--ediagd-palm)) 18%, transparent)"
              : m.state === "quiz_waiting"
                ? "color-mix(in srgb, rgb(var(--ediagd-gold)) 22%, transparent)"
                : m.state === "reinforcement"
                  ? "color-mix(in srgb, rgb(var(--ediagd-ink-soft)) 12%, transparent)"
                  : "color-mix(in srgb, rgb(var(--ediagd-teal)) 14%, transparent)",
          color:
            m.state === "complete"
              ? "rgb(var(--ediagd-palm))"
              : "rgb(var(--ediagd-ocean))",
        }}
      >
        {m.state === "complete" ? "✓" : position}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-base ${
            m.state === "reinforcement" ? "font-semibold text-ink-soft" : "font-bold text-navy"
          }`}
        >
          {m.name}
        </span>
        <span
          className={`mt-0.5 block text-xs ${
            m.state === "quiz_waiting" ? "font-bold text-ocean" : "text-ink-soft"
          }`}
        >
          {detail}
        </span>
      </span>

      <span aria-hidden="true" className="text-lg leading-none text-ink-soft">
        ›
      </span>
    </Link>
  );
}
