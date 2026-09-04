import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { TypedConfirm } from "@/components/admin/TypedConfirm";
import { setDealerLock } from "@/lib/mapping/dealer-code-actions";
import { loadDealers, loadOpCodes, loadSubCategories } from "@/lib/mapping/dealer-codes";

/**
 * Declaring a dealer's translation table finished — or reopening it.
 *
 * ---------------------------------------------------------------------------
 * THE ONE ACT ON THIS SCREEN THAT CHANGES WHAT EVERY NUMBER MEANS
 * ---------------------------------------------------------------------------
 * Ruling a sub-category moves one mapping. Locking says the whole table is
 * done, and from then on an edit is not finishing onboarding — it is changing
 * a mapping that measured months have run through, which is why every edit
 * afterwards demands a new measurement epoch.
 *
 * So it gets a screen, the current state as a gut-check, and a typed
 * confirmation. Ordinary rulings keep their one-step confirm: the 60-row grind
 * must not grow ceremony, or it stops getting done.
 *
 * UNLOCKING IS HERE TOO, WITHOUT THE TYPING. Otherwise the ceremony is one tap
 * away from being irrelevant — unlock, edit freely, relock — and a gate you can
 * walk around is not a gate. Reopening is the safe direction, so it is a plain
 * button rather than a second comprehension test.
 */
export default async function LockDealerCodesPage({
  searchParams,
}: {
  searchParams: Promise<{ dealer?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isOwner } = await supabase.rpc("is_platform_owner");
  if (!isOwner) redirect("/admin");

  const { dealer: dealerId } = await searchParams;
  const service = createServiceClient();
  const dealers = await loadDealers(service);
  const dealer = dealers.find((d) => d.id === dealerId) ?? dealers[0];
  if (!dealer) redirect("/admin/mapping/dealer-codes");

  const back = `/admin/mapping/dealer-codes?dealer=${dealer.id}`;
  const locked = Boolean(dealer.lockedAt);

  const [subs, ops] = await Promise.all([
    loadSubCategories(service, dealer),
    loadOpCodes(service, dealer, 100000),
  ]);

  const unruled = subs.filter((s) => s.status === "unmapped" || s.status === "mixed").length;
  const ruled = subs.filter((s) => s.status === "confirmed" || s.status === "not_coachable").length;
  const auto = subs.filter((s) => s.status === "auto").length;

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: back, label: "Dealer Codes" }}
        trail={[
          { href: "/admin", label: "Admin" },
          { href: "/admin/mapping", label: "Mapping" },
        ]}
        title={locked ? `Reopen ${dealer.name}` : `Lock ${dealer.name}`}
        subtitle={
          locked
            ? "Put the table back into onboarding."
            : "Declaring the translation table finished."
        }
      />

      {locked ? (
        <Card className="mt-4 p-5">
          <p className="text-sm leading-relaxed text-ink">
            <strong className="text-navy">{dealer.name}&rsquo;s table is locked.</strong>{" "}
            It was declared finished on {dealer.lockedAt?.slice(0, 10)}. Reopening puts it
            back into onboarding: edits stop demanding a new measurement epoch and go
            through the ordinary one-step confirm again.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Nothing already recorded changes. This only affects how the next edit is
            treated.
          </p>
          <form action={setDealerLock} className="mt-4">
            <input type="hidden" name="dealerId" value={dealer.id} />
            <input type="hidden" name="locked" value="0" />
            <button
              type="submit"
              className="rounded-xl border border-line bg-cream-card px-4 py-2 text-sm font-extrabold text-navy"
            >
              Reopen the table
            </button>
          </form>
        </Card>
      ) : (
        <>
          <Card className="mt-4 p-5">
            <p className="text-sm leading-relaxed text-ink">
              This declares <strong className="text-navy">{dealer.name}</strong>&rsquo;s
              translation table finished. Advisors&rsquo; measurement runs on it from here.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink">
              After locking, any change requires starting a new measurement epoch — the
              before and after numbers will no longer be directly comparable, and the
              change is recorded as such.
            </p>
          </Card>

          {/* The gut-check. Locking with rows unruled is allowed and sometimes
              right; doing it without being told how many is not. */}
          <Card className="mt-4 border-dashed p-5">
            <p className="text-sm font-extrabold text-navy">Where the table stands</p>
            <ul className="mt-2 space-y-1 text-sm text-ink-soft">
              <li>
                <strong className="text-navy">{ruled}</strong> sub-categories ruled by hand
              </li>
              <li>
                <strong className="text-navy">{auto}</strong> classified automatically and
                not yet confirmed
              </li>
              <li className={unruled > 0 ? "text-clay" : undefined}>
                <strong className={unruled > 0 ? "text-clay" : "text-navy"}>{unruled}</strong>{" "}
                {unruled === 1 ? "sub-category is" : "sub-categories are"} not yet ruled
                {unruled > 0 && " — locking now leaves them uncounted"}
              </li>
              <li>
                <strong className="text-navy">{ops.coveragePct}%</strong> of labor dollars
                bridged at op-code grain ({ops.total - ops.noMatch} of {ops.total} codes have
                a ruling or a suggestion)
              </li>
            </ul>
          </Card>

          <Card className="mt-4 p-5">
            <form action={setDealerLock}>
              <input type="hidden" name="dealerId" value={dealer.id} />
              <input type="hidden" name="locked" value="1" />
              <TypedConfirm
                phrase={dealer.name}
                label="Lock the table"
                hint="To confirm, type the dealer's name:"
              />
            </form>
          </Card>
        </>
      )}

      <p className="px-1 pt-4 text-sm">
        <Link href={back} className="font-bold text-ocean underline underline-offset-2">
          Cancel — change nothing
        </Link>
      </p>
    </main>
  );
}
