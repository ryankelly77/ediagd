import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { createAlias, setAliasConfirmed } from "@/lib/mapping/admin-actions";

type AliasRow = {
  id: string;
  kind: string;
  alias: string;
  canonical: string;
  confirmed: boolean;
  note: string | null;
};

const KINDS = ["op_code", "collection", "voice", "service_family"] as const;

/**
 * Screen 4 · old names for canonical things.
 *
 * THE POINT OF THIS SCREEN IS THE CONFIRM BUTTON. An unconfirmed alias is
 * VISIBLE AND INERT — the importer resolves confirmed rows only — so a guess
 * can sit here indefinitely without quietly rerouting anybody's content. That
 * property is worth more than the table itself, and it is why adding an alias
 * and confirming one are two separate acts rather than one form.
 *
 * ACO-010 has been sitting here since 0066 waiting for one line from Mitch.
 * Unconfirmed rows sort first, because they are the only ones that need doing.
 */
export default async function AliasesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isOwner } = await supabase.rpc("is_platform_owner");
  if (!isOwner) redirect("/admin");

  const service = createServiceClient();
  const [{ data: rows }, blocked] = await Promise.all([
    service
      .from("mapping_alias")
      .select("id, kind, alias, canonical, confirmed, note")
      .order("confirmed")
      .order("kind")
      .order("alias"),
    /* Content actually waiting on one of these. An alias with rows behind it is
       a different priority from one nobody is blocked by, and the number is the
       only thing that says which is which. */
    service
      .from("content_review")
      .select("content_id", { count: "exact", head: true })
      .eq("reason", "needs_op_code")
      .eq("status", "open"),
  ]);

  const aliases = (rows ?? []) as AliasRow[];
  const heldForOpCode = blocked.count ?? 0;
  const waiting = aliases.filter((a) => !a.confirmed);

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/admin/mapping", label: "Mapping" }}
        trail={[{ href: "/admin", label: "Admin" }]}
        title="Aliases"
        subtitle={`${aliases.length} translations${waiting.length ? `, ${waiting.length} waiting on a ruling` : ""}.`}
      />

      <Card className="mt-4 border-dashed p-5">
        <p className="text-sm text-ink-soft">
          A <strong className="text-navy">proposed</strong> alias is visible and
          inert: the importer resolves confirmed rows only, so a guess cannot
          reroute content while it waits for an answer. Confirming is what makes
          it live.
        </p>
        {heldForOpCode > 0 && (
          <p className="mt-2 text-sm text-ink-soft">
            {heldForOpCode} content row{heldForOpCode === 1 ? " is" : "s are"}{" "}
            currently held for an op code — some of them are waiting on a ruling
            here.
          </p>
        )}
      </Card>

      <div className="mt-4 space-y-2">
        {aliases.map((a) => (
          <Card key={a.id} className={`p-5 ${a.confirmed ? "" : "border-clay"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-sm font-extrabold text-navy">
                  {a.alias} <span className="text-ink-soft">→</span> {a.canonical}
                </p>
                <p className="mt-0.5 text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
                  {a.kind.replace("_", " ")}
                  {!a.confirmed && " · proposed, inert"}
                </p>
                {a.note && <p className="mt-1 text-sm text-ink-soft">{a.note}</p>}
              </div>

              <form action={setAliasConfirmed} className="shrink-0">
                <input type="hidden" name="id" value={a.id} />
                <input
                  type="hidden"
                  name="confirmed"
                  value={a.confirmed ? "0" : "1"}
                />
                <button
                  type="submit"
                  className={
                    a.confirmed
                      ? "rounded-xl border border-line px-3 py-2 text-xs font-bold text-ink transition hover:bg-cream-card"
                      : "rounded-xl bg-gold px-3 py-2 text-xs font-extrabold text-navy transition hover:brightness-95"
                  }
                >
                  {a.confirmed ? "Withdraw" : "Confirm"}
                </button>
              </form>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-4 p-5">
        <p className="text-base font-extrabold text-navy">Add an alias</p>
        <p className="mt-1 text-sm text-ink-soft">
          Starts unconfirmed, whoever adds it. An op-code alias whose target is
          not in the catalog is refused — it would import content against a code
          that does not exist, and the foreign key would reject the row with
          nobody told why.
        </p>
        <form action={createAlias} className="mt-3 space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              name="kind"
              defaultValue="op_code"
              aria-label="Kind"
              className="rounded-xl border border-line bg-surface-card px-3 py-2 text-sm text-ink"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k.replace("_", " ")}
                </option>
              ))}
            </select>
            <input
              name="alias"
              placeholder="Old name"
              aria-label="Old name"
              className="w-full rounded-xl border border-line bg-surface-card px-3 py-2 text-sm text-ink"
            />
            <input
              name="canonical"
              placeholder="Canonical"
              aria-label="Canonical"
              className="w-full rounded-xl border border-line bg-surface-card px-3 py-2 text-sm text-ink"
            />
          </div>
          <input
            name="note"
            placeholder="Where did this name come from?"
            aria-label="Note"
            className="w-full rounded-xl border border-line bg-surface-card px-3 py-2 text-sm text-ink"
          />
          <button
            type="submit"
            className="rounded-xl bg-gold px-4 py-2 text-sm font-extrabold text-navy transition hover:brightness-95"
          >
            Propose
          </button>
        </form>
      </Card>
    </main>
  );
}
