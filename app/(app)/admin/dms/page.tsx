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

  const [
    { data: imports },
    { data: unmapped },
    { count: metricRows, error: metricErr },
    { data: rebuild },
  ] = await Promise.all([
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
      // One row, always — rebuild_status is built to have no empty case.
      service.from("rebuild_status").select("*").maybeSingle(),
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

      <RebuildStatus row={rebuild as RebuildRow | null} />

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

/* ---------------------------------------------------------------------------
   Was the last rebuild any good, and is one outstanding?
--------------------------------------------------------------------------- */

type RebuildRow = {
  run_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  scope: string | null;
  periods_attempted: number | null;
  periods_succeeded: number | null;
  failed: { rooftop?: string; month?: string; error?: string }[] | null;
  initiated_by: string | null;
  failed_count: number | null;
  unfinished: boolean | null;
  last_full_rebuild_at: string | null;
  mapping_changed_at: string | null;
  mapping_ahead_of_rebuild: boolean | null;
};

const stamp = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";

/**
 * READ-ONLY, AND IT NEVER SAYS "APPLIED" WITH CHUNKS OUTSTANDING.
 *
 * The rebuild is chunked per (rooftop, month) because one call over 220 periods
 * exceeds the statement timeout — so a half-rebuilt library is a real state.
 * Until 0079 nothing recorded that it had happened: the script exited 0 whether
 * it failed one period or two hundred, and perf_period.rules_as_of is constant
 * across every rebuild after the first, so it could not tell you either.
 *
 * Three things worth saying, in the order they matter:
 *   * a run that started and never reported — the failure mode with no other
 *     symptom at all
 *   * a run that finished with failures, naming which months
 *   * a mapping edited since the last FULL clean rebuild
 *
 * The third is the one to read carefully. op_text_rule is baked into
 * advisor_op_metric at rebuild time while sub_category_map is read live, so
 * between an edit and a rebuild the two halves of the mapping disagree with each
 * other. This banner does not fix that; it is the honest signal that it is
 * currently true.
 */
function RebuildStatus({ row }: { row: RebuildRow | null }) {
  if (!row || !row.run_id) {
    return (
      <Card className="mt-4 p-5">
        <p className="ediagd-eyebrow">Period rebuild</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          No rebuild has been recorded yet. Runs from{" "}
          <code>npm run rebuild:periods</code> and from a committed import are
          logged here from 0079 onward.
        </p>
      </Card>
    );
  }

  const failedCount = Number(row.failed_count ?? 0);
  const unfinished = Boolean(row.unfinished);
  const stale = Boolean(row.mapping_ahead_of_rebuild);
  const problem = unfinished || failedCount > 0 || stale;

  return (
    <Card className="mt-4 p-5">
      <p className="ediagd-eyebrow">Period rebuild</p>
      <p className="mt-1 text-sm text-ink">
        {unfinished ? (
          <strong className="text-navy">
            {`A rebuild started ${stamp(row.started_at)} and never reported.`}
          </strong>
        ) : (
          `${row.periods_succeeded ?? 0} of ${row.periods_attempted ?? 0} periods rebuilt · ${stamp(row.finished_at)}`
        )}
      </p>
      <p className="ediagd-numeral mt-0.5 text-[11px] text-ink-soft">
        {`scope ${row.scope ?? "—"} · started by ${row.initiated_by ?? "—"}`}
      </p>

      {failedCount > 0 && (
        <div className="mt-3">
          <p
            className="text-sm font-extrabold"
            style={{ color: "rgb(var(--ediagd-clay))" }}
          >
            {`${failedCount} period${failedCount === 1 ? "" : "s"} did not rebuild`}
          </p>
          <ul className="ediagd-numeral mt-1 space-y-0.5 text-[11px] text-ink-soft">
            {(row.failed ?? []).slice(0, 5).map((f, i) => (
              <li key={i}>
                {`${f.month ?? "?"} · ${String(f.rooftop ?? "?").slice(0, 8)} — ${String(f.error ?? "").slice(0, 90)}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {stale && (
        <p
          className="mt-3 text-sm leading-relaxed"
          style={{ color: "rgb(var(--ediagd-clay))" }}
        >
          {`A mapping was edited ${stamp(row.mapping_changed_at)}, after the last full clean rebuild (${stamp(row.last_full_rebuild_at)}). Sub-category corrections are already live on every screen; op-text rules are baked into the metrics and are not, until a rebuild runs. Run npm run rebuild:periods.`}
        </p>
      )}

      {!problem && (
        <p className="mt-2 text-sm text-ink-soft">
          Every period is on the current rule set.
        </p>
      )}
    </Card>
  );
}
