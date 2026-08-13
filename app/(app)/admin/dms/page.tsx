import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DmsUploader } from "@/components/admin/dms/DmsUploader";

/**
 * DMS Upload — the monthly op-code workbook.
 *
 * PLATFORM OWNER ONLY, and gated here as well as in the action. Rendering is
 * not a security boundary — the action is reachable by POST without this page
 * ever loading — so this redirect is for the person, and requireOwner() in
 * lib/dms/import-actions.ts is the one that actually holds.
 */
export default async function DmsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isOwner } = await supabase.rpc("is_platform_owner");
  if (!isOwner) redirect("/admin");

  const service = createServiceClient();

  const [{ data: imports }, { data: unmapped }, { count: metricRows, error: metricErr }] =
    await Promise.all([
      service
        .from("dms_import")
        .select("id, file_name, status, covers_from, covers_to, created_at, committed_at")
        .order("created_at", { ascending: false })
        .limit(8),
      service
        .from("dms_unmapped_sub_category")
        .select("sub_category, rows")
        .order("rows", { ascending: false })
        .limit(200),
      // NOT head:true. A HEAD request against a missing table comes back 404
      // with no body, so supabase-js has nothing to parse and leaves `error`
      // null — the screen then renders a confident "0 daily rows stored" for a
      // table that does not exist. limit(0) costs the same and returns a body.
      service.from("dms_daily_metric").select("rooftop_id", { count: "exact" }).limit(0),
    ]);

  const gaps = (unmapped ?? []) as { sub_category: string; rows: number }[];
  const unmappedRows = gaps.reduce((n, g) => n + Number(g.rows ?? 0), 0);
  const distinctUnmapped = new Set(gaps.map((g) => g.sub_category)).size;

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/admin", label: "Admin" }}
        title="DMS Upload"
        subtitle={`${Number(metricRows ?? 0).toLocaleString()} daily rows stored`}
      />

      {/*
        A missing table returns an error and a null count, which renders as a
        confident "0 daily rows stored" — the screen looks like it works and
        reports that nothing has ever been imported. Say what is actually
        wrong instead; the only way to see this is to have shipped the code
        without the migration.
      */}
      {metricErr && (
        <Card className="mt-4 p-5">
          <p
            className="text-sm font-extrabold"
            style={{ color: "rgb(var(--ediagd-clay))" }}
          >
            The DMS tables aren&apos;t on this database yet
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            Migration 0038 hasn&apos;t been applied here, so nothing can be
            uploaded. Run <code>supabase db push</code> against this
            environment first.
          </p>
          <p className="ediagd-numeral mt-2 text-[11px] text-ink-soft">
            {metricErr.message}
          </p>
        </Card>
      )}

      <DmsUploader />

      {distinctUnmapped > 0 && (
        <Card className="mt-4 p-5">
          <p className="ediagd-eyebrow">Needs a decision</p>
          {/*
            Built as template strings, not `{expr} text`. The JSX transform
            drops the boundary space between an expression and the text after
            it, which rendered as "35sub-categories" and "2,763imported rows".
            One text node cannot lose a space inside itself.
          */}
          <h2 className="mt-1 text-lg font-extrabold text-navy">
            {`${distinctUnmapped} sub-categories aren’t mapped`}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            {`${unmappedRows.toLocaleString()} imported rows sit outside every service family, so they don’t count toward anyone’s attach rate yet.`}
          </p>
          <Link
            href="/admin/dms/mapping"
            className="mt-4 inline-flex min-h-[2.75rem] items-center rounded-xl bg-gold px-5 text-sm font-extrabold text-navy transition hover:brightness-95"
          >
            Map them
          </Link>
        </Card>
      )}

      <h2 className="ediagd-eyebrow mt-8 px-1">Recent uploads</h2>
      <Card className="mt-2 px-4">
        {(imports ?? []).length === 0 ? (
          <p className="py-4 text-sm text-ink-soft">Nothing uploaded yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {((imports ?? []) as Record<string, unknown>[]).map((i) => (
              <li key={String(i.id)} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-navy">
                    {String(i.file_name)}
                  </span>
                  <span className="ediagd-numeral mt-0.5 block text-xs text-ink-soft">
                    {String(i.covers_from ?? "?")} → {String(i.covers_to ?? "?")}
                  </span>
                </span>
                <span
                  className="shrink-0 rounded-pill px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide"
                  style={
                    i.status === "committed"
                      ? {
                          background:
                            "color-mix(in srgb, rgb(var(--ediagd-palm)) 16%, transparent)",
                          color: "rgb(var(--ediagd-palm))",
                        }
                      : {
                          background:
                            "color-mix(in srgb, rgb(var(--ediagd-line)) 60%, transparent)",
                          color: "rgb(var(--ediagd-ink-soft))",
                        }
                  }
                >
                  {String(i.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
