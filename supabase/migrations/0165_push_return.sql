/* ===========================================================================
   0165 — DID THE PUSH BRING THEM BACK?

   Ryan, 14 October: "I need to make sure the push notifications are going out
   and if it is working to get users back in. So like advisor lapsed 3 days,
   notification went out, and 1 hr later he logged back in."

   Three records already existed and nothing joined them. `notification_outbox`
   (0056) holds the DECISION. `push_delivery` (0102) holds APPLE'S ANSWER, per
   device. `app_event` (0163), `daily_activity` (0009) and `daily_completion`
   (0011) hold the turning up. This migration is the join, and the whole of the
   difficulty is in deciding what each of those words is allowed to mean.

   ---------------------------------------------------------------------------
   NOTHING HERE CHANGES WHAT IS SENT
   ---------------------------------------------------------------------------
   No new kind, no copy, no cadence, no policy row, no change to
   generate_push_outbox or to push_outbox_due. This migration adds one function
   and one view, and widens one read policy. If it were reverted, every
   notification the app sends would be byte-identical.

   ---------------------------------------------------------------------------
   "SENT" IS THREE DIFFERENT FACTS AND THEY DO NOT ADD UP
   ---------------------------------------------------------------------------
     queued      a notification_outbox row — a decision. It costs the advisor
                 their one slot for the day whether or not anything leaves.
     attempted   a push_delivery row — we spoke to Apple about one token.
     delivered   push_delivery.ok — APPLE ACCEPTED IT. Not "the phone showed
                 it"; APNs does not tell us that and nothing here claims it.

   A report that added them would answer Ryan's question wrongly in the
   optimistic direction, which is the direction a false pass always takes. So
   they are separate columns and the view is ONE ROW PER push_delivery ROW —
   per DEVICE, not per message. A person carrying two handsets is two rows and
   one notification, which is why `outbox_id` is on the row: a caller counting
   messages counts distinct outbox_id, and a caller counting deliveries counts
   rows. Both are available and neither is the default, because collapsing to
   one grain here is what would make the two uncountable.

   ---------------------------------------------------------------------------
   THE GAP IS MEASURED FROM push_delivery.at, AND THAT IS NOT ARBITRARY
   ---------------------------------------------------------------------------
   There are four instants to choose from: scheduled_for (when we meant to),
   notification_outbox.sent_at (when the row was marked), push_delivery.at
   (when Apple accepted it) and the phone's own display time (which we never
   learn). Only the third is an observation of the thing whose effect is being
   measured. The first two are the sender talking about itself.

   All three readable ones are on the row anyway, so a reader can see that they
   agree — and on this deployment they agree to within a second, because the
   cron delivers in the same invocation that marks the row.

   ---------------------------------------------------------------------------
   AND IT IS NOT MEASURED FROM opened_at, WHICH WOULD HAVE BEEN THE OBVIOUS
   CHOICE AND WOULD HAVE REPORTED THAT NOBODY EVER COMES BACK
   ---------------------------------------------------------------------------
   notification_outbox.opened_at exists for exactly this purpose and is NULL on
   every send this database has ever made. The reason, found while auditing for
   this migration: app/(app)/today/page.tsx stamps the open from a fixed map of
   two entries, `streak_saver` and `streak_last_call`. 0152 added
   /today?opened_via=return and ?opened_via=start and the map was never
   widened, so a return tap looks itself up, misses, and SILENTLY STAMPS
   NOTHING — a fixed list that says nothing when it meets something it does not
   mention, for the fourth time in this codebase.

   A view keyed on opened_at would therefore have reported a 0% return rate
   with total confidence, and the number would have been read as evidence about
   advisors rather than about a lookup table. The three activity records are
   used instead because they are written by paths that cannot decline: a page
   render writes daily_activity, a completion writes daily_completion.

   (The map is fixed in this PR, derived from PUSH_COPY's own deep links so a
   kind that gains a link is stamped without anybody remembering. That is a
   change to ATTRIBUTION, not to sending.)

   ---------------------------------------------------------------------------
   "CAME BACK" IS THREE RECORDS, THE EARLIEST WINS, AND ONE CAVEAT IS LOUD
   ---------------------------------------------------------------------------
     app_event signed_in   the session and its platform. DEDUPED PER STORE-DAY
                           by 0163, on purpose — so somebody who had already
                           opened the app that morning writes no second row,
                           and a return measured from this ALONE would miss
                           them entirely.
     daily_activity        created_at, written by markActiveToday as a page
                           renders. One row per user per date; same caveat.
     daily_completion      created_at. They did the work, not just turned up.

   Because all three are per-day records, a null return means "no FIRST touch
   of a store-day after the delivery", NOT "never opened the app". The column
   comment says so, and so does every surface that renders it. This is the
   honest reading and it is also the conservative one: the view under-reports
   returns and never over-reports them.

   ---------------------------------------------------------------------------
   THE SEVEN-DAY WINDOW, AND WHY RETURNED IS 24 HOURS INSIDE IT
   ---------------------------------------------------------------------------
   Ryan's question is "an hour later". Returned is therefore 24 hours — long
   enough to cover an advisor who reads the 07:00 push at lunch, short enough
   that the push is still a plausible cause. The GAP IS KEPT rather than
   reduced to the flag, because the one-hour cases are the ones he asked about
   and a boolean throws exactly them away: a statistic is a choice about what
   to discard.

   The search itself runs to seven days so that a late return is visible as a
   late return rather than as an absence. Beyond seven days both are null —
   attributing a sign-in nine days after a push to that push would be a
   coincidence wearing a finding's clothes.

   ---------------------------------------------------------------------------
   WHO MAY READ IT, AND THE SUB-PATTERN THIS NEARLY REPEATED
   ---------------------------------------------------------------------------
   push_delivery's only read policy is `using (is_platform_owner())`. The view
   below exists FOR THE TEAM — it is the thing a manager reads to find out
   whether their store is being reached — so a security_invoker view over that
   table would have handed every manager and group owner ZERO ROWS and no
   error. That is this file's named sub-pattern exactly: a gate keyed on a role
   that excludes the viewer it exists to serve. has_performance_surface,
   op_code_family, dms_advisor_read, and this would have been the fourth.

   So push_delivery gains a team read policy, keyed on the ROOFTOP OF THE
   OUTBOX ROW via managed_rooftops() — CALLED, not restated, so the group_owner
   and group_manager org roles come along rather than being silently dropped
   (0115).

   NAMING EVERY ROLE THAT WILL REALLY CALL IT:
     platform owner   is_platform_owner()        -> every delivery
     admin            managed_rooftops()         -> their rooftops'
     manager          managed_rooftops()         -> their rooftop's
     group owner      managed_rooftops()         -> the group's
     group manager    managed_rooftops()         -> the group's
     advisor          neither -> ZERO, including their own deliveries. Intended,
                      and it is what makes the view advisor-blind: with no
                      push_delivery row visible there is no view row to build,
                      whatever the other tables allow. The refusal is
                      structural rather than a condition anybody maintains.
     technician       neither -> zero.
     service_role     BYPASSRLS, so neither policy applies to the cron that
                      writes deliveries or to the Slack job that reads them.
                      The service-role lesson taken in advance: this gate is
                      written for session roles and the backend is not one.
   =========================================================================== */

/* ---- 1. The return side, computed ONCE for every role ---------------------

   WHY A FUNCTION AND NOT THREE JOINS IN THE VIEW.

   A security_invoker view's joins are filtered by each table's own policy, and
   the three activity tables do NOT agree about who may read them:

     app_event       is_platform_owner() or managed_rooftops()     -> group ok
     daily_activity  is_platform_owner() or own or managed_rooftops() -> group ok
     daily_completion  own or has_role(rooftop,'manager'/'admin')  -> GROUP ROLES
                       EXCLUDED, because 0011 spelled the membership check out
                       instead of calling the helper.

   Joined raw, the view would therefore give a group_owner a DIFFERENT ANSWER
   from an admin about the same delivery — "no return yet" where a completion
   exists — and the difference would be invisible, because a missing row and a
   row that was never written look identical. A label whose value depends on
   who is reading it is the worst shape this codebase has.

   So the first-touch is computed by a definer function, which makes the answer
   a property of the data rather than of the reader. The AUTHORISATION is still
   decided exactly once, by push_delivery's policy above: you have to be able
   to see the delivery before there is a row to attach a return to.

   THE FUNCTION GATES ITSELF ANYWAY, because a definer function granted to
   `authenticated` is a read path around RLS and must not be one. managed_users()
   is the same team, keyed through the same helper — so an advisor calling this
   directly for a colleague, or for themselves, gets nothing.

   *** AND THE GATE HAS AN EXPLICIT service_role BRANCH, WHICH I LEFT OUT OF THE
   FIRST VERSION OF THIS FILE AND THE ACCEPTANCE SUITE CAUGHT. ***

   managed_users() keys on auth.uid(). The service role has none, and
   is_platform_owner() is false for it, so the first version of this function
   returned ZERO ROWS for every service-role call — and a SECURITY DEFINER
   function gets no help whatever from BYPASSRLS, because it is the WHERE clause
   doing the excluding and not a policy.

   What that would have shipped: `push_return` read by the 17:30 Slack cron
   would have had returned_at NULL on every row, so the post would have said
   "0 back within 24 h" EVERY EVENING, FOREVER, with a 200 and no error — while
   the same view read by an admin on the screen showed the real returns. Two
   answers to one question, the wrong one going to the channel nobody
   cross-checks.

   This is has_performance_surface() exactly, and I wrote the warning about it
   forty lines below before making the mistake forty lines above. The lesson is
   not "remember the service role"; it is that the only thing which actually
   caught it was a test that exercised the path AS the role that really calls.

   RECORDED RATHER THAN FIXED HERE: completion_team_read excludes the org roles,
   which is a defect wider than this migration — it affects every reader of
   daily_completion, not just this view. The question is "which policies spell
   out the membership check instead of calling managed_rooftops()", and it
   wants its own sweep. Noted in the report so it is not an unasked question. */

create or replace function public.first_return_after(
  _user   uuid,
  _after  timestamptz,
  _window interval default interval '7 days'
)
returns table (at timestamptz, source text)
language sql
stable
security definer
set search_path = public
as $$
  select t.at, t.source
    from (
      /* The session itself. Deduped per store-day by 0163 — see the header. */
      select e.at, 'signed_in'::text as source
        from app_event e
       where e.user_id = _user
         and e.kind = 'signed_in'
         and e.at > _after
         and e.at <= _after + _window
      union all
      /* Turning up. created_at is the row's WRITE time, which for this fact is
         the moment the page rendered — not the activity_date it records. */
      select a.created_at, 'daily_activity'
        from daily_activity a
       where a.user_id = _user
         and a.created_at > _after
         and a.created_at <= _after + _window
      union all
      /* Doing the work. The strongest of the three. */
      select c.created_at, 'daily_completion'
        from daily_completion c
       where c.user_id = _user
         and c.created_at > _after
         and c.created_at <= _after + _window
    ) t
   where _after is not null
     /* The gate. Three branches, and every role is named in the header:
          platform owner   is_platform_owner()
          service_role     the JWT claim — THE BRANCH THAT WAS MISSING. A
                           definer function is gated by this clause, not by a
                           policy, so BYPASSRLS buys it nothing and without
                           this line the Slack post reports zero returns every
                           evening with no error.
          team             managed_users(), CALLED not restated, so the
                           group_owner / group_manager org roles come along.
          advisor          none of the three -> zero rows, for a colleague and
                           for themselves. Intended.
        auth.uid() IS NOT a fourth branch. generate_push_outbox treats a null
        uid as pg_cron and allows it; that is right for a job invoked with no
        connection at all, and wrong here, where a null uid is also what an
        unauthenticated PostgREST caller presents. */
     and (
       is_platform_owner()
       or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
          = 'service_role'
       or _user in (select managed_users())
     )
   order by t.at
   limit 1
$$;

comment on function public.first_return_after(uuid, timestamptz, interval) is
  'The earliest signed_in / daily_activity / daily_completion strictly after '
  '_after and within _window, with which of the three it was. SECURITY DEFINER '
  'so every role entitled to the row gets the SAME answer - the three source '
  'tables disagree about who may read them, and a view joining them raw would '
  'tell a group owner "no return" where an admin sees one. Gated on '
  'is_platform_owner() OR the service_role JWT claim OR managed_users(), so it '
  'is not a read path around RLS - and the service_role branch is NOT optional: '
  'a definer function gets nothing from BYPASSRLS, and without it the Slack '
  'cron reports zero returns every evening. All three are per-day '
  'records, so a null is "no first touch of a store-day after _after", never '
  '"never opened the app". 0165.';

revoke all on function public.first_return_after(uuid, timestamptz, interval)
  from public, anon;
grant execute on function public.first_return_after(uuid, timestamptz, interval)
  to authenticated, service_role;

/* ---- 2. The team may read their own store's deliveries -------------------

   Added, not replaced: push_delivery_admin_read (0102) stays exactly as it is,
   so the platform owner's access does not depend on this new predicate being
   right. Two permissive policies OR together, which is what is wanted.

   Keyed through notification_outbox because push_delivery has no rooftop_id of
   its own — and that is the correct key rather than a convenience: the rooftop
   a delivery belongs to IS the rooftop of the message it delivered, and
   denormalising it onto the delivery row would create a second definition of
   the same fact that could disagree after a membership move. */

drop policy if exists push_delivery_team_read on public.push_delivery;
create policy push_delivery_team_read on public.push_delivery
  for select to authenticated
  using (
    exists (
      select 1
        from public.notification_outbox o
       where o.id = push_delivery.outbox_id
         and o.rooftop_id in (select managed_rooftops())
    )
  );

/* The policy can only fire if the grant exists. 0102 granted select to
   authenticated already; restated because a restore taken --no-privileges is
   how prod is validated locally, and a silently ungranted table makes the
   policy above decoration. */
grant select on public.push_delivery to authenticated;

/* ---- 3. The view ---------------------------------------------------------

   security_invoker = on, DELIBERATELY. A view defaults to its OWNER's
   privileges, and the owner is the migration role, which is exempt from every
   policy above — left at the default this would hand every delivery at every
   rooftop to any authenticated caller, and the two policies would be
   decoration. 0163 says this in the same words about app_event_rollcall, and
   it is the one line in this file that must not be edited without proving the
   refusal again. */

drop view if exists public.push_return;
create view public.push_return
with (security_invoker = on) as
select
  d.id                              as delivery_id,
  /* So a caller can count MESSAGES (distinct outbox_id) as well as DELIVERIES
     (rows). Neither is the default; see the header. */
  o.id                              as outbox_id,
  o.recipient_id                    as user_id,
  o.rooftop_id,
  o.kind,
  /* The store-date the send belongs to — what a period filter should use, so a
     07:00 Honolulu send is not counted against the previous UTC day. */
  o.local_date                      as store_date,

  /* The four instants, so a reader can see they agree rather than taking one
     on trust. attempted_at is the one the gap is measured from. */
  o.scheduled_for                   as queued_for,
  o.sent_at,
  d.at                              as attempted_at,

  d.ok                              as delivered_ok,
  d.apns_status,
  d.apns_reason,
  d.token_tail,

  r.at                              as returned_at,
  r.source                          as return_source,
  /* Whole minutes. Rounded rather than truncated so a 59.6-minute return is 60
     and not 59 — the one-hour band is the one Ryan asked about and it should
     not be decided by a floor. */
  case when r.at is not null
       then round(extract(epoch from (r.at - d.at)) / 60.0)::int
  end                               as return_gap_minutes,
  /*
   * RETURNED IS 24 HOURS, AND IT IS FALSE FOR A FAILED DELIVERY RATHER THAN
   * NULL — because a push Apple refused did not fail to bring somebody back;
   * it was never sent. The lateral below is only entered for d.ok, so
   * returned_at is null there by construction and this reads false, which is
   * the arithmetic saying the same thing.
   */
  (r.at is not null and r.at <= d.at + interval '24 hours') as returned
from public.push_delivery d
join public.notification_outbox o on o.id = d.outbox_id
/*
 * ONLY FOR AN ACCEPTED DELIVERY. A failed one has nothing to attribute, and
 * computing a "return" after a BadDeviceToken would manufacture the most
 * flattering number in the whole feature: a push that never left, credited
 * with a sign-in that was going to happen anyway.
 */
left join lateral public.first_return_after(o.recipient_id, d.at) r
       on d.ok;
/* `on d.ok` rather than a WHERE, so a FAILED delivery still gets a row — with
   nulls in the return columns. Dropping it would make the view's row count
   "pushes Apple accepted", and then "sent but not delivered" would be
   invisible in the one place somebody goes to ask why nobody came back. The
   function also refuses a null _after, so a direct caller cannot get a return
   out of a delivery that never happened either. */

comment on view public.push_return is
  'One row per push_delivery row - per DEVICE, not per message; count distinct '
  'outbox_id for messages. Carries the four instants, Apple''s answer, and the '
  'first signed_in / daily_activity / daily_completion within seven days of an '
  'ACCEPTED delivery with the gap in minutes. returned = that gap is <= 24 h; '
  'the gap is kept because the one-hour cases are the question. NOT built on '
  'notification_outbox.opened_at, which is null on every send ever made because '
  'the opened_via map omits return and start. security_invoker = on, so '
  'push_delivery''s policies decide who reads it: the team via '
  'managed_rooftops(), and an advisor reads nothing. 0165.';

/*
 * REVOKE FIRST, THEN GRANT BACK WHAT IS WANTED.
 *
 * ---------------------------------------------------------------------------
 * THIS LINE EXISTS BECAUSE THE CHECK AT THE BOTTOM OF THIS FILE CAUGHT IT
 * ---------------------------------------------------------------------------
 * The first version of 0165 had no revoke, and the apply-time refusal stopped
 * the migration with "anon can select push_return". Supabase ships DEFAULT
 * PRIVILEGES that grant select on new objects in `public` to anon and
 * authenticated — so a view is PUBLICLY READABLE the moment it is created, and
 * nothing in the create statement says so.
 *
 * Being invoker meant the leak would have returned zero rows in practice
 * (anon has no auth.uid(), so managed_rooftops() is empty) — which is exactly
 * why it would have survived: the hole was real, the symptom was nothing, and
 * the next policy edit on push_delivery could have opened it for good.
 *
 * 0163 wrote the same three lines about app_event and said why: "PostgREST
 * exposes what the roles are granted." It is a property of the database, not
 * of this view, and every new relation needs it.
 */
revoke all on public.push_return from anon, authenticated;
grant select on public.push_return to authenticated;
grant select on public.push_return to service_role;

/* ---- 4. CAN WE REACH THEM AT ALL — and why this is a second view ---------

   The Rollcall needs a "Reachable" column, and it CANNOT be built from
   push_return: an advisor with a token who has never been sent anything has no
   delivery row, and would read "no" when the truth is "yes, and nothing has
   been due". The fact needed is the existence of a live token, which lives only
   in device_push_token.

   AND device_push_token's ONLY read policy is OWN-READ (0056):

     device_push_token_own_read   using (user_id = auth.uid())

   So the screen at /admin/engagement, read through an admin's own client,
   would have found ZERO token rows and rendered "Reachable: no" for all nine
   Beaumont advisors — the named sub-pattern for the fifth time, and the worst
   possible instance of it, because "no" is a plausible answer that a reader has
   no reason to question. The Part 1 audit found exactly that answer legitimately
   and it would have been indistinguishable.

   ---------------------------------------------------------------------------
   THIS ONE IS DELIBERATELY A DEFINER VIEW, AND HERE IS THE ARGUMENT
   ---------------------------------------------------------------------------
   The obvious fix — a team read policy on device_push_token — would let a
   manager select `device_push_token.token`, because a row policy grants the
   whole row and the grant is table-wide. 0102 keeps only the last six
   characters of a token in push_delivery, with the comment "not enough to be a
   credential sitting in a log", so this codebase already treats the full token
   as something to keep narrow. Widening it to every manager to light up one
   column on one screen is the wrong trade.

   So instead: a view that DOES NOT SELECT THE TOKEN AT ALL, with the gate
   written into its body. The unsafe state is not avoided, it is
   UNREPRESENTABLE — there is no `token` column for any caller to ask for, the
   way lib/mileage.ts cannot render a completion tick because the data does not
   arrive. device_push_token's own-read policy is left exactly as 0056 wrote it.

   `security_invoker = off` is stated rather than left to the default, because
   an implicit definer view is how a gate gets silently lost and a reader must
   be able to see that this one is intentional.

   NAMING EVERY ROLE, AND THE THIRD BRANCH IS THE ONE THAT MATTERS:
     platform owner   is_platform_owner()  -> every advisor
     admin/manager    managed_users()      -> their rooftops' people
     group owner/mgr  managed_users()      -> the group's people, because
                      managed_users calls managed_rooftops which unions them
     advisor          none of the three -> ZERO, including their own. They read
                      their own token through the TABLE, which still works.
     technician       zero.
     service_role     *** THE EXPLICIT THIRD BRANCH. *** A definer view runs as
                      its owner, so BYPASSRLS buys the service role NOTHING
                      here — the WHERE clause is the gate and auth.uid() is
                      null for it, which makes managed_users() empty and
                      is_platform_owner() false. Without this branch the
                      17:30 Slack post would have reported every advisor
                      unreachable, with a 200 and no error. That is
                      has_performance_surface() exactly: a gate keyed on
                      auth.uid() that excluded the backend it was meant to
                      serve. */

drop view if exists public.advisor_reachable;
create view public.advisor_reachable
with (security_invoker = off) as
select
  t.user_id,
  /* Reachable means AT LEAST ONE live token. A person with a retired handset
     and a current one is reachable, and bool_or says so without the caller
     having to know how many rows there were. */
  bool_or(t.retired_at is null)                                as reachable,
  /* The platforms that can actually be reached right now — not every platform
     ever seen, because a retired Android token is not a way to reach anybody
     and listing it would be a label with nothing behind it. */
  array_remove(array_agg(distinct t.platform)
    filter (where t.retired_at is null), null)                 as live_platforms,
  min(t.created_at) filter (where t.retired_at is null)        as first_registered_at,
  max(t.last_seen)  filter (where t.retired_at is null)        as last_seen_at,
  count(*) filter (where t.retired_at is not null)::int        as retired_tokens,
  /* Why the last one was retired, for the case where the answer is "they had a
     token and Apple rejected it" — which reads identically to "never had one"
     on a screen that only shows a boolean. */
  (array_agg(t.retired_reason order by t.retired_at desc nulls last)
     filter (where t.retired_at is not null))[1]               as last_retired_reason
from public.device_push_token t
where is_platform_owner()
   or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
      = 'service_role'
   or t.user_id in (select managed_users())
group by t.user_id;

comment on view public.advisor_reachable is
  'Whether a person can be sent a push at all, per user: a live token exists, '
  'which live platforms, when registered, and why the last retired one was '
  'retired. DELIBERATELY security_invoker = off - the gate is the WHERE clause '
  'and the token column is ABSENT, so no caller can ask for the credential. '
  'device_push_token''s own-read policy (0056) is unchanged; a team read policy '
  'on the table would have exposed the token itself. The service_role branch is '
  'explicit because a definer view gets no help from BYPASSRLS and the Slack '
  'cron has no session - without it every advisor would read unreachable. 0165.';

revoke all on public.advisor_reachable from anon, authenticated;
grant select on public.advisor_reachable to authenticated;
grant select on public.advisor_reachable to service_role;

/* ---- 5. Proof, at apply time ---------------------------------------------

   BOTH HALVES. A refusal is not self-verifying, and the acceptance half is the
   one that gets skipped — db:migrate refused its own good production dump and
   named ten present tables as missing, and it survived review because being
   wrong in the cautious direction wears the costume of care.

   What can honestly be proven here is STRUCTURE: the objects exist, the view
   is invoker and not definer, the grants are right in both directions, and the
   arithmetic produces the numbers it claims to. What CANNOT be proven here is
   the thing that matters most — that an admin reads rows and an advisor reads
   none THROUGH PostgREST AS THOSE ROLES. The migration runs as the owner, who
   is exempt from every policy it just wrote, so asserting RLS from inside it
   would be testing the gate in the one context where it cannot fail.

   That is `npm run accept:push-return`, which signs five real users in over
   PostgREST and asserts the positive half first so it cannot pass against an
   empty table. */

do $$
declare
  _gap int;
  _ret boolean;
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'first_return_after'
  ) then
    raise exception '0165: first_return_after missing';
  end if;

  if not exists (
    select 1 from pg_views where schemaname = 'public' and viewname = 'push_return'
  ) then
    raise exception '0165: push_return view missing';
  end if;

  /* The one line that must not silently change. A definer view here would make
     both policies decoration, and nothing on any screen would look different. */
  if not exists (
    select 1 from pg_class
     where oid = 'public.push_return'::regclass
       and reloptions @> array['security_invoker=on']
  ) then
    raise exception
      '0165: push_return is not security_invoker — it would hand every rooftop''s deliveries to any authenticated caller';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'push_delivery'
       and policyname = 'push_delivery_team_read'
  ) then
    raise exception '0165: push_delivery_team_read missing — every manager would read zero rows';
  end if;

  /* 0102's policy must still be there. The team policy is ADDITIVE and the
     platform owner must not depend on it. */
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'push_delivery'
       and policyname = 'push_delivery_admin_read'
  ) then
    raise exception '0165: push_delivery_admin_read was removed — 0102''s owner read must survive';
  end if;

  if not exists (
    select 1 from pg_views where schemaname = 'public' and viewname = 'advisor_reachable'
  ) then
    raise exception '0165: advisor_reachable view missing — the Reachable column has nothing behind it';
  end if;

  /*
   * THE OPPOSITE ASSERTION FROM push_return'S, AND BOTH ARE DELIBERATE.
   *
   * push_return MUST be invoker. advisor_reachable MUST NOT be, because its
   * gate is its WHERE clause and an invoker view over an own-read table would
   * show a manager nothing. Asserting it in both directions is what stops a
   * later "tidy-up" from making them consistent with each other and wrong.
   */
  if exists (
    select 1 from pg_class
     where oid = 'public.advisor_reachable'::regclass
       and reloptions @> array['security_invoker=on']
  ) then
    raise exception
      '0165: advisor_reachable is security_invoker — device_push_token is own-read, so every manager would read zero and the column would say "no" for everybody';
  end if;

  /* The credential must not be reachable through it. A column that does not
     exist cannot be selected, and this is the assertion that keeps it absent. */
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'advisor_reachable'
       and column_name = 'token'
  ) then
    raise exception '0165: advisor_reachable exposes the token column';
  end if;

  /* 0056's own-read must survive untouched — this migration adds a view beside
     it rather than widening it. */
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'device_push_token'
       and policyname = 'device_push_token_own_read'
  ) then
    raise exception '0165: device_push_token_own_read is gone — the token was not supposed to get wider';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'device_push_token'
       and policyname like '%team%'
  ) then
    raise exception
      '0165: a team policy appeared on device_push_token — that hands managers the raw token, which is what advisor_reachable exists to avoid';
  end if;

  /* ---- The refusal half ---- */
  if has_table_privilege('anon', 'public.push_return', 'select') then
    raise exception '0165: anon can select push_return';
  end if;
  if has_table_privilege('anon', 'public.advisor_reachable', 'select') then
    raise exception '0165: anon can select advisor_reachable';
  end if;
  if has_function_privilege('anon', 'public.first_return_after(uuid, timestamptz, interval)', 'execute') then
    raise exception '0165: anon can execute first_return_after';
  end if;

  /* ---- The acceptance half, which is the one that catches a broken gate ---- */
  if not has_table_privilege('authenticated', 'public.push_return', 'select') then
    raise exception '0165: authenticated has no select grant on push_return — the policies can never fire';
  end if;
  if not has_table_privilege('authenticated', 'public.push_delivery', 'select') then
    raise exception '0165: authenticated has no select grant on push_delivery — push_delivery_team_read is decoration';
  end if;
  if not has_function_privilege('authenticated', 'public.first_return_after(uuid, timestamptz, interval)', 'execute') then
    raise exception '0165: authenticated cannot execute first_return_after — every return column would be null';
  end if;
  if not has_function_privilege('service_role', 'public.first_return_after(uuid, timestamptz, interval)', 'execute') then
    raise exception '0165: service_role cannot execute first_return_after — the Slack cron reads this with no session';
  end if;
  if not has_table_privilege('authenticated', 'public.advisor_reachable', 'select') then
    raise exception '0165: authenticated has no select grant on advisor_reachable';
  end if;
  if not has_table_privilege('service_role', 'public.advisor_reachable', 'select') then
    raise exception '0165: service_role cannot select advisor_reachable — the 17:30 Slack post would call every advisor unreachable';
  end if;
  if not has_table_privilege('service_role', 'public.push_return', 'select') then
    raise exception '0165: service_role cannot select push_return — the Slack pushes line would be silent';
  end if;

  /* ---- The arithmetic, against values rather than against rows -------------
     The gap and the 24-hour flag are the two things a reader will quote, so
     they are exercised on known inputs here rather than assumed from the SQL.
     A 52-minute gap because that is the number in Ryan's question. */
  select round(extract(epoch from (
           timestamptz '2026-10-15 12:52:00+00' - timestamptz '2026-10-15 12:00:00+00'
         )) / 60.0)::int
    into _gap;
  if _gap <> 52 then
    raise exception '0165: gap arithmetic gives % for a 52-minute return', _gap;
  end if;

  /* The boundary, both sides. 1440 minutes is returned; 1441 is not. */
  select (timestamptz '2026-10-16 12:00:00+00'
            <= timestamptz '2026-10-15 12:00:00+00' + interval '24 hours')
    into _ret;
  if not _ret then raise exception '0165: a return at exactly 24 h reads as not returned'; end if;

  select (timestamptz '2026-10-16 12:01:00+00'
            <= timestamptz '2026-10-15 12:00:00+00' + interval '24 hours')
    into _ret;
  if _ret then raise exception '0165: a return at 24 h 1 min reads as returned'; end if;

  raise notice
    '0165: push_return in place — invoker view, team read via managed_rooftops(), advisor blind by construction';
end
$$;

notify pgrst, 'reload schema';
