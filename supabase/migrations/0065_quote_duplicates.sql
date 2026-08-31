-- ============================================================================
-- EDIAGD — 0065 The duplicate question, asked in the app
--
-- Part A retired the 22 rows that were mechanically the same line twice. What
-- is left is 27 groups where a short line and a longer passage say the same
-- thing, and the choice between them is editorial: the punchy version is what
-- fits on a quote card, and the passage is what carries the coaching. A script
-- guessing at that is a script deleting Mitch's writing.
--
-- ---------------------------------------------------------------------------
-- WHY NOT content_review
-- ---------------------------------------------------------------------------
-- 0061's queue is keyed `unique (content_id, reason)` — one row, one question.
-- A duplicate is a question about a SET of rows, and the answer ("keep this
-- one") writes to all of them. Modelling that as N review rows would mean
-- answering the same question N times and would let a group half-resolve.
--
-- So: a group, its members, and a suppression list. The queue surface and the
-- feel are shared with content_review; the shape underneath is not.
-- ============================================================================


-- ---- What kind of duplicate this is ----------------------------------------
create type quote_duplicate_shape as enum ('identical', 'drift', 'excerpt');

create type quote_duplicate_status as enum ('open', 'resolved', 'dismissed');


-- ---- The group -------------------------------------------------------------
create table quote_duplicate_group (
  id           uuid primary key default gen_random_uuid(),
  shape        quote_duplicate_shape not null,
  -- The sentence from the scan that says WHY these matched: "one contains the
  -- other", "shares a sentence: …". Shown on the card so the reason a group
  -- exists is visible to the person being asked about it.
  relation     text,
  -- The group number in reports/quote-duplicates.csv, so a card on a phone can
  -- be traced back to the run that produced it.
  source_group text,
  status       quote_duplicate_status not null default 'open',
  resolved_by  uuid references app_user(id),
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index on quote_duplicate_group(status);


-- ---- The rows in it --------------------------------------------------------
create table quote_duplicate_member (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references quote_duplicate_group(id) on delete cascade,
  content_id uuid not null references content(id) on delete cascade,
  -- The pre-selection, not the decision. 'survive' means the card opens with
  -- this row chosen; Mitch can pick another and the group records what he did.
  proposed   text not null default 'retire' check (proposed in ('survive', 'retire')),
  -- A row a video points at cannot be retired without moving the link first,
  -- so the control is disabled and this is why. Denormalised deliberately: the
  -- card must render the same reason the server will enforce, and recomputing
  -- it in the client from a join is how the two drift apart.
  unretirable boolean not null default false,
  unique (group_id, content_id)
);

create index on quote_duplicate_member(content_id);


-- ---- "These are not the same thing" ----------------------------------------
/*
 * THE PIECE THE SPREADSHEET FLOW DID NOT HAVE.
 *
 * Every previous pass re-derived its findings from scratch, so a pair somebody
 * had already looked at and ruled on came back the next time the scan ran. A
 * queue that refills itself with answered questions is a queue people stop
 * opening.
 *
 * Pair-level rather than group-level, because groups are not stable: a
 * three-row group that loses a member to a retirement is a different group by
 * id but the same question about the pair inside it. Keyed on the two row ids
 * plus the relation that matched them, so a pair cleared for sharing a
 * sentence can still be flagged later if it turns out to be identical.
 *
 * a_id < b_id is enforced, not merely conventional — otherwise the same ruling
 * stores twice under two orderings and neither lookup finds both.
 */
create table quote_duplicate_suppression (
  a_id       uuid not null references content(id) on delete cascade,
  b_id       uuid not null references content(id) on delete cascade,
  relation   text not null,
  created_by uuid references app_user(id),
  created_at timestamptz not null default now(),
  primary key (a_id, b_id, relation),
  constraint quote_duplicate_suppression_ordered check (a_id < b_id)
);


-- ---- Who can see any of this -----------------------------------------------
-- Same power as editing the content itself, exactly as content_review: anyone
-- who can change a quote can say two quotes are the same quote, and nobody
-- else sees this at all.
alter table quote_duplicate_group enable row level security;
alter table quote_duplicate_member enable row level security;
alter table quote_duplicate_suppression enable row level security;

create policy quote_duplicate_group_admin_all on quote_duplicate_group
  for all
  using (exists (select 1 from membership m
                 where m.user_id = (select auth.uid()) and m.active and m.role = 'admin'))
  with check (exists (select 1 from membership m
                 where m.user_id = (select auth.uid()) and m.active and m.role = 'admin'));

create policy quote_duplicate_member_admin_all on quote_duplicate_member
  for all
  using (exists (select 1 from membership m
                 where m.user_id = (select auth.uid()) and m.active and m.role = 'admin'))
  with check (exists (select 1 from membership m
                 where m.user_id = (select auth.uid()) and m.active and m.role = 'admin'));

create policy quote_duplicate_suppression_admin_all on quote_duplicate_suppression
  for all
  using (exists (select 1 from membership m
                 where m.user_id = (select auth.uid()) and m.active and m.role = 'admin'))
  with check (exists (select 1 from membership m
                 where m.user_id = (select auth.uid()) and m.active and m.role = 'admin'));
