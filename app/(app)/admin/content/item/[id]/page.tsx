import { notFound, redirect } from "next/navigation";
import { getAdminContext } from "@/lib/guards";
import { loadContentDetail } from "@/lib/content-detail";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminsOnly } from "@/components/admin/content/AdminsOnly";
import { ContentDetail } from "@/components/admin/content/ContentDetail";

/**
 * One artifact, on the content model.
 *
 * The back link goes to the COLLECTION rather than the service family: a video
 * has no service, and sending somebody back to "No service" after editing a
 * Mindset clip is the old taxonomy leaking through the navigation.
 */
export default async function ContentItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { supabase, userId, hasAdminAccess } = await getAdminContext();
  if (!userId) redirect("/login");
  if (!hasAdminAccess) return <AdminsOnly />;

  const { id } = await params;
  const detail = await loadContentDetail(supabase, id);
  if (!detail) notFound();

  const { row, voices, opCodes, versions, linked, mux, structure } = detail;
  const collection = row.collection as string | null;

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={
          collection
            ? { href: `/admin/content?collection=${encodeURIComponent(collection)}`, label: collection }
            : { href: "/admin/content", label: "Coaching Content" }
        }
        title={row.title as string}
      />
      <ContentDetail
        item={row}
        voices={voices}
        opCodes={opCodes}
        versions={versions}
        linked={linked}
        mux={mux}
        structure={structure}
      />
    </main>
  );
}
