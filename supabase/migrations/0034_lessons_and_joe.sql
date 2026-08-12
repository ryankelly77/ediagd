-- ============================================================================
-- EDIAGD — 0034 Joe the Pro is advisor education, and lessons pay
--
-- TWO CHANGES THAT TURNED OUT TO BE ONE.
--
-- 1. JOE THE PRO WAS UNREADABLE. 0010 mapped each content type to exactly ONE
--    consuming role, and joe_the_pro drew 'technician' — a role no membership
--    in the system has ever held. The result was a library nobody but an admin
--    could open. It is advisor education (why a service matters, what happens
--    to the vehicle), so advisors and managers both need it, which a
--    single-role function cannot express. Hence roles_for_content_type().
--
-- 2. FINISHING SOMETHING NOW PAYS. The library had no way to earn from it, and
--    sand_reason had no value that meant "finished a lesson". Both fixed here.
--
-- WHAT DOES NOT CHANGE: the product gate. A rooftop still has to own the
-- joe_the_pro add-on. This widens WHO may read it, never WHETHER it was bought.
-- ============================================================================

-- ---- 1. One content type, several consuming roles -------------------------

/**
 * Which roles may consume a content type, given the rooftop owns its product.
 *
 * Replaces the single-role role_for_content_type() in the policy. That function
 * stays — it still answers "who is this primarily for", which the CMS uses —
 * but it can no longer be the access rule, because access is now one-to-many.
 */
create or replace function roles_for_content_type(t content_type)
returns member_role[]
language sql
immutable
as $$
  select case t
    when 'manager_video' then array['manager']::member_role[]
    -- Advisors AND managers. A manager coaching the brake conversation needs
    -- the same explainer the advisor is being asked to watch.
    when 'joe_the_pro'   then array['advisor', 'manager']::member_role[]
    else array['advisor']::member_role[]   -- cue + advisor_video
  end
$$;

-- The primary consumer, kept in step so the two never contradict each other.
create or replace function role_for_content_type(t content_type)
returns member_role language sql immutable as $$
  select case t
    when 'manager_video' then 'manager'::member_role
    when 'joe_the_pro'   then 'advisor'::member_role
    else 'advisor'::member_role
  end
$$;

-- Same shape as before, with `= role` widened to `= any(roles)`. The product
-- check is untouched: rooftop_has_product still decides whether the store
-- bought it.
drop policy if exists content_entitled_read on content;
create policy content_entitled_read on content
  for select using (
    status = 'published'
    and exists (
      select 1 from membership m
       where m.user_id = (select auth.uid())
         and m.active
         and m.role = any (roles_for_content_type(content.type))
         and rooftop_has_product(m.rooftop_id, product_for_content_type(content.type))
    )
  );


-- ---- 2. A reason to mint ---------------------------------------------------
-- NOTE: a value added here cannot be USED until this transaction commits, so
-- nothing in this migration may reference it. The server action does, at
-- runtime, which is a different transaction.

alter type sand_reason add value if not exists 'lesson_complete';


-- ---- 3. What a lesson is worth --------------------------------------------

alter table game_settings
  -- Deliberately small next to the daily loop (10). Finishing a cue is worth
  -- something; it is not worth as much as turning up every day, and the whole
  -- economy tilts if a library of hundreds of items outpays the habit.
  add column if not exists sand_lesson int not null default 3,
  -- How much of a video counts as watched. Percent, so it reads the same as
  -- content_progress.watched_pct.
  add column if not exists video_complete_pct int not null default 90;

alter table game_settings
  add constraint game_settings_video_pct_range
  check (video_complete_pct between 1 and 100);


-- ---- 4. The learning badges exist now -------------------------------------
-- user_badge.badge_key is a foreign key to badge(key), so these rows have to
-- exist before anything can be awarded. They were described in BADGES.md and
-- rendered as "coming soon" on the wall, but never inserted.

insert into badge (key, name, description, ring, sand_dollars) values
  ('ten_sunrises',   'Ten Sunrises',   'Ten lessons completed',                    'seafoam', 100),
  ('fifty_sunrises', 'Fifty Sunrises', 'Fifty lessons completed',                  'gold',    250),
  ('eddies_pick',    'Eddie''s Pick',  'Twenty daily picks completed',             'gold',    250),
  ('full_horizon',   'Full Horizon',   'Every published item in one service done', 'gold',    500)
on conflict (key) do nothing;


-- ---- 5. Progress has to be writable by its owner ---------------------------
-- 0010 gave content_progress a self-write policy; confirm it covers the insert
-- the completion path makes. Recreated idempotently rather than assumed.

drop policy if exists progress_self_write on content_progress;
create policy progress_self_write on content_progress
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));


-- ---- 6. Tell the API about the new enum value ------------------------------
-- ALTER TYPE ... ADD VALUE changes the type, and PostgREST caches the schema —
-- including enum members — per connection. Without this, the first attempt to
-- write reason = 'lesson_complete' after this migration lands fails with
--
--     invalid input value for enum sand_reason: "lesson_complete"
--
-- even though the value exists, because the API is still planning against the
-- type it cached beforehand. This is not theoretical: it is exactly what
-- happened on the first real attempt to complete a lesson locally.
notify pgrst, 'reload schema';
