import "server-only";

/* ============================================================================
   EDIAGD — loading the Duplicates queue

   One server-side loader, the same way content-detail.ts is the one loader for
   the detail screen. The card is a client component so it can act without a
   round trip through a form, and everything it renders is resolved here.

   ---------------------------------------------------------------------------
   WHAT THE CARD NEEDS THAT THE TABLES DO NOT HOLD
   ---------------------------------------------------------------------------
   THE LINKED VIDEO'S TITLE. `unretirable` is stored on the member row so the
   client and the server agree about which control is disabled, but "linked to
   video" with no video name is a dead end — Mitch has to be able to go and
   look at it.

   HOW MANY ADVISORS KEPT IT. The brief asked for last-served if it was cheap.
   It is not available at all: daily_completion records `video_content_id`, so
   a quote's serving is not written down anywhere. Saves are, they are one
   head-count query, and for a quote they are the better signal — a save is an
   advisor choosing to keep the line, which is exactly the judgement the card
   is asking Mitch to make.
   ============================================================================ */

type Client = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (t: string) => any;
};

export type DuplicateMember = {
  memberId: string;
  contentId: string;
  quoteKey: string | null;
  body: string;
  voice: string | null;
  proposed: "survive" | "retire";
  unretirable: boolean;
  linkedVideo: { id: string; title: string } | null;
  saveCount: number;
};

export type DuplicateGroup = {
  id: string;
  shape: "identical" | "drift" | "excerpt";
  relation: string | null;
  sourceGroup: string | null;
  members: DuplicateMember[];
  /**
   * Sentences inside a retiring passage that no row of its own carries.
   *
   * THE GROUP-10 SHAPE. A passage can contain two distinct lines, and one of
   * them may already exist as its own quote while the other never did. Keeping
   * the lines and retiring the passage would silently lose the second one, so
   * the card offers to create it — pre-filled, voice inherited, approved like
   * any other keep.
   */
  orphanLines: string[];
};

/** Same normalization as the scan, so the two agree about "the same words". */
const norm = (s: string) =>
  (s ?? "").toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();

const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "at", "by",
  "for", "with", "is", "are", "was", "were", "be", "been", "it", "its", "that",
  "this", "you", "your", "i", "me", "my", "we", "us", "our", "as", "so", "do",
]);

const contentWords = (s: string) =>
  norm(s).split(" ").filter((t) => t.length > 1 && !STOP.has(t)).length;

export async function loadDuplicateQueue(client: Client): Promise<DuplicateGroup[]> {
  const { data: groups } = await client
    .from("quote_duplicate_group")
    .select("id, shape, relation, source_group, quote_duplicate_member(id, content_id, proposed, unretirable)")
    .eq("status", "open")
    .order("created_at")
    .limit(200);

  const raw = (groups ?? []) as {
    id: string;
    shape: DuplicateGroup["shape"];
    relation: string | null;
    source_group: string | null;
    quote_duplicate_member: {
      id: string; content_id: string; proposed: "survive" | "retire"; unretirable: boolean;
    }[];
  }[];
  if (raw.length === 0) return [];

  const ids = raw.flatMap((g) => (g.quote_duplicate_member ?? []).map((m) => m.content_id));

  const [{ data: rows }, { data: links }, { data: saves }] = await Promise.all([
    client.from("content").select("id, quote_key, body, voice, retired_at").in("id", ids),
    // Videos pointing INTO this set. One query for the whole page rather than
    // one per member.
    client.from("content").select("id, title, artifact_id").in("artifact_id", ids),
    client.from("saved_content").select("content_id").in("content_id", ids),
  ]);

  const byId = new Map(
    ((rows ?? []) as { id: string }[]).map((r) => [r.id, r as Record<string, unknown>])
  );
  const videoFor = new Map<string, { id: string; title: string }>();
  ((links ?? []) as { id: string; title: string; artifact_id: string }[]).forEach((v) =>
    videoFor.set(v.artifact_id, { id: v.id, title: v.title })
  );
  const saveTally = new Map<string, number>();
  ((saves ?? []) as { content_id: string }[]).forEach((s) =>
    saveTally.set(s.content_id, (saveTally.get(s.content_id) ?? 0) + 1)
  );

  return raw
    .map((g) => {
      const members: DuplicateMember[] = (g.quote_duplicate_member ?? [])
        .map((m) => {
          const r = byId.get(m.content_id);
          if (!r || r.retired_at) return null;
          return {
            memberId: m.id,
            contentId: m.content_id,
            quoteKey: (r.quote_key as string) ?? null,
            body: (r.body as string) ?? "",
            voice: (r.voice as string) ?? null,
            proposed: m.proposed,
            unretirable: m.unretirable,
            linkedVideo: videoFor.get(m.content_id) ?? null,
            saveCount: saveTally.get(m.content_id) ?? 0,
          };
        })
        .filter(Boolean) as DuplicateMember[];

      // Longest first: the passage reads as the thing the short lines came out
      // of, which is the comparison the card is asking Mitch to make.
      members.sort((a, b) => b.body.length - a.body.length);

      return {
        id: g.id,
        shape: g.shape,
        relation: g.relation,
        sourceGroup: g.source_group,
        members,
        orphanLines: orphanLines(members),
      };
    })
    // A group that lost members to a retirement elsewhere is no longer a
    // question. Dropping it here rather than showing a one-row card.
    .filter((g) => g.members.length >= 2);
}

/**
 * Sentences in the longest member that no other member carries as its own row.
 *
 * ONLY ON THE GROUP-10 SHAPE — two or more short lines surviving against one
 * passage. On an ordinary two-row group the offer is technically true (the
 * passage does hold sentences the short line doesn't) and practically noise:
 * the answer there is just "keep the short one", and putting a second decision
 * under it makes every card look like it needs thinking about. When the
 * passage is genuinely a container for several lines, that IS the question.
 */
function orphanLines(members: DuplicateMember[]): string[] {
  if (members.length < 2) return [];
  if (members.filter((m) => m.proposed === "survive").length < 2) return [];
  const passage = members[0];
  if (passage.proposed !== "retire") return [];

  const others = members.slice(1).map((m) => norm(m.body));
  return passage.body
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => {
      if (contentWords(s) < 4) return false;
      const n = norm(s);
      // Already a row of its own, or already inside one.
      return !others.some((o) => o.includes(n));
    });
}
