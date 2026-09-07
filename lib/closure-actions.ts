"use server";

/* ============================================================================
   EDIAGD — confirming, dismissing and adding store closures
   SERVER ONLY.

   ---------------------------------------------------------------------------
   EVERY WRITE GOES THROUGH THE CALLER'S OWN CLIENT
   ---------------------------------------------------------------------------
   Not the service client. The RLS policies on rooftop_closed_day already say
   exactly who may write which rooftop's calendar — managed_rooftops(), plus the
   platform owner — and running these through the user's client means the
   database enforces that rather than this file re-deciding it in TypeScript.

   A manager at one store who posts another store's rooftop id gets zero rows
   affected, because the policy refuses it. There is no second copy of the rule
   here to drift out of step with the first.

   That is also why nothing here checks membership before writing: a check in
   front of a policy is a comment, not a boundary, and the one that matters
   already ran.
   ============================================================================ */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ClosureResult = { ok: true } | { ok: false; error: string };

const CLOSURES_PATH = "/admin/closures";

/** A calendar date and nothing else. */
function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Rule one date across however many rooftops: shut, or trading.
 *
 * ---------------------------------------------------------------------------
 * KEYED BY DATE AND ROOFTOP, NOT BY ROW ID
 * ---------------------------------------------------------------------------
 * The first cut took a row id, which forced the screen to list every rooftop
 * separately: eleven stores times eleven dates is a hundred and twenty-one
 * decisions for a dealer whose shops almost certainly close on the same days.
 * Nobody finishes that, and a half-finished calendar is worse than an untouched
 * one — readiness goes green for the stores that got done and the holiday still
 * breaks the rest.
 *
 * A date plus a set of rooftops is what a manager actually decides, so it is
 * what the action takes. One rooftop is just a set of one.
 *
 * UPSERT, NOT UPDATE. A rooftop the seeder has not reached has no row for the
 * date, and a manager ruling it should not have to wait for January. The unique
 * (rooftop_id, closed_on) makes the write idempotent either way.
 */
export async function setClosureAction(input: {
  rooftopIds: string[];
  date: string;
  label: string;
  closed: boolean;
}): Promise<ClosureResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (!validDate(input.date)) return { ok: false, error: "That date doesn't look right." };
  if (input.rooftopIds.length === 0) return { ok: false, error: "Pick a rooftop." };

  const now = new Date().toISOString();

  /*
   * CLOSED and OPEN are both rulings, and both have to be recorded.
   *
   * Open is not "no row": a dismissal is a tombstone that stops the January
   * seeder re-asking a question the manager has already answered. So it stays
   * `proposed` with dismissed_at set — inert, and never proposed again.
   */
  const row = input.closed
    ? {
        status: "confirmed",
        confirmed_at: now,
        confirmed_by: user.id,
        dismissed_at: null,
        dismissed_by: null,
      }
    : {
        status: "proposed",
        confirmed_at: null,
        confirmed_by: null,
        dismissed_at: now,
        dismissed_by: user.id,
      };

  const { error } = await supabase.from("rooftop_closed_day").upsert(
    input.rooftopIds.map((rooftopId) => ({
      rooftop_id: rooftopId,
      closed_on: input.date,
      label: input.label,
      origin: "federal",
      created_by: user.id,
      ...row,
    })),
    { onConflict: "rooftop_id,closed_on" }
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath(CLOSURES_PATH);
  return { ok: true };
}

/**
 * Rule a named set of dates in one act.
 *
 * ---------------------------------------------------------------------------
 * THE CALLER NAMES THE DATES, AND THAT IS THE FIX
 * ---------------------------------------------------------------------------
 * This used to take no dates at all — it swept every row that was still
 * `proposed` from today forward. The button above it said "Closed on all 4",
 * meaning the four days left unruled THIS YEAR, and the action would have
 * written fifteen dates across eleven rooftops. Ryan asked what the 4 referred
 * to, which is how the mismatch surfaced.
 *
 * Worse than the count: a MIXED date is made of rooftops that are individually
 * still `proposed`. Ten stores were marked shut for Labor Day and one was
 * deliberately left open, and a blind sweep would have silently closed the
 * eleventh — turning a decision somebody made into one nobody made.
 *
 * So the screen passes the exact dates its label is counting: the ones where
 * NOBODY in scope has ruled. A date with any ruling on it, in either direction,
 * is left alone.
 *
 * UPSERT rather than update, so a rooftop the seeder has not reached yet gets
 * its row written rather than skipped.
 */
export async function ruleRemainingAction(input: {
  rooftopIds: string[];
  dates: { date: string; label: string }[];
  closed: boolean;
}): Promise<ClosureResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (input.rooftopIds.length === 0) return { ok: false, error: "Pick a rooftop." };
  if (input.dates.length === 0) return { ok: true };
  if (input.dates.some((d) => !validDate(d.date))) {
    return { ok: false, error: "One of those dates doesn't look right." };
  }

  const now = new Date().toISOString();
  const ruling = input.closed
    ? {
        status: "confirmed",
        confirmed_at: now,
        confirmed_by: user.id,
        dismissed_at: null,
        dismissed_by: null,
      }
    : {
        status: "proposed",
        confirmed_at: null,
        confirmed_by: null,
        dismissed_at: now,
        dismissed_by: user.id,
      };

  const rows = input.rooftopIds.flatMap((rooftopId) =>
    input.dates.map((d) => ({
      rooftop_id: rooftopId,
      closed_on: d.date,
      label: d.label,
      origin: "federal",
      created_by: user.id,
      ...ruling,
    }))
  );

  const { error } = await supabase
    .from("rooftop_closed_day")
    .upsert(rows, { onConflict: "rooftop_id,closed_on" });

  if (error) return { ok: false, error: error.message };
  revalidatePath(CLOSURES_PATH);
  return { ok: true };
}

/**
 * Add a store-specific closure, already confirmed.
 *
 * Confirmed on arrival because a manager typing "Inventory day" into their own
 * store's calendar IS the confirmation — there is nobody else to propose it to.
 * Only the seeded federal dates arrive as proposals, because those are ours.
 *
 * `rooftopIds` is a list so "apply to all my rooftops" is one call rather than
 * a loop of round trips. Each row is still written individually against the
 * policy, so a group that includes a rooftop the caller does not manage loses
 * that row and keeps the rest.
 */
export async function addClosureAction(input: {
  rooftopIds: string[];
  date: string;
  label: string;
}): Promise<ClosureResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const label = input.label.trim();
  if (!label) return { ok: false, error: "Give the day a name." };
  if (label.length > 60) return { ok: false, error: "That name is too long." };
  if (!validDate(input.date)) return { ok: false, error: "That date doesn't look right." };
  if (input.rooftopIds.length === 0) return { ok: false, error: "Pick a rooftop." };

  const now = new Date().toISOString();
  const { error } = await supabase.from("rooftop_closed_day").upsert(
    input.rooftopIds.map((rooftopId) => ({
      rooftop_id: rooftopId,
      closed_on: input.date,
      label,
      status: "confirmed",
      origin: "store",
      created_by: user.id,
      confirmed_at: now,
      confirmed_by: user.id,
      dismissed_at: null,
      dismissed_by: null,
    })),
    /*
     * ON THE UNIQUE (rooftop_id, closed_on). A manager adding "Inventory day"
     * on a date that already carries a dismissed federal proposal means to
     * close the store that day — so the row is updated rather than rejected
     * with a constraint error they cannot act on.
     */
    { onConflict: "rooftop_id,closed_on" }
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath(CLOSURES_PATH);
  return { ok: true };
}
