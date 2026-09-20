-- ============================================================================
-- EDIAGD — 0124 The loop spends the spine
--
-- Phase 3b of PHASE_3_PLAN.md. 0123 built the assignment, the supply gate and
-- the track-entry row; nothing read them. This is what reads them.
--
--   Track-entry morning   mindset -> track film              -> done
--   Every other morning   mindset -> pitch      -> item      -> done
--
-- Six things land:
--
--   1  daily_completion learns the new shape: which morning it was, which item
--      was served, which track was entered.
--   2  the coaching block is RETIRED FROM THE LOOP. Nothing opens a new one
--      and nothing reads one. The rows already open are left ALONE — see §2
--      for why the statement that closed them was removed before this shipped.
--   3  advisor_pool_seen — the two draws that need real recency (ruling 5).
--   4  derive_focus_family stops re-picking a family whose films are all
--      consumed, which 0123 did not handle and which the cycle now depends on —
--      and gains the coaching floor eddiesPick() has always had, which 0123
--      omitted and which 42% of measured operators fall below.
--   5  impact_coaching learns the op-code bridge, or the ROI figure a dealer
--      principal reads silently goes to zero.
--   6  the entry film gets a pointer that stays null until Mitch rules.
--
-- WHAT DOES NOT LAND: anything for the Good News Story. Still PROPOSED, NOT
-- DECIDED. No column, no flag, no table. The gate in lib/gamification/dayGate.ts
-- is a list of legs so that adding one later is one entry — that is the whole
-- preparation, and it is free.
-- ============================================================================


-- ============================================================================
-- 1. WHAT A MORNING RECORDS
-- ============================================================================
/*
 * THREE NEW COLUMNS, AND ONE OF THEM IS NOT A RENAME.
 *
 * `cue_content_id` is NOT reused for the item, and `video_content_id` IS reused
 * for the mindset film. The difference is whether the meaning survived:
 *
 *   video_content_id  held the lifestyle film drawn from the Mindset shelf. It
 *                     still holds the film drawn from the Mindset shelf. Only
 *                     its POSITION in the morning changed — last to first —
 *                     and a column does not care what order it was served in.
 *
 *   cue_content_id    held a cue chosen by the four-rung family ladder: "the
 *                     coaching this advisor needed on the family they are weak
 *                     on". The item slot serves the next item in their craft
 *                     curriculum. Same table, completely different claim. 3,038
 *                     historical rows joined to content.service_family to prove
 *                     coaching coverage; writing craft items into that column
 *                     would make every one of those rows mean two things.
 *
 * So the item gets its own column and cue_content_id stops being written. It is
 * not dropped: retire, never delete, and impact_coaching still reads it for
 * every day served before this migration.
 */
alter table daily_completion
  add column if not exists item_content_id uuid references content(id) on delete set null,
  /*
   * WHICH MORNING THIS WAS. Recorded, not inferred.
   *
   * "pitch is null" does not distinguish a two-slot morning (the focus family
   * ran out of film) from a track-entry morning (the pitch slot was never
   * offered) from an advisor with no DMS history at all. Those are three
   * different facts about the product and the first two are the ones that say
   * whether the library is keeping up.
   */
  add column if not exists morning_kind text,
  /*
   * The track this morning ENTERED, when it entered one. Null on an ordinary
   * morning. Separate from advisor_track_entry — that table answers "has this
   * advisor started track T", this column answers "which morning did it".
   */
  add column if not exists entered_certification_id uuid
    references certification(id) on delete set null;

alter table daily_completion drop constraint if exists daily_completion_morning_kind_valid;
alter table daily_completion add constraint daily_completion_morning_kind_valid
  check (morning_kind is null or morning_kind in ('normal', 'two_slot', 'track_entry'));

comment on column daily_completion.morning_kind is
  'normal (mindset+pitch+item) | two_slot (focus family out of film) | '
  'track_entry (mindset + the track film). Null on every row written before '
  '0124 — which is honest: the old loop had one shape and did not record it.';

comment on column daily_completion.item_content_id is
  'The item slot. Deliberately NOT cue_content_id — see 0124 §1.';

create index if not exists daily_completion_morning_kind_idx
  on daily_completion (morning_kind) where morning_kind is not null;


-- ============================================================================
-- 2. THE COACHING BLOCK LEAVES THE LOOP
-- ============================================================================
/*
 * TWO THINGS CANNOT BOTH OWN THE OP CODE, AND UNTIL NOW TWO THINGS DID.
 *
 * `coaching_block` locks a family, picks an op code inside it, and walks six
 * stages with a cursor counted from completions. `advisor_focus_family` (0123)
 * locks a family and the pitch slot walks its films until they are consumed.
 * Those are two different answers to "what is this advisor working on", and
 * 3a's report flagged that 3b would have to say which one wins.
 *
 * The focus family wins, because it is the one the architecture is built on:
 * the cycle is supply-shaped, the card in 3c reads it, and the service
 * credential accrues through it.
 *
 * ---------------------------------------------------------------------------
 * THIS MIGRATION DOES NOT CLOSE THE OPEN BLOCKS, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------
 * An earlier draft ended every open block here:
 *
 *     update coaching_block set ended_on = current_date where ended_on is null;
 *
 * The justification written next to it was that completeDay asserts the day's
 * stamp and the open block agree, so an advisor with a block still open could
 * not complete a morning served by the new loop.
 *
 * THAT JUSTIFICATION WAS FALSE BY THE TIME IT WAS WRITTEN. The assertion it
 * cited — and the readOpenBlock() call behind it — were removed from
 * completeDay in the same phase. The new engine never reads coaching_block at
 * all; it writes block_id null. Correct SQL, for a reason that had stopped
 * being true. Caught only by being asked to say what actually breaks.
 *
 * What the UPDATE would really have done, measured on production first:
 *
 *   - Two blocks were open. One belongs to the only person actively using the
 *     app, mid-block at 2 of 6 on Belts & Cooling.
 *   - Between this migration and the deploy, the OLD engine is still serving.
 *     Closing his block makes it open a REPLACEMENT on the next render — his
 *     stage cursor resets to 1 and his family moves to that day's Eddie's Pick.
 *   - So the only user-visible effect of the statement was to disturb, early
 *     and badly, the one thing the deploy retires cleanly on its own.
 *
 * ASYMMETRY DECIDED IT. Not closing them is reversible: a tidy-up can close
 * them any time. Closing them is not cleanly reversible — undoing it means
 * re-opening a closed block and deleting the replacement the old code made, on
 * a real advisor's history.
 *
 * The blocks go vestigial at deploy regardless. They are left alone here, and
 * closing them is PHASE_3_PLAN.md follow-up F1, after the deploy, together with
 * the admin screen that still counts "advisors mid-block".
 *
 * IF YOU ARE READING THIS BECAUSE YOU NOTICED THE BLOCKS ARE STILL OPEN: that
 * is F1, it is known, and it is not a gap in this migration.
 */

comment on table coaching_block is
  'RETIRED FROM THE LOOP by 0124. The pitch slot now reads '
  'advisor_focus_family and walks the family''s films; this table is history '
  'and the source for daily_completion.block_id on rows written before 0124. '
  'Nothing opens a new block.';


-- ============================================================================
-- 3. THE TWO POOLS THAT NEED REAL RECENCY
-- ============================================================================
/*
 * RULING 5, AND WHY ONLY THESE POOLS GET A TABLE.
 *
 *   pitch  walks the focus family's films and skips anything already completed.
 *          Consumption IS the cursor. No new state.
 *   item   walks the module in order and skips anything already completed.
 *          Same. No new state.
 *
 *   mindset  has no sequence to walk and nothing to consume — a mindset film is
 *            watched and then it is simply over. 95 films on a deterministic
 *            epoch-day rotation means an advisor meets the same one every 95
 *            days by arithmetic, and meets it on the same day as everyone else.
 *   quote    the completion-screen line (ruling 6). Gates nothing, counts
 *            towards nothing, and for exactly that reason has no consumption
 *            record either — so it has the same problem as mindset and needs
 *            the same answer.
 *
 * ONE TABLE WITH A `pool` COLUMN, NOT TWO TABLES.
 *
 * The first draft of this was `advisor_mindset_seen`. It was rewritten before
 * shipping because the quote needs byte-for-byte the same mechanism — draw
 * from what is unseen, and when nothing is unseen start a new pass — and two
 * tables with identical shapes drift the first time one is fixed. If a third
 * pool ever needs this it adds a string, not a migration.
 *
 * WHY NOT content_progress. It handles the no-repeat half and not the reshuffle
 * half: unique (user_id, content_id) leaves no room for a second pass, so the
 * 96th morning would have nothing to serve and no way to say the cycle had
 * turned over. Cycles are the whole mechanism. And a quote is not consumption:
 * writing one into the record that certifications accrue from would mean
 * reading a line in passing counted towards a credential.
 */
create table if not exists advisor_pool_seen (
  user_id    uuid not null references app_user(id) on delete cascade,
  /*
   * Which draw this row belongs to. Text with a check rather than an enum, the
   * same call 0066 made for mapping_alias.kind and for the same reason: adding
   * a value must not need ALTER TYPE in a transaction that then inserts with it.
   */
  pool       text not null check (pool in ('mindset', 'quote')),
  content_id uuid not null references content(id) on delete cascade,
  /*
   * WHICH PASS THROUGH THE POOL. Starts at 1, increments when the pool is
   * exhausted. Earlier cycles are KEPT rather than deleted: "how many times has
   * this advisor been all the way round" is what says whether 95 films is
   * enough library, and a DELETE would answer it with silence.
   */
  cycle      int  not null default 1 check (cycle >= 1),
  seen_on    date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (user_id, pool, content_id, cycle)
);

create index if not exists advisor_pool_seen_cycle_idx
  on advisor_pool_seen (user_id, pool, cycle);

comment on table advisor_pool_seen is
  'Which items an advisor has met from a pool that has no consumption record, '
  'and on which pass. Two pools today: mindset films and the completion-screen '
  'quote. The pitch and item slots need no equivalent — content_progress is '
  'already their cursor. See 0124 §3 and TWO_LADDERS ruling 5.';

alter table advisor_pool_seen enable row level security;

drop policy if exists advisor_pool_seen_read on advisor_pool_seen;
create policy advisor_pool_seen_read on advisor_pool_seen
  for select using (
    user_id = (select auth.uid())
    or user_id in (select managed_users())
  );

/*
 * No write policy. The service role writes it at completion, same posture as
 * module_completion (0035) and advisor_track_entry (0123). An advisor who could
 * insert here could mark a film seen without watching it — a small lie, but the
 * kind that makes "how much of the library is actually being used" unreliable,
 * and that number is what decides how much more gets filmed.
 */


-- ============================================================================
-- 4. A FAMILY WHOSE FILMS ARE ALL WATCHED IS NOT A CANDIDATE
-- ============================================================================
/*
 * 0123 SHIPPED A DERIVATION THAT CANNOT END A CYCLE, AND THE CYCLE IS THE
 * PRODUCT.
 *
 * `derive_focus_family` ranks families with a published film and locks the
 * biggest gap. It does not ask whether THIS ADVISOR has already watched them.
 * TWO_LADDERS: "The assignment lasts until its films are consumed, then the
 * next family derives." Under 0123 the next family is the same family — the
 * gap has not moved, so the ranking has not moved — and the advisor gets
 * two-slot mornings forever while a perfectly stocked second family waits.
 *
 * It was not wrong in 3a, because nothing consumed anything yet. It is wrong
 * the moment the loop runs, so it is fixed here rather than worked around in
 * TypeScript, which would put the ranking in two places.
 *
 * Everything else about the function is 0123's, unchanged: the missed-RO sort,
 * the manager-ruling guard, the honest nulls, the WHERE on the close. The only
 * edit is the `and exists (...)` on the candidate query.
 */
create or replace function derive_focus_family(
  _user    uuid,
  _rooftop uuid,
  _period  uuid default null
)
returns advisor_focus_family
language plpgsql
security definer
set search_path = public
as $$
declare
  _op_id   text;
  _period_id uuid;
  _top     record;
  _existing advisor_focus_family;
  _out     advisor_focus_family;
begin
  select m.op_code_id into _op_id
    from membership m
   where m.user_id = _user
     and m.rooftop_id = _rooftop
     and m.active
     and m.role = 'advisor'
     and m.op_code_id is not null
   limit 1;

  if _op_id is null then
    return null;
  end if;

  _period_id := _period;
  if _period_id is null then
    select a.period_id into _period_id
      from advisor_family_attach a
      join perf_period p on p.id = a.period_id
     where a.advisor_op_id = _op_id
       and a.rooftop_id = _rooftop
     order by p.starts_on desc
     limit 1;
  end if;

  if _period_id is null then
    return null;
  end if;

  select
      a.family,
      round(greatest(coalesce(b.store_avg_pct, 0) - coalesce(a.attach_rate_pct, 0), 0)
            / 100.0 * a.advisor_ros, 2)                        as missed_ros,
      case when l.labor_per_ro is not null and l.labor_per_ro > 0
           then round(greatest(coalesce(b.store_avg_pct, 0) - coalesce(a.attach_rate_pct, 0), 0)
                      / 100.0 * a.advisor_ros * l.labor_per_ro, 2)
      end                                                      as opportunity,
      s.film_count
    into _top
    from advisor_family_attach a
    join family_store_benchmark b
      on b.family = a.family and b.period_id = a.period_id and b.rooftop_id = a.rooftop_id
    join family_pitch_supply s on s.family = a.family
    left join advisor_family_labor l
      on l.family = a.family and l.period_id = a.period_id
     and l.rooftop_id = a.rooftop_id and l.advisor_op_id = a.advisor_op_id
   where a.advisor_op_id = _op_id
     and a.rooftop_id = _rooftop
     and a.period_id = _period_id
     /*
      * ---- THE COACHING FLOOR, AND IT IS THE PRODUCT'S EXISTING ONE --------
      *
      * This was `a.advisor_ros > 0`, and that put two parts of the product in
      * disagreement about what counts as enough history to coach somebody from:
      *
      *   eddiesPick()            returns NULL below min_ros_for_coaching().
      *                           The old hero card did not render at all.
      *   derive_focus_family()   ranked anybody with a single RO, against a
      *                           benchmark built from advisors with real volume.
      *
      * Measured on production before this went in: 25 of the 59 operators with
      * rows in the latest period are below the floor — 42% — and one of the four
      * real advisor accounts is among them at 12 ROs. His pick came out as
      * Filters on ONE missed RO, and a pick derived from one missed RO is
      * indistinguishable on screen from a pick derived from two hundred.
      *
      * `advisor_ros` IS the total, not the family's share: advisor_family_attach
      * selects `t.total_ros as advisor_ros` from advisor_period_total_src (0081).
      * So no extra join is needed and none is added — a second read of the same
      * number is a second chance to read it differently.
      *
      * min_ros_for_coaching(), NEVER A LITERAL 20. A hard-coded threshold here
      * would be the same defect one layer down: 0053 owns the number, 0081 and
      * 0096 already read it, and a later ruling on it has to land in one place.
      */
     and a.advisor_ros >= min_ros_for_coaching()::numeric
     /* ---- 0124: at least one film this advisor has not already watched ----
      * The pitch slot skips anything with a content_progress row, so a family
      * whose films are all consumed supplies nothing however wide its gap. */
     and exists (
       select 1
         from content c
         join op_code_family f on f.code = c.op_code and f.coachable
        where f.family = a.family
          and c.type = 'advisor_video'
          and c.status = 'published'
          and c.retired_at is null
          and c.mux_playback_id is not null
          /*
           * COMPLETED, NOT MERELY TOUCHED.
           *
           * record_watch_progress (0057) INSERTs a content_progress row on the
           * first watch ping and never sets completed_at — so "a row exists"
           * is true the moment a player opens. Testing for the row would let
           * an advisor scrub two seconds into every film in the family and
           * have the cycle declare itself finished. completed_at is written
           * only by a completion path that checked the watch gate.
           */
          and not exists (
            select 1 from content_progress cp
             where cp.user_id = _user and cp.content_id = c.id
               and cp.completed_at is not null
          )
     )
   order by missed_ros desc nulls last,
            opportunity desc nulls last,
            a.family asc
   limit 1;

  if _top is null or _top.missed_ros is null or _top.missed_ros <= 0 then
    return null;
  end if;

  select * into _existing
    from advisor_focus_family
   where user_id = _user and ended_on is null
   limit 1;

  if found then
    if _existing.source = 'manager' then
      return _existing;
    end if;

    if _existing.family = _top.family then
      return _existing;
    end if;

    update advisor_focus_family
       set ended_on = current_date,
           updated_at = now()
     where id = _existing.id;
  end if;

  insert into advisor_focus_family
    (user_id, rooftop_id, family, source, period_id, missed_ros, opportunity, film_count)
  values
    (_user, _rooftop, _top.family, 'derived', _period_id,
     _top.missed_ros, _top.opportunity, _top.film_count)
  returning * into _out;

  return _out;
end;
$$;

revoke all on function derive_focus_family(uuid, uuid, uuid) from public;
revoke all on function derive_focus_family(uuid, uuid, uuid) from anon, authenticated;

/*
 * THE COMPANION THE LOOP ACTUALLY CALLS EVERY MORNING.
 *
 * The loop's question is not "derive me a family" — it is "is the current
 * assignment still able to serve, and if not, move on". Doing that in
 * TypeScript would mean reading the assignment, counting remaining films,
 * ending the row and re-deriving in four round trips with a race in the middle.
 *
 * Definer for the same reason derive_focus_family is, and granted to nobody for
 * the same reason.
 */
create or replace function advance_focus_family(
  _user    uuid,
  _rooftop uuid
)
returns advisor_focus_family
language plpgsql
security definer
set search_path = public
as $$
declare
  _active advisor_focus_family;
  _remaining int;
begin
  select * into _active
    from advisor_focus_family
   where user_id = _user and ended_on is null
   limit 1;

  if found then
    select count(*) into _remaining
      from content c
      join op_code_family f on f.code = c.op_code and f.coachable
     where f.family = _active.family
       and c.type = 'advisor_video'
       and c.status = 'published'
       and c.retired_at is null
       and c.mux_playback_id is not null
       /* completed_at, for the reason derive_focus_family gives above. */
       and not exists (
         select 1 from content_progress cp
          where cp.user_id = _user and cp.content_id = c.id
            and cp.completed_at is not null
       );

    if _remaining > 0 then
      return _active;
    end if;

    /*
     * EXHAUSTED. End it and derive the next.
     *
     * A MANAGER RULING IS ENDED TOO, AND ONLY HERE. derive_focus_family refuses
     * to overwrite one because the DMS moving is not a reason to override a
     * human. Running out of film is a different fact: the manager asked for a
     * family and the advisor has now watched all of it, so the instruction has
     * been carried out rather than overruled. Leaving it locked would give them
     * two-slot mornings indefinitely with nothing anyone could do from a screen.
     */
    update advisor_focus_family
       set ended_on = current_date,
           updated_at = now()
     where id = _active.id;
  end if;

  return derive_focus_family(_user, _rooftop, null);
end;
$$;

comment on function advance_focus_family(uuid, uuid) is
  'The loop''s morning call. Keeps the current assignment while it still has an '
  'unwatched film; otherwise ends it — manager rulings included, see the body — '
  'and derives the next. Definer, no grants. See 0124 §4.';

revoke all on function advance_focus_family(uuid, uuid) from public;
revoke all on function advance_focus_family(uuid, uuid) from anon, authenticated;


-- ============================================================================
-- 5. THE ROI FIGURE WOULD HAVE GONE TO ZERO
-- ============================================================================
/*
 * THE QUIET LOSS THIS MIGRATION EXISTS TO PREVENT.
 *
 * impact_coaching decides whether an advisor was coached on a family in a
 * period. impact_rollup joins it to attach-rate movement, and admin_impact_*
 * turns that into the ROI-per-rooftop figure a dealer principal reads. It is
 * the number the product is sold on — lib/day-stamp.ts says so at the top.
 *
 * Every one of its three sources resolves the family through
 * `content.service_family`:
 *
 *   cue_content_id    the old family-ladder cue. Carried a family. GONE — the
 *                     item slot serves craft curriculum, and 408 of the 410
 *                     published Foundations items have service_family null.
 *   video_content_id  the lifestyle film. Never carried a family; contributed
 *                     nothing then and nothing now.
 *   content_progress  library lessons. Still works, unchanged.
 *
 * So on the day 3b ships, the primary coaching signal would have stopped and
 * the ROI figure would have quietly fallen towards whatever the library alone
 * produces. Nothing would have errored.
 *
 * The fix is that the NEW primary signal — the pitch film — resolves its family
 * the way 3a established every film does: through op_code -> op_code_family,
 * not through service_family, which no published film carries.
 *
 * ---------------------------------------------------------------------------
 * THE OLD SOURCES STAY. THIS IS ADDITIVE.
 * ---------------------------------------------------------------------------
 * 3,038 historical completions prove coverage through cue_content_id, and a
 * view that stopped reading it would rewrite the last year of the ROI figure
 * overnight. Every existing branch is preserved verbatim and two are added.
 */
create or replace view impact_coaching as
with touches as (
  /* ---- unchanged, and still the only source for pre-0124 days ----------- */
  select dc.user_id, dc.rooftop_id, dc.completion_date as on_date,
         c.service_family as family, 'cue' as via
    from daily_completion dc
    join content c on c.id = dc.cue_content_id and c.service_family is not null
  union all
  select dc.user_id, dc.rooftop_id, dc.completion_date,
         c.service_family, 'video'
    from daily_completion dc
    join content c on c.id = dc.video_content_id and c.service_family is not null
  union all
  select cp.user_id, cp.rooftop_id, cp.completed_at::date,
         c.service_family, 'lesson'
    from content_progress cp
    join content c on c.id = cp.content_id and c.service_family is not null
   where cp.completed_at is not null

  /* ---- 0124: the pitch film, resolved through the op-code bridge -------- */
  union all
  select dc.user_id, dc.rooftop_id, dc.completion_date,
         f.family, 'pitch'
    from daily_completion dc
    join content c on c.id = dc.pitch_video_content_id
    join op_code_family f on f.code = c.op_code
   where f.coachable

  /* ---- 0124: an item that happens to carry a family ---------------------
   * Most do not — the craft tracks are 408-of-410 null — but 680 published
   * Service Knowledge items DO carry one, and an advisor working through those
   * has genuinely been coached on that family. Reading service_family here
   * rather than the op-code bridge is deliberate: an item is a cue, and cues
   * are the one content type that really is tagged by family. */
  union all
  select dc.user_id, dc.rooftop_id, dc.completion_date,
         c.service_family, 'item'
    from daily_completion dc
    join content c on c.id = dc.item_content_id and c.service_family is not null
)
select
  t.user_id,
  t.rooftop_id,
  pp.id as period_id,
  t.family,
  bool_or(t.via = 'cue')    as via_cue,
  bool_or(t.via = 'video')  as via_video,
  bool_or(t.via = 'lesson') as via_lesson,
  bool_or(t.via = 'pitch')  as via_pitch,
  bool_or(t.via = 'item')   as via_item
from touches t
join perf_period pp
  on pp.rooftop_id = t.rooftop_id
 and t.on_date between pp.starts_on and pp.ends_on
group by t.user_id, t.rooftop_id, pp.id, t.family;

alter view impact_coaching set (security_invoker = on);

comment on view impact_coaching is
  'Was this advisor coached on this family in this period. Five sources: the '
  'retired cue slot and the lifestyle film (history), library lessons, and — '
  'from 0124 — the pitch film through op_code_family and the item when it '
  'carries a family. See 0124 §5: without the pitch branch the ROI figure '
  'silently falls to whatever the library alone produces.';


-- ============================================================================
-- 5b. A CORRECTION TO 0123 — family_pitch_supply IS NOT ADVISOR-READABLE
-- ============================================================================
/*
 * 0123 granted `select on family_pitch_supply to authenticated` and its comment
 * claimed "security invoker: an advisor counts only films they are entitled to
 * play". The first half is true and the second half is wrong, which makes the
 * grant worse than useless.
 *
 * The view joins op_code_family, and 0081 narrowed THAT to platform owner or
 * admin. So an advisor reading this view gets ZERO ROWS AND NO ERROR — not a
 * filtered count, an empty one. A card built on it would render "0 films" for
 * every family and look like a content gap.
 *
 * Found by phase 3b's acceptance suite, which asserted the morning's SHAPE
 * rather than trusting the pickers: every morning came back two-slot for a
 * reason that produced no error anywhere.
 *
 * ---------------------------------------------------------------------------
 * REVOKED RATHER THAN MADE TO WORK, AND THAT IS THE SMALLER CHANGE
 * ---------------------------------------------------------------------------
 * The alternatives were to relax op_code_family back to any-signed-in-user —
 * undoing a deliberate trust-boundary decision for one view's convenience — or
 * to make this view definer and restate content_entitled_read inside it, which
 * is the copy-the-policy mistake 0118 refused to make.
 *
 * Neither is needed. Every caller is server-side: lib/loop.ts reads the code
 * list with the service role and the FILMS with the advisor's client, so
 * entitlement is enforced where it belongs, and the /today card in 3c is a
 * server component with the same two clients available. A grant to
 * `authenticated` only invites somebody to build a client-side reader that
 * silently returns nothing.
 */
revoke select on family_pitch_supply from authenticated;

comment on view family_pitch_supply is
  'Published pitch films per service family, resolved through op_code_family. '
  'SERVER-SIDE ONLY — not granted to authenticated, because op_code_family is '
  'admin-scoped (0081) and an advisor would read zero rows with no error. It '
  'counts the LIBRARY, not one advisor''s entitlement; the entitlement gate is '
  'content_entitled_read at serve time. See 0123 §1 and 0124 §5b.';


-- ============================================================================
-- 6. THE TRACK FILM POINTER IS STILL EMPTY, ON PURPOSE
-- ============================================================================
/*
 * 0123 added certification.entry_film_content_id and left it null. It stays
 * null. Ruling 2: entry is recorded whether or not a film exists, and the
 * entry morning only DIFFERS from a normal morning when one does.
 *
 * Nothing here attaches a film. 3a found six Craft films against eight core
 * tracks, none named for a core track, and two of the six already wired as
 * pitch-stage fallbacks. Picking one would be inventing Mitch's ruling, and
 * PHASE_3_PLAN.md puts "which track each film opens" in his column.
 *
 * The index exists so that when he does rule, the loop's per-morning lookup
 * is not a sequential scan of the certification table.
 */
create index if not exists certification_entry_film_idx
  on certification (entry_film_content_id) where entry_film_content_id is not null;

/*
 * WHAT MAKES THE RULING SAFE TO APPLY LATER WITHOUT A CODE CHANGE:
 * pickTrackEntry() in lib/loop.ts reads this column every morning and branches
 * on null. Setting it is an UPDATE. That is the test 3b is meant to pass.
 */


notify pgrst, 'reload schema';
