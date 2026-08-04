import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/guards";
import { listServiceNames } from "@/lib/content-server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminsOnly } from "@/components/admin/content/AdminsOnly";
import { ContentEditor } from "@/components/admin/content/ContentEditor";

export default async function NewContentPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const { supabase, userId, isAdmin } = await getAdminContext();
  if (!userId) redirect("/login");
  if (!isAdmin) return <AdminsOnly />;

  const { service } = await searchParams;
  const services = await listServiceNames(supabase);

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={
          service
            ? {
                href: `/admin/content/service/${encodeURIComponent(service)}`,
                label: service,
              }
            : { href: "/admin/content", label: "All services" }
        }
        eyebrow="Coaching content"
        title="New content"
        subtitle={service ? `Adding to ${service}` : undefined}
      />

      <ContentEditor
        item={null}
        services={services}
        defaultService={service ?? null}
      />
    </main>
  );
}
