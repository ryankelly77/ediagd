import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/guards";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { loadReviewQueue } from "@/lib/story";
import { StoryReviewCard } from "@/components/admin/StoryReviewCard";

/* ============================================================================
   EDIAGD — the Good News Story review queue

   /admin/stories

   Ryan, 9 November: "Mitch reads every story. He is not grading them. He marks
   each one Good, or Kickback when it is not substantial."

   0127 built the record, the RLS and a review stamp, and ruled that review
   gates nothing. Nothing in the product ever read a story, so Valerie's three
   at Beaumont had an audience of one. This is the surface that stamp was for.

   ---------------------------------------------------------------------------
   THE ROWS COME THROUGH MITCH'S OWN CLIENT, AND THAT IS THE POINT
   ---------------------------------------------------------------------------
   loadReviewQueue takes the viewer's session, never the service role. 0180's
   entire substance is a fourth arm on 0127's read policy —
   `or is_platform_owner()` — and a service-role read would render exactly the
   same page whether that arm exists or not. A screen that looks right with the
   policy reverted is not evidence of the policy.

   So this page IS the acceptance test's twin: npm run accept:story proves the
   arm over PostgREST as a platform owner, and proves a rooftop admin at store A
   still reads nothing at store B. The page would go empty if either changed.

   ---------------------------------------------------------------------------
   HE IS NOT GRADING THEM, AND THE SCREEN HAS TO LOOK LIKE THAT
   ---------------------------------------------------------------------------
   No score, no rubric, no counts of how many each advisor got wrong. Two
   buttons and an optional sentence. A KICKBACK IS NEVER RED — `clay` is the
   brand's warm attention and its token says "NEVER red" in the stylesheet
   itself. An advisor's own account of their work coming back marked in an error
   colour would make the one personal record in the product feel like a failed
   validation, which is the opposite of asking them for more.

   NO CHARACTER MINIMUM EXISTS AND NONE IS COMING. lib/story-actions.ts says
   why at length; the short version is that a `length` measures typing and Mitch
   can tell "I learned a lot" from a brief real answer. This page is that check.
   ============================================================================ */

/*
 * EVERY LOAD IS FRESH. The queue is a work list — a cached render would show
 * Mitch a story he marked two minutes ago still sitting in "waiting", and the
 * obvious response to that is to press the button again.
 */
export const dynamic = "force-dynamic";

/*
 * EVERY DATE IS FORMATTED HERE AND HANDED DOWN AS TEXT.
 *
 * StoryReviewCard is a client component. A toLocaleDateString inside it renders
 * in the SERVER's timezone during SSR and the BROWSER's on hydration, which
 * mismatches on every machine not set to the server's zone. Formatting on the
 * server costs a prop and removes the whole class.
 */
function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function AdminStoriesPage() {
  /*
   * ---- PLATFORM OWNER ONLY, AND A ROOFTOP ADMIN IS SENT HOME ------------
   *
   * Every other tool on /admin is open to a dealer's admin. This one is not,
   * and the reason is the same one the Sand Dollar economy gives: a rooftop
   * admin loading this would NOT get an error. Arm 2 of the read policy would
   * answer for them and they would get their own store's stories rendered under
   * a heading that says nothing about scope — a partial list presented as the
   * queue, which is the confident wrong answer.
   *
   * Their stories are already theirs to read; a store-scoped version of this
   * screen is a thing to build on purpose, with a heading that says whose it
   * is, and not something to arrive at by accident.
   *
   * `/admin` is the existing not-authorized path — the same answer /admin/economy
   * gives, and the same one the link itself would have given.
   */
  const { userId, isPlatformOwner, supabase } = await getAdminContext();
  if (!userId) redirect("/login");
  if (!isPlatformOwner) redirect("/admin");

  const stories = await loadReviewQueue(supabase as never);

  const waiting = stories.filter((s) => s.reviewStatus === "pending");
  const reviewed = stories.filter((s) => s.reviewStatus !== "pending");

  /* One card, one set of finished labels. Built here so the two lists below
     cannot format the same story two different ways. */
  const card = (s: (typeof stories)[number]) => (
    <StoryReviewCard
      key={s.id}
      story={s}
      submittedLabel={when(s.submittedAt)}
      reviewedLabel={when(s.reviewedAt)}
      revisionLabels={s.revisions.map((v) => when(v.replacedAt))}
    />
  );

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/admin", label: "Admin" }}
        title="Good News Stories"
        subtitle={
          stories.length === 0
            ? "Nothing written yet."
            : `${stories.length} ${stories.length === 1 ? "story" : "stories"} across every rooftop`
        }
      />

      {/*
        ---- THE EMPTY STATE IS NOT A FAILURE, AND IT SAYS SO ----------------

        No track completes before February and a story is written at TRACK EXIT,
        so "nothing here" is the expected reading for months. An empty list with
        no sentence under it reads as a broken query — which is exactly what
        somebody would go looking for.
      */}
      {stories.length === 0 ? (
        <section className="mt-6 rounded-card border border-line bg-surface-card p-5 shadow-card">
          <p className="text-base font-extrabold text-navy">No stories yet</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            An advisor writes their Good News Story when they finish a track, so
            the first ones arrive as the first tracks close. Nothing is wrong
            with this screen — there is simply nothing to read.
          </p>
        </section>
      ) : (
        <>
          {/* ---- Waiting on Mitch ---------------------------------------- */}
          <section className="mt-7">
            <h2 className="text-lg font-extrabold text-navy">
              {/*
                THE COUNT IS THE HEADING, because it is the only number on this
                screen that is anybody's to act on. Zero waiting is worth
                saying out loud rather than hiding the section: "all read" is a
                result, and an absent heading reads as a list that failed to
                render.
              */}
              {waiting.length === 0
                ? "Nothing waiting"
                : `${waiting.length} waiting`}
            </h2>
            {waiting.length === 0 ? (
              <p className="mt-1 text-sm text-ink-soft">
                Every story has been read.
              </p>
            ) : (
              <div className="mt-3 space-y-4">{waiting.map(card)}</div>
            )}
          </section>

          {/* ---- Already read -------------------------------------------- */}
          {reviewed.length > 0 && (
            <section className="mt-9">
              <h2 className="text-lg font-extrabold text-navy">Already read</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                {/*
                  SAYS THAT A DECISION CAN BE CHANGED, because the alternative
                  is Mitch assuming it cannot. A rewrite comes back as pending
                  and he may mark it Good; he may also have been too hard on one
                  and want to say so. Neither is an edge case.
                */}
                You can change any of these — a rewrite comes back up top, and
                reversing yourself is one tap.
              </p>
              <div className="mt-3 space-y-4">{reviewed.map(card)}</div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
