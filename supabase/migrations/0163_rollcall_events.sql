/* ===========================================================================
   0163 — ROLLCALL: the app records what somebody actually did

   Ryan, 6 October, before the Beaumont invites: who downloaded the app and
   when, who created their password, who completed onboarding, who completed a
   daily loop, who clicked on Certs and other courses, and who completed
   lessons outside the daily loop.

   Three of those six were already answerable — app_user.created_at,
   daily_activity, work_schedule, daily_completion. Three were not, and the
   reason is the same in each case: nothing records a NAVIGATION, and a lesson
   finished in the library is indistinguishable in content_progress from one
   finished in the morning. This is the table that closes those three.

   ---------------------------------------------------------------------------
   WHAT THIS TABLE IS NOT
   ---------------------------------------------------------------------------
   It is not a second record of anything already recorded. daily_completion is
   still what a completed morning means; content_progress is still what a
   finished lesson means; work_schedule is still what onboarded means. Two
   counters for one fact drift, and the one nobody looks at drifts silently
   (lib/engagement/mark-active.ts learned that about videos_watched).

   So every kind here records something NOTHING ELSE RECORDS:

     signed_in        the PLATFORM a session came from. The app cannot see a
                      TestFlight install — that lives in App Store Connect per
                      tester — and a first sign-in from platform `ios` is the
                      closest thing it can honestly observe. The Rollcall
                      column is labelled for what this is, not for the install
                      it stands in for.
     certs_opened     a tap on the Certs tab. No row anywhere implied one.
     track_opened     a tap into /certifications/<slug>.
     lesson_opened    a tap into a module in the library.
     library_opened   a tap into the Lesson Library.
     lesson_completed WHICH SURFACE finished it — morning or library. The
                      content_progress row is identical either way, which is
                      exactly why Ryan's sixth question could not be answered.
     story_submitted  a first story filed, as an event with a time on it.

   ---------------------------------------------------------------------------
   rooftop_id IS NOT NULL, AND THAT IS A POLICY DECISION, NOT A TIDINESS ONE
   ---------------------------------------------------------------------------
   The read policy below is `rooftop_id in (select managed_rooftops())`. A
   nullable rooftop_id would therefore produce rows that are invisible to the
   gate that selects on them and not excluded by anything either — 0128's menu
   films all over again, where a NULL was the worst of both. A row nobody can
   read is worse than a row that was never written, because the count that
   omits it looks complete.

   So the column is mandatory and the writer refuses without one, loudly. See
   lib/events/record.ts.

   ---------------------------------------------------------------------------
   target_id IS POLYMORPHIC AND HAS NO FOREIGN KEY. THE KIND NAMES THE TABLE
   ---------------------------------------------------------------------------
     track_opened                     -> certification.id
     lesson_opened, lesson_completed  -> module.id
     story_submitted                  -> certification.id
     everything else                  -> null

   One column cannot reference three tables, so there is no FK and a target can
   outlive the row it names. READERS MUST TOLERATE A TARGET THEY CANNOT
   RESOLVE and still count the event: dropping the row would turn "a module
   that was renamed" into "a lesson nobody opened", which is a confident wrong
   answer. The Rollcall screen names the track where it can and says "1 track"
   where it cannot.

   ---------------------------------------------------------------------------
   kind IS A CHECK CONSTRAINT, SO AN UNFAMILIAR KIND IS LOUD
   ---------------------------------------------------------------------------
   A free-text kind column accepts a typo and then reads as a kind nobody
   counts — the silent-by-default failure this project has now met four times
   (check:nav, three routes). A constraint makes the typo a 23514 at the
   moment it is written, which is the only moment anybody is looking.

   Adding a kind is therefore a migration AND a line in lib/events/kinds.ts.
   That is deliberate friction: the Rollcall columns are a claim about what is
   counted, and a kind that appears without one is a fact nothing reports.

   ---------------------------------------------------------------------------
   WHO MAY TOUCH IT
   ---------------------------------------------------------------------------
   NOBODY WRITES OVER PostgREST. There is no insert policy and no insert grant
   for anon or authenticated. Every row is written by the service role from a
   server action or a server component, keyed to the session's own user id —
   the id is never taken from a caller. This is daily_activity's rule (0081
   removed its self-write policy for exactly this reason): a user who can write
   their own activity can manufacture a record of turning up, and this table's
   whole purpose is to be evidence about them.

   READS are the platform owner, and anybody managing the rooftop the row
   belongs to — `managed_rooftops()`, which is manager, admin and the group
   roles. CALLED rather than restated: a policy that spells out the membership
   check instead of calling the helper silently drops the org roles the helper
   unions in, which is the bug 0115 was caught on.

   AN ADVISOR READS NOTHING — NOT EVEN THEIR OWN ROWS. Same shape as feedback
   (0154). This is a record ABOUT them kept FOR the team, and an advisor who
   could read it could tell which of their taps were being counted.
   =========================================================================== */

create table if not exists public.app_event (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.app_user(id),
  /* Mandatory — see the header. The read policy keys on it. */
  rooftop_id uuid not null references public.rooftop(id),
  kind       text not null,
  /* Polymorphic; the kind names the table. No FK is possible. */
  target_id  uuid,
  /* Whatever the kind needs and nothing else reads: platform for signed_in,
     source + content_id for lesson_completed. Free-form on purpose, like
     cron_heartbeat.detail — the shape of a kind's context should be able to
     change without a migration, because the COLUMNS are the contract and this
     is not one of them. */
  meta       jsonb,
  at         timestamptz not null default now(),
  /*
   * ONE SIGN-IN PER PERSON PER STORE-DAY, AND THE INDEX IS WHAT MAKES IT ONE.
   *
   * The layout wraps every signed-in screen, so the ping fires on whatever
   * page somebody lands on and would otherwise write a row per navigation.
   * Deduping with a preceding SELECT leaves the usual window where two taps
   * both pass the check; push_outbox settled this already — every insert
   * carries a dedup key with `on conflict do nothing`, so running it five
   * times in a minute records one event.
   *
   * NULL for every other kind, and the index is partial so the nulls do not
   * collide. A tap on Certs is not an event anybody wants deduped: opening it
   * four times in a day is four opens, and that is the number Ryan asked for.
   */
  dedup_key  text,

  constraint app_event_kind_known check (
    kind in (
      'signed_in',
      'certs_opened',
      'track_opened',
      'lesson_opened',
      'lesson_completed',
      'library_opened',
      'story_submitted'
    )
  )
);

comment on table public.app_event is
  'Rollcall telemetry: navigations and surface-of-completion, which nothing '
  'else records. Written ONLY by the service role from the server, keyed to '
  'the session user. Read by managed_rooftops() and the platform owner; an '
  'advisor reads nothing, not even their own rows. target_id is polymorphic '
  'and has no FK - the kind names the table, and a reader must count an event '
  'whose target it cannot resolve. 0163.';

comment on column public.app_event.dedup_key is
  'Set only by signed_in, as <user>:signed_in:<store date>, so a person who '
  'navigates twenty times is one sign-in. Null for every other kind, and the '
  'unique index is partial so the nulls do not collide.';

/* One sign-in per person per store-day. Partial, so only the kind that sets a
   key is constrained by it. */
create unique index if not exists app_event_dedup_idx
  on public.app_event (dedup_key)
  where dedup_key is not null;

/* The Rollcall screen and the cron: everything at one rooftop, newest first. */
create index if not exists app_event_rooftop_at_idx
  on public.app_event (rooftop_id, at desc);

/* One advisor's row on that screen: their count and last date, per kind. */
create index if not exists app_event_user_kind_at_idx
  on public.app_event (user_id, kind, at desc);

alter table public.app_event enable row level security;
alter table public.app_event force row level security;

/* PostgREST exposes what the roles are granted. Strip everything, then grant
   back ONLY select — which the read policy below then gates row by row. There
   is deliberately no insert grant for anon or authenticated: the service role
   is the only writer. */
revoke all on public.app_event from anon, authenticated;
grant select on public.app_event to authenticated;
/* Explicit rather than relying on Supabase's default privileges, so a restore
   taken with --no-privileges (which is how prod content is validated locally)
   cannot leave the one writer unable to write. */
grant select, insert on public.app_event to service_role;

/*
 * The platform owner, and anybody managing the rooftop the row belongs to.
 *
 * managed_rooftops() is CALLED, not restated. It unions manager and admin
 * memberships with the group_owner/group_manager org roles, and a policy that
 * wrote out the membership check instead would silently exclude every group
 * role — which is the shape of every gate this codebase has got wrong: correct
 * about who it excluded and wrong about who it therefore served.
 *
 * NAMING THE ROLES THAT WILL REALLY CALL IT:
 *   platform owner   is_platform_owner() -> every row
 *   admin            managed_rooftops()  -> their rooftops
 *   manager          managed_rooftops()  -> their rooftop
 *   group owner      managed_rooftops()  -> the group's rooftops
 *   advisor          neither -> zero rows, including their own. Intended.
 *   technician       neither -> zero rows. Intended.
 *   service_role     BYPASSRLS, so this policy never applies to the writer or
 *                    to the cron that reads the rooftop back out. That is the
 *                    service-role-benchmark lesson taken in advance: the gate
 *                    is written for session roles and the backend is not one.
 */
drop policy if exists app_event_team_read on public.app_event;
create policy app_event_team_read on public.app_event
  for select to authenticated
  using (
    is_platform_owner()
    or rooftop_id in (select managed_rooftops())
  );

/* ---- The aggregate the Rollcall screen and the cron both read -------------

   ONE DEFINITION, GROUPED IN POSTGRES. The screen needs a count, a first date
   and a last date per person per kind, and so does the Slack post. Two
   hand-rolled JS reductions over the same rows would be two answers to one
   question, and /admin/engagement already learned that lesson the other way
   round (0035 groups 42 courses' progress in Postgres rather than making 42
   round trips).

   security_invoker = on, DELIBERATELY AND THIS IS THE IMPORTANT LINE. A view
   defaults to running with its OWNER's privileges, and the owner is the
   migration role, which is exempt from app_event's policy. Left at the default
   this view would hand every row to any authenticated caller and the RLS above
   would be decoration — a gate lost in the one place nobody looks for it.
   With invoker on, an advisor reads zero rows THROUGH THE VIEW as well, which
   is what accept:rollcall asserts rather than assumes.

   platform and source are both lifted out of meta and grouped on. Only one of
   them is ever non-null for a given kind — platform for signed_in, source for
   lesson_completed — so this does not multiply the rows; it just means the
   caller never parses jsonb to find out which surface finished a lesson. */
create or replace view public.app_event_rollcall
with (security_invoker = on) as
select
  e.user_id,
  e.rooftop_id,
  e.kind,
  e.meta ->> 'platform' as platform,
  e.meta ->> 'source'   as source,
  count(*)::int         as events,
  min(e.at)             as first_at,
  max(e.at)             as last_at,
  /* The tracks and modules behind the count. array_remove strips the null
     that array_agg(distinct) keeps for kinds with no target. A target that no
     longer resolves to a row still COUNTS — see the header. */
  array_remove(array_agg(distinct e.target_id), null) as target_ids
from public.app_event e
group by e.user_id, e.rooftop_id, e.kind, e.meta ->> 'platform', e.meta ->> 'source';

comment on view public.app_event_rollcall is
  'app_event per (user, rooftop, kind, platform, source): count, first and '
  'last, and the distinct targets. The one aggregate behind both the Rollcall '
  'screen and the Slack cron. security_invoker = on so app_event''s policy '
  'decides who reads it - an advisor reads zero rows here too. 0163.';

grant select on public.app_event_rollcall to authenticated;
grant select on public.app_event_rollcall to service_role;

/* ---- Proof, at apply time -------------------------------------------------
   Both halves, because a refusal is not self-verifying: the grants prove the
   refusal (nobody may insert over the API) and the policy's existence proves
   the acceptance is at least possible. The acceptance that actually matters —
   an admin reading rows and an advisor reading none, over PostgREST, as those
   roles — is npm run accept:rollcall, which cannot pass against an empty
   table because it asserts the positive half first. */
do $$
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'app_event') then
    raise exception '0163: app_event missing';
  end if;

  if not (select relrowsecurity and relforcerowsecurity
            from pg_class where oid = 'public.app_event'::regclass) then
    raise exception '0163: app_event RLS not enabled and forced';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'app_event'
       and policyname = 'app_event_team_read'
  ) then
    raise exception '0163: app_event_team_read policy missing';
  end if;

  /* The write refusal. If either of these ever becomes true, a user can
     manufacture a record of their own attendance. */
  if has_table_privilege('authenticated', 'public.app_event', 'insert') then
    raise exception '0163: authenticated can insert into app_event — the only writer must be the service role';
  end if;
  if has_table_privilege('anon', 'public.app_event', 'select') then
    raise exception '0163: anon can select app_event';
  end if;

  /* The read must be possible at all, or the policy above is decoration. */
  if not has_table_privilege('authenticated', 'public.app_event', 'select') then
    raise exception '0163: authenticated has no select grant — the team read policy can never fire';
  end if;
  if not has_table_privilege('service_role', 'public.app_event', 'insert') then
    raise exception '0163: service_role cannot insert — nothing can write an event';
  end if;

  /* The view must exist AND must be invoker, because a definer view over an
     RLS'd table is how the gate above would silently stop applying. */
  if not exists (
    select 1 from pg_views where schemaname = 'public' and viewname = 'app_event_rollcall'
  ) then
    raise exception '0163: app_event_rollcall view missing';
  end if;
  if not exists (
    select 1 from pg_class
     where oid = 'public.app_event_rollcall'::regclass
       and reloptions @> array['security_invoker=on']
  ) then
    raise exception '0163: app_event_rollcall is not security_invoker — it would bypass app_event''s policy';
  end if;

  /* The kind constraint has to refuse an unfamiliar kind, or it is the
     free-text column it was written to replace. Proven, not assumed. */
  begin
    insert into public.app_event (user_id, rooftop_id, kind)
    select u.id, m.rooftop_id, 'definitely_not_a_kind'
      from public.membership m join public.app_user u on u.id = m.user_id
     limit 1;
    /* Only reachable if a membership existed AND the constraint let it
       through. With no memberships the insert selects zero rows and we
       cannot conclude anything — so say which case we are in rather than
       claiming a pass. */
    if found then
      raise exception '0163: app_event accepted an unknown kind — the check constraint is not doing anything';
    end if;
    raise notice '0163: no membership to test the kind constraint with; constraint present but UNEXERCISED here (accept:rollcall exercises it)';
  exception
    when check_violation then
      raise notice '0163: unknown kind refused by app_event_kind_known';
  end;

  raise notice '0163: app_event in place — team read, no API writer, kind constrained';
end
$$;

notify pgrst, 'reload schema';
