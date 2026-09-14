-- ============================================================================
-- EDIAGD — 0117 What the certifications screen reads
--
-- One function, one round trip, every track. The screen needs "how far through
-- is this advisor on each of thirty tracks", and the honest ways to get that
-- from the application layer are all bad: thirty queries, or pulling 2,500
-- published content ids and every progress row into node to intersect them.
-- Counting is what the database is for.
--
-- ---------------------------------------------------------------------------
-- IT TAKES NO USER ARGUMENT, AND THAT IS THE SECURITY DESIGN
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER is needed because `content` carries RLS: counted as the
-- invoker, a base-tier advisor's DENOMINATOR would shrink to the content their
-- rooftop has bought, and "6 of 6 items" would render complete on a track they
-- have barely started. The total is a fact about the track.
--
-- But a definer function that accepted `_user uuid` would hand any signed-in
-- advisor the progress of every other advisor in the company. So it takes no
-- argument at all and reads auth.uid() itself. There is no parameter to forge.
--
-- The manager-facing surfaces do not use this: a manager sees a credential
-- pill, which comes from advisor_credential under its own RLS policy, and
-- never a colleague's per-track progress.
-- ============================================================================

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

  /* The items each certification counts, by the same two rules 0116 uses:
     craft reaches content through its courses' modules, service reaches it
     through the family either directly or via the ruled op-code table. */
  craft_items as (
    select cc.certification_id, ct.id as content_id
      from certification_course cc
      join module m   on m.course_id = cc.course_id
      join content ct on ct.module_id = m.id
     where ct.status = 'published'
  ),
  service_items as (
    select distinct c.id as certification_id, ct.id as content_id
      from certification c
      join content ct
        on ct.status = 'published'
       and (
         ct.service_family = c.service_family
         or exists (
           select 1 from op_code_family f
            where f.retired_at is null
              and upper(btrim(f.code)) = upper(btrim(ct.op_code))
              and f.family = c.service_family)
       )
     where c.kind = 'service'
  ),
  items as (
    select * from craft_items
    union all
    select * from service_items
  ),

  /* Craft tracks also carry module counts, because "every item done" and
     "earned" are not the same thing when a module publishes a quiz. The screen
     uses the gap between them to say "quiz remaining" instead of showing a full
     bar on a track that is not earned. */
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

/* anon has no business here; authenticated reads its own progress and nobody
   else's, which is enforced by the absent parameter rather than by a grant. */
revoke all on function my_certification_progress() from public, anon;
grant execute on function my_certification_progress() to authenticated, service_role;

notify pgrst, 'reload schema';
