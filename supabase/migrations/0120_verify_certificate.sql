-- ============================================================================
-- EDIAGD — 0120 The public verify endpoint
--
-- app.ediagd.ai/verify/{certificate_id} is the only surface in this product
-- that serves data to a stranger. Everything else has an authenticated user
-- behind it.
--
-- ---------------------------------------------------------------------------
-- THE WHITELIST IS IN THE DATABASE, NOT IN THE PAGE
-- ---------------------------------------------------------------------------
-- The function returns six fields and there is no way to ask it for a seventh.
-- That is deliberate: a page that queried advisor_credential and "just rendered
-- what it needed" is one careless join from putting an employer on a public
-- URL, and the reviewer of that change would be reading a React component, not
-- a privacy boundary. Here, adding a field is a migration — which is the amount
-- of friction this decision deserves.
--
-- WHAT IT WILL NEVER RETURN: email, rooftop, dealer group, employer, user_id,
-- or anything about any other advisor. A hiring manager needs to know the
-- certificate is real and whose it is. Where somebody works is their business,
-- and it is the single field that would turn this into a recruiting list.
--
-- ---------------------------------------------------------------------------
-- WHY IT IS THROTTLED WHEN THE DATA IS PUBLIC BY INTENT
-- ---------------------------------------------------------------------------
-- Not to protect the rows — the holder is handing this id out on paper. The id
-- is five random digits per year per level, a 100,000-space a script can walk
-- in an afternoon, and walking it would reveal roughly how many advisors have
-- certified. That number is exactly what the random id was chosen to hide from
-- a competitor (see mint_certificate_id in 0115). Enumeration is the attack,
-- not disclosure.
--
-- The id format does not change. It has to be typeable off a printed page.
-- ============================================================================

-- ---- 1. The attempt log -----------------------------------------------------

/**
 * One row per lookup. Deliberately NOT a per-id counter: the thing being
 * limited is a client walking many ids, which a per-id counter would never see
 * because each id is only asked for once.
 *
 * No user_id and no certificate_id: the log exists to count, and keeping what
 * was looked up would build exactly the record of interest-in-a-person that the
 * page is designed not to create.
 */
create table if not exists verify_attempt (
  id         bigserial primary key,
  ip         text not null,
  created_at timestamptz not null default now()
);

create index if not exists verify_attempt_ip_time_idx
  on verify_attempt (ip, created_at desc);

alter table verify_attempt enable row level security;
/* No policies at all. Nothing but the service role and the definer function
   below may read or write it; there is no reason for a session to see it. */

-- ---- 2. The endpoint --------------------------------------------------------

/**
 * THE THRESHOLDS, AND WHY THESE NUMBERS.
 *
 *   30 lookups per minute per IP
 *   300 lookups per hour per IP
 *
 * A hiring manager checking a candidate makes one. A dealer group checking a
 * shortlist of twenty makes twenty. Both sit far under the minute limit, and
 * the hour limit is what actually bites an enumerator: at 300/hour the
 * 100,000-space takes a fortnight of uninterrupted requests, by which point it
 * is visible in any traffic graph. The point is not to make it impossible; it
 * is to make it slow, noisy, and not worth doing.
 *
 * THE IP IS PASSED IN, NOT READ FROM THE REQUEST. This function is called by
 * the Next server with the service role, never by a browser — the server reads
 * the forwarded client address and hands it over. A browser cannot call this to
 * forge an IP because anon has no execute grant at all.
 */
create or replace function verify_certificate(_certificate_id text, _ip text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  _per_minute constant int := 30;
  _per_hour   constant int := 300;
  _recent     int;
  _hourly     int;
  _row        record;
begin
  insert into verify_attempt (ip) values (coalesce(_ip, 'unknown'));

  select count(*) into _recent from verify_attempt
   where ip = coalesce(_ip, 'unknown') and created_at > now() - interval '1 minute';
  select count(*) into _hourly from verify_attempt
   where ip = coalesce(_ip, 'unknown') and created_at > now() - interval '1 hour';

  if _recent > _per_minute or _hourly > _per_hour then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  /*
   * A SINGLE ANSWER FOR "NO SUCH CERTIFICATE", whatever the reason.
   *
   * Not found is not found — no hint that the format was right, no "did you
   * mean", no distinction between a well-formed id that does not exist and a
   * malformed one. Any of those turns the endpoint into an oracle that tells a
   * script which half of the space to search next.
   */
  select u.full_name,
         c.level,
         (c.earned_at at time zone 'UTC')::date as earned_on,
         c.current_through,
         c.founding_class
    into _row
    from advisor_credential c
    join app_user u on u.id = c.user_id
   where c.certificate_id = _certificate_id;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'name', _row.full_name,
    'level', _row.level,
    'earned_on', _row.earned_on,
    'current_through', _row.current_through,
    'founding_class', _row.founding_class,
    /* Computed here rather than in the page so "current" cannot be decided by
       two clocks that disagree — the database owns the comparison. */
    'is_current', _row.current_through >= (now() at time zone 'UTC')::date
  );
end $$;

/* anon and authenticated get NOTHING. The only caller is the Next server with
   the service role; a browser that could call this directly could also forge
   the _ip argument and walk straight past the throttle. */
revoke all on function verify_certificate(text, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
