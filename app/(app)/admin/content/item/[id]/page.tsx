import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminContext } from "@/lib/guards";
import { listServiceNames } from "@/lib/content-server";
import { AdminsOnly } from "@/components/admin/content/AdminsOnly";
import { ContentEditor } from "@/components/admin/content/ContentEditor";
import { serviceLabel, serviceToSlug, type ContentRow } from "@/lib/content";

export default async function EditContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { supabase, userId, isAdmin } = await getAdminContext();
  if (!userId) redirect("/login");
  if (!isAdmin) return <AdminsOnly />;

  const { id } = await params;

  const [{ data, error }, services] = await Promise.all([
    supabase.from("content").select("*").eq("id", id).maybeSingle(),
    listServiceNames(supabase),
  ]);

  if (error || !data) notFound();
  const item = data as ContentRow;

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <Link
        href={`/admin/content/service/${serviceToSlug(item.service_family)}`}
        className="text-xs font-bold uppercase tracking-[0.18em] text-ocean hover:underline"
      >
        ‹ {serviceLabel(item.service_family)}
      </Link>
      <h1 className="mt-2 truncate text-2xl font-extrabold text-navy">
        {item.title}
      </h1>
      {item.source && (
        <p className="mt-0.5 text-xs text-ink-soft">Source: {item.source}</p>
      )}

      <ContentEditor item={item} services={services} />
    </main>
  );
}
