import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ComingSoon } from "@/components/library/LibraryPieces";
import { ProgressBar, ContinueCard } from "@/components/library/CoursePieces";
import { loadCourses, loadContinuePoint } from "@/lib/lms";

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

  const [courses, resume] = await Promise.all([
    loadCourses(supabase),
    loadContinuePoint(supabase),
  ]);

  const tracks = [...new Set(courses.map((c) => c.track))];

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/more", label: "More" }}
        title="Lesson Library"
        subtitle="Courses built from the cues, in the order they're taught."
      />

      {resume && <ContinueCard module={resume} />}

      {courses.length === 0 ? (
        <ComingSoon title="The curriculum is being loaded">
          <p>Courses appear here once the curriculum map is imported.</p>
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
                          <span className="block truncate text-base font-bold text-navy">
                            {c.name}
                          </span>
                          <span className="ediagd-numeral mt-0.5 block text-xs text-ink-soft">
                            {c.completedModules} of {c.totalModules}{" "}
                            {c.totalModules === 1 ? "module" : "modules"}
                          </span>
                          <ProgressBar pct={c.pct} />
                        </span>
                        <span className="ediagd-numeral w-10 shrink-0 text-right text-sm font-extrabold text-navy">
                          {c.pct}%
                        </span>
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
