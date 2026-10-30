-- 0168_manager_meeting_placement.sql
--
-- Manager Meetings Vol 4 — the Op Code Boost Meetings. Ingest-side only.
-- Nothing the daily loop reads is altered by this file.
--
-- =========================================================================
-- 1. A NAMED PLACEMENT, BECAUSE NULL IS THE WORST OF BOTH
-- =========================================================================
-- The 17 Vol 3 manager films carry placement NULL. 0128 already wrote down
-- what that costs: a NULL is invisible to every surface that SELECTS a
-- placement and is not excluded by any gate that EXCLUDES one. Those films
-- are safe today only because their service_family and op_code both happen
-- to be null — an accident, not a guarantee.
--
-- A named value makes Vol 4 excluded from the daily loop BY CONSTRUCTION.
-- Every picker selects with positive equality:
--
--     lib/loop.ts:181      .eq("placement", "daily_lifestyle")
--     lib/daily.ts:899     .eq("placement", "daily_lifestyle")
--     lib/daily.ts:1017    .eq("placement", "technician_daily")
--     lib/mileage.ts:101   .eq("placement", REFERENCE)
--     app/onboarding       .eq("placement", "onboarding_intro")
--
-- A value none of them names cannot be drawn by any of them, and no new
-- condition has to be remembered anywhere. /meetings is unaffected: it
-- selects on type = 'manager_video' and has never read placement.
--
-- ADDING AN ENUM VALUE IS ADDITIVE. No existing row changes, no existing
-- predicate changes meaning, and every `= 'x'` comparison already in the
-- schema keeps the answer it had.

alter type content_placement add value if not exists 'manager_meeting';

-- =========================================================================
-- 2. THE OP CODE DOES NOT GO ON content.op_code, AND THIS IS THE REASON
-- =========================================================================
-- service_family_content's second arm is, verbatim:
--
--     WHERE c.op_code IS NOT NULL
--       AND f.retired_at IS NULL
--       AND coalesce(c.placement::text, '') <> 'reference'
--
-- That excludes exactly ONE placement, BY NAME. A manager film carrying an
-- op code would satisfy the predicate and enter the view — and that view is
-- what the advisor pitch slot reads. It is the menu film arriving in the
-- pitch slot announcing itself coachable, with a different prefix.
--
-- Widening that predicate would mean editing a view the loop depends on,
-- which this work is explicitly not allowed to do. So the association lives
-- in its own table that nothing in the loop joins to. The unsafe state is
-- not merely avoided; it cannot be represented, because content.op_code
-- stays null for these films.

create table if not exists manager_meeting_op_code (
  content_id  uuid primary key references content(id) on delete cascade,
  op_code     text not null references op_code_catalog(code) on update cascade,
  -- How the association was made. 'manifest' is the only writer today; a
  -- hand correction must say so rather than be indistinguishable from one
  -- the pipeline made.
  origin      text not null default 'manifest'
                check (origin in ('manifest', 'manual')),
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table manager_meeting_op_code is
  'Which op code a Manager Meetings film coaches. SEPARATE FROM content.op_code '
  'on purpose: service_family_content keys on content.op_code and excludes only '
  'placement=''reference'' by name, so writing the code there would put a manager '
  'film into the advisor pitch slot. Nothing in the daily loop joins this table. 0168.';

comment on column manager_meeting_op_code.op_code is
  'FK to op_code_catalog, so a code that is not in the catalog cannot be stored '
  'at all — the manifest match is exact and this is the second guard behind it.';

-- One film per op code per volume is the intent, but it is NOT enforced as a
-- unique constraint: Vol 5 may well coach the same code again, and a unique
-- index would turn that into a failed ingest months from now. Duplicates are
-- a reporting question, not a storage error.
create index if not exists manager_meeting_op_code_code_idx
  on manager_meeting_op_code (op_code);

-- =========================================================================
-- 3. RLS — the same shape as the films it describes
-- =========================================================================
-- This table says something ABOUT a manager film, so it is readable by
-- whoever may read manager films and by nobody else. Supabase grants anon on
-- every new object, so the revoke is first and is not optional.

alter table manager_meeting_op_code enable row level security;

revoke all on table manager_meeting_op_code from anon, authenticated;
grant select on table manager_meeting_op_code to authenticated;
grant select, insert, update, delete on table manager_meeting_op_code to service_role;

drop policy if exists manager_meeting_op_code_read on manager_meeting_op_code;
create policy manager_meeting_op_code_read on manager_meeting_op_code
  for select to authenticated
  using (
    -- NAMING THE ROLES THAT WILL REALLY CALL IT:
    --   platform owner  every store, as everywhere else
    --   manager/admin   the people /meetings is built for
    --   advisor         NOT a reader. There is no advisor surface for this,
    --                   and an advisor reading it would be the first step
    --                   toward it reaching a slot picker.
    --   technician      same.
    --   service_role    granted above, outside RLS, for the ingest.
    is_platform_owner()
    or exists (
      select 1 from membership m
       where m.user_id = (select auth.uid())
         and m.active
         and m.role in ('manager', 'admin')
    )
  );

notify pgrst, 'reload schema';
