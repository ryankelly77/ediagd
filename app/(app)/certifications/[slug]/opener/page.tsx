/* ============================================================================
   EDIAGD — the entry film, on its own page

   /certifications/<slug>/opener

   Reached from the entry-film row on /certifications/[slug]. One film, the
   credit-only player, and the way back. Nothing else is on this page.

   ---------------------------------------------------------------------------
   NOT A GENERIC "PLAY ANY CONTENT" ROUTE, DELIBERATELY
   ---------------------------------------------------------------------------
   The film is not named in the URL. The slug names a TRACK, and the film is
   whatever `certification.entry_film_content_id` points at — so this route
   cannot be pointed at an arbitrary content id, and an advisor cannot reach a
   film by guessing. The entitlement check still happens underneath (the read
   below is the viewer's own client, so content_entitled_read applies), but the
   addressable surface is one film per track rather than the catalog.

   ---------------------------------------------------------------------------
   THE SAME THREE FILTERS THE LOOP USES
   ---------------------------------------------------------------------------
   pickItem() will only serve an entry film that is published, not retired and
   has a Mux playback id. This page applies the same three, because a page that
   would play a film the loop refuses — or refuse one the loop plays — is two
   definitions of "the opener". loadTrackDetail checks the first two and now the
   third as well, so the row on the track page only becomes a link when this
   page can actually play what it links to.
============================================================================ */

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card } from "@/components/brand/Card";
import { OpenerPlayer } from "@/components/certifications/OpenerPlayer";
import { renditionsFor } from "@/lib/mux/playback";

export const metadata = { title: "Entry film" };

export default async function OpenerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { slug } = await params;

  const { data: cert } = await supabase
    .from("certification")
    .select("id, slug, name, kind, entry_film_content_id")
    .eq("slug", slug)
    .maybeSingle();

  /* No track, or a track nobody has ruled an opener for. Not an error state to
     explain — there is no such page. */
  if (!cert?.entry_film_content_id) notFound();

  const { data: film } = await supabase
    .from("content")
    /* One string literal, not a concatenation: the typed client infers the row
       shape from the literal and a `+` expression collapses it to an error
       type. Same reason MINDSET_COLUMNS is a bare const in lib/loop.ts. */
    .select(
      "id, title, short_title, duration_sec, mux_playback_id, mux_playback_policy, vertical_playback_id, vertical_status"
    )
    .eq("id", cert.entry_film_content_id)
    .eq("status", "published")
    .is("retired_at", null)
    .not("mux_playback_id", "is", null)
    .maybeSingle();

  if (!film) notFound();

  const renditions = await renditionsFor(film);

  const { data: seen } = await supabase
    .from("content_progress")
    .select("content_id")
    .eq("user_id", user.id)
    .eq("content_id", film.id)
    .not("completed_at", "is", null)
    .maybeSingle();

  const title = (film.title as string) ?? "The entry film";
  const back = {
    href: `/certifications/${encodeURIComponent(cert.slug as string)}`,
    label: cert.name as string,
  };

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={back}
        trail={[{ href: "/certifications", label: "Certifications" }]}
        title={title}
        subtitle={`Entry film · ${cert.name}`}
      />

      {/*
       * A FILM WITH NO SIGNABLE RENDITION IS SAID OUT LOUD, not rendered as an
       * empty frame. renditionsFor returns null when no token can be minted —
       * the trap the openers acceptance suite documents, where every film
       * shapes to null and the screen silently proves nothing. The advisor gets
       * a sentence and the way back.
       */}
      {renditions ? (
        <OpenerPlayer
          contentId={film.id as string}
          title={title}
          renditions={renditions}
          trackSlug={cert.slug as string}
          trackName={cert.name as string}
          alreadyWatched={Boolean(seen)}
        />
      ) : (
        <Card className="mt-4 p-5">
          <p className="text-sm leading-relaxed text-ink-soft">
            This film can&apos;t be played right now. It isn&apos;t anything you
            did — the lessons on {cert.name} are still open below.
          </p>
        </Card>
      )}

      <p className="mt-6 px-1 text-xs leading-relaxed text-ink-soft">
        This is the film that opens {cert.name}. Watching it here counts — your
        morning won&apos;t serve it to you again.
      </p>
    </main>
  );
}
