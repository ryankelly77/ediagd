import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminViewer } from "@/lib/access";
import { CelebrationPreview } from "@/components/daily/CelebrationPreview";

/* ============================================================================
   DESIGN PREVIEW — linked from the admin Tools list.

   A standalone view of the badge celebration so the confetti and reveal can be
   tuned without earning a badge. It writes NOTHING, so it is safe to open as
   often as you like.

   ADMIN-ONLY, and 404 for everyone else. It used to be gated on NODE_ENV, which
   made it a dead link the moment the app was deployed — and an advisor who
   found the URL would see something identical to genuinely earning a badge.

   Deliberately outside the (app) route group: no header or tab bar, so the
   animation is the only thing on screen.
   ============================================================================ */

export default async function BadgeCelebrationPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ reward?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAdminViewer(supabase, user.id))) notFound();

  const { reward } = await searchParams;
  const initialReward = Number(reward) > 0 ? Number(reward) : 50;

  return <CelebrationPreview initialReward={initialReward} />;
}
