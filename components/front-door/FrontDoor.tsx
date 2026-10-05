import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { SealMedallion } from "@/components/brand/badges/SealMedallion";
import { PublicFilm } from "@/components/front-door/PublicFilm";

/* ============================================================================
   EDIAGD — the front door

   What someone with no account sees at the app's root: a line on what EDIAGD is,
   TWO films, how certification works, and the two ways in — Sign in, or Book a
   call.

   EXACTLY TWO FILMS, AND THAT IS A PROPERTY, NOT A PREFERENCE
   Both films play on a PUBLIC Mux playback id, and exactly two public playback
   ids exist in the whole Mux account (0158 — the census is in the PR). Every
   other film in the library is signed: its id is useless without a short-lived
   token minted server-side once the viewer is known to be entitled
   (lib/mux/playback.ts). So a third card is not a layout decision, it is a
   minted public id — a decision taken in a migration, never here.

   There is no intro card, no pitch card, no still, and NO FALLBACK BRANCH. The
   page cannot render a filmless card because the data cannot describe one:
   front_door_slot.public_playback_id is NOT NULL and the slot is constrained to
   the two values below, so "a slot with nothing to play" is unrepresentable
   rather than merely handled. An earlier cut showed a still when the id was
   null; that branch is gone along with the state that justified it.

   PublicFilm exists because MuxVideo cannot take an unsigned id — it mints a
   token per view and refuses a public playback id outright.
   ============================================================================ */

export type FrontDoorFilm = {
  slot: "mindset" | "item";
  title: string;
  durationSec: number | null;
  /** Always present: the column is NOT NULL and the page has no still branch. */
  publicPlaybackId: string;
  caption: string;
};

/* The nine core tracks, which together are the credential.

   DECLARED HERE, AND THAT IS A LIABILITY WORTH NAMING: this is a hardcoded list
   on a page read by anon, which has no grant on `certification` and should not
   be given one for a shop window. It is therefore a claim that can drift from
   the curriculum. It was taken from production — `select name from certification
   where is_core` returns these nine, and `count(*) filter (where is_core)` is 9,
   which 0158 does not police. If a tenth core track is ever added, this list is
   one of the places that has to change, and nothing here will say so. */
const CORE_TRACKS = [
  "Four Step Close",
  "Lasting Impressions",
  "Menus",
  "Name Tag",
  "Overcoming Objections",
  "Power of Positive Language",
  "Setting up the MPI",
  "Success Cycle",
  "Walk Around",
];

function mins(sec: number | null): string | null {
  if (!sec || sec <= 0) return null;
  return sec < 60 ? `${sec} sec` : `${Math.round(sec / 60)} min`;
}

/** One film: its caption, then the film. Both slots render identically. */
function FilmCard({ eyebrow, film }: { eyebrow: string; film: FrontDoorFilm }) {
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
  const mindset = by("mindset");
  const item = by("item");

  return (
    <main className="ediagd-app min-h-svh bg-cream">
      <div className="mx-auto max-w-app px-4 pb-16">
        {/* ---- Welcome: the lockup and one line. No film. ------------------ */}
        <section className="pt-10 text-center">
          <p className="ediagd-eyebrow">Welcome to</p>
          {/* The brand lockup — mark, wordmark and tagline — not set as text. */}
          <div className="mt-3 flex justify-center">
            <Wordmark size={60} />
          </div>
          <p className="mx-auto mt-5 max-w-md text-lg leading-relaxed text-ink">
            A five-minute coaching habit for service advisors: one mindset film
            and one lesson, every morning, before the drive gets busy.
          </p>
        </section>

        {/* ---- The two films ---------------------------------------------- */}
        <section className="mt-10">
          <h2 className="ediagd-eyebrow px-1">Two films from a morning</h2>
          <div className="mt-3 space-y-8">
            {mindset && <FilmCard eyebrow="The mindset" film={mindset} />}
            {item && <FilmCard eyebrow="The lesson" film={item} />}
          </div>
        </section>

        {/* ---- How certification works ------------------------------------ */}
        <section className="mt-12 rounded-card bg-navy p-6 text-left">
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-gold">
            How certification works
          </h2>

          <div className="mt-4 flex items-center gap-4">
            {/* The credential's own seal. "earned" so the art renders in full
                colour — this is the thing being shown, not a viewer's state;
                a signed-out visitor has no state to render. */}
            <SealMedallion
              glyphKey="credential_certified"
              name="EDIAGD Certified"
              state="earned"
              size={72}
            />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-extrabold leading-snug text-white">
                The mornings add up to something you can hold.
              </p>
              <p className="mt-1 text-sm text-ice-dim">
                Nine core tracks, then the Master track opens.
              </p>
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-ice-dim">
            Each track is a set of short lessons and the films that teach them.
            Finish a track&apos;s lessons, pass its checks, and the track is
            yours. Earn all nine and you are{" "}
            <span className="font-bold text-white">EDIAGD Certified</span> — a
            credential that says you can do the job on the drive, not a
            certificate for watching videos.
          </p>

          <ul className="mt-4 flex flex-wrap gap-1.5">
            {CORE_TRACKS.map((t) => (
              <li
                key={t}
                className="rounded-pill border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-bold text-ice-dim"
              >
                {t}
              </li>
            ))}
          </ul>
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
