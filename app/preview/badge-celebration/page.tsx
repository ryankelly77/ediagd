import { notFound } from "next/navigation";
import { CelebrationPreview } from "@/components/daily/CelebrationPreview";

/* ============================================================================
   TEMPORARY DEV PREVIEW — DELETE WHEN THE ANIMATION IS SIGNED OFF.

   A standalone view of the badge celebration so the confetti and reveal can be
   tuned without earning a badge. It reads and writes NOTHING — no Supabase
   client, no auth, no data — so it is safe to open repeatedly, but it is still
   404'd outside development so it can't ship by accident.

   Deliberately outside the (app) route group: no header or tab bar, so the
   animation is the only thing on screen.
   ============================================================================ */

export default async function BadgeCelebrationPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ reward?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { reward } = await searchParams;
  const initialReward = Number(reward) > 0 ? Number(reward) : 50;

  return <CelebrationPreview initialReward={initialReward} />;
}
