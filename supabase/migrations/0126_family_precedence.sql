-- ============================================================================
-- EDIAGD — 0126 An explicit service_family outranks the op-code path
--
-- WHAT THIS DECIDES, AND WHY IT CHANGES NOTHING TODAY
--
-- A content row can answer "which service area is this about" twice:
--
--   content.service_family              the human tagged it
--   content.op_code -> op_code_family   the human ruled on its op code
--
-- 0125 unified the two into service_family_content with a UNION, so a row that
-- satisfies both arms belongs to BOTH families. Nobody decided that. It fell
-- out of the shape of the query.
--
-- PR #7 (`0123_resolved_service_family.sql`, closed as superseded) had actually
-- ruled on it — `coalesce(service_family, resolved)`, explicit wins, in its own
-- words: "a cue that names its family is not second-guessed by an op code it
-- happens to carry." That ruling is the only thing in #7 that 0125 lacked, and
-- it is what this migration writes in.
--
-- ---------------------------------------------------------------------------
-- THE EVIDENCE THAT THIS IS A NO-OP
-- ---------------------------------------------------------------------------
-- Measured against production on 2026-09-20, across all 2,534 published rows:
--
--     rows carrying BOTH a service_family and an op code that resolves:  714
--       the two AGREE:                                                   714
--       the two DISAGREE:                                                  0
--
-- Every row that could be affected by a precedence rule already resolves to the
-- same family down both paths. So 0125's UNION and #7's coalesce return
-- identical answers today, and this migration moves no content between families
-- and changes no certification count.
--
-- It is written now BECAUSE it is a no-op now. A rule adopted while it is a
-- coincidence costs nothing; the same rule adopted after the first disagreement
-- is a migration that moves somebody's content while they are looking at it.
-- The whole phase this lands in is a list of answers that were right for
-- reasons nobody had checked.
--
-- ---------------------------------------------------------------------------
-- BOTH READERS MOVE TOGETHER, OR THIS MAKES THINGS WORSE
-- ---------------------------------------------------------------------------
-- `my_certification_progress()` (0117) carries its own copy of the derivation —
-- an `OR` with `select distinct`, which is UNION semantics by another spelling.
-- Changing the view and leaving that function alone would mean the shelf and
-- the advisor's own progress bar disagreed the first time a row disagreed,
-- which is exactly the failure 0125 existed to end. So both change here.
--
-- `recompute_certification_content()` already reads service_family_content and
-- needs no edit: it inherits the precedence from the view.
-- ============================================================================

-- ---- 1. The view -----------------------------------------------------------

create or replace view service_family_content as

/* ---- the row carries the family itself — and that WINS ------------------- */
select
  c.service_family                              as family,
  c.id                                          as content_id,
  'family_tag'::text                            as via,
  /* A directly tagged row is coachable by definition — 0125 §1 explains why
     this is a statement rather than a default. Unchanged. */
  true                                          as coachable
from content c
where c.service_family is not null

union

/* ---- otherwise, the op code the human ruling maps to a family ------------ */
select
  f.family,
  c.id,
  'op_code'::text,
  f.coachable
from content c
join op_code_family f
  on upper(btrim(f.code)) = upper(btrim(c.op_code))
where c.op_code is not null
  and f.retired_at is null
  /*
   * THE PRECEDENCE, AND IT IS THE ONLY LINE THAT CHANGED.
   *
   * A row that names its own family is not also filed under whatever its op
   * code happens to say. Before this, such a row appeared on both shelves.
   *
   * `is null` rather than a family comparison on purpose: the rule is "an
   * explicit tag settles it", not "an explicit tag settles it when it
   * disagrees". Those are the same thing while the 714 agree, and the first is
   * the one somebody can state without consulting the data.
   */
  and c.service_family is null;

comment on view service_family_content is
  'THE one answer to "what belongs to service family F". An explicit '
  'content.service_family wins; the op_code -> op_code_family path applies only '
  'when there is none. See 0126 for the precedence and the 714/714 measurement '
  'showing it was a no-op the day it was adopted.';

alter view service_family_content set (security_invoker = off);

revoke all on service_family_content from anon;
grant select on service_family_content to authenticated, service_role;

comment on column content.service_family is
  'THE AUTHORITY when set, per 0126 — it outranks the op_code -> op_code_family '
  'path. NULL on every published advisor_video, which is why the op-code path '
  'exists at all. Deliberately not backfilled: two sources that can drift is '
  'the bug, not the cure. Read service_family_content, never this column alone.';

-- ---- 2. The other reader of the same derivation ----------------------------

/*
 * Redefined to ask service_family_content rather than carry its own copy of the
 * join. 0117's body is preserved exactly apart from `service_items`, which is
 * the clause that duplicated the rule.
 */
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
  /*
   * ONE DERIVATION. This used to be `ct.service_family = c.service_family OR
   * exists(op_code_family ...)` with a `distinct` on top — correct, and the
   * reason the rule survived here while the library lost it, but a second copy
   * all the same. It now reads the view, so an advisor's denominator and the
   * track's item_count cannot disagree about precedence.
   */
  service_items as (
    select distinct c.id as certification_id, sfc.content_id
      from certification c
      join service_family_content sfc on sfc.family = c.service_family
      join content ct on ct.id = sfc.content_id and ct.status = 'published'
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
    i.certification_id,
    count(distinct i.content_id)::int                                as total_items,
    count(distinct cp.content_id)::int                               as done_items,
    (select count(distinct mo.module_id)::int
       from mods mo where mo.certification_id = i.certification_id)  as total_modules,
    (select count(distinct mc.module_id)::int
       from module_completion mc, me
      where mc.user_id = me.uid
        and mc.module_id in (
          select mo.module_id from mods mo
           where mo.certification_id = i.certification_id))          as done_modules
  from items i
  left join content_progress cp
    on cp.content_id = i.content_id
   and cp.user_id = (select uid from me)
  group by i.certification_id;
$$;

revoke all on function my_certification_progress() from public, anon;
grant execute on function my_certification_progress() to authenticated, service_role;

notify pgrst, 'reload schema';
