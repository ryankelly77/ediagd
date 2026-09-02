import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

/**
 * The mapping hub.
 *
 * Phase 0's inventory found NINE mappings spread across three tables, four
 * TypeScript files, a spreadsheet in somebody's Downloads and a CSV outside the
 * repo. Three of them now have a screen. This page exists so the fourth — the
 * dealer DMS translation, which is the real build — has somewhere obvious to
 * land rather than arriving as a link nobody finds.
 *
 * Counts are read live rather than written in the copy: a hub that claims "73
 * op codes" in a string is a hub that will be wrong the first time somebody
 * retires one.
 */
export default async function MappingHub() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isOwner } = await supabase.rpc("is_platform_owner");
  if (!isOwner) redirect("/admin");

  const service = createServiceClient();
  const [codes, retired, families, aliases, unconfirmed] = await Promise.all([
    service.from("op_code_catalog").select("code", { count: "exact", head: true }),
    service
      .from("op_code_catalog")
      .select("code", { count: "exact", head: true })
      .not("retired_at", "is", null),
    service.from("op_code_family_live").select("code", { count: "exact", head: true }),
    service.from("mapping_alias").select("id", { count: "exact", head: true }),
    service
      .from("mapping_alias")
      .select("id", { count: "exact", head: true })
      .eq("confirmed", false),
  ]);

  const tools = [
    {
      href: "/admin/mapping/op-codes",
      label: "Op Codes",
      hint: `${(codes.count ?? 0) - (retired.count ?? 0)} live${
        retired.count ? `, ${retired.count} retired` : ""
      } — Mitch's service catalog. Retire, never delete.`,
    },
    {
      href: "/admin/mapping/families",
      label: "Families",
      hint: `${families.count ?? 0} codes mapped to a service family. Changing one moves revenue.`,
    },
    {
      href: "/admin/mapping/aliases",
      label: "Aliases",
      hint: `${aliases.count ?? 0} old names${
        unconfirmed.count ? `, ${unconfirmed.count} waiting on a ruling` : ""
      }. Proposed aliases are visible and inert.`,
    },
  ];

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/admin", label: "Admin" }}
        title="Mapping"
        subtitle="What Mitch coaches, what the DMS measures, and the bridges between them."
      />

      <div className="mt-4 space-y-2">
        {tools.map((t) => (
          <Link key={t.href} href={t.href} className="block">
            <Card className="p-5 transition hover:border-teal">
              <p className="text-base font-extrabold text-navy">{t.label}</p>
              <p className="mt-1 text-sm text-ink-soft">{t.hint}</p>
            </Card>
          </Link>
        ))}
      </div>

      {/*
        NAMED RATHER THAN OMITTED. The dealer translation is the one mapping
        with no table, no repo file and no code path — 208 DMS codes against 73
        catalog codes, with Mitch's 46-row spreadsheet as a partial seed that
        nothing reads. Leaving it off this page would make the set look
        complete, and the next person would have to rediscover the gap.
      */}
      <Card className="mt-2 border-dashed p-5">
        <p className="text-base font-extrabold text-navy">Dealer Codes</p>
        <p className="mt-1 text-sm text-ink-soft">
          Not built. The DMS emits 208 codes that share no namespace with the
          catalog&apos;s 73, and nothing translates between them yet — the pick
          reaches op-code grain through the family map instead.
        </p>
      </Card>
    </main>
  );
}
