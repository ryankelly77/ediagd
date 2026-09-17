-- ============================================================================
-- EDIAGD — 0123 One resolved service family, everywhere
--
-- Two systems disagreed about the same fact.
--
--   cues    carry content.service_family
--   videos  carry content.op_code, resolved through op_code_family
--
-- Both answer "which service area is this about". The certification derivation
-- was told which is authoritative — phase 1b Ruling 1: service content is
-- reached by content.op_code -> op_code_family.family, permanently. The library
-- never was: loadServiceContent filters on service_family, which is NULL on all
-- 154 published advisor videos, so it returns nothing for every service, always.
--
-- The consequence is worse than a missing list. A service certification counts
-- those films toward an advisor's progress while the library refuses to show
-- them — an advisor graded on content they cannot browse to. Two parts of the
-- product holding different beliefs about the same rows.
--
-- ---------------------------------------------------------------------------
-- ONE DERIVATION, NOT A JOIN EVERY CALLER REMEMBERS
-- ---------------------------------------------------------------------------
-- The join is NOT repeated at each call site. A join every consumer has to
-- remember is a hand-maintained list wearing a different hat, and forgetting it
-- once is exactly how the library and the certification derivation came to
-- disagree. Everything that asks "what service is this about" reads
-- content_service.resolved_service_family — the library, search, and the two
-- certification functions, which are redefined below in the same pass.
--
-- ---------------------------------------------------------------------------
-- WHY TWO VIEWS, AND WHY THE SECURITY MODES DIFFER
-- ---------------------------------------------------------------------------
-- op_code_family is readable only by platform owners and admins
-- (op_code_family_read). An advisor cannot read it. So a single
-- security_invoker view joining it would resolve every family to NULL for the
-- very people the library is for — the query would change shape, the bug would
-- survive, and every test written by an admin would pass.
--
-- So the mapping is exposed through a narrow definer view carrying two columns
-- and nothing else, while the CONTENT view stays security_invoker so that
-- content's own RLS — content_entitled_read, and the admin and platform-owner
-- policies — decides which rows a caller sees. Entitlement is unchanged and
-- undiminished: the rewrite moves which COLUMN is matched, never who may read.
-- ============================================================================

-- ---- 1. The mapping, and only the mapping -----------------------------------

/**
 * code -> family, for anybody signed in.
 *
 * SECURITY DEFINER (the default for a view, stated explicitly) so the caller
 * does not need to read op_code_family itself. What leaks is which op code
 * belongs to which service area, which is already visible to any advisor
 * through the service certification catalogue. What stays admin-only is the
 * ruling table itself: coachable, confidence, note, retired_at.
 *
 * Retired codes are excluded here rather than at each call site, so a retired
 * ruling stops resolving everywhere at once.
 */
create or replace view op_code_family_public
  with (security_invoker = off) as
  select upper(btrim(code)) as code, family
    from op_code_family
   where retired_at is null;

revoke all on op_code_family_public from anon;
grant select on op_code_family_public to authenticated, service_role;

comment on view op_code_family_public is
  'code -> family only. The ruling table behind it stays admin-only; this '
  'exists so the resolved-family derivation works for advisors. See 0123.';

-- ---- 2. The one derivation ---------------------------------------------------

/**
 * `content`, plus the question every surface actually asks.
 *
 * SECURITY INVOKER: content's RLS applies exactly as it does to the table, so
 * this view can be dropped into any query that currently reads `content`
 * without widening what anyone can see. That is the whole safety argument for
 * making 52 films newly reachable — they were always published, always served
 * in the daily loop's pitch slot, and the gate was never the family column.
 *
 * coalesce order matters: an explicit service_family WINS. A cue that names its
 * family is not second-guessed by an op code it happens to carry.
 */
create or replace view content_service
  with (security_invoker = on) as
  select c.*,
         coalesce(c.service_family, f.family) as resolved_service_family
    from content c
    left join op_code_family_public f
      on f.code = upper(btrim(c.op_code));

grant select on content_service to authenticated, service_role;

comment on view content_service is
  'THE one answer to "which service is this about": service_family when set, '
  'otherwise the op code resolved through op_code_family. Read this rather '
  'than re-joining. See 0123.';

comment on column content.service_family is
  'SUPERSEDED as the authority by 0123. Correct where set, and NULL on every '
  'published advisor_video — read content_service.resolved_service_family '
  'instead. Deliberately not backfilled: two sources that can drift is the bug, '
  'not the cure.';

-- ---- 3. Point the certification derivation at the same source ---------------

/*
 * Redefined, not duplicated. These two carried their own copy of the join —
 * correct, and the reason the rule survived here while the library lost it. One
 * derivation or none; now there is one.
 *
 * Both are SECURITY DEFINER, so inside them the invoker of content_service is
 * the function owner and RLS is bypassed, exactly as before: the catalogue must
 * count every published item regardless of who triggered the recount.
 */
create or replace function recompute_certification_content()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  _bar int;
begin
  select coalesce(certification_min_items, 0) into _bar from game_settings limit 1;
  _bar := coalesce(_bar, 0);

  update certification c
     set item_count = (
           select count(*)::int
             from certification_course cc
             join module m  on m.course_id = cc.course_id
             join content ct on ct.module_id = m.id
            where cc.certification_id = c.id
              and ct.status = 'published'
         ),
         updated_at = now()
   where c.kind = 'craft';

  /* WAS a hand-rolled `service_family = c.service_family OR exists(op_code_family …)`.
     Now the one derivation, which is the same rule with one owner. */
  update certification c
     set item_count = (
           select count(*)::int
             from content_service ct
            where ct.status = 'published'
              and ct.resolved_service_family = c.service_family
         ),
         updated_at = now()
   where c.kind = 'service';

  update certification c
     set active = (c.item_count > 0 and c.item_count >= _bar),
         updated_at = now()
   where c.id is not null;
end $$;

revoke all on function recompute_certification_content() from public, anon, authenticated;

create or replace function my_certification_progress()
returns table (
  certification_id uuid,
  total_items      int,
  done_items       int,
  total_modules    int,
  done_modules     int
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as uid),
  craft_items as (
    select cc.certification_id, ct.id as content_id
      from certification_course cc
      join module m   on m.course_id = cc.course_id
      join content ct on ct.module_id = m.id
     where ct.status = 'published'
  ),
  /* The same derivation the catalogue counts with, so an advisor's denominator
     and the track's item_count can never disagree. */
  service_items as (
    select c.id as certification_id, ct.id as content_id
      from certification c
      join content_service ct
        on ct.status = 'published'
       and ct.resolved_service_family = c.service_family
     where c.kind = 'service'
  ),
  items as (
    select * from craft_items
    union all
    select * from service_items
  ),
  mods as (
    select cc.certification_id, m.id as module_id
      from certification_course cc
      join module m on m.course_id = cc.course_id
  )
  select
    c.id,
    coalesce(i.total, 0)::int,
    coalesce(i.done, 0)::int,
    coalesce(md.total, 0)::int,
    coalesce(md.done, 0)::int
  from certification c
  left join (
    select it.certification_id,
           count(*)::int as total,
           count(cp.content_id)::int as done
      from items it
      left join content_progress cp
        on cp.content_id = it.content_id
       and cp.user_id = (select uid from me)
       and cp.completed_at is not null
     group by it.certification_id
  ) i on i.certification_id = c.id
  left join (
    select mo.certification_id,
           count(*)::int as total,
           count(mc.module_id)::int as done
      from mods mo
      left join module_completion mc
        on mc.module_id = mo.module_id
       and mc.user_id = (select uid from me)
     group by mo.certification_id
  ) md on md.certification_id = c.id;
$$;

revoke all on function my_certification_progress() from public, anon;
grant execute on function my_certification_progress() to authenticated, service_role;

/* The counts move: the old service branch matched `service_family` OR the op
   code, which is what this coalesces — so item_count should be unchanged. Run
   it so any drift shows up now rather than on the next content publish. */
select recompute_certification_content();

notify pgrst, 'reload schema';
