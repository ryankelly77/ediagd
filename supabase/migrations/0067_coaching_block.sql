-- ============================================================================
-- EDIAGD — 0067 The coaching block, and a completion row that records the day
--
-- Phase 0 found that four of the six fields the loop contract needs have
-- nowhere to go, and that the loop degrades to a generic passage with nothing
-- recording that it did. This migration is the storage half of both problems.
--
-- Two things land here:
--
--   coaching_block    an advisor works ONE service family for a run of days,
--                     advancing through the six stages of the pitch. The block
--                     is what makes a stage mean anything — without it, "stage"
--                     is a column with no cursor.
--
--   daily_completion  gains the second quote, the pitch video, the op code, the
--                     stage, the tier, the block, and which rung of the fallback
--                     ladder actually fired.
--
-- Nothing here reads or writes on its own. The picker in lib/daily.ts and the
-- engine in lib/gamification/completeDay.ts are what fill these in.
-- ============================================================================


-- ---- 1. Block length is configuration ---------------------------------------
/*
 * NOT A CONSTANT IN THE CODE. Mitch has not confirmed the block shape yet — the
 * brief proposed five days — and the difference between five and six is not
 * cosmetic: there are SIX stages, so a five-day block never reaches Objections.
 * That is a real editorial consequence of a number, which is exactly the kind of
 * number that belongs in game_settings next to the Sand Dollar amounts rather
 * than compiled into a picker.
 *
 * The default is 6, one day per stage, because that is the only length that
 * covers the pitch Mitch actually wrote. Setting it to 5 is a decision someone
 * can make in the admin; it should not be one they make by accident.
 */
alter table game_settings
  add column if not exists coaching_block_days int not null default 6;

alter table game_settings drop constraint if exists coaching_block_days_sane;
alter table game_settings add constraint coaching_block_days_sane
  check (coaching_block_days between 1 and 30);


-- ---- 2. The block -----------------------------------------------------------
create table if not exists coaching_block (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_user(id) on delete cascade,
  rooftop_id  uuid not null references rooftop(id)  on delete cascade,

  /*
   * THE PICK IS AT FAMILY GRAIN, AND THE BLOCK LOCKS IT.
   *
   * Contract option (a): Eddie's Pick chooses a family, and the op code is
   * chosen inside it. Per-op-code attach rates and benchmarks do not exist —
   * advisor_op_metric is keyed by DMS code and 0 of the 208 DMS codes appear in
   * op_code_catalog — so a pick at op-code grain cannot be computed today. When
   * the DMS bridge lands, `family` stays correct and `op_code` becomes the
   * thing that was measured rather than the thing that was chosen inside it.
   */
  family      text not null,

  /*
   * The catalog code being coached, drawn from the family via op_code_family.
   * Fixed for the life of the block: an advisor working the brake-fluid pitch
   * through six stages must be working the SAME pitch on day 4 as on day 1, or
   * the stages are six unrelated conversations.
   */
  op_code     text references op_code_catalog(code) on update cascade,

  /*
   * Locked at block start, not recomputed nightly.
   *
   * cueTierForRate reads the advisor's current attach rate, which moves every
   * time the DMS imports. Re-reading it mid-block would swap the register of
   * the coaching partway through — "you sell none of this" on Tuesday and "you
   * sell a little" on Wednesday — for a rate change of a tenth of a point.
   */
  tier        text check (tier in ('zero', 'low')),

  started_on  date not null,

  /*
   * COPIED FROM SETTINGS AT START, NOT READ LIVE.
   *
   * Same discipline as was_scheduled on daily_completion (0025): if the block
   * read game_settings every night, an admin shortening the block would end
   * every block in flight retroactively, and lengthening it would resurrect
   * ones that had already closed. The setting governs the NEXT block.
   */
  length_days int not null,

  /*
   * Set when the block finishes or is abandoned. A block whose family stops
   * being the advisor's biggest gap still runs to its end — that is what
   * "locks to a family" means — so this is written by the day the block's last
   * stage is served, not by a change in the pick.
   */
  ended_on    date,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table coaching_block is
  'One run of consecutive days coaching a single service family, advancing '
  'through the six pitch stages. Length is copied from '
  'game_settings.coaching_block_days at start so a settings edit cannot '
  'retroactively end or extend a block already in flight.';

/*
 * ONE OPEN BLOCK PER ADVISOR. The picker looks up "the block this advisor is in
 * today" and must get exactly one answer; two open blocks would make the day's
 * stage depend on row order. A partial unique index is the only way to say
 * "unique among the open ones" — a plain unique (user_id) would forbid history.
 */
create unique index if not exists coaching_block_one_open_idx
  on coaching_block(user_id) where ended_on is null;

create index if not exists coaching_block_user_started_idx
  on coaching_block(user_id, started_on desc);

alter table coaching_block enable row level security;

-- Read your own; managers and admins read their rooftop's people, mirroring
-- swell_team_read (0011) so a coaching-coverage screen can be built on it.
drop policy if exists coaching_block_read on coaching_block;
create policy coaching_block_read on coaching_block
  for select using (
    user_id = (select auth.uid())
    or exists (select 1 from membership me
               join membership them on them.rooftop_id = me.rooftop_id
               where me.user_id = (select auth.uid()) and me.active
                 and them.user_id = coaching_block.user_id
                 and (me.role = 'manager' or me.role = 'admin')));

/*
 * WRITES ARE SERVER-SIDE ONLY, and there is deliberately no user-facing insert
 * policy. A block decides which coaching an advisor receives and how long they
 * receive it; letting the client open one would let an advisor pick their own
 * easiest family. The picker runs under the service role, which bypasses RLS —
 * same posture as the economy tables in 0012.
 */
drop policy if exists coaching_block_admin_write on coaching_block;
create policy coaching_block_admin_write on coaching_block
  for all
  using (exists (select 1 from membership m
                 where m.user_id = (select auth.uid()) and m.active and m.role = 'admin'))
  with check (exists (select 1 from membership m
                 where m.user_id = (select auth.uid()) and m.active and m.role = 'admin'));


-- ---- 3. What a served day records -------------------------------------------
/*
 * Nothing can be credited to a certification later that was not written down
 * now. Today the row records one quote id, a cue, a video and was_scheduled;
 * the loop serves two quotes, two videos, and a cue chosen by a ladder whose
 * rung nobody logs.
 */
alter table daily_completion
  /*
   * THE SECOND QUOTE. The loop has always served two — the life quote on step 1
   * and the selling quote beside the cue on step 2 — and recorded one. The
   * existing `quote_content_id` is step 1; this is step 2. Not renamed, because
   * 0011's column is referenced by existing rows and by the Free Surf counting
   * query, and a rename to make a pair look symmetrical is not worth rewriting
   * history for.
   */
  add column if not exists quote2_content_id uuid references content(id),

  -- Step 3. Distinct from video_content_id, which is step 4's lifestyle video.
  add column if not exists pitch_video_content_id uuid references content(id),

  /*
   * EXPLICIT, BECAUSE NULL ALREADY MEANS SOMETHING ELSE.
   *
   * Null on pitch_video_content_id means "this row predates step 3" — every
   * existing row. False plus a null id would be a contradiction, so the picker
   * writes true when it looked for a pitch video for today's stage and there
   * wasn't one. That is the number that says how much of the pitch library is
   * still unfilmed, and it is unrecoverable after the fact.
   */
  add column if not exists pitch_video_skipped boolean,

  add column if not exists op_code text references op_code_catalog(code)
    on update cascade on delete set null,
  add column if not exists stage text,
  add column if not exists cue_tier text,
  add column if not exists block_id uuid references coaching_block(id) on delete set null,

  /*
   * WHICH RUNG OF THE LADDER FIRED. Phase 0's finding was that the loop cannot
   * report how often it degrades, because the old three-step chain always
   * returned something and said nothing about where it came from. 'none' is a
   * real recorded outcome now, not a crash and not a generic passage wearing a
   * coaching cue's clothes.
   */
  add column if not exists cue_match text;

/*
 * Same six stages as content.stage (0062), same spelling, same order of
 * argument. Repeated rather than shared because Postgres has no reusable check;
 * if these two ever disagree, a completion could record a stage no content can
 * be tagged with.
 */
alter table daily_completion drop constraint if exists daily_completion_stage_valid;
alter table daily_completion add constraint daily_completion_stage_valid
  check (stage is null or stage in (
    'Pre-Write', 'On the Drive', 'At the Kiosk',
    'MPI Setup', 'After-MPI', 'Objections'
  ));

alter table daily_completion drop constraint if exists daily_completion_tier_valid;
alter table daily_completion add constraint daily_completion_tier_valid
  check (cue_tier is null or cue_tier in ('zero', 'low'));

/*
 * The four rungs, plus the state that used to be impossible.
 *   op_code_stage_tier  the pitch, at this point in it, for this performance
 *   op_code_stage       the pitch, at this point in it
 *   op_code             the pitch, anywhere in it
 *   family              the legacy family shelf, bridged via op_code_family
 *   none                nothing published reaches this advisor today
 */
alter table daily_completion drop constraint if exists daily_completion_cue_match_valid;
alter table daily_completion add constraint daily_completion_cue_match_valid
  check (cue_match is null or cue_match in (
    'op_code_stage_tier', 'op_code_stage', 'op_code', 'family', 'none'
  ));

/*
 * A stage is a position within a pitch, so it needs the pitch — the same rule
 * 0063 puts on content, applied to the record of what was served. Without it a
 * completion could claim 'At the Kiosk' with no op code, which is a coaching
 * history nobody can reconstruct.
 */
alter table daily_completion drop constraint if exists daily_completion_stage_needs_op_code;
alter table daily_completion add constraint daily_completion_stage_needs_op_code
  check (op_code is not null or stage is null);

-- How often the loop degrades, and on which families. The reporting query is
-- "count by cue_match over a date range", so the date leads.
create index if not exists daily_completion_cue_match_idx
  on daily_completion(completion_date, cue_match);

create index if not exists daily_completion_block_idx
  on daily_completion(block_id);
