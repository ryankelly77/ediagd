/* ============================================================================
   EDIAGD — the two screens of Valerie Patterson's 10 November report

   Leaves behind one signed-in-able advisor who is looking at exactly the state
   she described, so both fixes can be photographed:

     1  A MODULE whose film is watched, whose cues are UNMARKED, and which has
        published quiz questions. Before the fix the deck's last card said
        "Quiz is waiting — N items still to finish" and offered no button, while
        the quiz route would have served the quiz. After it, "Start the quiz".

     2  A TRACK with a ruled entry film the advisor has not watched. Before the
        fix the entry-film row was a card with a ▶ glyph and no link. After it,
        it is a link to /certifications/<slug>/opener.

   LOCAL ONLY. IT WRITES.
     export SB_URL=http://127.0.0.1:55321 SB_KEY=<local service role>
     npm run fixture:valerie

   ---------------------------------------------------------------------------
   TAKE EVERY ERROR, AND PRINT WHAT WAS WRITTEN RATHER THAN WHAT WAS INTENDED
   ---------------------------------------------------------------------------
   story-screenshot-fixture records the lesson: its first version reported
   "3 of 3 done" while content_progress had rejected every row for a missing
   rooftop_id. A fixture that announces a state it failed to create is the same
   defect as the code it exists to photograph. So every insert is checked, and
   the summary at the end is READ BACK from the database rather than assembled
   from what this script meant to do.
============================================================================ */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const URL = process.env.SB_URL!;
const KEY = process.env.SB_KEY!;
if (!URL || !KEY) {
  console.error("\n  need SB_URL and SB_KEY\n");
  process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(URL)) {
  console.error(`REFUSING to run against ${URL} — this fixture writes. Local only.`);
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });
const TAG = "valerie-shot";
const PASSWORD = "Fixture-passw0rd!";

function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  if (r.data == null) throw new Error(`${what}: no row came back`);
  return r.data;
}

async function wipe() {
  /* IDEMPOTENT, so the fixture can be re-run while iterating on the screens.
     Users are found by the tagged EMAIL, never by name. */
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 1000 });
  for (const u of users?.users ?? []) {
    if (!u.email?.startsWith(TAG)) continue;
    await sb.from("content_progress").delete().eq("user_id", u.id);
    await sb.from("module_completion").delete().eq("user_id", u.id);
    await sb.from("quiz_attempt").delete().eq("user_id", u.id);
    await sb.from("app_event").delete().eq("user_id", u.id);
    await sb.from("advisor_track_entry").delete().eq("user_id", u.id);
    await sb.from("membership").delete().eq("user_id", u.id);
    await sb.from("app_user").delete().eq("id", u.id);
    await sb.auth.admin.deleteUser(u.id);
  }
  const { data: courses } = await sb.from("course").select("id").like("slug", `${TAG}%`);
  for (const c of (courses ?? []) as any[]) {
    const { data: mods } = await sb.from("module").select("id").eq("course_id", c.id);
    for (const m of (mods ?? []) as any[]) {
      await sb.from("quiz_question").delete().eq("module_id", m.id);
      await sb.from("content").delete().eq("module_id", m.id);
    }
    await sb.from("certification_course").delete().eq("course_id", c.id);
    await sb.from("module").delete().eq("course_id", c.id);
    await sb.from("course").delete().eq("id", c.id);
  }
  await sb.from("content").delete().like("title", `${TAG}%`);
  await sb.from("certification").delete().like("slug", `${TAG}%`);
  const { data: roofs } = await sb.from("rooftop").select("id").like("name", `${TAG}%`);
  for (const r of (roofs ?? []) as any[]) {
    await sb.from("rooftop_product").delete().eq("rooftop_id", r.id);
    await sb.from("rooftop").delete().eq("id", r.id);
  }
  await sb.from("org").delete().like("name", `${TAG}%`);
}

async function main() {
  await wipe();

  /* ---- A store ---------------------------------------------------------- */
  const org = must(
    await sb.from("org").insert({ name: `${TAG} Org` }).select("id").single(),
    "org"
  ) as any;
  const roof = must(
    await sb
      .from("rooftop")
      .insert({ name: `${TAG} Ford`, org_id: org.id, timezone: "America/Chicago" })
      .select("id")
      .single(),
    "rooftop"
  ) as any;
  must(
    await sb
      .from("rooftop_product")
      .insert({ rooftop_id: roof.id, product: "advisor_base" })
      .select("rooftop_id")
      .single(),
    "rooftop_product"
  );

  /* ---- The track, with an entry film nobody has watched ----------------- */
  /*
   * A REAL PLAYBACK ID SHAPE AND A SIGNED POLICY, because loadTrackDetail now
   * reads mux_playback_id to decide whether the row is a LINK. A null here
   * would photograph the not-yet-uploaded state instead, which is a different
   * screen and would look like the bug.
   */
  const opener = must(
    await sb
      .from("content")
      .insert({
        type: "advisor_video",
        status: "published",
        title: `${TAG} The Name Tag`,
        duration_sec: 180,
        mux_playback_id: `fx-${randomUUID().slice(0, 8)}`,
        mux_playback_policy: "signed",
        captions_ready: true,
      })
      .select("id")
      .single(),
    "opener film"
  ) as any;

  const cert = must(
    await sb
      .from("certification")
      .insert({
        slug: `${TAG}-name-tag`,
        name: "Name Tag",
        kind: "craft",
        is_core: true,
        active: true,
        glyph_key: "craft_walk_around",
        sort: 1,
        entry_film_content_id: opener.id,
      })
      .select("id, slug")
      .single(),
    "certification"
  ) as any;

  const course = must(
    await sb
      .from("course")
      .insert({
        name: `${TAG} Course`,
        slug: `${TAG}-course`,
        track: "craft",
        sort_order: 1,
      })
      .select("id")
      .single(),
    "course"
  ) as any;
  must(
    await sb
      .from("certification_course")
      .insert({ certification_id: cert.id, course_id: course.id, sort: 0 })
      .select("course_id")
      .single(),
    "certification_course"
  );

  /* ---- The module: one film, three cues, a published quiz --------------- */
  const mod = must(
    await sb
      .from("module")
      .insert({ course_id: course.id, name: "Name Tag Part 1", sort_order: 1 })
      .select("id")
      .single(),
    "module"
  ) as any;

  const film = must(
    await sb
      .from("content")
      .insert({
        type: "advisor_video",
        status: "published",
        title: `${TAG} Wearing it where they can read it`,
        short_title: "Wearing it",
        duration_sec: 240,
        module_id: mod.id,
        module_order: 0,
        mux_playback_id: `fx-${randomUUID().slice(0, 8)}`,
        mux_playback_policy: "signed",
        captions_ready: true,
      })
      .select("id")
      .single(),
    "lesson film"
  ) as any;

  const cueIds: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const cue = must(
      await sb
        .from("content")
        .insert({
          type: "cue",
          status: "published",
          title: `${TAG} cue ${i}`,
          body:
            `Reinforcement card ${i}. These are worth reading and they pay — ` +
            `and since 10 November they do not hold the quiz up.`,
          module_id: mod.id,
          module_order: i,
        })
        .select("id")
        .single(),
      `cue ${i}`
    ) as any;
    cueIds.push(cue.id);
  }

  /* TWO PUBLISHED QUESTIONS. has_quiz reads published only, so a draft bank
     would photograph a module with no quiz at all. */
  for (let i = 1; i <= 2; i++) {
    must(
      await sb
        .from("quiz_question")
        .insert({
          module_id: mod.id,
          question: `Where should the name tag sit? (${i})`,
          option_a: "Where the customer can read it",
          option_b: "In a pocket",
          option_c: "On the clipboard",
          option_d: "Nowhere in particular",
          correct: "a",
          explanation: "They need to be able to say your name back to you.",
          sort_order: i,
          status: "published",
        })
        .select("id")
        .single(),
      `quiz question ${i}`
    );
  }

  /* ---- The advisor ------------------------------------------------------ */
  const email = `${TAG}-${randomUUID().slice(0, 4)}@example.com`;
  const u = await sb.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (u.error) throw new Error(`createUser: ${u.error.message}`);
  const uid = u.data.user!.id;

  /* A NAME NOTHING ELSE USES, and the id printed below. Names collide; the
     standing rule is ids only, and this fixture is not going to be the thing
     that looks somebody up by "Valerie Patterson" and finds the real one. */
  must(
    await sb
      .from("app_user")
      .upsert({ id: uid, full_name: `${TAG} Advisor` })
      .select("id")
      .single(),
    "app_user"
  );
  must(
    await sb
      .from("membership")
      .insert({ user_id: uid, rooftop_id: roof.id, role: "advisor", active: true })
      .select("id")
      .single(),
    "membership"
  );

  /* ---- THE STATE: the film watched, the cues untouched ------------------ */
  /*
   * Written the way completeLibraryItem writes it — completed_at set, source
   * 'library' — because that is the row the real surface leaves. A fixture that
   * invented its own shape would photograph a state the product cannot reach.
   *
   * THE CUES GET NO ROW AT ALL. That is the whole point of the screenshot.
   */
  must(
    await sb
      .from("content_progress")
      .insert({
        user_id: uid,
        rooftop_id: roof.id,
        content_id: film.id,
        watched_pct: 100,
        completed_at: new Date().toISOString(),
        source: "library",
      })
      .select("content_id")
      .single(),
    "content_progress for the film"
  );

  /* ---- READ IT BACK, AS THE ADVISOR ------------------------------------- */
  /*
   * my_module_progress is auth.uid()-scoped, so a service-role read of it is
   * nobody's progress. The summary below has to be the view the SCREEN will
   * see, or it is a claim about the fixture rather than a measurement of it.
   */
  const anonKey = process.env.SB_ANON_KEY;
  let viewLine = "  (set SB_ANON_KEY to have this read back as the advisor)";
  if (anonKey) {
    const asAdvisor = createClient(URL, anonKey, { auth: { persistSession: false } });
    const { error: sErr } = await asAdvisor.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });
    if (sErr) throw new Error(`signIn: ${sErr.message}`);
    const { data: row, error: vErr } = await asAdvisor
      .from("my_module_progress")
      .select(
        "total_items, completed_items, cue_items, items_done, has_quiz, quiz_passed, completed_at"
      )
      .eq("module_id", mod.id)
      .maybeSingle();
    if (vErr) throw new Error(`my_module_progress: ${vErr.message}`);
    if (!row) throw new Error("my_module_progress returned no row for the advisor");
    const r = row as any;
    viewLine =
      `  my_module_progress AS THE ADVISOR:\n` +
      `    total_items=${r.total_items} completed_items=${r.completed_items} ` +
      `cue_items=${r.cue_items}\n` +
      `    items_done=${r.items_done}  has_quiz=${r.has_quiz}  ` +
      `quiz_passed=${r.quiz_passed}  completed_at=${r.completed_at ?? "NULL"}\n` +
      `    → the quiz route serves the quiz: ${r.items_done ? "YES" : "NO"}`;
    if (!r.items_done) {
      throw new Error(
        "items_done is FALSE — the fixture did not create the state it exists to " +
          "photograph, and the screenshot would show the wrong thing."
      );
    }
    /* The three cues must be UNMARKED, or the screenshot proves nothing: a deck
       with every cue done says "Start the quiz" under the OLD predicate too. */
    const { count: doneCues } = await asAdvisor
      .from("content_progress")
      .select("content_id", { count: "exact", head: true })
      .in("content_id", cueIds)
      .not("completed_at", "is", null);
    if (Number(doneCues ?? 0) !== 0) {
      throw new Error(
        `${doneCues} cue(s) are marked done — the old predicate would have ` +
          `passed too, so this would photograph nothing.`
      );
    }
    viewLine += `\n    → cues marked done: 0 of ${cueIds.length} (this is what makes the shot a proof)`;
  }

  console.log(`
  ${TAG} is ready.

  Sign in
    ${email}
    ${PASSWORD}

  Ids (never names)
    user        ${uid}
    rooftop     ${roof.id}
    module      ${mod.id}
    track slug  ${cert.slug}

  The two screens
    1  http://localhost:3000/library/m/${mod.id}
       Swipe to the last card. It must say "The quiz is open" with a
       "Start the quiz" button, with three cues still unmarked.
    2  http://localhost:3000/certifications/${cert.slug}
       The entry film row must be a LINK reading "Entry film · watch it now".
       It goes to /certifications/${cert.slug}/opener.

${viewLine}
`);
}

main().catch((e) => {
  console.error("\n ", e instanceof Error ? e.message : e, "\n");
  process.exit(1);
});
