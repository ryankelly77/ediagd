-- ============================================================================
-- EDIAGD — 0181 A watch ping files under the same rooftop as its completion
--
-- NUMBERED 0181, NOT 0180. 0180_story_review.sql already exists and is merged;
-- a second 0180 would be two migrations claiming one position, which is the
-- version-label-over-contents failure AGENTS.md names.
--
-- ---------------------------------------------------------------------------
-- THE RULE EXISTS IN TYPESCRIPT AND HAS TO EXIST HERE TOO
-- ---------------------------------------------------------------------------
-- `lib/rooftop-choice.ts` is the other copy. It was written because
-- `completeLibraryItem` and `completeDayAction` disagreed about which of a
-- person's rooftops a record counts against, and because
--
--     membership … eq("active", true) … limit(1)
--
-- with no ORDER BY is not a choice, it is a coin: Postgres may return either
-- row and nothing requires it to return the same one twice.
--
-- `record_watch_progress` (0057) was never brought along. It picks
--
--     order by m.created_at limit 1
--
-- which is deterministic but is a DIFFERENT rule — oldest membership rather
-- than advisor-first. So for anybody holding memberships at two stores, the row
-- the PLAYER writes while a film is playing and the row the COMPLETION writes a
-- moment later could carry different rooftops, on the same film, for the same
-- person. `team_videos_completed` filters on `content_progress.rooftop_id`, so
-- one of the two would be invisible on a manager's Team screen — with no error
-- and no empty state, which is this codebase's named worst failure.
--
-- It is not hypothetical arithmetic: it is the same defect that produced
-- Valerie Patterson's "No videos completed today" on 10 November, one layer
-- down. It has not bitten yet only because every advisor holding two
-- memberships today holds them at ONE rooftop, where the two rules agree.
--
-- ---------------------------------------------------------------------------
-- THE AGREEMENT THIS FUNCTION OWES, STATED SO IT CAN BE CHECKED
-- ---------------------------------------------------------------------------
--     For the same membership rows, choose_rooftop(user) = chooseRooftop(rows).
--
-- `npm run check:rooftop-choice` asserts exactly that sentence: it seeds the
-- membership shapes `scripts/rooftop-choice-scenarios.ts` covers into a local
-- database, calls this function, calls the TypeScript one on the same rows, and
-- exits non-zero on any disagreement. Two copies of a rule with nothing
-- comparing them is how `gating_content_types()` and `GATING_CONTENT_TYPES`
-- would have drifted, and `check:gating` is the shape borrowed here.
--
-- ---------------------------------------------------------------------------
-- WHAT CHANGES IN record_watch_progress: ONE LINE
-- ---------------------------------------------------------------------------
-- The function below is a COPY of the live 0057 body — taken with
-- `pg_get_functiondef`, not retyped from the migration, so it is what is
-- actually running — with exactly one statement replaced. The replaced line is
-- the rooftop select:
--
--   BEFORE   select m.rooftop_id into _rooftop
--              from membership m
--             where m.user_id = _uid and m.active
--             order by m.created_at
--             limit 1;
--
--   AFTER    _rooftop := choose_rooftop(_uid);
--
-- Everything else is untouched and deliberately so: the not-signed-in raise,
-- the no-active-membership raise, the monotonic `greatest()` clamp that stops a
-- replayed or lying client walking progress backwards, the
-- `on conflict (user_id, content_id) do update` shape, the returned jsonb, the
-- `security invoker`, the `set search_path = public`, and the grants.
--
-- COMPLETION IS STILL NOT SET HERE. Crossing the threshold is a transaction —
-- Sand Dollars, badges, possibly a streak — and stays in the server actions
-- where it can be rolled back.
-- ============================================================================

-- ---- 1. The rule, in SQL, once ---------------------------------------------

/**
 * The rooftop a record belongs to, from this person's ACTIVE memberships.
 *
 * ADVISOR FIRST, then manager, then technician, then whatever is left — and
 * inside every arm the tie-break is `rooftop_id` ascending, so the answer does
 * not depend on which row Postgres felt like returning. An advisor membership
 * is the one carrying an op code, a DMS book and a performance record, so it is
 * the rooftop every other number about this person is already keyed to; a
 * manager membership is a permission to read other people's rows, and stamping
 * somebody's own lesson with it files their work under the store they supervise
 * rather than the store they work.
 *
 * NULL when there are no active memberships. The caller says what that means to
 * it — `record_watch_progress` raises, `completeLibraryItem` says "You're not on
 * a rooftop yet" — because the two owe the advisor different sentences.
 *
 * NOT AN ENTITLEMENT CHECK, and it must never be mistaken for one. It answers
 * "which of this person's rooftops owns this record" and assumes the caller has
 * already established that they may create it at all.
 *
 * ---------------------------------------------------------------------------
 * ONE ORDERED SELECT RATHER THAN FOUR, AND WHY THAT IS THE SAME RULE
 * ---------------------------------------------------------------------------
 * The TypeScript sorts by rooftop_id once and then takes the first advisor,
 * else the first manager, else the first technician, else the first row. A
 * single `order by (role rank, rooftop_id) limit 1` produces the same answer
 * for every input, because the minimum over (rank, id) IS the lowest-id row of
 * the lowest-rank role present. Written as four coalesced subqueries it would
 * be four places to edit and three chances to forget one.
 *
 * ---------------------------------------------------------------------------
 * SECURITY DEFINER, AND WHAT THAT DISCLOSES — SAID OUT LOUD
 * ---------------------------------------------------------------------------
 * Definer so that `choose_rooftop(u)` means the same thing to every caller.
 * An invoker version would read `membership` under `membership_read`
 * (self, or a rooftop you manage), so the answer for a given user would depend
 * on WHO ASKED — a server path acting for somebody else would silently get a
 * shorter list and therefore a different rooftop. A rule whose answer depends
 * on the asker is not one rule, and "a gate keyed on a role that excludes the
 * viewer it exists to protect" is the failure this file records five times.
 *
 * The cost, named rather than glossed: an authenticated caller who already
 * knows another person's user id can learn a rooftop id for them. That is one
 * uuid, it is already visible to anyone managing that rooftop through
 * `membership_read`, and it is not a membership list, an op code or a name.
 * EXECUTE is revoked from public and anon and granted to `authenticated` —
 * which it must be, because `record_watch_progress` is security INVOKER and so
 * calls this as the signed-in user — and to `service_role`.
 *
 * `set search_path = public` because a definer function without one resolves
 * names against the caller's path, which is how a definer becomes a way to run
 * somebody else's `membership`.
 */
create or replace function choose_rooftop(_user uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.rooftop_id
    from membership m
   where m.user_id = _user
     and m.active
   order by case m.role
              when 'advisor'    then 1
              when 'manager'    then 2
              /* THE TECHNICIAN ARM IS NOT DEAD CODE. No current caller needs
                 it — the daily action refuses a technician-only account by name
                 before it gets here — but recordGateMetAction, /today and /
                 all prefer technician over the fallback today, and a rule
                 WITHOUT the arm would silently change which rooftop their watch
                 gate is filed at on the day one of them adopts this. Carrying
                 it makes adoption a no-op; dropping it later is a decision
                 somebody has to make out loud. */
              when 'technician' then 3
              /* 'admin' is the only other value of member_role today. The arm
                 is written as `else` rather than naming it, so a role added to
                 the enum tomorrow lands in the fallback deterministically
                 instead of sorting unpredictably. */
              else 4
            end,
            /* THE TIE-BREAK, AND IT IS THE WHOLE POINT. An arbitrary
               tie-break that is the SAME arbitrary tie-break on every read is
               what `limit(1)` never was. */
            m.rooftop_id
   limit 1
$$;

comment on function choose_rooftop(uuid) is
  'Which of this person''s active-membership rooftops a record counts against: '
  'advisor, then manager, then technician, then any, with rooftop_id ascending '
  'as the tie-break inside each arm. NULL when there are no active memberships. '
  'The TypeScript copy is chooseRooftop() in lib/rooftop-choice.ts and the two '
  'must agree for the same rows — npm run check:rooftop-choice asserts it. '
  'NOT an entitlement check. See 0181.';

revoke all on function choose_rooftop(uuid) from public, anon;
grant execute on function choose_rooftop(uuid) to authenticated, service_role;

-- ---- 2. record_watch_progress, with that one line replaced -----------------

/**
 * Record a watch without needing a second round trip to decide insert vs update.
 *
 * MONOTONIC BY CONSTRUCTION: watched_pct only ever increases, because greatest()
 * is applied in the upsert rather than trusted from the caller. A client
 * replaying an old event, or lying, cannot walk somebody's progress backwards.
 *
 * COMPLETION IS NOT SET HERE. Crossing the threshold is a transaction — Sand
 * Dollars, badges, possibly a streak — and that stays in the server actions
 * where it can be rolled back. This only remembers where they got to.
 *
 * THE ROOFTOP IS choose_rooftop(auth.uid()) AS OF 0181, and that is the only
 * change from 0057. It was `order by m.created_at limit 1` — a different rule
 * from the one completeLibraryItem applies, so the playing row and the
 * completing row could disagree for a person with memberships at two stores.
 */
create or replace function record_watch_progress(
  _content_id uuid,
  _pct        int,
  _position   int default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _rooftop uuid;
  _row content_progress;
begin
  if _uid is null then
    raise exception 'record_watch_progress: not signed in';
  end if;

  -- THE ONE CHANGED LINE. Was an inline `select … order by m.created_at
  -- limit 1` over membership; it is now the shared rule, so this function and
  -- completeLibraryItem cannot answer differently for the same person.
  _rooftop := choose_rooftop(_uid);

  if _rooftop is null then
    raise exception 'record_watch_progress: no active membership';
  end if;

  insert into content_progress (user_id, rooftop_id, content_id, watched_pct, position_sec)
  values (_uid, _rooftop, _content_id, greatest(0, least(100, _pct)), _position)
  on conflict (user_id, content_id) do update
    set watched_pct  = greatest(content_progress.watched_pct,
                                greatest(0, least(100, excluded.watched_pct))),
        position_sec = excluded.position_sec
  returning * into _row;

  return jsonb_build_object(
    'watched_pct', _row.watched_pct,
    'position_sec', _row.position_sec,
    'completed', _row.completed_at is not null
  );
end $$;

revoke all on function record_watch_progress(uuid, int, int) from public, anon;
grant execute on function record_watch_progress(uuid, int, int) to authenticated;

-- ---- 3. Assert the structure this migration is responsible for -------------
/*
 * THE CATALOGUE, NOT THE BEHAVIOUR, AND THE DISTINCTION IS 0178'S LESSON.
 * A rule cannot be observed as `postgres`: this connection is the function's
 * owner, so a definer function proves nothing about what a signed-in advisor
 * gets, and a migration that "verified" it here would be testing the one
 * context in which it cannot fail.
 *
 * What this block asserts is that the two functions exist in the shape the rest
 * of the system now assumes — and, crucially, that record_watch_progress
 * ACTUALLY CALLS choose_rooftop. A migration that created the helper and left
 * the old ordering in place would apply cleanly and change nothing, which is
 * the silent success this file exists to refuse.
 *
 * The AGREEMENT between the two copies is asserted by
 * `npm run check:rooftop-choice`, which evaluates both sides on the same rows.
 */
do $$
declare
  _src  text;
  _prov text;
begin
  select pg_get_functiondef(p.oid) into _src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'record_watch_progress';

  if _src is null then
    raise exception '0181: record_watch_progress is missing after this migration';
  end if;

  /*
   * COMMENTS STRIPPED FIRST, BECAUSE THE ASSERTION IS ABOUT THE CODE.
   *
   * pg_get_functiondef returns the source including its comments, and the body
   * above explains the change by QUOTING the line it replaced — so the
   * "created_at is gone" check matched its own prose and this migration refused
   * itself on the first run. The check was right about what it wanted and wrong
   * about what it was reading.
   *
   * Safe as a blunt regexp here because this body has no `--` inside a string
   * literal; if one is ever added, this strip has to become a real parse rather
   * than quietly cutting the literal in half.
   */
  _src := regexp_replace(_src, '--[^' || chr(10) || ']*', '', 'g');

  if _src not like '%choose_rooftop%' then
    raise exception
      '0181: record_watch_progress does not call choose_rooftop. The helper was '
      'created and the old ordering left in place, so nothing changed.';
  end if;

  if _src like '%order by m.created_at%' then
    raise exception
      '0181: record_watch_progress still carries the created_at ordering. Two '
      'rooftop rules in one function is worse than the one it replaced.';
  end if;

  /* The helper's own shape. `stable` and `security definer` are both
     load-bearing — see the note on the function — so a later edit that drops
     either should fail here rather than quietly change who the rule answers
     for. */
  /* provolatile is "char", not text, and `text || "char"` is ambiguous — cast
     it rather than leaning on an implicit resolution that does not exist. */
  select p.prosecdef::text || '/' || p.provolatile::text into _prov
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'choose_rooftop';

  if _prov is null then
    raise exception '0181: choose_rooftop was not created';
  end if;
  if _prov <> 'true/s' then
    raise exception
      '0181: choose_rooftop is %, expected security definer and stable. A '
      'security invoker version answers a different question depending on who '
      'asked, which is not one rule.', _prov;
  end if;

  /* And nothing anonymous may call it. */
  if has_function_privilege('anon', 'choose_rooftop(uuid)', 'execute') then
    raise exception '0181: anon may execute choose_rooftop';
  end if;
  if not has_function_privilege('authenticated', 'choose_rooftop(uuid)', 'execute') then
    raise exception
      '0181: authenticated may NOT execute choose_rooftop, so '
      'record_watch_progress — which is security invoker — will fail for every '
      'signed-in player.';
  end if;
end $$;

notify pgrst, 'reload schema';
