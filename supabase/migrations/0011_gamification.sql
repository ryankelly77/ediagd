-- ============================================================================
-- 0011_gamification.sql — the Swell (streaks), Sand Dollars (points), badges
-- Brand rules encoded: celebrate up / never punish down; grace days ("Paddle
-- Back Out") auto-spend to protect a Swell; gold reserved for real milestones.
-- Streak day = COMPLETING THE DAILY LOOP (not just logging in).
-- ============================================================================

-- ---- Daily completion: the source of truth for streaks ---------------------
-- One row when a user completes the daily loop (quote ack + cue/video engaged).
-- Distinct from daily_activity.logged_in — this is "did the work", not "showed up".
create table daily_completion (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references app_user(id) on delete cascade,
  rooftop_id     uuid not null references rooftop(id) on delete cascade,
  completion_date date not null,
  quote_content_id uuid references content(id),   -- which quote they acknowledged
  cue_content_id   uuid references content(id),   -- which cue they engaged
  video_content_id uuid references content(id),   -- which video (nullable until videos exist)
  created_at     timestamptz not null default now(),
  unique (user_id, completion_date)
);
create index on daily_completion(user_id, completion_date);
create index on daily_completion(rooftop_id);

-- ---- Streak state (the Swell) ----------------------------------------------
-- Maintained per user. current_len = consecutive completed days (grace-protected).
-- paddle_out_available accumulates 1/month up to 5; auto-spent on a miss.
create table swell (
  user_id             uuid primary key references app_user(id) on delete cascade,
  current_len         int not null default 0,
  longest_len         int not null default 0,
  last_completed_on   date,
  paddle_out_available int not null default 0,     -- 0..5
  paddle_out_last_granted date,                    -- for the 1/month accrual
  updated_at          timestamptz not null default now()
);

-- ---- Sand Dollars ledger (every earn/spend is a row) -----------------------
create type sand_reason as enum
  ('daily_loop','swell_7','swell_30','swell_90','swell_365','badge','certification','swag_purchase','adjustment');

create table sand_dollar_entry (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_user(id) on delete cascade,
  amount      int not null,                         -- +earn / -spend
  reason      sand_reason not null,
  ref_id      uuid,                                 -- badge id, completion id, etc.
  note        text,
  created_at  timestamptz not null default now()
);
create index on sand_dollar_entry(user_id, created_at);

-- Running balance, derived (never stored as a mutable integer).
create or replace view sand_dollar_balance as
select user_id, coalesce(sum(amount),0) as balance
from sand_dollar_entry group by user_id;

-- ---- Badges ----------------------------------------------------------------
-- Catalog of earnable badges (global reference data).
create table badge (
  key         text primary key,        -- 'first_light','swell_7','swell_30','big_wave'
  name        text not null,
  description text,
  ring        text not null,           -- 'seafoam' | 'gold' (tier carried by ring)
  sand_dollars int not null default 0  -- awarded on earn
);

insert into badge (key, name, description, ring, sand_dollars) values
  ('first_light','First Light','First course completed','seafoam',100),
  ('swell_7','7-Day Swell','One week of good days','seafoam',50),
  ('swell_30','30-Day Swell','A month of good days','gold',250),
  ('swell_90','90-Day Swell','A season of good days','gold',250),
  ('big_wave','Big Wave','Certification earned','gold',500)
on conflict (key) do nothing;

-- What a user has earned.
create table user_badge (
  user_id    uuid not null references app_user(id) on delete cascade,
  badge_key  text not null references badge(key),
  earned_on  date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (user_id, badge_key)
);

-- ---- RLS -------------------------------------------------------------------
alter table daily_completion   enable row level security;
alter table swell              enable row level security;
alter table sand_dollar_entry  enable row level security;
alter table user_badge         enable row level security;
alter table badge              enable row level security;

-- A user reads/writes their own gamification state; managers/admins read their team.
create policy completion_self_write on daily_completion
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy completion_team_read on daily_completion
  for select using (user_id = auth.uid() or has_role(rooftop_id,'manager') or has_role(rooftop_id,'admin'));

create policy swell_self_all on swell
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy swell_team_read on swell
  for select using (
    user_id = auth.uid()
    or exists (select 1 from membership me
               join membership them on them.rooftop_id = me.rooftop_id
               where me.user_id = auth.uid() and me.active
                 and them.user_id = swell.user_id
                 and (me.role = 'manager' or me.role = 'admin')));

create policy sand_self_read on sand_dollar_entry
  for select using (user_id = auth.uid());
create policy sand_self_write on sand_dollar_entry
  for insert with check (user_id = auth.uid());

create policy user_badge_self_read on user_badge
  for select using (user_id = auth.uid());
create policy user_badge_self_write on user_badge
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy badge_read on badge for select using (true);   -- catalog is public reference

alter table swell add constraint paddle_out_cap check (paddle_out_available between 0 and 5);

-- ---- Tunable settings (admin-editable, no code deploy needed) ---------------
-- Single-row config for the gamification economy. Admins edit these; logic reads
-- them at runtime instead of hardcoding. Defaults match the agreed spec.
create table game_settings (
  id                     boolean primary key default true,   -- enforce single row
  paddle_out_cap         int not null default 5,             -- max accumulated grace days
  paddle_out_per_month   int not null default 1,             -- grace days granted monthly
  sand_daily_loop        int not null default 10,
  sand_swell_7           int not null default 50,
  sand_swell_30          int not null default 250,
  sand_swell_90          int not null default 250,
  sand_badge             int not null default 100,
  sand_certification     int not null default 500,
  updated_at             timestamptz not null default now(),
  constraint single_row check (id = true)
);
insert into game_settings (id) values (true) on conflict (id) do nothing;

alter table game_settings enable row level security;
-- Everyone signed in can READ settings (the app needs them); only admins WRITE.
create policy game_settings_read on game_settings for select using (auth.uid() is not null);
create policy game_settings_admin_write on game_settings
  for all
  using (exists (select 1 from membership m where m.user_id = auth.uid() and m.active and m.role='admin'))
  with check (exists (select 1 from membership m where m.user_id = auth.uid() and m.active and m.role='admin'));

-- Drop the hardcoded cap constraint — the cap is now enforced in app logic against
-- game_settings.paddle_out_cap, which is editable. Keep a sane upper bound only.
alter table swell drop constraint if exists paddle_out_cap;
alter table swell add constraint paddle_out_sane check (paddle_out_available between 0 and 30);
