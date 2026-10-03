import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FrontDoor, type FrontDoorFilm } from "@/components/front-door/FrontDoor";
import type { IsoDate } from "@/lib/gamification/streak";

/**
 * The root route. SIGNED OUT it renders the front door — a preview of a morning
 * for someone with no account (see components/front-door and 0156). SIGNED IN it
 * is a router: every path below ends in a redirect to the viewer's real home.
 *
 * It used to redirect a signed-out visitor straight to /login; the front door
 * replaces that bare door with something to look at first. "Sign in" on it still
 * goes to /login, so nothing is lost.
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ---- Signed out: the front door --------------------------------------
  // Read with the caller's own (anon) client — front_door_film is granted to
  // anon and is the ONLY content it can reach. Rows are curated and public.
  if (!user) {
    const { data } = await supabase
      .from("front_door_film")
      .select("slot, title, collection, op_code, stage, duration_sec, body, public_playback_id")
      .order("sort", { ascending: true });
    const films: FrontDoorFilm[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      slot: r.slot as FrontDoorFilm["slot"],
      title: (r.title as string) ?? "",
      collection: (r.collection as string | null) ?? null,
      opCode: (r.op_code as string | null) ?? null,
      stage: (r.stage as string | null) ?? null,
      durationSec: r.duration_sec == null ? null : Number(r.duration_sec),
      body: (r.body as string | null) ?? null,
      publicPlaybackId: (r.public_playback_id as string | null) ?? null,
    }));
    return <FrontDoor films={films} />;
  }

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
