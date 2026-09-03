import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { setFamilyEverywhere } from "@/lib/dms/mapping-actions";
import {
  GENESIS,
  describeEdit,
  firstAffectedMonth,
  monthLabel,
  storeToday,
} from "@/lib/mapping/epoch";
import { loadDealers } from "@/lib/mapping/dealer-codes";

/**
 * Correction or Change, for a sub-category across a whole dealer.
 *
 * ---------------------------------------------------------------------------
 * A SEPARATE ROUTE RATHER THAN A DIALOG
 * ---------------------------------------------------------------------------
 * The preview needs the database — how many measured periods a correction would
 * recompute — and this app renders on the server. A client dialog would mean
 * shipping every rooftop's period list to the browser to compute a number the
 * server already knows.
 *
 * ---------------------------------------------------------------------------
 * WHY THE NUMBERS HERE ARE REAL
 * ---------------------------------------------------------------------------
 * /admin/mapping/families deliberately refuses to print a period count, because
 * op_code_family routes cues and does not feed the attach view. sub_category_map
 * is the opposite: advisor_family_attach joins it at query time, and that is
 * where every attach rate on every screen comes from. So a correction really
 * does recompute every period at every rooftop of this dealer, and saying so
 * with a number is the honest thing rather than the misleading one.
 *
 * PERIODS ARE COUNTED ACROSS THE DEALER because the edit applies across the
 * dealer. A count for one rooftop under a button that writes eleven would be a
 * preview of something other than what happens.
 */
export default async function ConfirmDealerCodeEdit({
  searchParams,
}: {
  searchParams: Promise<{ dealer?: string; subCategory?: string; family?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isOwner } = await supabase.rpc("is_platform_owner");
  if (!isOwner) redirect("/admin");

  const { dealer: dealerId, subCategory, family } = await searchParams;
  if (!subCategory) redirect("/admin/mapping/dealer-codes");

  const service = createServiceClient();
  const dealers = await loadDealers(service);
  const dealer = dealers.find((d) => d.id === dealerId) ?? dealers[0];
  if (!dealer) redirect("/admin/mapping/dealer-codes");

  const back = `/admin/mapping/dealer-codes?dealer=${dealer.id}`;

  const [{ data: current }, { data: periods }] = await Promise.all([
    service
      .from("sub_category_map_live")
      .select("rooftop_id, family, status, effective_from")
      .eq("sub_category", subCategory)
      .in("rooftop_id", dealer.rooftopIds),
    service
      .from("perf_period")
      .select("starts_on")
      .in("rooftop_id", dealer.rooftopIds)
      .eq("source_kind", "dynatron")
      .order("starts_on"),
  ]);

  const rulings = (current ?? []) as {
    rooftop_id: string;
    family: string | null;
    status: string;
    effective_from: string;
  }[];

  const allPeriods = (periods ?? []) as { starts_on: string }[];
  const today = storeToday();
  const firstChange = firstAffectedMonth(today);
  /* ONLY THE PERIODS THAT ACTUALLY RECOMPUTE. A change starting next month does
     not touch the months before it, and saying "23 periods" under a button that
     moves four would be a preview nobody could trust twice. */
  const changeAffected = allPeriods.filter((p) => p.starts_on >= firstChange).length;

  const newFamily = (family ?? "").trim() || null;
  const currentFamilies = [...new Set(rulings.map((r) => r.family ?? ""))];
  const currentLabel =
    currentFamilies.length === 0
      ? "— not ruled —"
      : currentFamilies.length === 1
        ? currentFamilies[0] || "— unmapped —"
        : `differs by store (${currentFamilies.length} values)`;
  const unchanged = currentFamilies.length === 1 && (currentFamilies[0] || null) === newFamily;

  const since = rulings.map((r) => r.effective_from).sort()[0] ?? null;

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: back, label: "Dealer Codes" }}
        trail={[
          { href: "/admin", label: "Admin" },
          { href: "/admin/mapping", label: "Mapping" },
        ]}
        title={`Confirm “${subCategory}”`}
        subtitle="Two kinds of edit. They mean different things to history."
      />

      <Card className="mt-4 p-5">
        <p className="text-sm font-extrabold text-navy">{subCategory}</p>
        <p className="mt-0.5 text-xs text-ink-soft">
          {dealer.name} · {dealer.rooftopCount} rooftops
        </p>
        <p className="mt-2 text-sm text-ink">
          <span className="text-ink-soft">Family </span>
          {currentLabel} <span className="text-ink-soft">→</span>{" "}
          <strong className="text-navy">{newFamily ?? "— unmapped —"}</strong>
        </p>
        {since && (
          <p className="mt-1 text-xs text-ink-soft">
            The current mapping has been in force since {since}.
          </p>
        )}
        {unchanged && (
          <p className="mt-3 text-sm text-clay">
            Nothing is different from the current mapping.
          </p>
        )}
        {dealer.lockedAt && (
          <p className="mt-3 rounded-card border border-clay/40 bg-clay/10 p-3 text-sm leading-relaxed text-ink">
            <strong className="text-navy">This dealer&rsquo;s table is locked.</strong> The
            codes were ruled complete on {dealer.lockedAt.slice(0, 10)}. Editing now is not
            finishing onboarding — it changes a mapping that measured months have already
            run through, so choose deliberately.
          </p>
        )}
      </Card>

      <Card className="mt-4 border-dashed p-5">
        <p className="text-sm text-ink-soft">
          This mapping decides which service family an advisor&apos;s ROs land in, so it
          moves the{" "}
          <strong className="text-navy">attach rates they are measured on</strong> — and it
          is read at query time, not baked in, so a correction changes every screen the
          moment it saves.
        </p>
        <p className="mt-2 text-sm text-ink-soft">
          {allPeriods.length} measured {allPeriods.length === 1 ? "period" : "periods"}{" "}
          across this dealer&apos;s rooftops.
        </p>
      </Card>

      <div className="mt-4 space-y-2">
        <Card className="p-5">
          <p className="text-base font-extrabold text-navy">Correction</p>
          <p className="mt-1 text-sm text-ink-soft">
            This was always wrong — nobody ever meant the old value. Effective from the
            beginning ({GENESIS}); every earlier version is retired as though it never
            applied.
          </p>
          <p className="mt-2 text-sm text-ink">
            {describeEdit("correction", GENESIS, allPeriods.length)}
          </p>
          <form action={setFamilyEverywhere} className="mt-3">
            <input type="hidden" name="subCategory" value={subCategory} />
            <input type="hidden" name="family" value={newFamily ?? ""} />
            <button
              type="submit"
              disabled={!newFamily}
              className="rounded-xl bg-gold px-4 py-2 text-sm font-extrabold text-navy transition hover:brightness-95 disabled:opacity-40"
            >
              Save as a correction
            </button>
          </form>
        </Card>

        <Card className="p-5">
          <p className="text-base font-extrabold text-navy">Change</p>
          <p className="mt-1 text-sm text-ink-soft">
            The old value was right and something different is right now. History keeps the
            old mapping.
          </p>
          <p className="mt-2 text-sm text-ink">
            Takes effect with the <strong className="text-navy">{monthLabel(firstChange)}</strong>{" "}
            period — {changeAffected} {changeAffected === 1 ? "period" : "periods"} recompute,
            and everything earlier keeps the current mapping.
          </p>
          {/*
            NOT WIRED, AND SAYING SO IS BETTER THAN A BUTTON THAT LIES.
            setFamilyEverywhere applies as a correction by design — "whether a
            thing is coachable is a property of the work, not of the store", so
            a dealer-wide edit is a dealer-wide correction. A dated change is a
            per-rooftop decision and belongs on a per-rooftop screen; wiring
            this button to an action that ignores the date would be worse than
            not having it.
          */}
          <p className="mt-3 text-xs text-ink-soft">
            A dated change applies per rooftop. Use the rooftop view to date one.
          </p>
        </Card>

        <p className="px-1 pt-2 text-sm">
          <Link href={back} className="font-bold text-ocean underline underline-offset-2">
            Cancel — change nothing
          </Link>
        </p>
      </div>
    </main>
  );
}
