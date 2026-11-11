-- ============================================================================
-- EDIAGD — 0181 a manager reads the op code catalog
--
-- NOT APPLIED. Written for Ryan to read and apply, from the ~/ediagd main
-- checkout. This branch never applies a migration: `.env.local` here points at
-- production, and `db:migrate` run from this worktree would put a branch
-- migration straight onto the live database.
--
-- ---------------------------------------------------------------------------
-- THE FIFTH INSTANCE OF A GATE THAT EXCLUDES THE VIEWER IT EXISTS TO SERVE
-- ---------------------------------------------------------------------------
-- `op_code_catalog_read` (0081) gates on:
--
--     (select is_platform_owner()) or exists (select 1 from admin_rooftops())
--
-- and `admin_rooftops()` (0045) is the platform owner, `role = 'admin'`, and the
-- `group_owner` org role. MANAGER IS NOT ON THAT LIST.
--
-- So the Manager Meetings screen — whose entire audience is managers — cannot
-- read the NAME of the op code its film teaches. A manager querying
-- `op_code_catalog` gets zero rows and NO ERROR, which is this codebase's
-- most-repeated defect: a confident wrong answer that nothing looks for.
-- `manager_meeting_op_code`'s own policy (0168) does admit managers, so today
-- the association is readable while the thing it points at is not.
--
-- AGENTS.md has now named this sub-pattern four times — `has_performance_surface()`
-- keyed on auth.uid() shutting out the service role, `op_code_family` read as
-- the advisor in pickPitch, `dms_advisor_read` omitting the advisor it protects,
-- and `module_completion` reading 0% for a whole roster in 0179. This is the
-- fifth, and it is being fixed BEFORE the surface that would have hit it is
-- built, which is the only cheap time.
--
-- Ruling H, Ryan: widen the catalog read to `managed_rooftops()`, in its own
-- slice with its own migration.
--
-- ---------------------------------------------------------------------------
-- WHY WIDENING DISCLOSES NOTHING, WHICH IS WHAT MAKES THIS THE CHEAP FIX
-- ---------------------------------------------------------------------------
-- `op_code_catalog` holds a code, a sort order, a category, a name, piggyback
-- partners and notes — 73 rows of REFERENCE DATA with no per-store numbers and
-- no per-person numbers in it at all. A manager reading it learns what an op
-- code is called. It is not a measurement about anybody.
--
-- The alternative was copying the name onto the serve row at serve time. That
-- would be a SECOND DEFINITION of what a code is called, and it would drift the
-- first time Mitch renames one — the same defect 0178 spent a whole migration
-- managing down to "two copies and a check". Better not to create the second
-- copy than to police it.
--
-- ---------------------------------------------------------------------------
-- TWO ARMS, NOT THREE — AND THE MISSING ARM IS STATED RATHER THAN INVENTED
-- ---------------------------------------------------------------------------
-- 0179 is this migration's model and its policy has three arms:
--
--     (select is_platform_owner())
--     or user_id = (select auth.uid())        <-- the caller's own rows
--     or user_id in (select managed_users())
--
-- The middle arm HAS NO REFERENT HERE. `module_completion` has a `user_id`, so
-- a row belongs to somebody and "your own" is a meaningful scope. The op code
-- catalog has no owner column and no owner: a row is a fact about a code, not
-- about a person. There is nothing for an own-scope arm to compare.
--
-- Writing one anyway would mean inventing a scope — `my_rooftops()` is the only
-- candidate, and it would admit every advisor and technician with a membership,
-- which is precisely what 0081 closed this table to and what ruling H did NOT
-- ask for. So the arm is absent, and absent on purpose, recorded here so a
-- later reader does not "restore" it from 0179 believing it was dropped by
-- accident.
--
-- What DOES transfer from 0179, and is followed exactly:
--   · the owner arm first, then the scope arm
--   · `(select ...)` around the scalar call, so the planner hoists it to an
--     InitPlan and evaluates it once instead of per row (0027)
--   · ONE select policy on the table, not two that have to agree
--   · a catalogue assertion block that names every arm, so a policy that
--     silently lost one cannot pass
--   · the stale commentary replaced IN THE SAME CHANGE, not softened
--
-- ---------------------------------------------------------------------------
-- THE INLINE `exists` SHAPE IS KEPT, AND 0178 IS WHY
-- ---------------------------------------------------------------------------
-- 0178 measured, on production as a Beaumont advisor, that moving an
-- entitlement predicate out of an inline `EXISTS` and into a shared SQL
-- function cost 4.5x-5.2x on every read of `content` — because an inline
-- `EXISTS` inside an RLS qual is compiled into the plan's InitPlan / hashed
-- SubPlan machinery and evaluated ONCE, and a function call cannot be folded
-- into that, so it runs per row.
--
-- `exists (select 1 from managed_rooftops())` is UNCORRELATED — it does not
-- reference the row — so it is hoisted to an InitPlan and the per-row cost is
-- zero. This is the same shape the policy already had and the same shape its
-- three siblings in 0081 still have. It is kept deliberately.
--
-- STATED SO NOBODY "IMPROVES" IT LATER: do not refactor op_text_rule_read,
-- op_code_catalog_read, op_code_family_read and mapping_alias_read onto one
-- shared predicate function. That is the exact move 0178 measured and reverted,
-- and a second remedy it tried — hoisting behind `= any(...)` — measured worse
-- than the thing it was fixing. Four similar policies is not duplication worth
-- paying for.
--
-- ---------------------------------------------------------------------------
-- THE PLATFORM OWNER ARM IS LOAD-BEARING, AND DROPPING IT WOULD BE THIS SAME BUG
-- ---------------------------------------------------------------------------
-- `managed_rooftops()` is NOT a superset of `admin_rooftops()`. admin_rooftops
-- opens with `select r.id from rooftop r where is_platform_owner()` — every
-- rooftop, for the owner, with no membership required. managed_rooftops has no
-- such arm: it is membership plus org roles only.
--
-- So a platform owner holding no `membership` row gets NOTHING from
-- managed_rooftops(), and a policy that replaced both arms with it would lock
-- the owner out of the catalog. That is the identical defect this migration is
-- fixing, introduced while fixing it. The `is_platform_owner()` arm stays.
--
-- ---------------------------------------------------------------------------
-- EVERY ROLE NAMED, INCLUDING THE TWO REVISION 2 OF THE PLAN MISSED
-- ---------------------------------------------------------------------------
--   platform owner   reads, via its own arm (see above)
--   admin            reads — membership role 'admin' is in managed_rooftops(),
--                    and separately through op_code_catalog_admin, which is
--                    `for all` and so grants select too. Doubly covered before
--                    and after; nothing about admin changes here.
--   manager          READS, NEWLY. The point of the migration.
--   group_owner      reads, as before — in both helpers
--   group_manager    READS, NEWLY, AND THIS IS A DECISION, NOT A SIDE EFFECT.
--                    `admin_rooftops()` excludes group_manager deliberately;
--                    0045: "running several stores is not the same as
--                    administering the account, and the admin surfaces carry
--                    pricing, gamification settings and the DMS importer."
--                    None of pricing, settings or the importer is in this
--                    table. Ryan accepted this as written on 10 November 2026.
--                    The alternative — a bespoke predicate admitting manager
--                    but not group_manager — would be a third definition of
--                    "manages this rooftop", and is refused for that reason.
--   advisor          still reads NOTHING. Unchanged, and asserted below.
--   technician       still reads NOTHING. Unchanged, and asserted below.
--   service_role     unaffected: it bypasses RLS entirely, so no policy here
--                    has ever applied to it.
--
-- ---------------------------------------------------------------------------
-- WHO ELSE READS op_code_catalog — ASKED, NOT ASSUMED
-- ---------------------------------------------------------------------------
-- AGENTS.md: "a defect you find is a class, not an instance" — so before
-- widening a read policy, the question is which callers were relying on it to
-- do their scoping for them. Answered across the repo:
--
--   lib/admin/op-codes.ts        admin screens, already admin-gated in the app
--   lib/dms/*                    importer and remap, SERVICE ROLE — bypasses RLS
--   op_code_family_live          read by ensureBlockForToday() with the SERVICE
--                                client (0081 verified this; 0067 gives
--                                coaching_block no user-facing insert policy)
--   advisor_family_attach        SECURITY DEFINER since 0081 section 7, so it
--                                reads its inputs as the owner, not the caller
--   scripts/*                    service role
--
-- NOBODY inherits a row-level scope from this policy, because the table has no
-- per-store or per-person rows to scope: all 73 rows are global reference data,
-- and every caller that reads it either already gates in the app layer or runs
-- as a role the policy does not apply to. So no existing surface starts showing
-- a manager something it was filtering out — there was nothing to filter.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS MIGRATION DOES NOT CHANGE
-- ---------------------------------------------------------------------------
-- `op_code_family` STAYS EXACTLY AS IT IS, and that is asserted below rather
-- than merely intended. Under the family-grain ruling (A) the meeting screen
-- never needs it: `family` is plain text on `advisor_family_attach` and
-- `family_store_benchmark`, both already manager-readable. Only the definer
-- function reads `op_code_family`, and it runs as its owner. Same for
-- `op_text_rule` and `mapping_alias` — untouched.
--
-- NO WRITE ACCESS CHANGES — AND THE FIRST DRAFT OF THIS PARAGRAPH WAS WRONG,
-- WHICH IS WORTH KEEPING RATHER THAN QUIETLY CORRECTING.
--
-- It said "there is no insert, update or delete policy on op_code_catalog".
-- There is. `op_code_catalog_admin` (0062) is `for select/insert/update/delete`
-- — declared `for all` — so an active `membership.role = 'admin'` has ALWAYS
-- been able to write this table. The claim was reached by grepping for
-- `op_code_catalog_read` and reporting what came back as the whole picture:
-- evidence about one policy, stated as a fact about the table. AGENTS.md
-- already names that ("a sample is evidence about the sample"), and it was
-- caught only by listing `pg_policy` on the live local database.
--
-- What is actually true, and what this migration guarantees:
--
--   · READ widens: manager and group_manager gain select. That is the change.
--   · WRITE does not move. `op_code_catalog_admin` keys on
--     `membership.role = 'admin'` and is NOT TOUCHED here, so a manager gains
--     no insert, update or delete. Asserted below, because "the read widened
--     and the write did not" is the entire safety claim of this migration and
--     it must not rest on the DDL below merely not mentioning writes.
--   · The service role bypasses RLS, which is how `scripts/seed-op-codes.ts`
--     re-seeds Mitch's revisions from `data/op_code_seed.csv`.
--
-- A manager who could write this table could rename the code a film teaches,
-- silently re-pointing every surface that joins on it. That is why the write
-- side is asserted rather than assumed.
--
-- ---------------------------------------------------------------------------
-- A `for all` POLICY IS A WRITE POLICY, AND THE OBVIOUS CHECK MISSES IT
-- ---------------------------------------------------------------------------
-- The natural way to assert "nothing gained a write" — and the way 0179 writes
-- it — is:
--
--     select count(*) from pg_policy
--      where polrelid = '<table>'::regclass and polcmd in ('a','w','d');
--
-- `polcmd` for a `for all` policy is `*`, not `a`/`w`/`d`. So that query
-- returns ZERO for a table whose admins hold full write access, and the
-- assertion passes while reporting the opposite of the truth — a false pass,
-- which this codebase has recorded as the harder kind to catch because it
-- looks like success.
--
-- 0179 was CORRECT on `module_completion`: that table carries exactly one
-- policy and it is select-only, so there was no `for all` to miss. The idiom
-- was right there and is unsafe to copy. Measured on the local database at
-- 0180: **25 tables in `public` carry a `for all` policy**, and
-- `op_code_catalog` is one of them. The check below counts `'*'` as a write.
--
-- The question this is an answer to, recorded per AGENTS.md so it survives:
-- WHICH OTHER ASSERTIONS COUNT WRITE POLICIES WITHOUT COUNTING `*`? Answered
-- for the two tables this migration touches. The other 23 are a sweep this
-- change is too small to carry, and the question is written down here rather
-- than left unasked.
--
-- ---------------------------------------------------------------------------
-- THE BEHAVIOUR IS NOT ASSERTED IN THIS FILE, AND THAT IS 0178's LESSON
-- ---------------------------------------------------------------------------
-- A policy CANNOT be observed as `postgres`: BYPASSRLS means it never runs, so
-- every count comes back complete and a broken policy looks perfect. Setting
-- `request.jwt.claims` alone moves auth.uid() and leaves the bypass in place.
-- What this file asserts is the CATALOGUE — the policy exists, it has both
-- arms, admin_rooftops is gone, there is exactly one select policy, nothing
-- gained a write, and the sibling policies are untouched.
--
-- The BEHAVIOUR is asserted by:
--
--     npm run accept:catalog-read
--
-- which signs in over PostgREST as a fixture user holding `role = 'manager'`
-- AND NOTHING ELSE and reads the catalog, and as a technician fixture and reads
-- zero. Both halves, because a refusal is not self-verifying and neither is an
-- acceptance. The manager-only fixture is the whole point: Beaumont's two real
-- managers may also hold `admin`, and a suite signing in as them would pass in
-- the one context where this gate cannot fail.
-- ============================================================================

-- ---- 1. The read widens to managed_rooftops() ------------------------------
/*
 * Owner arm first, then the managed-rooftop arm. `(select ...)` around
 * is_platform_owner() and an uncorrelated `exists` around managed_rooftops(),
 * so both are InitPlans evaluated once per query rather than once per row.
 */
drop policy if exists op_code_catalog_read on op_code_catalog;
create policy op_code_catalog_read on op_code_catalog
  for select using (
    (select is_platform_owner()) or exists (select 1 from managed_rooftops())
  );

-- ---- 2. The pointer goes on the table, where the next editor is standing ---
/*
 * A policy takes no COMMENT in Postgres, so this is the only place a reader of
 * the schema will meet the rule. 0179's practice.
 */
comment on table op_code_catalog is
  'Mitch''s op code catalog — 73 codes, each with a category, a name and its '
  'piggyback partners. Global REFERENCE DATA: no per-store and no per-person '
  'numbers, which is what makes it safe to read widely. WHO MAY READ IT: the '
  'platform owner, and anybody managing a rooftop — manager, admin, '
  'group_owner and group_manager, via managed_rooftops() — under '
  'op_code_catalog_read, widened by 0181 from 0081''s admin_rooftops() on '
  'Ryan''s ruling H of 10 November 2026, because the Manager Meetings screen '
  'could not read the name of the op code its own film teaches. Advisors and '
  'technicians still read nothing. NOTE group_manager gains access here that '
  'admin_rooftops() withholds on purpose; that is accepted, because 0045''s '
  'reason for withholding it is pricing, settings and the DMS importer, none '
  'of which is in this table. WHO MAY WRITE IT: an active membership with '
  'role = ''admin'', through op_code_catalog_admin (0062, declared FOR ALL, so '
  'it covers select as well as the three writes), plus the service role, which '
  'bypasses RLS and is how scripts/seed-op-codes.ts re-seeds Mitch''s '
  'revisions. 0181 widened the READ ONLY and left that write policy untouched: '
  'a manager who could rename a code would silently re-point every surface '
  'that joins on it. op_code_family, op_text_rule and mapping_alias are NOT '
  'widened and remain admin_rooftops() — the meeting screen reads family as '
  'plain text off advisor_family_attach and never needs the mapping.';

-- ---- 3. Assert the structure this migration is responsible for -------------
/*
 * The catalogue half only. See the header for why the behaviour cannot be
 * asserted from here, and where it IS asserted.
 */
do $$
declare
  _qual     text;
  _selects  int;
  _writes   int;
  _admin    text;
  _family   text;
begin
  select pg_get_expr(polqual, polrelid, true) into _qual
    from pg_policy
   where polrelid = 'op_code_catalog'::regclass
     and polname = 'op_code_catalog_read';

  if _qual is null then
    raise exception
      '0181: op_code_catalog_read does not exist on op_code_catalog';
  end if;

  /* Both arms, named. A policy that kept only the managed arm would lock out a
     platform owner holding no membership row — the same defect this migration
     exists to fix, reintroduced while fixing it. */
  if _qual not like '%is_platform_owner%' then
    raise exception
      '0181: op_code_catalog_read does not admit the platform owner. '
      'managed_rooftops() has no is_platform_owner() arm of its own, so '
      'dropping this one locks the owner out of the catalog. Expression: %',
      _qual;
  end if;
  if _qual not like '%managed_rooftops%' then
    raise exception
      '0181: op_code_catalog_read does not admit managed_rooftops(), so a '
      'manager still reads zero rows and the meeting screen still cannot name '
      'the op code its film teaches. Expression: %', _qual;
  end if;

  /* And the OLD predicate is gone. Without this the migration could leave
     `admin_rooftops() or managed_rooftops()` and pass every check above while
     being a confusing no-op — two predicates where one is a strict subset of
     the other in every case that matters. */
  if _qual like '%admin_rooftops%' then
    raise exception
      '0181: op_code_catalog_read still references admin_rooftops(). The '
      'widening replaces that predicate rather than adding to it. '
      'Expression: %', _qual;
  end if;

  /* ONE select-only policy. Two would be ORed, which is not wrong in itself —
     it is wrong because the second copy is a clause nobody edits in step.
     Counted as polcmd = 'r' exactly: op_code_catalog_admin is `for all` and
     therefore also grants select, legitimately and since 0062, so counting
     `'*'` here would make this assertion fail on a correct schema. */
  select count(*) into _selects
    from pg_policy
   where polrelid = 'op_code_catalog'::regclass
     and polcmd = 'r';
  if _selects <> 1 then
    raise exception
      '0181: op_code_catalog carries % select-only policies, expected exactly '
      '1 (op_code_catalog_read).', _selects;
  end if;

  /* WRITE DID NOT MOVE, which is this migration's whole safety claim.
   *
   * `'*'` IS IN THIS LIST ON PURPOSE. A `for all` policy grants all three
   * writes and reports polcmd = '*', so the common form of this check —
   * `polcmd in ('a','w','d')`, which is how 0179 writes it — returns zero for
   * a table whose admins have full write access. On this table that would be a
   * FALSE PASS: op_code_catalog_admin has been `for all` since 0062.
   *
   * Expected: exactly one, op_code_catalog_admin, still keyed on
   * membership.role = 'admin'. Anything else means the widening leaked from
   * the read side into the write side. */
  select count(*) into _writes
    from pg_policy
   where polrelid = 'op_code_catalog'::regclass
     and polcmd in ('a', 'w', 'd', '*');
  if _writes <> 1 then
    raise exception
      '0181: op_code_catalog carries % write-capable policies, expected '
      'exactly 1 (op_code_catalog_admin, FOR ALL, from 0062). This migration '
      'widens the READ only.', _writes;
  end if;

  select pg_get_expr(polqual, polrelid, true) into _admin
    from pg_policy
   where polrelid = 'op_code_catalog'::regclass
     and polname = 'op_code_catalog_admin';

  if _admin is null then
    raise exception
      '0181: op_code_catalog_admin has gone missing. 0181 must not touch the '
      'write policy — dropping it would take admin write access away with it.';
  end if;
  /* Keyed on role = 'admin' and NOT on managed_rooftops(). If the widening had
     been applied to the wrong policy, a manager would be able to rename the op
     code a film teaches, and every join against it would silently re-point. */
  if _admin like '%managed_rooftops%' then
    raise exception
      '0181: op_code_catalog_admin now references managed_rooftops(), so a '
      'MANAGER CAN WRITE THE CATALOG. The widening belongs on the read policy '
      'only. Expression: %', _admin;
  end if;
  if _admin not like '%admin%' then
    raise exception
      '0181: op_code_catalog_admin no longer restricts to admin. '
      'Expression: %', _admin;
  end if;

  /* The sibling is UNCHANGED. This migration widens one table, and the plan
     says op_code_family stays admin-scoped because the family arrives as plain
     text on views a manager can already read. Asserted so an over-wide edit —
     the easy mistake, since the two policies are adjacent in 0081 and
     identical — fails here rather than quietly handing out the mapping. */
  select pg_get_expr(polqual, polrelid, true) into _family
    from pg_policy
   where polrelid = 'op_code_family'::regclass
     and polname = 'op_code_family_read';

  if _family is null then
    raise exception
      '0181: op_code_family_read has gone missing. This migration must not '
      'touch op_code_family.';
  end if;
  if _family not like '%admin_rooftops%' then
    raise exception
      '0181: op_code_family_read no longer gates on admin_rooftops(). Only '
      'op_code_catalog widens in this migration — the meeting screen reads '
      'family as plain text and never needs the mapping. Expression: %',
      _family;
  end if;

  raise notice
    '0181: op_code_catalog_read admits the platform owner and '
    'managed_rooftops(); admin_rooftops() is gone; one select-only policy; '
    'write still admin-only via op_code_catalog_admin (FOR ALL, 0062); '
    'op_code_family_read unchanged. Behaviour is asserted by '
    'npm run accept:catalog-read, as a manager-only fixture user and as a '
    'technician, over PostgREST.';
end $$;

notify pgrst, 'reload schema';
