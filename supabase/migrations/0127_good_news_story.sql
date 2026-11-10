-- ============================================================================
-- EDIAGD — 0127 The Good News Story
--
-- The third leg of the credential: the advisor's own account of something they
-- did differently on the drive because of what a track taught them. ONE PER
-- TRACK — eight per credential — mirroring the track film at track entry.
--
-- TWO_LADDERS.md §PROPOSED, NOT DECIDED is replaced by this.
--
-- ---------------------------------------------------------------------------
-- THE RLS IS THE FEATURE, NOT A DETAIL
-- ---------------------------------------------------------------------------
-- This is the first place in the product where an advisor writes free text
-- about their own work, their customers and their colleagues, and a manager
-- reads it. Four rules, and §3 below proves each one as a REFUSAL:
--
--   1. an advisor reads and writes their OWN stories, always
--   2. a manager reads stories of advisors AT THEIR OWN ROOFTOP, nothing else
--   3. a shared story is visible to advisors at that rooftop, and only when
--      shared_to_team is true
--   4. no DEALER STAFF read across rooftops — not a manager at another Doggett
--      store, not an admin browsing. EDIAGD's platform owners do; see below.
--
-- ---------------------------------------------------------------------------
-- RULE 4 HAS ONE EXCEPTION, ADDED BY 0180 — Ryan, 9 November
-- ---------------------------------------------------------------------------
-- This file originally stated rule 4 as an absolute and said of the read policy
-- "there is deliberately no is_platform_owner() arm". That wording is edited
-- rather than left standing, because a comment asserting an absolute beside a
-- policy that now has an exception instructs the next reader not to look — and
-- an absolute is the one claim nobody re-checks.
--
-- WHAT CHANGED, AND WHY IT IS NOT A WEAKENING. 0127 shipped the review stamp
-- (§4) and no review surface, so nothing in the product read a story: Valerie's
-- three at Beaumont had an audience of one. Ryan ruled on 9 November that Mitch
-- reads every story and marks it Good or Kickback, and Mitch reads across every
-- store — so the surface 0127 built the stamp for needs the arm 0127 withheld.
--
-- The rule for DEALER staff is untouched and still proved as a refusal in
-- npm run accept:story: a manager at one store reads nothing at another, and a
-- rooftop admin at store A reads nothing at store B. What 0180 adds is EDIAGD,
-- which is not a rooftop and was never what rule 4 was about.
--
-- Rule 4 as written could not distinguish "another dealer's manager" from "the
-- people who make the content", and the honest reading of the paragraph above
-- it — "one employee seeing another's performance, at a dealership" — was
-- always about the former.
--
-- This is not theoretical. Phase 3d found that a mis-mapped membership.op_code_id
-- already shows an advisor A COLLEAGUE'S ATTACH RATES PRESENTED AS THEIR OWN.
-- One employee seeing another's performance, at a dealership, today. Stories are
-- the same surface with worse content: their own words about their own work.
--
-- An advisor reaching another advisor's story is the one failure in this phase
-- that a later fix does not undo, because by then somebody has read it.
-- ============================================================================

-- ---- 1. The flag ------------------------------------------------------------

/**
 * SHIPS ON, and that is not the usual choice.
 *
 * A gate like this would normally go on dark and be promoted later, to avoid
 * stranding a cohort mid-flight. There is no cohort: the eight-to-fifteen month
 * clock starts 1 October, so no advisor completes a track before February.
 * Shipping it OFF would create exactly the mismatch the flag exists to avoid —
 * a first cohort whose tracks completed under different rules.
 *
 * Turning it off is one UPDATE and no migration:
 *
 *     update game_settings set story_required = false;
 *
 * Read in ONE place — trackComplete() in lib/certification.ts, fed by
 * loadStoryGate() in lib/story.ts. Same column mechanism as 0119's
 * founding_class_through rather than a second kind of setting.
 */
alter table game_settings
  add column if not exists story_required boolean not null default true;

comment on column game_settings.story_required is
  'When true, a track needs its Good News Story as well as every module. Ships '
  'ON — see 0127 for why a dark launch would have been the riskier choice. Read '
  'by lib/story.ts loadStoryGate(); turning it off is an UPDATE, not a migration.';

-- ---- 2. The story -----------------------------------------------------------

create table if not exists advisor_story (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references app_user(id) on delete cascade,
  /*
   * THE ROOFTOP IS STAMPED ON THE ROW, not joined through membership at read
   * time. A story is about work done at a store, and an advisor who moves
   * stores must not drag their old store's stories into the new manager's
   * view — nor lose them from the old one. Membership is current state; this
   * is history.
   */
  rooftop_id       uuid not null references rooftop(id),
  certification_id uuid not null references certification(id),

  body             text not null,
  /* The advisor's choice, OFF by default — Ruling: sharing is opt-in. */
  shared_to_team   boolean not null default false,

  submitted_at     timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  /*
   * MANAGER REVIEW GATES NOTHING. It records who read it and when, and that is
   * all it does. A manager who has not got to it yet must never be the reason
   * somebody's credential is stuck — that failure arrives in month two at
   * Doggett and it is the manager's Tuesday, not the advisor's fault.
   *
   * ---- STILL TRUE OF A PENDING REVIEW, AND 0180 ADDS AN OUTCOME ----------
   * 0180 adds review_status (pending | good | kickback) and a KICKBACK does
   * return the track's story leg to unmet. The paragraph above survives intact
   * because it is about the state these two columns describe: an UNREAD story
   * gates nothing, so Mitch's backlog is never the reason a credential is
   * stuck. Only an explicit kickback — somebody having read it and asked for
   * more — changes the leg, and the advisor is told so on /advisor with a way
   * to act on it.
   *
   * A track already EARNED is never revoked by a late kickback; 0180 touches
   * advisor_certification not at all, and accept:story asserts that.
   */
  reviewed_by      uuid references app_user(id),
  reviewed_at      timestamptz,

  /* Retire, never delete — see §2b. */
  retired_at       timestamptz,
  retired_reason   text
);

/*
 * ONE LIVE STORY PER TRACK. The partial index is the rule: a retired row does
 * not hold the slot, so an advisor who withdraws one can write another.
 */
create unique index if not exists advisor_story_one_per_track
  on advisor_story (user_id, certification_id)
  where retired_at is null;

create index if not exists advisor_story_by_rooftop
  on advisor_story (rooftop_id) where retired_at is null;

comment on table advisor_story is
  'The Good News Story — one per track, the third leg of the credential. Free '
  'text written by an advisor about their own work. Treat as an HR surface: see '
  '0127 for the RLS and reports/phase-3e for the retention posture (unruled).';

-- ---- 2b. The edit history ---------------------------------------------------

/**
 * A story that changed after a manager read it is a thing the manager should be
 * able to see. So an edit writes the PREVIOUS text here before overwriting —
 * retire, never delete, the same doctrine the rest of the schema follows.
 *
 * Not a trigger on purpose: the application already knows whether it is editing
 * or submitting, and a trigger that fires on every UPDATE would record
 * shared_to_team toggles and review stamps as if they were edits.
 */
create table if not exists advisor_story_revision (
  id          uuid primary key default gen_random_uuid(),
  story_id    uuid not null references advisor_story(id) on delete cascade,
  body        text not null,
  replaced_at timestamptz not null default now()
);

create index if not exists advisor_story_revision_by_story
  on advisor_story_revision (story_id, replaced_at desc);

-- ---- 3. The RLS -------------------------------------------------------------

alter table advisor_story enable row level security;
alter table advisor_story_revision enable row level security;

/*
 * READ. Three ways in and no fourth, and every one of them is rooftop-bounded.
 *
 * `bypasses_rls()` first so the service role can read for the certification
 * derivation — and NOT `auth.uid()`-keyed, which is the mistake 0123 had to
 * repair in has_performance_surface(). A gate written as "not X" decides
 * something about every role that is not X, and one of them is the backend.
 */
drop policy if exists advisor_story_read on advisor_story;
create policy advisor_story_read on advisor_story
  for select using (
    bypasses_rls()
    /* 1 — my own, always, shared or not, retired or not. */
    or user_id = (select auth.uid())
    /* 2 — a manager reads their own rooftop's stories. managed_rooftops() is
           manager+admin, and it is per rooftop, so an admin at store A cannot
           read store B.

           NO is_platform_owner() ARM HERE, AND 0180 ADDS ONE. This policy is
           superseded: 0180 restates it in full with a fourth arm, because
           Mitch reads every story and marks it. The header above says when and
           why. Left in place rather than edited — this is what 0127 did, and
           the migration that changed it is the one that should say so. */
    or rooftop_id in (select managed_rooftops())
    /* 3 — a story its author chose to share, to advisors AT THAT ROOFTOP. */
    or (shared_to_team and rooftop_id in (select my_rooftops()))
  );

/*
 * WRITE. The author, and only ever for themselves. A manager cannot write a
 * story on somebody's behalf — the leg is "the advisor's own words" and a row
 * somebody else typed would make the credential a lie in the one place it is
 * supposed to be personal.
 */
drop policy if exists advisor_story_insert on advisor_story;
create policy advisor_story_insert on advisor_story
  for insert with check (
    user_id = (select auth.uid())
    and rooftop_id in (select my_rooftops())
  );

drop policy if exists advisor_story_update on advisor_story;
create policy advisor_story_update on advisor_story
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

/*
 * NO DELETE POLICY, DELIBERATELY. Retire, never delete: retired_at is an UPDATE
 * the author is already allowed to make. Without a delete policy the statement
 * is refused for everyone, which is the intent rather than an omission.
 */

/* Revisions inherit the story's audience exactly — no second answer. */
drop policy if exists advisor_story_revision_read on advisor_story_revision;
create policy advisor_story_revision_read on advisor_story_revision
  for select using (
    bypasses_rls()
    or exists (
      select 1 from advisor_story s
       where s.id = advisor_story_revision.story_id
         and (
           s.user_id = (select auth.uid())
           or s.rooftop_id in (select managed_rooftops())
         )
    )
  );

drop policy if exists advisor_story_revision_insert on advisor_story_revision;
create policy advisor_story_revision_insert on advisor_story_revision
  for insert with check (
    exists (
      select 1 from advisor_story s
       where s.id = advisor_story_revision.story_id
         and s.user_id = (select auth.uid())
    )
  );

revoke all on advisor_story from anon;
revoke all on advisor_story_revision from anon;
grant select, insert, update on advisor_story to authenticated;
grant select, insert on advisor_story_revision to authenticated;

-- ---- 4. Manager review, without a write policy on the row ------------------

/**
 * A manager marking a story read is the ONE thing a non-author may change, and
 * a broad update policy would have let them change the body too. So it is a
 * definer function that writes exactly two columns and nothing else.
 *
 * Gated on managed_rooftops() inside, so the rooftop rule holds here as well as
 * in the read policy — a second door into the same room needs the same lock.
 *
 * ---------------------------------------------------------------------------
 * DROPPED BY 0180 AND REPLACED BY review_story(uuid, text, text)
 * ---------------------------------------------------------------------------
 * This function could record that somebody looked and nothing about what they
 * concluded, which is all 0127 needed. It is gone, not kept beside its
 * replacement: two ways to review would let a story be stamped with no outcome,
 * and since 0180 the outcome is what the leg reads.
 *
 * The reasoning above is why the replacement is ALSO a definer function — and
 * 0180 goes further in the same direction, revoking the author's blanket update
 * grant for column-level grants. "A broad update policy would have let them
 * change the body too" is exactly right, and once review_status decided a leg
 * it also let them change their own verdict.
 *
 * AND THE REPLACEMENT IS NARROWER THAN THIS ONE. The sentence below — "a second
 * door into the same room needs the same lock" — is right about the READ and
 * wrong about the review, and 0180 first copied it before Ryan corrected it on
 * 10 November. managed_rooftops() says which rooftops the CALLER manages and
 * nothing about WHOSE story it is, so an advisor who also holds a manager row
 * at their own store manages the rooftop their own story is stamped with. Here
 * that was harmless — the function wrote only a read-stamp. Once the outcome
 * decided a leg it was an advisor marking their own homework. review_story() is
 * is_platform_owner() alone; managers still read via the policy above.
 */
create or replace function mark_story_reviewed(_story uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update advisor_story s
     set reviewed_by = auth.uid(),
         reviewed_at = now()
   where s.id = _story
     and s.rooftop_id in (select managed_rooftops());

  if not found then
    raise exception 'not permitted to review this story'
      using errcode = '42501';
  end if;
end $$;

revoke all on function mark_story_reviewed(uuid) from public, anon;
grant execute on function mark_story_reviewed(uuid) to authenticated;

-- ---- 5. What the certification derivation asks ------------------------------

/**
 * Has this advisor told the story for this track?
 *
 * SECURITY DEFINER because the certification page asks it about the viewer and
 * the service role asks it during accrual, and neither should need a read
 * policy hit. It answers a boolean about the CALLER's own story only — it
 * cannot be used to probe somebody else's.
 */
create or replace function my_story_for(_certification uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from advisor_story s
     where s.user_id = auth.uid()
       and s.certification_id = _certification
       and s.retired_at is null
  );
$$;

revoke all on function my_story_for(uuid) from public, anon;
grant execute on function my_story_for(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
