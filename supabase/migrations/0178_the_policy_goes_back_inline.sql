-- ============================================================================
-- EDIAGD — 0178 the policy goes back inline, and the two copies get a check
--
-- NOT APPLIED. Written for Ryan to read and apply.
--
-- 0177 was right about the construction and wrong about the cost. It put the
-- entitlement predicate in ONE place — `content_entitled_for` — and pointed
-- both the RLS policy and `advisor_family_film_progress` at it, so the two
-- could not drift. Then it made every read of `content` about five times
-- slower.
--
-- MEASURED ON PRODUCTION, as a Beaumont advisor, 15 timed runs after 3
-- discarded warm-ups, medians. A control on a table this change does not touch
-- is included because two "wins" on this project have turned out to be samples
-- from different windows:
--
--                                          before     after    ratio
--   shelf content read, 49 ids             4.56 ms   20.44 ms    4.5x
--   shelf content read, 194 ids           9.31 ms   46.08 ms    5.0x
--   whole catalog as the advisor         237.6 ms  1245.0 ms    5.2x
--   CONTROL content_progress              1.02 ms    1.06 ms    flat
--
-- Row counts identical on both sides — 47 / 107 / 2825 / 493 — so it is not a
-- faster query returning a smaller answer.
--
-- ---------------------------------------------------------------------------
-- WHY, AND IT IS NOT THE REASON I FIRST GAVE
-- ---------------------------------------------------------------------------
-- The first explanation was that `SET search_path` blocks SQL-function
-- inlining. That was tested and is wrong: a variant with no SET clause and
-- every reference schema-qualified measured 1244 ms, unchanged, and EXPLAIN
-- still showed `content_entitled_for(...)` as a call in the filter.
--
-- What is actually happening is visible in the plan. An inline EXISTS inside an
-- RLS qual is compiled into the plan's InitPlan / hashed-SubPlan machinery and
-- evaluated ONCE — the other two policies on `content` show exactly that shape,
-- with `InitPlan 2`, `InitPlan 3` and a `hashed SubPlan 4`. A function call
-- cannot be folded into that, so it is executed per row: ~0.44 ms x 2825 rows
-- against ~0.084 ms for the inline form.
--
-- A SECOND REMEDY WAS TRIED AND IS WORSE, which is why this one is not a guess.
-- Hoisting the question to one call per query — a `content_type[]` of what the
-- user may read, tested with `= any(...)` — measured 26.3 ms and 1522 ms: worse
-- than leaving 0177 in place. The planner does not hoist that either. So the
-- inline EXISTS is not merely the faster form, it is the only fast form, and
-- "one shared definition" is not available here at any acceptable price.
--
-- ---------------------------------------------------------------------------
-- SO: TWO COPIES, AND A CHECK RATHER THAN A PROMISE
-- ---------------------------------------------------------------------------
-- This is the trade Ryan ruled on: the policy goes back inline, the function
-- stays for the card, and each copy carries a comment naming the other.
--
-- A comment is not a safeguard. This file's own standing rules say a convention
-- closes a case and a construction closes a class, and two copies of one rule
-- kept in step by good intentions is the shape of defect this codebase keeps
-- paying for. So the parity between them is CHECKED:
--
--     scripts/entitlement-parity.sql
--
-- compares, for every advisor on the database and every value of the
-- content_type enum, what the POLICY actually lets them read against what
-- `content_entitled_for` actually returns, and exits non-zero on any
-- difference. `db:migrate` runs it after every successful push, so a later
-- change to either copy cannot ship out of step with the other.
--
-- WHY THE CHECK IS NOT IN THIS MIGRATION. It has to observe the policy, and a
-- policy cannot be observed as `postgres` — BYPASSRLS means it never runs and
-- every count comes back complete. Setting `request.jwt.claims` alone moves
-- auth.uid() and leaves the bypass in place. The only way to see what a policy
-- does is to be a role it applies to, so the check does `set local role
-- authenticated` per advisor, which is a session-level act rather than a schema
-- change. Carrying a copy of that logic here as well would create the second
-- definition this whole PR exists to manage. What this migration asserts
-- instead is the structure it is responsible for; the behaviour is asserted by
-- the check, seconds later, by `db:migrate` itself.
-- ============================================================================

-- ---- 1. The policy, back to the inline EXISTS -------------------------------
/*
 * The 0010 expression, restored exactly — same `status = 'published'` conjunct,
 * same membership conditions, same helper calls in the same order, and
 * `(select auth.uid())` kept as a scalar subquery so the planner still hoists
 * it to an InitPlan rather than calling it per row.
 */
drop policy if exists content_entitled_read on content;

create policy content_entitled_read on content
  for select
  using (
    status = 'published'::content_status
    and exists (
      select 1
        from membership m
       where m.user_id = (select auth.uid())
         and m.active
         and m.role = any (roles_for_content_type(content.type))
         and rooftop_has_product(m.rooftop_id, product_for_content_type(content.type))
    )
  );

/*
 * ---- THE COMMENT THAT NAMES THE OTHER COPY -------------------------------
 *
 * A policy takes no COMMENT in Postgres, so the pointer goes where a reader of
 * the policy will actually be standing: on the table, and on the function.
 */
/* The table had no comment before this, so nothing is being overwritten — and
   this one deliberately does not try to describe the table. It says the single
   non-obvious thing a person editing its RLS needs to know. */
comment on table content is
  'ENTITLEMENT IS WRITTEN TWICE, ON PURPOSE. The RLS policy '
  'content_entitled_read carries the predicate INLINE, and '
  'public.content_entitled_for(uuid, content_type) carries the same predicate '
  'for callers that cannot use the policy — today that is '
  'advisor_family_film_progress, which is SECURITY DEFINER and is called with '
  'the service role, so the policy never runs for it. 0177 had both reading one '
  'function and it cost 5x on every read of this table, because an inline '
  'EXISTS in an RLS qual is folded into the plan once and a function call is '
  'executed per row. CHANGE ONE AND YOU MUST CHANGE THE OTHER: '
  'scripts/entitlement-parity.sql compares them for every advisor and every '
  'content type and fails on any difference, and db:migrate runs it after every '
  'apply. 0178.';

-- ---- 2. The function stays, and says why it exists at all ------------------
/*
 * Unchanged in body. Re-commented, because the old comment said the policy and
 * this function share one definition and that is no longer true — a comment
 * that describes a construction the code has stopped using is worse than no
 * comment, since it instructs the reader not to look.
 */
/* One run of adjacent string literals and no E'' at all. Mixing implicit
   concatenation with `||`, and joining a plain literal to an E'' one, are both
   syntax errors here — two rehearsal runs were spent discovering that. A
   comment does not need real newlines, so the paragraph breaks are words. */
comment on function content_entitled_for(uuid, content_type) is
  'May this USER read content of this TYPE — an active membership whose role is '
  'in roles_for_content_type and whose rooftop holds product_for_content_type. '
  'THIS IS THE SECOND OF TWO COPIES OF THAT RULE. The first is inline in the '
  'content_entitled_read RLS policy on `content`, which is where reads by anon '
  'and authenticated are decided. This copy exists for callers the policy '
  'cannot reach: a SECURITY DEFINER function called with the service role, '
  'where auth.uid() is NULL and RLS does not apply. Its one caller is '
  'advisor_family_film_progress — the home card''s count — which before 0177 '
  'counted and offered films the shelf could not show, on 12 families and 115 '
  'films for one advisor. ON KEEPING THEM IN STEP: 0177 made the policy call '
  'this function so there would be one definition; it cost 5x on every read of '
  '`content` and 0178 reverted it. Parity is therefore enforced by '
  'scripts/entitlement-parity.sql rather than by this comment — it reads as '
  'each advisor, compares the policy''s answer with this function''s for every '
  'content type, and fails on any difference. db:migrate runs it after every '
  'apply. KEYED ON _user AND NEVER auth.uid(): inside the definer function '
  'auth.uid() is NULL, so keying it there would return false for every advisor '
  'and empty the card from every home screen rather than from the unentitled '
  'one.';

-- ---- 3. Assert the structure this migration is responsible for -------------
do $$
declare
  _qual     text;
  _rpc      text;
  _policies int;
begin
  select pg_get_expr(polqual, polrelid, true) into _qual
    from pg_policy
   where polrelid = 'content'::regclass and polname = 'content_entitled_read';

  if _qual is null then
    raise exception '0178: content_entitled_read does not exist on content';
  end if;

  /* The policy must NOT route through the function any more — that is the whole
     change, and asserting it from the catalogue rather than trusting the DDL
     above is this file's standing rule about summaries. */
  if _qual like '%content_entitled_for%' then
    raise exception
      '0178: content_entitled_read still calls content_entitled_for — the '
      'policy was not put back inline and the 5x cost stands. Expression: %',
      _qual;
  end if;

  /* ...and it must be the inline form rather than something weaker that merely
     avoids the function. All three parts, named. */
  if _qual not like '%membership%'
     or _qual not like '%roles_for_content_type%'
     or _qual not like '%rooftop_has_product%' then
    raise exception
      '0178: content_entitled_read is not the inline membership EXISTS. A '
      'policy that excludes the function AND the membership test would pass a '
      'narrower check and let the catalog through. Expression: %', _qual;
  end if;

  /* The function must survive. It is the card's only entitlement check, and
     dropping it while reverting the policy is the obvious way to turn this
     revert into a reintroduction of the 0177 bug. */
  select pg_get_functiondef(p.oid) into _rpc
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'advisor_family_film_progress';

  if _rpc is null or _rpc not like '%content_entitled_for%' then
    raise exception
      '0178: advisor_family_film_progress no longer calls content_entitled_for '
      '— the card would go back to counting films the shelf cannot show';
  end if;

  /* The other two arms are untouched and must still be there, or this revert
     has quietly changed who can read the table. */
  select count(*) into _policies
    from pg_policy where polrelid = 'content'::regclass;
  if _policies <> 3 then
    raise exception
      '0178: `content` carries % policies, expected 3 (entitled_read, '
      'admin_all, platform_all)', _policies;
  end if;

  raise notice
    '0178: policy is inline, the function survives for the card, 3 policies on '
    'content. Behaviour is asserted by scripts/entitlement-parity.sql, which '
    'db:migrate runs next.';
end $$;

notify pgrst, 'reload schema';
