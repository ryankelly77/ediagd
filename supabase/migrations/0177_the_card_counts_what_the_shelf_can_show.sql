-- ============================================================================
-- EDIAGD — 0177 the card counts what the shelf can show
--
-- NOT APPLIED. Written for Ryan to read and apply.
--
-- `advisor_family_film_progress` is `SECURITY DEFINER` and `loadFocusFamilyCard`
-- calls it with the SERVICE client, so `content_entitled_read` never runs. The
-- shelf reads `content` as the advisor, so it does. Two definitions of "this
-- family's films", and the one with no entitlement check is the one printing a
-- number on the home screen.
--
-- MEASURED ON ROOFTOP 4a36620c, 6 November 2026 — one active advisor, no
-- `advisor_base` product, no `rooftop_product` row at all:
--
--     the card    total 12, completed 0, next_id 77b96c74-…
--     the shelf    0 films
--
-- and the same query as an ENTITLED advisor returns 12, so the zero is the
-- policy answering and not a broken read.
--
-- The `next_id` is the sharp end. The card does not merely overcount: it offers
-- "continue" on a specific film, and tapping it lands on a shelf that cannot
-- show that film. A label that is not evidence of what is behind it, for the
-- one viewer it is addressed to.
--
-- ---------------------------------------------------------------------------
-- IT IS THE ROLE-GATE PATTERN AGAIN, AND THE THIRD INSTANCE IS NAMED IN AGENTS
-- ---------------------------------------------------------------------------
-- `has_performance_surface()` keyed on `auth.uid()` and shut out the service
-- role. `op_code_family` is admin-scoped and `pickPitch` read it as the
-- advisor. `dms_advisor_read` grants select to everyone except the advisor it
-- protects. This is the same shape with the sign flipped: a check keyed on
-- `auth.uid()` is INERT in a definer function called by the service role, so
-- the gate was not wrong about who it excluded — it simply never ran.
--
-- Which is why the fix cannot be `auth.uid()`. Inside this function that is
-- NULL, and a predicate on NULL is false for everybody: the card would read
-- 0 of 0 for every advisor on the platform and `loadFocusFamilyCard` would
-- return null, removing the card from every home screen. The gate has to be
-- keyed on `_user` — the advisor whose card it is — which is the viewer the
-- number is about and not the role that happens to be fetching it.
--
-- ---------------------------------------------------------------------------
-- ONE DEFINITION, NOT TWO THAT AGREE TODAY
-- ---------------------------------------------------------------------------
-- Copying the policy's EXISTS clause into the function would close the case and
-- leave the class open: two copies of an entitlement rule drift the first time
-- a product key or a role list changes, and the drift is invisible because both
-- halves keep returning plausible numbers.
--
-- So the predicate is extracted ONCE into `content_entitled_for(_user, _type)`
-- and both callers use it — the policy with `auth.uid()`, the function with
-- `_user`. The policy's text is otherwise untouched: same `status =
-- 'published'` conjunct, same membership conditions, same helper functions in
-- the same order. The only change is where the user id comes from, which is
-- the whole bug.
--
-- `SECURITY INVOKER`, deliberately and this is load-bearing. The policy
-- currently reads `membership` as the querying role, so `membership`'s own RLS
-- applies; a DEFINER helper would bypass it and silently widen what the policy
-- can see. Invoker preserves that exactly — and inside
-- `advisor_family_film_progress`, which IS definer and owned by postgres, the
-- same function runs with the definer's privileges and can therefore read
-- `_user`'s membership even though the caller is the service role. One
-- function, correct in both contexts, because of what invoker means rather
-- than in spite of it.
--
-- ---------------------------------------------------------------------------
-- WHAT IS DELIBERATELY NOT FIXED — ruled 6 November
-- ---------------------------------------------------------------------------
--   THE TYPE FILTER   the function counts `type = 'advisor_video'`; the shelf
--                     counts everything that is not a cue. Measured: all 115
--                     rows reaching these filters are advisor_video, so it
--                     removes nothing today. Left alone.
--   THE coachable OR  the shelf ORs `coachable` across both arms of
--                     `service_family_content`; this function reads the
--                     op_code arm's own value. Measured: 0 published films
--                     carry a service_family tag and 0 published rows sit on a
--                     non-coachable code. Left alone.
--
-- Both are latent, both are recorded here, and neither is touched. A fix that
-- quietly does three things when one was asked for is its own defect.
-- ============================================================================

-- ---- 1. The entitlement predicate, extracted so there is only one ----------
create or replace function content_entitled_for(_user uuid, _type content_type)
returns boolean
language sql
stable
security invoker
set search_path to 'public'
as $$
  select exists (
    select 1
      from membership m
     where m.user_id = _user
       and m.active
       and m.role = any (roles_for_content_type(_type))
       and rooftop_has_product(m.rooftop_id, product_for_content_type(_type))
  )
$$;

comment on function content_entitled_for(uuid, content_type) is
  'May this USER read content of this TYPE — an active membership whose role is '
  'in roles_for_content_type and whose rooftop holds product_for_content_type. '
  'Extracted from content_entitled_read in 0177 so the RLS policy and '
  'advisor_family_film_progress share ONE definition: the policy passes '
  'auth.uid(), the card''s definer function passes the advisor it is reporting '
  'on. SECURITY INVOKER on purpose — the policy reads membership as the '
  'querying role and a definer helper would bypass membership''s own RLS. '
  'NULL _user returns false, which is the anon answer and was the behaviour '
  'before. Does NOT check status = published; that conjunct stays in the policy '
  'where it was.';

/* Naming every role that really calls it, including the least-privileged one.
   The policy on `content` is not restricted with TO, so it is evaluated for
   anon as well as authenticated, and a missing EXECUTE grant would turn every
   content read into a permission error rather than an empty result. */
revoke all on function content_entitled_for(uuid, content_type) from public;
grant execute on function content_entitled_for(uuid, content_type)
  to anon, authenticated, service_role;

-- ---- 2. The policy, re-pointed and otherwise identical ---------------------
/*
 * Re-created rather than left alongside a copy. The expression below is the
 * same one 0010 wrote, with the EXISTS replaced by the call that now holds it:
 *
 *   BEFORE  status = 'published' AND EXISTS (SELECT 1 FROM membership m
 *             WHERE m.user_id = (SELECT auth.uid()) AND m.active
 *               AND m.role = ANY (roles_for_content_type(content.type))
 *               AND rooftop_has_product(m.rooftop_id,
 *                                       product_for_content_type(content.type)))
 *
 *   AFTER   status = 'published' AND content_entitled_for((SELECT auth.uid()),
 *                                                          content.type)
 *
 * `(select auth.uid())` keeps the scalar subquery so the planner still hoists
 * it to an InitPlan and evaluates the session's uid once rather than per row.
 */
drop policy if exists content_entitled_read on content;

create policy content_entitled_read on content
  for select
  using (
    status = 'published'::content_status
    and content_entitled_for((select auth.uid()), content.type)
  );

-- ---- 3. The card's function, with the check the shelf already had ----------
create or replace function advisor_family_film_progress(_user uuid, _family text)
returns table(total integer, completed integer, next_id uuid)
language sql
stable
security definer
set search_path to 'public'
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
       /*
        * THE ONE NEW LINE. `_user` and not auth.uid(), which is NULL here and
        * would empty the card for everybody. `c.type` and not the literal
        * 'advisor_video' the filter above already guarantees — so this is the
        * same predicate the policy applies rather than a special case of it,
        * and it stays correct if the type filter ever widens.
        */
       and content_entitled_for(_user, c.type)
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
     *
     * AND NOW ALSO A FILM THEY CAN OPEN: next_id is drawn from `films`, so the
     * entitlement check above reaches it too. An unentitled advisor gets NULL
     * rather than a film their shelf will refuse to play.
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
  'total / completed / next_id for one advisor and one service family, in deck '
  'order. Counts only films the advisor could actually open: 0177 adds '
  'content_entitled_for(_user, c.type), the same predicate '
  'content_entitled_read applies, because this is definer and the card calls '
  'it with the service role — so the policy never ran and the card could count '
  'and offer films the shelf cannot show. Keyed on _user, never auth.uid(), '
  'which is NULL in this context.';

revoke all on function advisor_family_film_progress(uuid, text) from public;
revoke all on function advisor_family_film_progress(uuid, text) from anon, authenticated;

-- ---- 4. Prove it, both halves ----------------------------------------------
do $$
declare
  _leaks   int;
  _served  int;
  _example text;
begin
  /*
   * ---- THE SKIP PATH ------------------------------------------------------
   * A database with no active advisor membership is a fresh local. The
   * structural half of this migration — the function, the grants, the policy —
   * has already run and is not skipped.
   */
  if not exists (select 1 from membership where active and role = 'advisor') then
    raise notice
      '0177: no active advisor memberships on this database — a fresh local. '
      'Function, grants and policy applied; the counting assertions are skipped.';
    return;
  end if;

  /*
   * ---- THE EXCLUSION HALF -------------------------------------------------
   *
   * The invariant, stated as a property rather than as the one rooftop that
   * exposed it: NO advisor may get a non-zero total for a family they are not
   * entitled to read. Derived, so a second unentitled rooftop appearing next
   * month is caught by the same line — a defect is a class, not an instance.
   */
  select count(*),
         string_agg(format('%s/%s: total %s, next %s', t.user_id, t.family,
                           t.total, coalesce(t.next_id::text, 'null')), '; ')
    into _leaks, _example
    from (
      select m.user_id, sf.family, p.total, p.next_id
        from membership m
        cross join (select distinct family from op_code_family
                     where retired_at is null and coachable) sf
        cross join lateral advisor_family_film_progress(m.user_id, sf.family) p
       where m.active
         and m.role = 'advisor'
         and not content_entitled_for(m.user_id, 'advisor_video')
         and (p.total > 0 or p.next_id is not null)
    ) t;

  if _leaks > 0 then
    raise exception
      '0177: % advisor/family pairs still count or offer a film the shelf '
      'cannot show — %', _leaks, _example;
  end if;

  /*
   * ---- THE ACCEPTANCE HALF, WHICH IS THE ONE THAT GETS SKIPPED ------------
   *
   * "A refusal is not self-verifying." A function that returned 0 for
   * EVERYBODY would satisfy the exclusion above perfectly, and it would have
   * emptied the card from every home screen — which is exactly what keying the
   * new check on auth.uid() would have produced. So an entitled advisor must
   * still be served a non-zero total.
   */
  select count(*) into _served
    from (
      select m.user_id
        from membership m
        cross join (select distinct family from op_code_family
                     where retired_at is null and coachable) sf
        cross join lateral advisor_family_film_progress(m.user_id, sf.family) p
       where m.active
         and m.role = 'advisor'
         and content_entitled_for(m.user_id, 'advisor_video')
         and p.total > 0
       group by m.user_id
    ) t;

  if _served = 0 then
    raise exception
      '0177: no entitled advisor is served a single film by this function — the '
      'entitlement check has emptied the card for everybody rather than for the '
      'unentitled, which is the failure keying it on auth.uid() would cause';
  end if;

  raise notice
    '0177: 0 unentitled advisor/family pairs counted or offered a film; % '
    'entitled advisors still served', _served;
end $$;

notify pgrst, 'reload schema';
