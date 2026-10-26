-- 0166_team_videos_today.sql
--
-- "Videos completed today" on the manager's Team screen, and which ones on the
-- drill-in. Reck, 26 October: "something simple like 'videos completed today'
-- or 'no videos completed today' and then when you tap the advisor, you can
-- get the details."
--
-- =========================================================================
-- WHY THIS IS A FUNCTION AND NOT A QUERY THE PAGE COULD HAVE WRITTEN
-- =========================================================================
-- Because the page CANNOT write it. Counting videos means separating a video
-- from a cue, which means reading `content` — and `content_entitled_read`
-- (0081) gates on the VIEWER'S ROLE:
--
--     roles_for_content_type('advisor_video') = {advisor}
--
-- A manager is not an advisor. A pure `role = 'manager'` account reads ZERO
-- rows of `content`, so a join would have returned no videos and the screen
-- would have said "No videos completed today" for every advisor, every day,
-- with no error anywhere.
--
-- THIS IS THE FOURTH TIME. AGENTS.md already names three:
-- has_performance_surface() keyed on auth.uid() and excluding service_role;
-- op_code_family read as the advisor, returning zero rows and a two-slot
-- morning; dms_advisor_read granting select to everyone except the advisor it
-- exists to protect. Same shape every time — a gate correct about who it
-- excludes and wrong about who it therefore serves.
--
-- THE TWIST THAT WOULD HAVE HIDDEN IT: at Beaumont both managers hold a
-- manager membership AND an advisor one, so content reads fine for them. It
-- would have worked for Reck, who asked for it, and failed silently for any
-- store whose manager is only a manager. A demo would have passed.
--
-- So the join happens HERE, in a definer that owns the content read, and the
-- scoping is done explicitly below.
--
-- =========================================================================
-- A VIDEO IS SOMETHING WITH A PLAYBACK ID, NOT A NAME ON A LIST
-- =========================================================================
-- `mux_playback_id is not null`, measured on production 26 October:
--
--     advisor_video     465 rows, 464 with a playback id
--     manager_video      17 rows,  17 with a playback id
--     cue              2330 rows,   0
--     quote             436 rows,   0
--
-- A type list (`type in ('advisor_video','manager_video', …)`) would be a
-- fixed list that a new video type silently falls out of — the construction
-- AGENTS.md warns about. A thing with a playback id is a thing you can watch.
-- The one advisor_video without a playback id is excluded, correctly: it
-- cannot be watched either.
--
-- This matters more than it looks. Counting `content_progress` raw would have
-- been wrong by a third: 230 progress rows on production are 158 videos and
-- 72 CUES. Cues get progress rows too.
--
-- =========================================================================
-- TODAY IS THE STORE'S TODAY
-- =========================================================================
-- `completed_at` is a timestamptz; the day is the ROOFTOP's, via 0056's
-- rooftop_local_at(), which reads a local wall clock and returns the instant.
-- `completed_at::date` would have been the UTC date — impact_coaching does
-- exactly that at 0124:553 — and a Texas store's evening lands on tomorrow.

create or replace function team_videos_completed(_rooftop uuid, _day date)
returns table (
  user_id     uuid,
  video_count int,
  titles      text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cp.user_id,
    count(*)::int as video_count,
    /* Ordered by WHEN THEY FINISHED IT, so the drill-in reads as the morning
       happened rather than alphabetically. array_remove guards a null title
       rather than letting it become a hole in the list. */
    array_remove(array_agg(c.title order by cp.completed_at), null) as titles
  from content_progress cp
  join content c on c.id = cp.content_id
 where cp.rooftop_id = _rooftop
   and cp.completed_at is not null
   /* The store's own day, half-open so midnight belongs to exactly one day. */
   and cp.completed_at >= rooftop_local_at(_rooftop, _day, '00:00')
   and cp.completed_at <  rooftop_local_at(_rooftop, (_day + 1), '00:00')
   /* A video is something you can play. See the header. */
   and c.mux_playback_id is not null
   /* ---- THE GATE, WITH EVERY ROLE THAT WILL REALLY CALL IT NAMED --------
      platform owner  sees every store, as everywhere else
      admin / manager  via managed_rooftops() — the Team screen's caller
      group owner/mgr  also via managed_rooftops() (0045 unions org roles in)
      advisor          NOT a caller. Falls to managed_rooftops() returning
                       nothing for them, so they get zero rows rather than a
                       leak. The Team screen is role-gated above this anyway.
      technician       same as advisor.
      service_role     named EXPLICITLY. A definer gets nothing from BYPASSRLS
                       and auth.uid() is null for a cron, so without this arm
                       any future server-side caller reads zero rows and no
                       error — which is the defect this whole file is about. */
   and (
         is_platform_owner()
      or _rooftop in (select managed_rooftops())
      or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
         = 'service_role'
       )
 group by cp.user_id
$$;

revoke all on function team_videos_completed(uuid, date) from public, anon;
grant execute on function team_videos_completed(uuid, date) to authenticated;
grant execute on function team_videos_completed(uuid, date) to service_role;

comment on function team_videos_completed(uuid, date) is
  'Videos each person finished at this rooftop on a given STORE-LOCAL day, with '
  'the titles in completion order. SECURITY DEFINER because counting videos '
  'requires reading content, and content_entitled_read gates on the viewer''s '
  'role — a pure manager reads zero content rows, so the join had to move '
  'somewhere that owns it. Scoped to managed_rooftops(), platform owner, or '
  'service_role. A video is a row with a mux_playback_id, never a type list. '
  '0166.';

notify pgrst, 'reload schema';
