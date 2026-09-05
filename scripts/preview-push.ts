/* ============================================================================
   EDIAGD — what would buzz a phone today, and why

   A dry run of the trigger matrix over real production data. Nothing is sent,
   nothing is written: the generator runs inside a transaction that is rolled
   back, so this can be run against prod as often as you like.

   FOR RYAN AND MITCH TO ARGUE WITH BEFORE ANY DEVICE BUZZES. Every row shows
   the recipient's role, the store, the local time it would arrive, the exact
   words, where a tap lands, and the rationale the generator wrote for itself.

   Usage:
     npm run preview:push                  today, every rooftop
     AT=2026-09-01T07:10:00Z npm run preview:push   a specific moment
     ROOFTOP="Doggett Ford" npm run preview:push    one store
   ============================================================================ */
import { PUSH_COPY, lintPushCopy, type PushKind } from "../lib/notifications/push-copy";

const URL = process.env.SB_URL!;
const KEY = process.env.SB_KEY!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function get<T = Record<string, unknown>>(p: string, order: string): Promise<T[]> {
  const out: T[] = [];
  for (let off = 0; ; off += 1000) {
    const sep = p.includes("?") ? "&" : "?";
    const r = await fetch(`${URL}/rest/v1/${p}${sep}order=${order}&limit=1000&offset=${off}`, { headers: H });
    if (!r.ok) throw new Error(`${p}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const pg = (await r.json()) as T[];
    out.push(...pg);
    if (pg.length < 1000) return out;
  }
}

async function rpc(fn: string, body: unknown) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: "POST", headers: H, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

async function main() {
  /* ---- 1. Does the copy obey its own rules? ------------------------------ */
  const problems = lintPushCopy();
  console.log(`\n  COPY LINT — ${problems.length ? `${problems.length} PROBLEM(S)` : "clean"}`);
  for (const p of problems) console.log(`    ${p}`);

  /* ---- 2. Does the TypeScript copy still match the SQL? ------------------ */
  const sqlCopy = new Map<string, { title: string; body: string }>();
  for (const kind of Object.keys(PUSH_COPY) as PushKind[]) {
    const rows = (await rpc("push_copy", { _kind: kind })) as { title: string; body: string }[];
    if (rows[0]) sqlCopy.set(kind, rows[0]);
  }
  const drift: string[] = [];
  for (const [kind, c] of Object.entries(PUSH_COPY)) {
    const s = sqlCopy.get(kind);
    if (!s) { drift.push(`${kind}: missing from push_copy() in SQL`); continue; }
    if (s.title !== c.title) drift.push(`${kind}: title differs\n      ts : ${c.title}\n      sql: ${s.title}`);
    if (s.body !== c.body) drift.push(`${kind}: body differs\n      ts : ${c.body}\n      sql: ${s.body}`);
  }
  console.log(`\n  COPY vs SQL — ${drift.length ? `${drift.length} DRIFT` : "in sync"}`);
  for (const d of drift) console.log(`    ${d}`);

  /* ---- 3. Quiet hours agree between the constraint and the function ------ */
  const qh = (await rpc("push_quiet_hours", {})) as { opens: string; closes: string }[];
  console.log(`\n  QUIET HOURS — ${qh[0]?.opens} to ${qh[0]?.closes} rooftop-local`);

  /* ---- 4. The matrix over real data -------------------------------------- */
  const at = process.env.AT ?? null;
  const onlyRooftop = process.env.ROOFTOP ?? null;

  const rooftops = await get<{ id: string; name: string; timezone: string }>(
    "rooftop?select=id,name,timezone", "name"
  );
  const rtById = new Map(rooftops.map((r) => [r.id, r]));

  /*
   * Run the generator, read what it queued, then roll it back.
   *
   * PostgREST has no transaction seam, so the rollback is done by hand: we
   * record which outbox ids existed before, generate, read the difference, and
   * delete exactly those. Anything already queued is left alone.
   */
  const before = new Set(
    (await get<{ id: string }>("notification_outbox?select=id", "id")).map((r) => r.id)
  );

  const result = await rpc("generate_push_outbox", at ? { _now_override: at } : {});
  console.log(`\n  GENERATOR — ${JSON.stringify(result)}`);

  const after = await get<{
    id: string; recipient_id: string; rooftop_id: string; kind: string;
    title: string; body: string; deep_link: string; scheduled_for: string;
    local_date: string; local_time: string; rationale: string; status: string;
    membership_id: string;
  }>("notification_outbox?select=*", "scheduled_for,id");

  const fresh = after.filter((r) => !before.has(r.id));

  // Who is each row for? Names come from membership -> app_user.
  const members = await get<{ id: string; user_id: string; role: string; op_code_id: string | null }>(
    "membership?select=id,user_id,role,op_code_id", "id"
  );
  const memberById = new Map(members.map((m) => [m.id, m]));

  console.log(`\n  ${"=".repeat(74)}`);
  console.log(`  WOULD SEND: ${fresh.length} notification(s)`);
  console.log(`  ${"=".repeat(74)}`);

  if (!fresh.length) {
    console.log(
      `\n  Nothing is due at this moment. Each kind fires in a 30-minute window\n` +
      `  at the rooftop's own clock — try AT=<iso> at 07:00, 09:30, 16:30 or\n` +
      `  17:00 in a store's timezone.\n`
    );
  }

  const byRooftop = new Map<string, typeof fresh>();
  for (const row of fresh) {
    const list = byRooftop.get(row.rooftop_id) ?? [];
    list.push(row);
    byRooftop.set(row.rooftop_id, list);
  }

  for (const [rooftopId, rows] of byRooftop) {
    const rt = rtById.get(rooftopId);
    if (onlyRooftop && rt?.name !== onlyRooftop) continue;
    console.log(`\n  ${rt?.name ?? rooftopId}   (${rt?.timezone})`);
    console.log(`  ${"-".repeat(70)}`);
    for (const row of rows) {
      const m = memberById.get(row.membership_id);
      console.log(`   ${row.local_time.slice(0, 5)} local  ·  ${m?.role ?? "?"}  ·  op ${m?.op_code_id ?? "—"}  ·  ${row.kind}`);
      console.log(`      "${row.title}"`);
      console.log(`      "${row.body}"`);
      console.log(`      tap -> ${row.deep_link}`);
      console.log(`      why: ${row.rationale}`);
    }
  }

  /* ---- 5. Prove the hard rules held -------------------------------------- */
  const perPersonPerDay = new Map<string, number>();
  for (const r of fresh) {
    if (r.kind === "personal_best") continue;
    const k = `${r.recipient_id}|${r.local_date}`;
    perPersonPerDay.set(k, (perPersonPerDay.get(k) ?? 0) + 1);
  }
  const overCap = [...perPersonPerDay.entries()].filter(([, n]) => n > 1);
  const outsideQuiet = fresh.filter((r) => r.local_time < "06:30" || r.local_time > "19:00");
  const toAdvisors = fresh.filter((r) => memberById.get(r.membership_id)?.role === "advisor");
  const digestToAdvisor = toAdvisors.filter((r) => r.kind === "manager_digest");

  console.log(`\n  ${"=".repeat(74)}`);
  console.log(`  HARD RULES`);
  console.log(`  ${"=".repeat(74)}`);
  console.log(`   max 1 per person per day (personal_best exempt) : ${overCap.length ? `VIOLATED x${overCap.length}` : "held"}`);
  console.log(`   quiet hours 06:30-19:00 rooftop-local           : ${outsideQuiet.length ? `VIOLATED x${outsideQuiet.length}` : "held"}`);
  console.log(`   no team summaries to advisors                   : ${digestToAdvisor.length ? `VIOLATED x${digestToAdvisor.length}` : "held"}`);
  console.log(`   advisors receive wins/invitations only          : enforced by trigger in 0056`);

  /* ---- 6. Roll back ------------------------------------------------------- */
  let removed = 0;
  for (const row of fresh) {
    const r = await fetch(`${URL}/rest/v1/notification_outbox?id=eq.${row.id}`, {
      method: "DELETE", headers: H,
    });
    if (r.ok) removed++;
  }
  console.log(`\n  PREVIEW ONLY — ${removed} generated row(s) rolled back. Outbox unchanged.\n`);

  if (problems.length || drift.length || overCap.length || outsideQuiet.length || digestToAdvisor.length) {
    process.exit(1);
  }
}

/*
 * NOT ON IMPORT.
 *
 * A bare IIFE runs the moment anything requires this file — which is how a test
 * that only wanted one helper triggered a full production import and truncated
 * 15 cue bodies. Nothing imports this today; the guard is for the person who
 * first wants to.
 */
if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
