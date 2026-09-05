import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/guards";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminsOnly } from "@/components/admin/content/AdminsOnly";
import { Card } from "@/components/brand/Card";
import { ReviewItem, type ReviewRow } from "@/components/admin/content/ReviewItem";
import { DuplicateGroupCard } from "@/components/admin/content/DuplicateGroupCard";
import { TwinProposalCard } from "@/components/admin/content/TwinProposalCard";
import { loadDuplicateQueue } from "@/lib/duplicates";
import { loadTwinProposals } from "@/lib/twins";

/* ============================================================================
   EDIAGD — Needs you

   The queue that replaced the spreadsheet. Everything the imports could not
   decide on their own, attached to the row it is about, answerable in place.

   GROUPED BY THE KIND OF QUESTION, not by content type, because the kind of
   question is what decides how long an answer takes. "Pick A or B" is nine
   items and five minutes; "write a coaching nugget" is fifteen items and an
   afternoon. Sorting cues and quotes into separate piles would scatter both
   jobs across two lists and make neither look finishable.
   ============================================================================ */

const GROUPS: {
  reason: ReviewRow["reason"];
  title: string;
  blurb: string;
}[] = [
  {
    reason: "pick_ending",
    title: "Pick the ending",
    blurb:
      "Two versions of the same cue exist, word-for-word identical and then different. Nothing is broken — two endings got written in two places. Both read as correct, so only you can say which one you meant.",
  },
  {
    reason: "truncated",
    title: "Send us the missing words",
    blurb:
      "These were cut off before they ever reached us, each one stopping at a round number of characters — a machine did it, not you. There is no longer version in any file we hold.",
  },
  {
    reason: "attribution",
    title: "Who said it",
    blurb:
      "The same words appear twice in the workbook under two different names. We kept the lower Quote ID, which is a filing rule and not evidence.",
  },
  {
    reason: "missing_nugget",
    title: "Why is this quote here",
    blurb:
      "These quotes serve to advisors with nothing explaining what they are for. The quote still shows; the coaching around it is blank.",
  },
  {
    reason: "needs_op_code",
    title: "Map to an op code",
    blurb: "Imported with no op code.",
  },
];

export default async function ContentReviewPage() {
  const { supabase, userId, hasAdminAccess } = await getAdminContext();
  if (!userId) redirect("/login");
  if (!hasAdminAccess) return <AdminsOnly />;

  /*
   * One query, embedding the content row. The queue is tens of items, not
   * thousands — it is bounded by how much a person can answer, which is the
   * point of it existing.
   */
  const [{ data }, duplicates, twins] = await Promise.all([
    supabase
      .from("content_review")
      .select(
        "id, content_id, reason, detail, options, content:content_id(title, body, coaching_nugget, voice, source, type)"
      )
      .eq("status", "open")
      /* The twin proposals come back through loadTwinProposals, which fetches
         the candidate quotes this query knows nothing about. Excluding them
         here keeps one row from being rendered twice and, more to the point,
         keeps `total` counting only what the page actually shows. */
      .neq("reason", "unlinked_twin")
      .order("reason")
      .limit(500),
    loadDuplicateQueue(supabase),
    loadTwinProposals(supabase),
  ]);

  const rows: ReviewRow[] = (data ?? []).map((r) => {
    // PostgREST returns an embedded to-one as an object, but types it as
    // possibly an array depending on how it infers the relationship.
    const embed = r.content as unknown;
    const c = (Array.isArray(embed) ? embed[0] : embed) as {
      title: string;
      body: string | null;
      coaching_nugget: string | null;
      voice: string | null;
      source: string | null;
      type: string;
    };
    return {
      id: r.id as string,
      contentId: r.content_id as string,
      reason: r.reason as ReviewRow["reason"],
      detail: r.detail as string | null,
      options: r.options as ReviewRow["options"],
      title: c?.title ?? "(untitled)",
      // A missing-nugget card shows the QUOTE as its context; every other card
      // shows the text that needs fixing. Both come out of `body` for a quote,
      // so the mapping is here rather than in the component.
      body: c?.body ?? null,
      nugget: c?.coaching_nugget ?? null,
      voice: c?.voice ?? null,
      source: c?.source ?? null,
      type: c?.type ?? "cue",
    };
  });

  const total = rows.length + duplicates.length + twins.length;

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/admin/content", label: "Coaching Content" }}
        title="Needs you"
        subtitle={
          total === 0
            ? "Nothing waiting. Everything the imports could not decide has been answered."
            : `${total} ${total === 1 ? "item" : "items"} the imports could not decide on their own.`
        }
      />

      {/* ---- Duplicates, first ---------------------------------------------
          Above the word questions because every one of them is currently
          serving BOTH versions to advisors. A missing coaching nugget is a
          quote that reads thin; a live duplicate is the app repeating itself,
          which is the thing an advisor notices. */}
      {duplicates.length > 0 && (
        <section id="duplicates" className="mt-4 scroll-mt-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
            Duplicates
            <span className="ml-2 text-clay">{duplicates.length}</span>
          </h2>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-soft">
            Two ways of saying one thing, both live. Usually a short version that
            fits on a card and a longer one that carries the coaching — you pick
            which advisors get. The obvious repeats were already cleared; these
            are the ones only you can call.
          </p>
          <div className="mt-3 space-y-3">
            {duplicates.map((g) => (
              <DuplicateGroupCard key={g.id} group={g} />
            ))}
          </div>
        </section>
      )}

      {total === 0 ? (
        <Card className="mt-4 p-6">
          <p className="text-base font-extrabold text-navy">All clear</p>
          <p className="mt-1 text-sm text-ink-soft">
            New questions appear here automatically the next time content is
            imported.
          </p>
        </Card>
      ) : (
        <div className="mt-4 space-y-8">
          {GROUPS.map((g) => {
            const items = rows.filter((r) => r.reason === g.reason);
            if (items.length === 0) return null;
            return (
              <section key={g.reason}>
                <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
                  {g.title}
                  <span className="ml-2 text-clay">{items.length}</span>
                </h2>
                <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-soft">
                  {g.blurb}
                </p>
                <div className="mt-3 space-y-3">
                  {items.map((r) => (
                    <ReviewItem key={r.id} row={r} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ---- Twins, last ----------------------------------------------------
          Below everything answerable in place. There are 121 of them and no
          button on any of them, so putting them first would bury five minutes
          of real work under an afternoon of reading. */}
      {twins.length > 0 && (
        <section id="twins" className="mt-8 scroll-mt-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
            A cue and a quote saying the same thing
            <span className="ml-2 text-clay">{twins.length}</span>
          </h2>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-soft">
            The daily loop only knows two pieces of content are the same idea
            when one is linked to the other. These pairs are not linked, so the
            same words can turn up twice in one morning — once as the cue and
            again as the quote. Nothing here has been linked automatically:
            strongest word overlap first, and the tail only shares a title.
          </p>
          <div className="mt-3 space-y-3">
            {twins.map((t) => (
              <TwinProposalCard key={t.id} proposal={t} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
