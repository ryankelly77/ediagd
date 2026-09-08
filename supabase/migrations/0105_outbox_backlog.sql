-- ============================================================================
-- EDIAGD — 0105 Do not deliver a backlog
--
-- ---------------------------------------------------------------------------
-- WHAT WAS FOUND
-- ---------------------------------------------------------------------------
-- 0056 scheduled its generator on pg_cron and shipped no transport, so the
-- outbox has been filling up in production ever since and nothing has ever
-- drained it. There are pending rows going back days: manager_digest, an
-- eddies_pick, a streak_keeper from the 3rd carrying the OLD copy.
--
-- The moment a transport exists, every one of those becomes due. The first
-- cron run after this ships would have delivered a week of notifications in one
-- burst — several of them kinds v1 explicitly does not send, one of them a
-- streak reminder about a day that ended four days ago.
--
-- That is the exact failure the whole feature is written to avoid, and it would
-- have happened on the first run, to real people, on the first day.
--
-- ---------------------------------------------------------------------------
-- TWO FIXES, BECAUSE ONE OF THEM IS NOT ENOUGH
-- ---------------------------------------------------------------------------
-- Clearing the backlog fixes today. Teaching the due view what "due" means
-- fixes it permanently: a row is deliverable only if it is for the store's
-- TODAY and its kind is currently enabled. Without the second, the same thing
-- happens again the first time delivery is interrupted for a day.
-- ============================================================================


-- ---- 1. The backlog is not news --------------------------------------------
/**
 * Skipped, not deleted. These rows are the record of what the generator decided
 * on those days, and that history is worth more than the empty table would be.
 * `skipped` also releases the one-per-day slot, so a person who has a stale row
 * from last Tuesday can still be nudged next Tuesday.
 */
update notification_outbox
   set status = 'skipped',
       skipped_reason = 'v1: queued before a transport existed; never delivered'
 where status = 'pending';


-- ---- 2. "Due" means today, and a kind we actually send ----------------------
/**
 * Two clauses, each closing a different hole.
 *
 * TODAY, at the STORE. A notification is a statement about a day. Delivering
 * one late is not a delayed message, it is a wrong one — "Day 3 is on the line"
 * arriving on Thursday about Monday is worse than silence. rooftop_today() is
 * the same clock the row was scheduled against.
 *
 * ENABLED KINDS ONLY. v1 sends the streak saver and nothing else, and that
 * decision lives in outbox_policy. Reading it here means switching a kind off
 * stops delivery of anything already queued for it, rather than only stopping
 * new rows — which is what somebody flipping that switch in a hurry will mean.
 */
drop view if exists push_outbox_due;
create view push_outbox_due as
select
  o.id, o.recipient_id, o.rooftop_id, o.kind, o.channel,
  o.title, o.body, o.deep_link, o.scheduled_for, o.local_date, o.rationale,
  t.id as token_id, t.token, t.platform
from notification_outbox o
join device_push_token t on t.user_id = o.recipient_id and t.retired_at is null
where o.status = 'pending'
  and o.channel = 'push'
  and o.scheduled_for <= now()
  and o.local_date = rooftop_today(o.rooftop_id)
  and exists (
    select 1 from outbox_policy p where p.kind = o.kind and p.enabled
  )
  and coalesce(
        (select p.push_enabled from user_notification_pref p
          where p.user_id = o.recipient_id), true);

alter view push_outbox_due set (security_invoker = on);
grant select on push_outbox_due to authenticated;

/**
 * A pending row that is no longer deliverable should not sit pending forever.
 *
 * Called by the cron after each delivery pass. Anything still pending whose
 * store day has ended is closed off with a reason, so "pending" continues to
 * mean "we still intend to send this" rather than slowly becoming a graveyard
 * nobody trusts.
 */
create or replace function expire_stale_outbox()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare _n int;
begin
  update notification_outbox o
     set status = 'skipped',
         skipped_reason = 'store day ended before delivery'
   where o.status = 'pending'
     and o.local_date < rooftop_today(o.rooftop_id);
  get diagnostics _n = row_count;
  return _n;
end $$;

revoke all on function expire_stale_outbox() from public, anon, authenticated;

notify pgrst, 'reload schema';
