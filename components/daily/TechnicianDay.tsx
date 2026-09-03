"use client";

/* ============================================================================
   EDIAGD — the technician's day

   ---------------------------------------------------------------------------
   WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT
   ---------------------------------------------------------------------------
   The review's finding 10: a provisioned technician sees an empty app and no
   error. Every pool the advisor loop draws from is advisor-gated, so /today
   rendered, found nothing, and said nothing.

   This is the minimum that makes the emptiness honest: a quote and, when one
   exists, a training video. It is NOT the advisor loop with pieces removed —
   there is no Eddie's Pick, no performance, no coaching block, no step count,
   and no Continue gate, because none of those mean anything for a technician
   yet and shipping them half-wired would be inventing a contract nobody has
   agreed.

   NOTHING HERE COMPLETES A DAY. There is no button that writes a row. A
   technician has no daily-loop contract, so a streak would be counting
   something the product has not promised — see completeDayAction, which now
   refuses technician-only accounts by name rather than by falling through.

   The video is `credit-only`: watching is measured and recorded, and holds
   nothing shut. When the LMS lands it will already have the numbers.
   ============================================================================ */

import { TrackedVideo } from "@/components/video/TrackedVideo";
import { VideoNotReady } from "@/components/video/MuxVideo";
import { Card } from "@/components/brand/Card";
import { BRAND } from "@/lib/brand";
import { PhoneScreen } from "@/components/brand/PhoneScreen";
import { SunWaveMotif } from "@/components/brand/SunWaveMotif";
import type { LifestyleVideo } from "@/components/daily/DailyFlow";

export function TechnicianDay({
  greetingName,
  quote,
  video,
  videoThreshold,
}: {
  greetingName: string;
  quote: { id: string; title: string | null; body: string | null; voice: string | null } | null;
  video: LifestyleVideo | null;
  videoThreshold: number;
}) {
  return (
    <PhoneScreen>
      <PhoneScreen.Body>
        {/* BRAND.greeting, the same word the advisor's day opens with. The
            first version used ackLabel here, which is the CTA phrase ("Carry it
            with me") and read as a very strange hello. */}
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-ocean">
          {BRAND.greeting}, {greetingName}
        </p>

        {/* ---- The quote ---------------------------------------------------
            Mindset content is not advisor-specific, which is why 0091 widened
            `quote` to technicians. Before that a technician read zero quotes
            and this section would have been the empty app all over again. */}
        {quote ? (
          <Card className="mt-4 p-5">
            <blockquote className="border-l-2 border-teal pl-4">
              <p className="text-base leading-relaxed text-navy">{quote.body}</p>
            </blockquote>
            {quote.voice && (
              <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-ink-soft">
                {quote.voice}
              </p>
            )}
          </Card>
        ) : null}

        {/* ---- The training video, or an honest shelf --------------------- */}
        <div className="mt-6">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-ocean">
            Technician training
          </p>
          {video ? (
            <>
              <h1 className="mt-1 text-2xl font-extrabold text-navy">{video.title}</h1>
              <div className="mt-4">
                <TrackedVideo
                  /*
                   * credit-only, not gate-continue. It measures and reports;
                   * nothing is waiting on the number. There is no Continue
                   * button on this screen to hold shut.
                   */
                  policy="credit-only"
                  contentId={video.contentId}
                  renditions={video.renditions}
                  title={video.title}
                  threshold={videoThreshold}
                  initialWatchedPct={video.watchedPct}
                  initialPositionSec={video.positionSec}
                />
              </div>
            </>
          ) : (
            /*
             * NEVER A BLANK CARD. Doctrine, and the whole point of the task:
             * the shelf is empty today because nothing has been filmed, and
             * saying so is the difference between "coming soon" and "broken".
             */
            <div className="mt-3">
              <VideoNotReady reason="Technician training is coming soon. Mitch is filming the first set now — it lands here the day it's ready." />
            </div>
          )}
        </div>

        <div className="mt-10 flex justify-center opacity-70">
          <SunWaveMotif />
        </div>
      </PhoneScreen.Body>
    </PhoneScreen>
  );
}
