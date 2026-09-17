/* ============================================================================
   EDIAGD — reading the libraries
   SERVER ONLY (takes a Supabase client).

   Every query here filters status = 'published' and lets RLS do the rest.
   0010's content_entitled_read already restricts each row to someone holding
   the consuming role at a rooftop that owns the product, so a query that
   forgets a filter returns nothing rather than somebody else's content.

   PAGED, because these are the tables most likely to grow fast: one service
   family could hold hundreds of cues once Mitch's import lands, and Joe the Pro
   is one video per make/model/year combination.
   ============================================================================ */

import { isVideoType, type ContentType } from "@/lib/content";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };

/** Rows per page in any library list. */
export const LIBRARY_PAGE_SIZE = 20;
export const LIBRARY_PAGE_STEP = 20;
export const LIBRARY_MAX = 200;

export type LibraryItem = {
  id: string;
  type: ContentType;
  title: string;
  body: string | null;
  /** As stored. NULL on every video — see resolvedServiceFamily. */
  serviceFamily: string | null;
  /** service_family, or the op code resolved through op_code_family. 0123. */
  resolvedServiceFamily: string | null;
  /** The op code a pitch film was shot for. Null on cues. */
  opCode: string | null;
  tier: string | null;
  make: string | null;
  model: string | null;
  yearRange: string | null;
  durationSec: number | null;
  /** Null until the ingestion pipeline writes one. Nothing plays yet. */
  videoUrl: string | null;
  isVideo: boolean;
};

/*
 * op_code and resolved_service_family are here for the SAME reason.
 *
 * Thirteen films are titled "On the Drive" and thirty-eight more share three
 * other stage names — the stage went into `title` and the op code into its own
 * column, so a list rendering only the title shows the same words over and
 * over. The label is composed at display from these two (see libraryLabel), and
 * the titles are deliberately NOT rewritten: a title carrying data that lives
 * in a column is two things that can disagree.
 */
const COLUMNS =
  "id, type, title, body, service_family, resolved_service_family, op_code, " +
  "tier, make, model, year_range, duration_sec, video_url";

function toItem(r: Record<string, unknown>): LibraryItem {
  const type = r.type as ContentType;
  return {
    id: r.id as string,
    type,
    title: (r.title as string) ?? "Untitled",
    body: (r.body as string | null) ?? null,
    serviceFamily: (r.service_family as string | null) ?? null,
    resolvedServiceFamily: (r.resolved_service_family as string | null) ?? null,
    opCode: (r.op_code as string | null) ?? null,
    tier: (r.tier as string | null) ?? null,
    make: (r.make as string | null) ?? null,
    model: (r.model as string | null) ?? null,
    yearRange: (r.year_range as string | null) ?? null,
    durationSec: r.duration_sec == null ? null : Number(r.duration_sec),
    videoUrl: (r.video_url as string | null) ?? null,
    isVideo: isVideoType(type),
  };
}

/**
 * "On the Drive · SRP-038 · Belts & Cooling"
 *
 * ---------------------------------------------------------------------------
 * COMPOSED AT DISPLAY, NEVER WRITTEN INTO `title`
 * ---------------------------------------------------------------------------
 * The Mux naming convention survived the import intact — `source_filename` still
 * reads "SRP-038 — On the Drive — v1.MOV". Nothing was lost; it was SPLIT, the
 * stage into `title` and the code into `op_code`, and the screen rendered one of
 * them. Thirteen films then appear as thirteen lines saying "On the Drive".
 *
 * The fix is not an UPDATE that stuffs the code back into the title. The moment
 * a title contains data that also lives in a column, the two can disagree — and
 * that is precisely the bug this whole change exists to remove. So the title
 * stays the stage, and the label is assembled where it is shown.
 *
 * Parts are dropped when absent, so a cue with a family and no op code reads
 * "Brake pads · Brake Service", and a Mindset film with neither is just itself.
 */
export function libraryLabel(item: {
  title: string;
  opCode?: string | null;
  resolvedServiceFamily?: string | null;
}): string {
  return [item.title, item.opCode, item.resolvedServiceFamily]
    .filter((p): p is string => Boolean(p && String(p).trim()))
    .join(" · ");
}

export function resolveLibraryLimit(raw: string | undefined): number {
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) return LIBRARY_PAGE_SIZE;
  return Math.min(Math.max(LIBRARY_PAGE_SIZE, Math.floor(v)), LIBRARY_MAX);
}

/* ---- Advisor library: cues and videos, by service family ---------------- */

export type ServiceBucket = {
  service: string;
  cues: number;
  videos: number;
};

/**
 * The service families an advisor can browse, with a count of each kind.
 *
 * Counts matter more than they look: a service with 120 cues and 3 videos would
 * bury the videos in a single list, so the service view splits them and this is
 * what tells the index which services have any video at all.
 */
export async function listServiceBuckets(client: Client): Promise<ServiceBucket[]> {
  const buckets = new Map<string, ServiceBucket>();

  // One column, paged. PostgREST has no GROUP BY, and the alternative — a view
  // per grouping — is not worth a migration for a list this small.
  for (let page = 0; ; page++) {
    const { data, error } = await client
      /* content_service, not content: videos carry no service_family and would
         all land in the "" bucket and be dropped. See 0123. */
      .from("content_service")
      .select("type, resolved_service_family")
      .eq("status", "published")
      .in("type", ["cue", "advisor_video"])
      .range(page * 1000, page * 1000 + 999);

    if (error || !data || data.length === 0) break;
    for (const row of data as Record<string, unknown>[]) {
      const service = ((row.resolved_service_family as string | null) ?? "").trim();
      if (!service) continue;
      const b = buckets.get(service) ?? { service, cues: 0, videos: 0 };
      if (row.type === "advisor_video") b.videos += 1;
      else b.cues += 1;
      buckets.set(service, b);
    }
    if (data.length < 1000) break;
  }

  return [...buckets.values()].sort((a, b) => a.service.localeCompare(b.service));
}

/** One service family's items, split by kind so videos are never buried. */
export async function loadServiceContent(
  client: Client,
  service: string,
  limit: number
): Promise<{ cues: LibraryItem[]; videos: LibraryItem[]; cueTotal: number }> {
  const [videosRes, cuesRes] = await Promise.all([
    client
      /* THE FIX. This filtered `service_family`, which is NULL on all 154
         published advisor videos — so every service page showed zero films
         while the certification derivation counted them toward progress. */
      .from("content_service")
      .select(COLUMNS)
      .eq("status", "published")
      .eq("type", "advisor_video")
      .eq("resolved_service_family", service)
      .order("title", { ascending: true })
      .range(0, LIBRARY_MAX - 1),
    client
      /* Cues carry service_family directly, so this is unchanged in effect —
         but it reads the same derivation, so there is one answer and not two. */
      .from("content_service")
      .select(COLUMNS, { count: "exact" })
      .eq("status", "published")
      .eq("type", "cue")
      .eq("resolved_service_family", service)
      .order("title", { ascending: true })
      .range(0, limit - 1),
  ]);

  return {
    videos: ((videosRes.data ?? []) as Record<string, unknown>[]).map(toItem),
    cues: ((cuesRes.data ?? []) as Record<string, unknown>[]).map(toItem),
    cueTotal: Number(cuesRes.count ?? 0),
  };
}

/* ---- Joe the Pro: browsed by vehicle ------------------------------------ */

export type MakeBucket = { make: string; models: number; videos: number };

export async function listMakes(client: Client): Promise<MakeBucket[]> {
  const makes = new Map<string, { models: Set<string>; videos: number }>();

  for (let page = 0; ; page++) {
    const { data, error } = await client
      .from("content")
      .select("make, model")
      .eq("status", "published")
      .eq("type", "joe_the_pro")
      .range(page * 1000, page * 1000 + 999);

    if (error || !data || data.length === 0) break;
    for (const row of data as Record<string, unknown>[]) {
      const make = ((row.make as string | null) ?? "").trim();
      if (!make) continue;
      const entry = makes.get(make) ?? { models: new Set<string>(), videos: 0 };
      const model = ((row.model as string | null) ?? "").trim();
      if (model) entry.models.add(model);
      entry.videos += 1;
      makes.set(make, entry);
    }
    if (data.length < 1000) break;
  }

  return [...makes.entries()]
    .map(([make, v]) => ({ make, models: v.models.size, videos: v.videos }))
    .sort((a, b) => a.make.localeCompare(b.make));
}

/**
 * One make's videos, newest model first, optionally narrowed to a service.
 *
 * Vehicle is the primary axis and service is a filter on top — a technician
 * looking something up starts from the car in front of them, not from a
 * service category.
 */
export async function loadMakeVideos(
  client: Client,
  make: string,
  limit: number,
  service?: string | null
): Promise<{ items: LibraryItem[]; total: number; services: string[] }> {
  let query = client
    .from("content_service")
    .select(COLUMNS, { count: "exact" })
    .eq("status", "published")
    .eq("type", "joe_the_pro")
    .eq("make", make);

  if (service) query = query.eq("resolved_service_family", service);

  const { data, count } = await query
    .order("model", { ascending: true })
    .order("title", { ascending: true })
    .range(0, limit - 1);

  const items = ((data ?? []) as Record<string, unknown>[]).map(toItem);

  // The service filter's options come from this make's own videos, so the
  // control never offers a filter that would return nothing.
  const { data: all } = await client
    .from("content_service")
    .select("resolved_service_family")
    .eq("status", "published")
    .eq("type", "joe_the_pro")
    .eq("make", make)
    .not("resolved_service_family", "is", null)
    .range(0, LIBRARY_MAX - 1);

  const services = [
    ...new Set(
      ((all ?? []) as Record<string, unknown>[])
        .map((r) => ((r.resolved_service_family as string | null) ?? "").trim())
        .filter(Boolean)
    ),
  ].sort();

  return { items, total: Number(count ?? items.length), services };
}

/* ---- Manager Meetings: by topic ----------------------------------------- */

/**
 * Manager videos are about HOW TO COACH, not how to sell, so the grouping is
 * different in kind from the advisor library: some are about a service, and
 * some are about leading people and belong to no service at all. Those land in
 * a general bucket rather than being forced into a service they don't fit.
 */
export const MANAGER_GENERAL_TOPIC = "Leadership & coaching";

export type TopicBucket = { topic: string; videos: number; isGeneral: boolean };

export async function listManagerTopics(client: Client): Promise<TopicBucket[]> {
  const topics = new Map<string, TopicBucket>();

  for (let page = 0; ; page++) {
    const { data, error } = await client
      .from("content_service")
      .select("resolved_service_family")
      .eq("status", "published")
      .eq("type", "manager_video")
      .range(page * 1000, page * 1000 + 999);

    if (error || !data || data.length === 0) break;
    for (const row of data as Record<string, unknown>[]) {
      const service = ((row.resolved_service_family as string | null) ?? "").trim();
      const topic = service || MANAGER_GENERAL_TOPIC;
      const b = topics.get(topic) ?? {
        topic,
        videos: 0,
        isGeneral: topic === MANAGER_GENERAL_TOPIC,
      };
      b.videos += 1;
      topics.set(topic, b);
    }
    if (data.length < 1000) break;
  }

  // General first: a manager opening this is more often after "how do I run a
  // one-to-one" than after a specific service.
  return [...topics.values()].sort(
    (a, b) =>
      Number(b.isGeneral) - Number(a.isGeneral) || a.topic.localeCompare(b.topic)
  );
}

export async function loadManagerVideos(
  client: Client,
  topic: string | null,
  limit: number
): Promise<{ items: LibraryItem[]; total: number }> {
  let query = client
    .from("content_service")
    .select(COLUMNS, { count: "exact" })
    .eq("status", "published")
    .eq("type", "manager_video");

  if (topic === MANAGER_GENERAL_TOPIC) query = query.is("resolved_service_family", null);
  else if (topic) query = query.eq("resolved_service_family", topic);

  const { data, count } = await query
    .order("title", { ascending: true })
    .range(0, limit - 1);

  const items = ((data ?? []) as Record<string, unknown>[]).map(toItem);
  return { items, total: Number(count ?? items.length) };
}


/* ---- What this person has already finished ------------------------------ */

/**
 * The subset of `contentIds` this user has completed.
 *
 * Read with the CALLER'S client, so content_progress's self-read policy scopes
 * it — there is no user id parameter to get wrong.
 */
export async function loadCompletedIds(
  client: Client,
  contentIds: string[]
): Promise<Set<string>> {
  if (contentIds.length === 0) return new Set();

  const { data } = await client
    .from("content_progress")
    .select("content_id")
    .in("content_id", contentIds)
    .not("completed_at", "is", null);

  return new Set(
    ((data ?? []) as Record<string, unknown>[]).map((r) => r.content_id as string)
  );
}

/**
 * Joe the Pro videos for one service family.
 *
 * The contextual surfacing: an advisor reading the brake cues is offered the
 * brake explainer. No entitlement check here on purpose — 0010's policy returns
 * nothing when the rooftop hasn't bought the add-on, so the section simply
 * isn't rendered rather than being conditionally hidden by the page.
 */
export async function loadJoeForService(
  client: Client,
  service: string
): Promise<LibraryItem[]> {
  const { data } = await client
    .from("content_service")
    .select(COLUMNS)
    .eq("status", "published")
    .eq("type", "joe_the_pro")
    .eq("resolved_service_family", service)
    .order("make", { ascending: true })
    .range(0, 9);

  return ((data ?? []) as Record<string, unknown>[]).map(toItem);
}
