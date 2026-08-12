"use server";

/* ============================================================================
   EDIAGD — finishing something in the library
   SERVER ONLY. A "use server" module may only export async functions.

   THE SHAPE IS COPIED FROM completeDay ON PURPOSE, because the failure modes
   are the same ones 0012 was written to close:

     * NO userId PARAMETER, EVER. The caller is resolved from the session. A
       server action is reachable by direct POST, so an id parameter would be a
       "credit anyone" endpoint.
     * NO AMOUNT PARAMETER. What a lesson pays comes from game_settings at
       runtime. A client that could name its own figure could mint currency
       that buys real swag.
     * THE UNIQUE INDEX IS THE IDEMPOTENCY GUARD, not a preceding SELECT.
       content_progress is unique on (user_id, content_id): the insert goes
       first, and a 23505 means somebody already finished this item, so nothing
       is granted. Check-then-insert leaves a window where two taps both pass
       the check and both pay.
     * ENTITLEMENT IS RE-CHECKED WITH THE USER'S OWN CLIENT before the service
       role writes anything. The service role bypasses RLS, so it must never be
       handed a content id the caller could not have read for themselves.

   THE SWELL IS NOT TOUCHED. Streaks belong to the daily loop; finishing a
   library item is not a day's work and must not extend one.
   ============================================================================ */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { moduleForItem, moduleRequirementsMet } from "@/lib/lms";

export type CompleteResult =
  | {
      ok: true;
      alreadyDone: boolean;
      awarded: number;
      badges: string[];
      /** Hit the daily library ceiling — completion recorded, nothing paid. */
      capped: boolean;
      /** The module this finished, if it finished one. Drives the celebration. */
      moduleCompleted: { moduleId: string; bonus: number } | null;
    }
  | { ok: false; error: string };

/** Ten and fifty completed items; the whole of one service family. */
const TEN = 10;
const FIFTY = 50;

/**
 * Mark a cue or video finished, and pay for it once, ever.
 *
 * `watchedPct` is only meaningful for videos: a video counts as done at
 * game_settings.video_complete_pct or above. Cues have no progress to measure
 * and complete outright.
 */
export async function completeLibraryItem(
  contentId: string,
  watchedPct?: number
): Promise<CompleteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // ---- 1. Could the caller have read this item themselves? ----------------
  // Their client, so 0010's content_entitled_read applies: unpublished content,
  // or content their rooftop hasn't bought, simply isn't here.
  const { data: item } = await supabase
    .from("content")
    .select("id, type, service_family")
    .eq("id", contentId)
    .maybeSingle();

  if (!item) return { ok: false, error: "That item isn't available to you." };

  const settingsClient = createServiceClient();
  const { data: settings } = await settingsClient
    .from("game_settings")
    .select("sand_lesson, video_complete_pct, sand_lesson_daily_cap, sand_module")
    .limit(1)
    .maybeSingle();

  const amount = Number(settings?.sand_lesson ?? 1);
  const threshold = Number(settings?.video_complete_pct ?? 90);
  const dailyCap = Number(settings?.sand_lesson_daily_cap ?? 30);
  const moduleBonus = Number(settings?.sand_module ?? 15);

  // ---- 2. Videos only count once they've actually been watched ------------
  const isVideo = item.type !== "cue";
  if (isVideo) {
    const pct = Number(watchedPct ?? 0);
    if (!Number.isFinite(pct) || pct < threshold) {
      return { ok: false, error: `Not finished yet — ${threshold}% is the bar.` };
    }
  }

  // The rooftop this counts against. Any active membership will do; the
  // entitlement question was already settled by the read above.
  const { data: membership } = await supabase
    .from("membership")
    .select("rooftop_id")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const rooftopId = membership?.rooftop_id as string | undefined;
  if (!rooftopId) return { ok: false, error: "You're not on a rooftop yet." };

  // ---- 3. Claim it. The unique index decides who was first ----------------
  const service = createServiceClient();
  const { data: progress, error: progressError } = await service
    .from("content_progress")
    .insert({
      user_id: user.id,
      rooftop_id: rooftopId,
      content_id: contentId,
      watched_pct: isVideo ? Math.min(100, Math.round(Number(watchedPct ?? 100))) : 100,
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (progressError) {
    // 23505: already finished. Not an error — just nothing more to pay.
    if (progressError.code === "23505") {
      return {
        ok: true,
        alreadyDone: true,
        awarded: 0,
        badges: [],
        capped: false,
        moduleCompleted: null,
      };
    }
    return { ok: false, error: progressError.message };
  }

  const progressId = progress?.id as string | undefined;

  // ---- 4. The daily ceiling ----------------------------------------------
  // Counted from the ledger rather than tracked in a column, so it cannot drift
  // and needs no reset job. The COMPLETION still stands — hitting the cap means
  // no payment, never a refusal to record progress.
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);

  const { data: todayRows } = await service
    .from("sand_dollar_entry")
    .select("amount")
    .eq("user_id", user.id)
    .eq("reason", "lesson_complete")
    .gte("created_at", since.toISOString());

  const earnedToday = ((todayRows ?? []) as { amount: number }[]).reduce(
    (sum, r) => sum + Number(r.amount ?? 0),
    0
  );
  const capped = earnedToday + amount > dailyCap;

  // ---- 5. Pay, once ------------------------------------------------------
  if (amount > 0 && !capped) {
    const { error: payError } = await service.from("sand_dollar_entry").insert({
      user_id: user.id,
      amount,
      reason: "lesson_complete",
      ref_id: progressId ?? null,
      note: item.type === "cue" ? "Cue completed" : "Video completed",
    });

    // Compensate rather than leave a completion that silently paid nothing:
    // the user must be able to try again cleanly.
    if (payError) {
      await service.from("content_progress").delete().eq("id", progressId);
      return { ok: false, error: payError.message };
    }
  }

  const badges = await awardLearningBadges(service, user.id, item.service_family);

  // ---- 6. Did that finish a module? --------------------------------------
  const moduleCompleted = await maybeCompleteModule(
    service,
    user.id,
    contentId,
    rooftopId,
    moduleBonus
  );

  revalidatePath("/library");
  revalidatePath("/badges");
  return {
    ok: true,
    alreadyDone: false,
    awarded: capped ? 0 : amount,
    badges,
    capped,
    moduleCompleted,
  };
}

/**
 * Finish the module this item belongs to, if its requirements are now met.
 *
 * The module bonus is NOT subject to the daily lesson cap. The cap exists to
 * stop grinding through a 1,257-item library; finishing a module is the event
 * the cap is trying to protect, and capping it would punish the behaviour we
 * want.
 *
 * module_completion's primary key is (user_id, service_family, module_key), so
 * the insert is the pay-once guard — same discipline as everywhere else.
 */
async function maybeCompleteModule(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any,
  userId: string,
  contentId: string,
  rooftopId: string,
  bonus: number
): Promise<{ moduleId: string; bonus: number } | null> {
  const moduleId = await moduleForItem(service, contentId);
  if (!moduleId) return null;

  const req = await moduleRequirementsMet(service, userId, moduleId);
  // Not met is the NORMAL case — cues left, or a quiz still to pass. The quiz
  // path calls this same function after grading, so whichever finishes last
  // triggers the completion.
  if (!req.met) return null;

  const { error } = await service.from("module_completion").insert({
    user_id: userId,
    module_id: moduleId,
    rooftop_id: rooftopId,
  });

  // Already celebrated. The primary key decided; nothing to pay, nothing to show.
  if (error) return null;

  if (bonus > 0) {
    await service.from("sand_dollar_entry").insert({
      user_id: userId,
      amount: bonus,
      reason: "module_complete",
      ref_id: moduleId,
      note: "Module completed",
    });
  }

  return { moduleId, bonus };
}

/**
 * Ten Sunrises, Fifty Sunrises, Full Horizon.
 *
 * Awarded through the same pay-once path as every other badge: user_badge's
 * composite primary key (user_id, badge_key) is what stops a second award, so
 * this can run after every completion without counting anything twice.
 *
 * Eddie's Pick is not here — it counts daily_completion rows, so it belongs to
 * the daily loop, not to the library.
 */
async function awardLearningBadges(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any,
  userId: string,
  serviceFamily: string | null
): Promise<string[]> {
  const { count } = await service
    .from("content_progress")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("completed_at", "is", null);

  const done = Number(count ?? 0);
  const earned: string[] = [];

  if (done >= TEN) earned.push("ten_sunrises");
  if (done >= FIFTY) earned.push("fifty_sunrises");

  // Full Horizon: every PUBLISHED item in this service family, finished.
  if (serviceFamily) {
    const [{ count: published }, { count: mine }] = await Promise.all([
      service
        .from("content")
        .select("id", { count: "exact", head: true })
        .eq("status", "published")
        .eq("service_family", serviceFamily),
      service
        .from("content_progress")
        .select("id, content!inner(service_family, status)", {
          count: "exact",
          head: true,
        })
        .eq("user_id", userId)
        .not("completed_at", "is", null)
        .eq("content.service_family", serviceFamily)
        .eq("content.status", "published"),
    ]);

    const total = Number(published ?? 0);
    if (total > 0 && Number(mine ?? 0) >= total) earned.push("full_horizon");
  }

  if (earned.length === 0) return [];

  // on conflict do nothing: the composite key makes a re-award impossible, so
  // this is safe to call after every single completion.
  const { data } = await service
    .from("user_badge")
    .upsert(
      earned.map((key) => ({ user_id: userId, badge_key: key })),
      { onConflict: "user_id,badge_key", ignoreDuplicates: true }
    )
    .select("badge_key");

  return ((data ?? []) as { badge_key: string }[]).map((r) => r.badge_key);
}


/**
 * Form wrapper for <form action={...}>.
 *
 * The content id arrives from the browser and that is fine: it is treated as a
 * REQUEST, not an instruction. completeLibraryItem re-reads the item with the
 * caller's own client — so an id they could not have read returns nothing — and
 * the amount is never accepted from the client at all.
 */
export async function completeFromForm(formData: FormData): Promise<void> {
  const contentId = String(formData.get("contentId") ?? "");
  if (!contentId) return;

  const pctRaw = formData.get("watchedPct");
  const pct = pctRaw == null ? undefined : Number(pctRaw);

  const result = await completeLibraryItem(contentId, pct);
  // Throwing surfaces the reason rather than silently doing nothing; the happy
  // path and "already done" both return ok.
  if (!result.ok) throw new Error(result.error);
}
