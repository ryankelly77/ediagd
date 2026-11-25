-- ============================================================================
-- EDIAGD — 0184 Android has a transport, so the view may offer Android tokens
--
-- ---------------------------------------------------------------------------
-- 0106 ASKED FOR EXACTLY THIS CHANGE AND NOTHING MORE
-- ---------------------------------------------------------------------------
-- 0106 narrowed push_outbox_due to `and t.platform = 'ios'` after the first
-- real send was handed an Android token and earned a guaranteed
-- BadDeviceToken. Its closing note:
--
--   "push_platform has always had both values because the schema was written
--    for a world with an Android app in it. That world is a ruling away, and
--    when it arrives the fix is a second transport plus a second branch here —
--    not the removal of this filter. The filter is what makes 'which
--    transport' an explicit decision rather than an accident of what happened
--    to be on file."
--
-- EDIAGD 1.0.0 (versionCode 3) is approved on Google Play and
-- lib/notifications/fcm.ts is the second transport. So the predicate widens.
--
-- THE FILTER IS KEPT RATHER THAN DROPPED, exactly as 0106 asked. `in
-- ('ios','android')` is not the same statement as no predicate at all: it says
-- these two platforms have a sender, and it means a THIRD value added to the
-- push_platform enum arrives at a view that declines to offer it until
-- somebody widens this line on purpose. A removed filter would offer it
-- silently, and the server would send it to whichever provider it guessed.
--
-- ---------------------------------------------------------------------------
-- ORDER OF OPERATIONS, AND IT IS NOT THE USUAL ONE
-- ---------------------------------------------------------------------------
-- THIS MIGRATION IS APPLIED AFTER THE CODE DEPLOYS, NOT BEFORE.
--
-- Vercel builds on a merge to main, so a merge is a deploy. The new delivery
-- worker routes per platform and refuses a platform it has no sender for; the
-- old one speaks APNs and only APNs. Applied first, this view would offer
-- Android rows to the old worker and reproduce 0106's defect precisely — a
-- real Android device failing at Apple, hourly, and being retired for it.
--
-- Applied second, the window is harmless: the new worker reads the un-widened
-- view, sees iOS rows only, and behaves exactly as today.
--
-- ---------------------------------------------------------------------------
-- NO BACKFILL, AND NO UN-RETIRING
-- ---------------------------------------------------------------------------
-- 0106 retired the Android tokens it found with the reason
-- `android: no transport in v1`. Those rows are NOT revived here. A retired
-- token is a registration that was once real and is now months stale; FCM
-- would answer UNREGISTERED or SENDER_ID_MISMATCH for most of them, and the
-- project has since moved from `ediagd-8c0a5` to `ediagd-3fcb5`, which makes a
-- mismatch the likely answer for all of them.
--
-- register_push_token already un-retires on conflict, so a phone that opens
-- the app comes back on its own with a token minted by the right project.
-- Un-retiring by hand would manufacture a fleet of addresses that look live
-- and are not — and the first evidence would be a failure rate nobody could
-- explain.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DELIBERATELY DOES NOT DO: RENAME push_delivery.apns_*
-- ---------------------------------------------------------------------------
-- `apns_status`, `apns_reason` and `apns_id` now hold either provider's
-- answer, which is a mislabel. It is not fixed here, and the reason is the
-- deploy order above rather than an oversight.
--
-- A rename and a writer cannot change in one step when the merge IS the
-- deploy. Either the code writes the new column names before this file runs,
-- or it writes the old ones after — and both windows lose delivery records
-- silently, because the insert's error is not checked and a failed record does
-- not stop a send. One release of a wrong column name is visible in a comment;
-- a week of missing push_delivery rows is visible nowhere.
--
-- It is also recoverable without the rename: push_delivery.token_id ->
-- device_push_token.platform says which provider answered, and this project
-- retires tokens rather than deleting them, so that join does not rot. The
-- reason strings carry each provider's own vocabulary too — "Unregistered" is
-- Apple's word, "UNREGISTERED" is Google's.
--
-- The rename is three steps (add, switch the writer, drop) and belongs in its
-- own PR. It also touches push_return (0165) and two scripts. The columns get
-- comments here instead, so the next reader is told rather than left to assume
-- the name is the truth.
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
 /* Both platforms have a transport: iOS to Apple directly (apns.ts), Android
    to Firebase Cloud Messaging (fcm.ts). Still a list and not a wildcard — a
    new enum value must be added here deliberately, with a sender, rather than
    being offered to a worker that has no provider for it. */
 and t.platform in ('ios', 'android')
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

/*
 * REVOKE FIRST, THEN GRANT BACK WHAT IS WANTED.
 *
 * Supabase ships default privileges that grant select on a new object in
 * `public` to anon AND authenticated, so a recreated view is world-readable
 * the moment it exists and nothing in the create statement says so. 0165 found
 * this the hard way. 0106 re-granted to authenticated without revoking anon
 * first, so this view has been anon-readable since — the rows are gated by
 * security_invoker, but an anon caller should not be able to address it at
 * all. Fixed on the way past.
 */
revoke all on push_outbox_due from anon;
grant select on push_outbox_due to authenticated;

comment on view push_outbox_due is
  'Pending push rows joined to every LIVE token for the recipient, one row per '
  '(message, device). Carries platform so the worker can pick a transport: '
  'ios -> APNs direct, android -> FCM HTTP v1. The platform list is explicit '
  'rather than absent, so a new push_platform value is not offered until a '
  'sender exists for it. 0106 narrowed this to ios; 0184 widened it when the '
  'Android shell shipped.';

/* ---- The mislabel, named in the place a reader will meet it -------------- */

comment on column push_delivery.apns_status is
  'HTTP status from whichever provider owns the token: APNs for an ios token, '
  'FCM HTTP v1 for an android one. 0 means the request never reached a '
  'provider. The apns_ prefix predates Android and is WRONG for FCM rows - '
  'join token_id -> device_push_token.platform for the transport. Renaming '
  'these three columns needs its own migration because the writer and the '
  'column cannot change in one deploy. 0184.';

comment on column push_delivery.apns_reason is
  'The provider''s machine-readable reason, in that provider''s own '
  'vocabulary: Apple says Unregistered / BadDeviceToken, Google says '
  'UNREGISTERED / SENDER_ID_MISMATCH / INVALID_ARGUMENT (with the offending '
  'field appended). Misnamed for FCM rows - see apns_status. 0184.';

comment on column push_delivery.apns_id is
  'The provider''s id for the delivery: Apple''s apns-id header, or the '
  'message id from FCM''s projects/*/messages/* response. Misnamed for FCM '
  'rows - see apns_status. 0184.';

-- ---------------------------------------------------------------------------
-- APPLY-TIME CHECKS — BOTH DIRECTIONS, BECAUSE A REFUSAL IS NOT SELF-VERIFYING
-- ---------------------------------------------------------------------------
-- A gate that refuses looks like it is working whether it is right or wrong,
-- so the ACCEPTANCE half is asserted too: the view must actually RETURN an
-- Android row. That half is the whole point of the migration and it is the one
-- that gets skipped.
--
-- THE FIRST VERSION OF THIS CHECK WAS WORTHLESS AND IS WORTH RECORDING.
--
-- It read the view's definition and asked whether the text contained
-- 'android'. Tested against a deliberately broken view — one that excluded
-- Android with `and t.platform <> 'android'` — it PASSED, because the string
-- it was looking for is present in the predicate that does the excluding. A
-- check on the spelling of a rule cannot tell an inclusion from an exclusion,
-- and it would have signed off a migration that delivered nothing to Android
-- while reporting success. Exactly the shape AGENTS.md calls a confident wrong
-- answer.
--
-- So it asks the database instead. Fixtures, the real view, a real count —
-- built and then rolled back by the raise at the end of the inner block, the
-- idiom streak_saver_acceptance() in 0104 uses for the same reason.
do $$
declare
  _uid   uuid := gen_random_uuid();
  _rid   uuid := gen_random_uuid();
  _mid   uuid;
  _token text := 'zz-0184-android-' || gen_random_uuid();
  _ios   int := -1;
  _andr  int := -1;
  _note  text := null;
begin
  /* ---- 1. The refusal half: the old hardcoded predicate is gone --------- */
  if pg_get_viewdef('push_outbox_due'::regclass, true)
       like '%= ''ios''::push_platform%' then
    raise exception
      '0184: push_outbox_due still filters platform = ''ios'' — every Android '
      'reminder would stay pending forever and the cron would report success';
  end if;

  /* ---- 2. Supabase default privileges ---------------------------------- */
  if has_table_privilege('anon', 'push_outbox_due', 'select') then
    raise exception '0184: anon can select push_outbox_due';
  end if;

  if not has_table_privilege('authenticated', 'push_outbox_due', 'select') then
    raise exception
      '0184: authenticated cannot select push_outbox_due — the admin outbox '
      'preview reads it as the signed-in user and would show an empty list';
  end if;

  /* ---- 3. The acceptance half, measured ---------------------------------- */
  begin
    /* Hung off an existing org rather than creating one, as 0104 does: org is
       the billing root and a fixture one would be the row with any chance of
       mattering if the rollback ever failed. */
    insert into rooftop (id, org_id, name, timezone)
    select _rid, o.id, 'ZZ 0184 Rooftop', 'America/Chicago'
      from org o order by o.id limit 1;

    insert into auth.users (id, aud, role, email, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    values (_uid, 'authenticated', 'authenticated',
            'zz-0184-' || _uid || '@example.invalid', now(), now(),
            '{}'::jsonb, '{}'::jsonb);

    insert into app_user (id, full_name) values (_uid, 'ZZ 0184 Advisor');

    insert into membership (user_id, rooftop_id, role, active)
    values (_uid, _rid, 'advisor', true)
    returning id into _mid;

    /* ONE ANDROID TOKEN AND ONE iOS TOKEN FOR THE SAME PERSON.
       Both, because this migration must prove it widened the view without
       breaking the platform that already worked — and because that pair is
       the case the delivery worker's grouping is about: one message, two
       handsets, one reminder. */
    insert into device_push_token (user_id, platform, token)
    values (_uid, 'android', _token),
           (_uid, 'ios', _token || '-ios');

    /* A pending push the view should offer. local_date must be the ROOFTOP's
       today, which is the fixture rooftop's own clock, not UTC. */
    insert into notification_outbox
      (membership_id, recipient_id, rooftop_id, kind, channel, status,
       title, body, deep_link, scheduled_for, local_date, local_time,
       rationale, dedup_key)
    values
      (_mid, _uid, _rid, 'streak_keeper', 'push', 'pending',
       'ZZ 0184', 'ZZ 0184 body', '/today?opened_via=streak_saver',
       now() - interval '1 minute', rooftop_today(_rid), '12:00',
       'ZZ 0184 acceptance fixture', 'zz-0184-' || _uid);

    select count(*) into _andr from push_outbox_due
     where token = _token and platform = 'android';
    select count(*) into _ios from push_outbox_due
     where token = _token || '-ios' and platform = 'ios';

    /* Undoes every insert above. */
    raise exception 'ZZ_0184_ROLLBACK';
  exception when others then
    if sqlerrm <> 'ZZ_0184_ROLLBACK' then
      /* The harness itself broke — a schema change upstream, a trigger, a
         missing org. That is NOT a pass and must not be reported as one. */
      _note := sqlerrm;
    end if;
  end;

  if _note is not null then
    raise exception '0184: the acceptance fixture could not be built: %', _note;
  end if;

  if _andr <> 1 then
    raise exception
      '0184: push_outbox_due returned % rows for a live Android token on a '
      'pending push — the predicate was widened in a way that still cannot '
      'carry one, so every Android reminder would stay pending forever', _andr;
  end if;

  if _ios <> 1 then
    raise exception
      '0184: push_outbox_due returned % rows for the iOS token on the same '
      'message — widening the predicate broke the platform that worked', _ios;
  end if;

  raise notice
    '0184: push_outbox_due returns 1 android and 1 ios row for one pending '
    'push; anon revoked, authenticated granted';
end $$;

notify pgrst, 'reload schema';
