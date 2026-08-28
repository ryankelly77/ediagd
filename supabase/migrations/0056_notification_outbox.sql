-- ============================================================================
-- EDIAGD — 0056 An outbox, and a clock that knows where the store is
--
-- 0030 built the in-app inbox: a row in `notification` IS the delivery, and the
-- bell in the header is the whole transport. That works because the person has
-- to come to the app to see it.
--
-- Push is the opposite. It arrives whether or not anybody asked, on a device in
-- somebody's pocket, at a moment we choose. So this is a separate table with a
-- separate discipline, and the discipline is mostly about restraint.
--
-- ---------------------------------------------------------------------------
-- WHY AN OUTBOX AND NOT MORE ROWS IN `notification`
-- ---------------------------------------------------------------------------
-- They answer different questions. `notification` answers "what is waiting for
-- me in the app". The outbox answers "what are we about to interrupt somebody
-- with, and may we". A row here carries a SCHEDULED time, a status that moves,
-- a channel, and a written reason it exists — none of which the inbox needs.
--
-- Keeping them apart also means a push can be skipped without erasing the
-- in-app notice, which is the common case: the news is worth showing, it is not
-- worth buzzing a phone at 6am for.
--
-- ---------------------------------------------------------------------------
-- THE CLOCK IS THE HARD PART
-- ---------------------------------------------------------------------------
-- 0013 gave us rooftop.timezone and rooftop_today(). Every scheduled job in
-- this codebase then fires at a fixed UTC hour anyway — 0028 at 08:00, 0029 at
-- 08:30, 0031 at 09:00 — and 0028's own comment admits it is reasoning about
-- Central. 09:00 UTC is 11pm the PREVIOUS DAY in Honolulu, which is in the seed
-- data on purpose.
--
-- That was harmless while the only consumer was a bell somebody checks when
-- they feel like it. It is not harmless for push. So scheduled_for is computed
-- from the ROOFTOP's wall clock, the generator runs every half hour, and each
-- run only emits rows for rooftops whose local time is currently in the window
-- that row wants. A store in Hawaii gets its morning at its own morning.
--
-- ---------------------------------------------------------------------------
-- THE HARD RULES, IN THE SCHEMA WHERE THEY CANNOT BE FORGOTTEN
-- ---------------------------------------------------------------------------
--   * ONE PER ADVISOR PER DAY. A partial unique index refuses the second row,
--     so a future generator with a bug cannot spam anybody. Personal bests are
--     exempt and may stack — a second best in one day is a better day, not a
--     louder app.
--   * QUIET HOURS. Nothing may be scheduled before 06:30 or after 19:00 in the
--     rooftop's own time. A check constraint enforces it against the stored
--     local time, so it holds no matter who writes the row.
--   * NEVER RED, NEVER COMPARATIVE. Those live in the copy file
--     (lib/notifications/push-copy.ts) and are restated here because the schema
--     is where people look for rules they are about to break.
--
-- Idempotency is 0030's mechanism, unchanged: every row carries a dedup_key
-- naming the OCCURRENCE, and a unique index refuses the second write. Re-running
-- a window is a no-op.
--
-- NOTHING IN THIS MIGRATION SENDS ANYTHING. There is no transport here by
-- design — the outbox fills, and a delivery worker that does not exist yet will
-- drain it. See the note on generation vs delivery at the foot of this file.
-- ============================================================================


-- ---- 1. Vocabulary -----------------------------------------------------------

/** Where a queued message is in its life. Nothing here has been sent. */
do $$ begin
  create type outbox_status as enum ('pending', 'sent', 'skipped');
exception when duplicate_object then null; end $$;

/**
 * How it would go out. Deliberately NOT notification_channel (0030) — that enum
 * is a user PREFERENCE ('in_app','email','both'). This one is a transport, and
 * in_app is not a transport for an outbox that exists to leave the building.
 */
do $$ begin
  create type outbox_channel as enum ('push', 'email');
exception when duplicate_object then null; end $$;

do $$ begin
  create type push_platform as enum ('ios', 'android');
exception when duplicate_object then null; end $$;

/**
 * The v1 trigger matrix. Every one of these is either good news or a neutral
 * prompt; there is no kind here that tells somebody they are behind, which is
 * 0030's rule 2 carried forward to a louder channel.
 */
do $$ begin
  create type outbox_kind as enum (
    'daily_numbers',   -- yesterday's data landed
    'eddies_pick',     -- the current pick, deep-linked
    'personal_best',   -- a new best. the gold moment
    'streak_keeper',   -- only when a streak is genuinely at stake
    'manager_digest'   -- weekly, team summary
  );
exception when duplicate_object then null; end $$;


-- ---- 2. Rooftop wall-clock helpers -------------------------------------------
/**
 * 0013 gave us rooftop_today(). These give us the time of day, which is what
 * scheduling needs and what nothing in the codebase could express before.
 *
 * rooftop_local_now  — what time is it AT THE STORE, as a naive wall clock.
 * rooftop_local_at   — turn a local date + local time at that store into the
 *                      absolute instant it happens.
 *
 * The second one is the whole trick. `(_d + _t) at time zone tz` reads the
 * left side as a wall clock IN tz and returns the instant — which is the
 * opposite direction from `timestamptz at time zone tz`, and the reason this is
 * a named function rather than something inlined at four call sites.
 */
create or replace function rooftop_local_now(_rooftop uuid)
returns timestamp
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone (select timezone from rooftop where id = _rooftop))
$$;

create or replace function rooftop_local_at(_rooftop uuid, _d date, _t time)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select ((_d + _t) at time zone (select timezone from rooftop where id = _rooftop))
$$;

grant execute on function rooftop_local_now(uuid) to authenticated;
grant execute on function rooftop_local_at(uuid, date, time) to authenticated;

/** The window a phone may be buzzed in, at the store's own clock. */
create or replace function push_quiet_hours()
returns table (opens time, closes time)
language sql
immutable
as $$ select time '06:30', time '19:00' $$;


-- ---- 3. The outbox -----------------------------------------------------------

create table if not exists notification_outbox (
  id             uuid primary key default gen_random_uuid(),

  -- WHO, as a membership. A membership is the only thing that carries person +
  -- rooftop + role + operator id together, and every rule below needs at least
  -- three of those. Cascade: lose the membership, lose the queued message —
  -- somebody who left the store must not get a buzz about it.
  membership_id  uuid not null references membership(id) on delete cascade,

  -- WHO, as a user. Denormalised on purpose: RLS keys on it, the one-per-day
  -- index keys on it, and both want to avoid a join. Kept honest by a trigger
  -- below rather than by hope.
  recipient_id   uuid not null references app_user(id) on delete cascade,

  -- WHICH STORE'S CLOCK governs this row.
  rooftop_id     uuid not null references rooftop(id) on delete cascade,

  kind           outbox_kind not null,
  channel        outbox_channel not null default 'push',
  status         outbox_status not null default 'pending',

  title          text not null,
  body           text not null,

  -- Where tapping it lands. An in-app route, always — a push that opens the
  -- login page is worse than no push.
  deep_link      text not null,

  -- WHEN, absolutely. Computed through rooftop_local_at from the values below.
  scheduled_for  timestamptz not null,

  -- WHEN, at the store. Both are stored because both are asked: the date drives
  -- the one-per-day rule and the dedup key, and the time is what the quiet-hours
  -- constraint can actually check.
  local_date     date not null,
  local_time     time not null,

  -- WHY this row exists, in a sentence, written at generation time. When
  -- somebody asks "why did I get this", the answer should not require reading
  -- the generator.
  rationale      text not null,

  -- The OCCURRENCE this announces. Re-running a window rewrites the same key
  -- and the unique index below refuses it.
  dedup_key      text not null,

  created_at     timestamptz not null default now(),
  sent_at        timestamptz,
  skipped_reason text,

  -- Quiet hours, structurally. 06:30 and 19:00 are repeated here rather than
  -- read from push_quiet_hours() because a check constraint must be immutable.
  -- If you change one, change the other; the preview script asserts they agree.
  constraint notification_outbox_quiet_hours
    check (local_time >= time '06:30' and local_time <= time '19:00'),

  constraint notification_outbox_sent_has_time
    check ((status = 'sent') = (sent_at is not null)),

  constraint notification_outbox_skipped_has_reason
    check (status <> 'skipped' or skipped_reason is not null)
);

/* Idempotency. 0030's mechanism, and for the same reason. */
create unique index if not exists notification_outbox_dedup
  on notification_outbox (recipient_id, dedup_key);

/*
 * ONE PER PERSON PER DAY, enforced by the database rather than by the care of
 * whoever writes the next generator.
 *
 * Personal bests are excluded from the index, which is what "may stack" means.
 * Skipped rows are excluded too: a message we decided not to send must not
 * consume somebody's one slot for the day.
 */
create unique index if not exists notification_outbox_one_per_day
  on notification_outbox (recipient_id, local_date)
  where kind <> 'personal_best' and status <> 'skipped';

create index if not exists notification_outbox_due
  on notification_outbox (status, scheduled_for)
  where status = 'pending';

create index if not exists notification_outbox_recipient
  on notification_outbox (recipient_id, local_date desc);

/**
 * recipient_id must be the membership's user. Denormalisation is a performance
 * decision, not a licence to disagree with the source of truth.
 */
create or replace function notification_outbox_sync_recipient()
returns trigger
language plpgsql
as $$
begin
  select m.user_id, m.rooftop_id into new.recipient_id, new.rooftop_id
    from membership m where m.id = new.membership_id;
  if new.recipient_id is null then
    raise exception 'notification_outbox: membership % has no user', new.membership_id;
  end if;
  return new;
end $$;

drop trigger if exists notification_outbox_recipient_sync on notification_outbox;
create trigger notification_outbox_recipient_sync
  before insert or update of membership_id on notification_outbox
  for each row execute function notification_outbox_sync_recipient();

/**
 * 0030 RULE 2, CARRIED FORWARD TO A LOUDER CHANNEL.
 *
 * "Advisors receive wins only. There is no recipient path that sends an advisor
 * a 'you're behind' notice." That was a property of which kinds existed in 0030.
 * Push makes it easier to break by accident — somebody adds a well-meaning
 * 'attach_dropped' push six months from now — so here it is as a constraint
 * instead of a convention.
 *
 * ADVISOR_SAFE is the whitelist. A kind reaches an advisor only if it is on it.
 * Everything on it is a win or an invitation:
 *
 *   daily_numbers  the numbers are in. neutral, no verdict attached.
 *   eddies_pick    an opportunity and a word track. never a deficit.
 *   personal_best  unambiguously a win.
 *   streak_keeper  an invitation to keep something going, and it only fires
 *                  when the streak is alive — never to report it broken.
 *
 * manager_digest is the mirror image: it may go ONLY to a coach, because a team
 * summary sent to an advisor is a comparison, and comparison is the thing this
 * product refuses to do.
 */
create or replace function notification_outbox_enforce_audience()
returns trigger
language plpgsql
as $$
declare
  _role member_role;
  advisor_safe constant outbox_kind[] :=
    array['daily_numbers','eddies_pick','personal_best','streak_keeper']::outbox_kind[];
begin
  select m.role into _role from membership m where m.id = new.membership_id;

  if _role = 'advisor' and not (new.kind = any (advisor_safe)) then
    raise exception
      'notification_outbox: % may not be sent to an advisor. Advisors receive wins and invitations only (0030 rule 2).',
      new.kind;
  end if;

  if new.kind = 'manager_digest' and _role not in ('manager', 'admin') then
    raise exception
      'notification_outbox: manager_digest is for coaches only — a team summary sent to an advisor is a comparison.';
  end if;

  return new;
end $$;

drop trigger if exists notification_outbox_audience on notification_outbox;
create trigger notification_outbox_audience
  before insert or update of kind, membership_id on notification_outbox
  for each row execute function notification_outbox_enforce_audience();

alter table notification_outbox enable row level security;

/*
 * Read your own mail. No insert or update policy at all: the outbox is written
 * by the generator (security definer) and drained by a delivery worker using
 * the service role. 0030 made the same call for the same reason — anything a
 * browser can write, a browser can forge, and this one rings a phone.
 */
drop policy if exists notification_outbox_own_read on notification_outbox;
create policy notification_outbox_own_read on notification_outbox
  for select using (recipient_id = (select auth.uid()));

/* Coaches and the platform owner may inspect what their store would send. */
drop policy if exists notification_outbox_admin_read on notification_outbox;
create policy notification_outbox_admin_read on notification_outbox
  for select using (
    (select is_platform_owner()) or rooftop_id in (select managed_rooftops())
  );

grant select on notification_outbox to authenticated;


-- ---- 4. Device tokens --------------------------------------------------------
/**
 * One row per app install. The shell registers on launch and refreshes when the
 * OS rotates the token; `last_seen` is what lets a delivery worker stop pushing
 * at devices that have gone quiet for months.
 *
 * The token is globally unique, not unique per user: when somebody signs out
 * and a colleague signs in on the same handset, the row must MOVE rather than
 * duplicate, or the previous user keeps receiving the new one's notifications.
 * register_push_token() below does exactly that.
 */
create table if not exists device_push_token (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_user(id) on delete cascade,
  platform    push_platform not null,
  token       text not null,
  last_seen   timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  constraint device_push_token_unique unique (token)
);

create index if not exists device_push_token_user on device_push_token (user_id, last_seen desc);

alter table device_push_token enable row level security;

drop policy if exists device_push_token_own_read on device_push_token;
create policy device_push_token_own_read on device_push_token
  for select using (user_id = (select auth.uid()));

drop policy if exists device_push_token_own_write on device_push_token;
create policy device_push_token_own_write on device_push_token
  for insert with check (user_id = (select auth.uid()));

drop policy if exists device_push_token_own_update on device_push_token;
create policy device_push_token_own_update on device_push_token
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists device_push_token_own_delete on device_push_token;
create policy device_push_token_own_delete on device_push_token
  for delete using (user_id = (select auth.uid()));

grant select, insert, update, delete on device_push_token to authenticated;

/**
 * What the app shell calls on launch and on token refresh.
 *
 * Upsert on the TOKEN, reassigning the user — see the note on the table. Runs
 * as the caller (invoker), so RLS still applies and nobody can register a token
 * against somebody else's account.
 */
create or replace function register_push_token(_token text, _platform push_platform)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare _uid uuid := auth.uid();
begin
  if _uid is null then
    raise exception 'register_push_token: not signed in';
  end if;
  if _token is null or length(trim(_token)) = 0 then
    raise exception 'register_push_token: empty token';
  end if;

  insert into device_push_token (user_id, platform, token, last_seen)
  values (_uid, _platform, trim(_token), now())
  on conflict (token) do update
    set user_id   = excluded.user_id,
        platform  = excluded.platform,
        last_seen = now();

  return jsonb_build_object('registered', true, 'platform', _platform);
end $$;

revoke all on function register_push_token(text, push_platform) from public, anon;
grant execute on function register_push_token(text, push_platform) to authenticated;

/** Sign-out, or "this handset is not mine any more". */
create or replace function forget_push_token(_token text)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  delete from device_push_token
   where token = trim(_token) and user_id = auth.uid()
  returning jsonb_build_object('forgotten', true);
$$;

revoke all on function forget_push_token(text) from public, anon;
grant execute on function forget_push_token(text) to authenticated;


-- ---- 5. What the matrix is allowed to say ------------------------------------
/**
 * Per-kind scheduling policy, as data rather than as branches in a function.
 *
 * `target_local_time` is when this kind wants to arrive at the store's clock.
 * `min_days_between` throttles a kind for one person — Eddie's Pick at 2 means
 * at most three or four a week, which is the "2-3x/week max" rule expressed in
 * the only unit the generator can actually check.
 */
create table if not exists outbox_policy (
  kind              outbox_kind primary key,
  target_local_time time not null,
  min_days_between  int not null default 0,
  channel           outbox_channel not null default 'push',
  enabled           boolean not null default true,
  note              text
);

insert into outbox_policy (kind, target_local_time, min_days_between, note) values
  ('daily_numbers',  time '07:00', 0,
   'Morning, once the overnight import has landed. Nothing to chase — the numbers are simply in.'),
  ('eddies_pick',    time '09:30', 2,
   'Mid-morning, after the drive has opened. Throttled to every third day so it stays a prompt and not a nag.'),
  ('personal_best',  time '17:00', 0,
   'End of day, when the number is final. The only kind allowed to stack — two bests in a day is a better day.'),
  ('streak_keeper',  time '16:30', 0,
   'Late afternoon, and only when the streak is genuinely at risk today. Never sent on a day off.'),
  ('manager_digest', time '08:00', 6,
   'Once a week, Monday, before the first appointment.')
on conflict (kind) do nothing;

alter table outbox_policy enable row level security;
drop policy if exists outbox_policy_read on outbox_policy;
create policy outbox_policy_read on outbox_policy
  for select using ((select auth.uid()) is not null);
grant select on outbox_policy to authenticated;


-- ---- 6. Generation ----------------------------------------------------------
/**
 * Fill the outbox for whatever rooftops are currently at the right moment.
 *
 * CALLED EVERY THIRTY MINUTES, NOT ONCE A NIGHT. Each run asks every rooftop
 * what time it is there, and emits only the rows whose target time has just
 * passed. That is what makes a Honolulu store get a 7am notice at 7am instead
 * of at 9pm the day before.
 *
 * IDEMPOTENT. Every insert carries a dedup_key naming the occurrence and lands
 * with `on conflict do nothing`. Running the same window twice, or five times,
 * produces the same outbox.
 *
 * GENERATES ONLY. Nothing here talks to a device. Status stays 'pending' until
 * something else drains it.
 *
 * _now_override exists for the preview script and for tests; production passes
 * nothing.
 */
create or replace function generate_push_outbox(_now_override timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _at        timestamptz := coalesce(_now_override, now());
  _queued    int := 0;
  _skipped   int := 0;
  _n         int := 0;
  _r         record;
  _p         record;
  _local_now timestamp;
  _l_date    date;
  _l_time    time;
begin
  if not (
    is_platform_owner()
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
       = 'service_role'
    or auth.uid() is null   -- pg_cron runs with no JWT at all
  ) then
    raise exception 'generate_push_outbox: platform owner only';
  end if;

  for _r in
    select r.id as rooftop_id, r.timezone
      from rooftop r
     where exists (select 1 from membership m where m.rooftop_id = r.id and m.active)
  loop
    _local_now := _at at time zone _r.timezone;
    _l_date    := _local_now::date;
    _l_time    := _local_now::time;

    for _p in select * from outbox_policy where enabled loop
      -- Has this kind's moment passed today, within the last half hour? A wider
      -- window would re-emit all day; a narrower one loses rows if a run is
      -- missed. Thirty minutes matches the cron cadence exactly.
      continue when not (_l_time >= _p.target_local_time
                     and _l_time <  _p.target_local_time + interval '30 minutes');
      continue when _p.target_local_time < time '06:30'
                 or _p.target_local_time > time '19:00';

      -- ---- daily_numbers: yesterday's data actually landed ------------------
      if _p.kind = 'daily_numbers' then
        insert into notification_outbox (
          membership_id, recipient_id, rooftop_id, kind, channel,
          title, body, deep_link, scheduled_for, local_date, local_time,
          rationale, dedup_key)
        select
          m.id, m.user_id, _r.rooftop_id, 'daily_numbers', _p.channel,
          c.title, c.body, '/advisor',
          rooftop_local_at(_r.rooftop_id, _l_date, _p.target_local_time),
          _l_date, _p.target_local_time,
          format('Daily metrics for %s landed for this rooftop overnight.', d.last_day),
          format('daily_numbers:%s:%s', m.id, _l_date)
        from membership m
        join lateral (
          select max(dm.report_date) as last_day
            from dms_daily_metric dm
           where dm.rooftop_id = _r.rooftop_id
             and dm.report_date >= _l_date - 3
        ) d on true
        cross join lateral (select * from push_copy('daily_numbers')) c
        where m.rooftop_id = _r.rooftop_id
          and m.active
          and m.role = 'advisor'
          and m.op_code_id is not null
          and d.last_day is not null
        on conflict do nothing;
        get diagnostics _n = row_count; _queued := _queued + _n;
      end if;

      -- ---- eddies_pick ------------------------------------------------------
      if _p.kind = 'eddies_pick' then
        insert into notification_outbox (
          membership_id, recipient_id, rooftop_id, kind, channel,
          title, body, deep_link, scheduled_for, local_date, local_time,
          rationale, dedup_key)
        select
          m.id, m.user_id, _r.rooftop_id, 'eddies_pick', _p.channel,
          c.title, replace(c.body, '{family}', p.family), '/advisor',
          rooftop_local_at(_r.rooftop_id, _l_date, _p.target_local_time),
          _l_date, _p.target_local_time,
          format('Current pick is %s, %s%% against a store average of %s%%.',
                 p.family, p.attach_rate_pct, p.store_avg_pct),
          format('eddies_pick:%s:%s', m.id, _l_date)
        from membership m
        join lateral (
          select fa.family, fa.attach_rate_pct, b.store_avg_pct
            from advisor_family_attach fa
            join family_store_benchmark b
              on b.period_id = fa.period_id and b.rooftop_id = fa.rooftop_id
             and b.family = fa.family
            join perf_period pp on pp.id = fa.period_id
           where fa.rooftop_id = _r.rooftop_id
             and fa.advisor_op_id = m.op_code_id
             and not pp.is_partial
             and fa.attach_rate_pct < b.store_avg_pct
           order by pp.starts_on desc, (b.store_avg_pct - fa.attach_rate_pct) desc
           limit 1
        ) p on true
        cross join lateral (select * from push_copy('eddies_pick')) c
        where m.rooftop_id = _r.rooftop_id
          and m.active and m.role = 'advisor' and m.op_code_id is not null
          -- throttle: nothing of this kind within min_days_between
          and not exists (
            select 1 from notification_outbox o
             where o.recipient_id = m.user_id
               and o.kind = 'eddies_pick'
               and o.status <> 'skipped'
               and o.local_date > _l_date - _p.min_days_between - 1
          )
        on conflict do nothing;
        get diagnostics _n = row_count; _queued := _queued + _n;
      end if;

      -- ---- personal_best: a new best month ----------------------------------
      -- The only kind allowed to stack, so it carries the period in its dedup
      -- key rather than the date: two different bests are two different
      -- occurrences, the same best re-detected is one.
      if _p.kind = 'personal_best' then
        insert into notification_outbox (
          membership_id, recipient_id, rooftop_id, kind, channel,
          title, body, deep_link, scheduled_for, local_date, local_time,
          rationale, dedup_key)
        select
          m.id, m.user_id, _r.rooftop_id, 'personal_best', _p.channel,
          c.title, c.body, '/advisor',
          rooftop_local_at(_r.rooftop_id, _l_date, _p.target_local_time),
          _l_date, _p.target_local_time,
          format('%s labor sales of %s beat every prior month on record.',
                 b.label, round(b.best)),
          format('personal_best:%s:%s', m.id, b.period_id)
        from membership m
        join lateral (
          select t.period_id, pp.label, t.total_labor_sales as best
            from advisor_period_totals t
            join perf_period pp on pp.id = t.period_id
           where t.rooftop_id = _r.rooftop_id
             and t.advisor_op_id = m.op_code_id
             and not pp.is_partial
             and pp.superseded_at is null
           order by pp.starts_on desc
           limit 1
        ) b on true
        cross join lateral (select * from push_copy('personal_best')) c
        where m.rooftop_id = _r.rooftop_id
          and m.active and m.role = 'advisor' and m.op_code_id is not null
          -- it is only a best if nothing before it was bigger
          and b.best > coalesce((
            select max(t2.total_labor_sales)
              from advisor_period_totals t2
              join perf_period p2 on p2.id = t2.period_id
             where t2.rooftop_id = _r.rooftop_id
               and t2.advisor_op_id = m.op_code_id
               and not p2.is_partial
               and p2.superseded_at is null
               and p2.starts_on < (select starts_on from perf_period where id = b.period_id)
          ), 0)
        on conflict do nothing;
        get diagnostics _n = row_count; _queued := _queued + _n;
      end if;

      -- ---- streak_keeper: an invitation, never a warning --------------------
      -- Fires only when the streak is REAL (two days or more), today is a day
      -- they were scheduled to work, and they have not completed it yet. On a
      -- day off, or with nothing at stake, it does not fire at all — which is
      -- the difference between keeping somebody company and nagging them.
      if _p.kind = 'streak_keeper' then
        insert into notification_outbox (
          membership_id, recipient_id, rooftop_id, kind, channel,
          title, body, deep_link, scheduled_for, local_date, local_time,
          rationale, dedup_key)
        select
          m.id, m.user_id, _r.rooftop_id, 'streak_keeper', _p.channel,
          c.title, replace(c.body, '{days}', s.current_len::text), '/today',
          rooftop_local_at(_r.rooftop_id, _l_date, _p.target_local_time),
          _l_date, _p.target_local_time,
          format('%s-day Swell, scheduled today, not yet completed.', s.current_len),
          format('streak_keeper:%s:%s', m.id, _l_date)
        from membership m
        join swell s on s.user_id = m.user_id
        cross join lateral (select * from push_copy('streak_keeper')) c
        where m.rooftop_id = _r.rooftop_id
          and m.active and m.role = 'advisor'
          and s.current_len >= 2
          and s.last_completed_on = _l_date - 1
          and is_scheduled_day(m.user_id, _l_date)
          and not exists (
            select 1 from daily_completion dc
             where dc.user_id = m.user_id and dc.completion_date = _l_date
          )
        on conflict do nothing;
        get diagnostics _n = row_count; _queued := _queued + _n;
      end if;

      -- ---- manager_digest: Mondays only -------------------------------------
      if _p.kind = 'manager_digest' and extract(isodow from _l_date) = 1 then
        insert into notification_outbox (
          membership_id, recipient_id, rooftop_id, kind, channel,
          title, body, deep_link, scheduled_for, local_date, local_time,
          rationale, dedup_key)
        select
          m.id, m.user_id, _r.rooftop_id, 'manager_digest', _p.channel,
          c.title, replace(c.body, '{n}', t.n::text), '/manager',
          rooftop_local_at(_r.rooftop_id, _l_date, _p.target_local_time),
          _l_date, _p.target_local_time,
          format('Weekly team summary for %s advisors.', t.n),
          format('manager_digest:%s:%s', m.id, _l_date)
        from membership m
        join lateral (
          select count(*)::int as n from membership a
           where a.rooftop_id = _r.rooftop_id and a.active and a.role = 'advisor'
        ) t on true
        cross join lateral (select * from push_copy('manager_digest')) c
        where m.rooftop_id = _r.rooftop_id
          and m.active and m.role in ('manager', 'admin')
          and t.n > 0
        on conflict do nothing;
        get diagnostics _n = row_count; _queued := _queued + _n;
      end if;

    end loop;
  end loop;

  return jsonb_build_object(
    'generated_at', _at,
    'queued', _queued,
    'skipped', _skipped
  );
end $$;

revoke all on function generate_push_outbox(timestamptz) from public, anon;


-- ---- 7. Copy lives in TypeScript; this mirrors it for the generator ----------
/**
 * The generator runs in SQL and the copy is authored in
 * lib/notifications/push-copy.ts, which is the file marked for Mitch's voice
 * pass. Two copies of a string is a drift risk, so this function is the ONLY
 * place SQL is allowed to know a word of it, and the preview script asserts the
 * two agree.
 *
 * Placeholder copy. Structure is the deliverable; the words are Mitch's.
 */
create or replace function push_copy(_kind outbox_kind)
returns table (title text, body text)
language sql
immutable
as $$
  select c.title, c.body from (values
    ('daily_numbers',  'Aloha — yesterday''s numbers are in',
                       'Take three minutes and see where you landed.'),
    ('eddies_pick',    'Eddie''s Pick is ready',
                       '{family} is your biggest opportunity today. Here''s the word track.'),
    ('personal_best',  'That''s a personal best',
                       'Your best month yet. Take the win — you earned it.'),
    ('streak_keeper',  'Your streak is still going',
                       '{days} days so far. One three-minute session keeps it going.'),
    ('manager_digest', 'Your team''s week',
                       'A look at how your {n} advisors finished the week.')
  ) as c(kind, title, body)
  where c.kind = _kind::text
$$;

grant execute on function push_copy(outbox_kind) to authenticated;


-- ---- 8. Scheduling ----------------------------------------------------------
/**
 * EVERY THIRTY MINUTES, not once a night, and this is the point of the whole
 * migration. A single nightly UTC fire cannot give eleven rooftops in five
 * timezones a 7am notice; thirty minutes is the coarsest cadence that still
 * lands each kind inside its own half-hour window, and it is fine because a run
 * with nothing to do is a handful of index probes.
 *
 * Fails soft if pg_cron is absent, matching 0028/0029/0031.
 */
do $cron$
begin
  perform cron.unschedule('push-outbox-generate')
   where exists (select 1 from cron.job where jobname = 'push-outbox-generate');
  perform cron.schedule('push-outbox-generate', '*/30 * * * *',
    $job$ select generate_push_outbox() $job$);
  raise notice 'push-outbox-generate scheduled every 30 minutes.';
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end
$cron$;


-- ---- 9. What is due, for whoever ends up delivering --------------------------
/**
 * The delivery worker's query, as a view so the worker does not have to restate
 * the rules. Joined to device tokens because a message with nowhere to go is
 * not due; it is skippable.
 *
 * DELIBERATELY NOT A FUNCTION THAT MARKS ROWS SENT. Claiming and sending is the
 * transport's job and it does not exist yet. This view is read-only on purpose.
 */
create or replace view push_outbox_due as
select
  o.id, o.recipient_id, o.rooftop_id, o.kind, o.channel,
  o.title, o.body, o.deep_link, o.scheduled_for, o.local_date, o.rationale,
  t.token, t.platform
from notification_outbox o
join device_push_token t on t.user_id = o.recipient_id
where o.status = 'pending'
  and o.channel = 'push'
  and o.scheduled_for <= now();

alter view push_outbox_due set (security_invoker = on);
grant select on push_outbox_due to authenticated;

notify pgrst, 'reload schema';
