import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { updateOpCodeFamily } from "@/lib/mapping/admin-actions";

type FamilyRow = {
  code: string;
  family: string;
  coachable: boolean;
  confidence: string;
  note: string | null;
  effective_from: string;
};

/**
 * Screen 2 · catalog code → service family.
 *
 * The 73 editorial rulings from 0066, editable by the person who made them.
 *
 * ORDERED BY FAMILY, NOT BY CODE. The question this screen answers is "is
 * anything in the wrong bucket", and that is only visible when a family's codes
 * are side by side — Oil Change's code sitting in the Fluids category is
 * exactly the kind of thing a code-ordered list hides.
 *
 * `confidence` is shown because it is the honest record of how each ruling was
 * reached: `high` means the name settled it, `ruled` means somebody decided.
 * The ones worth Mitch's attention are the ones that were judgement calls.
 */
export default async function FamiliesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isOwner } = await supabase.rpc("is_platform_owner");
  if (!isOwner) redirect("/admin");

  const service = createServiceClient();
  const [{ data: rows }, { data: families }, { data: catalog }, { data: cueCounts }] =
    await Promise.all([
      service
        .from("op_code_family")
        .select("code, family, coachable, confidence, note, effective_from")
        .order("family"),
      service.from("service_family").select("name").order("sort_order"),
      service.from("op_code_catalog").select("code, name, retired_at"),
      service.from("service_family_cue_count").select("family, published_cues"),
    ]);

  const map = (rows ?? []) as FamilyRow[];
  const familyNames = ((families ?? []) as { name: string }[]).map((f) => f.name);
  const catalogBy = new Map(
    ((catalog ?? []) as { code: string; name: string; retired_at: string | null }[]).map(
      (c) => [c.code, c]
    )
  );
  const cuesBy = new Map(
    ((cueCounts ?? []) as { family: string; published_cues: number }[]).map((c) => [
      c.family,
      Number(c.published_cues ?? 0),
    ])
  );

  const byFamily = new Map<string, FamilyRow[]>();
  for (const r of map) {
    const list = byFamily.get(r.family) ?? [];
    list.push(r);
    byFamily.set(r.family, list);
  }

  const coachable = map.filter((r) => r.coachable).length;

  return (
    <>
      <AdminPageHeader
        back={{ href: "/admin/mapping", label: "Mapping" }}
        trail={[{ href: "/admin", label: "Admin" }]}
        title="Families"
        subtitle={`${map.length} codes across ${byFamily.size} families — ${coachable} coachable, ${map.length - coachable} mapped for reporting only.`}
      />

      <Card className="mb-4 border-dashed">
        <p className="text-sm text-ink-soft">
          Moving a code between families moves the revenue it carries.{" "}
          <strong className="text-navy">Not coachable</strong> means map it for
          reporting but never coach it — that is what the eleven menu bundles
          are, and MPI-061, which is the process that generates every other sale
          rather than a service sold against a benchmark.
        </p>
        <p className="mt-2 text-sm text-ink-soft">
          Every edit stamps <code>effective_from</code> with today. Nothing reads
          it yet: <code>rebuild_dms_periods</code> is all-or-nothing and
          recomputes history from the current rules, so an epoch cannot be
          honoured until it takes a date floor. The date is recorded now because
          it cannot be reconstructed later.
        </p>
      </Card>

      <div className="space-y-5">
        {[...byFamily].map(([family, list]) => {
          const cues = cuesBy.get(family) ?? 0;
          return (
            <div key={family}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-ocean">
                  {family}
                </p>
                <p className="text-xs text-ink-soft">
                  {cues === 0 ? "no published cues" : `${cues} published cues`}
                </p>
              </div>
              <div className="space-y-2">
                {list.map((r) => {
                  const cat = catalogBy.get(r.code);
                  return (
                    <Card key={r.code}>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="font-mono text-sm font-extrabold text-navy">
                          {r.code}
                          {cat?.retired_at && (
                            <span className="ml-2 rounded-pill bg-cream-card px-2 py-0.5 font-sans text-xs font-bold text-ink-soft">
                              Retired
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-ink-soft">
                          {r.confidence === "ruled"
                            ? "ruled by hand"
                            : `confidence: ${r.confidence}`}
                          {" · since "}
                          {r.effective_from}
                        </p>
                      </div>
                      <p className="mt-0.5 text-sm text-ink">{cat?.name ?? "—"}</p>
                      {r.note && (
                        <p className="mt-1 text-xs text-ink-soft">{r.note}</p>
                      )}

                      <form action={updateOpCodeFamily} className="mt-3 space-y-2">
                        <input type="hidden" name="code" value={r.code} />
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <select
                            name="family"
                            defaultValue={r.family}
                            aria-label={`Family for ${r.code}`}
                            className="w-full rounded-xl border border-line bg-surface-card px-3 py-2 text-sm text-ink sm:max-w-[16rem]"
                          >
                            {familyNames.map((f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                          </select>
                          <label className="flex items-center gap-2 text-sm text-ink">
                            <input
                              type="checkbox"
                              name="coachable"
                              value="1"
                              defaultChecked={r.coachable}
                              className="h-4 w-4 accent-teal"
                            />
                            Coachable
                          </label>
                        </div>
                        <input
                          name="note"
                          defaultValue={r.note ?? ""}
                          placeholder="Why this ruling?"
                          aria-label={`Note for ${r.code}`}
                          className="w-full rounded-xl border border-line bg-surface-card px-3 py-2 text-sm text-ink"
                        />
                        <button
                          type="submit"
                          className="rounded-xl bg-gold px-4 py-2 text-sm font-extrabold text-navy transition hover:brightness-95"
                        >
                          Save
                        </button>
                      </form>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
