/* ============================================================================
   EDIAGD — Dealer Codes, as CSV

   The offline path. checkmap, remap and the export scripts all read CSV, and
   the file-based backup path is what somebody reaches for when a screen is
   down or a diff needs eyes. Both sections export in shapes those tools already
   understand: one header row, one row per key, quoted where it has to be.
   ============================================================================ */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { csv, loadDealers, loadOpCodes, loadSubCategories } from "@/lib/mapping/dealer-codes";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });

  const { data: isOwner } = await supabase.rpc("is_platform_owner");
  if (!isOwner) return new NextResponse("Platform owner only", { status: 403 });

  const url = new URL(request.url);
  const dealerId = url.searchParams.get("dealer");
  const section = url.searchParams.get("section") ?? "sub";

  const service = createServiceClient();
  const dealers = await loadDealers(service);
  const dealer = dealers.find((d) => d.id === dealerId) ?? dealers[0];
  if (!dealer) return new NextResponse("No such dealer", { status: 404 });

  const slug = dealer.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  let body: string;
  let filename: string;

  if (section === "ops") {
    const { rows } = await loadOpCodes(service, dealer, 100000);
    body = csv(
      ["DMS Op Code", "Description", "ROs", "Labor", "Stores", "Our Code", "Status", "Matched By"],
      rows.map((r) => [
        r.dmsOpCode,
        r.description,
        r.ros,
        r.labor,
        r.storeCount,
        r.canonical ?? r.suggestion?.code ?? "",
        r.status === "unruled" && r.suggestion ? "proposed" : r.status,
        r.matchedBy ?? (r.suggestion ? "auto" : ""),
      ])
    );
    filename = `${slug}-op-codes.csv`;
  } else {
    const rows = await loadSubCategories(service, dealer);
    /* Sub-category, Family, Status is the shape checkmap and the mapping
       exports already speak; the volume columns are additive and to the right,
       so a reader that only wants the first three still works. */
    body = csv(
      ["Sub-category", "Family", "Status", "ROs", "Labor", "Stores", "Proposed Code", "Effective From"],
      rows.map((r) => [
        r.subCategory,
        r.family ?? "",
        r.status,
        r.ros,
        r.labor,
        r.storeCount,
        r.proposal?.canonical ?? "",
        r.audit?.effectiveFrom ?? "",
      ])
    );
    filename = `${slug}-sub-categories.csv`;
  }

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
