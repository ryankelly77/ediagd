-- ============================================================================
-- EDIAGD — 0179 a manager reads their advisors' module completions
--
-- NOT APPLIED. Written for Ryan to read and apply.
--
-- ---------------------------------------------------------------------------
-- THE RULING CHANGED ON 8 NOVEMBER 2026. THIS IS THE CHANGE, NOT A WORKAROUND.
-- ---------------------------------------------------------------------------
-- Ryan, 8 November: managers and admins see the EDIAGD Certified meter on
-- /admin/engagement — the same meter the evening Slack post carries, drawn from
-- the same `gatingDone / gatingTotal`.
--
-- That REVERSES a ruling and the reversal is stated rather than implied, because
-- two documents disagreeing about the same fact is the bug:
--
--   · 0117's header said "the manager-facing surfaces do not use this: a manager
--     sees a credential pill, which comes from advisor_credential under its own
--     RLS policy, and never a colleague's per-track progress."
--   · `loadCredentialPills` in lib/certifications.ts repeated it — "deliberately
--     NOT the per-track progress. A roster is a list of who holds a credential,
--     not a coaching dashboard about how far through a colleague is."
--
-- Both of those sentences are superseded by this migration and both are REPLACED
-- in the same pull request, not softened. A comment describing a rule the
-- codebase has stopped following is worse than no comment: it instructs the
-- reader not to look.
--
-- What 0117 said about ITSELF still holds and nothing in its body changes.
-- `my_certification_progress()` stays `auth.uid()`-bound and stays SECURITY
-- DEFINER: /certifications is the advisor's own screen, the definer is what
-- keeps the DENOMINATOR a fact about the track rather than about what their
-- rooftop has bought, and a function that accepted `_user uuid` would still hand
-- any signed-in advisor everybody else's progress. The manager-facing read is
-- this policy, over the table, scoped by `managed_users()` — not a parameter on
-- a definer function.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS ACTUALLY MISSING WAS THE NUMERATOR, AND ONLY THE NUMERATOR
-- ---------------------------------------------------------------------------
-- The meter is `gatingDone / gatingTotal`, and loadCertProgress reads every
-- piece of it through the CALLER's own client:
--
--   gatingTotal   certification, certification_course, module, content — all
--                 readable by a manager or admin session today
--   earned        advisor_certification, readable for managed_users() since
--                 0115, which is precisely the credential a manager may see
--   gatingDone    module_completion, OWN ROWS ONLY — the one relation a session
--                 client could not read for anybody but itself
--
-- So a screen drawing the meter through a session client got a confident 0% for
-- an entire roster with no error. That is this codebase's most-repeated defect,
-- and the remedy is the read path, not a heuristic that detects its absence.
--
-- ---------------------------------------------------------------------------
-- SHAPED EXACTLY LIKE advisor_certification_read (0115)
-- ---------------------------------------------------------------------------
-- Same three arms, same order, same `(select ...)` scalar subqueries so the
-- planner hoists them to an InitPlan instead of calling them per row (0027).
-- The credential and the progress behind it now answer the same question about
-- who may see them, which is what makes the row on /admin/engagement coherent:
-- "earned 2 tracks" and "41% of core lessons" are no longer two different
-- permissions wearing one heading.
--
-- ONE SELECT POLICY, NOT TWO THAT HAVE TO AGREE. `module_completion_own` (0035)
-- is select-only, and its whole content — `user_id = (select auth.uid())` — is
-- the second arm below. Two permissive policies are ORed anyway, so leaving it
-- would be a duplicate clause nobody would think to edit in step. It is dropped
-- here and the advisor's own read is carried forward by that arm.
--
-- ---------------------------------------------------------------------------
-- WHO ELSE READS module_completion — ASKED, NOT ASSUMED
-- ---------------------------------------------------------------------------
-- Widening a read policy changes the answer for every caller that was relying
-- on it to do their user-scoping. So the question "who reads module_completion
-- WITHOUT filtering user_id themselves" was answered everywhere before this
-- shipped, and the answer is nobody:
--
--   my_module_progress (0170)        mc.user_id = (select auth.uid()), invoker
--   my_certification_progress (0126) mc.user_id = me.uid, definer
--   my_track_lessons_complete (0161) mc.user_id = (select auth.uid()), definer
--   craftModuleProgress              .eq("user_id", userId), service role
--   loadCertProgress                 .in("user_id", <the roster>)
--
-- Every one of them names its user. None inherits its scope from the policy, so
-- none of them starts counting somebody else's completions today. The two
-- definer functions were already unaffected by the policy in either direction.
--
-- NO WRITE ACCESS CHANGES. There is still no insert, update or delete policy on
-- this table: the service role writes it, through completeModuleIfReady, and the
-- primary key is the pay-once guard. A manager who could write a completion
-- could manufacture a credential for somebody, which is the one thing
-- advisor_certification's "no write policy, and that is the feature" exists to
-- prevent — and it would be pointless to guard the credential and leave the
-- thing it is computed from open.
-- ============================================================================

-- ---- 1. One select policy, scoped to the caller's own book ------------------
drop policy if exists module_completion_read on module_completion;
create policy module_completion_read on module_completion
  for select using (
    (select is_platform_owner())
    or user_id = (select auth.uid())
    or user_id in (select managed_users()));

/* DROPPED AFTER the new one is created, so there is no instant in this
   transaction where an advisor cannot read their own rows. */
drop policy if exists module_completion_own on module_completion;

/* A policy takes no COMMENT in Postgres, so the pointer goes on the table —
   where somebody editing this RLS will actually be standing. */
comment on table module_completion is
  'Which modules a person has finished — every published item done, and where a '
  'published quiz exists, that quiz passed. The row IS the completion; nothing '
  'recomputes the rule from it. WHO MAY READ IT: the person themselves, a '
  'manager or admin at any of their rooftops (managed_users()), and the '
  'platform owner — module_completion_read, 0179, shaped exactly like '
  'advisor_certification_read in 0115 so the credential and the progress behind '
  'it answer the same question about who may see them. That REVERSED 0117''s '
  'ruling, on Ryan''s decision of 8 November 2026, so that /admin/engagement '
  'can draw the same EDIAGD Certified meter the evening Slack post carries. '
  'WHO MAY WRITE IT: the service role and nobody else. There is no insert, '
  'update or delete policy, deliberately — a manager who could write a '
  'completion could manufacture the credential it is computed from.';

-- ---- 2. Assert the structure this migration is responsible for -------------
/*
 * THE ACCEPTANCE HALF IS NOT HERE, AND THAT IS THE POINT OF 0178'S LESSON. A
 * policy cannot be observed as `postgres` — BYPASSRLS means it never runs, so
 * every count comes back complete and a broken policy would look perfect. What
 * this block asserts is the CATALOGUE: the policy exists, it is the three-arm
 * form, the old one is gone, and nothing gained a write policy.
 *
 * The BEHAVIOUR is asserted by `npm run accept:rollcall`, which signs in as a
 * manager and as an admin over PostgREST and checks that each reads a managed
 * advisor's completions, that the figure EQUALS the service client's for the
 * same advisor, and that a manager at another rooftop still reads zero. Both
 * halves, because a refusal is not self-verifying and neither is an acceptance.
 */
do $$
declare
  _qual     text;
  _selects  int;
  _writes   int;
begin
  select pg_get_expr(polqual, polrelid, true) into _qual
    from pg_policy
   where polrelid = 'module_completion'::regclass
     and polname = 'module_completion_read';

  if _qual is null then
    raise exception '0179: module_completion_read does not exist on module_completion';
  end if;

  /* All three arms, named. A policy that kept only the own-rows arm would pass
     a weaker check and leave every meter at 0% — which is the exact failure
     this migration exists to end, and it would report success. */
  if _qual not like '%is_platform_owner%' then
    raise exception
      '0179: module_completion_read does not admit the platform owner. '
      'Expression: %', _qual;
  end if;
  if _qual not like '%auth.uid%' then
    raise exception
      '0179: module_completion_read lost the advisor''s own read — 0035''s '
      'policy is being dropped and nothing is carrying it forward. '
      'Expression: %', _qual;
  end if;
  if _qual not like '%managed_users%' then
    raise exception
      '0179: module_completion_read does not admit managed_users(), so the '
      'manager-facing meter would still read 0%% for everybody. '
      'Expression: %', _qual;
  end if;

  /* ONE select policy. Two would be ORed, which is not wrong in itself — it is
     wrong because the second copy is a clause nobody edits in step. */
  select count(*) into _selects
    from pg_policy
   where polrelid = 'module_completion'::regclass
     and polcmd in ('r', '*');
  if _selects <> 1 then
    raise exception
      '0179: module_completion carries % select policies, expected exactly 1 '
      '(module_completion_read). module_completion_own should have been '
      'dropped in this migration.', _selects;
  end if;

  /* And nothing gained a write. Asserted rather than assumed, because this
     migration touches the policies on the table the credential is computed
     from, and "no write policy" is load-bearing. */
  select count(*) into _writes
    from pg_policy
   where polrelid = 'module_completion'::regclass
     and polcmd in ('a', 'w', 'd');
  if _writes <> 0 then
    raise exception
      '0179: module_completion gained % write policies. The service role '
      'writes this table and nobody else — a manager who could write a '
      'completion could manufacture a credential.', _writes;
  end if;

  raise notice
    '0179: module_completion_read admits owner, self and managed_users(); one '
    'select policy, no write policies. Behaviour is asserted by '
    'npm run accept:rollcall, as a manager and as an admin over PostgREST.';
end $$;

notify pgrst, 'reload schema';
