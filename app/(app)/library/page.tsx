import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ComingSoon } from "@/components/library/LibraryPieces";
import { ProgressBar, ContinueCard } from "@/components/library/CoursePieces";
import { loadCourses, loadContinuePoint } from "@/lib/lms";
import { isAdminViewer } from "@/lib/access";
import { RecordOpen } from "@/components/events/RecordOpen";

/**
 * The library landing: tracks, then courses, with progress.
 *
 * TWO QUERIES for the whole screen — one for every course's progress (0035
 * groups it in Postgres) and one for the continue point. At 42 courses and 253
 * modules a per-course count would have been 42 round trips for a progress bar.
 */
export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  /*
   * ADMIN SEES EVERYTHING, an advisor sees tracks that have lessons.
   *
   * isAdminViewer is checked against THIS viewer rather than inferred, because
   * two of the three accounts holding `admin` on production also hold
   * `advisor` — so "an admin is not an advisor" would have been false for the
   * people most likely to open this screen, and the gate would have decided
   * something about a role it was never asked about.
   */
  const admin = await isAdminViewer(supabase, user.id);

  const [courses, resume] = await Promise.all([
    loadCourses(supabase, { includeHidden: admin }),
    loadContinuePoint(supabase),
  ]);

  const tracks = [...new Set(courses.map((c) => c.track))];

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      {/* "who clicked on Certs and other courses" — this is the other courses
          half. Renders nothing; see components/events/RecordOpen.tsx. */}
      <RecordOpen kind="library_opened" />
      <AdminPageHeader
        back={{ href: "/more", label: "More" }}
        title="Lesson Library"
        subtitle="Every track, lesson by lesson."
      />

      {resume && <ContinueCard module={resume} />}

      {courses.length === 0 ? (
        <ComingSoon title="No tracks yet">
          {/* Reworded with rule 1: the list can now be empty because every
              track is still waiting on its films, which is a different thing
              from the curriculum not having been imported. */}
          <p>A track appears here as soon as one of its lessons has a film.</p>
        </ComingSoon>
      ) : (
        tracks.map((track) => (
          <section key={track}>
            <h2 className="ediagd-eyebrow mt-8 px-1">{track}</h2>
            <Card className="mt-2 px-4">
              <ul className="divide-y divide-line">
                {courses
                  .filter((c) => c.track === track)
                  .map((c) => (
                    <li key={c.courseId}>
                      <Link
                        href={`/library/${c.slug}`}
                        className="flex min-h-[3.5rem] items-center gap-3 py-3.5 transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                      >
                        <span className="min-w-0 flex-1">
                          {/* WRAPS, NEVER TRUNCATES. Telling somebody what the film is called
    is this screen's whole job, and at 150% the box was 201px against
    302px of title — "The Multi-Point Ins…". A card can afford to be
    two lines taller; a library that hides its own titles cannot. */}
                          <span className="block text-base font-bold text-navy">
                            {c.name}
                          </span>
                          {/* LESSONS, not modules — advisor-facing copy. The
                              denominator is now the gating count (0160), so
                              "0 of 9 lessons" is a number they can reach. */}
                          <span className="ediagd-numeral mt-0.5 block text-xs text-ink-soft">
                            {c.completedModules} of {c.totalModules}{" "}
                            {c.totalModules === 1 ? "lesson" : "lessons"}
                          </span>
                          <ProgressBar pct={c.pct} />
                        </span>
                        {/* The printed percentage is gone. The bar says the
                            same thing and "0%" beside "0 of 9 lessons" was the
                            figure that read as a broken screen. */}
                        <span aria-hidden="true" className="text-lg leading-none text-ink-soft">
                          ›
                        </span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </Card>
          </section>
        ))
      )}
    </main>
  );
}
