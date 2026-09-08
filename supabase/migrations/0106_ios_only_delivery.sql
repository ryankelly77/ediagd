-- ============================================================================
-- EDIAGD — 0106 Only send iOS tokens to Apple
--
-- ---------------------------------------------------------------------------
-- WHAT HAPPENED
-- ---------------------------------------------------------------------------
-- The first real send attempt came back `400 BadDeviceToken`, and the token it
-- was sent to was an ANDROID one: a 142-character FCM registration token,
-- registered in August, sitting in device_push_token with platform = 'android'.
-- APNs was right to refuse it.
--
-- The defect is that it was ever offered. push_outbox_due joined every live
-- token for a recipient with no regard for what platform it belonged to, and
-- the delivery worker speaks APNs and only APNs. v1 is iOS-only by ruling, so
-- the transport had exactly one kind of address it could use and the query
-- handed it every kind we had.
--
-- Left alone this is not merely a wasted request. Every send would have logged
-- a failure against that device forever, and the retire-on-invalid rule would
-- have retired an Android token for failing at a service it was never meant to
-- reach — quietly deleting somebody's future Android registration as a side
-- effect of it not being an iPhone.
--
-- ---------------------------------------------------------------------------
-- THE PLATFORM COLUMN IS NOT DECORATION
-- ---------------------------------------------------------------------------
-- push_platform has always had both values because the schema was written for a
-- world with an Android app in it. That world is a ruling away, and when it
-- arrives the fix is a second transport plus a second branch here — not the
-- removal of this filter. The filter is what makes "which transport" an
-- explicit decision rather than an accident of what happened to be on file.
-- ============================================================================

drop view if exists push_outbox_due;
create view push_outbox_due as
select
  o.id, o.recipient_id, o.rooftop_id, o.kind, o.channel,
  o.title, o.body, o.deep_link, o.scheduled_for, o.local_date, o.rationale,
  t.id as token_id, t.token, t.platform
from notification_outbox o
join device_push_token t
  on t.user_id = o.recipient_id
 and t.retired_at is null
 /* APNs is the only transport that exists. An Android token here is not a
    delivery, it is a guaranteed rejection logged against a real device. */
 and t.platform = 'ios'
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
 * The Android token that surfaced this.
 *
 * Retired rather than deleted, with a reason that says what it is rather than
 * that it failed: it did not fail, it was asked the wrong question. If an
 * Android app ships, that row is the record that this handset was registered
 * once, and re-registration un-retires it.
 */
update device_push_token
   set retired_at = now(),
       retired_reason = 'android: no transport in v1'
 where platform = 'android'
   and retired_at is null;

notify pgrst, 'reload schema';
