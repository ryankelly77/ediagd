/* ============================================================================
   EDIAGD — coaching content (CMS) types + display language
   Client-safe: no Supabase or server imports, so both server pages and client
   editors can share it.

   Note on tiers: `content.tier` (zero/low/generic) is a CONTENT axis — which
   cue to serve someone — and is unrelated to the advisor performance tier
   (Elite/Strong/Low/Zero) in lib/brand.ts. Deliberately kept separate so the
   two can't drift into each other.
   ============================================================================ */

import type { ColorName } from "./brand";

export const CONTENT_TYPES = [
  "cue",
  "advisor_video",
  "manager_video",
  "joe_the_pro",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_TIERS = ["zero", "low", "generic"] as const;
export type ContentTier = (typeof CONTENT_TIERS)[number];

export const CONTENT_STATUSES = ["draft", "published"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** Mirrors the product_key enum in 0001. */
export const PRODUCT_KEYS = [
  "advisor_base",
  "manager_meetings",
  "joe_the_pro",
] as const;
export type ProductKey = (typeof PRODUCT_KEYS)[number];

/**
 * Which product entitles each content type, and which role consumes it — the
 * TypeScript twin of product_for_content_type() and role_for_content_type()
 * in 0010. Kept in step with them deliberately: the database decides who may
 * READ a row, this decides which screen offers to show it.
 */
export const CONTENT_ENTITLEMENT: Record<
  ContentType,
  { product: ProductKey; roles: readonly ("advisor" | "manager")[] }
> = {
  cue: { product: "advisor_base", roles: ["advisor"] },
  advisor_video: { product: "advisor_base", roles: ["advisor"] },
  manager_video: { product: "manager_meetings", roles: ["manager"] },
  // 0034: advisor education, not technician training.
  joe_the_pro: { product: "joe_the_pro", roles: ["advisor", "manager"] },
};

export type ContentRow = {
  id: string;
  type: ContentType;
  service_family: string | null;
  subcategory: string | null;
  tier: ContentTier | null;
  make: string | null;
  model: string | null;
  year_range: string | null;
  title: string;
  body: string | null;
  video_url: string | null;
  duration_sec: number | null;
  status: ContentStatus;
  source: string | null;
  created_at: string;
  updated_at: string;
};

/** The editable shape — what the editor sends to the save action. */
export type ContentDraft = {
  id?: string;
  type: ContentType;
  service_family: string | null;
  subcategory: string | null;
  tier: ContentTier | null;
  make: string | null;
  model: string | null;
  year_range: string | null;
  title: string;
  body: string | null;
  video_url: string | null;
  duration_sec: number | null;
  status: ContentStatus;
};

export const TYPE_META: Record<
  ContentType,
  { label: string; short: string; plural: string }
> = {
  cue: { label: "Coaching cue", short: "Cue", plural: "Cues" },
  advisor_video: {
    label: "Advisor video",
    short: "Advisor",
    plural: "Advisor Videos",
  },
  manager_video: {
    label: "Manager video",
    short: "Manager",
    plural: "Manager Videos",
  },
  joe_the_pro: { label: "Joe the Pro", short: "Joe", plural: "Joe the Pro" },
};

export const TIER_LABEL: Record<ContentTier, string> = {
  zero: "Zero",
  low: "Low",
  generic: "Generic",
};

/** draft = clay (attention, never red), published = palm. */
export const STATUS_META: Record<
  ContentStatus,
  { label: string; color: ColorName }
> = {
  draft: { label: "Draft", color: "clay" },
  published: { label: "Published", color: "palm" },
};

/** Videos carry a URL/duration; cues carry body text. */
export function isVideoType(type: ContentType): boolean {
  return type !== "cue";
}

/** Sentinel segments — service names are free text and may be empty. */
export const ALL_SERVICES = "__all__";
export const NO_SERVICE = "__none__";

export function serviceToSlug(service: string | null): string {
  return service == null || service === "" ? NO_SERVICE : encodeURIComponent(service);
}

export function slugToService(slug: string): string | null {
  if (slug === NO_SERVICE) return null;
  if (slug === ALL_SERVICES) return null;
  return decodeURIComponent(slug);
}

export function serviceLabel(service: string | null): string {
  return service ?? "Generic (no service)";
}

export const PAGE_SIZE = 50;

/* ---- Search relevance ---------------------------------------------------- */

export const MATCH_TITLE_PREFIX = 3;
export const MATCH_TITLE_CONTAINS = 2;
export const MATCH_BODY_ONLY = 1;

/**
 * How well a row matches a query. Case-insensitive, to agree with the ilike
 * filter that produced the row.
 *
 * 3 = title starts with the query, 2 = title contains it, 1 = body only.
 * 0 shouldn't happen for rows the filter returned, but is handled so a widened
 * filter can't silently promote a non-match.
 */
export function scoreContentMatch(
  item: Pick<ContentRow, "title" | "body">,
  query: string
): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const title = (item.title ?? "").toLowerCase();
  if (title.startsWith(q)) return MATCH_TITLE_PREFIX;
  if (title.includes(q)) return MATCH_TITLE_CONTAINS;
  if ((item.body ?? "").toLowerCase().includes(q)) return MATCH_BODY_ONLY;
  return 0;
}

/** Relevance desc, then title A–Z so ties are deterministic across renders. */
export function byRelevance(query: string) {
  return (a: ContentRow, b: ContentRow): number => {
    const diff = scoreContentMatch(b, query) - scoreContentMatch(a, query);
    if (diff !== 0) return diff;
    return (a.title ?? "").localeCompare(b.title ?? "");
  };
}

/** First line / first ~140 chars of a cue body, for list rows. */
export function snippet(body: string | null, max = 140): string {
  if (!body) return "";
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
