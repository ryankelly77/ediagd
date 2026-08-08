import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/brand/Card";
import { AdminsOnly } from "@/components/admin/content/AdminsOnly";
import { getAdminContext } from "@/lib/guards";
import { ADMIN_PREVIEWS, ADMIN_TOOLS, type AdminTool } from "@/lib/admin-tools";

/* ============================================================================
   EDIAGD — /admin, the hub

   THIS PAGE USED TO BE THE ENGAGEMENT SCREEN, and that was the whole problem.
   Because /admin both showed engagement AND carried the links to everything
   else, Impact & ROI could only be reached by going "into" engagement first —
   so it read as part of engagement rather than the other half of the same
   question. Engagement is whether people are using it; impact is whether that
   changed anything. Neither contains the other.

   Now /admin lists the screens and owns none of them. Engagement lives at
   /admin/engagement, a peer of /admin/impact, and every admin screen backs out
   to here.

   The list comes from lib/admin-tools.ts, which the More menu renders too, and
   which `npm run check:nav` validates against the routes on disk — so a new
   admin screen cannot ship without a way in.
   ============================================================================ */

export default async function AdminHubPage() {
  const { userId, hasAdminAccess } = await getAdminContext();
  if (!userId) redirect("/login");
  if (!hasAdminAccess) return <AdminsOnly />;

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <h1 className="text-2xl font-extrabold text-navy">Admin</h1>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">
        Everything that isn&apos;t the daily loop.
      </p>

      <h2 className="ediagd-eyebrow mt-6 px-1">Tools</h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {ADMIN_TOOLS.map((tool) => (
          <ToolCard key={tool.href} {...tool} />
        ))}
      </div>

      {/* App chrome over fabricated data. Kept under its own heading so a
          preview is never mistaken for a result. */}
      <h2 className="ediagd-eyebrow mt-8 px-1">Previews</h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {ADMIN_PREVIEWS.map((tool) => (
          <ToolCard key={tool.href} {...tool} />
        ))}
      </div>
    </main>
  );
}

function ToolCard({ href, label, hint }: AdminTool) {
  return (
    <Card>
      <Link
        href={href}
        className="flex h-full items-start gap-3 p-4 transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-base font-extrabold text-navy">{label}</span>
          <span className="mt-1 block text-xs leading-relaxed text-ink-soft">
            {hint}
          </span>
        </span>
        <span aria-hidden="true" className="text-lg leading-none text-ink-soft">
          ›
        </span>
      </Link>
    </Card>
  );
}
