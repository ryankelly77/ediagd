import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  clearNotCoachable,
  markNotCoachable,
  setFamilyEverywhere,
  setSubCategoryFamily,
} from "@/lib/dms/mapping-actions";
import { AMBIGUOUS, normaliseSubCategory } from "@/lib/dms/mapping";

/**
 * The sub-category mapping queue.
 *
 * ORDERED BY ROWS, BIGGEST FIRST, because that is the order that makes the
 * numbers correct fastest. 82 sub-categories arrived in the first file and the
 * top ten account for most of the unmapped volume — a queue sorted
 * alphabetically would have somebody mapping "Accessories" (31 rows) before
 * "Diagnosis" (334).
 *
 * Unmapped is shown FIRST and mapped is shown below it, rather than hiding what
 * is done: the auto-matched ones are guesses made by a rule file and somebody
 * should be able to disagree with them.
 */
export default async function MappingPage({
  searchParams,
}: {
  searchParams: Promise<{ rooftop?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isOwner } = await supabase.rpc("is_platform_owner");
  if (!isOwner) redirect("/admin");

  const { rooftop: rooftopFilter } = await searchParams;
  const service = createServiceClient();

  const [{ data: families }, { data: maps }, { data: volumes }, { data: rooftops }] =
    await Promise.all([
      service.from("service_family").select("name").order("sort_order"),
      service
        .from("sub_category_map")
        .select("rooftop_id, sub_category, family, status"),
      service
        .from("dms_daily_metric")
        .select("rooftop_id, sub_category")
        .limit(50000),
      service.from("rooftop").select("id, name").not("name", "like", "[DEMO]%"),
    ]);

  const familyNames = ((families ?? []) as { name: string }[]).map((f) => f.name);
  const rooftopName = new Map(
    ((rooftops ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name])
  );

  // Row volume per (rooftop, sub-category) — what makes the queue an order.
  const volume = new Map<string, number>();
  for (const v of (volumes ?? []) as { rooftop_id: string; sub_category: string }[]) {
    const k = `${v.rooftop_id}|${v.sub_category}`;
    volume.set(k, (volume.get(k) ?? 0) + 1);
  }

  type Row = {
    rooftopId: string;
    rooftopName: string;
    subCategory: string;
    family: string | null;
    status: string;
    rows: number;
  };

  const all: Row[] = ((maps ?? []) as Record<string, unknown>[])
    .map((m) => {
      const rid = String(m.rooftop_id);
      const sc = String(m.sub_category);
      return {
        rooftopId: rid,
        rooftopName: rooftopName.get(rid) ?? "—",
        subCategory: sc,
        family: (m.family as string | null) ?? null,
        status: String(m.status),
        rows: volume.get(`${rid}|${sc}`) ?? 0,
      };
    })
    .filter((r) => rooftopName.has(r.rooftopId))
    .filter((r) => !rooftopFilter || r.rooftopId === rooftopFilter);

  // THREE outcomes, not two. "Not coachable" is a decision, so those rows leave
  // the queue rather than sitting in it forever being re-read every month.
  const unmapped = all
    .filter((r) => !r.family && r.status !== "not_coachable")
    .sort((a, b) => b.rows - a.rows);
  const mapped = all.filter((r) => r.family).sort((a, b) => b.rows - a.rows);
  const notCoachable = all
    .filter((r) => r.status === "not_coachable")
    .sort((a, b) => b.rows - a.rows);
  const unmappedRows = unmapped.reduce((n, r) => n + r.rows, 0);
  const notCoachableRows = notCoachable.reduce((n, r) => n + r.rows, 0);

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/admin/dms", label: "DMS Upload" }}
        trail={[{ href: "/admin", label: "Admin" }]}
        title="Sub-Category Mapping"
        subtitle={`${unmapped.length} unmapped · ${unmappedRows.toLocaleString()} rows outside every family`}
      />

      {unmapped.length === 0 ? (
        <Card className="mt-4 p-6 text-center">
          <p className="text-base font-extrabold text-navy">Everything is mapped</p>
          <p className="mt-1 text-sm text-ink-soft">
            Every sub-category that has arrived sits in a service family.
          </p>
        </Card>
      ) : (
        <>
          <h2 className="ediagd-eyebrow mt-6 px-1">
            Unmapped — biggest gap first
          </h2>
          <div className="mt-2 space-y-2">
            {unmapped.slice(0, 60).map((r) => (
              <MapRow key={`${r.rooftopId}|${r.subCategory}`} row={r} families={familyNames} />
            ))}
          </div>
        </>
      )}

      {notCoachable.length > 0 && (
        <>
          <h2 className="ediagd-eyebrow mt-8 px-1">
            Not coachable — {notCoachableRows.toLocaleString()} rows, excluded
            from attach rates
          </h2>
          <p className="mt-1 px-1 text-xs leading-relaxed text-ink-soft">
            Stored, never counted. These are things an advisor cannot sell, so
            counting them would distort every attach rate and produce coaching
            nobody can act on.
          </p>
          <div className="mt-2 space-y-2">
            {notCoachable.slice(0, 40).map((r) => (
              <MapRow
                key={`${r.rooftopId}|${r.subCategory}`}
                row={r}
                families={familyNames}
              />
            ))}
          </div>
        </>
      )}

      {mapped.length > 0 && (
        <>
          <h2 className="ediagd-eyebrow mt-8 px-1">
            Mapped — {mapped.filter((m) => m.status === "confirmed").length} confirmed,{" "}
            {mapped.filter((m) => m.status === "auto").length} automatic
          </h2>
          <div className="mt-2 space-y-2">
            {mapped.slice(0, 60).map((r) => (
              <MapRow key={`${r.rooftopId}|${r.subCategory}`} row={r} families={familyNames} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function MapRow({
  row,
  families,
}: {
  row: {
    rooftopId: string;
    rooftopName: string;
    subCategory: string;
    family: string | null;
    status: string;
    rows: number;
  };
  families: string[];
}) {
  const why = AMBIGUOUS[normaliseSubCategory(row.subCategory)];

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold leading-snug text-navy">
            {row.subCategory}
          </p>
          <p className="ediagd-numeral mt-0.5 text-xs text-ink-soft">
            {row.rooftopName} · {row.rows.toLocaleString()} rows
          </p>
          {!row.family && why && (
            <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">{why}</p>
          )}
        </div>
        {row.status === "confirmed" && (
          <span
            className="shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide"
            style={{
              background: "color-mix(in srgb, rgb(var(--ediagd-palm)) 16%, transparent)",
              color: "rgb(var(--ediagd-palm))",
            }}
          >
            confirmed
          </span>
        )}
        {row.status === "auto" && (
          <span
            className="shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide"
            style={{
              background: "color-mix(in srgb, rgb(var(--ediagd-teal)) 16%, transparent)",
              color: "rgb(var(--ediagd-ocean))",
            }}
          >
            auto
          </span>
        )}
      </div>

      <form action={setSubCategoryFamily} className="mt-3 flex gap-2">
        <input type="hidden" name="rooftopId" value={row.rooftopId} />
        <input type="hidden" name="subCategory" value={row.subCategory} />
        <select
          name="family"
          defaultValue={row.family ?? ""}
          className="min-h-[2.75rem] min-w-0 flex-1 rounded-xl border border-line bg-surface-card px-3 text-sm text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <option value="">— leave unmapped —</option>
          {families.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="min-h-[2.75rem] shrink-0 rounded-xl bg-gold px-4 text-sm font-extrabold text-navy transition hover:brightness-95"
        >
          Save
        </button>
      </form>

      {/* THE THIRD ANSWER. Not "map it" and not "leave it" — "this is not a
          thing an advisor sells". Applied everywhere at once because whether
          work is coachable is a property of the work, not of the store. */}
      {row.status !== "not_coachable" ? (
        <form action={markNotCoachable} className="mt-2">
          <input type="hidden" name="subCategory" value={row.subCategory} />
          <button
            type="submit"
            className="text-xs font-bold underline-offset-2 hover:underline"
            style={{ color: "rgb(var(--ediagd-clay))" }}
          >
            Not a coachable service — exclude “{row.subCategory}” from attach
            rates everywhere
          </button>
        </form>
      ) : (
        <form action={clearNotCoachable} className="mt-2">
          <input type="hidden" name="subCategory" value={row.subCategory} />
          <button
            type="submit"
            className="text-xs font-bold text-ocean underline-offset-2 hover:underline"
          >
            Put “{row.subCategory}” back in the queue
          </button>
        </form>
      )}

      {/* Eleven stores arrived at once; mapping "LOF" eleven times is how a
          queue gets abandoned. Says exactly what it will touch. */}
      {row.family && (
        <form action={setFamilyEverywhere} className="mt-2">
          <input type="hidden" name="subCategory" value={row.subCategory} />
          <input type="hidden" name="family" value={row.family} />
          <button
            type="submit"
            className="text-xs font-bold text-ocean underline-offset-2 hover:underline"
          >
            Apply “{row.family}” to “{row.subCategory}” at every rooftop that
            hasn&apos;t confirmed one
          </button>
        </form>
      )}
    </Card>
  );
}
