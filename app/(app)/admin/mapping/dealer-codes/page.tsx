import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  clearNotCoachable,
  markNotCoachable,
  setSubCategoryFamily,
} from "@/lib/dms/mapping-actions";
import { ruleOpCode, setDealerLock } from "@/lib/mapping/dealer-code-actions";
import {
  loadDealers,
  loadOpCodes,
  loadSubCategories,
  type Dealer,
  type OpCodeRow,
  type SubCategoryRow,
} from "@/lib/mapping/dealer-codes";

/**
 * Dealer Codes — the per-dealer translation table.
 *
 * ---------------------------------------------------------------------------
 * THIS IS THE ONBOARDING FLOW FOR EVERY FUTURE DEALER
 * ---------------------------------------------------------------------------
 * Pull their list, auto-match it, rule the rest, lock it. Built on Doggett so
 * the flow is proven before dealer #2 exists rather than discovered during
 * their first week.
 *
 * TWO SECTIONS, AND THEY ARE NOT THE SAME KIND OF THING. Section 1 is live —
 * every attach rate on every screen is computed through that join, so an edit
 * moves measured numbers and gets the Correction/Change confirmation. Section 2
 * feeds nothing yet, and says so on the screen, because a table that looks live
 * and is not is worse than one that admits it.
 *
 * ABSORBED, NOT DUPLICATED. The old /admin/dms/mapping queue redirects here and
 * this screen calls the same four server actions it did. There is one write
 * path — mapping_edit() — and now one surface in front of it.
 *
 * BOTH SECTIONS SORT BY MONEY. The top ten sub-categories carry most of the
 * volume; alphabetical order would have somebody ruling "Accessories" before
 * "LOF".
 */
export default async function DealerCodesPage({
  searchParams,
}: {
  searchParams: Promise<{ dealer?: string; codes?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isOwner } = await supabase.rpc("is_platform_owner");
  if (!isOwner) redirect("/admin");

  const { dealer: dealerParam, codes: codesParam } = await searchParams;
  const service = createServiceClient();

  const dealers = await loadDealers(service);
  const dealer = dealers.find((d) => d.id === dealerParam) ?? dealers[0] ?? null;

  const [{ data: families }, subs, ops] = await Promise.all([
    service.from("service_family").select("name").order("sort_order"),
    dealer ? loadSubCategories(service, dealer) : Promise.resolve([]),
    dealer
      ? loadOpCodes(service, dealer, codesParam === "all" ? 5000 : 150)
      : Promise.resolve({ rows: [], total: 0, noMatch: 0 }),
  ]);

  const familyNames = ((families ?? []) as { name: string }[]).map((f) => f.name);
  const unmapped = subs.filter((s) => s.status === "unmapped").length;
  const waiting = subs.filter((s) => s.proposal).length;
  const locked = Boolean(dealer?.lockedAt);

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-8">
      <AdminPageHeader
        back={{ href: "/admin/mapping", label: "Mapping" }}
        title="Dealer Codes"
        subtitle="Everything a dealer's DMS sends, ruled onto our vocabulary."
      />

      {dealers.length === 0 ? (
        <Card className="mt-6 p-6">
          <p className="text-sm text-ink-soft">No dealers yet.</p>
        </Card>
      ) : (
        <>
          <DealerPicker dealers={dealers} current={dealer} />

          {dealer && (
            <>
              <Summary
                dealer={dealer}
                subCount={subs.length}
                unmapped={unmapped}
                waiting={waiting}
                opTotal={ops.total}
                noMatch={ops.noMatch}
                locked={locked}
              />

              <SubCategorySection
                dealer={dealer}
                rows={subs}
                familyNames={familyNames}
                locked={locked}
              />

              <OpCodeSection
                dealer={dealer}
                rows={ops.rows}
                total={ops.total}
                noMatch={ops.noMatch}
                showingAll={codesParam === "all"}
                locked={locked}
              />
            </>
          )}
        </>
      )}
    </main>
  );
}

/* ---------------------------------------------------------------------------
   Picker
--------------------------------------------------------------------------- */

function DealerPicker({ dealers, current }: { dealers: Dealer[]; current: Dealer | null }) {
  return (
    <div className="mt-6 flex flex-wrap gap-2">
      {dealers.map((d) => {
        const on = d.id === current?.id;
        return (
          <Link
            key={d.id}
            href={`/admin/mapping/dealer-codes?dealer=${d.id}`}
            className={`rounded-pill border px-4 py-2 text-sm font-bold ${
              on ? "border-teal bg-teal-soft/40 text-navy" : "border-line bg-cream-card text-ink-soft"
            }`}
          >
            {d.name}
            <span className="ml-2 font-normal text-ink-soft">
              {d.rooftopCount} {d.rooftopCount === 1 ? "rooftop" : "rooftops"}
            </span>
            {/* Lock state lives on the picker, so it is visible before you pick. */}
            {d.lockedAt && <span className="ml-2 text-xs font-bold text-clay">LOCKED</span>}
          </Link>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Summary + lock
--------------------------------------------------------------------------- */

function Summary({
  dealer,
  subCount,
  unmapped,
  waiting,
  opTotal,
  noMatch,
  locked,
}: {
  dealer: Dealer;
  subCount: number;
  unmapped: number;
  waiting: number;
  opTotal: number;
  noMatch: number;
  locked: boolean;
}) {
  return (
    <Card className="mt-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {/* Unmapped is FIRST and is never hidden — it is the queue. */}
          <Stat label="Unmapped" value={unmapped} tone={unmapped > 0 ? "clay" : "palm"} />
          <Stat label="Proposals waiting" value={waiting} tone={waiting > 0 ? "gold" : "palm"} />
          <Stat label="Sub-categories" value={subCount} />
          <Stat label="DMS op codes" value={opTotal} />
          <Stat label="No auto-match" value={noMatch} />
        </div>

        <form action={setDealerLock}>
          <input type="hidden" name="dealerId" value={dealer.id} />
          <input type="hidden" name="locked" value={locked ? "0" : "1"} />
          <button
            type="submit"
            className={`rounded-pill border px-4 py-2 text-sm font-bold ${
              locked ? "border-line bg-cream-card text-ink" : "border-navy bg-navy text-white"
            }`}
          >
            {locked ? "Unlock table" : "Lock table"}
          </button>
        </form>
      </div>

      {locked && (
        <p className="mt-4 border-t border-line pt-3 text-sm leading-relaxed text-ink-soft">
          <span className="font-bold text-navy">This table is locked.</span> Onboarding is
          finished, so an edit from here is no longer completing the setup — it changes a
          mapping that months of measurement have already run through. Every edit now asks
          whether it is a correction or a change before it applies.
        </p>
      )}

      <div className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-soft">
        <Link href={`/admin/mapping/dealer-codes/export?dealer=${dealer.id}&section=sub`} className="font-bold text-ocean underline underline-offset-2">
          Export sub-categories (CSV)
        </Link>
        <span className="mx-2">·</span>
        <Link href={`/admin/mapping/dealer-codes/export?dealer=${dealer.id}&section=ops`} className="font-bold text-ocean underline underline-offset-2">
          Export op codes (CSV)
        </Link>
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: number;
  tone?: "ink" | "clay" | "palm" | "gold";
}) {
  const colour = {
    ink: "text-navy",
    clay: "text-clay",
    palm: "text-palm",
    gold: "text-gold-deep",
  }[tone];
  return (
    <div>
      <div className={`text-2xl font-extrabold ${colour}`}>{value}</div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{label}</div>
    </div>
  );
}

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/* ---------------------------------------------------------------------------
   Section 1 — sub-categories
--------------------------------------------------------------------------- */

function SubCategorySection({
  dealer,
  rows,
  familyNames,
  locked,
}: {
  dealer: Dealer;
  rows: SubCategoryRow[];
  familyNames: string[];
  locked: boolean;
}) {
  return (
    <section className="mt-8">
      <h2 className="px-1 text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
        Sub-categories
      </h2>
      <p className="mt-1 px-1 text-xs leading-relaxed text-ink-soft">
        Live. Every attach rate on every screen is measured through this mapping.
      </p>

      <Card className="mt-2 overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-soft">
              <th className="p-3">Sub-category</th>
              <th className="p-3 text-right">Labor</th>
              <th className="p-3 text-right">ROs</th>
              <th className="p-3 text-right">Stores</th>
              <th className="p-3">Family</th>
              <th className="p-3">Mitch&rsquo;s proposal</th>
              <th className="p-3">Ruling</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <SubCategoryRowView
                key={r.subCategory}
                dealer={dealer}
                row={r}
                familyNames={familyNames}
                locked={locked}
              />
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

function SubCategoryRowView({
  dealer,
  row,
  familyNames,
  locked,
}: {
  dealer: Dealer;
  row: SubCategoryRow;
  familyNames: string[];
  locked: boolean;
}) {
  /*
   * THE QUEUE STAYS A QUEUE.
   *
   * An unmapped row has no prior value, so there is nothing for history to keep
   * and nothing to choose between — it posts straight through as a correction.
   * Sixty rows worked down one at a time do not each deserve a confirm screen.
   *
   * A row that already HAS a family is different: that mapping has been feeding
   * every period it covers, so the edit either rewrites measured numbers or it
   * does not, and only Mitch knows which. Those go to the confirm screen. So
   * does everything once the table is LOCKED, because after lock even a first
   * ruling is a change to a finished table.
   */
  const needsConfirm = locked || (row.status !== "unmapped" && row.family !== null);

  return (
    <tr className="border-b border-line/60 align-top">
      <td className="p-3 font-bold text-navy">{row.subCategory}</td>
      <td className="p-3 text-right tabular-nums text-ink">{money(row.labor)}</td>
      <td className="p-3 text-right tabular-nums text-ink-soft">{row.ros.toLocaleString("en-US")}</td>
      <td className="p-3 text-right tabular-nums text-ink-soft">{row.storeCount}</td>

      <td className="p-3">
        <StatusChip status={row.status} family={row.family} />
      </td>

      <td className="p-3">
        {row.proposal ? (
          <div>
            <div className="font-mono text-xs font-bold text-navy">{row.proposal.canonical}</div>
            {row.proposal.evidenceRos != null && (
              <div className="mt-0.5 text-[11px] text-ink-soft">
                {row.proposal.evidencePeriod ?? "evidence"}: {row.proposal.evidenceRos} ROs
                {row.proposal.evidenceLabor != null && ` · ${money(Number(row.proposal.evidenceLabor))}`}
                {row.proposal.evidenceStores != null && ` · ${row.proposal.evidenceStores} stores`}
              </div>
            )}
          </div>
        ) : (
          <span className="text-xs text-ink-soft">—</span>
        )}
      </td>

      <td className="p-3">
        {/* Two sibling forms, never nested — a form inside a form is invalid
            HTML and the browser silently drops the inner one. */}
        <div className="flex flex-wrap items-center gap-2">
          {needsConfirm ? (
            /* GET to the confirm screen: it needs the database to compute how
               many periods a correction would recompute, and this app renders
               on the server. */
            <form method="get" action="/admin/mapping/dealer-codes/confirm" className="flex items-center gap-2">
              <input type="hidden" name="dealer" value={dealer.id} />
              <input type="hidden" name="subCategory" value={row.subCategory} />
              <FamilySelect familyNames={familyNames} current={row.proposal ? "" : row.family} />
              <Go label="Review…" />
            </form>
          ) : (
            <form action={setSubCategoryFamily} className="flex items-center gap-2">
              <input type="hidden" name="rooftopId" value={dealer.rooftopIds[0] ?? ""} />
              <input type="hidden" name="subCategory" value={row.subCategory} />
              <input type="hidden" name="mode" value="correction" />
              <FamilySelect familyNames={familyNames} current={row.family} />
              <Go label="Apply" />
            </form>
          )}

          <form action={row.status !== "not_coachable" ? markNotCoachable : clearNotCoachable}>
            <input type="hidden" name="subCategory" value={row.subCategory} />
            <button
              type="submit"
              className="rounded-pill border border-line px-3 py-1 text-xs font-bold text-ink-soft"
            >
              {row.status !== "not_coachable" ? "Not coachable" : "Back to queue"}
            </button>
          </form>
        </div>

        {row.audit && (
          <p className="mt-1.5 text-[11px] text-ink-soft">
            {row.audit.origin === "admin" ? "ruled" : "auto"}
            {row.audit.updatedAt && ` ${row.audit.updatedAt.slice(0, 10)}`}
            {row.audit.effectiveFrom && ` · from ${row.audit.effectiveFrom}`}
          </p>
        )}
      </td>
    </tr>
  );
}

function FamilySelect({
  familyNames,
  current,
}: {
  familyNames: string[];
  current: string | null;
}) {
  return (
    <select
      name="family"
      defaultValue={current ?? ""}
      className="rounded-lg border border-line bg-cream-card px-2 py-1 text-xs text-navy"
    >
      <option value="">— unmapped —</option>
      {familyNames.map((f) => (
        <option key={f} value={f}>
          {f}
        </option>
      ))}
    </select>
  );
}

function Go({ label }: { label: string }) {
  return (
    <button
      type="submit"
      className="rounded-pill border border-navy bg-navy px-3 py-1 text-xs font-bold text-white"
    >
      {label}
    </button>
  );
}

function StatusChip({ status, family }: { status: string; family: string | null }) {
  const tone =
    status === "unmapped"
      ? "border-clay/40 bg-clay/10 text-clay"
      : status === "not_coachable"
        ? "border-line bg-cream-card text-ink-soft"
        : status === "mixed"
          ? "border-gold/40 bg-gold/10 text-gold-deep"
          : "border-palm/40 bg-palm-soft/40 text-navy";
  const label =
    status === "unmapped"
      ? "unmapped"
      : status === "not_coachable"
        ? "not coachable"
        : status === "mixed"
          ? "differs by store"
          : family ?? status;
  return (
    <span className={`inline-flex rounded-pill border px-2 py-0.5 text-[11px] font-bold ${tone}`}>
      {label}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Section 2 — DMS op codes
--------------------------------------------------------------------------- */

function OpCodeSection({
  dealer,
  rows,
  total,
  noMatch,
  showingAll,
  locked,
}: {
  dealer: Dealer;
  rows: OpCodeRow[];
  total: number;
  noMatch: number;
  showingAll: boolean;
  locked: boolean;
}) {
  return (
    <section className="mt-10">
      <h2 className="px-1 text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
        DMS op codes
      </h2>
      {/*
        THE QUIET LINE. A table that looks live and is not is worse than one
        that admits it — somebody would rule 1,805 codes believing it changed
        something today.
      */}
      <p className="mt-1 px-1 text-xs leading-relaxed text-ink-soft">
        Nothing reads this yet — used when coaching moves to op-code precision. Rulings are
        recorded with the same effective dating so the history is already honest when it does.
      </p>

      <Card className="mt-2 overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-soft">
              <th className="p-3">DMS code</th>
              <th className="p-3">What they call it</th>
              <th className="p-3 text-right">Labor</th>
              <th className="p-3 text-right">ROs</th>
              <th className="p-3">Our code</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.dmsOpCode} className="border-b border-line/60 align-top">
                <td className="p-3 font-mono text-xs font-bold text-navy">{r.dmsOpCode}</td>
                <td className="p-3 text-xs text-ink">
                  <span className="line-clamp-2">{r.description || "—"}</span>
                </td>
                <td className="p-3 text-right tabular-nums text-ink">{money(r.labor)}</td>
                <td className="p-3 text-right tabular-nums text-ink-soft">
                  {r.ros.toLocaleString("en-US")}
                </td>
                <td className="p-3">
                  <form action={ruleOpCode} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="dmsOpCode" value={r.dmsOpCode} />
                    <input type="hidden" name="rooftopIds" value={dealer.rooftopIds.join(",")} />
                    <input type="hidden" name="mode" value={locked ? "change" : "correction"} />
                    <input
                      type="hidden"
                      name="matchedBy"
                      value={r.canonical ? "human" : r.suggestion ? "auto" : "human"}
                    />
                    <input
                      name="canonical"
                      defaultValue={r.canonical ?? r.suggestion?.code ?? ""}
                      placeholder="no match"
                      className="w-32 rounded-lg border border-line bg-cream-card px-2 py-1 font-mono text-xs text-navy"
                    />
                    <button
                      type="submit"
                      className="rounded-pill border border-navy bg-navy px-3 py-1 text-xs font-bold text-white"
                    >
                      {r.status === "unruled" ? "Confirm" : "Update"}
                    </button>
                  </form>
                  <p className="mt-1 text-[11px] text-ink-soft">
                    {r.status === "unruled" && r.suggestion
                      ? `proposed · ${r.suggestion.name} · ${Math.round(r.suggestion.score * 100)}% match`
                      : r.status === "unruled"
                        ? "no auto-match"
                        : `${r.status}${r.matchedBy ? ` · ${r.matchedBy}` : ""}${
                            r.audit?.updatedAt ? ` · ${r.audit.updatedAt.slice(0, 10)}` : ""
                          }`}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="mt-2 px-1 text-xs text-ink-soft">
        Showing {rows.length} of {total} by labor. {noMatch} have no auto-match.
        {!showingAll && total > rows.length && (
          <>
            {" "}
            <Link
              href={`/admin/mapping/dealer-codes?dealer=${dealer.id}&codes=all`}
              className="font-bold text-ocean underline underline-offset-2"
            >
              Show all {total}
            </Link>
          </>
        )}
      </p>
    </section>
  );
}
