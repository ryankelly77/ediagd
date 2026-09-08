-- ============================================================================
-- EDIAGD — 0103 The open stamp resolves its own date
--
-- 0102 gave mark_push_opened() a date parameter, which made the CLIENT
-- responsible for knowing which store day a send belonged to. That is the one
-- thing a client is worst placed to know: a 7pm send in Honolulu is already
-- tomorrow in UTC, and a browser that answers with its own local date would
-- look for a row that does not exist and silently stamp nothing. The failure
-- mode is invisible — opens simply read as zero — which is the worst shape a
-- measurement bug can have.
--
-- The database already knows. rooftop_today() has been here since 0013.
-- ============================================================================

/**
 * The signed-in user's store date.
 *
 * Their active membership decides which rooftop's clock applies. Somebody with
 * two active memberships gets the first by rooftop id — an arbitrary but stable
 * choice, and the two would have to be in different timezones AND straddling
 * midnight for it to matter.
 *
 * Falls back to UTC rather than null: every caller wants a date, and a null
 * here would turn a timezone edge case into a crash.
 */
create or replace function my_today()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select rooftop_today(m.rooftop_id)
       from membership m
      where m.user_id = auth.uid() and m.active
      order by m.rooftop_id
      limit 1),
    (now() at time zone 'UTC')::date
  );
$$;

grant execute on function my_today() to authenticated;

/**
 * Stamp today's send as opened. No date argument — see the header.
 *
 * The two-argument form is dropped rather than kept as an overload: leaving it
 * in place would leave the wrong way to call this reachable, and something
 * would eventually call it.
 */
drop function if exists mark_push_opened(outbox_kind, date);

create or replace function mark_push_opened(_kind outbox_kind)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare _uid uuid := auth.uid(); _n int;
begin
  if _uid is null then return jsonb_build_object('stamped', false); end if;

  update notification_outbox
     set opened_at = now()
   where recipient_id = _uid
     and kind = _kind
     and local_date = my_today()
     and status = 'sent'
     and opened_at is null;

  get diagnostics _n = row_count;
  return jsonb_build_object('stamped', _n > 0);
end $$;

grant execute on function mark_push_opened(outbox_kind) to authenticated;

notify pgrst, 'reload schema';
