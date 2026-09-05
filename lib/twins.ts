/* ============================================================================
   EDIAGD — the cue and the quote that say the same thing

   ---------------------------------------------------------------------------
   WHY THE QUEUE CARES
   ---------------------------------------------------------------------------
   pickQuotesForDay excludes exactly one thing: the lifestyle video's artifact
   twin. That is what stops the same words appearing twice in one three-minute
   ritual. The coaching cue is picked by a different function and the quote
   picker never sees it — so a cue and a quote that are one idea can both be
   served on the same morning, and 129 candidate pairs sit unlinked today.

   ---------------------------------------------------------------------------
   READ-ONLY, ON PURPOSE
   ---------------------------------------------------------------------------
   There is no button here. An artifact link changes what the day picker serves,
   and "these two share a title" is not evidence enough to make that change on
   somebody's behalf — four separate cues in this library are titled
   "Accountability". The queue's job at this stage is to show the pair and the
   word overlap and let a person read both. Linking stays a deliberate edit.
   ============================================================================ */

import type { SupabaseClient } from "@supabase/supabase-js";

export type TwinCandidate = {
  contentId: string;
  title: string;
  body: string | null;
  /** 0–1, share of the shorter side's content words present in the longer. */
  overlap: number;
  matchedOn: string;
};

export type TwinProposal = {
  id: string;
  cue: { contentId: string; title: string; body: string | null };
  candidates: TwinCandidate[];
  /** The best candidate's overlap — what the list is ordered by. */
  strength: number;
};

type OptionShape = {
  candidates?: { twin_id: string; body_overlap: number; matched_on: string }[];
};

export async function loadTwinProposals(
  supabase: SupabaseClient
): Promise<TwinProposal[]> {
  const { data } = await supabase
    .from("content_review")
    .select("id, content_id, options, content:content_id(title, body)")
    .eq("reason", "unlinked_twin")
    .eq("status", "open")
    .limit(500);

  const rows = data ?? [];
  if (rows.length === 0) return [];

  /* One query for every candidate quote across every proposal, rather than one
     per card. The queue is a page, not a crawl. */
  const twinIds = [
    ...new Set(
      rows.flatMap((r) =>
        ((r.options as OptionShape)?.candidates ?? []).map((c) => c.twin_id)
      )
    ),
  ];
  const { data: twins } = await supabase
    .from("content")
    .select("id, title, body")
    .in("id", twinIds);
  const byId = new Map(
    (twins ?? []).map((t) => [
      t.id as string,
      { title: t.title as string, body: t.body as string | null },
    ])
  );

  const out: TwinProposal[] = [];
  for (const r of rows) {
    // PostgREST types an embedded to-one as possibly an array.
    const embed = r.content as unknown;
    const c = (Array.isArray(embed) ? embed[0] : embed) as {
      title: string;
      body: string | null;
    } | null;

    const candidates = ((r.options as OptionShape)?.candidates ?? [])
      .map((cand) => {
        const t = byId.get(cand.twin_id);
        /* A quote retired since the proposal was filed simply drops off the
           card — the pair it was half of no longer exists to worry about. */
        if (!t) return null;
        return {
          contentId: cand.twin_id,
          title: t.title,
          body: t.body,
          overlap: cand.body_overlap,
          matchedOn: cand.matched_on,
        };
      })
      .filter((x): x is TwinCandidate => x !== null)
      .sort((a, b) => b.overlap - a.overlap);

    if (candidates.length === 0) continue;

    out.push({
      id: r.id as string,
      cue: {
        contentId: r.content_id as string,
        title: c?.title ?? "(untitled)",
        body: c?.body ?? null,
      },
      candidates,
      strength: candidates[0].overlap,
    });
  }

  /* Strongest first: the pairs most likely to be one idea are the ones worth a
     person's first ten minutes, and the shared-title-only tail is the part that
     can be skimmed. */
  return out.sort((a, b) => b.strength - a.strength);
}
