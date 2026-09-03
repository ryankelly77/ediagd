import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { setFamilyEverywhere } from "@/lib/dms/mapping-actions";
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

  const [subs, ops] = await Promise.all([
    dealer ? loadSubCategories(service, dealer) : Promise.resolve([]),
    dealer
      ? loadOpCodes(service, dealer, codesParam === "all" ? 5000 : 150)
      : Promise.resolve({ rows: [], total: 0, noMatch: 0 }),
  ]);

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
  locked,
}: {
  dealer: Dealer;
  rows: SubCategoryRow[];
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
  locked,
}: {
  dealer: Dealer;
  row: SubCategoryRow;
  locked: boolean;
}) {
  /*
   * ---- ONE STORY PER ROW ---------------------------------------------------
   *
   * This row used to say the family three times and disagree with itself: a
   * green pill reading "Fluids", a dropdown reading "— unmapped —", and a
   * "Not coachable" chip sitting beside both. A person reading it could not
   * tell whether the thing was mapped, and the honest answer was "mapped
   * automatically, not yet ruled by a human" — which none of the three said.
   *
   * So: ONE control showing the effective value AND where it came from, and one
   * primary action. The dropdown is gone from the row. Choosing a DIFFERENT
   * family is a change of routing, and a change of routing belongs on the
   * screen that can tell you what it would move.
   */
  const ruled = row.status === "confirmed";
  const hasValue = row.family !== null;
  const notCoachable = row.status === "not_coachable";

  return (
    <tr className="border-b border-line/60 align-top">
      <td className="p-3 font-bold text-navy">{row.subCategory}</td>
      <td className="p-3 text-right tabular-nums text-ink">{money(row.labor)}</td>
      <td className="p-3 text-right tabular-nums text-ink-soft">{row.ros.toLocaleString("en-US")}</td>
      <td className="p-3 text-right tabular-nums text-ink-soft">{row.storeCount}</td>

      {/* The single family control: value and source, in one place. */}
      <td className="p-3">
        <FamilyState status={row.status} family={row.family} />
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
        <div className="flex flex-wrap items-center gap-2">
          {/*
            CONFIRM IS THE PRIMARY ACTION, and only where there is something to
            confirm. It accepts the value already in force as the human ruling —
            same family, now ruled — which moves no measured number: the attach
            view groups on `family` and reads `status` only to exclude
            not_coachable, so auto -> confirmed with the same family is
            arithmetically invisible. Verified by diffing all 16,379 rows of
            advisor_family_attach_all across a confirm: zero changed.

            Not offered once LOCKED. After the table is ruled complete even a
            one-tap confirm is an edit to a finished table, and it goes through
            the screen that explains itself.
          */}
          {hasValue && !ruled && !notCoachable && !locked && (
            <form action={setFamilyEverywhere}>
              <input type="hidden" name="subCategory" value={row.subCategory} />
              <input type="hidden" name="family" value={row.family ?? ""} />
              <button
                type="submit"
                className="rounded-pill border border-navy bg-navy px-3 py-1 text-xs font-bold text-white"
              >
                Confirm
              </button>
            </form>
          )}

          {/*
            THE CHANGE PATH. Everything that is not "yes, that one" lives behind
            this: picking a different family, or ruling it out of coaching
            altogether. Both are decisions with consequences the row cannot
            show, so they happen on the screen that can.
          */}
          <Link
            href={`/admin/mapping/dealer-codes/confirm?dealer=${dealer.id}&subCategory=${encodeURIComponent(row.subCategory)}`}
            className={`rounded-pill border px-3 py-1 text-xs font-bold ${
              hasValue && !ruled && !notCoachable && !locked
                ? "border-line text-ink-soft"
                : "border-navy bg-navy text-white"
            }`}
          >
            Review…
          </Link>
        </div>

        <RulingFootnote row={row} />
      </td>
    </tr>
  );
}

/**
 * The family, and where it came from — the row's one statement about routing.
 *
 * "Fluids · automatic" and "Fluids · confirmed" are the same family and a
 * different amount of trust, which is the distinction the three-control version
 * lost. Not coachable is a value here rather than a chip beside one, because it
 * IS the answer to "what family does this land in": none, deliberately.
 */
function FamilyState({ status, family }: { status: string; family: string | null }) {
  if (status === "not_coachable") {
    return (
      <span className="inline-flex rounded-pill border border-line bg-cream-card px-2 py-0.5 text-[11px] font-bold text-ink-soft">
        Not coachable
      </span>
    );
  }
  if (status === "mixed") {
    return (
      <span className="inline-flex rounded-pill border border-gold/40 bg-gold/10 px-2 py-0.5 text-[11px] font-bold text-gold-deep">
        Differs by store
      </span>
    );
  }
  if (!family) {
    return (
      <span className="inline-flex rounded-pill border border-clay/40 bg-clay/10 px-2 py-0.5 text-[11px] font-bold text-clay">
        Not ruled
      </span>
    );
  }
  const confirmed = status === "confirmed";
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 rounded-pill border px-2 py-0.5 text-[11px] font-bold ${
        confirmed
          ? "border-palm/40 bg-palm-soft/40 text-navy"
          : "border-line bg-cream-card text-ink"
      }`}
    >
      {family}
      <span className="font-normal text-ink-soft">
        · {confirmed ? "confirmed" : "automatic"}
      </span>
    </span>
  );
}

/**
 * The audit line, in plain words.
 *
 * Was `auto 2026-09-02 · from 2000-01-01`, which is three pieces of jargon and
 * a date nobody can read as "the beginning". Mitch is the reader.
 */
function RulingFootnote({ row }: { row: SubCategoryRow }) {
  if (!row.audit) return null;
  const { origin, updatedAt, effectiveFrom } = row.audit;

  const who = origin === "admin" ? "ruled by hand" : "classified automatically";
  const when = updatedAt ? ` ${plainDate(updatedAt)}` : "";
  /* Genesis is not a date somebody should have to recognise. */
  const scope =
    effectiveFrom === "2000-01-01"
      ? "applies to all history"
      : effectiveFrom
        ? `applies from ${plainDate(effectiveFrom)}`
        : null;

  return (
    <p className="mt-1.5 text-[11px] text-ink-soft">
      {who}
      {when}
      {scope ? ` · ${scope}` : ""}
    </p>
  );
}

/** "Sep 2" — the format a person writing a note would use. */
function plainDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
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
