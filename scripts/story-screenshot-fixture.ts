/* ============================================================================
   EDIAGD — a track at 100% of modules with the story outstanding

   The one screen 3e Ruling 5 exists to prevent going wrong: an advisor who has
   finished every module and every quiz of a track, and whose track is still not
   earned, because the Good News Story is not written.

   Leaves behind one signed-in-able advisor at one rooftop with exactly that
   state, so the certifications wall can be photographed.

   LOCAL ONLY. IT WRITES.
     export SB_URL=http://127.0.0.1:55321 SB_KEY=<local service role>
     npm run fixture:story
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
  console.error(`REFUSING to run against ${URL} — this fixture writes. Local only.`);
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });
const TAG = `story-shot`;
const PASSWORD = "Fixture-passw0rd!";

async function main() {
  /* ---- A store ---------------------------------------------------------- */
  const { data: org } = await sb
    .from("org")
    .insert({ name: `${TAG} Org` })
    .select("id")
    .single();
  const { data: roof } = await sb
    .from("rooftop")
    .insert({ name: `${TAG} Motors`, org_id: org!.id, timezone: "America/Chicago" })
    .select("id")
    .single();
  await sb.from("rooftop_product").insert({ rooftop_id: roof!.id, product: "advisor_base" });

  /* ---- A track with one course and one module --------------------------- */
  const { data: cert } = await sb
    .from("certification")
    .insert({
      slug: `${TAG}-track`,
      name: "Tyres on the Drive",
      kind: "craft",
      is_core: true,
      active: true,
      glyph_key: "craft_walk_around",
      sort: 1,
    })
    .select("id")
    .single();

  const { data: course } = await sb
    .from("course")
    .insert({ name: `${TAG} Course`, slug: `${TAG}-course`, track: "craft", sort_order: 1 })
    .select("id")
    .single();
  await sb
    .from("certification_course")
    .insert({ certification_id: cert!.id, course_id: course!.id });

  const { data: mod } = await sb
    .from("module")
    .insert({ course_id: course!.id, name: `${TAG} Module`, sort_order: 1 })
    .select("id")
    .single();

  /* Three items, all of which the advisor will complete. */
  const itemIds: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const { data: item } = await sb
      .from("content")
      .insert({
        type: "cue",
        status: "published",
        title: `${TAG} item ${i}`,
        body: `Something to know, number ${i}.`,
        module_id: mod!.id,
        module_order: i,
      })
      .select("id")
      .single();
    itemIds.push(item!.id as string);
  }

  /* ---- The advisor ------------------------------------------------------ */
  const email = `${TAG}-${randomUUID().slice(0, 4)}@example.com`;
  const { data: u, error: uErr } = await sb.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (uErr) throw new Error(uErr.message);
  const uid = u.user!.id;
  await sb.from("app_user").upsert({ id: uid, full_name: "Dana Whitfield" });
  await sb
    .from("membership")
    .insert({ user_id: uid, rooftop_id: roof!.id, role: "advisor", active: true });

  /* ---- Every item done, and the module marked complete ------------------ */
  /*
   * TAKE THE ERRORS. The first version of this fixture did not, and printed
   * "3 of 3 done · 1 of 1 complete" while content_progress rejected every row
   * for a missing rooftop_id. A fixture that reports a state it failed to
   * create is the same defect as the code it exists to photograph.
   */
  for (const id of itemIds) {
    const { error } = await sb.from("content_progress").insert({
      user_id: uid,
      rooftop_id: roof!.id,
      content_id: id,
      completed_at: new Date().toISOString(),
      source: "loop",
    });
    if (error) throw new Error(`content_progress: ${error.message}`);
  }
  const { error: mcErr } = await sb
    .from("module_completion")
    .insert({ user_id: uid, module_id: mod!.id, completed_at: new Date().toISOString() });
  if (mcErr) throw new Error(`module_completion: ${mcErr.message}`);

  /*
   * item_count IS A DENORMALISED COLUMN maintained by
   * recompute_certification_content(). The certifications wall reads it for the
   * denominator, and without it the tile renders "0 of 0 items" and never
   * reaches the branch this fixture exists to photograph. Set directly rather
   * than recomputing the whole catalogue for one fixture track.
   */
  await sb.from("certification").update({ item_count: itemIds.length }).eq("id", cert!.id);

  /*
   * AND NO STORY. That is the whole point of the fixture — the advisor is at
   * 100% of items and 100% of modules, and the track is still not earned.
   */

  const { data: settings } = await sb
    .from("game_settings")
    .select("story_required")
    .limit(1)
    .maybeSingle();

  console.log(`\n  rooftop        ${roof!.id}`);
  console.log(`  certification  ${cert!.id}  "Tyres on the Drive"`);
  console.log(`  story_required ${settings?.story_required}`);
  console.log(`  items          ${itemIds.length} of ${itemIds.length} done`);
  console.log(`  modules        1 of 1 complete`);
  console.log(`  stories        none  <-- the track is NOT earned`);
  console.log(`\n  sign in at /login as`);
  console.log(`    ${email}`);
  console.log(`    ${PASSWORD}`);
  console.log(`\n  then open /certifications\n`);
}

main().catch((e) => {
  console.error("\nFIXTURE ERROR:", e.message);
  process.exit(1);
});
