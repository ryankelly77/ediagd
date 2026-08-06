-- ============================================================================
-- EDIAGD — 0023 Grant the initial Paddle Back Out day at account creation
--
-- Requires 0022 (the enum value) to have committed first.
--
-- WHY A TRIGGER AND NOT APPLICATION CODE
-- There is no self-signup: every user is invited by an admin or a manager, so
-- there is no single client-side "signup" path to hook. Attaching the grant to
-- the app_user row means it fires however the account comes into being — the
-- invite flow, an admin screen, or a hand-written INSERT — and can't be
-- forgotten by a future code path.
--
-- WHAT CHANGES FOR THE ENGINE: nothing, deliberately. The new swell row carries
-- paddle_out_last_granted = the signup date, so applyDailyCompletion's monthly
-- accrual correctly does NOT fire again that same month — this IS their first
-- month's day, moved to the front and named. And firstEver is derived from
-- last_completed_on being null, not from the swell row existing, so First Light
-- still lands on the first real completion.
--
-- SECURITY DEFINER because swell and paddle_out_entry are locked to
-- service-role writes (0012, 0021); the function runs as the table owner, which
-- is not subject to those policies. search_path is pinned so the definer rights
-- can't be aimed at a caller-supplied schema.
-- ============================================================================

create or replace function grant_initial_paddle_out()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  per_month int;
begin
  select greatest(coalesce(paddle_out_per_month, 0), 0)
    into per_month
    from game_settings
   limit 1;

  if per_month is null or per_month = 0 then
    return new;
  end if;

  insert into swell (user_id, paddle_out_available, paddle_out_last_granted)
  values (new.id, per_month, (new.created_at at time zone 'UTC')::date)
  on conflict (user_id) do nothing;

  -- FOUND is false when the row already existed, so a replayed insert can't
  -- log the credit twice.
  if found then
    insert into paddle_out_entry (user_id, delta, kind, created_at)
    values (new.id, per_month, 'initial_credit', new.created_at);
  end if;

  return new;
end;
$$;

drop trigger if exists app_user_initial_paddle_out on app_user;
create trigger app_user_initial_paddle_out
  after insert on app_user
  for each row execute function grant_initial_paddle_out();

-- ---- Backfill 1: accounts that never got a swell row ----------------------
-- Invited but not yet active. They should hold their starting day already.
with granted as (
  insert into swell (user_id, paddle_out_available, paddle_out_last_granted)
  select u.id, gs.per, (u.created_at at time zone 'UTC')::date
    from app_user u
   cross join (
     select greatest(coalesce(paddle_out_per_month, 0), 0) as per
       from game_settings limit 1
   ) gs
   where gs.per > 0
     and not exists (select 1 from swell s where s.user_id = u.id)
  returning user_id, paddle_out_available
)
insert into paddle_out_entry (user_id, delta, kind, created_at)
select g.user_id, g.paddle_out_available, 'initial_credit', u.created_at
  from granted g
  join app_user u on u.id = g.user_id;

-- ---- Backfill 2: days already held but never itemised ---------------------
-- Accounts active before 0021 got their first day from the old accrual, which
-- logged nothing. Whatever their counter holds beyond what the history can
-- account for is that welcome credit, so name it and date it at signup. This
-- only ADDS history — no counter is touched, since the counter is the
-- authoritative number (0021). Runs after backfill 1 in the same transaction,
-- so the rows it just wrote are already visible and can't be double-counted.
insert into paddle_out_entry (user_id, delta, kind, created_at)
select s.user_id,
       s.paddle_out_available - coalesce(l.logged, 0),
       'initial_credit',
       u.created_at
  from swell s
  join app_user u on u.id = s.user_id
  left join (
    select user_id, sum(delta) as logged
      from paddle_out_entry
     group by user_id
  ) l on l.user_id = s.user_id
 where s.paddle_out_available - coalesce(l.logged, 0) > 0;
