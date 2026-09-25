import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { createClient } from "@/lib/supabase/server";
import { loadMileageRungs } from "@/lib/mileage";

/**
 * THE MILEAGE SHELF — the rung list.
 *
 * Fourteen numbers. Tap one, get its films. That is the whole interaction, and
 * the restraint is the feature: no search, no favourites, no recently-viewed, no
 * recommendations, and no mileage guessed from the DMS. The advisor has the
 * repair order in front of them.
 *
 * NO PROGRESS, ANYWHERE. The count beside each rung is how many films are there,
 * not how many are left — see the note in lib/mileage.ts about why the loader
 * cannot report progress even if this page asked for it.
 */
export default async function MileagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  /*
   * READ AS THE ADVISOR, NOT AS THE SERVICE ROLE. content_entitled_read decides
   * what a rooftop bought, and reading this with a service client would show
   * every advisor at every rooftop a shelf their store may not have. The gate
   * that matters here is the one keeping reference films OUT of a morning (0128);
   * the gate that matters on this page is the ordinary entitlement one, and it
   * only fires when the advisor's own client asks.
   */
  const rungs = await loadMileageRungs(supabase);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <AdminPageHeader
        back={{ href: "/today", label: "Today" }}
        title="Mileage menus"
        subtitle="Look up what to offer at any mileage"
      />

      {/*
        THE LINE THAT DECIDES WHETHER THIS READS AS A SHELF OR AS HOMEWORK.
        An advisor who lands here having watched none of it is not behind, and the
        page has to say so before they start counting.
      */}
      <p className="mt-4 text-base leading-relaxed text-ink">
        A reference shelf, not a course. Find the mileage on the repair order in
        front of you and see what the factory recommends. There is nothing to
        finish here.
      </p>

      {rungs.length === 0 ? (
        <p className="mt-6 text-base leading-relaxed text-ink-soft">
          No mileage films are published yet.
        </p>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {rungs.map((r) => (
            <li key={r.miles}>
              <Link
                href={`/mileage/${r.miles}`}
                className="flex flex-col rounded-card border border-line bg-surface-card px-3 py-3 transition hover:bg-cream-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                <span className="ediagd-numeral text-lg font-extrabold text-navy">
                  {r.label}
                </span>
                <span className="text-xs text-ink-soft">
                  {/* "3 films", never "3 of 51". A count of what is here. */}
                  {r.filmCount} {r.filmCount === 1 ? "film" : "films"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
