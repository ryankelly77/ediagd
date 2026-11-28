-- ============================================================================
-- EDIAGD — 0185 The open stamp can reach its row
--
-- ---------------------------------------------------------------------------
-- WHAT WAS WRONG, AND WHY NOTHING EVER SAID SO
-- ---------------------------------------------------------------------------
-- `mark_push_opened` is the only thing that separates "they opened the app at
-- 12:04" from "they opened the app BECAUSE we asked them to". It has never
-- once worked.
--
-- It was declared `security invoker`, so its UPDATE runs as the advisor. And
-- `notification_outbox` carries only SELECT policies — there is no UPDATE
-- policy on it at all. An UPDATE under RLS with no permitting policy does not
-- raise; it matches zero rows. So the function ran, updated nothing, returned
-- `{"stamped": false}`, and `/today` discarded the result.
--
-- Measured on 24 November 2026 against a real advisor, the same statement,
-- three roles:
--
--     authenticated  (the only role that calls it)   0 rows
--     postgres       (RLS bypassed)                  1 row
--     service_role                                   1 row
--
-- Every predicate matched first — kind, status='sent', local_date=my_today(),
-- opened_at is null, and the advisor could SELECT the row. The write was the
-- only thing that could not land.
--
-- ---------------------------------------------------------------------------
-- THE GRANT IS WHAT MADE IT SILENT, AND THAT IS THE PART WORTH REMEMBERING
-- ---------------------------------------------------------------------------
-- `authenticated` HAS the table-level UPDATE privilege on notification_outbox.
-- If it did not, this would have raised `permission denied for table` on the
-- first call in September and been fixed that afternoon.
--
-- Privilege and policy are two different gates and they fail differently: a
-- missing GRANT is an error, a missing POLICY is an empty result. The
-- combination present here — grant yes, policy none — is the one that produces
-- a confident wrong answer instead of a crash.
--
-- ---------------------------------------------------------------------------
-- DEFINER RATHER THAN A NEW UPDATE POLICY, DELIBERATELY
-- ---------------------------------------------------------------------------
-- The obvious fix is `create policy ... for update using (recipient_id =
-- auth.uid())`. It would work and it grants too much: an advisor would then be
-- able to UPDATE ANY COLUMN of their own outbox rows — status, sent_at,
-- device_count, deep_link, dedup_key. The outbox is the record of what the
-- system decided and what it did; a recipient must not be able to edit it.
--
-- `security definer` on a function whose entire body is one UPDATE of one
-- column keeps the writable surface at exactly that column. The function
-- already filtered on `auth.uid()` for the whole of its life — that predicate
-- was load-bearing and untested, and from here it is the only thing standing
-- between an advisor and somebody else's row, so it is tested below as its own
-- case rather than assumed.
--
-- There is also no recipient parameter and there must never be one. The caller
-- cannot name a row; it can only say which KIND of its own reminder it opened.
-- ============================================================================

create or replace function mark_push_opened(_kind outbox_kind)
returns jsonb
language plpgsql
security definer
/* Fixed, because a definer function without one resolves unqualified names
   through the caller's search_path, and the caller is a web request. */
set search_path = public
as $$
declare _uid uuid := auth.uid(); _n int;
begin
  /* No session, nothing to stamp. First, because everything below trusts
     _uid to be the caller and a null here would widen the UPDATE to every
     advisor at once — which under DEFINER would actually succeed. */
  if _uid is null then return jsonb_build_object('stamped', false); end if;

  update notification_outbox
     set opened_at = now()
   /* THE ONLY GUARD THERE IS, now that RLS is bypassed. */
   where recipient_id = _uid
     and kind = _kind
     and local_date = my_today()
     and status = 'sent'
     /* Once only. An open is the FIRST time they came back; re-rendering
        /today must not keep moving the timestamp forward. */
     and opened_at is null;

  get diagnostics _n = row_count;
  return jsonb_build_object('stamped', _n > 0);
end $$;

/*
 * The grant to `authenticated` is unchanged — that is the role that calls it.
 *
 * The revoke is new and is not a change of intent. 0103 granted to
 * authenticated without revoking first, and PostgreSQL grants EXECUTE on a new
 * function to PUBLIC by default, so `anon` has been able to call this all
 * along. That was harmless while the body was invoker and auth.uid() was null
 * for anon. It is not harmless on a definer function: the null guard is now
 * the only reason an anonymous call does nothing, and a guard inside the body
 * is a worse place for that answer than the privilege system.
 */
revoke all on function mark_push_opened(outbox_kind) from public, anon;
grant execute on function mark_push_opened(outbox_kind) to authenticated;

comment on function mark_push_opened(outbox_kind) is
  'Stamps opened_at on the caller''s own sent reminder of this kind for their '
  'store-today, once. SECURITY DEFINER since 0185 because notification_outbox '
  'has no UPDATE policy and the invoker form silently matched zero rows for '
  'every advisor from 0103 until then - opened_at is null for every reminder '
  'sent before that deploy and cannot be reconstructed. recipient_id = '
  'auth.uid() is the only guard; there is no recipient parameter and there '
  'must not be one.';

-- ---------------------------------------------------------------------------
-- APPLY-TIME CHECK — BEHAVIOURAL, AND AS THE ROLE THAT WILL REALLY CALL IT
-- ---------------------------------------------------------------------------
-- Reading the function definition back would prove nothing: the broken version
-- and the fixed one differ by one word, and the broken one was syntactically
-- perfect for two months. So this builds two advisors, gives each a sent
-- reminder, and calls the real function as `authenticated` with each one's own
-- JWT claim.
--
-- Three cases, and the middle one is the reason DEFINER needs watching:
--
--   1. an advisor stamps their OWN row                     -> stamped, 1 row
--   2. that same call leaves the OTHER advisor's row alone  -> still null
--   3. anon cannot execute it at all                        -> refused
--
-- Case 1 is the acceptance half and is what the whole migration is for. Case 2
-- is the half that only matters now: under `invoker` the RLS that was blocking
-- everything was also, incidentally, blocking cross-advisor writes. That
-- accident is gone and `recipient_id = _uid` is carrying the load alone.
do $$
declare
  _rid   uuid := gen_random_uuid();
  _a     uuid := gen_random_uuid();
  _b     uuid := gen_random_uuid();
  _ma    uuid;
  _mb    uuid;
  _res   jsonb;
  _a_open timestamptz;
  _b_open timestamptz;
  _anon_refused boolean := false;
  _note  text := null;
begin
  begin
    insert into rooftop (id, org_id, name, timezone)
    select _rid, o.id, 'ZZ 0185 Rooftop', 'America/Chicago'
      from org o order by o.id limit 1;

    insert into auth.users (id, aud, role, email, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    values (_a, 'authenticated', 'authenticated',
            'zz-0185-a-' || _a || '@example.invalid', now(), now(), '{}'::jsonb, '{}'::jsonb),
           (_b, 'authenticated', 'authenticated',
            'zz-0185-b-' || _b || '@example.invalid', now(), now(), '{}'::jsonb, '{}'::jsonb);

    insert into app_user (id, full_name)
    values (_a, 'ZZ 0185 Advisor A'), (_b, 'ZZ 0185 Advisor B');

    insert into membership (user_id, rooftop_id, role, active)
    values (_a, _rid, 'advisor', true) returning id into _ma;
    insert into membership (user_id, rooftop_id, role, active)
    values (_b, _rid, 'advisor', true) returning id into _mb;

    /* One sent, unopened reminder each, on their own store-today. */
    insert into notification_outbox
      (membership_id, recipient_id, rooftop_id, kind, channel, status,
       title, body, deep_link, scheduled_for, local_date, local_time,
       rationale, dedup_key, sent_at, device_count)
    values
      (_ma, _a, _rid, 'streak_keeper', 'push', 'sent',
       'ZZ 0185 A', 'body', '/today?opened_via=streak_saver',
       now() - interval '1 hour', rooftop_today(_rid), '12:00',
       'ZZ 0185 fixture', 'zz-0185-a-' || _a, now() - interval '1 hour', 1),
      (_mb, _b, _rid, 'streak_keeper', 'push', 'sent',
       'ZZ 0185 B', 'body', '/today?opened_via=streak_saver',
       now() - interval '1 hour', rooftop_today(_rid), '12:00',
       'ZZ 0185 fixture', 'zz-0185-b-' || _b, now() - interval '1 hour', 1);

    -- ---- 1 and 2: advisor A, as `authenticated`, with A's own claim --------
    set local role authenticated;
    set local request.jwt.claims = '{"role":"authenticated"}';
    perform set_config('request.jwt.claims',
                       json_build_object('sub', _a, 'role', 'authenticated')::text,
                       true);
    _res := mark_push_opened('streak_keeper');
    reset role;
    perform set_config('request.jwt.claims', null, true);

    select opened_at into _a_open from notification_outbox where recipient_id = _a;
    select opened_at into _b_open from notification_outbox where recipient_id = _b;

    -- ---- 3: anon may not execute it at all --------------------------------
    begin
      set local role anon;
      perform mark_push_opened('streak_keeper');
      reset role;
    exception when insufficient_privilege then
      _anon_refused := true;
      reset role;
    end;

    raise exception 'ZZ_0185_ROLLBACK';
  exception when others then
    if sqlerrm <> 'ZZ_0185_ROLLBACK' then
      /* The harness broke — a schema change upstream, a trigger, no org. That
         is not a pass and must not be reported as one. */
      _note := sqlerrm;
    end if;
  end;

  if _note is not null then
    raise exception '0185: the acceptance fixture could not be built: %', _note;
  end if;

  if coalesce((_res->>'stamped')::boolean, false) is not true then
    raise exception
      '0185: an advisor calling mark_push_opened for their OWN sent reminder '
      'got stamped=% — the stamp still cannot reach its row, which is the '
      'whole of what this migration is for', coalesce(_res::text, 'null');
  end if;

  if _a_open is null then
    raise exception
      '0185: mark_push_opened reported success and opened_at is still null — '
      'the return value and the row disagree';
  end if;

  if _b_open is not null then
    raise exception
      '0185: advisor A''s call stamped advisor B''s reminder. SECURITY DEFINER '
      'bypasses RLS, so recipient_id = auth.uid() is the only guard and it is '
      'not holding';
  end if;

  if not _anon_refused then
    raise exception
      '0185: anon can still execute mark_push_opened — the default PUBLIC '
      'EXECUTE grant was not revoked, and the body is now definer';
  end if;

  raise notice
    '0185: advisor stamps own reminder (1 row), leaves another advisor''s '
    'alone, anon refused';
end $$;

notify pgrst, 'reload schema';
