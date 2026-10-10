/* ============================================================================
   EDIAGD — the Rollcall event kinds, in one place

   ISOMORPHIC ON PURPOSE. The client components that fire an open event import
   the type from here, and so does the server action that refuses everything
   not on the list. One list, two readers, no second definition to drift.

   ---------------------------------------------------------------------------
   THIS FILE AND 0163's CHECK CONSTRAINT ARE THE SAME CLAIM, TWICE
   ---------------------------------------------------------------------------
   The database refuses an unknown kind with a 23514; this refuses it before
   the round trip and gives TypeScript something to check call sites against.
   Adding a kind means editing BOTH — a migration and this file — and that
   friction is the feature: a Rollcall column is a claim about what is counted,
   and a kind that arrives without one is a fact nothing reports.
   ============================================================================ */

/** Every kind app_event will accept. Mirrors 0163's app_event_kind_known. */
export const APP_EVENT_KINDS = [
  "signed_in",
  "certs_opened",
  "track_opened",
  "lesson_opened",
  "lesson_completed",
  "library_opened",
  "story_submitted",
] as const;

export type AppEventKind = (typeof APP_EVENT_KINDS)[number];

/**
 * The kinds a BROWSER may ask for, and the whole of the trust boundary.
 *
 * ---------------------------------------------------------------------------
 * A SERVER ACTION IS REACHABLE BY DIRECT POST
 * ---------------------------------------------------------------------------
 * So "the client names the kind" has to mean "the client names one of four
 * navigations", never "the client writes any row it likes". The two kinds that
 * are EVIDENCE OF WORK — lesson_completed and story_submitted — are emitted
 * from inside completeDay, completeLibraryItem and submitStory, after those
 * functions have verified the thing actually happened. They are deliberately
 * absent here: a client that could post `lesson_completed` could manufacture a
 * record of finishing a lesson it never opened, and the Rollcall column that
 * answers Ryan's sixth question would be worth nothing.
 *
 * signed_in is also absent: it carries a platform and a per-store-day dedup
 * key, so it has its own action rather than riding this one.
 *
 * WHAT IS STILL ASSERTABLE, SAID PLAINLY: somebody determined to can POST four
 * open events without opening anything. That is accepted. An open count is
 * telemetry about whether a rollout is landing, not an entitlement and not a
 * credential — and the cost of making it unforgeable (a signed stamp per page,
 * as the morning uses) is not worth paying for a number nobody is rewarded by.
 */
export const CLIENT_OPEN_KINDS = [
  "certs_opened",
  "track_opened",
  "lesson_opened",
  "library_opened",
] as const;

export type ClientOpenKind = (typeof CLIENT_OPEN_KINDS)[number];

export function isClientOpenKind(value: unknown): value is ClientOpenKind {
  return (
    typeof value === "string" &&
    (CLIENT_OPEN_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Which surface finished a lesson.
 *
 * ---------------------------------------------------------------------------
 * content_progress's VOCABULARY, NOT A SECOND ONE
 * ---------------------------------------------------------------------------
 * The brief says "morning or library". These are `loop`, `library` and `card`
 * instead, because 0123 already added `content_progress.source` with a CHECK
 * constraint on exactly those words, and two vocabularies for one fact is how
 * the two records stop being comparable. Writing the same word in both places
 * is what lets the Rollcall count be RECONCILED against content_progress —
 * which is the proof that either number is trustworthy.
 *
 * It also makes a distinction the brief's two words cannot: the family card on
 * /service finishes lessons too, and calling that a library completion would
 * put it in a column headed "outside the daily loop" under the wrong name.
 * Both are outside the loop; only one of them is the library.
 *
 * `quiz` is in the database constraint and deliberately not here — no code
 * path completes content from a quiz, and a value nothing can write does not
 * belong in a union that exists to be passed.
 */
export type CompletionSurface = "loop" | "library" | "card";

/** The shell a session came from. meta.platform on signed_in. */
export type SignInPlatform = "ios" | "android" | "web";

export function isSignInPlatform(value: unknown): value is SignInPlatform {
  return value === "ios" || value === "android" || value === "web";
}

/**
 * Shaped like a uuid — 8-4-4-4-12 hex, and NOTHING MORE THAN THAT.
 *
 * ---------------------------------------------------------------------------
 * THE VERSION AND VARIANT NIBBLES ARE NOT CHECKED, AND THAT IS THE FIX
 * ---------------------------------------------------------------------------
 * This was written as the usual RFC-4122 pattern — `[1-5]` for the version and
 * `[89ab]` for the variant — and it REFUSED A GOOD ID on the first real call:
 * rooftop `318b0b2d-f70d-e8da-8837-397ffa642975` has `e` where a version
 * should be. Postgres's `uuid` type accepts any 32 hex digits in that shape and
 * says nothing about versions, so plenty of ids in this database are not
 * version-tagged at all.
 *
 * Being wrong in the cautious direction is what hides it: the cron answered
 * "that is not a uuid" about an id the database was perfectly happy with, and
 * a false refusal wears the costume of care. In asTargetId it would have been
 * quieter still — a silently dropped target_id on a track_opened event, so the
 * Rollcall would have counted the open and been unable to name the track.
 *
 * ONE DEFINITION. The cron route imports this rather than keeping its own copy,
 * because the first version of that route DID keep its own copy and both were
 * wrong in the same way.
 */
const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_SHAPE.test(value);
}

/**
 * A uuid, or null.
 *
 * target_id has no foreign key — it points at certification or module
 * depending on the kind — so this is the only shape check there is, and it
 * runs before anything a browser sent reaches the insert.
 */
export function asTargetId(value: unknown): string | null {
  return isUuid(value) ? value : null;
}
