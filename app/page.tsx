import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { IsoDate } from "@/lib/gamification/streak";

/**
 * The root route is a ROUTER — it renders nothing and always redirects.
 *
 * It previously fell through to a scaffold page dumping memberships and
 * entitlements ("Your access" / "Products your rooftop owns") whenever the
 * advisor redirect didn't fire — which meant every signed-out visitor, i.e.
 * anyone arriving at the bare domain, saw an empty internal panel instead of
 * the login screen. Signed-in non-advisors got it too.
 *
 * Every path below ends in a redirect, so that can't recur.
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No session: the front door is the login screen.
  if (!user) redirect("/login");

  const [{ data: memberships }, { data: profile }] = await Promise.all([
    supabase
      .from("membership")
      .select("rooftop_id, role")
      .eq("user_id", user.id)
      .eq("active", true),
    supabase
      .from("app_user")
      .select("is_platform_owner")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const roles = new Set((memberships ?? []).map((m) => m.role as string));

  // ---- Advisors (and techs) start in the daily ritual --------------------
  const daily =
    memberships?.find((m) => m.role === "advisor") ??
    memberships?.find((m) => m.role === "technician");

  if (daily?.rooftop_id) {
    const { data: todayRaw } = await supabase.rpc("rooftop_today", {
      _rooftop: daily.rooftop_id as string,
    });
    const today =
      (todayRaw as IsoDate | null) ?? new Date().toISOString().slice(0, 10);

    const { data: done } = await supabase
      .from("daily_completion")
      .select("id")
      .eq("user_id", user.id)
      .eq("completion_date", today)
      .maybeSingle();

    redirect(done ? "/advisor" : "/today");
  }

  // ---- Otherwise the most specific home their role has -------------------
  if (roles.has("manager")) redirect("/manager");
  if (roles.has("admin") || profile?.is_platform_owner) redirect("/admin");

  // Signed in with no usable role — somewhere real, never a dead page.
  redirect("/profile");
}
