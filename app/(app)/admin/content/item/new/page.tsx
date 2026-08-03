import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/guards";
import { listServiceNames } from "@/lib/content-server";
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
      <Link
        href="/admin/content"
        className="text-xs font-bold uppercase tracking-[0.18em] text-ocean hover:underline"
      >
        ‹ Coaching content
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold text-navy">New content</h1>

      <ContentEditor
        item={null}
        services={services}
        defaultService={service ?? null}
      />
    </main>
  );
}
