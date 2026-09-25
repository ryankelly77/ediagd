import { notFound, redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { MileageShelf } from "@/components/mileage/MileageShelf";
import { createClient } from "@/lib/supabase/server";
import { formatMiles, loadMileageFilms } from "@/lib/mileage";

/**
 * One rung: its films, title order. Title, duration, play.
 *
 * The rung comes out of the URL, so it is validated rather than trusted — an
 * unparseable or out-of-range value is a 404, not a query with NaN in it. A
 * query built from a bad cast would come back empty and this page would say
 * "no films on this rung", which is the confident-wrong-answer shape rather
 * than an error.
 */
export default async function MileageRungPage({
  params,
}: {
  params: Promise<{ rung: string }>;
}) {
  const { rung } = await params;

  if (!/^\d{4,6}$/.test(rung)) notFound();
  const miles = Number(rung);
  if (!Number.isSafeInteger(miles) || miles < 1000 || miles > 200000) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  /* The advisor's own client — entitlement decides the shelf. See /mileage. */
  const films = await loadMileageFilms(supabase, miles);

  /*
   * A RUNG WITH NO FILMS IS A 404, NOT AN EMPTY SHELF.
   *
   * The rung list is built from the films that exist, so every link on it leads
   * somewhere. Reaching this page with nothing on it means a hand-typed URL or a
   * film retired since the list was rendered — and in both cases "this rung does
   * not exist" is the true answer. Rendering an empty shelf instead would invent
   * a rung the catalog never claimed.
   */
  if (films.length === 0) notFound();

  const label = formatMiles(miles);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <AdminPageHeader
        back={{ href: "/mileage", label: "Mileage menus" }}
        title={`${label} miles`}
        subtitle={`${films.length} ${films.length === 1 ? "film" : "films"}`}
      />
      <MileageShelf films={films} label={label} />
    </main>
  );
}
