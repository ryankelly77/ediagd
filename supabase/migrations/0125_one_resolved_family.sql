-- ============================================================================
-- EDIAGD — 0125 One resolved family
--
-- Phase 3c, first half. "What content belongs to service family F" is asked in
-- five places in this codebase and answered five different ways. This makes it
-- one answer that every caller reads.
--
-- ---------------------------------------------------------------------------
-- THE FIVE ANSWERS, AND WHAT EACH ONE RETURNS FOR BELTS & COOLING TODAY
-- ---------------------------------------------------------------------------
--   recompute_certification_content()  451   direct OR op code, upper/btrim
--   accrueService()                    451   same intent, ilike, separate query
--   family_pitch_supply (0123)          12   coachable op codes, playable films
--   pickPitch() (0124)                  12   the same rule, written again in TS
--   listCuesForServices()              439   CUES ONLY, service_family ONLY
--
-- The last one is the advisor's own screen, and it is the one that is wrong.
-- 52 published films are reachable for a family through op_code_family and
-- invisible on every member-facing surface — so the pitch slot serves an
-- advisor a Belts & Cooling film in the morning, and the Belts & Cooling dialog
-- on their numbers screen shows a "Soon" badge over an empty video tab.
--
-- That has been true since the films were imported. 3b made it visible by
-- putting one of those films in front of the advisor every morning.
--
-- ---------------------------------------------------------------------------
-- MEASURED, NOT ASSUMED
-- ---------------------------------------------------------------------------
-- Against production, 2026-09-19:
--
--   family-reachable published live content   1,607   (1,555 cues + 52 films)
--   visible on the advisor's service list     1,555
--   hidden                                       52   — every one of them a film
--
--   content carrying an op code                 766
--     resolving through op_code_family exactly  766   (0 need trim/upper today)
--     on a NON-coachable code                     0
--
-- So the normalisation below is insurance rather than a repair, and the
-- coachable/not distinction is real in the schema and empty in the data. Both
-- are kept, and both are kept for stated reasons rather than by habit.
-- ============================================================================


-- ============================================================================
-- 1. THE ONE RESOLUTION
-- ============================================================================
/*
 * (family, content_id) AND NOTHING ELSE, AND THAT IS THE SECURITY DESIGN.
 *
 * This view has to be SECURITY DEFINER, because it joins op_code_family, which
 * 0081 narrowed to platform owner or admin. A security-invoker view over it
 * returns ZERO ROWS AND NO ERROR to an advisor — the exact fault 3b found in
 * family_pitch_supply and 0124 §5b corrected.
 *
 * Definer would normally mean "this view decides what you may see", which is
 * precisely what must NOT happen to entitlement-gated content. So the view
 * carries no content columns: no title, no body, no playback id, no status.
 * It is a MAPPING — this row belongs to that family — and callers join the ids
 * back to `content` through the VIEWER'S OWN client, where
 * content_entitled_read still decides. An advisor whose rooftop never bought
 * the product gets ids that resolve to nothing.
 *
 * What a definer read does expose is the shape of the library: that some row
 * belongs to Belts & Cooling. That is not the op-code vocabulary 0081 was
 * protecting — no code appears in the output — and it is the same fact the
 * certification catalogue already publishes as a count.
 */
create or replace view service_family_content as

/* ---- the row carries the family itself ---------------------------------- */
select
  c.service_family                              as family,
  c.id                                          as content_id,
  'family_tag'::text                            as via,
  /*
   * A DIRECTLY TAGGED ROW IS COACHABLE BY DEFINITION.
   *
   * `coachable` is a property of an OP CODE — 0066 set it false for the eleven
   * MNU-* bundles and for MPI-061, because there is no menu attach rate to be
   * below benchmark on. A row tagged `service_family = 'Brake Service'` by hand
   * was tagged for coaching; there is no bundle to exclude. Saying `true` here
   * is that statement, not a default.
   */
  true                                          as coachable
from content c
where c.service_family is not null

union

/* ---- the row carries an op code that the human ruling maps to a family --- */
select
  f.family,
  c.id,
  'op_code'::text,
  f.coachable
from content c
join op_code_family f
  /*
   * upper(btrim(...)) ON BOTH SIDES, copied from
   * recompute_certification_content() rather than reinvented. Zero rows need it
   * today — every one of the 766 op-coded rows matches exactly — which makes it
   * insurance against an import that arrives with a trailing space, not a
   * repair. Cheap insurance: the alternative is a family that silently loses
   * content and looks like a content gap.
   */
  on upper(btrim(f.code)) = upper(btrim(c.op_code))
where c.op_code is not null
  /* A retired mapping is a ruling that was withdrawn. It must stop resolving,
     or a family keeps content somebody decided it should not have. */
  and f.retired_at is null;

/*
 * UNION, NOT UNION ALL. A row can satisfy both arms — 439 of Belts & Cooling's
 * cues carry the family tag AND an op code that maps to it — and counting it
 * twice is not hypothetical: 0116 records that exact double count letting a
 * 3-item track clear a 5-item bar.
 *
 * The two arms can still both appear for one content id when they disagree
 * about `via`/`coachable`, which is deliberate: `select distinct content_id`
 * is the membership question and the full rows are the diagnostic one.
 */

alter view service_family_content set (security_invoker = off);

comment on view service_family_content is
  'THE resolution of service family -> content. Both paths: the service_family '
  'column and the op_code_family ruling. Mapping only — no content columns — so '
  'callers join the ids back to `content` through the viewer''s own client and '
  'content_entitled_read still decides. Definer because op_code_family is '
  'admin-scoped (0081). See 0125.';

/*
 * Granted to authenticated, unlike family_pitch_supply. The difference is the
 * one the header draws: that view leaks nothing useful because it is a COUNT an
 * advisor cannot scope, and 0124 §5b revoked it rather than pretend. This one
 * is a mapping the advisor's own screens need, and it carries nothing gated.
 */
grant select on service_family_content to authenticated;

/*
 * The join column on the op-code arm is an expression, so the planner cannot
 * use op_code_family's primary key for it. 76 rows against 766 is nothing
 * today; the index is here so it stays nothing when content grows.
 */
create index if not exists content_op_code_norm_idx
  on content (upper(btrim(op_code))) where op_code is not null;
create index if not exists op_code_family_code_norm_idx
  on op_code_family (upper(btrim(code))) where retired_at is null;


-- ============================================================================
-- 2. THE CUE GATE READS IT — AND STOPS COUNTING RETIRED ROWS
-- ============================================================================
/*
 * service_family_cue_count (0054) decides which families are coachable at all:
 * lib/coachable-families.ts gates a family on having `coaching_block_days`
 * published cues. It had two faults, one live and one waiting.
 *
 *   LIVE   it reads content.service_family directly, so a cue reachable only
 *          through an op code did not count. 2 Brake Service cues, 4 Battery,
 *          2 Tires & Rotation and 1 Differential are in that state.
 *
 *   WAITING it has no `retired_at` filter. Zero published rows are retired
 *          today, so nothing is currently miscounted — stated as a fact rather
 *          than a fix, because a gate that would start lying the first time
 *          somebody retires a cue is still a gate worth correcting now.
 *
 * Still cues only, and deliberately: the gate exists because an advisor locked
 * onto a family for six mornings needs six distinct CUES, and a film does not
 * substitute for one.
 */
create or replace view service_family_cue_count as
select
  sfc.family,
  count(distinct c.id)::int as published_cues
from service_family_content sfc
join content c on c.id = sfc.content_id
where c.type = 'cue'
  and c.status = 'published'
  and c.retired_at is null
group by sfc.family;

alter view service_family_cue_count set (security_invoker = off);
grant select on service_family_cue_count to authenticated;

comment on view service_family_cue_count is
  'Published, live cues per family, resolved BOTH ways through '
  'service_family_content. The coachability gate reads this. Cues only: the '
  'gate is about having six distinct things to say across a block, and a film '
  'is not one of them. See 0125 §2.';


-- ============================================================================
-- 3. THE PITCH SHELF READS IT
-- ============================================================================
/*
 * Same counts as 0123's version — the pitch slot's rule has not changed — but
 * the RESOLUTION is no longer written out a second time. What stays local is
 * what is genuinely pitch-specific:
 *
 *   coachable       a menu bundle has no attach rate to be coached against
 *   playable        a film with no mux_playback_id cannot be served
 *   advisor_video   the pitch slot serves films, not cues
 *
 * Still not granted to authenticated: it is a count an advisor cannot scope,
 * and 0124 §5b says why.
 */
create or replace view family_pitch_supply as
select
  sfc.family,
  count(distinct c.id)::int                                        as film_count,
  count(distinct c.op_code)::int                                   as op_code_count,
  count(distinct c.stage) filter (where c.stage is not null)::int  as stage_count,
  sum(c.duration_sec)::int                                         as total_sec,
  bool_and(coalesce(c.captions_ready, false))                      as fully_captioned
from service_family_content sfc
join content c on c.id = sfc.content_id
where sfc.via = 'op_code'
  and sfc.coachable
  and c.type = 'advisor_video'
  and c.status = 'published'
  and c.retired_at is null
  and c.mux_playback_id is not null
group by sfc.family;

alter view family_pitch_supply set (security_invoker = off);
revoke select on family_pitch_supply from authenticated;

comment on view family_pitch_supply is
  'Published pitch films per family, resolved through service_family_content '
  '(0125). SERVER-SIDE ONLY — not granted to authenticated; see 0124 §5b. The '
  'coachable and playable filters are pitch-specific and stay here; the family '
  'resolution does not.';


-- ============================================================================
-- 4. THE CERTIFICATION CATALOGUE READS IT
-- ============================================================================
/*
 * The service branch was the ORIGINAL two-way resolution — 0116 wrote it and
 * called it "the same two-way resolution the catalogue uses", which was true of
 * exactly one other caller. It is now genuinely one.
 *
 * The count is unchanged for every family (checked: the view reproduces the old
 * predicate row for row), so no certification gains or loses items by this
 * migration. Only where the rule LIVES changes.
 *
 * Everything else in this function is 0116's, verbatim, including the
 * `where c.id is not null` whose absence would make it throw for every
 * PostgREST caller.
 */
create or replace function recompute_certification_content()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  _bar int;
begin
  select coalesce(certification_min_items, 0) into _bar from game_settings limit 1;
  _bar := coalesce(_bar, 0);

  update certification c
     set item_count = (
           select count(*)::int
             from certification_course cc
             join module m  on m.course_id = cc.course_id
             join content ct on ct.module_id = m.id
            where cc.certification_id = c.id
              and ct.status = 'published'
         ),
         updated_at = now()
   where c.kind = 'craft';

  /* SERVICE: one resolution, read rather than restated. count(DISTINCT) still,
     because a row reachable both ways must not be counted twice — 0116's note
     about a 3-item track clearing a 5-item bar. */
  update certification c
     set item_count = (
           select count(distinct sfc.content_id)::int
             from service_family_content sfc
             join content ct on ct.id = sfc.content_id
            where sfc.family = c.service_family
              and ct.status = 'published'
         ),
         updated_at = now()
   where c.kind = 'service';

  update certification c
     set active = (c.item_count > 0 and c.item_count >= _bar),
         updated_at = now()
   where c.id is not null;
end $$;

revoke all on function recompute_certification_content() from public, anon, authenticated;

/*
 * Re-run it, so the catalogue is computed by the new definition the moment this
 * lands rather than at the next content edit. Expected to change nothing —
 * which is the point, and which accept:family asserts by comparing the counts
 * either side.
 */
select recompute_certification_content();


-- ============================================================================
-- 5. WHAT AN ADVISOR HAS LEFT IN A FAMILY
-- ============================================================================
/*
 * The card's question, answered in one place: for THIS advisor and THIS family,
 * how many films are there and how many are done.
 *
 * ---------------------------------------------------------------------------
 * A FUNCTION, NOT A VIEW, BECAUSE IT IS PER-ADVISOR
 * ---------------------------------------------------------------------------
 * A view would have to either take auth.uid() — and then be unusable from the
 * service role, which is the 0123 §0 trap — or be joined to content_progress by
 * every caller, which is the restatement this whole migration removes.
 *
 * SECURITY DEFINER with an explicit user argument, granted to nobody: the loop
 * and the card both run server-side and both already hold the service client.
 * An advisor cannot call it for somebody else because they cannot call it.
 *
 * ENTITLEMENT IS NOT CHECKED HERE, and that is deliberate rather than an
 * omission: this counts the SHELF, and the shelf is a fact about the library.
 * What an advisor may PLAY is decided when the film is fetched, through their
 * own client, by content_entitled_read. A card that said "3 of 7" while the
 * rooftop owned none of them would be wrong — but a rooftop that owns no
 * advisor_base has no focus family either, because the loop never derived one.
 */
create or replace function advisor_family_film_progress(
  _user   uuid,
  _family text
)
returns table (
  total     int,
  completed int,
  next_id   uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with films as (
    select c.id, c.op_code, c.stage
      from service_family_content sfc
      join content c on c.id = sfc.content_id
     where sfc.family = _family
       and sfc.via = 'op_code'
       and sfc.coachable
       and c.type = 'advisor_video'
       and c.status = 'published'
       and c.retired_at is null
       and c.mux_playback_id is not null
  ),
  done as (
    select f.id
      from films f
      join content_progress cp
        on cp.content_id = f.id
       and cp.user_id = _user
       and cp.completed_at is not null
  )
  select
    (select count(*)::int from films),
    (select count(*)::int from done),
    /*
     * DECK ORDER — op code, then the stage the pitch is taught in. The same
     * order lib/loop.ts serves them in, because the card and the loop must
     * agree about which film is next or "continue" hands the advisor a
     * different film from the one tomorrow's morning will.
     */
    (select f.id
       from films f
      where f.id not in (select id from done)
      order by f.op_code,
               array_position(
                 array['Pre-Write','On the Drive','At the Kiosk',
                       'MPI Setup','After-MPI','Objections'], f.stage),
               f.id
      limit 1)
$$;

comment on function advisor_family_film_progress(uuid, text) is
  'For one advisor and one family: how many pitch films exist, how many are '
  'completed, and which is next in deck order. The /today card and the loop '
  'read the same answer. Definer, no grants — server-side callers only. '
  'Counts the shelf; what may be PLAYED is decided by content_entitled_read '
  'when the film is fetched. See 0125 §5.';

revoke all on function advisor_family_film_progress(uuid, text) from public;
revoke all on function advisor_family_film_progress(uuid, text) from anon, authenticated;


notify pgrst, 'reload schema';
