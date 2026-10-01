import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FeedbackForm } from "@/components/feedback/FeedbackForm";

/* ============================================================================
   EDIAGD — Feedback

   Beaumont's handout tells advisors: if something does not work, open More, tap
   Feedback, say what happened. This is that screen. One note, an optional
   screenshot, Send. Everything the product already knows — who you are, your
   rooftop, the screen you came from — is attached server-side, never asked for.

   `?from=` carries the route the advisor came from, so the report says where
   they were and the thank-you can send them back there. Defaults to /more.
   ============================================================================ */

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { from: fromParam } = await searchParams;
  // Only an in-app path; anything else falls back to More. The action re-checks
  // this, so the screen is not the control — this is just a clean default.
  const from = fromParam && /^\/(?!\/)/.test(fromParam) ? fromParam : "/more";

  return (
    <main className="mx-auto max-w-app px-4 pb-10 pt-6">
      <h1 className="text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
        Feedback
      </h1>
      <p className="mt-2 text-base leading-relaxed text-ink-soft">
        Something not working, or just not right? Tell us what happened — we read
        every one.
      </p>
      <div className="mt-5">
        <FeedbackForm from={from} />
      </div>
    </main>
  );
}
