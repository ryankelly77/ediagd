-- ============================================================================
-- EDIAGD — 0025 Work schedules and Island Time
--
-- THE BUG THIS EXISTS TO FIX
-- The Swell counted consecutive CALENDAR days. An advisor working Mon–Fri hits
-- a two-day gap every weekend, so they burn a grace day every Saturday and
-- Sunday, empty a five-day bank inside two weeks, and reset to Day 1 every
-- Monday forever. The 7/30/90/365-Day Swell badges are unearnable by anyone not
-- working seven days a week. The streak has to count SCHEDULED WORK DAYS.
--
-- WHY BOOLEAN COLUMNS RATHER THAN AN ARRAY
-- The domain is exactly seven fixed values, so an array buys no flexibility and
-- costs clarity: `where works_sat` reads better than an array containment
-- operator, indexes plainly, and cannot hold an invalid value like 9. One row
-- per user, so there is no width problem.
--
-- WHY SATURDAY IS NOT A BOOLEAN
-- Alternating Saturdays are a real dealership pattern, so Saturday needs three
-- states, not two. Putting a works_sat boolean NEXT TO saturday_mode would
-- create two sources of truth that can disagree ('none' + works_sat = true —
-- now what?). Saturday is therefore governed entirely by saturday_mode, and the
-- other six days stay booleans. Alternating parity is computed from an anchor:
-- a Saturday the user DOES work. Anything an even number of weeks from the
-- anchor is a working Saturday.
--
-- NOT ONBOARDED = NO ROW
-- There is deliberately no default schedule and no row created at signup. The
-- absence of a row means "hasn't told us their schedule yet", and the engine
-- treats that as every day scheduled — which is exactly today's behaviour, so
-- nothing changes for existing users until onboarding ships. schedule_set_at
-- records when they actually confirmed it.
--
-- >>> WRITES ARE SERVER-ONLY, and this matters more than it looks. Both tables
-- >>> are direct inputs to streak math. A user who could INSERT their own
-- >>> island_time row could freeze their Swell indefinitely; a user who could
-- >>> set their schedule to "Sundays only" would never miss a work day again.
-- >>> Same lockdown as the economy in 0012: read your own, write nothing.
-- ============================================================================

create type saturday_mode as enum ('none', 'every', 'alternating');

create table work_schedule (
  user_id          uuid primary key references app_user(id) on delete cascade,

  -- Six plain days. Saturday is saturday_mode, below.
  works_mon        boolean not null default false,
  works_tue        boolean not null default false,
  works_wed        boolean not null default false,
  works_thu        boolean not null default false,
  works_fri        boolean not null default false,
  works_sun        boolean not null default false,

  saturday_mode    saturday_mode not null default 'none',
  -- A Saturday they DO work. Parity is measured from here in whole weeks.
  saturday_anchor  date,

  -- Null until the user confirms it — lets the app tell "onboarded" from a row
  -- that exists only because an admin pre-filled part of it.
  schedule_set_at  timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Alternating is meaningless without a reference Saturday.
  constraint work_schedule_alternating_needs_anchor
    check (saturday_mode <> 'alternating' or saturday_anchor is not null),

  -- The anchor must actually be a Saturday, or the parity maths is nonsense.
  -- isodow: Monday = 1 … Saturday = 6.
  constraint work_schedule_anchor_is_saturday
    check (saturday_anchor is null or extract(isodow from saturday_anchor) = 6)
);

-- ---- Island Time (planned absence) ----------------------------------------
-- Days inside a range are invisible to the streak: they are not missed days and
-- they consume no grace. Multiple ranges per user; overlapping ranges are
-- harmless because the engine asks "is this date inside ANY range".
create table island_time (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_user(id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  note        text,
  created_at  timestamptz not null default now(),

  constraint island_time_end_after_start check (end_date >= start_date)
);
create index on island_time(user_id, start_date);

-- ---- Was this completion on a day they were scheduled? ---------------------
-- Stamped at write time, NOT derived later. Schedules change; deriving it from
-- the current schedule would retroactively reclassify history every time
-- someone switches shifts. Null means "recorded before schedules existed, or
-- the user had no schedule set" — genuinely unknown, and distinct from false.
-- This is what the Free Surf badge counts:
--     select count(*) from daily_completion
--      where user_id = $1 and was_scheduled = false;
alter table daily_completion
  add column if not exists was_scheduled boolean;

-- ---- RLS -------------------------------------------------------------------
alter table work_schedule enable row level security;
alter table island_time   enable row level security;

-- Read your own; managers and admins read their rooftop's people, mirroring
-- swell_team_read (0011) so coverage screens can be built on it later.
create policy work_schedule_team_read on work_schedule
  for select using (
    user_id = auth.uid()
    or exists (select 1 from membership me
               join membership them on them.rooftop_id = me.rooftop_id
               where me.user_id = auth.uid() and me.active
                 and them.user_id = work_schedule.user_id
                 and (me.role = 'manager' or me.role = 'admin')));

create policy island_time_team_read on island_time
  for select using (
    user_id = auth.uid()
    or exists (select 1 from membership me
               join membership them on them.rooftop_id = me.rooftop_id
               where me.user_id = auth.uid() and me.active
                 and them.user_id = island_time.user_id
                 and (me.role = 'manager' or me.role = 'admin')));

-- No INSERT/UPDATE/DELETE policy on either table, by design — see the note at
-- the top. Onboarding and Island Time requests go through server actions using
-- the service role, which validate before writing.
