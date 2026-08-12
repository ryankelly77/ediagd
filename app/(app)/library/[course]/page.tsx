import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ProgressBar } from "@/components/library/CoursePieces";
import { loadCourseBySlug, loadModules } from "@/lib/lms";

/** One course: its modules in taught order, with a clear next. Two queries. */
export default async function CoursePage({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { course: slug } = await params;
  const course = await loadCourseBySlug(supabase, slug);
  if (!course) notFound();

  const modules = await loadModules(supabase, course.courseId);
  const next = modules.find((m) => !m.completedAt);

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/library", label: "Lesson Library" }}
        title={course.name}
        subtitle={`${course.track} · ${course.completedModules} of ${course.totalModules} modules`}
      />

      <div className="mt-3 px-1">
        <ProgressBar pct={course.pct} />
      </div>

      <Card className="mt-4 px-4">
        <ul className="divide-y divide-line">
          {modules.map((m) => (
            <li key={m.moduleId}>
              <Link
                href={`/library/m/${m.moduleId}`}
                className="flex min-h-[3.5rem] items-center gap-3 py-3.5 transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-xs font-extrabold"
                  style={{
                    background: m.completedAt
                      ? "color-mix(in srgb, rgb(var(--ediagd-palm)) 18%, transparent)"
                      : "color-mix(in srgb, rgb(var(--ediagd-teal)) 14%, transparent)",
                    color: m.completedAt
                      ? "rgb(var(--ediagd-palm))"
                      : "rgb(var(--ediagd-ocean))",
                  }}
                >
                  {m.completedAt ? "✓" : m.sortOrder}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold text-navy">
                    {m.name}
                  </span>
                  <span className="ediagd-numeral mt-0.5 block text-xs text-ink-soft">
                    {m.completedItems} of {m.totalItems}
                    {m.hasQuiz && (m.quizPassed ? " · quiz passed" : " · quiz to take")}
                    {next?.moduleId === m.moduleId && " · next up"}
                  </span>
                  {!m.completedAt && <ProgressBar pct={m.pct} />}
                </span>

                <span aria-hidden="true" className="text-lg leading-none text-ink-soft">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
