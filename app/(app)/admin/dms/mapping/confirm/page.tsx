import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { setSubCategoryFamily } from "@/lib/dms/mapping-actions";
import {
  GENESIS,
  describeEdit,
  firstAffectedMonth,
  monthLabel,
  storeToday,
} from "@/lib/mapping/epoch";

/**
 * Re-mapping a sub-category that already has a family: Correction or Change.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SCREEN EXISTS HERE AND NOT ON EVERY ROW OF THE QUEUE
 * ---------------------------------------------------------------------------
 * Mapping an UNMAPPED row is the first thing anybody has ever said about it.
 * There is no prior value for history to keep, so there is nothing to choose
 * between and the queue posts a correction straight through — 60 rows worked
 * down one at a time do not each deserve a confirm screen.
 *
 * Changing a family that is already set is different. That mapping has been
 * feeding advisor_family_attach for every period it covers, so the edit either
 * rewrites numbers advisors were measured on or it does not, and only Mitch
 * knows which. This is where he says.
 *
 * ---------------------------------------------------------------------------
 * AND WHY THE NUMBERS HERE ARE REAL, UNLIKE THE FAMILIES CONFIRM
 * ---------------------------------------------------------------------------
 * /admin/mapping/families deliberately refuses to print a period count, because
 * op_code_family routes cues and does not feed the attach view. sub_category_map
 * is the opposite — it is joined at query time by advisor_family_attach, which
 * is where every attach rate on every screen comes from. So a correction here
 * really does recompute every period at this rooftop, and saying so with a
 * number is the honest thing rather than the misleading one.
 */
export default async function ConfirmSubCategoryEdit({
  searchParams,
}: {
  searchParams: Promise<{
    rooftopId?: string;
    subCategory?: string;
    family?: string;
  }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isOwner } = await supabase.rpc("is_platform_owner");
  if (!isOwner) redirect("/admin");

  const { rooftopId, subCategory, family } = await searchParams;
  if (!rooftopId || !subCategory) redirect("/admin/dms/mapping");

  const service = createServiceClient();
  const [{ data: current }, { data: periods }, { data: rooftop }] = await Promise.all([
    service
      .from("sub_category_map_live")
      .select("family, status, effective_from")
      .eq("rooftop_id", rooftopId)
      .eq("sub_category", subCategory)
      .maybeSingle(),
    service
      .from("perf_period")
      .select("starts_on")
      .eq("rooftop_id", rooftopId)
      .eq("source_kind", "dynatron")
      .order("starts_on"),
    service.from("rooftop").select("name").eq("id", rooftopId).maybeSingle(),
  ]);

  if (!current) redirect("/admin/dms/mapping");

  const allPeriods = (periods ?? []) as { starts_on: string }[];
  const today = storeToday();
  const firstChange = firstAffectedMonth(today);
  const changeAffected = allPeriods.filter((p) => p.starts_on >= firstChange).length;

  const newFamily = (family ?? "").trim() || null;
  const unchanged = (current.family ?? null) === newFamily;

  const hidden = (mode: string) => (
    <>
      <input type="hidden" name="rooftopId" value={rooftopId} />
      <input type="hidden" name="subCategory" value={subCategory} />
      <input type="hidden" name="family" value={newFamily ?? ""} />
      <input type="hidden" name="mode" value={mode} />
    </>
  );

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/admin/dms/mapping", label: "Sub-Category Mapping" }}
        trail={[
          { href: "/admin", label: "Admin" },
          { href: "/admin/dms", label: "DMS Upload" },
        ]}
        title={`Confirm “${subCategory}”`}
        subtitle="Two kinds of edit. They mean different things to history."
      />

      <Card className="mt-4 p-5">
        <p className="text-sm font-extrabold text-navy">{subCategory}</p>
        <p className="ediagd-numeral mt-0.5 text-xs text-ink-soft">
          {rooftop?.name ?? "This rooftop"}
        </p>
        <p className="mt-2 text-sm text-ink">
          <span className="text-ink-soft">Family </span>
          {current.family ?? "— unmapped —"} <span className="text-ink-soft">→</span>{" "}
          <strong className="text-navy">{newFamily ?? "— unmapped —"}</strong>
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          The current mapping has been in force since {current.effective_from}.
        </p>
        {unchanged && (
          <p className="mt-3 text-sm text-clay">
            Nothing is different from the current mapping.
          </p>
        )}
      </Card>

      <Card className="mt-4 border-dashed p-5">
        <p className="text-sm text-ink-soft">
          This mapping decides which service family an advisor&apos;s ROs land
          in, so it moves the{" "}
          <strong className="text-navy">attach rates they are measured on</strong>{" "}
          — and it is read at query time, not baked in, so a correction changes
          every screen the moment it saves.
        </p>
        <p className="mt-2 text-sm text-ink-soft">
          {allPeriods.length} measured{" "}
          {allPeriods.length === 1 ? "period" : "periods"} exist at this rooftop.
        </p>
      </Card>

      <div className="mt-4 space-y-2">
        <Card className="p-5">
          <p className="text-base font-extrabold text-navy">Correction</p>
          <p className="mt-1 text-sm text-ink-soft">
            This was always wrong — nobody ever meant the old value. Effective
            from the beginning ({GENESIS}); every earlier version is retired as
            though it never applied.
          </p>
          <p className="mt-2 text-sm text-ink">
            {describeEdit("correction", GENESIS, allPeriods.length)}
          </p>
          <form action={setSubCategoryFamily} className="mt-3">
            {hidden("correction")}
            <button
              type="submit"
              className="rounded-xl bg-gold px-4 py-2 text-sm font-extrabold text-navy transition hover:brightness-95"
            >
              Save as a correction
            </button>
          </form>
        </Card>

        <Card className="p-5">
          <p className="text-base font-extrabold text-navy">Change</p>
          <p className="mt-1 text-sm text-ink-soft">
            The old value was right and something different is right now.
            History keeps the old mapping.
          </p>
          <p className="mt-2 text-sm text-ink">
            Takes effect with the{" "}
            <strong className="text-navy">{monthLabel(firstChange)}</strong>{" "}
            period — {changeAffected} of {allPeriods.length}. Earlier months keep
            the current mapping.
          </p>
          <form action={setSubCategoryFamily} className="mt-3 space-y-2">
            {hidden("change")}
            <label className="block text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
              Effective from
            </label>
            <input
              type="date"
              name="effective_from"
              defaultValue={today}
              min={current.effective_from as string}
              className="w-full rounded-xl border border-line bg-surface-card px-3 py-2 text-sm text-ink sm:max-w-[14rem]"
            />
            <p className="text-xs text-ink-soft">
              A period is measured under the rules in force on its first day, so
              a date mid-month takes effect the following month. Never split. A
              date before {current.effective_from} is refused — an edit that
              reaches back before the value it replaces is a correction.
            </p>
            <button
              type="submit"
              className="rounded-xl bg-gold px-4 py-2 text-sm font-extrabold text-navy transition hover:brightness-95"
            >
              Save as a change
            </button>
          </form>
        </Card>
      </div>

      <p className="mt-4 text-sm">
        <Link href="/admin/dms/mapping" className="text-ocean hover:underline">
          Cancel
        </Link>
      </p>
    </main>
  );
}
