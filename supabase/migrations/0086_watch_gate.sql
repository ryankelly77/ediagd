-- ============================================================================
-- EDIAGD — 0086 A met gate survives a refresh
--
-- ---------------------------------------------------------------------------
-- THE GAP THIS CLOSES
-- ---------------------------------------------------------------------------
-- The gate's original contract says it "never resets once it's been met for
-- that day". Until now that was true inside a tab and false across a reload:
-- coverage lives in a ref, so a refresh started the measurement at zero and the
-- daily loop asked an advisor who had just watched the whole video to watch it
-- again.
--
-- The obvious repair — persist the coverage, or resume the playhead — is the
-- one that must not be made. Session-only coverage is what stops a watch being
-- assembled out of four days of five-second visits, and starting a gated player
-- at zero is what got fixed in the scrub lockout, where a stored resume point
-- put the playhead four seconds from the end forever.
--
-- So what is stored is not the position and not the coverage. It is the FACT
-- that the gate was met, for one video, on one store-local day, with the
-- percentage that met it.
--
-- ---------------------------------------------------------------------------
-- WHY THE BROWSER CANNOT WRITE THIS
-- ---------------------------------------------------------------------------
-- A row here opens a gate. An advisor who could insert their own would open
-- every gate in the app from a console, and the whole watch measurement would
-- become decorative — the same reasoning 0067 used to deny coaching_block a
-- user-facing insert policy, and 0081 used to take away the self-write policies
-- generally.
--
-- Writes come from recordGateMetAction through the service client, and only
-- after the same two checks a completion makes: the watch ticket's signature,
-- and the wall clock against the moment that ticket was minted. Reading your
-- own rows is a different question and is allowed.
--
-- ---------------------------------------------------------------------------
-- TODAY ONLY
-- ---------------------------------------------------------------------------
-- store_date is part of the key, so a gate met today means nothing tomorrow:
-- the same video served again is gated again. Rows are kept rather than swept
-- because they are the evidence behind a completion's watch percentage, and a
-- certification programme is going to be asked where that number came from.
-- ============================================================================

create table if not exists watch_gate (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references app_user(id) on delete cascade,
  rooftop_id   uuid not null references rooftop(id) on delete cascade,
  content_id   uuid not null references content(id) on delete cascade,
  -- The ROOFTOP's date, not the server's. A store in Hawaii and one in Ohio
  -- roll over at different instants and the loop is keyed to the store's day
  -- everywhere else; keying this to UTC would open a second gate at midnight
  -- for some rooftops and none for others.
  store_date   date not null,
  -- What the coverage measured when the gate opened. NULL means unmeasurable
  -- rather than zero — the 0070 convention — which is what the error valve
  -- below leaves behind.
  watched_pct  numeric(5,2),
  -- The gate opened because the player failed, not because the video was
  -- watched. Carried into daily_completion.watch_error so a refresh after a
  -- broken video does not demand the broken video again.
  watch_error  boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (user_id, content_id, store_date)
);

comment on table watch_gate is
  'One row per (advisor, video, store-local day) whose watch gate has been met. '
  'Written ONLY by recordGateMetAction, after the same ticket and wall-clock '
  'checks a completion makes. Never written by the browser. See '
  'lib/watch-gate.ts.';

comment on column watch_gate.watched_pct is
  'Coverage at the moment the gate opened, 0-100. Null when the gate was '
  'released by the failure valve rather than met by watching.';

-- The lookup /today makes on every render: this advisor, this day.
create index if not exists watch_gate_user_day_idx
  on watch_gate(user_id, store_date);

-- ---- RLS -------------------------------------------------------------------
alter table watch_gate enable row level security;

/*
 * READ YOUR OWN, WRITE NOTHING.
 *
 * There is deliberately no insert, update or delete policy. The service client
 * bypasses RLS and is the only writer; anon and authenticated get select on
 * their own rows and nothing else. A missing policy is a denial, so this is
 * complete as written — but it is stated here so the next person does not add
 * one "for symmetry".
 */
drop policy if exists watch_gate_self_read on watch_gate;
create policy watch_gate_self_read on watch_gate
  for select using (user_id = (select auth.uid()));
