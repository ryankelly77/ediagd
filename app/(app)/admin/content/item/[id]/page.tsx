import { notFound, redirect } from "next/navigation";
import { getAdminContext } from "@/lib/guards";
import { listServiceNames } from "@/lib/content-server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminsOnly } from "@/components/admin/content/AdminsOnly";
import { ContentEditor } from "@/components/admin/content/ContentEditor";
import { serviceLabel, serviceToSlug, type ContentRow } from "@/lib/content";

export default async function EditContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { supabase, userId, hasAdminAccess } = await getAdminContext();
  if (!userId) redirect("/login");
  if (!hasAdminAccess) return <AdminsOnly />;

  const { id } = await params;

  const [{ data, error }, services] = await Promise.all([
    supabase.from("content").select("*").eq("id", id).maybeSingle(),
    listServiceNames(supabase),
  ]);

  if (error || !data) notFound();
  const item = data as ContentRow;

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{
          href: `/admin/content/service/${serviceToSlug(item.service_family)}`,
          label: serviceLabel(item.service_family),
        }}
        eyebrow="Coaching content"
        title={item.title}
        subtitle={item.source ? `Source: ${item.source}` : undefined}
      />

      <ContentEditor item={item} services={services} />
    </main>
  );
}
