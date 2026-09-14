-- ============================================================================
-- EDIAGD — 0116 A minimum content bar for certifications
--
-- 0115 made `active` content-derived: a certification with any published item
-- behind it was earnable. That was the right shape and the wrong threshold.
--
-- Four Step Close has 2 items. Setting up the MPI has 2. The MOC Warranty
-- Program has 2. A certification earnable in ninety seconds devalues every
-- other one, and "EDIAGD Certified Service Advisor" cannot rest on six tracks
-- of two items each. Ryan's ruling: a minimum bar, tunable by Mitch, applied
-- the same content-derived way — one more condition on a rule that already
-- exists, never a hand-set list.
--
-- ---------------------------------------------------------------------------
-- THE BAR IS COUNTED THE WAY COMPLETION IS COUNTED
-- ---------------------------------------------------------------------------
-- `my_module_progress.total_items` counts content rows that are `published` and
-- carry the module's id. Nothing about retirement, nothing about type. This
-- file counts with exactly the same predicate, because a bar counted any other
-- way could put a track below the threshold while the LMS still considered it
-- completable — the app arguing with itself about whether a track is real.
--
-- ---------------------------------------------------------------------------
-- FALLING BELOW THE BAR NEVER RETRACTS ANYTHING
-- ---------------------------------------------------------------------------
-- Design law 3 again. This file touches `certification` only. There is no
-- statement here that reads or writes advisor_certification or
-- advisor_credential, and there is deliberately no cascade from "the track
-- stopped being earnable" to "you no longer hold it". An advisor who earned
-- Four Step Close when it had two items keeps it, keeps its currency date, and
-- keeps its contribution to EDIAGD Certified. The track simply stops being
-- offered until content lands — the same shape as a retired badge, which is
-- dropped from the denominator and never stripped from a holder.
-- ============================================================================

-- ---- 1. The tunable ---------------------------------------------------------

/**
 * MITCH TUNES THIS. Five is a starting position, not a finding — it is the
 * number that makes the thin tracks visibly thin without disqualifying the
 * tracks that are genuinely ready, and it is in game_settings precisely because
 * the right answer is a content judgement rather than an engineering one.
 *
 * ZERO TURNS THE BAR OFF and restores 0115's rule exactly (any content at all
 * makes a track earnable). That is the documented escape hatch rather than an
 * accident of the arithmetic — see the coalesce in recompute_certification_content().
 */
alter table game_settings
  add column if not exists certification_min_items int not null default 5;

alter table game_settings
  drop constraint if exists game_settings_certification_min_items_sane;
alter table game_settings
  add constraint game_settings_certification_min_items_sane
  check (certification_min_items >= 0 and certification_min_items <= 1000);

-- ---- 2. The count, stored beside the flag it decides -------------------------

/**
 * STORED FOR THE SAME REASON `active` IS STORED.
 *
 * 0115 kept `active` as a column rather than a view because the screens ask
 * "is this earnable" constantly and a join per row is not worth it. The count
 * that decides it belongs in the same place: the certifications screen shows
 * "3 of 12 items" beside a track, the admin punch list orders by how far short
 * a track falls, and neither should pay for a four-table join per row.
 *
 * It is also the honest way to expose the bar. A screen that knows only
 * `active = false` cannot tell an advisor whether a track is coming soon or
 * nearly ready, and cannot tell Mitch which track to write next.
 */
alter table certification
  add column if not exists item_count int not null default 0;

-- ---- 3. The rule, as one callable thing -------------------------------------

/**
 * THE RULE LIVES HERE AND NOWHERE ELSE.
 *
 * 0115's header said "the same rule is what a future re-seed must re-apply",
 * and then wrote the rule as two update statements in the migration body — so
 * re-applying it meant copying SQL. This is that promise kept: the derivation
 * is a function, the migration calls it, and anything that changes content
 * (an ingest, a re-seed, an admin publish) can call the same function rather
 * than restate the rule and drift from it.
 *
 * SECURITY DEFINER because it counts the CATALOGUE, not what the caller may
 * see. `content` carries RLS via content_entitled_read, so counting as the
 * invoker would make a base-tier advisor's view of "how many items does this
 * track have" smaller than a manager's, and `active` would then depend on who
 * last triggered the recount. The count is a fact about the library.
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

  /* CRAFT: published items in the modules of the courses the certification
     carries. An inner join throughout, so a certification with no course link
     counts zero rather than counting everything. */
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

  /* SERVICE: published items reachable for the family, either carried directly
     on content.service_family or resolved through the human-ruled op-code
     translation table. count(DISTINCT) because a row can satisfy both and must
     not be counted twice — that double count would have let a 3-item track
     clear a 5-item bar. */
  update certification c
     set item_count = (
           select count(distinct ct.id)::int
             from content ct
            where ct.status = 'published'
              and (
                ct.service_family = c.service_family
                or exists (
                  select 1 from op_code_family f
                   where f.retired_at is null
                     and upper(btrim(f.code)) = upper(btrim(ct.op_code))
                     and f.family = c.service_family)
              )
         ),
         updated_at = now()
   where c.kind = 'service';

  /* ACTIVE = has content AND clears the bar.
     With the bar at 0 this is `item_count > 0`, which is 0115's rule exactly.

     THE `where c.id is not null` IS NOT DECORATION. Supabase runs pg_safeupdate
     for the API roles, which rejects any UPDATE without a WHERE clause. A
     bare update here applies fine under psql as postgres — so the migration
     succeeds — and then throws "UPDATE requires a WHERE clause" the first time
     anything calls this function through PostgREST. Found by
     accept:certification, which calls it the way the application does. */
  update certification c
     set active = (c.item_count > 0 and c.item_count >= _bar),
         updated_at = now()
   where c.id is not null;
end $$;

revoke all on function recompute_certification_content() from public, anon, authenticated;

-- ---- 4. Apply it ------------------------------------------------------------

select recompute_certification_content();

notify pgrst, 'reload schema';
