import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { setFamilyEverywhere } from "@/lib/dms/mapping-actions";
import { ruleOpCode } from "@/lib/mapping/dealer-code-actions";
import { appliesLabel, plainDate } from "@/lib/mapping/epoch";
import { laborCoverage, opCodeRowAction, subCategoryRowAction } from "@/lib/mapping/dealer-codes";
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
      : Promise.resolve({
          rows: [],
          total: 0,
          noMatch: 0,
          coveredLabor: 0,
          totalLabor: 0,
          coveragePct: 0,
        }),
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
                ruledPct={laborCoverage(subs).ruledPct}
                opTotal={ops.total}
                noMatch={ops.noMatch}
                coveragePct={ops.coveragePct}
                coveredLabor={ops.coveredLabor}
                totalLabor={ops.totalLabor}
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
  ruledPct,
  opTotal,
  noMatch,
  coveragePct,
  coveredLabor,
  totalLabor,
  locked,
}: {
  dealer: Dealer;
  subCount: number;
  unmapped: number;
  waiting: number;
  ruledPct: number;
  opTotal: number;
  noMatch: number;
  coveragePct: number;
  coveredLabor: number;
  totalLabor: number;
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
          {/* The section 1 twin of op-code coverage: how much of the money a
              person has actually ruled on, not how many rows they got through. */}
          <div>
            <div className="text-2xl font-extrabold text-navy">
              {ruledPct}
              <span className="text-base">%</span>
            </div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
              of labor $ a person has ruled
            </div>
          </div>
          <Stat label="DMS op codes" value={opTotal} />
          <Stat label="No auto-match" value={noMatch} />
        </div>

        {/*
          THE NUMBER THAT SAYS WHEN HE IS DONE ENOUGH.
          The counts measure effort; this measures progress. Doggett's top few
          op codes carry millions and the tail carries hundreds, so ruling a
          hundred codes off the bottom moves the count a long way and the money
          hardly at all. A no-match ruling is not coverage — the dollars behind
          it are still bridged to nothing.
        */}
        <div className="min-w-[190px]">
          <div className="text-2xl font-extrabold text-navy">
            {coveragePct}
            <span className="text-base">%</span>
          </div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
            of labor $ on a code we recognise
          </div>
          <div className="mt-0.5 text-[11px] text-ink-soft">
            {money(coveredLabor)} of {money(totalLabor)} · op-code grain
          </div>
        </div>

        {/* Navigates. Locking changes what every number afterwards means, so it
            is not something a stray click can do — see the lock screen. */}
        <Link
          href={`/admin/mapping/dealer-codes/lock?dealer=${dealer.id}`}
          className={`whitespace-nowrap rounded-pill border px-4 py-2 text-sm font-bold ${
            locked ? "border-line bg-cream-card text-ink" : "border-navy bg-navy text-white"
          }`}
        >
          {locked ? "Reopen table…" : "Lock table…"}
        </Link>
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

/* ---------------------------------------------------------------------------
   Grouping

   THREE STATES, THREE WEIGHTS, THREE GROUPS.

   A flat table sorted by money treats "nobody has ever ruled this" and "an
   automatic guess somebody could accept in one tap" as the same job. They are
   not: the first needs a decision, the second needs agreement, and the third —
   already ruled — needs nothing and should get out of the way.

   Working this screen means driving "Needs your ruling" to zero, so it says how
   many are left in its own heading.
--------------------------------------------------------------------------- */

type Weight = "needs-ruling" | "confirmable" | "ruled";

function weightOf(row: SubCategoryRow): Weight {
  if (row.status === "confirmed" || row.status === "not_coachable") return "ruled";
  /* Mixed means the rooftops disagree, which is a decision nobody has made
     cleanly — it belongs with the work, not with the done. */
  if (row.family === null || row.status === "mixed") return "needs-ruling";
  return "confirmable";
}

function RowGroup({
  title,
  blurb,
  rows,
  dealer,
  locked,
  collapsed = false,
}: {
  title: string;
  blurb: string;
  rows: SubCategoryRow[];
  dealer: Dealer;
  locked: boolean;
  collapsed?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    /* <details> rather than client state: this page is a server component and a
       disclosure triangle does not need React to open. */
    <details open={!collapsed} className="mt-4 first:mt-0">
      <summary className="cursor-pointer list-none px-1">
        <span className="text-sm font-extrabold text-navy">
          {title} ({rows.length})
        </span>
        <span className="ml-2 text-xs text-ink-soft">{blurb}</span>
      </summary>

      <Card className="mt-2 overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-soft">
              <th className="p-3">Sub-category</th>
              <th className="p-3 text-right">Labor</th>
              <th className="p-3 text-right">ROs</th>
              <th className="p-3 text-right">Stores</th>
              <th className="p-3">Family</th>
              {/* What ruling this row moves on the coverage figure. Meaning
                  differs by group, so the group blurb says which — see below. */}
              <th className="p-3 text-right">Share of $</th>
              <th className="p-3">Mitch&rsquo;s proposal</th>
              <th className="w-[230px] p-3">Ruling</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <SubCategoryRowView key={r.subCategory} dealer={dealer} row={r} locked={locked} />
            ))}
          </tbody>
        </table>
      </Card>
    </details>
  );
}

function SubCategorySection({
  dealer,
  rows,
  locked,
}: {
  dealer: Dealer;
  rows: SubCategoryRow[];
  locked: boolean;
}) {
  /* `rows` arrives sorted by labor descending, and partitioning preserves that
     order, so each group is already money-first. */
  const needsRuling = rows.filter((r) => weightOf(r) === "needs-ruling");
  const confirmable = rows.filter((r) => weightOf(r) === "confirmable");
  const ruled = rows.filter((r) => weightOf(r) === "ruled");
  const { ruledPct, autoPct, openPct } = laborCoverage(rows);

  return (
    <section className="mt-8">
      <h2 className="px-1 text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
        Sub-categories
      </h2>
      <p className="mt-1 px-1 text-xs leading-relaxed text-ink-soft">
        Live. Every attach rate on every screen is measured through this mapping.
      </p>

      <div className="mt-3">
        <RowGroup
          title="Needs your ruling"
          blurb={`No family yet — these ROs count toward nothing. Ruling one starts counting its labor, and adds its share to coverage. ${openPct} pts sit here.`}
          rows={needsRuling}
          dealer={dealer}
          locked={locked}
        />
        <RowGroup
          title="Confirm the automatic"
          blurb={`Classified by rule, so the labor is already counted. Confirming changes no number — it moves the share a person has signed off. ${autoPct} pts sit here.`}
          rows={confirmable}
          dealer={dealer}
          locked={locked}
        />
        <RowGroup
          title="Ruled"
          blurb={`Decided. ${ruledPct} pts of the dealer's labor.`}
          rows={ruled}
          dealer={dealer}
          locked={locked}
          collapsed
        />
      </div>
    </section>
  );
}

/**
 * One row, at one of three weights.
 *
 * ---------------------------------------------------------------------------
 * THE BUTTON CARRIES THE STATE
 * ---------------------------------------------------------------------------
 *   needs-ruling  Review is GOLD. Per DESIGN_LANGUAGE gold is the single
 *                 primary action on a screen — and scarcity comes from one gold
 *                 THING per screen, not from withholding it across repetitions:
 *                 "the daily loop's Continue is gold on all five steps". This
 *                 queue's repeated action is that one thing. These rows are the
 *                 work; nothing else on the screen should out-shout them.
 *
 *   confirmable   Confirm in navy, Review as an outline beside it. Agreement is
 *                 the common act and gets the filled button; disagreement is
 *                 available and quieter.
 *
 *   ruled         Status text and a ghost Review. Done rows should recede — a
 *                 filled button on a decided row is an invitation to undo one.
 */
function SubCategoryRowView({
  dealer,
  row,
  locked,
}: {
  dealer: Dealer;
  row: SubCategoryRow;
  locked: boolean;
}) {
  /* Same function section 2 uses, so both grains obey one rule. */
  const action = subCategoryRowAction(row, locked);
  const weight = action.weight;
  const canConfirm = action.kind === "write";

  const reviewHref = `/admin/mapping/dealer-codes/confirm?dealer=${dealer.id}&subCategory=${encodeURIComponent(row.subCategory)}`;

  const reviewClass =
    weight === "needs-ruling"
      ? "bg-gold text-navy border-gold hover:brightness-95"
      : canConfirm
        ? "border-line bg-cream-card text-ink"
        : "border-transparent text-ocean underline underline-offset-2";

  return (
    <tr className="border-b border-line/60 align-top">
      <td className="p-3 font-bold text-navy">{row.subCategory}</td>
      <td className="p-3 text-right tabular-nums text-ink">{money(row.labor)}</td>
      <td className="p-3 text-right tabular-nums text-ink-soft">{row.ros.toLocaleString("en-US")}</td>
      <td className="p-3 text-right tabular-nums text-ink-soft">{row.storeCount}</td>

      <td className="p-3">
        <FamilyState status={row.status} family={row.family} />
      </td>

      <td className="p-3 text-right tabular-nums">
        {weight === "ruled" ? (
          <span className="text-xs text-ink-soft">{row.laborShare}%</span>
        ) : (
          <span
            className={`text-xs font-bold ${
              weight === "needs-ruling" ? "text-clay" : "text-ink"
            }`}
          >
            +{row.laborShare} pts
          </span>
        )}
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
            Confirm accepts the value already in force as the human ruling. It
            moves no measured number: the attach view groups on `family` and
            reads `status` only to exclude not_coachable, so auto -> confirmed
            with the same family is arithmetically invisible. Verified by
            diffing all 16,379 rows of advisor_family_attach_all across one.
          */}
          {canConfirm && (
            <form action={setFamilyEverywhere}>
              <input type="hidden" name="subCategory" value={row.subCategory} />
              <input type="hidden" name="family" value={action.kind === "write" ? action.value : ""} />
              <button
                type="submit"
                className="whitespace-nowrap rounded-pill border border-navy bg-navy px-3 py-1 text-xs font-bold text-white"
              >
                Confirm
              </button>
            </form>
          )}

          <Link
            href={reviewHref}
            className={`whitespace-nowrap rounded-pill border px-3 py-1 text-xs font-bold ${reviewClass}`}
          >
            {canConfirm ? "Review…" : action.label}
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

  /* An unmapped row WAS seen by the classifier — it just produced nothing.
     Saying "classified automatically" over an empty family is the same kind of
     lie the three-control row told. */
  const who =
    origin === "admin"
      ? "ruled by hand"
      : row.family === null && row.status !== "not_coachable"
        ? "no family matched"
        : "classified automatically";
  const when = updatedAt ? ` ${plainDate(updatedAt)}` : "";
  /* Genesis is not a date somebody should have to recognise — the wording
     lives in lib/mapping/epoch so every surface says it the same way. */
  const scope = appliesLabel(effectiveFrom) || null;

  return (
    <p className="mt-1.5 text-[11px] text-ink-soft">
      {who}
      {when}
      {scope ? ` · ${scope}` : ""}
    </p>
  );
}


/* ---------------------------------------------------------------------------
   Section 2 — DMS op codes
--------------------------------------------------------------------------- */

/* Section 2's three states, same shape as section 1's. */
function opWeight(r: OpCodeRow): Weight {
  if (r.status === "confirmed" || r.status === "no_match") return "ruled";
  if (r.suggestion) return "confirmable";
  return "needs-ruling";
}

function OpCodeGroup({
  title,
  blurb,
  rows,
  dealer,
  locked,
  collapsed = false,
}: {
  title: string;
  blurb: string;
  rows: OpCodeRow[];
  dealer: Dealer;
  locked: boolean;
  collapsed?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <details open={!collapsed} className="mt-4 first:mt-0">
      <summary className="cursor-pointer list-none px-1">
        <span className="text-sm font-extrabold text-navy">
          {title} ({rows.length})
        </span>
        <span className="ml-2 text-xs text-ink-soft">{blurb}</span>
      </summary>

      <Card className="mt-2 overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-soft">
              {/* Explicit widths on the two flexible columns. Without them the
                  description takes whatever it wants and "Rule it…" wraps into
                  two lines inside its own pill. */}
              <th className="p-3">DMS code</th>
              <th className="w-[38%] p-3">What they call it</th>
              <th className="p-3 text-right">Labor</th>
              <th className="p-3 text-right">ROs</th>
              <th className="w-[220px] p-3">Our code</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <OpCodeRowView key={r.dmsOpCode} dealer={dealer} row={r} locked={locked} />
            ))}
          </tbody>
        </table>
      </Card>
    </details>
  );
}

function OpCodeRowView({
  dealer,
  row: r,
  locked,
}: {
  dealer: Dealer;
  row: OpCodeRow;
  locked: boolean;
}) {
  /*
   * THE BUTTON'S JOB IS DECIDED IN lib/mapping/dealer-codes, not here.
   *
   * This row used to render an editable text box with a "no match" placeholder
   * above a submit button, for every state including "nothing suggested". Two
   * codes were ruled by somebody clicking that button over a field they had
   * never touched. The rule — a one-tap write only where the value shown IS the
   * value recorded — now lives in a function with a test around it.
   */
  const action = opCodeRowAction(r, locked);
  const href = `/admin/mapping/dealer-codes/op-code?dealer=${dealer.id}&code=${encodeURIComponent(r.dmsOpCode)}`;

  const weightClass =
    action.weight === "needs-ruling"
      ? "border-gold bg-gold text-navy hover:brightness-95"
      : action.weight === "confirmable" && action.kind === "write"
        ? "border-navy bg-navy text-white"
        : "border-transparent text-ocean underline underline-offset-2";

  return (
    <tr className="border-b border-line/60 align-top">
      <td className="p-3 font-mono text-xs font-bold text-navy">{r.dmsOpCode}</td>
      <td className="p-3 text-xs text-ink">
        <span className="line-clamp-2">{r.description || "—"}</span>
      </td>
      <td className="p-3 text-right tabular-nums text-ink">{money(r.labor)}</td>
      <td className="p-3 text-right tabular-nums text-ink-soft">
        {r.ros.toLocaleString("en-US")}
      </td>
      <td className="p-3">
        {/* The value, as text. A field somebody can leave alone is a field that
            can be submitted by accident. */}
        <div className="font-mono text-xs font-bold text-navy">
          {r.canonical ?? (r.status === "no_match" ? "nothing fits" : r.suggestion?.code ?? "—")}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {action.kind === "write" ? (
            <form action={ruleOpCode}>
              <input type="hidden" name="dmsOpCode" value={r.dmsOpCode} />
              <input type="hidden" name="rooftopIds" value={dealer.rooftopIds.join(",")} />
              <input type="hidden" name="mode" value="correction" />
              <input type="hidden" name="matchedBy" value="auto" />
              {/* The exact string on screen, and nothing else. */}
              <input type="hidden" name="canonical" value={action.value} />
              <button
                type="submit"
                className={`whitespace-nowrap rounded-pill border px-3 py-1 text-xs font-bold ${weightClass}`}
              >
                {action.label}
              </button>
            </form>
          ) : (
            <Link
              href={href}
              className={`whitespace-nowrap rounded-pill border px-3 py-1 text-xs font-bold ${weightClass}`}
            >
              {action.label}
            </Link>
          )}

          {/* Disagreeing with a suggestion is always available, and always goes
              through the screen. */}
          {action.kind === "write" && (
            <Link
              href={href}
              className="whitespace-nowrap rounded-pill border border-transparent px-3 py-1 text-xs font-bold text-ocean underline underline-offset-2"
            >
              Different code…
            </Link>
          )}
        </div>

        <p className="mt-1 text-[11px] text-ink-soft">
          {r.status === "unruled" && r.suggestion
            ? `suggested · ${r.suggestion.name} · ${Math.round(r.suggestion.score * 100)}% match`
            : r.status === "unruled"
              ? "no auto-match"
              : `${r.status === "no_match" ? "ruled: nothing fits" : r.status}${
                  r.matchedBy ? ` · ${r.matchedBy}` : ""
                }${r.audit?.updatedAt ? ` · ${plainDate(r.audit.updatedAt)}` : ""}`}
        </p>
      </td>
    </tr>
  );
}

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

      <div className="mt-3">
        <OpCodeGroup
          title="Needs your ruling"
          blurb="No suggestion the matcher would stand behind."
          rows={rows.filter((r) => opWeight(r) === "needs-ruling")}
          dealer={dealer}
          locked={locked}
        />
        <OpCodeGroup
          title="Confirm the automatic"
          blurb="Matched on the description. Check it, then confirm."
          rows={rows.filter((r) => opWeight(r) === "confirmable")}
          dealer={dealer}
          locked={locked}
        />
        <OpCodeGroup
          title="Ruled"
          blurb="Decided, including the ones ruled as nothing-fits."
          rows={rows.filter((r) => opWeight(r) === "ruled")}
          dealer={dealer}
          locked={locked}
          collapsed
        />
      </div>

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
