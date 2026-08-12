import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { BucketRow, ComingSoon, NotIncluded } from "@/components/library/LibraryPieces";
import { getAdminContext } from "@/lib/guards";
import { checkEntitlement } from "@/lib/entitlements";
import { listMakes } from "@/lib/library";

/**
 * Joe the Pro — technical explainers, browsed by vehicle.
 *
 * VEHICLE IS THE AXIS, not service. A technician is standing at a car; they
 * want what applies to that car. Service family exists on these rows too and
 * works as a filter inside a make, but making it primary would mean starting
 * from a category when you already know the vehicle.
 *
 * ENTITLEMENT. joe_the_pro is an add-on (0001's product_catalog), so the
 * rooftop must own it AND the caller must hold the role it serves. Both are
 * checked here so the screen can explain itself, and again by RLS on every row
 * — the page cannot leak what the database won't hand over.
 */
export default async function JoeThePro() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [ent, admin] = await Promise.all([
    checkEntitlement(supabase, user.id, ["advisor", "manager"], "joe_the_pro"),
    getAdminContext(),
  ]);

  // Admins and the platform owner may look without holding the role — 0010's
  // content_admin_all already lets them read it, so hiding the screen would
  // only stop them reviewing what they publish.
  const mayBrowse = ent.entitled || admin.hasAdminAccess;

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/more", label: "More" }}
        title="Joe the Pro"
        subtitle="Technical explainers, by vehicle."
      />

      {!mayBrowse ? (
        <NotIncluded product="Joe the Pro" hasRole={ent.hasRole} roleName="advisor">
          Joe the Pro explains what a repair actually involves and why it
          matters — organised by make, model and year, so you can see it
          explained before you sell it.
        </NotIncluded>
      ) : (
        <JoeBrowse supabase={supabase} />
      )}
    </main>
  );
}

async function JoeBrowse({
  supabase,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
}) {
  const makes = await listMakes(supabase);

  if (makes.length === 0) {
    return (
      <ComingSoon title="Joe the Pro videos are coming soon">
        <p>
          Short technical explainers — what the repair involves, why it matters,
          and how to say it — organised by make, model and year.
        </p>
        <p>
          The section is built and waiting. Videos appear here by vehicle as
          soon as they&apos;re published.
        </p>
      </ComingSoon>
    );
  }

  return (
    <Card className="mt-4 px-4">
      <ul className="divide-y divide-line">
        {makes.map((m) => (
          <li key={m.make}>
            <BucketRow
              href={`/joe-the-pro/${encodeURIComponent(m.make)}`}
              label={m.make}
              detail={`${m.models} ${m.models === 1 ? "model" : "models"} · ${m.videos} ${m.videos === 1 ? "video" : "videos"}`}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}
