import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminsOnly } from "@/components/admin/content/AdminsOnly";
import { getAdminContext } from "@/lib/guards";

/* ============================================================================
   EDIAGD — admin: the front door

   What a signed-out visitor sees at the app's root: four films, all Mitch, each
   with its caption. Read-only — the four slots are curated in the migration
   (0157) because each film also needs a PUBLIC Mux playback id minted by hand,
   and a shop window is a deliberate choice, not a feed. This screen is the one
   place an admin can see what is on it without signing out.

   It reads front_door_film, the same view the front door reads — so what an admin
   sees here is exactly what a visitor sees out there.
   ============================================================================ */

const SLOT_LABEL: Record<string, string> = {
  intro: "Intro",
  mindset: "Mindset",
  pitch: "The pitch",
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

  const supabase = await createClient();
  const { data } = await supabase
    .from("front_door_film")
    .select("slot, title, duration_sec, caption, public_playback_id")
    .order("sort", { ascending: true });
  const films = (data ?? []) as {
    slot: string;
    title: string;
    duration_sec: number | null;
    caption: string;
    public_playback_id: string | null;
  }[];

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/admin", label: "Admin" }}
        title="Front door"
        subtitle="The four films a signed-out visitor sees. Curated in the migration."
      />

      {films.length === 0 ? (
        <Card className="mt-3 p-6">
          <p className="text-sm leading-relaxed text-ink-soft">
            No front-door films are set. They are seeded by migration 0157 — if
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
                  {f.public_playback_id ? (
                    <span
                      className="ml-auto rounded-pill px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wide"
                      style={{
                        background: "color-mix(in srgb, rgb(var(--ediagd-palm)) 16%, transparent)",
                        color: "rgb(var(--ediagd-palm))",
                      }}
                    >
                      Public
                    </span>
                  ) : (
                    <span className="ml-auto text-xs font-bold text-clay">No public ID</span>
                  )}
                </div>
                <p className="mt-1 text-base font-extrabold leading-snug text-navy">
                  {f.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  “{f.caption}”
                </p>
                {f.public_playback_id && (
                  <p className="ediagd-numeral mt-2 break-all text-xs text-ink-soft">
                    {f.public_playback_id}
                  </p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
