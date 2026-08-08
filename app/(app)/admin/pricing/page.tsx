import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminsOnly } from "@/components/admin/content/AdminsOnly";
import { getAdminContext } from "@/lib/guards";

/**
 * The two cut-offs that decide the 2x2, and the floor under the dollar maths.
 *
 * They live on a screen rather than in a query because they are judgement
 * calls, not facts: nobody has used this product yet, so "engaged" and
 * "improving" are guesses that real behaviour will correct. A threshold you
 * cannot see is a threshold nobody argues with, and these deserve arguing with.
 */
export default async function ImpactSettingsPage() {
  const { supabase, userId, hasAdminAccess } = await getAdminContext();
  if (!userId) redirect("/login");
  if (!hasAdminAccess) return <AdminsOnly />;

  const { data } = await supabase
    .from("impact_settings")
    .select("engaged_score_min, improving_pts_min, min_ros_for_dollars, default_subscription_monthly")
    .maybeSingle();

  const engaged = Number(data?.engaged_score_min ?? 75);
  const improving = Number(data?.improving_pts_min ?? 0.5);
  const minRos = Number(data?.min_ros_for_dollars ?? 20);
  const defaultPrice = Number(data?.default_subscription_monthly ?? 600);

  /** RLS restricts this to admins; getAdminContext re-checks, since a Server
   *  Function is reachable by direct POST. */
  async function save(formData: FormData) {
    "use server";
    const ctx = await getAdminContext();
    if (!ctx.userId || !ctx.hasAdminAccess) throw new Error("Admins only.");

    const score = Number(formData.get("engaged_score_min"));
    const pts = Number(formData.get("improving_pts_min"));
    const ros = Number(formData.get("min_ros_for_dollars"));
    const price = Number(formData.get("default_subscription_monthly"));

    if (!Number.isFinite(score) || score < 0 || score > 100) {
      throw new Error("Engagement score must be between 0 and 100.");
    }
    if (!Number.isFinite(pts)) throw new Error("Improvement must be a number.");
    if (!Number.isFinite(ros) || ros < 0) {
      throw new Error("Minimum repair orders must be zero or more.");
    }
    if (!Number.isFinite(price) || price < 0) {
      throw new Error("The default subscription must be zero or more.");
    }

    const { error } = await ctx.supabase
      .from("impact_settings")
      .update({
        engaged_score_min: Math.round(score),
        improving_pts_min: pts,
        min_ros_for_dollars: Math.round(ros),
        default_subscription_monthly: price,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);

    if (error) throw new Error(error.message);

    revalidatePath("/admin/impact");
    revalidatePath("/admin/pricing");
  }

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/admin", label: "Admin" }}
        title="Pricing & Impact Thresholds"
        subtitle="These decide which box an advisor lands in on the engagement × improvement grid. They are guesses until real behaviour calibrates them — change them and the grid moves immediately."
      />

      <form action={save} className="mt-4 space-y-3">
        <Field
          name="engaged_score_min"
          label="Engaged at or above"
          hint="Engagement score, 0–100. The same score the engagement screen shows. 75 matches the target used everywhere else."
          defaultValue={engaged}
          step="1"
        />
        <Field
          name="improving_pts_min"
          label="Improving at or above"
          hint="Average monthly gain on coached services, in attach-rate percentage points. Set this too low and ordinary noise reads as improvement."
          defaultValue={improving}
          step="0.1"
        />
        <Field
          name="min_ros_for_dollars"
          label="Minimum repair orders for the dollar maths"
          hint="An advisor writing a handful of ROs in a month is too small a sample for incremental labor to mean anything."
          defaultValue={minRos}
          step="1"
        />

        <Field
          name="default_subscription_monthly"
          label="Default monthly subscription"
          hint="What a rooftop pays per month unless it has its own price set. Used for every return figure on the impact screen; a per-rooftop override lives on that rooftop's page."
          defaultValue={defaultPrice}
          step="1"
        />

        <button
          type="submit"
          className="min-h-[3rem] w-full rounded-xl bg-gold px-4 text-sm font-extrabold text-navy shadow-sm transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Save thresholds
        </button>
      </form>
    </main>
  );
}

function Field({
  name,
  label,
  hint,
  defaultValue,
  step,
}: {
  name: string;
  label: string;
  hint: string;
  defaultValue: number;
  step: string;
}) {
  return (
    <Card className="p-4">
      <label htmlFor={name} className="block text-sm font-extrabold text-navy">
        {label}
      </label>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">{hint}</p>
      <input
        id={name}
        name={name}
        type="number"
        step={step}
        defaultValue={defaultValue}
        className="ediagd-numeral mt-2.5 min-h-[3rem] w-full rounded-xl border border-line bg-surface-card px-4 text-navy outline-none focus:ring-2 focus:ring-gold"
      />
    </Card>
  );
}
