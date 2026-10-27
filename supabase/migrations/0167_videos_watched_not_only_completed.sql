-- 0167_videos_watched_not_only_completed.sql
--
-- The manager's count is about WHAT THEY WATCHED, not what accrued credit.
--
-- Ryan, 27 October, ruling on a count that said 2 when he had watched 3:
-- "i would count them.. even though they are mindset videos and don't count
-- towards the cert, the manager wants to see what they watched"
--
-- =========================================================================
-- WHY 0166 UNDERCOUNTED, AND WHY THE FIX IS NOT WHERE IT LOOKS
-- =========================================================================
-- 0166 counted `completed_at is not null`. That column is not a record of
-- watching — it is a record of ACCRUAL. lib/gamification/completeDay.ts stamps
-- it for exactly two slots:
--
--     const consumed = [served.pitch, served.item]
--
-- The mindset film (served.vid) is deliberately absent, and the comment there
-- says why: "accrual — lib/certification-server.ts counts exactly these rows."
-- Withholding the stamp was the guard that stops a mindset film advancing a
-- credential.
--
-- Measured on production, 27 October: 66 of 214 finished views (30.8%) carry
-- watched_pct = 100 and NO completed_at. 50 of the 51 films behind them are
-- placement = 'daily_lifestyle'. They were watched. Nothing recorded them as
-- watched, because the only column anybody was reading answers a different
-- question.
--
-- THE TEMPTING FIX IS THE WRONG ONE. Stamping completed_at in completeDay
-- would make the number right and change what the column MEANS for every other
-- reader — impact_coaching, user_engagement, engagement_rollup, the "Finished
-- today" chip — none of which asked for mindset films. A fix that lands in the
-- writer to satisfy one reader is how a column acquires two definitions.
--
-- So the predicate moves here, to the one function that asks the one question.
--
-- SAFE BECAUSE CERTIFICATION DOES NOT DEPEND ON THIS. 0117 and 0143 count a
-- certification item by joining content_progress to a MODULE item. Measured:
-- of 118 daily_lifestyle films in the library, 0 have a module_id, and 0 of
-- the 51 stranded films are module items. Mindset films are excluded from the
-- credential BY CONSTRUCTION — module membership — not by the absence of a
-- stamp. This change cannot leak one into a certification, and that is a
-- property of the schema rather than a promise made here.
--
-- =========================================================================
-- TWO TIMESTAMPS WITH DIFFERENT MEANINGS, AND THE COALESCE IS NOT FREE
-- =========================================================================
-- A completed row has completed_at: the instant it was finished.
-- A watched-but-unstamped row has only updated_at: the instant it was last
-- TOUCHED. For these rows they coincide, because record_watch_progress (0057)
-- writes the row as the watch progresses and the last write is the one that
-- took it to 100.
--
-- They are NOT the same quantity, and the difference is visible: a re-watch
-- moves updated_at and would move such a film to a later day. That is a real
-- limitation, accepted knowingly rather than discovered later, because the
-- alternative is not counting the film at all. completed_at is preferred
-- wherever it exists, so a stamped row never relies on the weaker value.

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
  with watched as (
    select
      cp.user_id,
      c.title,
      /* completed_at where it exists; updated_at only where it does not. See
         the header — these are two different measurements and the stronger
         one always wins. */
      coalesce(cp.completed_at, cp.updated_at) as at
    from content_progress cp
    join content c on c.id = cp.content_id
   where cp.rooftop_id = _rooftop
     /* WATCHED, not accrued: finished the film, or carries an accrual stamp.
        Either is evidence they watched it; neither alone is sufficient. */
     and (cp.watched_pct >= 100 or cp.completed_at is not null)
     /* A video is something you can play — never a type list. See 0166. */
     and c.mux_playback_id is not null
     /* ---- THE GATE. Unchanged from 0166; every role named there still
        applies: platform owner, admin/manager and group roles via
        managed_rooftops(), advisor and technician get nothing, and
        service_role is named explicitly because a definer gets nothing from
        BYPASSRLS and auth.uid() is null for a cron. */
     and (
           is_platform_owner()
        or _rooftop in (select managed_rooftops())
        or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
           = 'service_role'
         )
  )
  select
    w.user_id,
    count(*)::int as video_count,
    array_remove(array_agg(w.title order by w.at), null) as titles
  from watched w
   /* The store's own day, half-open so midnight belongs to exactly one day. */
  where w.at >= rooftop_local_at(_rooftop, _day, '00:00')
    and w.at <  rooftop_local_at(_rooftop, (_day + 1), '00:00')
  group by w.user_id
$$;

revoke all on function team_videos_completed(uuid, date) from public, anon;
grant execute on function team_videos_completed(uuid, date) to authenticated;
grant execute on function team_videos_completed(uuid, date) to service_role;

comment on function team_videos_completed(uuid, date) is
  'Videos each person WATCHED at this rooftop on a given store-local day, with '
  'titles in order. Counts watched_pct >= 100 OR an accrual stamp, because '
  'completed_at records ACCRUAL and completeDay stamps only the pitch and item '
  'slots — the mindset film is watched and never stamped. Cannot affect '
  'certification: 0117/0143 count items by module membership and no '
  'daily_lifestyle film has a module_id. SECURITY DEFINER because '
  'content_entitled_read gates content on the viewer''s role and a pure '
  'manager reads zero content rows. 0167, replacing 0166.';

notify pgrst, 'reload schema';
