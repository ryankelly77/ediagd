import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { PublicFilm } from "@/components/front-door/PublicFilm";

/* ============================================================================
   EDIAGD — the front door

   What someone with no account sees at the app's root. Four films, all Mitch — an
   intro, then one sample from each beat of a morning (mindset, pitch, lesson) —
   then how certification works, then the two ways in: Sign in, or Book a call.
   Every film here is PUBLIC (see 0157 and PublicFilm); nothing gated is reachable
   without an account.

   PublicFilm exists because MuxVideo cannot take an unsigned id — it mints a token
   per view and refuses a public playback id outright (lib/mux/playback.ts).
   ============================================================================ */

export type FrontDoorFilm = {
  slot: "intro" | "mindset" | "pitch" | "item";
  title: string;
  durationSec: number | null;
  publicPlaybackId: string;
  caption: string;
};

function mins(sec: number | null): string | null {
  if (!sec || sec <= 0) return null;
  return sec < 60 ? `${sec} sec` : `${Math.round(sec / 60)} min`;
}

function FilmBeat({ eyebrow, film }: { eyebrow: string; film: FrontDoorFilm }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="ediagd-eyebrow">{eyebrow}</span>
        {mins(film.durationSec) && (
          <span className="ediagd-numeral text-xs text-ink-soft">
            {mins(film.durationSec)}
          </span>
        )}
      </div>
      <p className="mt-1 text-lg font-extrabold leading-snug text-navy">
        {film.caption}
      </p>
      <div className="mt-3">
        <PublicFilm playbackId={film.publicPlaybackId} title={film.title} />
      </div>
    </div>
  );
}

export function FrontDoor({ films }: { films: FrontDoorFilm[] }) {
  const by = (slot: FrontDoorFilm["slot"]) => films.find((f) => f.slot === slot) ?? null;
  const intro = by("intro");
  const mindset = by("mindset");
  const pitch = by("pitch");
  const item = by("item");

  return (
    <main className="ediagd-app min-h-svh bg-cream">
      <div className="mx-auto max-w-app px-4 pb-16">
        {/* ---- Hero -------------------------------------------------------- */}
        <section className="pt-10 text-center">
          <p className="ediagd-eyebrow">Welcome to</p>
          {/* The brand lockup — mark, wordmark and tagline — not set as text. */}
          <div className="mt-3 flex justify-center">
            <Wordmark size={60} />
          </div>
          <p className="mx-auto mt-5 max-w-md text-lg leading-relaxed text-ink">
            An about-five-minute coaching habit for service advisors. Here is a
            morning, before you sign in.
          </p>
        </section>

        {/* ---- The intro film --------------------------------------------- */}
        {intro && (
          <section className="mt-8">
            <FilmBeat eyebrow="A word from Mitch" film={intro} />
          </section>
        )}

        {/* ---- A morning, in three beats ---------------------------------- */}
        <section className="mt-12">
          <h2 className="ediagd-eyebrow px-1">A morning, in three beats</h2>
          <div className="mt-3 space-y-8">
            {mindset && <FilmBeat eyebrow="1 · Mindset" film={mindset} />}
            {pitch && <FilmBeat eyebrow="2 · The pitch" film={pitch} />}
            {item && <FilmBeat eyebrow="3 · The lesson" film={item} />}
          </div>
        </section>

        {/* ---- How certification works ------------------------------------ */}
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

        {/* ---- The two ways in -------------------------------------------- */}
        <section className="mt-10">
          <Link
            href="/login"
            className="flex min-h-[3.25rem] w-full items-center justify-center rounded-xl bg-gold px-5 text-base font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            Sign in
          </Link>
          <a
            href="https://ediagd.ai/#book"
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
