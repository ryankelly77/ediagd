/* ============================================================================
   EDIAGD — what tonight's Rollcall post would say. Without posting it.

   ---------------------------------------------------------------------------
   WHY THIS EXISTS, AND WHAT IT IS NOT
   ---------------------------------------------------------------------------
   `npm run accept:rollcall` proves the database half against LOCAL fixtures.
   `npm run test:rollcall-message` proves the columns and sentences against
   fixtures with no database at all. `npm run verify:rollcall` drives a real
   browser — and it REFUSES a non-local URL, by design, because it writes.

   So none of the three can answer the only question that matters before a
   change to this post ships: what will Ryan actually read this evening, for
   the real store, with the real numbers. A post reviewed as a mockup is a
   label checked against another label.

   ---------------------------------------------------------------------------
   READ-ONLY, AND THE CONSTRUCTION IS WHAT MAKES IT SO
   ---------------------------------------------------------------------------
   This file does not import postToSlack. There is no webhook, no fetch to
   Slack, and no code path here that could acquire one — so it CANNOT post,
   rather than being careful not to. It writes no heartbeat either, so it
   cannot move the "what changed since" window the real cron depends on.

   It reads `cron_heartbeat.detail.posted_at` to use the SAME window the real
   post would use, because a preview against a different window is a preview of
   a different message.

     SUPABASE_URL=<prod url> SUPABASE_SERVICE_ROLE_KEY=<prod service key> \
     ROLLCALL_ROOFTOP_ID=<uuid> npx tsx scripts/rollcall-preview.ts

   or, with those already in .env.local:  npm run preview:rollcall
   ============================================================================ */

import { createClient } from "@supabase/supabase-js";
import { loadRollcall, loadRollcallChanges } from "@/lib/rollcall";
import { buildRollcallMessage } from "@/lib/rollcall-message";
import { isUuid } from "@/lib/events/kinds";
import { storeDateOf } from "@/lib/store-day";
import { rollcallPostDue } from "@/lib/rollcall-schedule";

const URL_ =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ROOFTOP = (process.env.ROLLCALL_ROOFTOP_ID ?? "").trim();

if (!URL_ || !KEY) {
  console.error("\n  need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY\n");
  process.exit(1);
}
/* THE ROOFTOP COMES FROM A UUID, NEVER FROM A NAME — the same rule the cron
   route states: a name match returns the wrong row without erroring. */
if (!isUuid(ROOFTOP)) {
  console.error("\n  ROLLCALL_ROOFTOP_ID is not set, or is not a uuid\n");
  process.exit(1);
}

async function main() {
  const sb = createClient(URL_, KEY, { auth: { persistSession: false } });

  const { data: rooftop, error: roofErr } = await sb
    .from("rooftop")
    .select("id, name, timezone")
    .eq("id", ROOFTOP)
    .maybeSingle();
  if (roofErr) throw new Error(`rooftop: ${roofErr.message}`);
  if (!rooftop) throw new Error(`no rooftop with id ${ROOFTOP}`);

  const { data: heartbeat } = await sb
    .from("cron_heartbeat")
    .select("detail")
    .eq("job", "rollcall")
    .maybeSingle();
  const postedAt = (heartbeat?.detail as Record<string, unknown> | null)?.posted_at;
  const since =
    typeof postedAt === "string" && !Number.isNaN(new Date(postedAt).getTime())
      ? new Date(postedAt)
      : null;

  /*
   * WOULD THE POST EVEN GO OUT TODAY? Printed, because a preview that renders
   * a beautiful post on a Saturday and says nothing about the weekday rule is
   * a label with the wrong thing behind it — the cron would skip, and whoever
   * read this would believe a message had gone into the channel. Same rule
   * object the route uses, so the two cannot disagree.
   */
  const localDate = storeDateOf(new Date(), (rooftop.timezone as string | null) ?? null);
  const { data: closureRow } = await sb
    .from("rooftop_closed_day")
    .select("label, status, dismissed_at")
    .eq("rooftop_id", ROOFTOP)
    .eq("closed_on", localDate)
    .is("dismissed_at", null)
    .maybeSingle();
  const decision = rollcallPostDue({
    localDate,
    closure: closureRow
      ? {
          label: closureRow.label as string,
          status: closureRow.status as "proposed" | "confirmed",
        }
      : null,
  });

  const rollcall = await loadRollcall(sb, ROOFTOP);
  const changes = since
    ? await loadRollcallChanges(sb, ROOFTOP, since, rollcall.rows)
    : new Map();

  const message = buildRollcallMessage({
    rollcall,
    rooftopName: rooftop.name as string,
    timezone: (rooftop.timezone as string | null) ?? null,
    now: new Date(),
    since,
    changes,
  });

  /* SAID BEFORE THE POST, not after it: a preview read without its scope is a
     scoped measurement reported as a general one. */
  console.log(`\n  rooftop        ${rooftop.name} (${ROOFTOP})`);
  console.log(`  timezone       ${rooftop.timezone ?? "UTC"}`);
  console.log(`  store today    ${rollcall.today ?? "— (not scoped to one store)"}`);
  console.log(
    `  due today      ${decision.due ? `yes (${decision.weekday})` : `NO — ${decision.reason} The real cron would skip and post nothing.`}`
  );
  console.log(
    `  window since   ${since ? since.toISOString() : "— (no successful post recorded; this renders as a first post)"}`
  );
  console.log(
    `  cert meter     ${rollcall.teamGatingDone} of ${rollcall.teamGatingTotal} gating modules across ${rollcall.coreTracks} active core tracks · proven ${rollcall.certProgressProven}`
  );
  console.log(
    `  listed         ${message.listed}, dropped ${message.dropped}, moved ${message.changed}`
  );
  console.log("\n  ---- the post, as it would be sent ----\n");
  console.log(
    message.text
      .split("\n")
      .map((l) => `  | ${l}`)
      .join("\n")
  );
  console.log("\n  nothing was posted and no heartbeat was written.\n");
}

main().catch((e) => {
  console.error("\nPREVIEW ERROR:", e instanceof Error ? e.message : e);
  process.exit(1);
});
