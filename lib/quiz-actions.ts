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
import { createServiceClient } from "@/lib/supabase/service";
import { gradeAttempt } from "@/lib/quiz";
import { moduleRequirementsMet } from "@/lib/lms";

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
      const { data: membership } = await supabase
        .from("membership")
        .select("rooftop_id")
        .eq("user_id", user.id)
        .eq("active", true)
        .limit(1)
        .maybeSingle();

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
        rooftop_id: membership?.rooftop_id ?? null,
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
      }
    }
  }

  revalidatePath(`/library/m/${moduleId}`);
  revalidatePath("/library");

  // The result lives in the attempt row, so a refresh re-renders it rather than
  // re-grading or losing it.
  redirect(`/library/m/${moduleId}/quiz?attempt=${result.attemptId}`);
}
