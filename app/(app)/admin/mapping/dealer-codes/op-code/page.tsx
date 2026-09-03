import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ruleOpCode } from "@/lib/mapping/dealer-code-actions";
import { loadDealers, loadOpCodes } from "@/lib/mapping/dealer-codes";
import { sinceLabel } from "@/lib/mapping/epoch";

/**
 * Ruling one raw DMS op code.
 *
 * ---------------------------------------------------------------------------
 * THIS SCREEN EXISTS BECAUSE THE ROW USED TO DO THIS IN ONE CLICK
 * ---------------------------------------------------------------------------
 * "Rule it…" on a code with no suggested match was a submit button over an
 * empty text box whose placeholder read "no match". Clicking it recorded
 * "nothing fits" for that code at every rooftop, dated to the beginning of
 * measurement, with nothing chosen and nothing shown first.
 *
 * A ruling with no value on the row has to be MADE somewhere, and this is
 * where: the current state, what the dealer actually calls the code, a picker,
 * the consequence in plain words, and only then Apply.
 */
export default async function RuleOpCodePage({
  searchParams,
}: {
  searchParams: Promise<{ dealer?: string; code?: string; canonical?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isOwner } = await supabase.rpc("is_platform_owner");
  if (!isOwner) redirect("/admin");

  const { dealer: dealerId, code, canonical } = await searchParams;
  if (!code) redirect("/admin/mapping/dealer-codes");

  const service = createServiceClient();
  const dealers = await loadDealers(service);
  const dealer = dealers.find((d) => d.id === dealerId) ?? dealers[0];
  if (!dealer) redirect("/admin/mapping/dealer-codes");

  const back = `/admin/mapping/dealer-codes?dealer=${dealer.id}`;

  const [{ rows }, { data: catalog }] = await Promise.all([
    loadOpCodes(service, dealer, 100000),
    service.from("op_code_catalog").select("code, name").is("retired_at", null).order("code"),
  ]);

  const row = rows.find((r) => r.dmsOpCode === code);
  if (!row) redirect(back);

  const picked = (canonical ?? "").trim();
  const catalogRows = (catalog ?? []) as { code: string; name: string }[];
  const pickedName = catalogRows.find((c) => c.code === picked)?.name ?? null;

  const currentLabel =
    row.status === "confirmed" && row.canonical
      ? row.canonical
      : row.status === "no_match"
        ? "Nothing fits"
        : "Not ruled";

  /* Plain words, and honest about the one thing that matters here: this table
     feeds nothing today. Somebody ruling 1,805 codes deserves to know that
     before they start, not after. */
  const currentState =
    row.status === "confirmed"
      ? " — this code is recorded as our " + row.canonical + "."
      : row.status === "no_match"
        ? " — somebody looked and decided no code we have fits this one."
        : row.suggestion
          ? ` — nobody has ruled it. The matcher suggests ${row.suggestion.code}.`
          : " — nobody has ruled it, and the matcher found nothing it would stand behind.";

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: back, label: "Dealer Codes" }}
        trail={[
          { href: "/admin", label: "Admin" },
          { href: "/admin/mapping", label: "Mapping" },
        ]}
        title={`Rule “${row.dmsOpCode}”`}
        subtitle="One of the dealer's own op codes, onto one of ours."
      />

      <Card className="mt-4 p-5">
        <p className="font-mono text-sm font-extrabold text-navy">{row.dmsOpCode}</p>
        <p className="mt-0.5 text-xs text-ink-soft">
          {dealer.name} · {row.storeCount} {row.storeCount === 1 ? "store" : "stores"} send it
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink">
          <span className="text-ink-soft">What they call it: </span>
          {row.description || "— no description —"}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink">
          <span className="text-ink-soft">Currently: </span>
          <strong className="text-navy">{currentLabel}</strong>
          {currentState}
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          ${row.labor.toLocaleString("en-US")} of labor across{" "}
          {row.ros.toLocaleString("en-US")} ROs
          {row.audit?.effectiveFrom
            ? ` · in force since ${sinceLabel(row.audit.effectiveFrom)}`
            : ""}
        </p>
      </Card>

      {/* The one thing somebody ruling 1,805 of these needs to know up front. */}
      <Card className="mt-4 border-dashed p-5">
        <p className="text-sm leading-relaxed text-ink-soft">
          <strong className="text-navy">Nothing reads this yet.</strong> Coaching is measured
          at family grain today, so a ruling here changes no advisor&apos;s numbers. It is
          recorded with the same effective dating as everything else so that when coaching
          moves to op-code precision, this table can already say what each code meant in
          every month that was measured.
        </p>
      </Card>

      <Card className="mt-4 p-5">
        <p className="text-base font-extrabold text-navy">Rule it</p>
        {picked ? (
          <p className="mt-2 text-sm text-ink">
            <strong className="text-navy">{currentLabel}</strong>{" "}
            <span className="text-ink-soft">→</span>{" "}
            <strong className="text-navy">
              {picked === "__none__" ? "Nothing fits" : `${picked}${pickedName ? ` · ${pickedName}` : ""}`}
            </strong>
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">
            Choose one of our codes, or rule that none of them fits.
          </p>
        )}

        <form action={ruleOpCode} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="dmsOpCode" value={row.dmsOpCode} />
          <input type="hidden" name="rooftopIds" value={dealer.rooftopIds.join(",")} />
          <input type="hidden" name="mode" value="correction" />
          <input type="hidden" name="matchedBy" value="human" />
          {/*
            NO PLACEHOLDER THAT SUBMITS. The empty option is spelled out as a
            ruling — "None of ours fits" — so choosing it is an act rather than
            the result of leaving a box alone.
          */}
          <select
            name="canonical"
            defaultValue={picked || row.canonical || ""}
            className="rounded-xl border border-line bg-cream-card px-3 py-2 text-sm text-navy"
          >
            <option value="">— choose —</option>
            <option value="__none__">None of ours fits</option>
            {catalogRows.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-xl bg-gold px-4 py-2 text-sm font-extrabold text-navy transition hover:brightness-95"
          >
            Apply
          </button>
        </form>
        <p className="mt-2 text-xs text-ink-soft">
          Applies at all {dealer.rooftopCount} of this dealer&apos;s rooftops, from the
          beginning of measurement.
        </p>
      </Card>

      <p className="px-1 pt-4 text-sm">
        <Link href={back} className="font-bold text-ocean underline underline-offset-2">
          Cancel — change nothing
        </Link>
      </p>
    </main>
  );
}
