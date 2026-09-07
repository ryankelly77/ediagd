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
 * Confirm a proposed closure — the store really is shut that day.
 *
 * Stamps who and when, because a closure suppresses a day of coaching for
 * everybody at that rooftop and "who said so" is the first question anybody
 * asks when one turns out to be wrong. The constraint in 0101 requires it.
 *
 * Confirming clears any dismissal: a manager who dismissed the date in
 * February and confirms it in June has changed their mind, and leaving the
 * tombstone would leave the row saying both things at once.
 */
export async function confirmClosureAction(id: string): Promise<ClosureResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("rooftop_closed_day")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_by: user.id,
      dismissed_at: null,
      dismissed_by: null,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  revalidatePath(CLOSURES_PATH);
  return { ok: true };
}

/**
 * Dismiss a proposal — the store trades that day.
 *
 * NOT A DELETE, and that is the point. The seeder runs every January; deleting
 * the row would re-ask the same question a year later, forever. The tombstone
 * is what makes "we're open on Presidents' Day" something a manager says once.
 *
 * It also un-confirms, so this is the undo for a confirmation made in error.
 */
export async function dismissClosureAction(id: string): Promise<ClosureResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("rooftop_closed_day")
    .update({
      status: "proposed",
      confirmed_at: null,
      confirmed_by: null,
      dismissed_at: new Date().toISOString(),
      dismissed_by: user.id,
    })
    .eq("id", id);

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

/**
 * Confirm every open proposal for a rooftop, in one action.
 *
 * The convenience that makes the onboarding step take a second for a dealer who
 * simply closes on all eleven. It touches only rows that are still open — a
 * dismissal is a decision and is not swept back up by a bulk confirm.
 */
export async function confirmAllProposalsAction(
  rooftopId: string
): Promise<ClosureResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  /* Today's floor matches the screen's. A bulk confirm must touch exactly the
     rows the manager was looking at — sweeping up a date from last January
     would retroactively re-score days nobody was asked about. */
  const today = new Date().toISOString().slice(0, 10);

  const { error } = await supabase
    .from("rooftop_closed_day")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_by: user.id,
    })
    .eq("rooftop_id", rooftopId)
    .eq("status", "proposed")
    .gte("closed_on", today)
    .is("dismissed_at", null);

  if (error) return { ok: false, error: error.message };
  revalidatePath(CLOSURES_PATH);
  return { ok: true };
}
