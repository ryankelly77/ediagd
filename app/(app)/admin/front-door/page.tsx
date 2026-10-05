import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminsOnly } from "@/components/admin/content/AdminsOnly";
import { getAdminContext } from "@/lib/guards";

/* ============================================================================
   EDIAGD — admin: the front door

   What a signed-out visitor sees at the app's root: TWO films, each with its
   caption and its public Mux playback id. Read-only — the slots are curated in
   migrations (0157, then 0158) because a slot needs a PUBLIC playback id, and
   exactly two of those exist in the Mux account. Adding a third is a minting
   decision, not an edit on a screen. This is the one place an admin can see
   what is on the front door without signing out.

   WHY THE SERVICE CLIENT AND NOT THE VIEWER'S OWN
   0158 narrows `grant select on front_door_film` to anon — it is the signed-out
   page's view and nothing else reads it on a session. Left on the viewer's
   client this screen would have gone silently empty for every admin: a 200 with
   no rows and no error, which reads exactly like "the front door is empty".
   That is the gate-excludes-its-own-viewer failure this repo keeps paying for,
   so the role that reads it is named here instead of inherited.

   It still reads front_door_film — the same view the visitor reads, not the base
   table — so what an admin sees here is filtered by the same published and
   unretired conditions. Reading front_door_slot directly would show a row the
   visitor cannot see, and the screen's whole claim is that it shows theirs.
   ============================================================================ */

const SLOT_LABEL: Record<string, string> = {
  mindset: "The mindset",
  item: "The lesson",
};

function mins(sec: number | null): string {
  if (!sec || sec <= 0) return "—";
  return sec < 60 ? `${sec} sec` : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export default async function AdminFrontDoorPage() {
  const { userId, hasAdminAccess } = await getAdminContext();
  if (!userId) redirect("/login");
  if (!hasAdminAccess) return <AdminsOnly />;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("front_door_film")
    .select("slot, title, duration_sec, caption, public_playback_id")
    .order("sort", { ascending: true });
  const films = (data ?? []) as {
    slot: string;
    title: string;
    duration_sec: number | null;
    caption: string;
    public_playback_id: string;
  }[];

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/admin", label: "Admin" }}
        title="Front door"
        subtitle="The two films a signed-out visitor sees. Curated in the migration."
      />

      {films.length === 0 ? (
        <Card className="mt-3 p-6">
          <p className="text-sm leading-relaxed text-ink-soft">
            No front-door films are set. They are seeded by migration 0158 — if
            this is empty, it has not been applied here yet.
          </p>
        </Card>
      ) : (
        <ul className="mt-3 space-y-3">
          {films.map((f) => (
            <li key={f.slot}>
              <Card className="p-4">
                <div className="flex items-center gap-2">
                  <span className="ediagd-eyebrow">{SLOT_LABEL[f.slot] ?? f.slot}</span>
                  <span className="ediagd-numeral text-xs text-ink-soft">
                    {mins(f.duration_sec)}
                  </span>
                  <span
                    className="ml-auto rounded-pill px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wide"
                    style={{
                      background: "color-mix(in srgb, rgb(var(--ediagd-palm)) 16%, transparent)",
                      color: "rgb(var(--ediagd-palm))",
                    }}
                  >
                    Public
                  </span>
                </div>
                <p className="mt-1 text-base font-extrabold leading-snug text-navy">
                  {f.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  “{f.caption}”
                </p>
                {/* Read-only: a public playback id is minted by hand and set in a
                    migration. Showing it is so an admin can match what is on the
                    front door against the Mux account; it is not an input. */}
                <p className="ediagd-numeral mt-2 break-all text-xs text-ink-soft">
                  {f.public_playback_id}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
