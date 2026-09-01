"use strict";
/* ============================================================================
   EDIAGD — coaching content (CMS) types + display language
   Client-safe: no Supabase or server imports, so both server pages and client
   editors can share it.

   Note on tiers: `content.tier` (zero/low/generic) is a CONTENT axis — which
   cue to serve someone — and is unrelated to the advisor performance tier
   (Elite/Strong/Low/Zero) in lib/brand.ts. Deliberately kept separate so the
   two can't drift into each other.
   ============================================================================ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MATCH_BODY_ONLY = exports.MATCH_TITLE_CONTAINS = exports.MATCH_TITLE_PREFIX = exports.PAGE_SIZE = exports.NO_SERVICE = exports.ALL_SERVICES = exports.STATUS_META = exports.TIER_LABEL = exports.TYPE_META = exports.QUOTE_SLOT_META = exports.QUOTE_SLOTS = exports.HOUSE_VOICE = exports.PRODUCT_META = exports.CONTENT_ENTITLEMENT = exports.PRODUCT_KEYS = exports.CONTENT_STATUSES = exports.CONTENT_TIERS = exports.CONTENT_TYPES = void 0;
exports.isAddonType = isAddonType;
exports.citationFor = citationFor;
exports.isVideoType = isVideoType;
exports.serviceToSlug = serviceToSlug;
exports.slugToService = slugToService;
exports.serviceLabel = serviceLabel;
exports.scoreContentMatch = scoreContentMatch;
exports.byRelevance = byRelevance;
exports.snippet = snippet;
exports.CONTENT_TYPES = [
    "cue",
    // 0059. A quote is not a short cue: it is attributed to a voice, it fills one
    // of the day's two quote slots, and it carries a nugget explaining its
    // coaching use. Modelling it as a cue is what had the daily loop opening on a
    // 600-character lesson rendered as a pull quote.
    "quote",
    "advisor_video",
    "manager_video",
    "joe_the_pro",
];
exports.CONTENT_TIERS = ["zero", "low", "generic"];
exports.CONTENT_STATUSES = ["draft", "published"];
/** Mirrors the product_key enum in 0001. */
exports.PRODUCT_KEYS = [
    "advisor_base",
    "manager_meetings",
    "joe_the_pro",
];
/**
 * Which product entitles each content type, and which role consumes it — the
 * TypeScript twin of product_for_content_type() and role_for_content_type()
 * in 0010. Kept in step with them deliberately: the database decides who may
 * READ a row, this decides which screen offers to show it.
 */
exports.CONTENT_ENTITLEMENT = {
    cue: { product: "advisor_base", roles: ["advisor"] },
    // Same gate as a cue. Confirmed against prod by calling the two functions
    // rather than reading them: both end in an `else`, so 'quote' inherits
    // advisor / advisor_base and no policy needed changing.
    quote: { product: "advisor_base", roles: ["advisor"] },
    advisor_video: { product: "advisor_base", roles: ["advisor"] },
    manager_video: { product: "manager_meetings", roles: ["manager"] },
    // 0034: advisor education, not technician training.
    joe_the_pro: { product: "joe_the_pro", roles: ["advisor", "manager"] },
};
/**
 * Display name and add-on status per product — the client-safe twin of
 * `product_catalog`, which is the source of truth (display_name, is_addon).
 * Verified against prod rather than assumed: advisor_base is included,
 * manager_meetings and joe_the_pro are is_addon = true.
 *
 * Here so the CMS can say WHICH LIBRARIES A STORE PAYS EXTRA FOR without a
 * query. It decides how a shelf is LABELLED, never who may read it — that is
 * rooftop_has_product() in RLS, and it always has been.
 */
exports.PRODUCT_META = {
    advisor_base: { label: "Advisor Coaching", isAddon: false },
    manager_meetings: { label: "Manager Meetings", isAddon: true },
    joe_the_pro: { label: "Joe the Pro", isAddon: true },
};
/** Content types a store pays extra for, derived rather than listed. */
function isAddonType(type) {
    return exports.PRODUCT_META[exports.CONTENT_ENTITLEMENT[type].product].isAddon;
}
/**
 * The voice the app itself speaks in.
 *
 * Every quote stores an attribution and 192 of the 436 are Mitch's own. But a
 * citation exists to credit someone OUTSIDE the conversation: "Kobe Bryant"
 * under a line tells an advisor where it came from and lends it the weight of
 * whoever said it. "Mitch Hardt" under a line inside Mitch's own coaching app
 * tells them nothing they had not already assumed — and at 44% of the library
 * it lands every other day, reading as the coach quoting himself back at them.
 *
 * THE DATA IS UNCHANGED. Every row keeps its voice, the admin editor still
 * shows and edits it, and the daily draw still uses it for voice diversity —
 * this decides only whether to PRINT it. If Mitch wants his name on his own
 * words, deleting this function restores it everywhere at once.
 */
exports.HOUSE_VOICE = "Mitch Hardt";
/** The attribution to show, or null when the app is quoting itself. */
function citationFor(voice) {
    const v = voice?.trim();
    if (!v)
        return null;
    return v.toLowerCase() === exports.HOUSE_VOICE.toLowerCase() ? null : v;
}
exports.QUOTE_SLOTS = ["slot2", "slot3", "both"];
/** What each slot means, in the words the daily loop uses. */
exports.QUOTE_SLOT_META = {
    slot2: "Slot 2 — sales (shown with the focus cue)",
    slot3: "Slot 3 — life (opens the day)",
    both: "Both — works in either",
};
exports.TYPE_META = {
    cue: { label: "Coaching cue", short: "Cue", plural: "Cues" },
    quote: { label: "Quote", short: "Quote", plural: "Quotes" },
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
exports.TIER_LABEL = {
    zero: "Zero",
    low: "Low",
    generic: "Generic",
};
/** draft = clay (attention, never red), published = palm. */
exports.STATUS_META = {
    draft: { label: "Draft", color: "clay" },
    published: { label: "Published", color: "palm" },
};
/** Videos carry a URL/duration; cues carry body text. */
function isVideoType(type) {
    return type !== "cue";
}
/** Sentinel segments — service names are free text and may be empty. */
exports.ALL_SERVICES = "__all__";
exports.NO_SERVICE = "__none__";
function serviceToSlug(service) {
    return service == null || service === "" ? exports.NO_SERVICE : encodeURIComponent(service);
}
function slugToService(slug) {
    if (slug === exports.NO_SERVICE)
        return null;
    if (slug === exports.ALL_SERVICES)
        return null;
    return decodeURIComponent(slug);
}
function serviceLabel(service) {
    return service ?? "Generic (no service)";
}
exports.PAGE_SIZE = 50;
/* ---- Search relevance ---------------------------------------------------- */
exports.MATCH_TITLE_PREFIX = 3;
exports.MATCH_TITLE_CONTAINS = 2;
exports.MATCH_BODY_ONLY = 1;
/**
 * How well a row matches a query. Case-insensitive, to agree with the ilike
 * filter that produced the row.
 *
 * 3 = title starts with the query, 2 = title contains it, 1 = body only.
 * 0 shouldn't happen for rows the filter returned, but is handled so a widened
 * filter can't silently promote a non-match.
 */
function scoreContentMatch(item, query) {
    const q = query.trim().toLowerCase();
    if (!q)
        return 0;
    const title = (item.title ?? "").toLowerCase();
    if (title.startsWith(q))
        return exports.MATCH_TITLE_PREFIX;
    if (title.includes(q))
        return exports.MATCH_TITLE_CONTAINS;
    if ((item.body ?? "").toLowerCase().includes(q))
        return exports.MATCH_BODY_ONLY;
    return 0;
}
/** Relevance desc, then title A–Z so ties are deterministic across renders. */
function byRelevance(query) {
    return (a, b) => {
        const diff = scoreContentMatch(b, query) - scoreContentMatch(a, query);
        if (diff !== 0)
            return diff;
        return (a.title ?? "").localeCompare(b.title ?? "");
    };
}
/** First line / first ~140 chars of a cue body, for list rows. */
function snippet(body, max = 140) {
    if (!body)
        return "";
    const flat = body.replace(/\s+/g, " ").trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
