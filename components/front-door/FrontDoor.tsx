import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { PublicFilm } from "@/components/front-door/PublicFilm";

/* ============================================================================
   EDIAGD — the front door

   What someone with no account sees at the app's root. A preview of a morning —
   one sample from each of its three beats — then how certification works, then
   the two ways in: Sign in, or Book a call. Every film here is PUBLIC (see
   0156 and PublicFilm); nothing gated is reachable without an account.
   ============================================================================ */

export type FrontDoorFilm = {
  slot: "mindset" | "pitch" | "item";
  title: string;
  collection: string | null;
  opCode: string | null;
  stage: string | null;
  durationSec: number | null;
  body: string | null;
  publicPlaybackId: string | null;
};

function mins(sec: number | null): string | null {
  if (!sec || sec <= 0) return null;
  return sec < 60 ? `${sec} sec` : `${Math.round(sec / 60)} min`;
}

export function FrontDoor({ films }: { films: FrontDoorFilm[] }) {
  const by = (slot: FrontDoorFilm["slot"]) => films.find((f) => f.slot === slot) ?? null;
  const mindset = by("mindset");
  const pitch = by("pitch");
  const item = by("item");

  return (
    <main className="ediagd-app min-h-svh bg-cream">
      <div className="mx-auto max-w-app px-4 pb-16">
        {/* ---- Hero / intro (the logo + copy, no playable film) ----------- */}
        <section className="pt-10 text-center">
          <p className="ediagd-eyebrow">Welcome to</p>
          {/* The brand lockup — the mark, the EDIAGD wordmark and the tagline —
              not set as text. Wordmark is the one source for all three. */}
          <div className="mt-3 flex justify-center">
            <Wordmark size={60} />
          </div>
          <p className="mx-auto mt-5 max-w-md text-lg leading-relaxed text-ink">
            An about-five-minute coaching habit for service advisors — a mindset
            film, the selling skill for a real repair, and one lesson that builds
            toward a credential. Here is a morning, before you sign in.
          </p>
        </section>

        {/* ---- A morning, in three beats --------------------------------- */}
        <section className="mt-10">
          <h2 className="ediagd-eyebrow px-1">A morning, in three beats</h2>

          {/* 1 — Mindset */}
          {mindset && (
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <span className="ediagd-eyebrow">1 · Mindset</span>
                {mins(mindset.durationSec) && (
                  <span className="ediagd-numeral text-xs text-ink-soft">
                    {mins(mindset.durationSec)}
                  </span>
                )}
              </div>
              <h3 className="mt-1 text-lg font-extrabold leading-snug text-navy">
                {mindset.title}
              </h3>
              {mindset.publicPlaybackId && (
                <div className="mt-3">
                  <PublicFilm
                    playbackId={mindset.publicPlaybackId}
                    title={mindset.title}
                  />
                </div>
              )}
            </div>
          )}

          {/* 2 — The pitch */}
          {pitch && (
            <div className="mt-8">
              <div className="flex items-center gap-2">
                <span className="ediagd-eyebrow">2 · The pitch</span>
                {mins(pitch.durationSec) && (
                  <span className="ediagd-numeral text-xs text-ink-soft">
                    {mins(pitch.durationSec)}
                  </span>
                )}
              </div>
              <h3 className="mt-1 text-lg font-extrabold leading-snug text-navy">
                The selling skill, filmed on a real repair
              </h3>
              <p className="mt-0.5 text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
                {[pitch.stage, pitch.opCode].filter(Boolean).join(" · ")}
              </p>
              {pitch.publicPlaybackId && (
                <div className="mt-3">
                  <PublicFilm
                    playbackId={pitch.publicPlaybackId}
                    title={`${pitch.stage ?? "Pitch"} — ${pitch.opCode ?? ""}`}
                  />
                </div>
              )}
            </div>
          )}

          {/* 3 — The lesson */}
          {item && (
            <div className="mt-8">
              <span className="ediagd-eyebrow">3 · The lesson</span>
              <h3 className="mt-1 text-lg font-extrabold leading-snug text-navy">
                {item.title}
              </h3>
              {item.body && (
                <div className="mt-3 rounded-card border border-line bg-surface-card p-5">
                  <p className="whitespace-pre-line text-[15px] leading-relaxed text-navy">
                    {item.body}
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ---- How certification works ----------------------------------- */}
        <section className="mt-12 rounded-card bg-navy p-6 text-left">
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-gold">
            How certification works
          </h2>
          <p className="mt-3 text-lg font-extrabold leading-snug text-white">
            The mornings add up to something you can hold.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ice-dim">
            Each track is a set of short lessons and the films that teach them.
            Finish a track&apos;s lessons and pass its checks and the track is
            yours. Earn the nine core tracks and you are{" "}
            <span className="font-bold text-white">EDIAGD Certified</span> — then
            the Master track opens. It is a credential that says you can do the
            job on the drive, not a certificate for watching videos.
          </p>
        </section>

        {/* ---- The two ways in ------------------------------------------- */}
        <section className="mt-10">
          <Link
            href="/login"
            className="flex min-h-[3.25rem] w-full items-center justify-center rounded-xl bg-gold px-5 text-base font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            Sign in
          </Link>
          <a
            href="https://ediagd.ai"
            className="mt-3 flex min-h-[3.25rem] w-full items-center justify-center rounded-xl border border-line bg-surface-card px-5 text-base font-extrabold text-navy transition hover:bg-teal-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            Book a call
          </a>
          <p className="mt-4 text-center text-xs text-ink-soft">
            Accounts are created by your dealership. No account yet? Book a call
            and we&apos;ll get you set up.
          </p>
        </section>
      </div>
    </main>
  );
}
