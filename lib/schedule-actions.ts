"use server";

/* ============================================================================
   EDIAGD — work schedule + Island Time writes
   SERVER ONLY, service role. 0025 gives these tables no user-write policy on
   purpose: both are direct inputs to streak maths, so a browser that could
   write them could freeze a Swell forever or declare itself scheduled for a
   single day a week and never miss again.

   Every action resolves the user from the SESSION and never accepts a userId —
   a server action is reachable by direct POST, so an id parameter would be an
   "edit anyone's schedule" endpoint.

   NOTE: a "use server" module may only export async functions. Types, limits
   and validation live in lib/work-schedule.ts.
   ============================================================================ */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { addDays, daysBetween, isoWeekday, type IsoDate } from "@/lib/gamification/streak";
import {
  draftToRow,
  loadIslandBudgetContext,
  validateDraft,
  type ScheduleDraft,
} from "@/lib/work-schedule";
import { quoteRange, refusalSentence, yearOf } from "@/lib/island-budget";

export type ScheduleResult = { ok: true; message: string } | { ok: false; error: string };

/** Longest single planned absence. See the note in addIslandTime. */
const MAX_ISLAND_DAYS = 60;
/** How far ahead you can plan. */
const MAX_ISLAND_LEAD_DAYS = 365;

async function sessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Today in the user's rooftop timezone, falling back to UTC. */
async function todayFor(userId: string): Promise<IsoDate> {
  const service = createServiceClient();
  const { data: membership } = await service
    .from("membership")
    .select("rooftop_id")
    .eq("user_id", userId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const rooftopId = membership?.rooftop_id as string | undefined;
  if (rooftopId) {
    const { data } = await service.rpc("rooftop_today", { _rooftop: rooftopId });
    if (data) return data as IsoDate;
  }
  return new Date().toISOString().slice(0, 10);
}

/* ---- Work schedule ------------------------------------------------------- */

export async function saveWorkSchedule(draft: ScheduleDraft): Promise<ScheduleResult> {
  const user = await sessionUser();
  if (!user) return { ok: false, error: "You need to sign in." };

  // Re-validated here even though the form checks: the action is reachable by
  // direct POST, so the client check is a courtesy, not a control.
  const problem = validateDraft(draft);
  if (problem) return { ok: false, error: problem };

  const service = createServiceClient();
  const { error } = await service.from("work_schedule").upsert(
    {
      user_id: user.id,
      ...draftToRow(draft),
      schedule_set_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) return { ok: false, error: error.message };

  // Deliberately NOT revalidatePath("/", "layout"). That re-renders the route
  // the caller is standing on — and during onboarding that's /onboarding, whose
  // server component redirects away the moment a schedule exists. The flow
  // would save, get yanked to "/", and never show its last screen. The pages
  // that actually display a schedule are revalidated by name instead; the (app)
  // layout re-reads on the next navigation anyway, because it's dynamic.
  revalidatePath("/profile");
  revalidatePath("/streak");
  return { ok: true, message: "Schedule saved." };
}

/* ---- Island Time --------------------------------------------------------- */

export async function addIslandTime(
  start: string,
  end: string,
  note: string | null
): Promise<ScheduleResult> {
  const user = await sessionUser();
  if (!user) return { ok: false, error: "You need to sign in." };

  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(start) || !iso.test(end)) {
    return { ok: false, error: "Pick a start and an end date." };
  }
  if (end < start) {
    return { ok: false, error: "The last day can't be before the first." };
  }

  const today = await todayFor(user.id);

  // NO BACK-DATING. The engine reads island_time live when a day is completed,
  // so a range covering yesterday would erase a work day the user actually
  // missed — a free grace day, retroactively, as often as they liked. Planned
  // absence is planned, so it starts today at the earliest.
  if (start < today) {
    return {
      ok: false,
      error: "Island Time is for days ahead — pick today or later.",
    };
  }

  const length = daysBetween(start, end) + 1;
  if (length > MAX_ISLAND_DAYS) {
    return {
      ok: false,
      error: `That's longer than ${MAX_ISLAND_DAYS} days. Add it in stretches, or ask your manager to set it up.`,
    };
  }
  if (daysBetween(today, start) > MAX_ISLAND_LEAD_DAYS) {
    return { ok: false, error: "That's more than a year out — try closer to the time." };
  }

  const service = createServiceClient();

  /*
   * ---- THE YEAR'S BUDGET, CHECKED ON THE SERVER --------------------------
   *
   * The panel shows the same arithmetic under the date pickers before anybody
   * taps Book, and that preview is a courtesy — this is the check. A server
   * action is reachable by direct POST, and Island Time is the one thing in the
   * app that makes days stop counting against a Swell, so an unenforced cap is
   * an unlimited streak freeze with a friendly label.
   *
   * READ THROUGH THE SERVICE CLIENT, scoped by user_id. The same rows are
   * readable under the user's own policy, but this function already holds the
   * service client to do the insert and the two reads must see the same thing
   * the insert will land beside.
   */
  const budget = await loadIslandBudgetContext(service, user.id);
  const quote = quoteRange(
    start,
    end,
    budget.islandTime ?? [],
    budget.schedule ?? null,
    budget.cap
  );

  if (!quote.affordable) {
    return { ok: false, error: refusalSentence(quote, yearOf(today)) };
  }

  const { error } = await service.from("island_time").insert({
    user_id: user.id,
    start_date: start,
    end_date: end,
    note: note?.trim() || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/profile");
  revalidatePath("/streak");
  return { ok: true, message: "Island Time booked. Your Swell will hold." };
}

export async function removeIslandTime(id: string): Promise<ScheduleResult> {
  const user = await sessionUser();
  if (!user) return { ok: false, error: "You need to sign in." };

  const service = createServiceClient();

  // Scoped to the caller's own rows. The id comes from the client, so without
  // this eq() it would delete anyone's Island Time.
  const { data: row, error: readError } = await service
    .from("island_time")
    .select("id, start_date")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (readError) return { ok: false, error: readError.message };
  if (!row) return { ok: false, error: "That Island Time is already gone." };

  const today = await todayFor(user.id);

  // Only ranges that haven't begun. Deleting one that's already running would
  // retroactively re-expose days the user was genuinely away, turning them into
  // missed days after the fact — a penalty applied by tidying up.
  if ((row.start_date as string) <= today) {
    return {
      ok: false,
      error: "This one has already started, so it stays on the books.",
    };
  }

  const { error } = await service
    .from("island_time")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/profile");
  revalidatePath("/streak");
  return { ok: true, message: "Removed." };
}

/** The next N Saturdays, resolved in the user's own timezone. */
export async function nextSaturdays(count = 6): Promise<IsoDate[]> {
  const user = await sessionUser();
  if (!user) return [];
  const today = await todayFor(user.id);

  let cursor: IsoDate = today;
  while (isoWeekday(cursor) !== 6) cursor = addDays(cursor, 1);

  const out: IsoDate[] = [];
  for (let i = 0; i < count; i++) {
    out.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return out;
}

/* ---- The welcome Paddle Back Out day ------------------------------------- */

export type WelcomeGiftResult =
  | { ok: true; held: number; cap: number; alreadyHeld: boolean }
  | { ok: false; error: string };

/**
 * Hand the new advisor their first Paddle Back Out day at the end of onboarding.
 *
 * IT USUALLY GRANTS NOTHING, and that is the point. 0023 already gives every
 * account a day the moment it's created (the trigger on app_user), so for a
 * normal invited user this call finds that credit and simply reports what they
 * hold — the onboarding screen REVEALS the gift rather than issuing a second
 * one. Adding another here is exactly the double-grant to avoid.
 *
 * The grant path exists for accounts that predate 0023, or any row the trigger
 * didn't cover. When it does fire it also stamps paddle_out_last_granted, so
 * the engine's monthly accrual doesn't hand out another one the same month.
 *
 * Idempotent on the presence of an 'initial_credit' entry, so refreshing or
 * re-entering the screen can never grant twice.
 */
export async function claimWelcomePaddleOut(): Promise<WelcomeGiftResult> {
  const user = await sessionUser();
  if (!user) return { ok: false, error: "You need to sign in." };

  const service = createServiceClient();

  // The gift belongs to finishing onboarding. No schedule, no gift — which also
  // stops this being callable as a standalone "give me a day" endpoint.
  const { data: schedule } = await service
    .from("work_schedule")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!schedule) return { ok: false, error: "Set your schedule first." };

  const { data: settings } = await service
    .from("game_settings")
    .select("paddle_out_cap, paddle_out_per_month")
    .limit(1)
    .maybeSingle();
  const cap = Math.max(0, Number(settings?.paddle_out_cap ?? 5));
  const perMonth = Math.max(1, Number(settings?.paddle_out_per_month ?? 1));

  const [{ data: existing }, { data: swell }] = await Promise.all([
    service
      .from("paddle_out_entry")
      .select("id")
      .eq("user_id", user.id)
      .eq("kind", "initial_credit")
      .limit(1),
    service.from("swell").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  const held = Number(swell?.paddle_out_available ?? 0);

  // The normal path: they already have it. Report, don't grant.
  if ((existing as unknown[] | null)?.length) {
    return { ok: true, held, cap, alreadyHeld: true };
  }

  // Bank already full — nothing to add, and a 0-delta ledger row would be a lie.
  if (held >= cap) return { ok: true, held, cap, alreadyHeld: true };

  const today = await todayFor(user.id);
  const next = Math.min(held + perMonth, cap);

  const { error: swellError } = await service.from("swell").upsert(
    {
      user_id: user.id,
      current_len: Number(swell?.current_len ?? 0),
      longest_len: Number(swell?.longest_len ?? 0),
      last_completed_on: swell?.last_completed_on ?? null,
      paddle_out_available: next,
      // Stamped so the monthly accrual doesn't grant again this month.
      paddle_out_last_granted: today,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (swellError) return { ok: false, error: swellError.message };

  await service.from("paddle_out_entry").insert({
    user_id: user.id,
    delta: next - held,
    kind: "initial_credit",
    note: null,
  });

  revalidatePath("/streak");
  return { ok: true, held: next, cap, alreadyHeld: false };
}
