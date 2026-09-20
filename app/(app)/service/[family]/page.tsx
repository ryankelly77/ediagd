import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { loadFamilyContent, loadFocusFamilyCard } from "@/lib/service-family";
import { renditionsFor } from "@/lib/mux/playback";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ServiceShelf } from "@/components/advisor/ServiceShelf";

/* ============================================================================
   EDIAGD — one service family's shelf

   THE SCREEN "BROWSE TO BELTS & COOLING" HAS NEVER HAD.

   Until 3c there was nowhere to go: the service dialog on /advisor showed the
   family's CUES and a video tab badged "Soon", while the daily loop served that
   same advisor a film from that same family the same morning. 52 published
   films were reachable through op_code_family and invisible on every
   member-facing surface.

   This is where the card's "continue" lands and where the dialog's film list
   points. It is deliberately not a new library: the deck, the completion path
   and the consumption record are the ones that already exist.
   ============================================================================ */

export default async function ServiceFamilyPage({
  params,
}: {
  params: Promise<{ family: string }>;
}) {
  const { family: raw } = await params;
  /* The family is free text with spaces and ampersands — "Belts & Cooling" —
     so it arrives percent-encoded and has to come back out. */
  const family = decodeURIComponent(raw);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const service = createServiceClient();

  const [resolved, card] = await Promise.all([
    loadFamilyContent(supabase, user.id, [family]),
    loadFocusFamilyCard(supabase, service, user.id),
  ]);

  const content = resolved[family];

  /*
   * NOTHING RESOLVED IS NOT A 404.
   *
   * It means one of three things and the advisor cannot tell them apart: the
   * family name is not one we map, the rooftop has not bought the product, or
   * the family genuinely has nothing published. All three are "there is nothing
   * here for you", and inventing a not-found page for the middle one would
   * tell an entitlement story through an error code.
   */
  if (!content || (content.films.length === 0 && content.cues.length === 0)) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <AdminPageHeader back={{ href: "/advisor", label: "Your numbers" }} title={family} />
        <p className="mt-6 rounded-card border border-line bg-cream-card px-6 py-10 text-center text-sm leading-relaxed text-ink-soft">
          Nothing is published for {family} yet.
        </p>
      </main>
    );
  }

  /*
   * ---- SIGNED, BUT NOT SHAPED ---------------------------------------------
   *
   * renditionsFor() is a local HMAC — no database, no network — so minting one
   * per film is cheap and the whole shelf is playable without a tap costing a
   * round trip.
   *
   * What is NOT done here is shapeVideo(), which also reads content_progress
   * and the watch gate PER FILM. Twelve films would be twenty-four extra
   * queries on a page load to re-derive something loadFamilyContent already
   * returned once: `completed`. The gate is a per-DAY record for the ritual;
   * this shelf is not the ritual, and watching ahead here is complete-or-not,
   * not gated.
   */
  const playable = await Promise.all(
    content.films.map(async (f) => {
      const { data: row } = await supabase
        .from("content")
        .select(
          "id, mux_playback_id, mux_playback_policy, vertical_playback_id, vertical_status"
        )
        .eq("id", f.contentId)
        .maybeSingle();
      const renditions = row ? await renditionsFor(row) : null;
      return renditions ? { ...f, renditions } : null;
    })
  );

  const films = playable.filter(Boolean) as (typeof content.films[number] & {
    renditions: NonNullable<Awaited<ReturnType<typeof renditionsFor>>>;
  })[];

  const done = films.filter((f) => f.completed).length;
  const isFocus = card?.family === family;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <AdminPageHeader
        back={{ href: "/advisor", label: "Your numbers" }}
        title={family}
        subtitle={
          films.length > 0
            ? `${done} of ${films.length} films · ${content.cues.length} cues`
            : `${content.cues.length} cues`
        }
      />

      <ServiceShelf
        family={family}
        films={films}
        cues={content.cues}
        /* Named so the shelf can say "this is the one you're working" without
           re-deriving the assignment. */
        isFocusFamily={isFocus}
      />
    </main>
  );
}
