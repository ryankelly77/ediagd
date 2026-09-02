import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Card } from "@/components/brand/Card";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { updateOpCodeFamily } from "@/lib/mapping/admin-actions";
import {
  GENESIS,
  describeEdit,
  firstAffectedMonth,
  monthLabel,
  storeToday,
} from "@/lib/mapping/epoch";

/**
 * The confirm step: Correction or Change, and what each one would do.
 *
 * A SEPARATE ROUTE RATHER THAN A DIALOG, because the preview needs the database
 * and this app renders on the server. A client dialog would mean shipping the
 * period list and the advisor counts to the browser to compute a number the
 * server already knows.
 *
 * THE PREVIEW IS HONEST ABOUT WHICH KIND OF EDIT THIS IS. Changing
 * op_code_family does NOT move a measured number today — it routes cues, and
 * the pick is made at family grain from advisor_family_attach, which this table
 * does not feed. So the preview says what actually moves: the coaching an
 * advisor receives, and the block they are working. Claiming "N periods
 * recompute" here would be a number that sounds precise and is false; the day
 * the pick moves to op-code grain it becomes true, and this is where it changes.
 */
export default async function ConfirmFamilyEdit({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string;
    family?: string;
    coachable?: string;
    note?: string;
  }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isOwner } = await supabase.rpc("is_platform_owner");
  if (!isOwner) redirect("/admin");

  const { code, family, coachable, note } = await searchParams;
  if (!code || !family) redirect("/admin/mapping/families");

  const service = createServiceClient();
  const [{ data: current }, { data: periods }, { data: blocks }] = await Promise.all([
    service
      .from("op_code_family")
      .select("family, coachable, note, effective_from")
      .eq("code", code)
      .is("retired_at", null)
      .maybeSingle(),
    service
      .from("perf_period")
      .select("starts_on")
      .eq("source_kind", "dynatron")
      .order("starts_on"),
    /* Advisors currently mid-block on this code — the people whose coaching
       changes under their feet, which is the real cost of this edit. */
    service
      .from("coaching_block")
      .select("user_id, family")
      .eq("op_code", code)
      .is("ended_on", null),
  ]);

  if (!current) redirect("/admin/mapping/families");

  const allPeriods = (periods ?? []) as { starts_on: string }[];
  const today = storeToday();
  const firstChange = firstAffectedMonth(today);
  const changeAffected = allPeriods.filter((p) => p.starts_on >= firstChange).length;
  const openBlocks = (blocks ?? []).length;

  const newCoachable = coachable === "1";
  const unchanged =
    current.family === family &&
    current.coachable === newCoachable &&
    (current.note ?? "") === (note ?? "");

  const hidden = (mode: string) => (
    <>
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="family" value={family} />
      <input type="hidden" name="coachable" value={coachable ?? "0"} />
      <input type="hidden" name="note" value={note ?? ""} />
      <input type="hidden" name="mode" value={mode} />
    </>
  );

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/admin/mapping/families", label: "Families" }}
        trail={[
          { href: "/admin", label: "Admin" },
          { href: "/admin/mapping", label: "Mapping" },
        ]}
        title={`Confirm ${code}`}
        subtitle="Two kinds of edit. They mean different things to history."
      />

      <Card className="mt-4 p-5">
        <p className="font-mono text-sm font-extrabold text-navy">{code}</p>
        <p className="mt-2 text-sm text-ink">
          <span className="text-ink-soft">Family </span>
          {current.family} <span className="text-ink-soft">→</span>{" "}
          <strong className="text-navy">{family}</strong>
        </p>
        <p className="mt-1 text-sm text-ink">
          <span className="text-ink-soft">Coachable </span>
          {current.coachable ? "yes" : "no"} <span className="text-ink-soft">→</span>{" "}
          <strong className="text-navy">{newCoachable ? "yes" : "no"}</strong>
        </p>
        {unchanged && (
          <p className="mt-3 text-sm text-clay">
            Nothing is different from the current mapping.
          </p>
        )}
      </Card>

      {/*
        WHAT ACTUALLY MOVES. op_code_family routes coaching, not measurement:
        the pick is made at family grain and reads advisor_family_attach, which
        this table does not feed. Saying so plainly beats a period count that
        would be precise and wrong.
      */}
      <Card className="mt-4 border-dashed p-5">
        <p className="text-sm text-ink-soft">
          This mapping decides which <strong className="text-navy">cues</strong>{" "}
          reach an advisor and which op code a block locks onto — not the attach
          rates they are measured on. Those come from the sub-category mapping,
          which has its own confirm.
        </p>
        <p className="mt-2 text-sm text-ink-soft">
          {openBlocks === 0
            ? "No advisor is currently in a block on this code."
            : `${openBlocks} advisor${openBlocks === 1 ? " is" : "s are"} in an open block on this code right now — their coaching changes at the next day they open.`}
        </p>
        <p className="mt-2 text-sm text-ink-soft">
          {allPeriods.length} measured periods exist. They are listed here
          because the day the pick moves to op-code grain, this edit will reach
          them — and the date recorded today is what decides how far back.
        </p>
      </Card>

      <div className="mt-4 space-y-2">
        <Card className="p-5">
          <p className="text-base font-extrabold text-navy">Correction</p>
          <p className="mt-1 text-sm text-ink-soft">
            This was always wrong — nobody ever meant the old value. Effective
            from the beginning ({GENESIS}); the old mapping is retired as though
            it never applied.
          </p>
          <p className="mt-2 text-sm text-ink">
            {describeEdit("correction", GENESIS, allPeriods.length)}
          </p>
          <form action={updateOpCodeFamily} className="mt-3">
            {hidden("correction")}
            <button
              type="submit"
              className="rounded-xl bg-gold px-4 py-2 text-sm font-extrabold text-navy transition hover:brightness-95"
            >
              Save as a correction
            </button>
          </form>
        </Card>

        <Card className="p-5">
          <p className="text-base font-extrabold text-navy">Change</p>
          <p className="mt-1 text-sm text-ink-soft">
            The old value was right and something different is right now.
            History keeps the old mapping.
          </p>
          <p className="mt-2 text-sm text-ink">
            Takes effect with the{" "}
            <strong className="text-navy">{monthLabel(firstChange)}</strong>{" "}
            period — {changeAffected} of {allPeriods.length} periods. Earlier
            months keep the current mapping.
          </p>
          <form action={updateOpCodeFamily} className="mt-3 space-y-2">
            {hidden("change")}
            <label className="block text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
              Effective from
            </label>
            <input
              type="date"
              name="effective_from"
              defaultValue={today}
              className="w-full rounded-xl border border-line bg-surface-card px-3 py-2 text-sm text-ink sm:max-w-[14rem]"
            />
            <p className="text-xs text-ink-soft">
              A period is measured under the rules in force on its first day, so
              a date mid-month takes effect the following month. Never split.
            </p>
            <button
              type="submit"
              className="rounded-xl bg-gold px-4 py-2 text-sm font-extrabold text-navy transition hover:brightness-95"
            >
              Save as a change
            </button>
          </form>
        </Card>
      </div>

      <p className="mt-4 text-sm">
        <Link href="/admin/mapping/families" className="text-ocean hover:underline">
          Cancel
        </Link>
      </p>
    </main>
  );
}
