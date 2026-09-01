import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { setOpCodeRetired, updateOpCode } from "@/lib/mapping/admin-actions";

type CatalogRow = {
  code: string;
  sort_order: number;
  category: string;
  name: string;
  piggyback_partners: string | null;
  notes: string | null;
  retired_at: string | null;
};

/**
 * Screen 1 · the op-code catalog.
 *
 * THE CODE IS NOT A FORM FIELD. `code` is what content is filed under and what
 * every one of Mitch's sheets prints; renaming it is a data migration, not an
 * edit. Name and category are labels and are editable. That asymmetry is the
 * whole design of this screen.
 *
 * Grouped by category and ordered by the catalog's own sort_order, because that
 * is the order Mitch's sheet is in and this screen is the thing he will check
 * against it.
 */
export default async function OpCodesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isOwner } = await supabase.rpc("is_platform_owner");
  if (!isOwner) redirect("/admin");

  const service = createServiceClient();
  const [{ data: rows }, { data: tagged }] = await Promise.all([
    service
      .from("op_code_catalog")
      .select("code, sort_order, category, name, piggyback_partners, notes, retired_at")
      .order("sort_order"),
    /* What each code is actually carrying. Retiring a code that 40 cues are
       filed under is a different decision from retiring one nothing uses, and
       an admin cannot make it without the number. */
    service.from("content").select("op_code").not("op_code", "is", null).limit(5000),
  ]);

  const catalog = (rows ?? []) as CatalogRow[];
  const useCount = new Map<string, number>();
  ((tagged ?? []) as { op_code: string }[]).forEach((r) =>
    useCount.set(r.op_code, (useCount.get(r.op_code) ?? 0) + 1)
  );

  const byCategory = new Map<string, CatalogRow[]>();
  for (const r of catalog) {
    const list = byCategory.get(r.category) ?? [];
    list.push(r);
    byCategory.set(r.category, list);
  }

  const live = catalog.filter((r) => !r.retired_at).length;

  return (
    <>
      <AdminPageHeader
        back={{ href: "/admin/mapping", label: "Mapping" }}
        trail={[{ href: "/admin", label: "Admin" }]}
        title="Op Codes"
        subtitle={`${live} live of ${catalog.length}, across ${byCategory.size} categories. Seeded from data/op_code_seed.csv.`}
      />

      <Card className="mb-4 border-dashed">
        <p className="text-sm text-ink-soft">
          A code can be <strong className="text-navy">retired</strong> but never
          deleted. Content filed under a retired code stays filed under it —
          deleting would untag that work silently. The code itself is not
          editable: it is the key content is stored against, and every sheet
          Mitch holds prints it.
        </p>
      </Card>

      <div className="space-y-5">
        {[...byCategory].map(([category, list]) => (
          <div key={category}>
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-ocean">
              {category}
            </p>
            <div className="space-y-2">
              {list.map((r) => {
                const uses = useCount.get(r.code) ?? 0;
                return (
                  <Card
                    key={r.code}
                    className={r.retired_at ? "opacity-60" : undefined}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-extrabold text-navy">
                          {r.code}
                          {r.retired_at && (
                            <span className="ml-2 rounded-pill bg-cream-card px-2 py-0.5 font-sans text-xs font-bold text-ink-soft">
                              Retired
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-sm text-ink">{r.name}</p>
                        {r.piggyback_partners && (
                          <p className="mt-1 text-xs text-ink-soft">
                            Pairs with {r.piggyback_partners}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-ink-soft">
                          {uses === 0
                            ? "Nothing filed under it yet"
                            : `${uses} content item${uses === 1 ? "" : "s"} filed under it`}
                        </p>
                      </div>

                      <form action={setOpCodeRetired} className="shrink-0">
                        <input type="hidden" name="code" value={r.code} />
                        <input
                          type="hidden"
                          name="retire"
                          value={r.retired_at ? "0" : "1"}
                        />
                        <button
                          type="submit"
                          className="rounded-xl border border-line px-3 py-2 text-xs font-bold text-ink transition hover:bg-cream-card"
                        >
                          {r.retired_at ? "Bring back" : "Retire"}
                        </button>
                      </form>
                    </div>

                    <form action={updateOpCode} className="mt-3 space-y-2">
                      <input type="hidden" name="code" value={r.code} />
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          name="name"
                          defaultValue={r.name}
                          aria-label={`Name for ${r.code}`}
                          className="w-full rounded-xl border border-line bg-surface-card px-3 py-2 text-sm text-ink"
                        />
                        <input
                          name="category"
                          defaultValue={r.category}
                          aria-label={`Category for ${r.code}`}
                          className="w-full rounded-xl border border-line bg-surface-card px-3 py-2 text-sm text-ink sm:max-w-[14rem]"
                        />
                      </div>
                      <input
                        name="notes"
                        defaultValue={r.notes ?? ""}
                        placeholder="Notes"
                        aria-label={`Notes for ${r.code}`}
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
        ))}
      </div>
    </>
  );
}
