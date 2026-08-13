"use server";

/* ============================================================================
   EDIAGD — uploading a DMS workbook
   SERVER ONLY. A "use server" module may only export async functions.

   TWO STEPS, AND THE FIRST ONE CHANGES NOTHING YOU CAN SEE.

     previewImport  parses the file, resolves what it can, writes everything to
                    the STAGING tables, and returns a summary. No fact table is
                    touched. No rooftop is created. Looking is free.
     commitImport   calls commit_dms_import(), which creates the rooftops the
                    file introduced, builds the advisor roster, replaces every
                    day the file covers, and retires any superseded monthly
                    period — all inside one transaction.

   WHY STAGE RATHER THAN HOLD IT IN MEMORY. 21,671 rows is a 1.2-second parse
   and several megabytes. Keeping that between two HTTP requests would mean
   either a server-side cache with a lifetime nobody manages, or re-uploading
   the file to commit it. Staging it in Postgres makes the preview durable, the
   commit cheap and atomic, and the whole thing survives the admin closing the
   tab and coming back.

   HOW THE LARGE FILE AVOIDS A TIMEOUT. The parse happens once, in the upload
   request. Rows go to staging in batches of 2,000 rather than one statement
   with 10,529 value tuples — PostgREST has to build and parse that statement,
   and one enormous insert is where this times out first. Commit is then a
   single RPC that never leaves the database, so the second step is fast
   regardless of file size.

   PLATFORM OWNER ONLY, CHECKED SERVER-SIDE. The commit writes across every
   rooftop in the group; the SQL function re-checks the same thing, so a direct
   POST to this action cannot get further than the database's own opinion.
   ============================================================================ */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { parseWorkbook } from "./parse";
import { autoMatch } from "./mapping";
import { projectMapping } from "./preview-mapping";

/** Batch size for staging inserts — see the note on timeouts above. */
const BATCH = 2000;

export type PreviewRooftop = {
  dealerName: string;
  rooftopId: string | null;
  action: "matched" | "will create";
  rows: number;
};

export type PreviewAdvisor = {
  opId: string;
  name: string;
  dealer: string;
  action: "matched" | "will create";
};

export type PreviewSubCategory = {
  name: string;
  rows: number;
  family: string | null;
  status: "auto" | "confirmed" | "unmapped" | "not_coachable";
  note: string | null;
};

type ExistingMapRow = {
  rooftop_id: string;
  sub_category: string;
  family: string | null;
  status: string;
};

export type ImportPreview = {
  importId: string;
  fileName: string;
  alreadyCommitted: { id: string; committedAt: string } | null;
  dates: string[];
  coversFrom: string;
  coversTo: string;
  rooftops: PreviewRooftop[];
  advisors: PreviewAdvisor[];
  subCategories: PreviewSubCategory[];
  counts: {
    sheetsRead: number;
    totalRows: number;
    rollupRows: number;
    detailRows: number;
    advisorTotalRows: number;
    replacingRows: number;
  };
  supersedes: { rooftop: string; label: string; from: string; to: string }[];
  warnings: string[];
  /** Projected post-commit state — matches what the result screen reports. */
  unmappedSubCategories: number;
  unmappedRows: number;
  notCoachableSubCategories: number;
  notCoachableRows: number;
};

async function requireOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data } = await supabase.rpc("is_platform_owner");
  if (!data) throw new Error("Platform owner only.");
  return user;
}

async function sha256(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Parse, stage, and report. Writes nothing outside the staging tables.
 */
export async function previewImport(formData: FormData): Promise<ImportPreview> {
  const user = await requireOwner();

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file uploaded.");

  const buffer = await file.arrayBuffer();
  const hash = await sha256(buffer);
  const parsed = await parseWorkbook(buffer);

  if (parsed.detail.length === 0) {
    throw new Error(
      "No detail rows found. Every row was a subtotal, or the tabs are not in the expected shape."
    );
  }

  const service = createServiceClient();

  // Has this exact file already gone in? Not a blocker — a re-run is a no-op by
  // design — but the admin should be told rather than left wondering.
  const { data: prior } = await service
    .from("dms_import")
    .select("id, committed_at")
    .eq("file_hash", hash)
    .eq("status", "committed")
    .order("committed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ---- resolve dealers against existing rooftops -------------------------
  const { data: rooftopRows } = await service
    .from("rooftop")
    .select("id, name");
  const byName = new Map(
    ((rooftopRows ?? []) as { id: string; name: string }[]).map((r) => [
      r.name.trim().toLowerCase(),
      r.id,
    ])
  );

  const rowsPerDealer = new Map<string, number>();
  for (const r of parsed.detail) {
    rowsPerDealer.set(r.dealerName, (rowsPerDealer.get(r.dealerName) ?? 0) + 1);
  }

  const rooftops: PreviewRooftop[] = parsed.dealers.map((d) => {
    const id = byName.get(d.trim().toLowerCase()) ?? null;
    return {
      dealerName: d,
      rooftopId: id,
      action: id ? "matched" : "will create",
      rows: rowsPerDealer.get(d) ?? 0,
    };
  });
  const rooftopIdFor = new Map(rooftops.map((r) => [r.dealerName, r.rooftopId]));

  // ---- resolve advisors against the roster -------------------------------
  const { data: rosterRows } = await service
    .from("dms_advisor")
    .select("rooftop_id, advisor_op_id");
  const roster = new Set(
    ((rosterRows ?? []) as { rooftop_id: string; advisor_op_id: string }[]).map(
      (r) => `${r.rooftop_id}|${r.advisor_op_id}`
    )
  );

  const advisors: PreviewAdvisor[] = parsed.advisors.map((a) => {
    const rid = rooftopIdFor.get(a.dealer) ?? null;
    const known = rid ? roster.has(`${rid}|${a.opId}`) : false;
    return { ...a, action: known ? "matched" : "will create" };
  });

  // ---- sub-category mapping ----------------------------------------------
  // Existing confirmed mappings win over the auto-matcher, always. That is the
  // point of confirming one: the next upload must not quietly revert it.
  const { data: existingMaps } = await service
    .from("sub_category_map")
    .select("rooftop_id, sub_category, family, status");

  // Projected at the SAME grain the database uses — (rooftop, sub-category) —
  // and by the same function the commit result reads back, so the preview and
  // the result cannot report different figures for the same file.
  const pairRows = new Map<string, number>();
  for (const r of parsed.detail) {
    const key = `${rooftopIdFor.get(r.dealerName) ?? ""}|${r.subCategory}`;
    pairRows.set(key, (pairRows.get(key) ?? 0) + 1);
  }
  const pairs = [...pairRows.entries()].map(([key, rows]) => {
    const [rid, ...rest] = key.split("|");
    return {
      rooftopId: rid || null,
      subCategory: rest.join("|"),
      rows,
    };
  });

  const projection = projectMapping(
    pairs,
    ((existingMaps ?? []) as ExistingMapRow[]).map((m) => ({
      rooftop_id: m.rooftop_id,
      sub_category: m.sub_category,
      family: m.family,
      status: m.status,
    }))
  );

  const subCategories: PreviewSubCategory[] = projection.rows;

  // ---- how much existing data this replaces -------------------------------
  let replacingRows = 0;
  const knownIds = rooftops.map((r) => r.rooftopId).filter(Boolean) as string[];
  if (knownIds.length) {
    const { count } = await service
      .from("dms_daily_metric")
      .select("rooftop_id", { count: "exact", head: true })
      .in("rooftop_id", knownIds)
      .in("report_date", parsed.dates);
    replacingRows = Number(count ?? 0);
  }

  // ---- which monthly periods this would retire ----------------------------
  const supersedes: ImportPreview["supersedes"] = [];
  if (knownIds.length) {
    const { data: periods } = await service
      .from("perf_period")
      .select("id, rooftop_id, starts_on, ends_on, label, rooftop:rooftop_id(name)")
      .in("rooftop_id", knownIds)
      .is("superseded_at", null);
    for (const p of (periods ?? []) as Record<string, unknown>[]) {
      const from = String(p.starts_on);
      const to = String(p.ends_on);
      const covered = parsed.dates.filter((d) => d >= from && d <= to).length;
      if (covered > 0) {
        supersedes.push({
          rooftop: ((p.rooftop as { name?: string } | null)?.name) ?? "?",
          label: String(p.label ?? ""),
          from,
          to,
        });
      }
    }
  }

  // ---- stage --------------------------------------------------------------
  const { data: imp, error: impErr } = await service
    .from("dms_import")
    .insert({
      uploaded_by: user.id,
      file_name: file.name,
      file_hash: hash,
      status: "preview",
      covers_from: parsed.dates[0],
      covers_to: parsed.dates[parsed.dates.length - 1],
      stats: {
        counts: parsed.counts,
        dealers: rooftops,
        advisors: advisors.length,
        warnings: parsed.warnings,
      },
    })
    .select("id")
    .single();

  if (impErr || !imp) throw new Error(impErr?.message ?? "Could not open an import.");
  const importId = imp.id as string;

  try {
    for (let i = 0; i < parsed.detail.length; i += BATCH) {
      const chunk = parsed.detail.slice(i, i + BATCH).map((r) => ({
        import_id: importId,
        report_date: r.reportDate,
        dealer_name: r.dealerName,
        rooftop_id: rooftopIdFor.get(r.dealerName) ?? null,
        advisor_raw: r.advisorRaw,
        advisor_op_id: r.advisorOpId,
        sub_category: r.subCategory,
        op_code: r.opCode,
        op_description: r.opDescription,
        cp_ros: r.cpRos,
        pct_of_total: r.pctOfTotal,
        frhs: r.frhs,
        frhs_per_ro: r.frhsPerRo,
        labor_sales: r.laborSales,
        labor_per_ro: r.laborPerRo,
        labor_gp_pct: r.laborGpPct,
        tot_per_ro: r.totPerRo,
        elr: r.elr,
        num_ros: r.numRos,
        labor_gp: r.laborGp,
        parts_gp: r.partsGp,
        gp: r.gp,
        gp_pct: r.gpPct,
      }));
      const { error } = await service.from("dms_import_row").insert(chunk);
      if (error) throw new Error(error.message);
    }

    for (let i = 0; i < parsed.advisorTotals.length; i += BATCH) {
      const chunk = parsed.advisorTotals.slice(i, i + BATCH).map((r) => ({
        import_id: importId,
        report_date: r.reportDate,
        dealer_name: r.dealerName,
        rooftop_id: rooftopIdFor.get(r.dealerName) ?? null,
        advisor_raw: r.advisorRaw,
        advisor_op_id: r.advisorOpId,
        unique_ros: r.uniqueRos,
        frhs: r.frhs,
        labor_sales: r.laborSales,
        labor_per_ro: r.laborPerRo,
        elr: r.elr,
        gp: r.gp,
        gp_pct: r.gpPct,
      }));
      const { error } = await service.from("dms_import_advisor_total").insert(chunk);
      if (error) throw new Error(error.message);
    }
  } catch (e) {
    // Compensate: an import whose staging is incomplete must not be sitting
    // there looking committable.
    await service.from("dms_import").delete().eq("id", importId);
    throw e;
  }

  revalidatePath("/admin/dms");

  return {
    importId,
    fileName: file.name,
    alreadyCommitted: prior
      ? { id: prior.id as string, committedAt: String(prior.committed_at) }
      : null,
    dates: parsed.dates,
    coversFrom: parsed.dates[0]!,
    coversTo: parsed.dates[parsed.dates.length - 1]!,
    rooftops,
    advisors,
    subCategories,
    counts: { ...parsed.counts, replacingRows },
    supersedes,
    warnings: parsed.warnings,
    unmappedSubCategories: projection.unmappedSubCategories,
    unmappedRows: projection.unmappedRows,
    notCoachableSubCategories: projection.notCoachableSubCategories,
    notCoachableRows: projection.notCoachableRows,
  };
}

export type CommitResult = {
  ok: true;
  importId: string;
  rooftopsCreated: number;
  advisorsUpserted: number;
  metricRowsDeleted: number;
  metricRowsInserted: number;
  advisorTotalsDeleted: number;
  advisorTotalsInserted: number;
  monthlyPeriodsSuperseded: number;
  subCategoriesSeeded: number;
  /** Months re-derived into perf_period so the screens can see the data. */
  periodsRebuilt: number;
  /** Read back from the database — the same measure the preview projects. */
  unmappedSubCategories: number;
  unmappedRows: number;
};

/**
 * Promote a staged import. One RPC, one transaction.
 */
export async function commitImport(importId: string): Promise<CommitResult> {
  await requireOwner();
  const service = createServiceClient();

  const { data, error } = await service.rpc("commit_dms_import", {
    _import_id: importId,
  });
  if (error) throw new Error(error.message);

  const r = (data ?? {}) as Record<string, number>;

  // Seed mappings for anything new, now that every rooftop certainly exists.
  // Auto verdicts only — an existing row is never overwritten, so a confirmed
  // mapping survives every future upload.
  const subCategoriesSeeded = await seedSubCategoryMaps(importId);

  // ---- and now make it visible ------------------------------------------
  // Without this the rows land in dms_daily_metric and every performance
  // screen carries on showing the previous month, because they all read
  // perf_period.
  //
  // The SCOPE IS DERIVED IN SQL, not read back through the API. Reading
  // dms_import_row here to collect rooftop ids hit PostgREST's 1,000-row cap
  // on an 8,464-row import and rebuilt only the two rooftops that happened to
  // appear in the first thousand staged rows — nine stores silently got no
  // April or May period at all, and the import still reported success.
  const { data: built, error: buildErr } = await service.rpc(
    "rebuild_dms_periods_for_import",
    { _import_id: importId }
  );
  if (buildErr) throw new Error(`Rebuild failed: ${buildErr.message}`);
  const periodsRebuilt = Number(
    (built as Record<string, number> | null)?.scopes_rebuilt ?? 0
  );

  // The unmapped figure the RESULT reports is read back from the database, so
  // it is the same measurement the preview projected rather than a second,
  // differently-computed number. See projectMapping() in ./preview-mapping.
  const { data: unmappedRows } = await service
    .from("dms_unmapped_sub_category")
    .select("sub_category, rows");
  const gaps = (unmappedRows ?? []) as { sub_category: string; rows: number }[];

  revalidatePath("/admin/dms");
  revalidatePath("/admin/dms/mapping");

  return {
    ok: true,
    importId,
    rooftopsCreated: Number(r.rooftops_created ?? 0),
    advisorsUpserted: Number(r.advisors_upserted ?? 0),
    metricRowsDeleted: Number(r.metric_rows_deleted ?? 0),
    metricRowsInserted: Number(r.metric_rows_inserted ?? 0),
    advisorTotalsDeleted: Number(r.advisor_totals_deleted ?? 0),
    advisorTotalsInserted: Number(r.advisor_totals_inserted ?? 0),
    monthlyPeriodsSuperseded: Number(r.monthly_periods_superseded ?? 0),
    subCategoriesSeeded,
    periodsRebuilt,
    unmappedSubCategories: new Set(gaps.map((g) => g.sub_category)).size,
    unmappedRows: gaps.reduce((n, g) => n + Number(g.rows ?? 0), 0),
  };
}

/**
 * Apply the auto-matcher to the rows commit_dms_import just created.
 *
 * The rules go DOWN to Postgres as data rather than being applied row by row
 * from here: 82 sub-categories across 11 rooftops is ~900 rows, and 900 round
 * trips is how a commit that should take a second takes a minute.
 */
async function seedSubCategoryMaps(importId: string): Promise<number> {
  const service = createServiceClient();

  // DISTINCT in SQL, not by reading every staged row. Reading them meant
  // 8,464 rows through a 1,000-row cap, so the rule set was built from about
  // two dealers' worth of the file and the rest silently never matched.
  const { data: subs, error: subsErr } = await service.rpc(
    "import_sub_categories",
    { _import_id: importId }
  );
  if (subsErr) throw new Error(`Could not read sub-categories: ${subsErr.message}`);

  const rules = ((subs ?? []) as { sub_category: string }[]).map((r) => ({
    sub_category: r.sub_category,
    family: autoMatch(r.sub_category).family,
  }));

  const { data, error } = await service.rpc("apply_sub_category_automap", {
    _import_id: importId,
    _rules: rules,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/** Throw away a staged import that was never committed. */
export async function discardImport(importId: string): Promise<void> {
  await requireOwner();
  const service = createServiceClient();
  await service
    .from("dms_import")
    .update({ status: "discarded" })
    .eq("id", importId)
    .eq("status", "preview");
  // Staging rows cascade on delete; keep the audit row, drop the bulk.
  await service.from("dms_import_row").delete().eq("import_id", importId);
  await service.from("dms_import_advisor_total").delete().eq("import_id", importId);
  revalidatePath("/admin/dms");
}
