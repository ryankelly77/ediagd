"use server";

/* ============================================================================
   EDIAGD — submitting a quiz
   SERVER ONLY. A "use server" module may only export async functions.

   The client sends a module id and its choices. It does not send, and is never
   told, a score — gradeAttempt computes it from the answer key, which only the
   service role can read. A submission is a request to be graded, never an
   assertion of a result.
   ============================================================================ */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { chooseRooftop } from "@/lib/rooftop-choice";
import { createServiceClient } from "@/lib/supabase/service";
import { gradeAttempt } from "@/lib/quiz";
import { moduleRequirementsMet } from "@/lib/lms";
import { accrueFromModule } from "@/lib/certification-server";

/**
 * Grade an attempt, then complete the module if that was the last requirement.
 *
 * The completion check runs here as well as after a cue, because either can be
 * the final step — whichever finishes last triggers the celebration.
 */
export async function submitQuiz(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const moduleId = String(formData.get("moduleId") ?? "");
  if (!moduleId) throw new Error("Which module?");

  // Answers arrive as q:<questionId> = <storedValue>.
  const answers: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("q:")) answers[k.slice(2)] = String(v);
  }

  const result = await gradeAttempt(user.id, moduleId, answers);
  if ("error" in result) throw new Error(result.error);

  if (result.passed) {
    const service = createServiceClient();
    const req = await moduleRequirementsMet(service, user.id, moduleId);

    if (req.met) {
      /*
       * THE SAME CHOOSER THE LIBRARY PATH USES, for the same table.
       *
       * Both paths write `module_completion.rooftop_id` for the same module:
       * the library when the last gating item is finished, this one when the
       * quiz that was holding it is passed. They each had their own unordered
       * `limit(1)` with no role preference, so for a manager-advisor the two
       * could file the SAME lesson at two different rooftops depending on which
       * act completed it. Whichever ran second inserted nothing — the primary
       * key is the pay-once guard — so the rooftop on the row was decided by a
       * race nobody knew was there.
       *
       * Found by asking who else picks a rooftop after fixing
       * completeLibraryItem. See lib/rooftop-choice.ts.
       */
      const { data: memberships } = await supabase
        .from("membership")
        .select("rooftop_id, role")
        .eq("user_id", user.id)
        .eq("active", true);
      const rooftopId = chooseRooftop(memberships ?? []);

      const { data: settings } = await service
        .from("game_settings")
        .select("sand_module")
        .limit(1)
        .maybeSingle();

      // The primary key is the pay-once guard: a second pass of the same quiz
      // inserts nothing and pays nothing.
      const { error } = await service.from("module_completion").insert({
        user_id: user.id,
        module_id: moduleId,
        rooftop_id: rooftopId,
      });

      if (!error) {
        const bonus = Number(settings?.sand_module ?? 15);
        if (bonus > 0) {
          await service.from("sand_dollar_entry").insert({
            user_id: user.id,
            amount: bonus,
            reason: "module_complete",
            ref_id: moduleId,
            note: "Module completed",
          });
        }

        /*
         * Passing the quiz can be the act that finishes the last module of a
         * craft certification. Without this the library path would certify and
         * the quiz path would not, and a course whose final requirement is its
         * quiz would never certify anybody at all.
         */
        if (rooftopId) {
          await accrueFromModule(service, user.id, rooftopId, moduleId);
        }
      }
    }
  }

  revalidatePath(`/library/m/${moduleId}`);
  revalidatePath("/library");

  // The result lives in the attempt row, so a refresh re-renders it rather than
  // re-grading or losing it.
  redirect(`/library/m/${moduleId}/quiz?attempt=${result.attemptId}`);
}
