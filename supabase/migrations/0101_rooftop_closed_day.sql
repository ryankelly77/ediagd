-- ============================================================================
-- EDIAGD — 0101 The closure calendar: a store shuts, and the streak knows
--
-- Nothing in the system knows about holidays. A Mon–Fri advisor opening the app
-- on Labor Day meets the full ritual and, if the store was shut and they were
-- not in it, loses the day — the same failure the rest card fixed for weekends,
-- arriving from the calendar instead of the schedule.
--
-- ---------------------------------------------------------------------------
-- IT IS NOT THE FEDERAL CALENDAR, IT IS A STORE CLOSURE
-- ---------------------------------------------------------------------------
-- Plenty of dealerships open on Presidents' Day and close on Christmas Eve, and
-- which is which is a fact about one rooftop. Nothing here reads a national
-- holiday list as truth: the federal dates arrive as PROPOSALS, per rooftop, and
-- a proposal does nothing at all until the person who runs that store confirms
-- it. The standing-proposal pattern, same as sub_category_map and dealer codes.
--
-- The safety property that makes this shippable: closures only ever ADD rest. A
-- rooftop with nothing confirmed behaves exactly as it does today — every
-- scheduled day is a work day, no streak is touched. There is no configuration
-- anybody has to get right to stay where they are.
--
-- ---------------------------------------------------------------------------
-- WHY dismissed_at RATHER THAN A THIRD STATUS
-- ---------------------------------------------------------------------------
-- status is proposed | confirmed, which are the only two states that mean
-- anything to a reader: confirmed closes the store, everything else is inert.
--
-- But "dismiss" cannot be a DELETE. The seeder runs every January and would
-- re-propose the very date a manager just told us their store opens on, once a
-- year, forever. So a dismissal is a tombstone on the proposal — the row stays,
-- unconfirmed and inert, and the seeder skips any date it already has a row
-- for. A manager says "we're open that day" once.
--
-- ---------------------------------------------------------------------------
-- WHO WRITES, WHO READS
-- ---------------------------------------------------------------------------
-- WRITES are managed_rooftops() — the service manager at that store is the
-- person who actually knows whether it opens on Labor Day — plus the platform
-- owner, so Mitch can act for a dealer that has not engaged yet.
--
-- READS are my_rooftops(), which is wider ON PURPOSE and is not a leak. An
-- advisor's /today has to know whether their own store is shut today; that is
-- the entire point of the feature, and it is read under their own client. What
-- an advisor cannot do is write one, and the admin SURFACE is guarded
-- separately by the page's own manager check. A closure date is not a secret
-- from the people who would have turned up to work it.
-- ============================================================================

create table if not exists rooftop_closed_day (
  id           uuid primary key default gen_random_uuid(),
  rooftop_id   uuid not null references rooftop(id) on delete cascade,

  -- The day the store is shut, in the rooftop's own local dates. Compared
  -- against rooftop_today(), never against the server's clock.
  closed_on    date not null,

  -- Plain words, shown to the advisor: "Labor Day", "Christmas Eve",
  -- "Inventory day". The rest card renders "Closed for {label}", so the label
  -- is a noun phrase and never a sentence.
  label        text not null check (length(btrim(label)) between 1 and 60),

  status       text not null default 'proposed'
                 check (status in ('proposed', 'confirmed')),

  -- 'federal' for a seeded proposal, 'store' for one a manager added.
  origin       text not null default 'store'
                 check (origin in ('federal', 'store')),

  created_at   timestamptz not null default now(),
  created_by   uuid references app_user(id) on delete set null,
  confirmed_at timestamptz,
  confirmed_by uuid references app_user(id) on delete set null,
  dismissed_at timestamptz,
  dismissed_by uuid references app_user(id) on delete set null,

  -- A confirmed closure is a decision somebody made; a dismissed one is too.
  -- Neither may be recorded without saying who and when.
  constraint closed_day_confirmed_is_stamped
    check ((status = 'confirmed') = (confirmed_at is not null)),

  -- Confirmed and dismissed are contradictory answers to the same question.
  constraint closed_day_not_both
    check (not (status = 'confirmed' and dismissed_at is not null))
);

-- One row per store per day. This is what makes the annual seeder idempotent
-- and what stops a dismissed proposal being resurrected by the next run.
create unique index if not exists rooftop_closed_day_unique
  on rooftop_closed_day (rooftop_id, closed_on);

-- The read /today makes, every day, for one rooftop across a date window.
create index if not exists rooftop_closed_day_lookup
  on rooftop_closed_day (rooftop_id, closed_on)
  where status = 'confirmed';

alter table rooftop_closed_day enable row level security;

-- Predicates written the 0027 way: scalar subqueries so they are InitPlans
-- evaluated once, with the platform-owner check first so it short-circuits.
create policy closed_day_read on rooftop_closed_day
  for select using (
    (select is_platform_owner())
    or rooftop_id in (select my_rooftops())
  );

create policy closed_day_insert on rooftop_closed_day
  for insert with check (
    (select is_platform_owner())
    or rooftop_id in (select managed_rooftops())
  );

create policy closed_day_update on rooftop_closed_day
  for update using (
    (select is_platform_owner())
    or rooftop_id in (select managed_rooftops())
  ) with check (
    (select is_platform_owner())
    or rooftop_id in (select managed_rooftops())
  );

create policy closed_day_delete on rooftop_closed_day
  for delete using (
    (select is_platform_owner())
    or rooftop_id in (select managed_rooftops())
  );

comment on table rooftop_closed_day is
  'Per-rooftop store closures. Proposed by us, confirmed by the store''s manager. Only status=''confirmed'' rows affect anything; see lib/work-schedule.ts.';
