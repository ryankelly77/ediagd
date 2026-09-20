/* 0124 post-migration check, against PRODUCTION.
   Runs the real assembleMorning for the four real advisor accounts. */
/* eslint-disable @typescript-eslint/no-explicit-any */
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SB_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SB_KEY;

import { createClient } from "@supabase/supabase-js";
import { assembleMorning } from "@/lib/loop";
import { evaluateDayGate } from "@/lib/gamification/dayGate";
import { rooftopIsProvisioned } from "@/lib/entitlement";
import type { IsoDate } from "@/lib/gamification/streak";

async function main() {
const sb: any = createClient(process.env.SB_URL!, process.env.SB_KEY!, { auth: { persistSession: false } });

const { data: advisors } = await sb
  .from("membership")
  .select("user_id, rooftop_id, op_code_id, app_user:user_id(full_name), rooftop:rooftop_id(name)")
  .eq("role", "advisor")
  .eq("active", true);

const pad = (s: unknown, n: number) => String(s ?? "—").padEnd(n);

for (const m of (advisors ?? []) as any[]) {
  const name = m.app_user?.full_name ?? m.user_id.slice(0, 8);
  const roof = m.rooftop?.name ?? "?";
  const { data: todayRaw } = await sb.rpc("rooftop_today", { _rooftop: m.rooftop_id });
  const today = String(todayRaw);

  const provisioned = await rooftopIsProvisioned(sb, m.rooftop_id);

  console.log(`\n${"─".repeat(78)}`);
  console.log(`${name}  @ ${roof}   op ${m.op_code_id ?? "—"}   store date ${today}`);
  console.log(`  rooftop provisioned: ${provisioned ? "yes" : "NO — advisor sees RooftopNotReady"}`);

  if (!provisioned) {
    console.log(`  -> the honest state renders instead of the ritual; no morning is assembled.`);
    continue;
  }

  const morning = await assembleMorning(sb, sb, m.user_id, m.rooftop_id, today as IsoDate);

  const slots: [string, string | null | undefined][] = [
    ["1 mindset", morning.mindset?.title],
    ["2 pitch  ", morning.pitch ? `${morning.pitch.title}  [${morning.pitch.family} ${morning.pitch.position}/${morning.pitch.total}]` : null],
    ["3 item   ", morning.item ? `${morning.item.title}  [${morning.item.trackName} ${morning.item.position}/${morning.item.total}]` : null],
    ["  track film", morning.track?.film?.title ?? (morning.track ? `(none — ${morning.track.name}${morning.track.entering ? ", entering" : ""})` : null)],
    ["  quote  ", morning.quote?.title],
  ];
  console.log(`  MORNING KIND: ${morning.kind}`);
  for (const [k, v] of slots) console.log(`    ${pad(k, 12)} ${v ?? "—"}`);
  if (morning.assignment) {
    console.log(`    assignment   ${morning.assignment.family}  source=${morning.assignment.source}  shelf=${morning.assignment.filmCount}`);
  } else {
    console.log(`    assignment   none`);
  }

  /* Can this day be finished? Gate as if every offered slot were met. */
  const gate = evaluateDayGate({
    kind: morning.kind,
    mindset: morning.mindset ? { contentId: morning.mindset.contentId, met: true } : null,
    pitch: morning.pitch ? { contentId: morning.pitch.contentId, met: true } : null,
    item: morning.item ? { contentId: morning.item.contentId, met: true } : null,
    trackFilm: morning.track?.film ? { contentId: morning.track.film.contentId, met: true } : null,
  });
  console.log(`    FINISHABLE:  ${gate.complete ? "yes" : "NO — outstanding: " + gate.outstanding.join(",")}`);
  console.log(`    legs:        ${gate.legs.map((l) => `${l.key}${l.offered ? (l.required ? "*" : "?") : "-"}`).join(" ")}   (* required, ? offered-not-required, - not offered)`);
}

/* the missed volume behind each derived pick */
console.log(`\n${"═".repeat(78)}\nWHAT WAS WRITTEN — advisor_focus_family\n${"═".repeat(78)}`);
const { data: aff } = await sb
  .from("advisor_focus_family")
  .select("user_id, family, source, missed_ros, opportunity, film_count, assigned_on, ended_on, app_user:user_id(full_name)");
for (const r of (aff ?? []) as any[]) {
  console.log(`  ${pad(r.app_user?.full_name, 16)} ${pad(r.family, 18)} ${pad(r.source, 8)} missed ${pad(r.missed_ros, 8)} $${pad(r.opportunity, 9)} shelf ${pad(r.film_count, 3)} ${r.ended_on ? "ENDED " + r.ended_on : "active"}`);
}

console.log(`\nTRACK ENTRY — certification.entry_film_content_id set on any core track?`);
const { data: certs } = await sb.from("certification").select("slug, name, entry_film_content_id").eq("is_core", true);
const withFilm = ((certs ?? []) as any[]).filter((c) => c.entry_film_content_id);
console.log(`  core certifications: ${(certs ?? []).length}, with an entry film: ${withFilm.length}`);
const { count: entries } = await sb.from("advisor_track_entry").select("*", { count: "exact", head: true });
console.log(`  advisor_track_entry rows: ${entries ?? 0}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
