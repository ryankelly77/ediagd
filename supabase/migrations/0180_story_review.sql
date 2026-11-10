-- ============================================================================
-- EDIAGD — 0180 The Good News Story gets read
--
-- Ryan, 9 November: "Mitch reads every story. He is not grading them. He marks
-- each one Good, or Kickback when it is not substantial ('I learned a lot'). A
-- kickback shows on the advisor's screen as a banner, asking for something more
-- substantial to complete the module."
--
-- 0127 built the record, the RLS and the gate, and ruled that REVIEW GATES
-- NOTHING. Three things change here and nothing else:
--
--   1. EDIAGD's platform owners read every story, at every rooftop. 0127's read
--      policy deliberately had no is_platform_owner() arm; Mitch reads across
--      stores, so that absence is now the thing in the way. Ryan rules on
--      access and this is that ruling — the 0127 header is edited in place
--      rather than left contradicting this file.
--
--   2. A review has an OUTCOME: good, or kickback. reviewed_by/reviewed_at stay
--      exactly what they were, the stamp of the latest review.
--
--   3. A KICKBACK RETURNS THE LEG TO UNMET, and that is the only teeth in this
--      migration. my_story_for() is the single definition the credential
--      derivation, the certifications wall and the track page all read, so the
--      change goes there and nowhere else.
--
-- ---------------------------------------------------------------------------
-- WHAT A TRACK ALREADY EARNED IS NOT REVOKED — 0127 §2, AND IT STILL HOLDS
-- ---------------------------------------------------------------------------
-- Nothing here touches advisor_certification. A review that arrives late must
-- not yank a credential: retire, never revoke. A kickback makes the LEG unmet,
-- which is what the banner and the wall read; a track already earned stays
-- earned, and the acceptance suite asserts that as a positive.
--
-- ---------------------------------------------------------------------------
-- REMOVING AN IMPOSSIBILITY: THE AUTHOR'S UPDATE GRANT WAS SAFE AND NOW IS NOT
-- ---------------------------------------------------------------------------
-- 0127 granted `update` on advisor_story to `authenticated` with a policy of
-- `user_id = auth.uid()`, and wrote down why a definer function was used for
-- review instead of widening it: "a broad update policy would have let them
-- change the body too."
--
-- That grant was harmless while review gated nothing. It is NOT harmless now.
-- `review_status` decides a leg of the credential, so a blanket column-wide
-- update grant is an advisor being able to PostgREST their own story to
-- `review_status = 'good'` — marking their own homework, past a gate written to
-- put Mitch in the loop. The impossibility 0127 relied on ("there is nothing
-- here worth forging") is gone, so the safeguard it never needed is required.
--
-- Fixed by CONSTRUCTION rather than by convention: the blanket update grant is
-- revoked and re-granted COLUMN BY COLUMN, over exactly the columns an author
-- owns. The unsafe statement is not avoided, it cannot be written — Postgres
-- refuses `update advisor_story set review_status = ...` for `authenticated`
-- before any policy is consulted. See §5.
--
-- ---------------------------------------------------------------------------
-- NAMING THE ROLES, because a gate written as "not X" decides something about
-- every role that is not X and one of them is usually the caller:
--
--   authenticated   Mitch (platform owner) calls review_story(). A store
--                   manager READS their rooftop's stories and does NOT review
--                   one — reviewing is Mitch's, and a managed_rooftops() arm
--                   here would let an advisor who also holds a manager row
--                   review their own story (Ryan, 10 November; see §3).
--                   All three roles proved in npm run accept:story.
--   service_role    reads stories through the `bypasses_rls()` arm, which is
--                   FIRST and untouched here — is_platform_owner() keys on
--                   auth.uid() and is false for the backend, which is the
--                   0123 has_performance_surface() mistake and is why it is an
--                   EXTRA arm rather than a replacement. It cannot review:
--                   nothing server-side marks a story, and a review is a
--                   person's judgement with a person's id on it.
--   anon            all privileges revoked on advisor_story by 0127; the new
--                   function is revoked from public and anon below.
--   author          may edit their body, share it and retire it. May NOT write
--                   review_status, review_note, reviewed_by or reviewed_at —
--                   enforced by column grant, not by policy.
-- ============================================================================

-- ---- 1. The outcome of a review --------------------------------------------

/**
 * NOT NULL WITH A DEFAULT, and that is the whole reason the gate can key on it.
 *
 * "An exclusion by value is not an exclusion unless the value is mandatory" —
 * 0128 keyed the mileage shelf on `placement = 'reference'` and then the ingest
 * wrote 51 rows with placement NULL: invisible to the surface that selects the
 * value and excluded by nothing. A nullable review_status would be the same
 * hole, and the hole would be on the credential.
 *
 * So every row that exists has a status and every row that arrives takes
 * 'pending'. No data migration is needed and none is wanted: the 0127 stories
 * already filed are exactly what Mitch has not read yet, which is what pending
 * means.
 */
alter table advisor_story
  add column if not exists review_status text not null default 'pending';

alter table advisor_story
  drop constraint if exists advisor_story_review_status_known;
alter table advisor_story
  add constraint advisor_story_review_status_known
  check (review_status in ('pending', 'good', 'kickback'));

/**
 * Mitch's line to the advisor, and it is shown to them.
 *
 * Optional, because "not substantial" is sometimes the whole of what there is
 * to say and a required field would produce "n/a" forever. When it is present
 * the banner carries it verbatim — so it is written for the advisor to read,
 * not as a note to the file.
 */
alter table advisor_story
  add column if not exists review_note text;

comment on column advisor_story.review_status is
  'pending | good | kickback — the outcome of the latest review (0180). '
  'NOT NULL with a default so the gate cannot be dodged by a row that never '
  'acquired a value. KICKBACK RETURNS THE LEG TO UNMET: my_story_for() is the '
  'one definition and it excludes kickback. Written only by review_story() and '
  'by the edit trigger; `authenticated` holds no column grant on it.';

comment on column advisor_story.review_note is
  'Mitch''s optional line to the advisor, shown verbatim in the kickback banner '
  'on /advisor and in the leg hint. Cleared when the advisor edits the body. '
  '0180.';

comment on column advisor_story.reviewed_by is
  'Who marked it, and when, for the LATEST review. Unchanged from 0127 — a '
  'reviewed card can be changed (Mitch may mark Good after a rewrite, or '
  'reverse himself), and these two columns follow the latest decision rather '
  'than accumulating. 0180.';

-- ---- 2. Read: the fourth arm, and 0127's rule 4 now has an exception --------

/*
 * RESTATED IN FULL rather than patched, the posture 0161 took with
 * advisor_story_insert: the next reader should meet the rule, not a diff.
 *
 * `bypasses_rls()` STAYS FIRST AND STAYS FIRST FOR A REASON. is_platform_owner()
 * reads app_user via auth.uid(), so it is false for the service role — exactly
 * the shape that made has_performance_surface() exclude the backend it was
 * written to serve (0123). The new arm is an ADDITION to the bypass arm, never
 * a substitute for it.
 */
drop policy if exists advisor_story_read on advisor_story;
create policy advisor_story_read on advisor_story
  for select using (
    bypasses_rls()
    /* 1 — my own, always, shared or not, retired or not. */
    or user_id = (select auth.uid())
    /* 2 — a manager reads their own rooftop's stories. managed_rooftops() is
           manager+admin, and it is per rooftop, so an admin at store A cannot
           read store B. */
    or rooftop_id in (select managed_rooftops())
    /* 3 — a story its author chose to share, to advisors AT THAT ROOFTOP. */
    or (shared_to_team and rooftop_id in (select my_rooftops()))
    /*
     * 4 — 0180: EDIAGD's platform owners, at every rooftop.
     *
     * 0127 said "there is deliberately no is_platform_owner() arm" and listed
     * "nobody reads across rooftops" as rule 4. That was a ruling about DEALER
     * staff and it still holds for them — a manager at one Doggett store reads
     * nothing at another, and accept:story proves it as a refusal.
     *
     * Mitch is not dealer staff. He reads every story and marks it Good or
     * Kickback, which is the review surface 0127 built the stamp for and left
     * unbuilt. Ryan ruled this on 9 November; the 0127 header is edited to say
     * so rather than left asserting an absolute this contradicts.
     */
    or is_platform_owner()
  );

/* Revisions inherit the story's audience EXACTLY — no second answer, which
   means the platform-owner arm has to be added here too or the queue would show
   a body it could not show the history of. */
drop policy if exists advisor_story_revision_read on advisor_story_revision;
create policy advisor_story_revision_read on advisor_story_revision
  for select using (
    bypasses_rls()
    /* 0180 — the same fourth arm, for the same reader. */
    or is_platform_owner()
    or exists (
      select 1 from advisor_story s
       where s.id = advisor_story_revision.story_id
         and (
           s.user_id = (select auth.uid())
           or s.rooftop_id in (select managed_rooftops())
         )
    )
  );

-- ---- 3. The review, with an outcome ----------------------------------------

/**
 * Mark a story Good, or Kick it back.
 *
 * Replaces 0127's mark_story_reviewed(uuid), which recorded that somebody had
 * looked and could not record what they concluded.
 *
 * SECURITY DEFINER and it writes FOUR COLUMNS. The author keeps no grant on any
 * of them (§5), and a reviewer has no update policy on the row at all, so this
 * function is the ONLY way any of the four is written by a person — which is
 * what makes "an advisor cannot mark their own story good" a property rather
 * than a hope.
 *
 * ---------------------------------------------------------------------------
 * PLATFORM OWNER ONLY. STORE MANAGERS READ, THEY DO NOT REVIEW
 * ---------------------------------------------------------------------------
 * Ryan, 10 November. This function first shipped gated on
 * `is_platform_owner() or rooftop_id in (select managed_rooftops())`, mirroring
 * the read policy — "a second door into the same room needs the same lock",
 * which is 0127's rule about the READ and the wrong rule for this.
 *
 * READING AND REVIEWING ARE NOT THE SAME PERMISSION. A manager reads their
 * rooftop's stories through arm 2 of `advisor_story_read`, and that is
 * untouched: 0127 built it so a manager can see their team's words, and they
 * still can. What they cannot do is MARK one, because a mark decides a leg of
 * somebody's credential and the judgement is Mitch's.
 *
 * ---- WHY THIS IS A HOLE AND NOT A PREFERENCE ------------------------------
 * `managed_rooftops()` is keyed on the CALLER's memberships and the story's
 * rooftop. It says nothing whatsoever about whose story it is. An advisor who
 * also holds a manager row at their own store therefore manages the rooftop
 * their own story is stamped with — so the arm admitted them to review
 * THEMSELVES, straight past the §5 column grants that exist to stop exactly
 * that, and past the "an advisor cannot mark their own story good" property
 * three paragraphs up.
 *
 * NOT HYPOTHETICAL: Valerie Patterson holds a manager row at Beaumont and has
 * three stories there. She could have marked all three Good.
 *
 * ---- WHY THE SUITE DID NOT CATCH IT, WHICH IS THE LESSON ------------------
 * accept:story asserted "REFUSED: the author cannot review their own story"
 * and it passed — because the fixture author is a plain ADVISOR. The test was
 * evidence about the sample it built, stated as a fact about authors. The
 * suite now builds a manager-author at their own rooftop and refuses them by
 * name; it fails if this arm comes back.
 *
 * ---- THE ONE COST, NAMED ---------------------------------------------------
 * A story at a rooftop Mitch has not got to is simply unreviewed. That is the
 * 0127 posture and it is deliberate: review gates nothing until somebody
 * ACTIVELY kicks a story back, so a backlog is never the reason a credential
 * is stuck.
 *
 * NAMING THE ROLES, since a gate written as "only X" has decided something
 * about everybody else:
 *   platform owner  the only caller. Any rooftop, including ones they hold no
 *                   membership at.
 *   manager/admin   REFUSED, 42501 — they read via arm 2 and mark nothing.
 *   advisor/author  REFUSED, and now refused whatever else they hold.
 *   service_role    REFUSED. is_platform_owner() keys on auth.uid(), which is
 *                   null for the backend. Correct: a review is a person's
 *                   judgement with a person's id on it, and nothing
 *                   server-side marks a story.
 *
 * REFUSES 'pending' AS AN INPUT, and that is not pedantry. Returning a story to
 * the queue is the ADVISOR's act — they edit, the trigger below resets it — and
 * a reviewer who could set pending could take a kickback back off the advisor's
 * screen while leaving the leg unmet, which is a state nothing in the product
 * explains. Mitch reversing himself is `good`, not `pending`.
 *
 * 42501 ON NOT FOUND, which deliberately does not distinguish "no such story"
 * from "not yours to review". The alternative tells a caller whether a story id
 * exists at a rooftop they cannot read, which is the read policy leaking through
 * the write path.
 */
create or replace function review_story(
  _story  uuid,
  _status text,
  _note   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  /*
   * THE VALUE CHECK IS FIRST AND IT IS EXPLICIT. Leaving it to the column's
   * CHECK constraint would report a 23514 naming a constraint, which is a
   * Postgres error reaching an admin screen; and 'pending' would pass that
   * constraint happily. Named values, named refusal.
   */
  if _status is null or _status not in ('good', 'kickback') then
    raise exception
      'review_story: status must be good or kickback (got %). pending is the '
      'advisor''s to restore, by editing the story.', coalesce(_status, 'null')
      using errcode = '22023';
  end if;

  update advisor_story s
     set review_status = _status,
         /* An empty note is no note. A reviewer who clears the box means the
            banner should carry no sentence, not an empty paragraph. */
         review_note   = nullif(btrim(coalesce(_note, '')), ''),
         reviewed_by   = auth.uid(),
         reviewed_at   = now()
   where s.id = _story
     and s.retired_at is null
     /*
      * ONE DOOR, AND IT IS NOT THE READ POLICY'S DOOR. See the header: reading
      * and reviewing are different permissions, and a managed_rooftops() arm
      * here would let a manager review their own story.
      */
     and is_platform_owner();

  if not found then
    raise exception 'not permitted to review this story'
      using errcode = '42501';
  end if;
end $$;

comment on function review_story(uuid, text, text) is
  'Mark a Good News Story good or kickback, with an optional note to the '
  'advisor. PLATFORM OWNER ONLY, at any rooftop — store managers READ their '
  'rooftop''s stories (0127 read policy, arm 2) and do not review; reviewing is '
  'Mitch''s. A managed_rooftops() arm would admit an advisor who also holds a '
  'manager row to review their OWN story, which is the hole Ryan closed on '
  '10 November. Refused for managers, authors and the service role. Refuses '
  'pending — returning a story to the queue is the advisor''s act, via the edit '
  'trigger. 0180, replacing 0127''s mark_story_reviewed().';

/* The 0127 function recorded that somebody looked and nothing about what they
   concluded. Dropped rather than left beside its replacement: two ways to
   review would mean a story could be stamped with no outcome, and the outcome
   is now what the leg reads. */
drop function if exists mark_story_reviewed(uuid);

revoke all on function review_story(uuid, text, text) from public, anon;
grant execute on function review_story(uuid, text, text) to authenticated;

-- ---- 4. An edit returns it to the queue, in the database -------------------

/**
 * THE ADVISOR'S REWRITE IS WHAT CLEARS A KICKBACK, and this is where that is
 * true — not in the action that happens to be in front of us.
 *
 * submitStory() is the application path and it is the only one today. It is not
 * the only one possible: advisor_story carries an update policy and a column
 * grant on `body`, so a direct PostgREST update is a thing an advisor's session
 * can do. A reset that lived only in the action would leave that path writing a
 * new body under an old kickback — the story changed, the banner still points at
 * words that are gone, and the leg stays unmet with nothing to do about it.
 *
 * `OF body` so it does not fire on a share toggle or a review stamp: review_story
 * above never names `body`, so marking a story kicked back cannot trip the
 * trigger that un-kicks it.
 *
 * `IS DISTINCT FROM` IS THE LOAD-BEARING HALF. Without it, pressing Save on
 * unchanged text clears the kickback and re-satisfies the leg — a rewrite that
 * rewrote nothing, which is the "I learned a lot" story getting through by a
 * second route. A no-op save is not a rewrite, so it is not a reset.
 */
create or replace function advisor_story_reset_review()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.review_status = 'kickback' and new.body is distinct from old.body then
    new.review_status := 'pending';
    new.review_note   := null;
  end if;
  return new;
end $$;

comment on function advisor_story_reset_review is
  'A rewritten body puts a kicked-back story back in Mitch''s queue and clears '
  'his note. Fires only when `body` is in the SET list AND actually changed, so '
  'neither a share toggle, nor review_story(), nor a no-op Save can clear a '
  'kickback. 0180.';

drop trigger if exists advisor_story_edit_resets_review on advisor_story;
create trigger advisor_story_edit_resets_review
  before update of body on advisor_story
  for each row
  execute function advisor_story_reset_review();

-- ---- 5. The author's columns, and only the author's columns -----------------

/*
 * ---------------------------------------------------------------------------
 * THE UNSAFE UPDATE IS NOT AVOIDED, IT CANNOT BE WRITTEN
 * ---------------------------------------------------------------------------
 * 0127: `grant select, insert, update on advisor_story to authenticated`, with
 * a policy of `user_id = auth.uid()`. Correct then. Since §1 of this migration
 * a column on that row decides a leg of the credential, so the blanket grant is
 * now "the advisor may mark their own story good".
 *
 * Column-level UPDATE privileges, because a policy cannot express this: RLS
 * WITH CHECK sees no OLD row, so "this column did not change" is not something
 * a policy can say. Postgres checks these against the statement's SET list
 * before any policy runs, which makes it the stronger half.
 *
 * A BEFORE TRIGGER IS UNAFFECTED, and that is what lets §4 work: the privilege
 * check is on the columns the STATEMENT names, not on what a trigger does to
 * NEW afterwards. So the advisor's own update of `body` still resets their
 * review_status, through a column they may not name themselves.
 *
 * THE APPLICATION THEREFORE DOES NOT ALSO SET review_status, and the deviation
 * from the brief is deliberate and recorded here. "Belt and braces, the 0161
 * shape" would need a column grant on review_status for `authenticated` — which
 * is the hole, three paragraphs up. A belt that opens the lock it is holding
 * shut is not a belt. The trigger is strictly stronger than the action would
 * have been: it covers submitStory AND the raw update, and accept:story proves
 * both.
 *
 * Nothing is revoked from service_role or from the owner; the definer function
 * above runs as owner and is unaffected by any of this.
 */
revoke update on advisor_story from authenticated;
grant update (
  /* the words */
  body,
  /* when they last changed them — written by submitStory alongside the body */
  updated_at,
  /* their own ruling about who sees it (0127 ruling: sharing is opt-in) */
  shared_to_team,
  /* retire, never delete — 0127 §2b, the author's own withdrawal */
  retired_at,
  retired_reason
) on advisor_story to authenticated;

/*
 * NOT GRANTED, said out loud so the absence is a decision rather than an
 * oversight: review_status, review_note, reviewed_by, reviewed_at (review_story
 * writes all four), and id, user_id, rooftop_id, certification_id, submitted_at
 * (identity and provenance — a story that could change rooftop after the fact
 * would walk out of the manager's view it was written under, which is the whole
 * point of 0127 stamping the rooftop on the row).
 */

-- ---- 6. The leg: a kickback returns it to unmet -----------------------------

/**
 * Has this advisor told the story for this track?
 *
 * THE ONE CHANGE THAT GIVES A KICKBACK TEETH, and it is one line.
 *
 * Put HERE and nowhere else on purpose. This function is what the credential
 * derivation asks during accrual, what the certifications wall asks per tile and
 * what the track page asks — plus loadStoryGate() in lib/story.ts, which carries
 * the same condition for the screens. Spreading "and not kicked back" across
 * those callers is how a leg ends up removed everywhere but one place; the
 * codebase has the scar (`swell.current_len`, defended in the notification layer
 * only, read raw by the screens for twenty-four migrations).
 *
 * `<> 'kickback'` RATHER THAN `in ('pending','good')`, because the column is NOT
 * NULL with a CHECK: a third accepted value added later should default to
 * SATISFYING the leg and be noticed, not silently lock every advisor out of a
 * credential. Failing toward the advisor is the same direction loadStoryGate
 * defaults its flag.
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
       /* 0180 — a kicked-back story does not satisfy the leg. */
       and s.review_status <> 'kickback'
  );
$$;

comment on function my_story_for(uuid) is
  'Does the CALLER have a live, not-kicked-back story for this track? The third '
  'leg of the credential. Takes no user argument — it reads auth.uid(), so it '
  'cannot be pointed at a colleague. 0127, and 0180 for the kickback clause.';

revoke all on function my_story_for(uuid) from public, anon;
grant execute on function my_story_for(uuid) to authenticated, service_role;

-- ---- 7. Two Rollcall kinds -------------------------------------------------

/*
 * lib/events/kinds.ts and this constraint are the same claim twice, and 0163's
 * own header says adding a kind means editing BOTH. Both are edited.
 *
 * story_resubmitted — the advisor rewrote after a kickback. A distinct kind
 *   rather than a second story_submitted, because story_submitted answers "how
 *   many first stories were filed" and counting rewrites in it would make that
 *   number a count of save presses.
 * story_reviewed — Mitch marked one. meta.status carries good|kickback;
 *   app_event.meta is free-form by design (0163: "the COLUMNS are the
 *   contract"), so the outcome needs no column and no second kind.
 *
 * RESTATED IN FULL, not appended to, so the list is readable as a list.
 */
alter table public.app_event
  drop constraint if exists app_event_kind_known;
alter table public.app_event
  add constraint app_event_kind_known check (
    kind in (
      'signed_in',
      'certs_opened',
      'track_opened',
      'lesson_opened',
      'lesson_completed',
      'library_opened',
      'story_submitted',
      /* 0180 */
      'story_resubmitted',
      'story_reviewed'
    )
  );

-- ---- 8. Prove it, both directions ------------------------------------------

/*
 * A REFUSAL IS NOT SELF-VERIFYING, so the ACCEPTANCE half is asserted first and
 * is the half that catches a gate which refuses everything. Run as
 * `authenticated` with a forged JWT claim, because as the owner neither the
 * policies nor the column grants are consulted — and the harness is asserted
 * before the subject, for the reason 0161 records.
 *
 * WHAT THIS PROBE IS FOR, AND WHAT IT IS NOT. The full behaviour is proved over
 * PostgREST, as the roles that really call, by `npm run accept:story` — that is
 * the suite AGENTS.md demands and it is where the platform-owner read, the three
 * reviewer roles and the leg are asserted. This block exists so the migration
 * cannot apply while its own two invariants are broken: the author cannot write
 * review_status, and a rewrite resets a kickback.
 *
 * Everything here is rolled back — the DO block raises at the end to unwind its
 * own fixtures. A migration that leaves acceptance rows behind seeds production.
 */
do $$
declare
  _org      uuid;
  _roof     uuid;
  _user     uuid := gen_random_uuid();
  _cert     uuid;
  _story    uuid;
  _status   text;
  _note     text;
  _refused  text := null;
  _failure  text := null;
begin
  insert into org (name) values ('0180 probe org') returning id into _org;
  insert into rooftop (name, org_id, timezone)
    values ('0180 probe roof', _org, 'America/Chicago') returning id into _roof;
  insert into auth.users (id) values (_user);
  insert into app_user (id, full_name) values (_user, '0180 Probe');
  insert into membership (user_id, rooftop_id, role, active)
    values (_user, _roof, 'advisor', true);
  insert into certification (slug, name, kind, is_core, glyph_key, sort)
    values ('0180-probe-track', '0180 Probe Track', 'craft', false,
            'craft_walk_around', 999)
    returning id into _cert;

  /*
   * THE STORY IS INSERTED AS THE OWNER, deliberately. 0161's insert policy
   * requires the track's gating lessons, and building a film, a module and a
   * completion here would be proving 0161 a second time rather than proving
   * this migration once. What is under test below is the UPDATE path.
   */
  insert into advisor_story (user_id, rooftop_id, certification_id, body)
    values (_user, _roof, _cert, 'the first version')
    returning id into _story;

  select review_status into _status from advisor_story where id = _story;
  if _status is distinct from 'pending' then
    _failure := format(
      '0180 FAILED: a new story defaulted to %s rather than pending, so the '
      'queue would not show it.', coalesce(_status, 'null'));
  end if;

  -- ---- the refusal: the author may not write their own review -------------
  if _failure is null then
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', _user, 'role', 'authenticated')::text, true);

    /* ASSERT THE HARNESS BEFORE ASSERTING THE SUBJECT — as the owner the grant
       is never consulted, so both halves below would be meaningless and the
       refusal half would "pass" while testing nothing. */
    if current_user <> 'authenticated' then
      _failure := format(
        '0180 FAILED: could not become `authenticated` (current_user is %s), so '
        'neither half of this probe exercised the column grants.', current_user);
    end if;
  end if;

  if _failure is null then
    begin
      update advisor_story set review_status = 'good' where id = _story;
      _refused := null;
    exception
      when insufficient_privilege then
        _refused := sqlerrm;
    end;

    if _refused is null then
      _failure :=
        '0180 FAILED: the author marked their own story good. review_status '
        'decides a leg of the credential, so a column grant on it is an advisor '
        'grading their own homework — the defect this migration exists to avoid '
        'creating.';
    end if;

    perform set_config('role', 'postgres', true);
  end if;

  -- ---- the acceptance half, which is the one that catches a dead grant ----
  if _failure is null then
    perform set_config('role', 'authenticated', true);
    begin
      update advisor_story set body = 'the author may still write their words'
       where id = _story;
    exception when others then
      _failure := format(
        '0180 FAILED: the author could not edit their own body (%s). The column '
        'grant has revoked more than it meant to, and an advisor can no longer '
        'write the one record that is supposed to be their own words — a '
        'refusal in the cautious direction, which is how this hides.', sqlerrm);
    end;
    perform set_config('role', 'postgres', true);
  end if;

  -- ---- the trigger: a rewrite returns a kickback to the queue -------------
  if _failure is null then
    update advisor_story
       set review_status = 'kickback', review_note = 'say what you actually did'
     where id = _story;

    perform set_config('role', 'authenticated', true);
    update advisor_story set body = 'and here is what I actually did'
     where id = _story;
    perform set_config('role', 'postgres', true);

    select review_status, review_note into _status, _note
      from advisor_story where id = _story;
    if _status is distinct from 'pending' or _note is not null then
      _failure := format(
        '0180 FAILED: a rewritten body left review_status = %s and the note %s. '
        'The advisor has nothing left to do and the leg stays unmet.',
        coalesce(_status, 'null'), coalesce(quote_literal(_note), 'null'));
    end if;
  end if;

  -- ---- and a no-op save is not a rewrite ---------------------------------
  if _failure is null then
    update advisor_story
       set review_status = 'kickback', review_note = 'still not substantial'
     where id = _story;

    perform set_config('role', 'authenticated', true);
    update advisor_story set body = 'and here is what I actually did'
     where id = _story;
    perform set_config('role', 'postgres', true);

    select review_status into _status from advisor_story where id = _story;
    if _status is distinct from 'kickback' then
      _failure :=
        '0180 FAILED: saving UNCHANGED text cleared the kickback. A rewrite '
        'that rewrote nothing re-satisfies the leg, which is the thin story '
        'getting through by a second route.';
    end if;
  end if;

  if _failure is null then
    raise notice
      '0180 proved, as `authenticated`: refused review_status to the author (%), '
      'accepted their own body, reset a kickback on a real rewrite, and held it '
      'on a no-op save.', _refused;
  end if;

  /* UNWIND. Raising out of a block with an EXCEPTION clause discards every write
     the block made — the only way to roll back inside a DO. */
  raise exception 'ROLLBACK_0180_PROBE: %', coalesce(_failure, 'ok');
exception
  when others then
    if sqlerrm like 'ROLLBACK_0180_PROBE: ok' then
      raise notice '0180 probe fixtures rolled back.';
    elsif sqlerrm like 'ROLLBACK_0180_PROBE: %' then
      raise exception '%',
        substring(sqlerrm from length('ROLLBACK_0180_PROBE: ') + 1);
    else
      raise;
    end if;
end $$;

notify pgrst, 'reload schema';
