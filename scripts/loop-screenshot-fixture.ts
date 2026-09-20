/* ============================================================================
   EDIAGD — three advisors, one in each morning state, for the screenshots

   LOCAL ONLY. It writes content, users and history. Refuses anything that is
   not localhost.

     export SB_URL=http://127.0.0.1:55321 SB_KEY=<local service role>
     npm run fixture:loop

   Leaves behind three signed-in-able advisors at one rooftop:

     normal@…       mindset -> pitch -> item
     twoslot@…      mindset -> item          (focus family out of film)
     entry@…        mindset -> track film    (a track with a film attached)

   THE TRACK FILM IS ATTACHED HERE AND ONLY HERE. certification.entry_film_content_id
   ships null and stays null in production — which track each film opens is
   Mitch's ruling. Setting it on a local fixture is how the entry morning gets
   photographed without pre-empting him, and it is the same UPDATE he will make.
============================================================================ */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const URL = process.env.SB_URL!;
const KEY = process.env.SB_KEY!;
if (!URL || !KEY) {
  console.error("\n  need SB_URL and SB_KEY\n");
  process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(URL)) {
  console.error(`REFUSING to run against ${URL} — local only.`);
  process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const TAG = "shot";
const PASSWORD = "Fixture-passw0rd!";
const FAM = "Belts & Cooling";

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86_400_000).toISOString().slice(0, 10);
}

async function main() {
  /* ---- wipe any previous run so this is re-runnable --------------------- */
  const { data: old } = await sb.from("app_user").select("id").like("full_name", `${TAG}%`);
  for (const u of (old ?? []) as { id: string }[]) {
    for (const t of [
      "advisor_track_entry",
      "advisor_pool_seen",
      "advisor_focus_family",
      "advisor_certification",
      "module_completion",
      "content_progress",
      "watch_gate",
      "sand_dollar_entry",
      "user_badge",
      "swell",
      "daily_completion",
      "membership",
    ]) {
      await sb.from(t).delete().eq("user_id", u.id);
    }
    await sb.from("app_user").delete().eq("id", u.id);
    await sb.auth.admin.deleteUser(u.id).catch(() => {});
  }
  await sb.from("content").delete().like("title", `${TAG}%`);
  const { data: oldRoof } = await sb.from("rooftop").select("id").like("name", `${TAG}%`);
  for (const r of (oldRoof ?? []) as { id: string }[]) {
    await sb.from("advisor_op_metric").delete().eq("rooftop_id", r.id);
    await sb.from("advisor_period_total_src").delete().eq("rooftop_id", r.id);
    await sb.from("perf_period").delete().eq("rooftop_id", r.id);
    await sb.from("rooftop_product").delete().eq("rooftop_id", r.id);
    await sb.from("rooftop").delete().eq("id", r.id);
  }
  await sb.from("org").delete().like("name", `${TAG}%`);
  await sb.from("course").delete().like("name", `${TAG}%`);
  await sb.from("op_code_family").delete().like("note", `${TAG}%`);
  await sb.from("op_code_catalog").delete().like("name", `${TAG}%`);
  await sb.from("service_line").delete().like("description", `${TAG}%`);

  /* ---- the store ------------------------------------------------------- */
  const org = (await sb.from("org").insert({ name: `${TAG} Group` }).select("id").single()).data!;
  const roof = (
    await sb
      .from("rooftop")
      .insert({ org_id: org.id, name: `${TAG} Doggett Ford`, timezone: "America/Chicago" })
      .select("id")
      .single()
  ).data!;
  await sb.from("rooftop_product").insert({ rooftop_id: roof.id, product: "advisor_base" });

  const today = String(
    (await sb.rpc("rooftop_today", { _rooftop: roof.id })).data
  );
  const period = (
    await sb
      .from("perf_period")
      .insert({
        rooftop_id: roof.id,
        starts_on: `${today.slice(0, 7)}-01`,
        ends_on: addDays(`${today.slice(0, 8)}28`, 14),
      })
      .select("id")
      .single()
  ).data!;

  /* ---- the mindset shelf ----------------------------------------------- */
  const mindsetTitles = [
    "The Standard You Walk Past",
    "Nobody Is Coming To Save Your Morning",
    "Do It Tired",
  ];
  for (const t of mindsetTitles) {
    await sb.from("content").insert({
      type: "advisor_video",
      status: "published",
      collection: "Mindset",
      placement: "daily_lifestyle",
      title: `${TAG} ${t}`,
      duration_sec: 64,
      mux_playback_id: `shot-mind-${randomUUID().slice(0, 6)}`,
      mux_playback_policy: "signed",
      captions_ready: true,
    });
  }

  /* ---- the pitch shelf -------------------------------------------------- */
  const code = "SHOTSRP";
  await sb
    .from("op_code_catalog")
    .insert({ code, name: `${TAG} Serpentine Belt`, category: "Fixture", sort_order: 9000 });
  await sb
    .from("op_code_family")
    .insert({ code, family: FAM, coachable: true, confidence: "ruled", note: `${TAG} fixture` });

  const pitchFilms: string[] = [];
  for (const stage of ["On the Drive", "At the Kiosk"]) {
    const { data } = await sb
      .from("content")
      .insert({
        type: "advisor_video",
        status: "published",
        collection: "Pitches by Op Code",
        title: `${TAG} Serpentine Belt — ${stage}`,
        op_code: code,
        stage,
        duration_sec: 212,
        mux_playback_id: `shot-pitch-${randomUUID().slice(0, 6)}`,
        mux_playback_policy: "signed",
        captions_ready: true,
      })
      .select("id")
      .single();
    pitchFilms.push(data!.id);
  }

  /* ---- the craft track -------------------------------------------------- */
  const core = (
    await sb
      .from("certification")
      .select("id, name")
      .eq("is_core", true)
      .order("sort", { ascending: true })
      .limit(1)
      .single()
  ).data!;
  await sb.from("certification").update({ active: true }).eq("id", core.id);

  const course = (
    await sb
      .from("course")
      .insert({ track: "Foundations", name: `${TAG} The Walk-Around`, slug: `${TAG}-walk` })
      .select("id")
      .single()
  ).data!;
  await sb
    .from("certification_course")
    .insert({ certification_id: core.id, course_id: course.id, sort: 0 });
  const mod = (
    await sb
      .from("module")
      .insert({ course_id: course.id, name: "Opening the conversation", sort_order: 0 })
      .select("id")
      .single()
  ).data!;

  const items = [
    {
      title: "Walk the car before you greet the customer",
      body:
        "Thirty seconds around the vehicle before you say hello changes the whole visit. "
        + "You already know the tyres, the wipers and the glass — so the first thing out of "
        + "your mouth is something you observed, not something you read off a screen.",
    },
    {
      title: "Name what you saw, then stop talking",
      body:
        "“Your front tyres are down to the wear bars.” Then silence. The pause is the "
        + "work — it hands the customer the next move, and what they say next tells you "
        + "exactly which conversation you are actually in.",
    },
    {
      title: "Write it down in front of them",
      body:
        "Noting it on the RO while they watch is what turns an observation into a record. "
        + "It costs four seconds and it is the difference between a suggestion and a finding.",
    },
  ];
  const itemIds: string[] = [];
  for (const [i, it] of items.entries()) {
    const { data } = await sb
      .from("content")
      .insert({
        type: "cue",
        status: "published",
        title: `${TAG} ${it.title}`,
        body: it.body,
        module_id: mod.id,
        module_order: i,
      })
      .select("id")
      .single();
    itemIds.push(data!.id);
  }

  /* ---- the quote pool --------------------------------------------------- */
  for (const q of [
    { body: "Everybody wants to be great until they see the invoice.", voice: "Mitch Hardt" },
    { body: "The job is not to sell. The job is to be believed.", voice: "Mitch Hardt" },
  ]) {
    await sb.from("content").insert({
      type: "quote",
      status: "published",
      title: `${TAG} quote`,
      body: q.body,
      voice: q.voice,
      quote_slot: "both",
      coaching_nugget:
        "Use it on the drive when the number lands badly. The price was never the objection.",
    });
  }

  /* ---- the store's book, so the family derives -------------------------- */
  await sb
    .from("service_line")
    .insert({ op_code: "SHOTLINE", category: "Fixture", description: `${TAG} line` });

  async function book(opId: string, total: number, famRos: number, labor: number) {
    await sb.from("advisor_period_total_src").insert({
      period_id: period.id,
      rooftop_id: roof.id,
      advisor_op_id: opId,
      total_ros: total,
      total_labor_sales: labor,
      total_ro_lines: total,
    });
    await sb.from("advisor_op_metric").insert({
      period_id: period.id,
      rooftop_id: roof.id,
      advisor_op_id: opId,
      op_code: "SHOTLINE",
      ros: famRos,
      labor_sales: labor,
      resolved_family: FAM,
    });
  }
  await book("SHOT-STRONG", 120, 96, 11000);

  /* ---- three advisors --------------------------------------------------- */
  async function advisor(kind: string, opId: string | null) {
    const email = `${kind}@shot.test`;
    const { data, error } = await sb.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw new Error(`${email}: ${error.message}`);
    const id = data.user!.id;
    await sb.from("app_user").upsert({ id, full_name: `${TAG} ${kind}` });
    await sb.from("membership").insert({
      user_id: id,
      rooftop_id: roof.id,
      role: "advisor",
      active: true,
      op_code_id: opId,
    });
    /* A streak already running, so the celebration is not day one. */
    await sb.from("swell").upsert(
      {
        user_id: id,
        current_len: 6,
        longest_len: 9,
        last_completed_on: addDays(today, -1),
        paddle_out_available: 1,
      },
      { onConflict: "user_id" }
    );
    return { id, email };
  }

  const normal = await advisor("normal", "SHOT-A");
  await book("SHOT-A", 210, 42, 4200);

  const twoslot = await advisor("twoslot", "SHOT-B");
  await book("SHOT-B", 210, 42, 4200);
  /* B has watched every film in the family — that is what makes it two-slot. */
  for (const f of pitchFilms) {
    await sb.from("content_progress").insert({
      user_id: twoslot.id,
      rooftop_id: roof.id,
      content_id: f,
      watched_pct: 100,
      completed_at: new Date().toISOString(),
      source: "loop",
    });
  }

  const entry = await advisor("entry", "SHOT-C");
  await book("SHOT-C", 210, 42, 4200);
  /*
   * THE ONE UPDATE THAT MAKES ENTRY MORNINGS EXIST.
   *
   * No code changes for this. The loop reads the column every morning and
   * branches on null; setting it is the whole of Mitch's ruling.
   */
  const { data: entryFilm } = await sb
    .from("content")
    .insert({
      type: "advisor_video",
      status: "published",
      collection: "Craft",
      placement: "daily_lifestyle",
      title: `${TAG} The Walk-Around, start here`,
      duration_sec: 188,
      mux_playback_id: `shot-entry-${randomUUID().slice(0, 6)}`,
      mux_playback_policy: "signed",
      captions_ready: true,
    })
    .select("id")
    .single();
  await sb
    .from("certification")
    .update({ entry_film_content_id: entryFilm!.id })
    .eq("id", core.id);

  /* A and B are already mid-track, so only C is entering one. */
  for (const u of [normal.id, twoslot.id]) {
    await sb.from("advisor_track_entry").insert({
      user_id: u,
      certification_id: core.id,
      rooftop_id: roof.id,
    });
  }

  console.log(`\n  rooftop      ${roof.id}`);
  console.log(`  store today  ${today}`);
  console.log(`  password     ${PASSWORD}\n`);
  for (const a of [normal, twoslot, entry]) console.log(`  ${a.email}`);
  console.log(
    `\n  entry film attached to "${core.name}" — LOCAL ONLY, production stays null.\n`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
