-- ============================================================================
-- EDIAGD — 0030 Alerts that start conversations
--
-- THE BRAND PROBLEM THIS HAS TO AVOID. The brand book names the industry's
-- failure as "managers who inspect instead of coach". An alerting system is
-- structurally an inspection tool — it watches people and reports on them — so
-- left alone it would build exactly the thing we sell against.
--
-- Three rules are therefore in the SCHEMA, not just the copy:
--
--   1. WINS OUTNUMBER AND OUTRANK CONCERNS. severity sorts win first, and more
--      kinds exist for wins than for concerns. A system that only ever fires on
--      problems teaches people to dread opening it.
--   2. ADVISORS RECEIVE WINS ONLY. There is no recipient path that sends an
--      advisor a "you're behind" notice. That is nagging, not coaching, and the
--      person who most needs a conversation least needs a notification.
--   3. CONCERNS ARE ADDRESSED TO THE COACH, NOT ABOUT THE COACHED. Every
--      concern lands with a manager or admin, phrased as something to talk
--      about.
--
-- ANTI-NOISE IS THE WHOLE ENGINEERING PROBLEM. A manager with eight advisors
-- must never receive eight notifications in a morning, and no condition may
-- re-announce itself every night it remains true. Both are handled by the same
-- mechanism: every notification carries a dedup_key that identifies the
-- OCCURRENCE, and a unique index refuses the second write. Rollup notifications
-- key on (recipient, kind, day) so eight advisors collapse into one row whose
-- payload lists them.
-- ============================================================================

create type notification_severity as enum ('win', 'info', 'concern');

create type notification_kind as enum (
  -- Wins, deliberately listed first and deliberately more numerous.
  'swell_milestone',
  'badge_earned',
  'team_all_completed',
  'coached_service_up',
  'store_moved_up',
  -- Concerns. Every one of these is addressed to a coach.
  'swell_broken',
  'advisor_quiet',
  'team_quiet',
  'attach_dropped',
  'store_moved_down'
);

/** Where a notification is allowed to go. Only in_app is wired today. */
create type notification_channel as enum ('in_app', 'email', 'both');


-- ---- The notifications themselves -----------------------------------------

create table notification (
  id              uuid primary key default gen_random_uuid(),
  recipient_id    uuid not null references app_user(id) on delete cascade,
  kind            notification_kind not null,
  severity        notification_severity not null,
  -- Which store this is about. Null for network-level notices to the platform
  -- owner, which is the only case where no single rooftop applies.
  rooftop_id      uuid references rooftop(id) on delete cascade,
  -- Who it is about, when it is about exactly one person. Rollups leave this
  -- null and name their subjects in the payload instead.
  subject_user_id uuid references app_user(id) on delete cascade,
  title           text not null,
  body            text not null,
  -- Rollup contents: [{name, detail}, ...] plus whatever the kind needs.
  payload         jsonb not null default '{}'::jsonb,
  /**
   * Identifies the OCCURRENCE, not the condition. "This advisor's Swell broke
   * on the 4th" can only ever be written once; "these advisors were quiet in
   * week 32" can only be written once per week. This single column is what
   * stops the system re-announcing the same thing every night.
   */
  dedup_key       text not null,
  created_at      timestamptz not null default now(),
  read_at         timestamptz,
  -- Set by whichever channel delivered it. Null for in_app, whose delivery IS
  -- the row existing. Here now so adding email later is a column write, not a
  -- migration against a live table.
  email_sent_at   timestamptz
);

create unique index notification_dedup on notification (recipient_id, dedup_key);
create index notification_inbox on notification (recipient_id, read_at, created_at desc);

alter table notification enable row level security;

-- You read your own post. Nobody reads anybody else's, including the platform
-- owner: a notification is addressed mail, not a record of the store.
create policy notification_own_read on notification
  for select using (recipient_id = (select auth.uid()));

-- The only thing a recipient may change is whether they have read it.
create policy notification_own_update on notification
  for update using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

-- No insert policy: notifications are generated server-side only (0012's rule,
-- for the same reason — anything a browser can write, a browser can forge).


-- ---- Per-user delivery preference -----------------------------------------
-- Only in_app is implemented. The column exists now so the preference has
-- somewhere to live before email arrives, rather than a migration later that
-- has to guess everyone's default.

create table notification_pref (
  user_id    uuid primary key references app_user(id) on delete cascade,
  channel    notification_channel not null default 'in_app',
  updated_at timestamptz not null default now()
);

alter table notification_pref enable row level security;

create policy notification_pref_own on notification_pref
  for select using (user_id = (select auth.uid()));
create policy notification_pref_own_write on notification_pref
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));


-- ---- Thresholds, editable without a deploy --------------------------------
-- Same single-row pattern as game_settings, and for the same reason: nobody is
-- using the app yet, so every number below is a guess. They will be wrong, and
-- correcting them must not require a release.

create table notification_settings (
  id                        boolean primary key default true,
  -- A Swell worth having a conversation about when it ends.
  swell_break_min_days      int  not null default 14,
  -- Scheduled work days an advisor can miss before their manager hears.
  quiet_advisor_days        int  not null default 5,
  -- Days with nobody at a store completing before it counts as a quiet team.
  quiet_team_days           int  not null default 3,
  -- Attach-rate movement, in points, that is worth telling someone about.
  attach_win_pts            numeric not null default 2.0,
  attach_concern_pts        numeric not null default 3.0,
  store_move_pts            numeric not null default 1.5,
  -- Ceiling per person per day, applied after rollup. A coach who gets more
  -- than a handful of notices stops reading any of them.
  max_per_recipient_per_day int  not null default 4,
  -- Rooftops that must go quiet before the platform owner hears about it at
  -- all — at 100+ stores, per-store notices would be unusable.
  network_quiet_rooftops    int  not null default 5,
  updated_at                timestamptz not null default now(),
  constraint notification_settings_single check (id)
);

insert into notification_settings (id) values (true) on conflict (id) do nothing;

alter table notification_settings enable row level security;

-- Readable by anyone signed in (the generator and the settings screen both
-- need it); writable only by an admin or the platform owner.
create policy notification_settings_read on notification_settings
  for select using ((select auth.uid()) is not null);
create policy notification_settings_write on notification_settings
  for update using (
    (select is_platform_owner())
    or exists (select 1 from membership m
                where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
  )
  with check (
    (select is_platform_owner())
    or exists (select 1 from membership m
                where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
  );


-- ---- Was this a day they owed us? -----------------------------------------
-- The SQL twin of scheduledOn() in lib/gamification/streak.ts. Needed because
-- "hasn't completed in 5 days" must mean five days they were actually working —
-- counting calendar days would page a manager about someone's weekend.

create or replace function is_scheduled_day(_user uuid, _d date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when not exists (select 1 from work_schedule w where w.user_id = _user)
        -- No schedule on file: the streak engine treats every day as a work
        -- day, and so does this, so the two can never disagree.
        then true
      else (
        select case extract(isodow from _d)::int
          when 1 then w.works_mon
          when 2 then w.works_tue
          when 3 then w.works_wed
          when 4 then w.works_thu
          when 5 then w.works_fri
          when 6 then case w.saturday_mode
                        when 'every' then true
                        when 'alternating' then w.saturday_anchor is not null
                                             and (abs(_d - w.saturday_anchor) % 14) = 0
                        else false
                      end
          else w.works_sun
        end
        from work_schedule w where w.user_id = _user
      )
    end
    and not exists (
      select 1 from island_time it
       where it.user_id = _user and _d between it.start_date and it.end_date
    );
$$;

grant execute on function is_scheduled_day(uuid, date) to authenticated;
